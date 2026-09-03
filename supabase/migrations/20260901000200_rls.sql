-- ============================================================================
-- Row level security.
--
-- This file is the authorisation model. The UI hides what a role cannot do;
-- the database is what refuses it (§3, §6.4). Every policy here has a pgTAP
-- test in supabase/tests.
-- ============================================================================

alter table public.businesses           enable row level security;
alter table public.business_members     enable row level security;
alter table public.accounts             enable row level security;
alter table public.categories           enable row level security;
alter table public.parties              enable row level security;
alter table public.entries              enable row level security;
alter table public.whatsapp_links       enable row level security;
alter table public.whatsapp_link_codes  enable row level security;
alter table public.whatsapp_messages    enable row level security;
alter table public.category_predictions enable row level security;
alter table public.user_settings        enable row level security;
alter table public.audit_log            enable row level security;

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------
create policy businesses_select on public.businesses
  for select using (public.fn_is_member(id));

create policy businesses_insert on public.businesses
  for insert with check (owner_id = auth.uid());

create policy businesses_update on public.businesses
  for update using (public.fn_is_owner(id)) with check (public.fn_is_owner(id));

create policy businesses_delete on public.businesses
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- business_members
-- ---------------------------------------------------------------------------
create policy members_select on public.business_members
  for select using (public.fn_is_member(business_id));

-- The very first membership row is written by fn_create_business (definer);
-- afterwards only an owner may add members.
create policy members_insert on public.business_members
  for insert with check (public.fn_is_owner(business_id));

create policy members_update on public.business_members
  for update using (public.fn_is_owner(business_id)) with check (public.fn_is_owner(business_id));

create policy members_delete on public.business_members
  for delete using (public.fn_is_owner(business_id));

-- ---------------------------------------------------------------------------
-- accounts, categories, parties: readable by members, editable by owner+staff,
-- removable by the owner only.
-- ---------------------------------------------------------------------------
create policy accounts_select on public.accounts
  for select using (public.fn_is_member(business_id));
create policy accounts_insert on public.accounts
  for insert with check (public.fn_role(business_id) in ('owner', 'staff'));
create policy accounts_update on public.accounts
  for update using (public.fn_role(business_id) in ('owner', 'staff'))
  with check (public.fn_role(business_id) in ('owner', 'staff'));
create policy accounts_delete on public.accounts
  for delete using (public.fn_is_owner(business_id));

create policy categories_select on public.categories
  for select using (public.fn_is_member(business_id));
create policy categories_insert on public.categories
  for insert with check (public.fn_role(business_id) in ('owner', 'staff'));
create policy categories_update on public.categories
  for update using (public.fn_role(business_id) in ('owner', 'staff'))
  with check (public.fn_role(business_id) in ('owner', 'staff'));
create policy categories_delete on public.categories
  for delete using (public.fn_is_owner(business_id));

create policy parties_select on public.parties
  for select using (public.fn_is_member(business_id));
create policy parties_insert on public.parties
  for insert with check (public.fn_role(business_id) in ('owner', 'staff'));
create policy parties_update on public.parties
  for update using (public.fn_role(business_id) in ('owner', 'staff'))
  with check (public.fn_role(business_id) in ('owner', 'staff'));
create policy parties_delete on public.parties
  for delete using (public.fn_is_owner(business_id));

-- ---------------------------------------------------------------------------
-- entries — the role rules that matter (§3)
-- ---------------------------------------------------------------------------
create policy entries_select on public.entries
  for select using (public.fn_is_member(business_id));

create policy entries_insert on public.entries
  for insert with check (
    public.fn_role(business_id) in ('owner', 'staff')
    and created_by = auth.uid()
  );

-- Owners may edit anything in their business. Staff may edit only their own
-- entries, and only while the entry is inside the 7-day window. A soft delete
-- is an UPDATE of deleted_at, so this one policy also governs staff deletes.
create policy entries_update on public.entries
  for update using (
    public.fn_is_owner(business_id)
    or (
      public.fn_role(business_id) = 'staff'
      and created_by = auth.uid()
      and occurred_at > now() - interval '7 days'
    )
  )
  with check (
    public.fn_is_owner(business_id)
    or (
      public.fn_role(business_id) = 'staff'
      and created_by = auth.uid()
      and occurred_at > now() - interval '7 days'
    )
  );

-- Hard deletes are an owner-only escape hatch; the app soft-deletes.
create policy entries_delete on public.entries
  for delete using (public.fn_is_owner(business_id));

-- ---------------------------------------------------------------------------
-- WhatsApp. Phone numbers are owner-visible only (§6.4).
-- ---------------------------------------------------------------------------
create policy wa_links_select on public.whatsapp_links
  for select using (public.fn_is_owner(business_id) or user_id = auth.uid());
create policy wa_links_insert on public.whatsapp_links
  for insert with check (public.fn_is_owner(business_id));
create policy wa_links_delete on public.whatsapp_links
  for delete using (public.fn_is_owner(business_id) or user_id = auth.uid());

create policy wa_codes_select on public.whatsapp_link_codes
  for select using (user_id = auth.uid());
create policy wa_codes_insert on public.whatsapp_link_codes
  for insert with check (user_id = auth.uid() and public.fn_is_member(business_id));
create policy wa_codes_delete on public.whatsapp_link_codes
  for delete using (user_id = auth.uid());

-- Inbound message logs are written by the webhook with the service role; owners
-- may read their own business's log for debugging.
create policy wa_messages_select on public.whatsapp_messages
  for select using (business_id is not null and public.fn_is_owner(business_id));

-- ---------------------------------------------------------------------------
-- Prediction table: read-only to members, written by the definer trigger.
-- ---------------------------------------------------------------------------
create policy predictions_select on public.category_predictions
  for select using (public.fn_is_member(business_id));

-- ---------------------------------------------------------------------------
-- user_settings: strictly the owning user.
-- ---------------------------------------------------------------------------
create policy user_settings_select on public.user_settings
  for select using (user_id = auth.uid());
create policy user_settings_insert on public.user_settings
  for insert with check (user_id = auth.uid());
create policy user_settings_update on public.user_settings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- audit_log: owners read, nobody writes directly.
-- ---------------------------------------------------------------------------
create policy audit_select on public.audit_log
  for select using (business_id is not null and public.fn_is_owner(business_id));

-- ---------------------------------------------------------------------------
-- Grants. RLS does the filtering; these just open the doors it guards.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.v_entries, public.v_daily_totals, public.v_monthly_category_totals to authenticated;
grant select, insert, update, delete on
  public.businesses, public.business_members, public.accounts, public.categories,
  public.parties, public.entries, public.whatsapp_links, public.whatsapp_link_codes
  to authenticated;
grant select on public.whatsapp_messages, public.category_predictions, public.audit_log to authenticated;
grant select, insert, update on public.user_settings to authenticated;

revoke all on function public.fn_create_business(text, text, text, text, bigint) from public;
grant execute on function public.fn_create_business(text, text, text, text, bigint) to authenticated;
grant execute on function public.fn_predict_category(uuid, text, uuid) to authenticated;
grant execute on function public.fn_default_account(uuid) to authenticated;
grant execute on function public.fn_quick_chips(uuid, int) to authenticated;
grant execute on function public.fn_upsert_party(uuid, text) to authenticated;
grant execute on function public.fn_search_entries(uuid, text, int) to authenticated;
grant execute on function public.fn_month_summary(uuid, date) to authenticated;
grant execute on function public.fn_ping() to anon, authenticated;
revoke all on function public.fn_seed_business_defaults(uuid) from public;
