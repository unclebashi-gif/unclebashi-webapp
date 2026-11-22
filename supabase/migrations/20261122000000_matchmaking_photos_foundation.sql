begin;

do $preconditions$
begin
  if pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regclass('public.users') is null
     or pg_catalog.to_regclass('public.user_roles') is null
     or pg_catalog.to_regclass('public.user_journeys') is null
     or pg_catalog.to_regclass('public.matchmaking_profiles') is null
     or pg_catalog.to_regclass('storage.buckets') is null
     or pg_catalog.to_regclass('public.matchmaking_photos') is not null
     or pg_catalog.to_regclass('public.matchmaking_photo_cleanup_queue') is not null
     or pg_catalog.to_regprocedure('public.set_updated_at()') is null
     or pg_catalog.to_regprocedure('public.is_community_user_suspended(uuid)') is null
     or pg_catalog.to_regprocedure('public.is_matchmaking_eligible(uuid)') is null
     or pg_catalog.to_regprocedure('public.get_matchmaking_profile(uuid)') is null
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'Required identity, journey, Matchmaking, timestamp, or service-role prerequisites are missing or conflicting.';
  end if;

  if exists (
    select 1 from storage.buckets as bucket_row
    where bucket_row.id = 'matchmaking-photos'
      and (bucket_row.public is true
        or bucket_row.file_size_limit is distinct from 3145728
        or bucket_row.allowed_mime_types is distinct from array['image/webp']::text[])
  ) then
    raise exception 'Existing matchmaking-photos bucket has incompatible privacy or upload restrictions.';
  end if;
end;
$preconditions$;

create table public.matchmaking_photos (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  display_order smallint,
  replaces_photo_id uuid references public.matchmaking_photos(id) on delete cascade,
  status text not null default 'pending_review',
  upload_completed_at timestamptz,
  uploaded_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  moderation_reason text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matchmaking_photos_order_check check (
    (display_order is not null and display_order between 1 and 3 and replaces_photo_id is null)
    or (display_order is null and replaces_photo_id is not null and upload_completed_at is null)
  ),
  constraint matchmaking_photos_status_check check (status in ('pending_review', 'approved', 'rejected')),
  constraint matchmaking_photos_path_check check (storage_path = user_id::text || '/' || id::text || '.webp'),
  constraint matchmaking_photos_reason_length_check check (moderation_reason is null or pg_catalog.length(moderation_reason) <= 500),
  constraint matchmaking_photos_upload_timestamps_check check (
    (upload_completed_at is null and uploaded_at is null and reviewed_at is null and reviewed_by is null)
    or (upload_completed_at is not null and uploaded_at is not null)
  ),
  constraint matchmaking_photos_review_timestamp_check check (
    reviewed_at is null or upload_completed_at is not null
  )
);

create unique index matchmaking_photos_active_user_order_uidx
  on public.matchmaking_photos(user_id, display_order)
  where deleted_at is null and display_order is not null;
create unique index matchmaking_photos_active_replacement_uidx
  on public.matchmaking_photos(user_id, replaces_photo_id)
  where deleted_at is null and replaces_photo_id is not null;
create index matchmaking_photos_review_queue_idx
  on public.matchmaking_photos(status, uploaded_at, id)
  where deleted_at is null and upload_completed_at is not null;
create index matchmaking_photos_user_active_idx
  on public.matchmaking_photos(user_id, display_order)
  where deleted_at is null;

create trigger matchmaking_photos_set_updated_at
before update on public.matchmaking_photos
for each row execute function public.set_updated_at();

create table public.matchmaking_photo_cleanup_queue (
  storage_path text primary key,
  queued_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  last_error_code text check (last_error_code is null or pg_catalog.length(last_error_code) <= 80)
);

comment on table public.matchmaking_photo_cleanup_queue is
  'Private retry queue for Storage objects, including auth-cascade cleanup. Drain only after the signed-upload token grace period.';

create function public._queue_matchmaking_photo_cleanup_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.matchmaking_photo_cleanup_queue(storage_path)
  values (old.storage_path) on conflict (storage_path) do nothing;
  return old;
end;
$function$;

create trigger matchmaking_photos_queue_storage_cleanup
after delete on public.matchmaking_photos
for each row execute function public._queue_matchmaking_photo_cleanup_after_delete();

alter table public.matchmaking_photos enable row level security;
alter table public.matchmaking_photo_cleanup_queue enable row level security;
revoke all privileges on table public.matchmaking_photos, public.matchmaking_photo_cleanup_queue
  from public, anon, authenticated, service_role;
grant select on table public.matchmaking_photos to service_role;
grant select, insert, update, delete on table public.matchmaking_photo_cleanup_queue to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('matchmaking-photos', 'matchmaking-photos', false, 3145728, array['image/webp']::text[])
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create function public._create_matchmaking_photo_upload_slot(
  p_user_id uuid,
  p_photo_id uuid,
  p_display_order smallint,
  p_storage_path text,
  p_replace_photo_id uuid default null
)
returns table(photo_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_status text;
  v_old_order smallint;
  v_active_count integer;
begin
  if p_user_id is null or p_photo_id is null or p_display_order is null or p_display_order not between 1 and 3
     or p_storage_path is distinct from p_user_id::text || '/' || p_photo_id::text || '.webp' then
    raise exception 'Invalid matchmaking photo upload request.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select account.account_status into v_account_status
  from public.users as account where account.id = p_user_id for update;
  if not found or v_account_status <> 'active'
     or not exists (
       select 1 from public.user_journeys as journey_row
       where journey_row.user_id = p_user_id
         and journey_row.journey_type = 'matchmaking'
         and journey_row.status = 'active'
     )
     or public.is_community_user_suspended(p_user_id) then
    raise exception 'An active Matchmaking journey is required to manage photos.' using errcode = '42501';
  end if;

  with expired_slots as (
    update public.matchmaking_photos as photo_row
    set deleted_at = now()
    where photo_row.user_id = p_user_id and photo_row.deleted_at is null
      and photo_row.upload_completed_at is null
      and photo_row.created_at < now() - interval '24 hours'
    returning photo_row.storage_path
  )
  insert into public.matchmaking_photo_cleanup_queue(storage_path)
  select expired_slots.storage_path from expired_slots
  on conflict (storage_path) do nothing;

  if p_replace_photo_id is not null then
    select photo_row.display_order into v_old_order
    from public.matchmaking_photos as photo_row
    where photo_row.id = p_replace_photo_id
      and photo_row.user_id = p_user_id
      and photo_row.deleted_at is null
      and photo_row.upload_completed_at is not null
      and photo_row.display_order = p_display_order
    for update;
    if v_old_order is null then
      raise exception 'The photo to replace is unavailable.' using errcode = 'P0002';
    end if;
  elsif exists (
    select 1 from public.matchmaking_photos as photo_row
    where photo_row.user_id = p_user_id and photo_row.display_order = p_display_order
      and photo_row.deleted_at is null
  ) then
    raise exception 'That photo position is already in use.' using errcode = '23505';
  end if;

  select pg_catalog.count(*)::integer into v_active_count
  from public.matchmaking_photos as photo_row
  where photo_row.user_id = p_user_id and photo_row.deleted_at is null
    and photo_row.display_order is not null;
  if p_replace_photo_id is null and v_active_count >= 3 then
    raise exception 'A maximum of three active matchmaking photos is allowed.' using errcode = '23514';
  end if;

  insert into public.matchmaking_photos (id, user_id, storage_path, display_order, replaces_photo_id)
  values (
    p_photo_id,
    p_user_id,
    p_storage_path,
    case when p_replace_photo_id is null then p_display_order else null end,
    p_replace_photo_id
  );

  return query select p_photo_id, p_storage_path;
end;
$function$;

create function public._finalize_matchmaking_photo_upload(
  p_user_id uuid,
  p_photo_id uuid,
  p_content_type text,
  p_size_bytes bigint
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
  if p_content_type is distinct from 'image/webp' or p_size_bytes is null
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
    values (v_old_path) on conflict (storage_path) do nothing;
  end if;

  update public.matchmaking_photos as photo_row
  set display_order = coalesce(v_old_order, photo_row.display_order),
      replaces_photo_id = null,
      upload_completed_at = now(), uploaded_at = now(), status = 'pending_review',
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

create function public.get_my_matchmaking_photos()
returns table(
  id uuid,
  display_order smallint,
  replaces_photo_id uuid,
  status text,
  upload_completed_at timestamptz,
  uploaded_at timestamptz,
  moderation_reason text,
  reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  return query
  select photo_row.id, photo_row.display_order, photo_row.replaces_photo_id, photo_row.status,
         photo_row.upload_completed_at, photo_row.uploaded_at,
         photo_row.moderation_reason, photo_row.reviewed_at
  from public.matchmaking_photos as photo_row
  where photo_row.user_id = v_user and photo_row.deleted_at is null
  order by photo_row.display_order, photo_row.created_at;
end;
$function$;

create function public.reorder_my_matchmaking_photos(p_photo_ids uuid[])
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_photo_ids is null or pg_catalog.cardinality(p_photo_ids) < 1 or pg_catalog.cardinality(p_photo_ids) > 3
     or (select pg_catalog.count(distinct item.photo_id) from pg_catalog.unnest(p_photo_ids) as item(photo_id)) <> pg_catalog.cardinality(p_photo_ids) then
    raise exception 'Provide each active photo exactly once in the requested order.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));
  if exists (select 1 from public.matchmaking_photos as photo_row
    where photo_row.user_id = v_user and photo_row.deleted_at is null and photo_row.upload_completed_at is null) then
    raise exception 'Finish or replace the pending upload before reordering photos.' using errcode = '22023';
  end if;
  select pg_catalog.count(*)::integer into v_count
  from public.matchmaking_photos as photo_row
  where photo_row.user_id = v_user and photo_row.deleted_at is null
    and photo_row.upload_completed_at is not null;
  if v_count <> pg_catalog.cardinality(p_photo_ids)
     or exists (
       select 1 from pg_catalog.unnest(p_photo_ids) as requested(photo_id)
       where not exists (select 1 from public.matchmaking_photos as photo_row
         where photo_row.id = requested.photo_id and photo_row.user_id = v_user
           and photo_row.deleted_at is null and photo_row.upload_completed_at is not null)
     ) then
    raise exception 'The requested photo order does not match your active photos.' using errcode = '22023';
  end if;

  -- Temporarily retire the rows inside this transaction so the partial unique
  -- slot index permits swaps. No other transaction can observe the interim state.
  update public.matchmaking_photos as photo_row
  set deleted_at = now()
  where photo_row.user_id = v_user and photo_row.deleted_at is null;

  update public.matchmaking_photos as photo_row
  set display_order = requested.ordinality::smallint
  from pg_catalog.unnest(p_photo_ids) with ordinality as requested(photo_id, ordinality)
  where photo_row.id = requested.photo_id and photo_row.user_id = v_user;

  update public.matchmaking_photos as photo_row
  set deleted_at = null
  where photo_row.user_id = v_user and photo_row.deleted_at is not null
    and photo_row.id = any(p_photo_ids);
  return true;
end;
$function$;

create function public._retire_matchmaking_photo(p_user_id uuid, p_photo_id uuid)
returns table(photo_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $function$
declare v_path text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  with retired_replacements as (
    update public.matchmaking_photos as replacement_row
    set deleted_at = now()
    where replacement_row.user_id = p_user_id
      and replacement_row.replaces_photo_id = p_photo_id
      and replacement_row.deleted_at is null
      and replacement_row.upload_completed_at is null
    returning replacement_row.storage_path
  )
  insert into public.matchmaking_photo_cleanup_queue(storage_path)
  select retired_replacements.storage_path from retired_replacements
  on conflict (storage_path) do nothing;

  update public.matchmaking_photos as photo_row
  set deleted_at = now()
  where photo_row.id = p_photo_id and photo_row.user_id = p_user_id
    and photo_row.deleted_at is null
  returning photo_row.id, photo_row.storage_path into photo_id, v_path;
  if photo_id is null then raise exception 'Photo not found.' using errcode = 'P0002'; end if;
  insert into public.matchmaking_photo_cleanup_queue(storage_path)
  values (v_path) on conflict (storage_path) do nothing;
  storage_path := v_path;
  return next;
end;
$function$;

create function public._get_matchmaking_photo_cleanup_paths(p_limit integer default 100)
returns table(storage_path text)
language sql
stable
security definer
set search_path = ''
as $function$
  select cleanup.storage_path
  from public.matchmaking_photo_cleanup_queue as cleanup
  -- Supabase signed upload URLs currently live for two hours; do not finish
  -- cleanup before an already-issued capability can no longer recreate a path.
  where cleanup.queued_at <= now() - interval '2 hours'
  order by cleanup.queued_at, cleanup.storage_path
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$function$;

create function public._complete_matchmaking_photo_cleanup(p_storage_path text, p_error_code text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_error_code = 'SIGNED_UPLOAD_GRACE' then
    update public.matchmaking_photo_cleanup_queue as cleanup
    set last_attempt_at = now(), last_error_code = p_error_code
    where cleanup.storage_path = p_storage_path;
  elsif p_error_code is null then
    delete from public.matchmaking_photo_cleanup_queue as cleanup
    where cleanup.storage_path = p_storage_path;
  else
    update public.matchmaking_photo_cleanup_queue as cleanup
    set attempts = cleanup.attempts + 1,
        last_attempt_at = now(),
        last_error_code = pg_catalog.left(p_error_code, 80)
    where cleanup.storage_path = p_storage_path;
  end if;
  return found;
end;
$function$;

create function public.get_admin_matchmaking_photo_review_queue(p_limit integer default 50)
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
    and photo_row.status = 'pending_review'
  order by photo_row.uploaded_at, photo_row.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$function$;

create function public.review_matchmaking_photo(p_photo_id uuid, p_decision text, p_reason text default null)
returns boolean
language plpgsql
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
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'Choose approve or reject.' using errcode = '22023';
  end if;
  if p_decision = 'reject' and (p_reason is null or pg_catalog.length(pg_catalog.btrim(p_reason)) = 0
      or pg_catalog.length(p_reason) > 500) then
    raise exception 'A concise reason is required when rejecting a photo.' using errcode = '22023';
  end if;
  update public.matchmaking_photos as photo_row
  set status = case p_decision when 'approve' then 'approved' else 'rejected' end,
      reviewed_at = now(), reviewed_by = v_actor,
      moderation_reason = case when p_decision = 'reject' then pg_catalog.btrim(p_reason) else null end
  where photo_row.id = p_photo_id and photo_row.deleted_at is null
    and photo_row.upload_completed_at is not null and photo_row.status = 'pending_review';
  if not found then raise exception 'Pending photo review item not found.' using errcode = 'P0002'; end if;
  return true;
end;
$function$;

revoke all on function public._create_matchmaking_photo_upload_slot(uuid,uuid,smallint,text,uuid) from public, anon, authenticated;
revoke all on function public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint) from public, anon, authenticated;
revoke all on function public._queue_matchmaking_photo_cleanup_after_delete() from public, anon, authenticated;
revoke all on function public._retire_matchmaking_photo(uuid,uuid) from public, anon, authenticated;
revoke all on function public._get_matchmaking_photo_cleanup_paths(integer) from public, anon, authenticated;
revoke all on function public._complete_matchmaking_photo_cleanup(text,text) from public, anon, authenticated;
grant execute on function public._create_matchmaking_photo_upload_slot(uuid,uuid,smallint,text,uuid) to service_role;
grant execute on function public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint) to service_role;
grant execute on function public._queue_matchmaking_photo_cleanup_after_delete() to service_role;
grant execute on function public._retire_matchmaking_photo(uuid,uuid) to service_role;
grant execute on function public._get_matchmaking_photo_cleanup_paths(integer) to service_role;
grant execute on function public._complete_matchmaking_photo_cleanup(text,text) to service_role;

revoke all on function public.get_my_matchmaking_photos() from public, anon, authenticated, service_role;
revoke all on function public.reorder_my_matchmaking_photos(uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_matchmaking_photo_review_queue(integer) from public, anon, authenticated, service_role;
revoke all on function public.review_matchmaking_photo(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.get_my_matchmaking_photos() to authenticated;
grant execute on function public.reorder_my_matchmaking_photos(uuid[]) to authenticated;
grant execute on function public.get_admin_matchmaking_photo_review_queue(integer) to authenticated;
grant execute on function public.review_matchmaking_photo(uuid,text,text) to authenticated;

do $postconditions$
begin
  if not exists (
    select 1 from pg_catalog.pg_class as relation_row
    join pg_catalog.pg_namespace as namespace_row on namespace_row.oid = relation_row.relnamespace
    where namespace_row.nspname = 'public' and relation_row.relname = 'matchmaking_photos'
      and relation_row.relrowsecurity
  ) then
    raise exception 'Postcondition failed: matchmaking photos RLS is not enabled.';
  end if;
  if pg_catalog.has_table_privilege('anon', 'public.matchmaking_photos', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photos', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photos', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photos', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photos', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photos', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photos', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photos', 'DELETE')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photos', 'TRUNCATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photos', 'TRUNCATE')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photos', 'REFERENCES')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photos', 'REFERENCES')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photos', 'TRIGGER')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photos', 'TRIGGER') then
    raise exception 'Postcondition failed: browser roles have direct matchmaking photo table privileges.';
  end if;
  if pg_catalog.has_table_privilege('service_role', 'public.matchmaking_photos', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.matchmaking_photos', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.matchmaking_photos', 'DELETE') then
    raise exception 'Postcondition failed: photo metadata mutations must use the private workflow RPCs.';
  end if;
  if pg_catalog.has_table_privilege('anon', 'public.matchmaking_photo_cleanup_queue', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photo_cleanup_queue', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photo_cleanup_queue', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photo_cleanup_queue', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photo_cleanup_queue', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photo_cleanup_queue', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photo_cleanup_queue', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photo_cleanup_queue', 'DELETE')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photo_cleanup_queue', 'TRUNCATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photo_cleanup_queue', 'TRUNCATE')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photo_cleanup_queue', 'REFERENCES')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photo_cleanup_queue', 'REFERENCES')
     or pg_catalog.has_table_privilege('anon', 'public.matchmaking_photo_cleanup_queue', 'TRIGGER')
     or pg_catalog.has_table_privilege('authenticated', 'public.matchmaking_photo_cleanup_queue', 'TRIGGER') then
    raise exception 'Postcondition failed: browser roles have direct photo-cleanup queue privileges.';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public._create_matchmaking_photo_upload_slot(uuid,uuid,smallint,text,uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public._create_matchmaking_photo_upload_slot(uuid,uuid,smallint,text,uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public._queue_matchmaking_photo_cleanup_after_delete()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public._queue_matchmaking_photo_cleanup_after_delete()', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public._retire_matchmaking_photo(uuid,uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public._retire_matchmaking_photo(uuid,uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public._get_matchmaking_photo_cleanup_paths(integer)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public._get_matchmaking_photo_cleanup_paths(integer)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public._complete_matchmaking_photo_cleanup(text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public._complete_matchmaking_photo_cleanup(text,text)', 'EXECUTE') then
    raise exception 'Postcondition failed: an internal photo workflow helper is browser-executable.';
  end if;
  if not pg_catalog.has_function_privilege('service_role', 'public._create_matchmaking_photo_upload_slot(uuid,uuid,smallint,text,uuid)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public._finalize_matchmaking_photo_upload(uuid,uuid,text,bigint)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public._retire_matchmaking_photo(uuid,uuid)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public._get_matchmaking_photo_cleanup_paths(integer)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public._complete_matchmaking_photo_cleanup(text,text)', 'EXECUTE') then
    raise exception 'Postcondition failed: trusted photo workflow execute grants are incomplete.';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.get_my_matchmaking_photos()', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.reorder_my_matchmaking_photos(uuid[])', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.get_admin_matchmaking_photo_review_queue(integer)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.review_matchmaking_photo(uuid,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.get_my_matchmaking_photos()', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.reorder_my_matchmaking_photos(uuid[])', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.get_admin_matchmaking_photo_review_queue(integer)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.review_matchmaking_photo(uuid,text,text)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.get_my_matchmaking_photos()', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.reorder_my_matchmaking_photos(uuid[])', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.get_admin_matchmaking_photo_review_queue(integer)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.review_matchmaking_photo(uuid,text,text)', 'EXECUTE') then
    raise exception 'Postcondition failed: photo RPC browser grants are incorrect.';
  end if;
  if pg_catalog.pg_get_function_result('public.get_my_matchmaking_photos()'::regprocedure) not like '%replaces_photo_id uuid%'
     or pg_catalog.pg_get_function_result('public.get_my_matchmaking_photos()'::regprocedure) like '%storage_path%'
     or pg_catalog.pg_get_function_result('public.get_my_matchmaking_photos()'::regprocedure) like '%reviewed_by%' then
    raise exception 'Postcondition failed: owner photo projection must include replacement identity and exclude storage/reviewer internals.';
  end if;
  if not exists (
    select 1 from storage.buckets as bucket_row
    where bucket_row.id = 'matchmaking-photos' and bucket_row.name = 'matchmaking-photos'
      and bucket_row.public is false and bucket_row.file_size_limit = 3145728
      and bucket_row.allowed_mime_types = array['image/webp']::text[]
  ) then
    raise exception 'Postcondition failed: private WebP photo bucket restrictions are incorrect.';
  end if;
  if exists (
    select 1 from pg_catalog.pg_policies as policy_row
    where policy_row.schemaname = 'storage' and policy_row.tablename = 'objects'
      and (
        policy_row.policyname like 'matchmaking_photos_%'
        or pg_catalog.strpos(coalesce(policy_row.qual, ''), 'matchmaking-photos') > 0
        or pg_catalog.strpos(coalesce(policy_row.with_check, ''), 'matchmaking-photos') > 0
        or pg_catalog.regexp_replace(coalesce(policy_row.qual, ''), '[()[:space:]]', '', 'g') = 'true'
        or pg_catalog.regexp_replace(coalesce(policy_row.with_check, ''), '[()[:space:]]', '', 'g') = 'true'
      )
  ) then
    raise exception 'Postcondition failed: a broad or matchmaking-photos Storage object policy exists.';
  end if;
  if pg_catalog.to_regprocedure('public.is_matchmaking_eligible(uuid)') is null
     or pg_catalog.to_regprocedure('public.get_matchmaking_profile(uuid)') is null then
    raise exception 'Postcondition failed: existing Matchmaking eligibility and profile RPCs are missing.';
  end if;
end;
$postconditions$;

commit;
