-- ============================================================================
-- Khata: core schema.
--
-- Money is bigint minor units everywhere (§9). Deletes are soft (deleted_at)
-- so the 8-second undo and the WhatsApp 10-minute undo are both cheap.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'staff', 'accountant');
create type public.account_kind as enum ('cash', 'bank', 'upi', 'other');
create type public.entry_type as enum ('expense', 'income');
create type public.entry_source as enum ('app', 'whatsapp');
create type public.message_direction as enum ('in', 'out');

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  currency char(3) not null default 'INR',
  locale text not null default 'en-IN',
  timezone text not null default 'Asia/Kolkata',
  starting_balance_minor bigint not null default 0,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (business_id, user_id)
);
create index business_members_user_idx on public.business_members (user_id);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  kind public.account_kind not null default 'cash',
  is_archived boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (business_id, name)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  type public.entry_type not null default 'expense',
  keywords text[] not null default '{}',
  is_archived boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (business_id, name, type)
);

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  normalised_name text not null,
  gstin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (business_id, normalised_name)
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  type public.entry_type not null,
  amount_minor bigint not null check (amount_minor > 0),
  account_id uuid not null references public.accounts (id) on delete restrict,
  category_id uuid references public.categories (id) on delete set null,
  party_id uuid references public.parties (id) on delete set null,
  note text check (note is null or length(note) <= 280),
  occurred_at timestamptz not null default now(),
  attachment_path text,
  source public.entry_source not null default 'app',
  created_by uuid references auth.users (id) on delete set null,
  -- Idempotency key for offline sync: the client mints it before the request,
  -- so a retry after a dropped response cannot create a second entry (§4.7).
  client_id uuid not null unique default gen_random_uuid(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index entries_business_occurred_idx on public.entries (business_id, occurred_at desc) where deleted_at is null;
create index entries_business_category_idx on public.entries (business_id, category_id) where deleted_at is null;
create index entries_business_party_idx on public.entries (business_id, party_id) where deleted_at is null;
create index entries_created_by_idx on public.entries (created_by);
create index entries_note_trgm_idx on public.entries using gin (to_tsvector('simple', coalesce(note, '')));

create table public.whatsapp_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  phone_e164 text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  linked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table public.whatsapp_link_codes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  -- Meta retries webhooks; this unique key is what makes the handler idempotent.
  wa_message_id text unique,
  business_id uuid references public.businesses (id) on delete set null,
  phone_e164 text not null,
  direction public.message_direction not null,
  body text,
  media_id text,
  parse_result jsonb,
  entry_id uuid references public.entries (id) on delete set null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index whatsapp_messages_phone_idx on public.whatsapp_messages (phone_e164, received_at desc);

create table public.category_predictions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  note_token text,
  party_id uuid references public.parties (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  hits int not null default 1,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  check (note_token is not null or party_id is not null)
);
create unique index category_predictions_token_uidx
  on public.category_predictions (business_id, coalesce(note_token, ''), coalesce(party_id, '00000000-0000-0000-0000-000000000000'::uuid), category_id);

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Salted hash only; the PIN itself never leaves the device in plaintext (§4.1).
  pin_hash text,
  app_lock_enabled boolean not null default false,
  default_business_id uuid references public.businesses (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  diff jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_business_idx on public.audit_log (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'businesses','business_members','accounts','categories','parties','entries',
    'whatsapp_links','whatsapp_link_codes','whatsapp_messages','category_predictions','user_settings'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.tg_set_updated_at()',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Party name normalisation
-- ---------------------------------------------------------------------------
create or replace function public.fn_normalise_name(p_name text)
returns text
language sql
immutable
as $$
  select nullif(btrim(regexp_replace(lower(coalesce(p_name, '')), '[^[:alnum:][:space:]]', ' ', 'g')), '')
$$;

create or replace function public.tg_parties_normalise()
returns trigger
language plpgsql
as $$
begin
  new.normalised_name := coalesce(public.fn_normalise_name(new.name), lower(new.name));
  return new;
end;
$$;

create trigger parties_normalise
  before insert or update of name on public.parties
  for each row execute function public.tg_parties_normalise();
