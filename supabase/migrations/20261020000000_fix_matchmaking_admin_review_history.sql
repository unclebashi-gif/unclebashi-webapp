begin;

create function public.get_matchmaking_admin_review_history()
returns table (
  user_id uuid,
  status text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or not public.has_community_role('admin') then
    raise exception 'Admin role required'
      using errcode = '42501';
  end if;

  return query
  select
    p.user_id,
    p.status,
    p.reviewed_by,
    p.reviewed_at,
    p.review_notes
  from public.matchmaking_profiles as p
  where p.status in ('approved', 'rejected', 'hidden')
    and p.reviewed_at is not null
  order by p.reviewed_at desc, p.user_id;
end;
$function$;

revoke all
on function public.get_matchmaking_admin_review_history()
from public, anon, authenticated;

grant execute
on function public.get_matchmaking_admin_review_history()
to authenticated;

commit;