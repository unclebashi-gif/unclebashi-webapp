begin;

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text check (title is null or length(title) <= 200),
  body text not null check (length(btrim(body)) between 1 and 5000),
  is_anonymous boolean not null default false,
  status text not null default 'visible' check (status in ('visible','hidden','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  moderated_by uuid references auth.users(id),
  moderated_at timestamptz,
  moderation_reason text
);
create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 3000),
  status text not null default 'visible' check (status in ('visible','hidden','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  moderated_by uuid references auth.users(id),
  moderated_at timestamptz,
  moderation_reason text
);
create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.community_posts(id) on delete cascade,
  comment_id uuid references public.community_comments(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','abuse','sexual_content','misinformation','privacy','other')),
  details text check (details is null or length(details) <= 2000),
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed','actioned')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  check ((post_id is not null) <> (comment_id is not null)),
  check ((status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null))
);
create unique index community_reports_reporter_post_key
  on public.community_reports(reporter_id, post_id) where post_id is not null;
create unique index community_reports_reporter_comment_key
  on public.community_reports(reporter_id, comment_id) where comment_id is not null;
create table public.user_suspensions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  suspended_by uuid not null references auth.users(id),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check ((revoked_at is null and revoked_by is null) or (revoked_at is not null and revoked_by is not null)),
  check (ends_at is null or ends_at > starts_at)
);

create index community_posts_feed_idx on public.community_posts(created_at desc, id desc) where status='visible';
create index community_posts_author_idx on public.community_posts(author_id);
create index community_posts_status_idx on public.community_posts(status);
create index community_comments_post_status_created_idx on public.community_comments(post_id,status,created_at,id);
create index community_comments_author_idx on public.community_comments(author_id);
create index community_reports_pending_idx on public.community_reports(created_at,id) where status='pending';
create index community_reports_reporter_idx on public.community_reports(reporter_id);
create index user_suspensions_user_active_idx on public.user_suspensions(user_id,starts_at,ends_at) where revoked_at is null;

create trigger community_posts_set_updated_at before update on public.community_posts
for each row execute function public.set_updated_at();
create trigger community_comments_set_updated_at before update on public.community_comments
for each row execute function public.set_updated_at();

alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reports enable row level security;
alter table public.user_suspensions enable row level security;
revoke all on table public.community_posts, public.community_comments,
  public.community_reports, public.user_suspensions from public, anon, authenticated;
grant select on table public.community_reports to authenticated;

create function public.has_community_role(p_role text)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select auth.uid() is not null and exists (
    select 1 from public.user_roles r where r.user_id=auth.uid() and r.role=p_role
  );
$function$;
revoke all on function public.has_community_role(text) from public, anon, authenticated;
grant execute on function public.has_community_role(text) to authenticated;

create function public.is_community_user_suspended(p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.user_suspensions s where s.user_id=p_user_id
    and s.revoked_at is null and s.starts_at <= now()
    and (s.ends_at is null or s.ends_at > now())
  );
$function$;
revoke all on function public.is_community_user_suspended(uuid) from public, anon, authenticated;

create policy community_posts_visible_read on public.community_posts for select to authenticated
using (status='visible' or author_id=(select auth.uid()));
create policy community_comments_visible_read on public.community_comments for select to authenticated
using ((status='visible' and exists (
  select 1 from public.community_posts p where p.id=post_id and p.status='visible'
)) or author_id=(select auth.uid()));
create policy community_reports_read_scoped on public.community_reports for select to authenticated
using (reporter_id=(select auth.uid()) or public.has_community_role('moderator') or public.has_community_role('admin'));
create policy user_suspensions_admin_read on public.user_suspensions for select to authenticated
using (public.has_community_role('admin'));

create function public.create_community_post(p_title text,p_body text,p_is_anonymous boolean)
returns table(id uuid,title text,body text,is_anonymous boolean,status text,created_at timestamptz)
language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if public.is_community_user_suspended(v_user) then raise exception 'Account suspended' using errcode='42501'; end if;
  if p_body is null or length(btrim(p_body))=0 or length(p_body)>5000 then
    raise exception 'Post body must contain 1-5000 characters' using errcode='22023'; end if;
  if p_title is not null and length(p_title)>200 then raise exception 'Title too long' using errcode='22023'; end if;
  return query insert into public.community_posts as p(author_id,title,body,is_anonymous,status)
  values(v_user,nullif(btrim(p_title),''),p_body,coalesce(p_is_anonymous,false),'visible')
  returning p.id,p.title,p.body,p.is_anonymous,p.status,p.created_at;
end;
$function$;

create function public.create_community_comment(p_post_id uuid,p_body text)
returns table(id uuid,post_id uuid,body text,status text,created_at timestamptz)
language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if public.is_community_user_suspended(v_user) then raise exception 'Account suspended' using errcode='42501'; end if;
  if p_body is null or length(btrim(p_body))=0 or length(p_body)>3000 then
    raise exception 'Comment must contain 1-3000 characters' using errcode='22023'; end if;
  if not exists(select 1 from public.community_posts p where p.id=p_post_id and p.status='visible') then
    raise exception 'Post unavailable' using errcode='P0002'; end if;
  return query insert into public.community_comments as c(post_id,author_id,body,status)
  values(p_post_id,v_user,p_body,'visible') returning c.id,c.post_id,c.body,c.status,c.created_at;
end;
$function$;

create function public.report_community_content(
  p_post_id uuid default null,p_comment_id uuid default null,p_reason text default null,p_details text default null
) returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if (p_post_id is null)=(p_comment_id is null) then raise exception 'Report exactly one target' using errcode='22023'; end if;
  if p_reason not in ('spam','harassment','abuse','sexual_content','misinformation','privacy','other') then
    raise exception 'Invalid report reason' using errcode='22023'; end if;
  if p_details is not null and length(p_details)>2000 then raise exception 'Report details too long' using errcode='22023'; end if;
  if p_post_id is not null and not exists(select 1 from public.community_posts p where p.id=p_post_id and p.status='visible') then
    raise exception 'Post unavailable' using errcode='P0002'; end if;
  if p_comment_id is not null and not exists(
    select 1 from public.community_comments c join public.community_posts p on p.id=c.post_id
    where c.id=p_comment_id and c.status='visible' and p.status='visible'
  ) then raise exception 'Comment unavailable' using errcode='P0002'; end if;
  begin
    insert into public.community_reports(reporter_id,post_id,comment_id,reason,details)
    values(v_user,p_post_id,p_comment_id,p_reason,nullif(btrim(p_details),''))
    returning id into v_id;
  exception when unique_violation then raise exception 'Already reported' using errcode='23505';
  end;
  return v_id;
end;
$function$;

create function public.get_community_feed(
 p_limit integer default 20,p_cursor_created_at timestamptz default null,p_cursor_id uuid default null
) returns table(
 id uuid,title text,body text,is_anonymous boolean,status text,created_at timestamptz,updated_at timestamptz,
 comment_count bigint,author_display_name text,author_profile_image_url text
) language plpgsql stable security definer set search_path=''
as $function$
declare v_limit integer:=least(greatest(coalesce(p_limit,20),1),50);
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if (p_cursor_created_at is null)<>(p_cursor_id is null) then raise exception 'Supply both cursor values' using errcode='22023'; end if;
 return query select p.id,p.title,p.body,p.is_anonymous,p.status,p.created_at,p.updated_at,
  (select count(*) from public.community_comments c where c.post_id=p.id and c.status='visible'),
  case when p.is_anonymous then 'Anonymous' else coalesce(nullif(u.full_name,''),'Community member') end,
  case when p.is_anonymous then null else u.profile_image_url end
 from public.community_posts p left join public.users u on u.id=p.author_id
 where p.status='visible' and (p_cursor_created_at is null or (p.created_at,p.id)<(p_cursor_created_at,p_cursor_id))
 order by p.created_at desc,p.id desc limit v_limit;
end;
$function$;

create function public.get_community_comments(p_post_id uuid)
returns table(id uuid,post_id uuid,body text,status text,created_at timestamptz,
 is_anonymous boolean,author_display_name text,author_profile_image_url text)
language plpgsql stable security definer set search_path=''
as $function$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not exists(select 1 from public.community_posts p where p.id=p_post_id and p.status='visible') then
   raise exception 'Post unavailable' using errcode='P0002'; end if;
 return query select c.id,c.post_id,c.body,c.status,c.created_at,false,
  coalesce(nullif(u.full_name,''),'Community member'),u.profile_image_url
 from public.community_comments c left join public.users u on u.id=c.author_id
 where c.post_id=p_post_id and c.status='visible' order by c.created_at,c.id;
end;
$function$;

create function public.moderate_community_content(
 p_post_id uuid default null,p_comment_id uuid default null,p_action text default null,p_reason text default null
) returns table(target_id uuid,target_type text,status text,moderated_by uuid,moderated_at timestamptz)
language plpgsql security definer set search_path=''
as $function$
declare v_actor uuid:=auth.uid(); v_state text; v_id uuid; v_type text;
begin
 if v_actor is null or not(public.has_community_role('moderator') or public.has_community_role('admin')) then
   raise exception 'Moderator/admin role required' using errcode='42501'; end if;
 if (p_post_id is null)=(p_comment_id is null) then raise exception 'Moderate exactly one target' using errcode='22023'; end if;
 if p_action not in ('hide','remove','restore') then raise exception 'Invalid action' using errcode='22023'; end if;
 if p_reason is null or length(btrim(p_reason))=0 or length(p_reason)>1000 then raise exception 'Reason required' using errcode='22023'; end if;
 v_state:=case p_action when 'hide' then 'hidden' when 'remove' then 'removed' else 'visible' end;
 if p_post_id is not null then
   update public.community_posts p set status=v_state,moderated_by=v_actor,moderated_at=now(),moderation_reason=p_reason
   where p.id=p_post_id returning p.id into v_id; v_type:='post';
 else
   update public.community_comments c set status=v_state,moderated_by=v_actor,moderated_at=now(),moderation_reason=p_reason
   where c.id=p_comment_id returning c.id into v_id; v_type:='comment';
 end if;
 if v_id is null then raise exception 'Content not found' using errcode='P0002'; end if;
 return query select v_id,v_type,v_state,v_actor,now();
end;
$function$;

create function public.review_community_report(p_report_id uuid,p_status text,p_resolution_notes text default null)
returns table(id uuid,status text,reviewed_by uuid,reviewed_at timestamptz)
language plpgsql security definer set search_path=''
as $function$
declare v_actor uuid:=auth.uid();
begin
 if v_actor is null or not(public.has_community_role('moderator') or public.has_community_role('admin')) then
   raise exception 'Moderator/admin role required' using errcode='42501'; end if;
 if p_status not in ('reviewed','dismissed','actioned') then raise exception 'Invalid report status' using errcode='22023'; end if;
 if p_resolution_notes is not null and length(p_resolution_notes)>2000 then raise exception 'Notes too long' using errcode='22023'; end if;
 return query update public.community_reports r set status=p_status,reviewed_by=v_actor,reviewed_at=now(),
  resolution_notes=nullif(btrim(p_resolution_notes),'')
 where r.id=p_report_id and r.status='pending'
 returning r.id,r.status,r.reviewed_by,r.reviewed_at;
 if not found then raise exception 'Pending report not found' using errcode='P0002'; end if;
end;
$function$;

create function public.get_community_reports(p_limit integer default 50)
returns table(report_id uuid,target_type text,target_id uuid,target_author_id uuid,target_is_anonymous boolean,
 target_content text,reason text,details text,report_status text,reporter_display_name text,created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $function$
declare v_limit integer:=least(greatest(coalesce(p_limit,50),1),100);
begin
 if auth.uid() is null or not(public.has_community_role('moderator') or public.has_community_role('admin')) then
   raise exception 'Moderator/admin role required' using errcode='42501'; end if;
 return query select r.id,case when r.post_id is not null then 'post' else 'comment' end,
  coalesce(r.post_id,r.comment_id),coalesce(p.author_id,c.author_id),coalesce(p.is_anonymous,false),
  coalesce(p.body,c.body),r.reason,r.details,r.status,coalesce(nullif(u.full_name,''),'Community member'),r.created_at
 from public.community_reports r left join public.community_posts p on p.id=r.post_id
 left join public.community_comments c on c.id=r.comment_id
 left join public.users u on u.id=r.reporter_id
 where r.status='pending' order by r.created_at,r.id limit v_limit;
end;
$function$;

create function public.suspend_community_user(p_user_id uuid,p_reason text,p_ends_at timestamptz default null)
returns table(id uuid,user_id uuid,starts_at timestamptz,ends_at timestamptz)
language plpgsql security definer set search_path=''
as $function$
declare v_actor uuid:=auth.uid();
begin
 if v_actor is null or not public.has_community_role('admin') then raise exception 'Admin role required' using errcode='42501'; end if;
 if p_user_id is null or p_user_id=v_actor then raise exception 'Cannot suspend self' using errcode='22023'; end if;
 if p_reason is null or length(btrim(p_reason))=0 or length(p_reason)>1000 then raise exception 'Reason required' using errcode='22023'; end if;
 if p_ends_at is not null and p_ends_at<=now() then raise exception 'End time must be future' using errcode='22023'; end if;
 if public.is_community_user_suspended(p_user_id) then raise exception 'User already has an active suspension' using errcode='23505'; end if;
 return query insert into public.user_suspensions(user_id,suspended_by,reason,ends_at)
 values(p_user_id,v_actor,p_reason,p_ends_at)
 returning user_suspensions.id,user_suspensions.user_id,user_suspensions.starts_at,user_suspensions.ends_at;
end;
$function$;

create function public.revoke_community_suspension(p_suspension_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_actor uuid:=auth.uid(); v_id uuid;
begin
 if v_actor is null or not public.has_community_role('admin') then raise exception 'Admin role required' using errcode='42501'; end if;
 update public.user_suspensions s set revoked_at=now(),revoked_by=v_actor
 where s.id=p_suspension_id and s.revoked_at is null returning s.id into v_id;
 if v_id is null then raise exception 'Active suspension not found' using errcode='P0002'; end if;
 return v_id;
end;
$function$;

revoke all on function public.create_community_post(text,text,boolean) from public,anon,authenticated;
revoke all on function public.create_community_comment(uuid,text) from public,anon,authenticated;
revoke all on function public.report_community_content(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.get_community_feed(integer,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.get_community_comments(uuid) from public,anon,authenticated;
revoke all on function public.moderate_community_content(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.review_community_report(uuid,text,text) from public,anon,authenticated;
revoke all on function public.get_community_reports(integer) from public,anon,authenticated;
revoke all on function public.suspend_community_user(uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.revoke_community_suspension(uuid) from public,anon,authenticated;

grant execute on function public.create_community_post(text,text,boolean) to authenticated;
grant execute on function public.create_community_comment(uuid,text) to authenticated;
grant execute on function public.report_community_content(uuid,uuid,text,text) to authenticated;
grant execute on function public.get_community_feed(integer,timestamptz,uuid) to authenticated;
grant execute on function public.get_community_comments(uuid) to authenticated;
grant execute on function public.moderate_community_content(uuid,uuid,text,text) to authenticated;
grant execute on function public.review_community_report(uuid,text,text) to authenticated;
grant execute on function public.get_community_reports(integer) to authenticated;
grant execute on function public.suspend_community_user(uuid,text,timestamptz) to authenticated;
grant execute on function public.revoke_community_suspension(uuid) to authenticated;

commit;
