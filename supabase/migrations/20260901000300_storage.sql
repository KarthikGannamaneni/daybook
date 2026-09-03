-- ============================================================================
-- Attachments bucket: one compressed bill photo per entry (§4.3).
-- Object paths are always "<business_id>/<entry_client_id>.jpg", which is what
-- makes the per-business policies below expressible as a path prefix check.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy attachments_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and public.fn_is_member(((storage.foldername(name))[1])::uuid)
  );

create policy attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.fn_role(((storage.foldername(name))[1])::uuid) in ('owner', 'staff')
  );

create policy attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and public.fn_is_owner(((storage.foldername(name))[1])::uuid)
  );
