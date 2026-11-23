begin;

do $preconditions$
begin
  if pg_catalog.to_regclass('public.matchmaking_photos') is null
     or pg_catalog.to_regclass('public.matchmaking_profiles') is null
     or pg_catalog.to_regprocedure('public.get_matchmaking_profile(uuid)') is null then
    raise exception 'Precondition failed: matchmaking photo visibility dependencies are missing.';
  end if;
end;
$preconditions$;

create or replace function public.get_matchmaking_profile_photo_ids(p_profile_identifier uuid)
returns table(photo_id uuid, display_order smallint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  -- Reuse the caller-sensitive Matchmaking visibility boundary. It raises
  -- unless this target is currently visible to the authenticated member.
  perform public.get_matchmaking_profile(p_profile_identifier);

  return query
  select photo_row.id, photo_row.display_order
  from public.matchmaking_profiles as profile_row
  join public.matchmaking_photos as photo_row on photo_row.user_id = profile_row.user_id
  where profile_row.id = p_profile_identifier
    and photo_row.deleted_at is null
    and photo_row.upload_completed_at is not null
    and photo_row.status = 'approved'
    and photo_row.display_order between 1 and 3
  order by photo_row.display_order;
end;
$function$;

revoke all on function public.get_matchmaking_profile_photo_ids(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_matchmaking_profile_photo_ids(uuid)
  to authenticated;

do $postconditions$
begin
  if pg_catalog.to_regprocedure('public.get_matchmaking_profile_photo_ids(uuid)') is null then
    raise exception 'Postcondition failed: Matchmaking photo member projection is missing.';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.get_matchmaking_profile_photo_ids(uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.get_matchmaking_profile_photo_ids(uuid)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.get_matchmaking_profile_photo_ids(uuid)', 'EXECUTE') then
    raise exception 'Postcondition failed: Matchmaking photo member projection grants are incorrect.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_proc as function_row
    where function_row.oid = 'public.get_matchmaking_profile_photo_ids(uuid)'::regprocedure
      and function_row.prosecdef
      and exists (
        select 1
        from pg_catalog.unnest(coalesce(function_row.proconfig, array[]::text[])) as config(setting)
        where pg_catalog.replace(config.setting, '"', '') = 'search_path='
      )
  ) then
    raise exception 'Postcondition failed: Matchmaking photo member projection security configuration is incorrect.';
  end if;

  if pg_catalog.pg_get_function_result('public.get_matchmaking_profile_photo_ids(uuid)'::regprocedure)
       not like 'TABLE(photo_id uuid, display_order smallint)' then
    raise exception 'Postcondition failed: Matchmaking photo projection must return only photo ID and display order.';
  end if;

  if pg_catalog.to_regprocedure('public.is_matchmaking_eligible(uuid)') is null then
    raise exception 'Postcondition failed: existing Matchmaking eligibility function is missing.';
  end if;
end;
$postconditions$;

commit;
