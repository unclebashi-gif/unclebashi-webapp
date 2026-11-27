begin;

do $preconditions$
begin
  if pg_catalog.to_regclass('public.matchmaking_photos') is null
     or pg_catalog.to_regclass('public.matchmaking_photo_cleanup_queue') is null
     or pg_catalog.to_regclass('public.users') is null
     or pg_catalog.to_regclass('public.user_journeys') is null
     or pg_catalog.to_regclass('public.user_roles') is null
     or pg_catalog.to_regprocedure('public.is_community_user_suspended(uuid)') is null
     or pg_catalog.to_regprocedure('public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint)') is null
     or pg_catalog.to_regprocedure('public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint,text)') is not null
     or pg_catalog.to_regprocedure('public.get_admin_matchmaking_photo_review_queue(integer)') is null
     or pg_catalog.to_regprocedure('public.review_matchmaking_photo(uuid,text,text)') is null
     or pg_catalog.to_regprocedure('public.is_matchmaking_eligible(uuid)') is null then
    raise exception 'Precondition failed: Matchmaking photo release dependencies are missing.';
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'Precondition failed: Matchmaking photo table or service role is missing.';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.matchmaking_photo_cleanup_queue'::regclass
      and constraint_row.conname = 'matchmaking_photo_cleanup_queue_pkey') then
    raise exception 'Precondition failed: the existing photo cleanup queue primary key is missing.';
  end if;
  if exists (select 1 from public.matchmaking_photos where status = 'approved' and upload_completed_at is null) then
    raise exception 'Precondition failed: an approved photo has no completed upload; review data before migration.';
  end if;
end;
$preconditions$;

alter table public.matchmaking_photos
  add column published_at timestamptz,
  add column publication_source text;

-- Existing approved rows were individually approved by staff. Backfill only
-- those rows; historical pending/rejected rows are never auto-published.
update public.matchmaking_photos
set published_at = coalesce(reviewed_at, uploaded_at, created_at),
    publication_source = 'administrator'
where status = 'approved';

alter table public.matchmaking_photos
  add constraint matchmaking_photos_publication_metadata_pair_check
    check ((published_at is null) = (publication_source is null)),
  add constraint matchmaking_photos_publication_source_check
    check (publication_source is null or publication_source in ('automatic', 'administrator')),
  add constraint matchmaking_photos_approved_publication_check
    check (status <> 'approved' or (upload_completed_at is not null and published_at is not null));

create index matchmaking_photos_publication_order_idx
  on public.matchmaking_photos(user_id, display_order)
  where deleted_at is null and upload_completed_at is not null and status = 'approved';

-- Remove the legacy RPC signature before changing publication semantics.
-- A still-deployed older Edge Function only knows the four-argument call and
-- must fail closed instead of reaching automatic publication without byte validation.
drop function public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint);

create function public._finalize_matchmaking_photo_upload(
  p_user_id uuid,
  p_photo_id uuid,
  p_content_type text,
  p_size_bytes bigint,
  p_image_validation_version text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_updated integer;
  v_photo public.matchmaking_photos%rowtype;
  v_old_order smallint;
  v_old_path text;
begin
  if p_image_validation_version is distinct from 'webp-container-v1'
     or p_content_type is distinct from 'image/webp' or p_size_bytes is null
     or p_size_bytes < 1 or p_size_bytes > 3145728 then
    raise exception 'Uploaded photo must be WebP and no larger than 3 MB.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  if p_user_id is null or not exists (
    select 1 from public.users as account
    join public.user_journeys as journey_row on journey_row.user_id = account.id
    where account.id = p_user_id and account.account_status = 'active'
      and journey_row.journey_type = 'matchmaking' and journey_row.status = 'active'
  ) or public.is_community_user_suspended(p_user_id) then
    raise exception 'An active Matchmaking journey is required to finalize a photo.' using errcode = '42501';
  end if;
  select photo_row.* into v_photo
  from public.matchmaking_photos as photo_row
  where photo_row.id = p_photo_id and photo_row.user_id = p_user_id
    and photo_row.deleted_at is null and photo_row.upload_completed_at is null
  for update;
  if not found then raise exception 'Upload slot is unavailable or already finalized.' using errcode = 'P0002'; end if;

  if v_photo.replaces_photo_id is not null then
    select photo_row.display_order, photo_row.storage_path
      into v_old_order, v_old_path
    from public.matchmaking_photos as photo_row
    where photo_row.id = v_photo.replaces_photo_id
      and photo_row.user_id = p_user_id
      and photo_row.deleted_at is null
      and photo_row.upload_completed_at is not null
    for update;
    if v_old_order is null then
      raise exception 'The photo being replaced is no longer available.' using errcode = 'P0002';
    end if;
    update public.matchmaking_photos as old_photo
    set deleted_at = now()
    where old_photo.id = v_photo.replaces_photo_id and old_photo.user_id = p_user_id;
    insert into public.matchmaking_photo_cleanup_queue(storage_path)
    values (v_old_path) on conflict on constraint matchmaking_photo_cleanup_queue_pkey do nothing;
  end if;

  update public.matchmaking_photos as photo_row
  set display_order = coalesce(v_old_order, photo_row.display_order),
      replaces_photo_id = null,
      upload_completed_at = now(), uploaded_at = now(), status = 'approved',
      published_at = now(), publication_source = 'automatic',
      reviewed_at = null, reviewed_by = null, moderation_reason = null
  where photo_row.id = p_photo_id and photo_row.user_id = p_user_id
    and photo_row.deleted_at is null and photo_row.upload_completed_at is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Upload slot is unavailable or already finalized.' using errcode = 'P0002';
  end if;
  return true;
end;
$function$;

create or replace function public.get_admin_matchmaking_photo_review_queue(p_limit integer default 50)
returns table(
  id uuid,
  user_id uuid,
  display_order smallint,
  status text,
  uploaded_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if not exists (select 1 from public.user_roles as role_row
    where role_row.user_id = v_actor and role_row.role in ('admin', 'moderator')) then
    raise exception 'Photo review permission required.' using errcode = '42501';
  end if;
  return query
  select photo_row.id, photo_row.user_id, photo_row.display_order,
         photo_row.status, photo_row.uploaded_at, photo_row.created_at
  from public.matchmaking_photos as photo_row
  where photo_row.deleted_at is null and photo_row.upload_completed_at is not null
    and photo_row.status in ('pending_review', 'approved')
  order by case when photo_row.status = 'pending_review' then 0 else 1 end,
           photo_row.uploaded_at desc, photo_row.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$function$;

create or replace function public.review_matchmaking_photo(p_photo_id uuid, p_decision text, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_storage_path text;
  v_updated boolean := false;
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if not exists (select 1 from public.user_roles as role_row
    where role_row.user_id = v_actor and role_row.role in ('admin', 'moderator')) then
    raise exception 'Photo review permission required.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject', 'remove') then
    raise exception 'Choose approve, reject, or remove.' using errcode = '22023';
  end if;
  if p_decision in ('reject', 'remove') and (p_reason is null or pg_catalog.length(pg_catalog.btrim(p_reason)) = 0
      or pg_catalog.length(p_reason) > 500) then
    raise exception 'A concise reason is required to reject or remove a photo.' using errcode = '22023';
  end if;

  if p_decision = 'approve' then
    update public.matchmaking_photos as photo_row
    set status = 'approved',
        published_at = coalesce(photo_row.published_at, now()),
        publication_source = coalesce(photo_row.publication_source, 'administrator'),
        reviewed_at = now(), reviewed_by = v_actor, moderation_reason = null
    where photo_row.id = p_photo_id and photo_row.deleted_at is null
      and photo_row.upload_completed_at is not null and photo_row.status = 'pending_review';
    v_updated := found;
  elsif p_decision = 'reject' then
    update public.matchmaking_photos as photo_row
    set status = 'rejected', reviewed_at = now(), reviewed_by = v_actor,
        moderation_reason = pg_catalog.btrim(p_reason)
    where photo_row.id = p_photo_id and photo_row.deleted_at is null
      and photo_row.upload_completed_at is not null and photo_row.status in ('pending_review', 'approved');
    v_updated := found;
  else
    update public.matchmaking_photos as photo_row
    set deleted_at = now(), reviewed_at = now(), reviewed_by = v_actor,
        moderation_reason = pg_catalog.btrim(p_reason)
    where photo_row.id = p_photo_id and photo_row.deleted_at is null
      and photo_row.upload_completed_at is not null and photo_row.status = 'approved'
    returning photo_row.storage_path into v_storage_path;
    v_updated := found;
    if v_updated then
      insert into public.matchmaking_photo_cleanup_queue(storage_path)
      values (v_storage_path) on conflict on constraint matchmaking_photo_cleanup_queue_pkey do nothing;
    end if;
  end if;
  if not v_updated then raise exception 'Photo review item not found or no longer actionable.' using errcode = 'P0002'; end if;
  return true;
end;
$function$;

revoke all on function public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint,text) from public, anon, authenticated;
grant execute on function public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint,text) to service_role;
revoke all on function public.get_admin_matchmaking_photo_review_queue(integer) from public, anon, authenticated, service_role;
revoke all on function public.review_matchmaking_photo(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.get_admin_matchmaking_photo_review_queue(integer) to authenticated;
grant execute on function public.review_matchmaking_photo(uuid,text,text) to authenticated;

do $postconditions$
declare
  v_eligibility_definition text;
  v_finalize_definition text;
begin
  if not exists (
    select 1 from pg_catalog.pg_attribute as attribute_row
    where attribute_row.attrelid = 'public.matchmaking_photos'::regclass
      and attribute_row.attname = 'published_at' and not attribute_row.attisdropped
  ) or not exists (
    select 1 from pg_catalog.pg_attribute as attribute_row
    where attribute_row.attrelid = 'public.matchmaking_photos'::regclass
      and attribute_row.attname = 'publication_source' and not attribute_row.attisdropped
  ) then
    raise exception 'Postcondition failed: photo publication metadata columns are missing.';
  end if;
  if exists (
    select required.constraint_name
    from (values
      ('matchmaking_photos_publication_metadata_pair_check'),
      ('matchmaking_photos_publication_source_check'),
      ('matchmaking_photos_approved_publication_check')
    ) as required(constraint_name)
    where not exists (
      select 1 from pg_catalog.pg_constraint as constraint_row
      where constraint_row.conrelid = 'public.matchmaking_photos'::regclass
        and constraint_row.conname = required.constraint_name
        and constraint_row.convalidated
    )
  ) then
    raise exception 'Postcondition failed: photo publication integrity constraints are missing or unvalidated.';
  end if;
  if exists (select 1 from public.matchmaking_photos where status = 'approved'
    and (upload_completed_at is null or published_at is null or publication_source not in ('automatic', 'administrator'))) then
    raise exception 'Postcondition failed: approved photos must have completed, sourced publication metadata.';
  end if;
  if exists (select 1 from public.matchmaking_photos where status in ('pending_review', 'rejected') and publication_source = 'automatic') then
    raise exception 'Postcondition failed: historical pending/rejected photos were incorrectly auto-published.';
  end if;
  if pg_catalog.to_regprocedure('public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint)') is not null
     or pg_catalog.to_regprocedure('public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint,text)') is null
     or pg_catalog.has_function_privilege('anon', 'public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint,text)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint,text)', 'EXECUTE') then
    raise exception 'Postcondition failed: service-only photo finalization privileges are incorrect.';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint,text)'::regprocedure
  ) into v_finalize_definition;
  if pg_catalog.strpos(v_finalize_definition, 'webp-container-v1') = 0 then
    raise exception 'Postcondition failed: photo finalizer must require the validated Edge contract.';
  end if;
  if pg_catalog.to_regprocedure('public.get_admin_matchmaking_photo_review_queue(integer)') is null
     or pg_catalog.to_regprocedure('public.review_matchmaking_photo(uuid,text,text)') is null
     or not pg_catalog.has_function_privilege('authenticated', 'public.get_admin_matchmaking_photo_review_queue(integer)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.get_admin_matchmaking_photo_review_queue(integer)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.get_admin_matchmaking_photo_review_queue(integer)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.review_matchmaking_photo(uuid,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.review_matchmaking_photo(uuid,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.review_matchmaking_photo(uuid,text,text)', 'EXECUTE') then
    raise exception 'Postcondition failed: admin photo moderation RPC privileges are incorrect.';
  end if;
  if pg_catalog.pg_get_function_result('public.get_admin_matchmaking_photo_review_queue(integer)'::regprocedure)
       not like 'TABLE(id uuid, user_id uuid, display_order smallint, status text, uploaded_at timestamp with time zone, created_at timestamp with time zone)' then
    raise exception 'Postcondition failed: admin photo queue return shape changed.';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc as function_row
    where function_row.oid in (
      'public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint,text)'::regprocedure,
      'public.get_admin_matchmaking_photo_review_queue(integer)'::regprocedure,
      'public.review_matchmaking_photo(uuid,text,text)'::regprocedure
    ) and (not function_row.prosecdef or not exists (
      select 1 from pg_catalog.unnest(coalesce(function_row.proconfig, array[]::text[])) as config(setting)
      where pg_catalog.replace(config.setting, '"', '') = 'search_path='
    ))
  ) then
    raise exception 'Postcondition failed: photo workflow SECURITY DEFINER/search_path settings are incorrect.';
  end if;
  select pg_catalog.pg_get_functiondef('public.is_matchmaking_eligible(uuid)'::regprocedure) into v_eligibility_definition;
  if pg_catalog.strpos(v_eligibility_definition, 'matchmaking_photos') > 0 then
    raise exception 'Postcondition failed: photo-count logic must not enter Matchmaking eligibility.';
  end if;
end;
$postconditions$;

notify pgrst, 'reload schema';

commit;
