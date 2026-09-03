-- Shared fixture helpers for the pgTAP suite.
--
-- Included by each test file with \ir; everything lives inside that test's
-- transaction and is rolled back with it. The .inc extension keeps pg_prove
-- from treating this file as a test in its own right.

create schema if not exists tests;

-- Impersonate an end user exactly as PostgREST does: role `authenticated`
-- plus a JWT claims GUC, which is what auth.uid() reads.
create or replace function tests.authenticate_as(p_user uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function tests.as_service()
returns void
language plpgsql
as $$
begin
  reset role;
  perform set_config('request.jwt.claims', null, true);
end;
$$;

-- Counts rows a DML statement actually touched, which is how an RLS refusal
-- shows up for UPDATE/DELETE: no error, zero rows.
create or replace function tests.rows_affected(p_sql text)
returns int
language plpgsql
as $$
declare
  v_count int;
begin
  execute 'with affected as (' || p_sql || ' returning 1) select count(*)::int from affected' into v_count;
  return v_count;
end;
$$;

-- The helpers are called after the test has switched to `authenticated`, so
-- that role needs to be able to reach them.
grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;
