-- ============================================================================
-- Realtime.
--
-- §4.5/§10.4 scenario 7: an entry created by the WhatsApp webhook has to appear
-- in an open app within three seconds, with no reload. That only happens if the
-- table is part of the `supabase_realtime` publication — the publication starts
-- empty, so this is not optional plumbing.
--
-- Subscribers still see only their own business's rows: Realtime applies the
-- same RLS policies to postgres_changes as PostgREST does to reads.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'entries'
  ) then
    alter publication supabase_realtime add table public.entries;
  end if;
end;
$$;

-- Soft deletes and edits arrive as UPDATEs; FULL replica identity is what lets
-- a subscriber filter them by business_id instead of only seeing the primary key.
alter table public.entries replica identity full;
