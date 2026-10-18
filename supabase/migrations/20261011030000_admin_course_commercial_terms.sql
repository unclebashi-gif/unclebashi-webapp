begin;

-- Authenticated admin content editing keeps only noncommercial columns.
-- Financial terms are writable solely through the admin-authorized RPC below.
revoke insert, update on table public.courses from authenticated;
grant insert (slug, title, description, category, thumbnail_url, status, display_order)
  on table public.courses to authenticated;
grant update (slug, title, description, category, thumbnail_url, status, display_order)
  on table public.courses to authenticated;

do $check_course_commercial_privileges$
begin
  if pg_catalog.has_column_privilege('authenticated', 'public.courses', 'is_free', 'INSERT')
     or pg_catalog.has_column_privilege('authenticated', 'public.courses', 'is_free', 'UPDATE')
     or pg_catalog.has_column_privilege('authenticated', 'public.courses', 'price_amount', 'INSERT')
     or pg_catalog.has_column_privilege('authenticated', 'public.courses', 'price_amount', 'UPDATE')
     or pg_catalog.has_column_privilege('authenticated', 'public.courses', 'currency', 'INSERT')
     or pg_catalog.has_column_privilege('authenticated', 'public.courses', 'currency', 'UPDATE') then
    raise exception 'authenticated must not directly change course commercial terms';
  end if;
end;
$check_course_commercial_privileges$;

create or replace function public.get_admin_course_commercial_terms()
returns table (
  course_id uuid,
  slug text,
  title text,
  status text,
  is_free boolean,
  price_amount bigint,
  currency text,
  audience_gender text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.user_roles as role_row
    where role_row.user_id = auth.uid()
      and role_row.role = 'admin'
  ) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  return query
    select course_row.id,
      course_row.slug::text,
      course_row.title::text,
      course_row.status::text,
      course_row.is_free,
      course_row.price_amount,
      course_row.currency::text,
      course_row.audience_gender::text,
      course_row.updated_at
    from public.courses as course_row
    order by course_row.display_order, course_row.title, course_row.id;
end;
$function$;

create or replace function public.admin_update_course_commercial_terms(
  p_course_id uuid,
  p_is_free boolean,
  p_price_amount bigint,
  p_currency text
)
returns table (
  course_id uuid,
  is_free boolean,
  price_amount bigint,
  currency text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_course public.courses%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.user_roles as role_row
    where role_row.user_id = auth.uid()
      and role_row.role = 'admin'
  ) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_course_id is null or p_is_free is null then
    raise exception 'Course and access type are required.' using errcode = '22023';
  end if;

  if p_is_free then
    if p_price_amount is not null and p_price_amount <> 0 then
      raise exception 'Free courses cannot have a positive price.' using errcode = '22023';
    end if;
    if p_currency is not null and pg_catalog.upper(pg_catalog.btrim(p_currency)) <> 'UGX' then
      raise exception 'Free course currency must be UGX or null.' using errcode = '22023';
    end if;
  else
    if p_price_amount is null or p_price_amount <= 0 then
      raise exception 'Paid courses require a positive whole-unit price.' using errcode = '22023';
    end if;
    if p_currency is null or pg_catalog.upper(pg_catalog.btrim(p_currency)) <> 'UGX' then
      raise exception 'Paid courses must use UGX.' using errcode = '22023';
    end if;
  end if;

  select * into v_course
  from public.courses as course_row
  where course_row.id = p_course_id
  for update;
  if not found then
    raise exception 'Course not found.' using errcode = 'P0002';
  end if;

  update public.courses as course_row
  set is_free = p_is_free,
      price_amount = case when p_is_free then null else p_price_amount end,
      currency = case when p_is_free then null else 'UGX' end
  where course_row.id = p_course_id
  returning course_row.id, course_row.is_free, course_row.price_amount,
    course_row.currency, course_row.updated_at
  into course_id, is_free, price_amount, currency, updated_at;

  return next;
end;
$function$;

revoke all on function public.get_admin_course_commercial_terms()
  from public, anon, authenticated;
grant execute on function public.get_admin_course_commercial_terms()
  to authenticated;

revoke all on function public.admin_update_course_commercial_terms(uuid, boolean, bigint, text)
  from public, anon, authenticated;
grant execute on function public.admin_update_course_commercial_terms(uuid, boolean, bigint, text)
  to authenticated;

commit;
