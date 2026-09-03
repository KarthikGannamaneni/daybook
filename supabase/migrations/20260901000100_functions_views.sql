-- ============================================================================
-- Derived data: totals views, category learning, prediction, quick chips.
-- Totals are computed here and never summed on the client from a partial list (§9).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Membership helpers. SECURITY DEFINER so RLS policies can call them without
-- recursing into business_members' own policies.
-- ---------------------------------------------------------------------------
create or replace function public.fn_is_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.fn_role(p_business_id uuid)
returns public.member_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.business_members m
  where m.business_id = p_business_id and m.user_id = auth.uid();
$$;

create or replace function public.fn_is_owner(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.fn_role(p_business_id) = 'owner';
$$;

-- Trivial endpoint for the keepalive workflow (§2): keeps the free project awake.
create or replace function public.fn_ping()
returns text
language sql
stable
as $$ select 'ok'::text $$;

-- ---------------------------------------------------------------------------
-- Note tokenisation. Mirrors normaliseTokens() in packages/shared.
-- ---------------------------------------------------------------------------
create or replace function public.fn_note_tokens(p_note text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct tok), '{}'::text[])
  from unnest(
    string_to_array(
      btrim(regexp_replace(lower(coalesce(p_note, '')), '[^[:alnum:][:space:]]', ' ', 'g')),
      ' '
    )
  ) as tok
  where length(tok) >= 2
    and tok not in (
      'for','of','the','and','to','from','on','at','in','by',
      'paid','pay','got','received','rs','inr','today','yesterday'
    );
$$;

-- ---------------------------------------------------------------------------
-- Learning: every saved entry feeds category_predictions (§4.3).
-- ---------------------------------------------------------------------------
create or replace function public.tg_entries_learn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tok text;
begin
  if new.category_id is null or new.deleted_at is not null then
    return new;
  end if;

  foreach tok in array public.fn_note_tokens(new.note) loop
    insert into public.category_predictions (business_id, note_token, party_id, category_id, hits)
    values (new.business_id, tok, null, new.category_id, 1)
    on conflict (business_id, coalesce(note_token, ''), coalesce(party_id, '00000000-0000-0000-0000-000000000000'::uuid), category_id)
    do update set hits = public.category_predictions.hits + 1, last_seen_at = now();
  end loop;

  if new.party_id is not null then
    insert into public.category_predictions (business_id, note_token, party_id, category_id, hits)
    values (new.business_id, null, new.party_id, new.category_id, 1)
    on conflict (business_id, coalesce(note_token, ''), coalesce(party_id, '00000000-0000-0000-0000-000000000000'::uuid), category_id)
    do update set hits = public.category_predictions.hits + 1, last_seen_at = now();
  end if;

  return new;
end;
$$;

create trigger entries_learn
  after insert on public.entries
  for each row execute function public.tg_entries_learn();

-- ---------------------------------------------------------------------------
-- Audit trail for edits and deletes.
-- ---------------------------------------------------------------------------
create or replace function public.tg_entries_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    insert into public.audit_log (business_id, actor_id, action, entity, entity_id, diff)
    values (
      new.business_id,
      auth.uid(),
      case when old.deleted_at is null and new.deleted_at is not null then 'soft_delete'
           when old.deleted_at is not null and new.deleted_at is null then 'restore'
           else 'update' end,
      'entry',
      new.id,
      jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
    );
    return new;
  end if;

  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, diff)
  values (old.business_id, auth.uid(), 'delete', 'entry', old.id, jsonb_build_object('before', to_jsonb(old)));
  return old;
end;
$$;

create trigger entries_audit
  after update or delete on public.entries
  for each row execute function public.tg_entries_audit();

-- ---------------------------------------------------------------------------
-- Views. security_invoker keeps RLS in force for anyone selecting from them.
-- ---------------------------------------------------------------------------
create view public.v_entries with (security_invoker = true) as
select
  e.*,
  a.name as account_name,
  a.kind as account_kind,
  c.name as category_name,
  p.name as party_name
from public.entries e
join public.accounts a on a.id = e.account_id
left join public.categories c on c.id = e.category_id
left join public.parties p on p.id = e.party_id
where e.deleted_at is null;

create view public.v_daily_totals with (security_invoker = true) as
select
  e.business_id,
  (e.occurred_at at time zone b.timezone)::date as day,
  sum(e.amount_minor) filter (where e.type = 'income')::bigint as income_minor,
  sum(e.amount_minor) filter (where e.type = 'expense')::bigint as expense_minor,
  (coalesce(sum(e.amount_minor) filter (where e.type = 'income'), 0)
   - coalesce(sum(e.amount_minor) filter (where e.type = 'expense'), 0))::bigint as net_minor,
  count(*)::int as entry_count
from public.entries e
join public.businesses b on b.id = e.business_id
where e.deleted_at is null
group by e.business_id, (e.occurred_at at time zone b.timezone)::date;

create view public.v_monthly_category_totals with (security_invoker = true) as
select
  e.business_id,
  date_trunc('month', (e.occurred_at at time zone b.timezone))::date as month,
  e.category_id,
  coalesce(c.name, 'Uncategorised') as category_name,
  e.type,
  sum(e.amount_minor)::bigint as total_minor,
  count(*)::int as entry_count
from public.entries e
join public.businesses b on b.id = e.business_id
left join public.categories c on c.id = e.category_id
where e.deleted_at is null
group by e.business_id, date_trunc('month', (e.occurred_at at time zone b.timezone)), e.category_id, c.name, e.type;

-- ---------------------------------------------------------------------------
-- Prediction. Same scoring as rankCategories() in packages/shared: a party
-- match is worth three note-token matches, over the last 90 days of history.
-- ---------------------------------------------------------------------------
create or replace function public.fn_predict_category(
  p_business_id uuid,
  p_note text,
  p_party_id uuid default null
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with tokens as (select unnest(public.fn_note_tokens(p_note)) as tok)
  select cp.category_id
  from public.category_predictions cp
  where cp.business_id = p_business_id
    and cp.last_seen_at > now() - interval '90 days'
    and (
      (cp.note_token is not null and cp.note_token in (select tok from tokens))
      or (p_party_id is not null and cp.party_id = p_party_id)
    )
  group by cp.category_id
  order by sum(
    cp.hits * (case when p_party_id is not null and cp.party_id = p_party_id then 3 else 1 end)
  ) desc, cp.category_id
  limit 1;
$$;

-- Most-used account over the last 14 days, falling back to the first account (§4.3).
create or replace function public.fn_default_account(p_business_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select e.account_id
      from public.entries e
      where e.business_id = p_business_id
        and e.deleted_at is null
        and e.occurred_at > now() - interval '14 days'
      group by e.account_id
      order by count(*) desc, e.account_id
      limit 1
    ),
    (
      select a.id from public.accounts a
      where a.business_id = p_business_id and not a.is_archived
      order by a.sort_order, a.created_at
      limit 1
    )
  );
$$;

-- Up to six (category, party, amount) combinations for the composer chips (§4.3).
create or replace function public.fn_quick_chips(p_business_id uuid, p_limit int default 6)
returns table (
  category_id uuid,
  category_name text,
  party_id uuid,
  party_name text,
  amount_minor bigint,
  account_id uuid,
  note text,
  uses int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.category_id,
    max(c.name) as category_name,
    e.party_id,
    max(p.name) as party_name,
    e.amount_minor,
    (array_agg(e.account_id order by e.occurred_at desc))[1] as account_id,
    (array_agg(e.note order by e.occurred_at desc))[1] as note,
    count(*)::int as uses
  from public.entries e
  left join public.categories c on c.id = e.category_id
  left join public.parties p on p.id = e.party_id
  where e.business_id = p_business_id
    and e.deleted_at is null
    and e.type = 'expense'
    and e.occurred_at > now() - interval '30 days'
  group by e.category_id, e.party_id, e.amount_minor
  having count(*) >= 2
  order by count(*) desc, max(e.occurred_at) desc
  limit greatest(p_limit, 0);
$$;

-- ---------------------------------------------------------------------------
-- Party upsert used by both the composer and the WhatsApp webhook.
-- ---------------------------------------------------------------------------
create or replace function public.fn_upsert_party(p_business_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_norm text := public.fn_normalise_name(p_name);
begin
  if v_norm is null then
    return null;
  end if;
  if not public.fn_is_member(p_business_id) and auth.uid() is not null then
    raise exception 'not a member of this business' using errcode = '42501';
  end if;

  select id into v_id from public.parties
  where business_id = p_business_id and normalised_name = v_norm;

  if v_id is null then
    insert into public.parties (business_id, name, normalised_name)
    values (p_business_id, btrim(p_name), v_norm)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Default accounts and categories for a new business (§4.2). Extracted so the
-- seed script and fn_create_business stay in step.
-- ---------------------------------------------------------------------------
create or replace function public.fn_seed_business_defaults(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts (business_id, name, kind, sort_order) values
    (p_business_id, 'Cash', 'cash', 0),
    (p_business_id, 'Bank', 'bank', 1),
    (p_business_id, 'UPI', 'upi', 2)
  on conflict (business_id, name) do nothing;

  insert into public.categories (business_id, name, type, keywords, sort_order)
  select p_business_id, t.name, t.type::public.entry_type, t.keywords, t.sort_order
  from (values
    ('Rent', 'expense', array['rent','lease'], 0),
    ('Salaries', 'expense', array['salary','salaries','wages','wage','staff'], 1),
    ('Utilities', 'expense', array['electricity','water','internet','wifi','recharge','gas','bill'], 2),
    ('Raw Material', 'expense', array['material','stock','goods','paper','ink','cement'], 3),
    ('Transport', 'expense', array['petrol','diesel','fuel','auto','cab','taxi','bus','train','courier','delivery'], 4),
    ('Food & Tea', 'expense', array['tea','chai','coffee','snacks','tiffin','lunch','breakfast','dinner','food','canteen'], 5),
    ('Marketing', 'expense', array['ads','advertisement','marketing','pamphlet','banner','hoarding'], 6),
    ('Maintenance', 'expense', array['repair','maintenance','servicing','cleaning'], 7),
    ('Bank Charges', 'expense', array['bank charge','bank charges','bank fee','charges'], 8),
    ('Taxes', 'expense', array['gst','tds','tax'], 9),
    ('Other', 'expense', array[]::text[], 10),
    ('Sales', 'income', array['sale','sales','sold','order'], 0),
    ('Services', 'income', array['service','job work','consulting','consultation'], 1),
    ('Other', 'income', array[]::text[], 2)
  ) as t(name, type, keywords, sort_order)
  on conflict (business_id, name, type) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Onboarding: one call creates the business, the owner membership and the
-- defaults (§4.2). SECURITY DEFINER because the membership row has to exist
-- before RLS would allow any of the child inserts.
-- ---------------------------------------------------------------------------
create or replace function public.fn_create_business(
  p_name text,
  p_currency text default 'INR',
  p_locale text default 'en-IN',
  p_timezone text default 'Asia/Kolkata',
  p_starting_balance_minor bigint default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into public.businesses (name, currency, locale, timezone, starting_balance_minor, owner_id)
  values (btrim(p_name), upper(p_currency), p_locale, p_timezone, coalesce(p_starting_balance_minor, 0), v_user)
  returning id into v_id;

  insert into public.business_members (business_id, user_id, role) values (v_id, v_user, 'owner');
  perform public.fn_seed_business_defaults(v_id);

  insert into public.user_settings (user_id, default_business_id)
  values (v_user, v_id)
  on conflict (user_id) do update
    set default_business_id = coalesce(public.user_settings.default_business_id, excluded.default_business_id);

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Search across note, party and amount (§4.4).
-- ---------------------------------------------------------------------------
create or replace function public.fn_search_entries(p_business_id uuid, p_query text, p_limit int default 100)
returns setof public.v_entries
language sql
stable
as $$
  select v.* from public.v_entries v
  where v.business_id = p_business_id
    and (
      v.note ilike '%' || btrim(p_query) || '%'
      or v.party_name ilike '%' || btrim(p_query) || '%'
      or v.category_name ilike '%' || btrim(p_query) || '%'
      or (btrim(p_query) ~ '^[0-9.,]+$'
          and v.amount_minor = (round(replace(btrim(p_query), ',', '')::numeric * 100))::bigint)
    )
  order by v.occurred_at desc
  limit least(coalesce(p_limit, 100), 500);
$$;

-- ---------------------------------------------------------------------------
-- Month summary used by the month view header and the insight card.
-- ---------------------------------------------------------------------------
create or replace function public.fn_month_summary(p_business_id uuid, p_month date)
returns table (income_minor bigint, expense_minor bigint, net_minor bigint, entry_count int)
language sql
stable
as $$
  select
    coalesce(sum(t.total_minor) filter (where t.type = 'income'), 0)::bigint,
    coalesce(sum(t.total_minor) filter (where t.type = 'expense'), 0)::bigint,
    (coalesce(sum(t.total_minor) filter (where t.type = 'income'), 0)
     - coalesce(sum(t.total_minor) filter (where t.type = 'expense'), 0))::bigint,
    coalesce(sum(t.entry_count), 0)::int
  from public.v_monthly_category_totals t
  where t.business_id = p_business_id
    and t.month = date_trunc('month', p_month)::date;
$$;
