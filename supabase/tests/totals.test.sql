-- ============================================================================
-- §10.2 — totals views and the derived-data functions.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/fixtures.sql.inc

select plan(11);

set session_replication_role = replica;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'totals@test.local', '', now(), now(), now(), '', '', '', '', '', '', '', '');
set session_replication_role = origin;

insert into public.businesses (id, name, owner_id, timezone)
values ('f1000000-0000-4000-8000-000000000001', 'Totals Co', 'e1000000-0000-4000-8000-000000000001', 'Asia/Kolkata');
insert into public.business_members (business_id, user_id, role)
values ('f1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'owner');
select public.fn_seed_business_defaults('f1000000-0000-4000-8000-000000000001');

insert into public.parties (id, business_id, name, normalised_name)
values ('a1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Ramesh Traders', 'ramesh traders');

-- Three expenses and one income today, plus one soft-deleted expense.
insert into public.entries (business_id, type, amount_minor, account_id, category_id, party_id, note, occurred_at, created_by, deleted_at)
select
  'f1000000-0000-4000-8000-000000000001', v.type::public.entry_type, v.amount,
  (select id from public.accounts where business_id = 'f1000000-0000-4000-8000-000000000001' and kind = v.kind::public.account_kind),
  (select id from public.categories where business_id = 'f1000000-0000-4000-8000-000000000001' and name = v.cat and type = v.type::public.entry_type),
  case when v.party then 'a1000000-0000-4000-8000-000000000001'::uuid else null end,
  v.note,
  date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' + interval '10 hours',
  'e1000000-0000-4000-8000-000000000001',
  case when v.deleted then now() else null end
from (values
  ('expense', 45000::bigint, 'cash', 'Food & Tea',   'tea shop',      false, false),
  ('expense', 45000::bigint, 'cash', 'Food & Tea',   'tea shop',      false, false),
  ('expense', 120000::bigint,'bank', 'Raw Material', 'raw material',  true,  false),
  ('income',  500000::bigint,'cash', 'Sales',        'counter sale',  true,  false),
  ('expense', 999999::bigint,'cash', 'Transport',    'cancelled auto',false, true)
) as v(type, amount, kind, cat, note, party, deleted);

select tests.authenticate_as('e1000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- Soft deletes never reach a total.
-- ---------------------------------------------------------------------------
select is(
  (select expense_minor from public.v_daily_totals
   where business_id = 'f1000000-0000-4000-8000-000000000001'
     and day = (now() at time zone 'Asia/Kolkata')::date),
  210000::bigint,
  'daily expense total excludes the soft-deleted entry'
);

select is(
  (select income_minor from public.v_daily_totals
   where business_id = 'f1000000-0000-4000-8000-000000000001'
     and day = (now() at time zone 'Asia/Kolkata')::date),
  500000::bigint,
  'daily income total'
);

select is(
  (select net_minor from public.v_daily_totals
   where business_id = 'f1000000-0000-4000-8000-000000000001'
     and day = (now() at time zone 'Asia/Kolkata')::date),
  290000::bigint,
  'net is income minus expense'
);

select is(
  (select entry_count from public.v_daily_totals
   where business_id = 'f1000000-0000-4000-8000-000000000001'
     and day = (now() at time zone 'Asia/Kolkata')::date),
  4,
  'entry count excludes the soft-deleted entry'
);

select is(
  (select total_minor from public.v_monthly_category_totals
   where business_id = 'f1000000-0000-4000-8000-000000000001' and category_name = 'Food & Tea'),
  90000::bigint,
  'monthly category totals group by category'
);

select is(
  (select count(*)::int from public.v_monthly_category_totals
   where business_id = 'f1000000-0000-4000-8000-000000000001' and category_name = 'Transport'),
  0,
  'a soft-deleted entry leaves no category row behind'
);

select is(
  (select expense_minor from public.fn_month_summary('f1000000-0000-4000-8000-000000000001', current_date)),
  210000::bigint,
  'month summary agrees with the category view'
);

select is(
  (select count(*)::int from public.v_entries where business_id = 'f1000000-0000-4000-8000-000000000001'),
  4,
  'the entries view hides soft-deleted rows'
);

-- ---------------------------------------------------------------------------
-- Derived data used by the composer.
-- ---------------------------------------------------------------------------
select is(
  public.fn_predict_category('f1000000-0000-4000-8000-000000000001', 'tea shop', null),
  (select id from public.categories where business_id = 'f1000000-0000-4000-8000-000000000001' and name = 'Food & Tea' and type = 'expense'),
  'prediction learns "tea shop" -> Food & Tea from this business own history'
);

select is(
  public.fn_default_account('f1000000-0000-4000-8000-000000000001'),
  (select id from public.accounts where business_id = 'f1000000-0000-4000-8000-000000000001' and kind = 'cash'),
  'default account is the one used most in the last 14 days'
);

select is(
  (select amount_minor from public.fn_quick_chips('f1000000-0000-4000-8000-000000000001', 6) limit 1),
  45000::bigint,
  'quick chips surface the repeated tea-shop amount'
);

select * from finish();
rollback;
