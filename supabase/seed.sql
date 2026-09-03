-- ============================================================================
-- Seed: two demo businesses with 60 days of plausible entries.
--
-- Sign in locally with phone OTP 123456 on any of:
--   +919999900001  Anil    owner of "Sharma Print Lab", staff at "Green Leaf Tea Stall"
--   +919999900002  Priya   owner of "Green Leaf Tea Stall"
--   +919999900003  Ravi    staff at "Sharma Print Lab"
-- ============================================================================

set session_replication_role = replica;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, phone, encrypted_password,
  email_confirmed_at, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  -- GoTrue scans these columns into non-nullable strings; NULL makes every
  -- auth request fail with "Database error finding user".
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'anil@example.com', '919999900001', '', now(), now(),
   '{"provider":"phone","providers":["phone"]}', '{"name":"Anil Sharma"}', now() - interval '90 days', now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'priya@example.com', '919999900002', '', now(), now(),
   '{"provider":"phone","providers":["phone"]}', '{"name":"Priya Nair"}', now() - interval '90 days', now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated',
   'ravi@example.com', '919999900003', '', now(), now(),
   '{"provider":"phone","providers":["phone"]}', '{"name":"Ravi Kumar"}', now() - interval '90 days', now(),
   '', '', '', '', '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id, u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'phone', u.phone, 'email', u.email),
       'phone', now(), now(), now()
from auth.users u
where u.id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
)
on conflict do nothing;

set session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- Businesses, members, defaults
-- ---------------------------------------------------------------------------
insert into public.businesses (id, name, currency, locale, timezone, starting_balance_minor, owner_id, created_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Sharma Print Lab', 'INR', 'en-IN', 'Asia/Kolkata', 1500000,
   '11111111-1111-1111-1111-111111111111', now() - interval '90 days'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Green Leaf Tea Stall', 'INR', 'en-IN', 'Asia/Kolkata', 300000,
   '22222222-2222-2222-2222-222222222222', now() - interval '90 days')
on conflict (id) do nothing;

insert into public.business_members (business_id, user_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '33333333-3333-3333-3333-333333333333', 'staff'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '22222222-2222-2222-2222-222222222222', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'staff')
on conflict do nothing;

select public.fn_seed_business_defaults('aaaaaaaa-0000-4000-8000-000000000001');
select public.fn_seed_business_defaults('bbbbbbbb-0000-4000-8000-000000000002');

insert into public.user_settings (user_id, default_business_id) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-4000-8000-000000000002'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-4000-8000-000000000001')
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Parties
-- ---------------------------------------------------------------------------
insert into public.parties (business_id, name, normalised_name) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Ramesh Traders', 'ramesh traders'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'City College', 'city college'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Landlord', 'landlord'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Ravi Auto', 'ravi auto'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Milk Dairy', 'milk dairy'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Sugar Mart', 'sugar mart')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 60 days of entries.
--
-- The generator is deterministic (hash of day number), so the seeded month
-- totals asserted by the Playwright suite do not drift between runs.
-- ---------------------------------------------------------------------------
do $$
declare
  v_biz record;
  v_day int;
  v_occurred timestamptz;
  v_owner uuid;
  v_staff uuid;
  v_cash uuid;
  v_bank uuid;
  v_upi uuid;
  v_pick int;
  v_amount bigint;
  v_cat uuid;
  v_party uuid;
  v_note text;
  v_type public.entry_type;
  v_account uuid;
  v_creator uuid;
begin
  for v_biz in select * from public.businesses order by created_at loop
    select id into v_cash from public.accounts where business_id = v_biz.id and kind = 'cash';
    select id into v_bank from public.accounts where business_id = v_biz.id and kind = 'bank';
    select id into v_upi  from public.accounts where business_id = v_biz.id and kind = 'upi';
    v_owner := v_biz.owner_id;
    select user_id into v_staff from public.business_members
      where business_id = v_biz.id and role = 'staff' limit 1;
    v_staff := coalesce(v_staff, v_owner);

    for v_day in 0..59 loop
      -- 3 to 5 entries a day.
      for v_pick in 0..(3 + (v_day % 3)) loop
        -- Always in the past: a ledger never holds an entry that has not
        -- happened yet, and an entry saved right now must sort to the top.
        v_occurred := now()
                      - (v_day || ' days')::interval
                      - ((v_pick * 2 + 1) || ' hours')::interval
                      - (((v_day * 7 + v_pick * 13) % 60) || ' minutes')::interval;

        v_type := case when (v_day + v_pick) % 4 = 0 then 'income'::public.entry_type
                       else 'expense'::public.entry_type end;
        v_creator := case when v_pick % 3 = 0 then v_staff else v_owner end;
        v_party := null;

        if v_type = 'income' then
          v_amount := ((2000 + ((v_day * 37 + v_pick * 191) % 8000)) / 10) * 1000;
          select id into v_cat from public.categories
            where business_id = v_biz.id and type = 'income'
              and name = case when (v_day + v_pick) % 8 = 0 then 'Services' else 'Sales' end;
          v_note := case when (v_day + v_pick) % 8 = 0 then 'job work' else 'counter sale' end;
          select id into v_party from public.parties
            where business_id = v_biz.id order by name offset ((v_day + v_pick) % 2) limit 1;
          v_account := case when (v_day + v_pick) % 3 = 0 then v_upi else v_cash end;
        else
          case (v_day * 3 + v_pick) % 7
            when 0 then v_note := 'tea shop';        v_amount := 4000;
            when 1 then v_note := 'auto fare';       v_amount := 6000 + (v_day % 5) * 1000;
            when 2 then v_note := 'raw material';    v_amount := 120000 + (v_day % 9) * 5000;
            when 3 then v_note := 'electricity bill';v_amount := 240000;
            when 4 then v_note := 'snacks for staff';v_amount := 9000;
            when 5 then v_note := 'courier';         v_amount := 15000;
            else        v_note := 'shop cleaning';   v_amount := 20000;
          end case;
          select id into v_cat from public.categories
            where business_id = v_biz.id and type = 'expense'
              and name = case
                when v_note = 'tea shop' or v_note = 'snacks for staff' then 'Food & Tea'
                when v_note = 'auto fare' or v_note = 'courier' then 'Transport'
                when v_note = 'raw material' then 'Raw Material'
                when v_note = 'electricity bill' then 'Utilities'
                else 'Maintenance' end;
          v_account := case when v_amount > 100000 then v_bank else v_cash end;
        end if;

        insert into public.entries (
          business_id, type, amount_minor, account_id, category_id, party_id,
          note, occurred_at, source, created_by
        ) values (
          v_biz.id, v_type, v_amount, v_account, v_cat, v_party, v_note, v_occurred,
          case when (v_day + v_pick) % 11 = 0 then 'whatsapp'::public.entry_source else 'app'::public.entry_source end,
          v_creator
        );
      end loop;

      -- Rent on the 1st of each month, salaries on the 5th.
      if extract(day from (now() - (v_day || ' days')::interval)) = 1 then
        select id into v_cat from public.categories where business_id = v_biz.id and name = 'Rent' and type = 'expense';
        select id into v_party from public.parties where business_id = v_biz.id and normalised_name = 'landlord';
        insert into public.entries (business_id, type, amount_minor, account_id, category_id, party_id, note, occurred_at, created_by)
        values (v_biz.id, 'expense', 1200000, v_bank, v_cat, v_party, 'monthly rent',
                now() - (v_day || ' days')::interval - interval '13 hours', v_owner);
      end if;
      if extract(day from (now() - (v_day || ' days')::interval)) = 5 then
        select id into v_cat from public.categories where business_id = v_biz.id and name = 'Salaries' and type = 'expense';
        insert into public.entries (business_id, type, amount_minor, account_id, category_id, note, occurred_at, created_by)
        values (v_biz.id, 'expense', 1800000, v_bank, v_cat, 'staff salary',
                now() - (v_day || ' days')::interval - interval '14 hours', v_owner);
      end if;
    end loop;
  end loop;
end;
$$;

-- A linked WhatsApp number for the print lab owner, so the webhook works out of the box.
insert into public.whatsapp_links (business_id, user_id, phone_e164) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', '+919999900001')
on conflict (phone_e164) do nothing;
