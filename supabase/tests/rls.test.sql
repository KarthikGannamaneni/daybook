-- ============================================================================
-- §10.2 — every RLS policy that the product depends on, proved.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/fixtures.sql.inc

select plan(24);

-- ---------------------------------------------------------------------------
-- Fixtures: two unrelated businesses.
-- ---------------------------------------------------------------------------
set session_replication_role = replica;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token)
values
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a@test.local', '', now(), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'staff-a@test.local', '', now(), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'acct-a@test.local',  '', now(), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'owner-b@test.local', '', now(), now(), now(), '', '', '', '', '', '', '', '');
set session_replication_role = origin;

insert into public.businesses (id, name, owner_id) values
  ('f0000000-0000-4000-8000-000000000001', 'Business A', 'e0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000002', 'Business B', 'e0000000-0000-4000-8000-000000000004');

insert into public.business_members (business_id, user_id, role) values
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'owner'),
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'staff'),
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', 'accountant'),
  ('f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000004', 'owner');

select public.fn_seed_business_defaults('f0000000-0000-4000-8000-000000000001');
select public.fn_seed_business_defaults('f0000000-0000-4000-8000-000000000002');

insert into public.parties (business_id, name, normalised_name) values
  ('f0000000-0000-4000-8000-000000000001', 'Ramesh', 'ramesh'),
  ('f0000000-0000-4000-8000-000000000002', 'Suresh', 'suresh');

insert into public.entries (id, business_id, type, amount_minor, account_id, category_id, note, occurred_at, created_by, client_id)
select
  'd0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'expense', 45000,
  (select id from public.accounts where business_id = 'f0000000-0000-4000-8000-000000000001' and kind = 'cash'),
  (select id from public.categories where business_id = 'f0000000-0000-4000-8000-000000000001' and name = 'Food & Tea'),
  'owner entry', now(), 'e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001';

insert into public.entries (id, business_id, type, amount_minor, account_id, note, occurred_at, created_by, client_id)
select
  'd0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'expense', 12000,
  (select id from public.accounts where business_id = 'f0000000-0000-4000-8000-000000000001' and kind = 'cash'),
  'staff recent', now() - interval '1 day', 'e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002';

insert into public.entries (id, business_id, type, amount_minor, account_id, note, occurred_at, created_by, client_id)
select
  'd0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001', 'expense', 33000,
  (select id from public.accounts where business_id = 'f0000000-0000-4000-8000-000000000001' and kind = 'cash'),
  'staff old', now() - interval '30 days', 'e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000003';

insert into public.entries (id, business_id, type, amount_minor, account_id, note, occurred_at, created_by, client_id)
select
  'd0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000002', 'expense', 99000,
  (select id from public.accounts where business_id = 'f0000000-0000-4000-8000-000000000002' and kind = 'cash'),
  'other business', now(), 'e0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000004';

insert into public.whatsapp_links (business_id, user_id, phone_e164)
values ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', '+919000000001');

insert into public.user_settings (user_id, default_business_id)
values ('e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- Tenant isolation: A must not see any of B.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('e0000000-0000-4000-8000-000000000001');

select is((select count(*)::int from public.businesses), 1, 'owner A sees only their own business');
select is((select count(*)::int from public.entries where business_id = 'f0000000-0000-4000-8000-000000000002'), 0,
  'owner A cannot read business B entries');
select is((select count(*)::int from public.accounts where business_id = 'f0000000-0000-4000-8000-000000000002'), 0,
  'owner A cannot read business B accounts');
select is((select count(*)::int from public.categories where business_id = 'f0000000-0000-4000-8000-000000000002'), 0,
  'owner A cannot read business B categories');
select is((select count(*)::int from public.parties where business_id = 'f0000000-0000-4000-8000-000000000002'), 0,
  'owner A cannot read business B parties');
select is((select count(*)::int from public.business_members where business_id = 'f0000000-0000-4000-8000-000000000002'), 0,
  'owner A cannot read business B members');
select is((select count(*)::int from public.user_settings), 0,
  'owner A cannot read another user settings row');
select is((select count(*)::int from public.v_entries where business_id = 'f0000000-0000-4000-8000-000000000002'), 0,
  'the entries view is filtered too');

select throws_ok(
  $$insert into public.entries (business_id, type, amount_minor, account_id, occurred_at, created_by, client_id)
    values ('f0000000-0000-4000-8000-000000000002', 'expense', 100,
            (select id from public.accounts where business_id = 'f0000000-0000-4000-8000-000000000002' limit 1),
            now(), 'e0000000-0000-4000-8000-000000000001', gen_random_uuid())$$,
  '42501',
  'new row violates row-level security policy for table "entries"',
  'owner A cannot write into business B'
);

select is(tests.rows_affected(
  $$update public.entries set note = 'hacked' where id = 'd0000000-0000-4000-8000-000000000004'$$), 0,
  'owner A cannot update a business B entry');

-- ---------------------------------------------------------------------------
-- Staff limits (§3).
-- ---------------------------------------------------------------------------
select tests.authenticate_as('e0000000-0000-4000-8000-000000000002');

select is((select count(*)::int from public.entries where business_id = 'f0000000-0000-4000-8000-000000000001'), 3,
  'staff reads every entry in their own business');

select is(tests.rows_affected(
  $$delete from public.entries where id = 'd0000000-0000-4000-8000-000000000001'$$), 0,
  'staff cannot hard-delete an owner entry');

select is(tests.rows_affected(
  $$update public.entries set deleted_at = now() where id = 'd0000000-0000-4000-8000-000000000001'$$), 0,
  'staff cannot soft-delete an owner entry');

select is(tests.rows_affected(
  $$update public.entries set note = 'edited' where id = 'd0000000-0000-4000-8000-000000000003'$$), 0,
  'staff cannot edit their own entry older than 7 days');

select is(tests.rows_affected(
  $$update public.entries set note = 'edited' where id = 'd0000000-0000-4000-8000-000000000002'$$), 1,
  'staff can edit their own entry inside the 7-day window');

select is(tests.rows_affected(
  $$update public.entries set deleted_at = now() where id = 'd0000000-0000-4000-8000-000000000002'$$), 1,
  'staff can soft-delete their own recent entry');

select throws_ok(
  $$insert into public.entries (business_id, type, amount_minor, account_id, occurred_at, created_by, client_id)
    values ('f0000000-0000-4000-8000-000000000001', 'expense', 100,
            (select id from public.accounts where business_id = 'f0000000-0000-4000-8000-000000000001' limit 1),
            now(), 'e0000000-0000-4000-8000-000000000001', gen_random_uuid())$$,
  '42501',
  'new row violates row-level security policy for table "entries"',
  'staff cannot attribute a new entry to someone else'
);

select is((select count(*)::int from public.whatsapp_links), 0,
  'staff cannot see the owner linked phone number');
select is((select count(*)::int from public.audit_log), 0,
  'staff cannot read the audit log');

-- ---------------------------------------------------------------------------
-- Accountant is read-only (P1 role, policy already in force).
-- ---------------------------------------------------------------------------
select tests.authenticate_as('e0000000-0000-4000-8000-000000000003');

select is((select count(*)::int from public.entries where business_id = 'f0000000-0000-4000-8000-000000000001'), 3,
  'accountant can read entries');
select throws_ok(
  $$insert into public.entries (business_id, type, amount_minor, account_id, occurred_at, created_by, client_id)
    values ('f0000000-0000-4000-8000-000000000001', 'expense', 100,
            (select id from public.accounts where business_id = 'f0000000-0000-4000-8000-000000000001' limit 1),
            now(), 'e0000000-0000-4000-8000-000000000003', gen_random_uuid())$$,
  '42501',
  'new row violates row-level security policy for table "entries"',
  'accountant cannot write entries'
);
select is(tests.rows_affected(
  $$update public.entries set note = 'nope' where id = 'd0000000-0000-4000-8000-000000000001'$$), 0,
  'accountant cannot edit entries');

-- ---------------------------------------------------------------------------
-- Offline sync idempotency (§4.7).
-- ---------------------------------------------------------------------------
select tests.authenticate_as('e0000000-0000-4000-8000-000000000001');

select throws_ok(
  $$insert into public.entries (business_id, type, amount_minor, account_id, occurred_at, created_by, client_id)
    values ('f0000000-0000-4000-8000-000000000001', 'expense', 45000,
            (select id from public.accounts where business_id = 'f0000000-0000-4000-8000-000000000001' and kind = 'cash'),
            now(), 'e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001')$$,
  '23505',
  'duplicate key value violates unique constraint "entries_client_id_key"',
  'a retried offline create cannot insert twice'
);

select is((select public.fn_ping()), 'ok', 'keepalive endpoint responds');

select * from finish();
rollback;
