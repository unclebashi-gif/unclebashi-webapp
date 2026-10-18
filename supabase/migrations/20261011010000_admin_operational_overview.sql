-- Protected operational overview and least-privilege administrator user list.
begin;

create or replace function public.get_admin_overview()
returns table (
  total_users bigint,
  onboarded_users bigint,
  published_courses bigint,
  active_enrollments bigint,
  pending_community_reports bigint,
  pending_matchmaking_reviews bigint,
  listed_coaches bigint,
  pending_coaching_bookings bigint,
  successful_payments bigint,
  failed_payments bigint,
  verified_payment_volume_ugx bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.user_roles as role_row
    where role_row.user_id = auth.uid()
      and role_row.role = 'admin'
  ) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from auth.users)::bigint,
    (select count(*) from public.users as profile where profile.onboarding_completed)::bigint,
    (select count(*) from public.courses as course where course.status = 'published')::bigint,
    (select count(*) from public.course_enrollments as enrollment where enrollment.status = 'active')::bigint,
    (select count(*) from public.community_reports as report where report.status = 'pending')::bigint,
    (select count(*) from public.matchmaking_profiles as profile where profile.status = 'pending_review')::bigint,
    (select count(*) from public.coaches as coach where coach.is_active and coach.is_listed)::bigint,
    (select count(*) from public.coaching_bookings as booking where booking.status = 'pending')::bigint,
    (select count(*) from public.payments as payment where payment.status = 'successful')::bigint,
    (select count(*) from public.payments as payment where payment.status = 'failed')::bigint,
    coalesce((
      select sum(payment.amount)
      from public.payments as payment
      where payment.status = 'successful'
        and payment.currency = 'UGX'
    ), 0)::bigint;
end;
$$;

revoke all on function public.get_admin_overview() from public, anon, authenticated;
grant execute on function public.get_admin_overview() to authenticated;

create or replace function public.get_admin_users(
  p_search text default null,
  p_limit integer default 50,
  p_before timestamptz default null,
  p_before_user_id uuid default null
)
returns table (
  user_id uuid,
  full_name text,
  email text,
  created_at timestamptz,
  onboarding_completed boolean,
  gender text,
  country_code text,
  city text,
  roles text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(p_search), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.user_roles as role_row
    where role_row.user_id = auth.uid()
      and role_row.role = 'admin'
  ) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'p_limit must be between 1 and 100.' using errcode = '22023';
  end if;

  if v_search is not null and length(v_search) > 200 then
    raise exception 'Search text is too long.' using errcode = '22023';
  end if;

  return query
  select
    auth_row.id,
    coalesce(profile.full_name, '')::text,
    coalesce(auth_row.email::text, '')::text,
    auth_row.created_at,
    coalesce(profile.onboarding_completed, false),
    profile.gender::text,
    profile.country_code::text,
    profile.city::text,
    coalesce(
      array_agg(role_row.role order by role_row.role) filter (where role_row.role is not null),
      array[]::text[]
    )
  from auth.users as auth_row
  left join public.users as profile on profile.id = auth_row.id
  left join public.user_roles as role_row on role_row.user_id = auth_row.id
  where (
    v_search is null
    or coalesce(profile.full_name, '') ilike '%' || v_search || '%'
    or coalesce(auth_row.email::text, '') ilike '%' || v_search || '%'
    or coalesce(profile.country_code, '') ilike '%' || v_search || '%'
    or coalesce(profile.city, '') ilike '%' || v_search || '%'
  )
    and (
      p_before is null
      or (p_before_user_id is not null and (auth_row.created_at, auth_row.id) < (p_before, p_before_user_id))
      or (p_before_user_id is null and auth_row.created_at < p_before)
    )
  group by auth_row.id, auth_row.email, auth_row.created_at,
    profile.full_name, profile.onboarding_completed, profile.gender,
    profile.country_code, profile.city
  order by auth_row.created_at desc, auth_row.id desc
  limit p_limit;
end;
$$;

revoke all on function public.get_admin_users(text, integer, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.get_admin_users(text, integer, timestamptz, uuid) to authenticated;

commit;
