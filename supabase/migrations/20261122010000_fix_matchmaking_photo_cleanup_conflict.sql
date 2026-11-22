begin;

do $preconditions$
begin
  if pg_catalog.to_regprocedure(
       'public._create_matchmaking_photo_upload_slot(uuid,uuid,smallint,text,uuid)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public._retire_matchmaking_photo(uuid,uuid)'
     ) is null
     or pg_catalog.to_regclass('public.matchmaking_photo_cleanup_queue') is null
     or not exists (
       select 1
       from pg_catalog.pg_constraint as constraint_row
       where constraint_row.conrelid = 'public.matchmaking_photo_cleanup_queue'::regclass
         and constraint_row.conname = 'matchmaking_photo_cleanup_queue_pkey'
         and constraint_row.contype = 'p'
     ) then
    raise exception 'Precondition failed: matchmaking photo cleanup functions or primary key are missing.';
  end if;
end;
$preconditions$;

create or replace function public._create_matchmaking_photo_upload_slot(
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
  on conflict on constraint matchmaking_photo_cleanup_queue_pkey do nothing;

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

create or replace function public._retire_matchmaking_photo(p_user_id uuid, p_photo_id uuid)
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
  on conflict on constraint matchmaking_photo_cleanup_queue_pkey do nothing;

  update public.matchmaking_photos as photo_row
  set deleted_at = now()
  where photo_row.id = p_photo_id and photo_row.user_id = p_user_id
    and photo_row.deleted_at is null
  returning photo_row.id, photo_row.storage_path into photo_id, v_path;
  if photo_id is null then raise exception 'Photo not found.' using errcode = 'P0002'; end if;
  insert into public.matchmaking_photo_cleanup_queue(storage_path)
  values (v_path) on conflict on constraint matchmaking_photo_cleanup_queue_pkey do nothing;
  storage_path := v_path;
  return next;
end;
$function$;

revoke all on function public._create_matchmaking_photo_upload_slot(uuid,uuid,smallint,text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public._retire_matchmaking_photo(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public._create_matchmaking_photo_upload_slot(uuid,uuid,smallint,text,uuid)
  to service_role;
grant execute on function public._retire_matchmaking_photo(uuid,uuid)
  to service_role;

do $postconditions$
declare
  v_create_oid oid := pg_catalog.to_regprocedure(
    'public._create_matchmaking_photo_upload_slot(uuid,uuid,smallint,text,uuid)'
  );
  v_retire_oid oid := pg_catalog.to_regprocedure(
    'public._retire_matchmaking_photo(uuid,uuid)'
  );
begin
  if v_create_oid is null or v_retire_oid is null then
    raise exception 'Postcondition failed: matchmaking photo cleanup functions are missing.';
  end if;

  if pg_catalog.has_function_privilege('anon', v_create_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_create_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_create_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_retire_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_retire_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_retire_oid, 'EXECUTE') then
    raise exception 'Postcondition failed: matchmaking photo cleanup function privileges are incorrect.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as function_row
    cross join lateral pg_catalog.aclexplode(
      coalesce(function_row.proacl, pg_catalog.acldefault('f', function_row.proowner))
    ) as acl_row
    where function_row.oid in (v_create_oid, v_retire_oid)
      and acl_row.grantee = 0
      and acl_row.privilege_type = 'EXECUTE'
  ) then
    raise exception 'Postcondition failed: PUBLIC has direct execute on a matchmaking photo cleanup function.';
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc as function_row
    where function_row.oid in (v_create_oid, v_retire_oid)
      and not function_row.prosecdef
  ) then
    raise exception 'Postcondition failed: matchmaking photo cleanup functions must remain SECURITY DEFINER.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as function_row
    where function_row.oid in (v_create_oid, v_retire_oid)
      and not exists (
        select 1
        from pg_catalog.unnest(coalesce(function_row.proconfig, array[]::text[])) as config(setting)
        where pg_catalog.replace(config.setting, '"', '') = 'search_path='
      )
  ) then
    raise exception 'Postcondition failed: matchmaking photo cleanup functions must retain an empty search_path.';
  end if;
end;
$postconditions$;

commit;
