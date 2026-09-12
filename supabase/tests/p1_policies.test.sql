-- ============================================================================
-- P1 policies: recurring entries, budgets, passkeys, invites.
--
-- Same rule as P0: the UI hides what a role cannot do, the database refuses it.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/fixtures.sql.inc

select plan(22);

set session_replication_role = replica;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token)
values
  ('00000000-0000-0000-0000-000000000000', 'e2000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'p1-owner@test.local', '', now(), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'p1-staff@test.local', '', now(), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e2000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'p1-acct@test.local',  '', now(), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e2000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'p1-outsider@test.local', '', now(), now(), now(), '', '', '', '', '', '', '', '');
set session_replication_role = origin;

insert into public.businesses (id, name, owner_id)
values ('f2000000-0000-4000-8000-000000000001', 'P1 Co', 'e2000000-0000-4000-8000-000000000001');
insert into public.business_members (business_id, user_id, role) values
  ('f2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'owner'),
  ('f2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', 'staff'),
  ('f2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000003', 'accountant');
select public.fn_seed_business_defaults('f2000000-0000-4000-8000-000000000001');

insert into public.budgets (id, business_id, category_id, amount_minor)
select 'b2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
       id, 500000
from public.categories
where business_id = 'f2000000-0000-4000-8000-000000000001' and name = 'Food & Tea' and type = 'expense';

insert into public.recurring_entries (id, business_id, type, amount_minor, account_id, cadence, day_of_month, next_due_on, created_by)
select 'a2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'expense', 1200000,
       (select id from public.accounts where business_id = 'f2000000-0000-4000-8000-000000000001' and kind = 'bank'),
       'monthly', 1, current_date, 'e2000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Budgets: everyone reads, only the owner writes.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('e2000000-0000-4000-8000-000000000002');

select is((select count(*)::int from public.budgets), 1, 'staff can read budgets');
select throws_ok(
  $$insert into public.budgets (business_id, category_id, amount_minor)
    values ('f2000000-0000-4000-8000-000000000001',
            (select id from public.categories where business_id = 'f2000000-0000-4000-8000-000000000001' and name = 'Rent' limit 1),
            100000)$$,
  '42501', 'new row violates row-level security policy for table "budgets"',
  'staff cannot create a budget'
);
select is(tests.rows_affected(
  $$update public.budgets set amount_minor = 1 where id = 'b2000000-0000-4000-8000-000000000001'$$), 0,
  'staff cannot change a budget');
select is(tests.rows_affected(
  $$delete from public.budgets where id = 'b2000000-0000-4000-8000-000000000001'$$), 0,
  'staff cannot delete a budget');

-- ---------------------------------------------------------------------------
-- Recurring entries: staff may define them, only the owner deletes.
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.recurring_entries), 1, 'staff can read schedules');
select lives_ok(
  $$insert into public.recurring_entries (business_id, type, amount_minor, account_id, cadence, day_of_week, next_due_on, created_by)
    values ('f2000000-0000-4000-8000-000000000001', 'expense', 50000,
            (select id from public.accounts where business_id = 'f2000000-0000-4000-8000-000000000001' and kind = 'cash'),
            'weekly', 1, current_date, 'e2000000-0000-4000-8000-000000000002')$$,
  'staff can create a schedule'
);
select is(tests.rows_affected(
  $$delete from public.recurring_entries where id = 'a2000000-0000-4000-8000-000000000001'$$), 0,
  'staff cannot delete a schedule');

-- A schedule still cannot smuggle in a bad amount.
select throws_ok(
  $$insert into public.recurring_entries (business_id, type, amount_minor, account_id, cadence, day_of_month, next_due_on)
    values ('f2000000-0000-4000-8000-000000000001', 'expense', 0,
            (select id from public.accounts where business_id = 'f2000000-0000-4000-8000-000000000001' and kind = 'cash'),
            'monthly', 1, current_date)$$,
  '23514', null, 'a schedule cannot have a zero amount'
);

-- ---------------------------------------------------------------------------
-- Accountant is read-only here too.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('e2000000-0000-4000-8000-000000000003');

select is((select count(*)::int from public.budgets), 1, 'accountant can read budgets');
select is((select count(*)::int from public.recurring_entries), 2, 'accountant can read schedules');
select throws_ok(
  $$insert into public.recurring_entries (business_id, type, amount_minor, account_id, cadence, day_of_month, next_due_on)
    values ('f2000000-0000-4000-8000-000000000001', 'expense', 1000,
            (select id from public.accounts where business_id = 'f2000000-0000-4000-8000-000000000001' and kind = 'cash'),
            'monthly', 1, current_date)$$,
  '42501', 'new row violates row-level security policy for table "recurring_entries"',
  'accountant cannot create a schedule'
);

-- ---------------------------------------------------------------------------
-- An outsider sees none of it.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('e2000000-0000-4000-8000-000000000004');

select is((select count(*)::int from public.budgets), 0, 'an outsider reads no budgets');
select is((select count(*)::int from public.recurring_entries), 0, 'an outsider reads no schedules');
select is((select count(*)::int from public.v_budget_status), 0, 'the budget view is filtered too');

-- ---------------------------------------------------------------------------
-- Passkeys belong to one user and no other.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('e2000000-0000-4000-8000-000000000001');
insert into public.user_passkeys (user_id, credential_id, public_key, device_label)
values ('e2000000-0000-4000-8000-000000000001', 'cred-owner-1', 'pk', 'Owner phone');

select is((select count(*)::int from public.user_passkeys), 1, 'a user sees their own passkey');

select tests.authenticate_as('e2000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.user_passkeys), 0, 'nobody else sees it');
select is(tests.rows_affected(
  $$delete from public.user_passkeys where credential_id = 'cred-owner-1'$$), 0,
  'nobody else can delete it');
select throws_ok(
  $$insert into public.user_passkeys (user_id, credential_id, public_key)
    values ('e2000000-0000-4000-8000-000000000001', 'cred-forged', 'pk')$$,
  '42501', 'new row violates row-level security policy for table "user_passkeys"',
  'a passkey cannot be registered against another user'
);

-- ---------------------------------------------------------------------------
-- Invites: owner-only to issue, and redeeming is what grants membership.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.business_invites (business_id, role, code, expires_at, created_by)
    values ('f2000000-0000-4000-8000-000000000001', 'accountant', 'STAFF1', now() + interval '1 day',
            'e2000000-0000-4000-8000-000000000002')$$,
  '42501', 'new row violates row-level security policy for table "business_invites"',
  'staff cannot issue an invite'
);

select tests.as_service();
insert into public.business_invites (business_id, role, code, expires_at, created_by)
values
  ('f2000000-0000-4000-8000-000000000001', 'accountant', 'GOOD01', now() + interval '1 day', 'e2000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000001', 'accountant', 'OLD001', now() - interval '1 minute', 'e2000000-0000-4000-8000-000000000001');

select tests.authenticate_as('e2000000-0000-4000-8000-000000000004');
select throws_ok(
  $$select public.fn_accept_invite('OLD001')$$,
  '22023', 'that invite code is not valid or has expired',
  'an expired invite is refused'
);
select is(
  public.fn_accept_invite('GOOD01'),
  'f2000000-0000-4000-8000-000000000001'::uuid,
  'a valid invite grants membership'
);
select is((select count(*)::int from public.recurring_entries), 2,
  'and the new member can now read the business');

select * from finish();
rollback;
