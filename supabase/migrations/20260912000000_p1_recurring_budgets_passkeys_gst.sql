-- ============================================================================
-- P1: recurring entries, per-category budgets, passkeys, GST fields.
--
-- Each is independently shippable and none of them changes the P0 money path:
-- recurring entries *propose*, they never post; budgets only read; passkeys sit
-- beside the PIN rather than replacing the session; GST adds an optional split
-- that defaults to zero.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Recurring entries (P1 #2)
--
-- Rent, salaries, subscriptions. The app proposes them on the due date as a
-- one-tap card. It never auto-posts: a ledger that writes entries nobody
-- confirmed stops being a record of what happened.
-- ---------------------------------------------------------------------------
create type public.recurrence_cadence as enum ('weekly', 'monthly');

create table public.recurring_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  type public.entry_type not null default 'expense',
  amount_minor bigint not null check (amount_minor > 0),
  account_id uuid not null references public.accounts (id) on delete restrict,
  category_id uuid references public.categories (id) on delete set null,
  party_id uuid references public.parties (id) on delete set null,
  note text check (note is null or length(note) <= 280),
  cadence public.recurrence_cadence not null default 'monthly',
  -- Monthly uses day_of_month, weekly uses day_of_week (0 = Sunday).
  day_of_month int check (day_of_month between 1 and 31),
  day_of_week int check (day_of_week between 0 and 6),
  next_due_on date not null,
  last_posted_on date,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint recurring_cadence_field check (
    (cadence = 'monthly' and day_of_month is not null)
    or (cadence = 'weekly' and day_of_week is not null)
  )
);
create index recurring_entries_due_idx
  on public.recurring_entries (business_id, next_due_on)
  where is_active;

-- ---------------------------------------------------------------------------
-- Budgets (P1 #8)
--
-- One monthly ceiling per category. In-app soft alerts at 80% and 100% only —
-- deliberately no WhatsApp, because a nagging bot is how people mute the bot.
-- ---------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (business_id, category_id)
);

-- ---------------------------------------------------------------------------
-- Business invites (needed by P1 #6: you cannot have an accountant without a
-- way to add one).
--
-- Same shape as the WhatsApp link codes: a short code, single use, short life.
-- Deliberately not email invites — the owner reads the code out or sends it in
-- the chat they are already in.
-- ---------------------------------------------------------------------------
create table public.business_invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  role public.member_role not null default 'staff',
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Redeeming an invite has to add a membership row for a user who is not yet a
-- member, which no member-scoped policy can allow. Hence SECURITY DEFINER, with
-- the checks written out explicitly.
create or replace function public.fn_accept_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.business_invites;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_invite from public.business_invites
  where code = upper(btrim(p_code)) and consumed_at is null and expires_at > now();

  if v_invite.id is null then
    raise exception 'that invite code is not valid or has expired' using errcode = '22023';
  end if;

  insert into public.business_members (business_id, user_id, role)
  values (v_invite.business_id, v_user, v_invite.role)
  on conflict (business_id, user_id) do update set role = excluded.role;

  update public.business_invites
  set consumed_at = now(), consumed_by = v_user
  where id = v_invite.id;

  insert into public.user_settings (user_id, default_business_id)
  values (v_user, v_invite.business_id)
  on conflict (user_id) do nothing;

  return v_invite.business_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Passkeys (P1 #1)
--
-- Credential metadata only: the private key never leaves the authenticator, and
-- the public key here is useless without it.
-- ---------------------------------------------------------------------------
create table public.user_passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  sign_count bigint not null default 0,
  device_label text,
  transports text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  updated_at timestamptz
);
create index user_passkeys_user_idx on public.user_passkeys (user_id);

-- ---------------------------------------------------------------------------
-- GST (P1 #9)
--
-- India only, and optional there. The tax split is part of amount_minor, not on
-- top of it: the ledger total must never change because someone filled in a tax
-- field. parties.gstin already exists from the P0 schema.
-- ---------------------------------------------------------------------------
alter table public.entries
  add column tax_amount_minor bigint not null default 0 check (tax_amount_minor >= 0);

alter table public.entries
  add constraint entries_tax_within_amount check (tax_amount_minor <= amount_minor);

alter table public.businesses
  add column gst_enabled boolean not null default false;

comment on column public.entries.tax_amount_minor is
  'Tax portion *included in* amount_minor, not additional to it.';

-- ---------------------------------------------------------------------------
-- updated_at triggers for the new tables
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['recurring_entries', 'budgets', 'user_passkeys', 'business_invites'] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.tg_set_updated_at()',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Advancing a recurrence.
--
-- Monthly clamps to the end of short months: a rent set for the 31st is due on
-- the 30th in April and the 28th in February, rather than silently skipping.
-- ---------------------------------------------------------------------------
create or replace function public.fn_next_due(
  p_cadence public.recurrence_cadence,
  p_day_of_month int,
  p_day_of_week int,
  p_after date
)
returns date
language plpgsql
immutable
as $$
declare
  v_month_start date;
  v_days int;
  v_candidate date;
begin
  if p_cadence = 'weekly' then
    -- Next occurrence of that weekday strictly after p_after.
    return p_after + (((p_day_of_week - extract(dow from p_after)::int) + 7 - 1) % 7 + 1);
  end if;

  -- Start with the month p_after falls in: a rent for the 31st created on the
  -- 15th is due this month, not next. Only then roll forward.
  v_month_start := date_trunc('month', p_after)::date;
  loop
    v_days := extract(day from (v_month_start + interval '1 month - 1 day'))::int;
    v_candidate := v_month_start + least(p_day_of_month, v_days) - 1;
    exit when v_candidate > p_after;
    v_month_start := (v_month_start + interval '1 month')::date;
  end loop;
  return v_candidate;
end;
$$;

-- Everything due on or before today that has not been posted yet.
create or replace function public.fn_due_recurring(p_business_id uuid)
returns setof public.recurring_entries
language sql
stable
as $$
  select r.*
  from public.recurring_entries r
  join public.businesses b on b.id = r.business_id
  where r.business_id = p_business_id
    and r.is_active
    and r.next_due_on <= (now() at time zone b.timezone)::date
  order by r.next_due_on, r.created_at;
$$;

-- ---------------------------------------------------------------------------
-- Budget status for the current month, in the business timezone.
-- ---------------------------------------------------------------------------
create view public.v_budget_status with (security_invoker = true) as
select
  b.id as budget_id,
  b.business_id,
  b.category_id,
  c.name as category_name,
  b.amount_minor as budget_minor,
  coalesce(t.total_minor, 0)::bigint as spent_minor,
  greatest(b.amount_minor - coalesce(t.total_minor, 0), 0)::bigint as remaining_minor,
  case
    when b.amount_minor = 0 then 0
    else round((coalesce(t.total_minor, 0)::numeric / b.amount_minor) * 100)::int
  end as percent_used
from public.budgets b
join public.categories c on c.id = b.category_id
left join public.v_monthly_category_totals t
  on t.business_id = b.business_id
 and t.category_id = b.category_id
 and t.type = 'expense'
 and t.month = date_trunc('month', (now() at time zone (select timezone from public.businesses where id = b.business_id)))::date
where b.is_active;

-- ---------------------------------------------------------------------------
-- GST summary: tax collected on income vs tax paid on expenses, by month.
-- ---------------------------------------------------------------------------
create view public.v_gst_summary with (security_invoker = true) as
select
  e.business_id,
  date_trunc('month', (e.occurred_at at time zone b.timezone))::date as month,
  e.type,
  sum(e.amount_minor)::bigint as gross_minor,
  sum(e.tax_amount_minor)::bigint as tax_minor,
  sum(e.amount_minor - e.tax_amount_minor)::bigint as net_minor,
  count(*)::int as entry_count
from public.entries e
join public.businesses b on b.id = e.business_id
where e.deleted_at is null and e.tax_amount_minor > 0
group by e.business_id, date_trunc('month', (e.occurred_at at time zone b.timezone)), e.type;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.recurring_entries enable row level security;
alter table public.budgets           enable row level security;
alter table public.user_passkeys     enable row level security;
alter table public.business_invites  enable row level security;

create policy recurring_select on public.recurring_entries
  for select using (public.fn_is_member(business_id));
create policy recurring_insert on public.recurring_entries
  for insert with check (public.fn_role(business_id) in ('owner', 'staff'));
create policy recurring_update on public.recurring_entries
  for update using (public.fn_role(business_id) in ('owner', 'staff'))
  with check (public.fn_role(business_id) in ('owner', 'staff'));
create policy recurring_delete on public.recurring_entries
  for delete using (public.fn_is_owner(business_id));

-- Budgets are a management decision, so staff read them but do not set them.
create policy budgets_select on public.budgets
  for select using (public.fn_is_member(business_id));
create policy budgets_insert on public.budgets
  for insert with check (public.fn_is_owner(business_id));
create policy budgets_update on public.budgets
  for update using (public.fn_is_owner(business_id)) with check (public.fn_is_owner(business_id));
create policy budgets_delete on public.budgets
  for delete using (public.fn_is_owner(business_id));

-- Only an owner issues or revokes an invite. Redeeming goes through
-- fn_accept_invite, which is why there is no select policy for the invitee.
create policy invites_select on public.business_invites
  for select using (public.fn_is_owner(business_id));
create policy invites_insert on public.business_invites
  for insert with check (public.fn_is_owner(business_id) and created_by = auth.uid());
create policy invites_delete on public.business_invites
  for delete using (public.fn_is_owner(business_id));

-- A passkey is strictly the owning user's business.
create policy passkeys_select on public.user_passkeys
  for select using (user_id = auth.uid());
create policy passkeys_insert on public.user_passkeys
  for insert with check (user_id = auth.uid());
create policy passkeys_update on public.user_passkeys
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy passkeys_delete on public.user_passkeys
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on
  public.recurring_entries, public.budgets, public.user_passkeys, public.business_invites
  to authenticated;
grant select on public.v_budget_status, public.v_gst_summary to authenticated;
grant execute on function public.fn_due_recurring(uuid) to authenticated;
grant execute on function public.fn_next_due(public.recurrence_cadence, int, int, date) to authenticated;
revoke all on function public.fn_accept_invite(text) from public;
grant execute on function public.fn_accept_invite(text) to authenticated;
