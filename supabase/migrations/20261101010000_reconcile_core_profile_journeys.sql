begin;

do $preconditions$
begin
  if pg_catalog.to_regclass('public.users') is null
    or pg_catalog.to_regclass('public.user_journeys') is null then
    raise exception 'Required Core Profile or journey table is missing.';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_trigger as trigger_row
    join pg_catalog.pg_class as relation_row on relation_row.oid = trigger_row.tgrelid
    join pg_catalog.pg_namespace as schema_row on schema_row.oid = relation_row.relnamespace
    where schema_row.nspname = 'public'
      and relation_row.relname = 'users'
      and trigger_row.tgname = 'users_reconcile_journeys_after_core_status_update'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'Core Profile journey reconciliation trigger already exists.';
  end if;
end;
$preconditions$;

create or replace function public.reconcile_user_journeys_after_core_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not coalesce(
    new.legal_marital_status in ('never_married', 'divorced', 'widowed', 'annulled')
    and new.relationship_situation = 'single',
    false
  ) then
    update public.user_journeys as journey_row
    set status = 'paused',
        is_primary = false,
        completed_at = null,
        withdrawn_at = null
    where journey_row.user_id = new.id
      and journey_row.journey_type = 'matchmaking'
      and journey_row.status = 'active';
  end if;

  if not coalesce(
    new.legal_marital_status in ('married', 'separated')
    or new.relationship_situation in ('married', 'separated'),
    false
  ) then
    update public.user_journeys as journey_row
    set status = 'paused',
        is_primary = false,
        completed_at = null,
        withdrawn_at = null
    where journey_row.user_id = new.id
      and journey_row.journey_type = 'marriage_support'
      and journey_row.status = 'active';
  end if;

  return new;
end;
$function$;

revoke all on function public.reconcile_user_journeys_after_core_profile_change()
  from public, anon, authenticated;

create trigger users_reconcile_journeys_after_core_status_update
after update of legal_marital_status, relationship_situation on public.users
for each row
when (
  old.legal_marital_status is distinct from new.legal_marital_status
  or old.relationship_situation is distinct from new.relationship_situation
)
execute function public.reconcile_user_journeys_after_core_profile_change();

-- Reconcile already-active journeys that conflict with the current Core Profile.
update public.user_journeys as journey_row
set status = 'paused',
    is_primary = false,
    completed_at = null,
    withdrawn_at = null
from public.users as profile
where profile.id = journey_row.user_id
  and journey_row.status = 'active'
  and (
    (
      journey_row.journey_type = 'matchmaking'
      and not coalesce(
        profile.legal_marital_status in ('never_married', 'divorced', 'widowed', 'annulled')
        and profile.relationship_situation = 'single',
        false
      )
    )
    or
    (
      journey_row.journey_type = 'marriage_support'
      and not coalesce(
        profile.legal_marital_status in ('married', 'separated')
        or profile.relationship_situation in ('married', 'separated'),
        false
      )
    )
  );

do $postconditions$
declare
  v_function_oid oid;
  v_function_security_definer boolean;
  v_function_config text[];
begin
  select procedure_row.oid, procedure_row.prosecdef, procedure_row.proconfig
    into v_function_oid, v_function_security_definer, v_function_config
  from pg_catalog.pg_proc as procedure_row
  join pg_catalog.pg_namespace as schema_row on schema_row.oid = procedure_row.pronamespace
  where schema_row.nspname = 'public'
    and procedure_row.proname = 'reconcile_user_journeys_after_core_profile_change'
    and procedure_row.pronargs = 0;

  if v_function_oid is null then
    raise exception 'Postcondition failed: journey reconciliation trigger function is missing.';
  end if;
  if v_function_security_definer is not true then
    raise exception 'Postcondition failed: journey reconciliation function must be SECURITY DEFINER.';
  end if;
  if not exists (
    select 1
    from pg_catalog.unnest(coalesce(v_function_config, array[]::text[])) as config(setting)
    where pg_catalog.replace(config.setting, '"', '') = 'search_path='
  ) then
    raise exception 'Postcondition failed: journey reconciliation function search_path must be empty.';
  end if;
  if pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE') then
    raise exception 'Postcondition failed: browser roles must not directly execute the trigger function.';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_row
    join pg_catalog.pg_class as relation_row on relation_row.oid = trigger_row.tgrelid
    join pg_catalog.pg_namespace as schema_row on schema_row.oid = relation_row.relnamespace
    where schema_row.nspname = 'public'
      and relation_row.relname = 'users'
      and trigger_row.tgname = 'users_reconcile_journeys_after_core_status_update'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
  ) then
    raise exception 'Postcondition failed: Core Profile journey reconciliation trigger is missing or disabled.';
  end if;
end;
$postconditions$;

commit;