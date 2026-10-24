begin;

do $preconditions$
begin
  if to_regclass('public.course_enrollments') is null then
    raise exception 'Required table public.course_enrollments is missing.';
  end if;
  if to_regclass('public.courses') is null then
    raise exception 'Required table public.courses is missing.';
  end if;
  if to_regclass('public.user_roles') is null then
    raise exception 'Required table public.user_roles is missing.';
  end if;
  if to_regclass('public.users') is null then
    raise exception 'Required table public.users is missing.';
  end if;
  if to_regprocedure('public.refresh_course_progress(uuid)') is null then
    raise exception 'Required function public.refresh_course_progress(uuid) is missing.';
  end if;
  if to_regprocedure('public.is_course_audience_eligible(uuid)') is null then
    raise exception 'Required function public.is_course_audience_eligible(uuid) is missing.';
  end if;
  if not exists (
    select 1
    from pg_constraint as constraint_row
    where constraint_row.conrelid = to_regclass('public.course_enrollments')
      and constraint_row.conname = 'course_enrollments_user_course_key'
      and constraint_row.contype = 'u'
  ) then
    raise exception 'Required unique constraint course_enrollments_user_course_key is missing.';
  end if;
end;
$preconditions$;

create or replace function public.enroll_in_free_course(p_course_id uuid)
returns table (
  enrollment_id uuid,
  course_id uuid,
  status text,
  access_source text,
  enrolled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_is_free boolean;
  v_course_status text;
  v_enrollment public.course_enrollments%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to enroll.' using errcode = '42501';
  end if;

  select course_row.is_free, course_row.status
    into v_is_free, v_course_status
    from public.courses as course_row
    where course_row.id = p_course_id;

  if not found then
    raise exception 'Course not found.' using errcode = 'P0002';
  end if;
  if v_course_status <> 'published' then
    raise exception 'Course is not published.' using errcode = '42501';
  end if;
  if not public.is_course_audience_eligible(p_course_id) then
    raise exception 'EDUCATION_AUDIENCE_INELIGIBLE' using errcode = '42501';
  end if;
  if not v_is_free then
    raise exception 'This course requires an authorized access grant.' using errcode = '42501';
  end if;

  insert into public.course_enrollments as existing (
    user_id, course_id, status, access_source
  ) values (
    v_user_id, p_course_id, 'active', 'free'
  )
  on conflict on constraint course_enrollments_user_course_key do update set
    status = 'active',
    access_source = case when existing.status = 'active'
      then existing.access_source else 'free' end,
    enrolled_at = case when existing.status = 'active'
      then existing.enrolled_at else now() end,
    revoked_at = null,
    updated_at = now()
  returning existing.* into v_enrollment;

  perform public.refresh_course_progress(v_enrollment.id);

  return query select v_enrollment.id, v_enrollment.course_id,
    v_enrollment.status, v_enrollment.access_source, v_enrollment.enrolled_at;
end;
$function$;

revoke all on function public.enroll_in_free_course(uuid)
  from public, anon, authenticated;
grant execute on function public.enroll_in_free_course(uuid)
  to authenticated;

do $postconditions$
declare
  function_row record;
begin
  select procedure_row.prosecdef, procedure_row.proconfig
    into function_row
    from pg_proc as procedure_row
    join pg_namespace as namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'enroll_in_free_course'
      and pg_get_function_identity_arguments(procedure_row.oid) = 'p_course_id uuid';

  if not found then
    raise exception 'Postcondition failed: public.enroll_in_free_course(uuid) is missing.';
  end if;
  if not function_row.prosecdef then
    raise exception 'Postcondition failed: enroll_in_free_course must remain SECURITY DEFINER.';
  end if;
  if not exists (
    select 1
    from pg_catalog.unnest(
      coalesce(function_row.proconfig, array[]::text[])
    ) as config(setting)
    where pg_catalog.replace(config.setting, '"', '') = 'search_path='
  ) then
    raise exception 'Postcondition failed: enroll_in_free_course search_path must remain empty.';
  end if;
  if not has_function_privilege('authenticated', 'public.enroll_in_free_course(uuid)', 'EXECUTE') then
    raise exception 'Postcondition failed: authenticated must be able to execute enroll_in_free_course(uuid).';
  end if;
  if has_function_privilege('anon', 'public.enroll_in_free_course(uuid)', 'EXECUTE') then
    raise exception 'Postcondition failed: anon must not be able to execute enroll_in_free_course(uuid).';
  end if;
end;
$postconditions$;

commit;