begin;

create or replace function public.get_admin_payments(
  p_limit integer default 50,
  p_before timestamptz default null
)
returns table (
  payment_id uuid,
  created_at timestamptz,
  customer_name text,
  customer_email text,
  course_id uuid,
  course_title text,
  amount bigint,
  currency text,
  provider text,
  payer_msisdn_masked text,
  status text,
  provider_reference uuid,
  verified_at timestamptz,
  access_granted_at timestamptz,
  failure_reason text
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles as role_row
    where role_row.user_id = auth.uid() and role_row.role = 'admin'
  ) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Limit must be between 1 and 100.' using errcode = '22023';
  end if;
  return query
    select payment_row.id, payment_row.created_at,
      coalesce(nullif(btrim(profile_row.full_name), ''), 'User'),
      auth_row.email::text, payment_row.course_id, course_row.title,
      payment_row.amount, payment_row.currency, payment_row.provider,
      payment_row.payer_msisdn_masked, payment_row.status,
      payment_row.provider_reference, payment_row.verified_at,
      payment_row.access_granted_at, payment_row.failure_reason
    from public.payments as payment_row
    join public.courses as course_row on course_row.id = payment_row.course_id
    left join public.users as profile_row on profile_row.id = payment_row.user_id
    left join auth.users as auth_row on auth_row.id = payment_row.user_id
    where p_before is null or payment_row.created_at < p_before
    order by payment_row.created_at desc, payment_row.id desc
    limit p_limit;
end;
$function$;

revoke all on function public.get_admin_payments(integer, timestamptz)
  from public, anon, authenticated;

grant execute on function public.get_admin_payments(integer, timestamptz)
  to authenticated;

commit;
