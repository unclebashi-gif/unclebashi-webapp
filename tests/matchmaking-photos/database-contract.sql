-- Read-only Wave 4A database contract check.
-- Run with: psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/matchmaking-photos/database-contract.sql
begin read only;

do $checks$
declare
  v_eligibility_definition text;
begin
  if not exists (
    select 1 from pg_catalog.pg_class as relation_row
    join pg_catalog.pg_namespace as namespace_row on namespace_row.oid = relation_row.relnamespace
    where namespace_row.nspname = 'public' and relation_row.relname = 'matchmaking_photos'
      and relation_row.relrowsecurity
  ) then raise exception 'Contract failed: photo table RLS is not enabled.'; end if;

  if not exists (
    select 1 from pg_catalog.pg_class as relation_row
    join pg_catalog.pg_namespace as namespace_row on namespace_row.oid = relation_row.relnamespace
    where namespace_row.nspname = 'public' and relation_row.relname = 'matchmaking_photo_cleanup_queue'
      and relation_row.relrowsecurity
  ) then raise exception 'Contract failed: cleanup queue RLS is not enabled.'; end if;

  if not exists (
    select 1 from storage.buckets as bucket_row
    where bucket_row.id = 'matchmaking-photos' and bucket_row.public is false
      and bucket_row.file_size_limit = 3145728
      and bucket_row.allowed_mime_types = array['image/webp']::text[]
  ) then raise exception 'Contract failed: private WebP bucket restrictions differ.'; end if;

  if pg_catalog.has_table_privilege('anon', 'public.matchmaking_photos', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photos', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photos', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photos', 'DELETE')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photos', 'TRUNCATE')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photos', 'REFERENCES')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photos', 'TRIGGER')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photos', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photos', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photos', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photos', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photos', 'TRUNCATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photos', 'REFERENCES')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photos', 'TRIGGER')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photo_cleanup_queue', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photo_cleanup_queue', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photo_cleanup_queue', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photo_cleanup_queue', 'DELETE')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photo_cleanup_queue', 'TRUNCATE')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photo_cleanup_queue', 'REFERENCES')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photo_cleanup_queue', 'TRIGGER')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photo_cleanup_queue', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photo_cleanup_queue', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photo_cleanup_queue', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photo_cleanup_queue', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photo_cleanup_queue', 'TRUNCATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photo_cleanup_queue', 'REFERENCES')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photo_cleanup_queue', 'TRIGGER') then
    raise exception 'Contract failed: browser role has direct photo or cleanup queue table access.';
  end if;

  if pg_catalog.to_regprocedure('public.get_my_matchmaking_photos()') is null
     or not pg_catalog.has_function_privilege('authenticated', 'public.get_my_matchmaking_photos()', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.get_my_matchmaking_photos()', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.get_my_matchmaking_photos()', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.reorder_my_matchmaking_photos(uuid[])', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.reorder_my_matchmaking_photos(uuid[])', 'EXECUTE') then
    raise exception 'Contract failed: owner photo RPC grants differ.';
  end if;

  if pg_catalog.to_regprocedure('public.get_matchmaking_profile_photo_ids(uuid)') is null
     or not pg_catalog.has_function_privilege('authenticated', 'public.get_matchmaking_profile_photo_ids(uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.get_matchmaking_profile_photo_ids(uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.get_matchmaking_profile_photo_ids(uuid)', 'EXECUTE') then
    raise exception 'Contract failed: member-facing photo ID projection grants differ.';
  end if;
  if pg_catalog.pg_get_function_result('public.get_matchmaking_profile_photo_ids(uuid)'::regprocedure)
       not like 'TABLE(photo_id uuid, display_order smallint)' then
    raise exception 'Contract failed: member photo projection returns fields outside the approved ID/order allowlist.';
  end if;

  if not pg_catalog.has_function_privilege('authenticated', 'public.get_admin_matchmaking_photo_review_queue(integer)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.get_admin_matchmaking_photo_review_queue(integer)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.review_matchmaking_photo(uuid,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.review_matchmaking_photo(uuid,text,text)', 'EXECUTE') then
    raise exception 'Contract failed: admin photo review RPC grants differ.';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public._create_matchmaking_photo_upload_slot(uuid,uuid,smallint,text,uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public._create_matchmaking_photo_upload_slot(uuid,uuid,smallint,text,uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public._retire_matchmaking_photo(uuid,uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public._retire_matchmaking_photo(uuid,uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public._get_matchmaking_photo_cleanup_paths(integer)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public._get_matchmaking_photo_cleanup_paths(integer)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public._complete_matchmaking_photo_cleanup(text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public._complete_matchmaking_photo_cleanup(text,text)', 'EXECUTE') then
    raise exception 'Contract failed: an internal photo workflow RPC is browser-executable.';
  end if;
  if not pg_catalog.has_function_privilege('service_role', 'public._create_matchmaking_photo_upload_slot(uuid,uuid,smallint,text,uuid)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public._retire_matchmaking_photo(uuid,uuid)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public._get_matchmaking_photo_cleanup_paths(integer)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public._complete_matchmaking_photo_cleanup(text,text)', 'EXECUTE') then
    raise exception 'Contract failed: trusted service-role photo workflow grants are incomplete.';
  end if;

  if pg_catalog.to_regprocedure('public.is_matchmaking_eligible(uuid)') is null then
    raise exception 'Contract failed: the existing Matchmaking eligibility function is missing.';
  end if;
  select pg_catalog.pg_get_functiondef('public.is_matchmaking_eligible(uuid)'::regprocedure)
    into v_eligibility_definition;
  if pg_catalog.strpos(v_eligibility_definition, 'matchmaking_photos') > 0 then
    raise exception 'Contract failed: photo count logic has entered Matchmaking eligibility.';
  end if;
end;
$checks$;

rollback;
