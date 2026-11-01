begin;

grant update (
  country_code,
  city
) on table public.users to authenticated;

do $postconditions$
begin
  if not pg_catalog.has_column_privilege('authenticated', 'public.users', 'country_code', 'UPDATE') then
    raise exception 'Postcondition failed: authenticated must be able to update users.country_code.';
  end if;
  if not pg_catalog.has_column_privilege('authenticated', 'public.users', 'city', 'UPDATE') then
    raise exception 'Postcondition failed: authenticated must be able to update users.city.';
  end if;
  if pg_catalog.has_column_privilege('authenticated', 'public.users', 'account_status', 'UPDATE') then
    raise exception 'Postcondition failed: authenticated must not be able to update users.account_status.';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.users', 'UPDATE') then
    raise exception 'Postcondition failed: authenticated must not have broad UPDATE on public.users.';
  end if;
end;
$postconditions$;

commit;