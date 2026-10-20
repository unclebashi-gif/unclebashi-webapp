begin;

-- The existing courses_admin_insert/update RLS policies independently require
-- user_roles.role = 'admin'. Add only the audience column needed by the native
-- course manager; commercial columns remain RPC-only.
grant insert (audience_gender) on table public.courses to authenticated;
grant update (audience_gender) on table public.courses to authenticated;

do $check_course_manager_privileges$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'courses'
      and policyname = 'courses_admin_insert'
      and cmd = 'INSERT'
  ) or not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'courses'
      and policyname = 'courses_admin_update'
      and cmd = 'UPDATE'
  ) then
    raise exception 'The existing admin-only course RLS policies are required.';
  end if;

  if not pg_catalog.has_column_privilege('authenticated', 'public.courses', 'audience_gender', 'INSERT')
     or not pg_catalog.has_column_privilege('authenticated', 'public.courses', 'audience_gender', 'UPDATE') then
    raise exception 'Authenticated admins require audience_gender column privileges.';
  end if;

  if pg_catalog.has_column_privilege('authenticated', 'public.courses', 'is_free', 'INSERT')
     or pg_catalog.has_column_privilege('authenticated', 'public.courses', 'is_free', 'UPDATE')
     or pg_catalog.has_column_privilege('authenticated', 'public.courses', 'price_amount', 'INSERT')
     or pg_catalog.has_column_privilege('authenticated', 'public.courses', 'price_amount', 'UPDATE')
     or pg_catalog.has_column_privilege('authenticated', 'public.courses', 'currency', 'INSERT')
     or pg_catalog.has_column_privilege('authenticated', 'public.courses', 'currency', 'UPDATE') then
    raise exception 'Course commercial terms must remain protected by the admin RPC.';
  end if;
end;
$check_course_manager_privileges$;

commit;
