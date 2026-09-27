-- Save the authenticated user's detailed onboarding progress without
-- requiring UPDATE privilege on the conflict key (user_id).
begin;

create function public.save_onboarding_data(p_onboarding_data jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required to save onboarding data.'
      using errcode = '42501';
  end if;

  if p_onboarding_data is null or jsonb_typeof(p_onboarding_data) is distinct from 'object' then
    raise exception 'Onboarding data must be a JSON object.'
      using errcode = '22023';
  end if;

  insert into public.user_onboarding_data (user_id, onboarding_data)
  values (v_user_id, p_onboarding_data)
  on conflict (user_id) do update
    set onboarding_data = excluded.onboarding_data;
end;
$function$;

revoke all on function public.save_onboarding_data(jsonb)
  from public, anon, authenticated;
grant execute on function public.save_onboarding_data(jsonb)
  to authenticated;

commit;
