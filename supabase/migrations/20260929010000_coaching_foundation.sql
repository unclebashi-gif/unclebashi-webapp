begin;

create table public.coaches (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 display_name text not null check (length(btrim(display_name)) between 1 and 120),
 title text check (title is null or length(title)<=160),
 bio text check (bio is null or length(bio)<=5000),
 profile_image_url text,
 specialties text[] not null default '{}',
 languages text[] not null default '{}',
 country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
 city text check (city is null or length(city)<=120),
 is_active boolean not null default true,
 is_listed boolean not null default true,
 default_session_minutes integer not null default 45 check (default_session_minutes between 1 and 480),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.coaching_bookings (
 id uuid primary key default gen_random_uuid(),
 client_user_id uuid not null references auth.users(id) on delete cascade,
 coach_id uuid not null references public.coaches(id) on delete restrict,
 requested_start_at timestamptz not null,
 requested_timezone text not null check (length(btrim(requested_timezone)) between 1 and 100),
 duration_minutes integer not null check (duration_minutes between 1 and 480),
 client_note text check (client_note is null or length(client_note)<=3000),
 status text not null default 'pending' check (status in ('pending','confirmed','declined','cancelled','completed')),
 decision_by uuid references auth.users(id),
 decision_at timestamptz,
 cancelled_by uuid references auth.users(id),
 cancelled_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check ((decision_by is null)=(decision_at is null)),
 check ((status='cancelled' and cancelled_by is not null and cancelled_at is not null) or (status<>'cancelled' and cancelled_by is null and cancelled_at is null)),
 check ((status='completed' and completed_at is not null) or (status<>'completed' and completed_at is null))
);
create index coaches_listing_idx on public.coaches(is_active,is_listed,country_code,city);
create index coaching_bookings_client_idx on public.coaching_bookings(client_user_id,requested_start_at desc);
create index coaching_bookings_coach_idx on public.coaching_bookings(coach_id,requested_start_at desc);
create index coaching_bookings_status_idx on public.coaching_bookings(status,requested_start_at);
create index coaching_bookings_start_idx on public.coaching_bookings(requested_start_at);
create trigger coaches_set_updated_at before update on public.coaches for each row execute function public.set_updated_at();
create trigger coaching_bookings_set_updated_at before update on public.coaching_bookings for each row execute function public.set_updated_at();

alter table public.coaches enable row level security;
alter table public.coaching_bookings enable row level security;
revoke all on table public.coaches,public.coaching_bookings from public,anon,authenticated;
create policy coaches_listed_read on public.coaches for select to authenticated using(is_active and is_listed);
create policy coaching_bookings_party_read on public.coaching_bookings for select to authenticated using(
 client_user_id=(select auth.uid())
 or exists(select 1 from public.coaches c where c.id=coach_id and c.user_id=(select auth.uid()))
 or public.has_community_role('admin')
);

create function public.create_coach_profile(
 p_user_id uuid,p_display_name text,p_title text,p_bio text,p_profile_image_url text,
 p_specialties text[],p_languages text[],p_country_code text,p_city text,p_default_session_minutes integer
) returns setof public.coaches language plpgsql security definer set search_path=''
as $function$
begin
 if auth.uid() is null or not public.has_community_role('admin') then raise exception 'Admin role required' using errcode='42501'; end if;
 if p_user_id is null or not exists(select 1 from public.user_roles r where r.user_id=p_user_id and r.role='coach') then
  raise exception 'Target user must have coach role' using errcode='22023'; end if;
 if p_default_session_minutes is null or p_default_session_minutes not between 1 and 480 then raise exception 'Invalid session duration' using errcode='22023'; end if;
 return query insert into public.coaches as c(user_id,display_name,title,bio,profile_image_url,specialties,languages,country_code,city,default_session_minutes)
 values(p_user_id,p_display_name,p_title,p_bio,p_profile_image_url,coalesce(p_specialties,'{}'),coalesce(p_languages,'{}'),p_country_code,p_city,p_default_session_minutes)
 returning c.*;
end;
$function$;

create function public.update_coach_profile(
 p_coach_id uuid,p_display_name text,p_title text,p_bio text,p_profile_image_url text,
 p_specialties text[],p_languages text[],p_country_code text,p_city text,p_default_session_minutes integer,
 p_is_active boolean,p_is_listed boolean
) returns setof public.coaches language plpgsql security definer set search_path=''
as $function$
begin
 if auth.uid() is null or not public.has_community_role('admin') then raise exception 'Admin role required' using errcode='42501'; end if;
 if p_default_session_minutes is null or p_default_session_minutes not between 1 and 480 then raise exception 'Invalid session duration' using errcode='22023'; end if;
 return query update public.coaches c set display_name=p_display_name,title=p_title,bio=p_bio,
  profile_image_url=p_profile_image_url,specialties=coalesce(p_specialties,'{}'),languages=coalesce(p_languages,'{}'),
  country_code=p_country_code,city=p_city,default_session_minutes=p_default_session_minutes,
  is_active=coalesce(p_is_active,false),is_listed=coalesce(p_is_listed,false)
 where c.id=p_coach_id returning c.*;
 if not found then raise exception 'Coach profile not found' using errcode='P0002'; end if;
end;
$function$;

create function public.get_listed_coaches()
returns table(id uuid,display_name text,title text,bio text,profile_image_url text,specialties text[],languages text[],
 country_code text,city text,default_session_minutes integer)
language sql stable security definer set search_path=''
as $function$
 select c.id,c.display_name,c.title,c.bio,c.profile_image_url,c.specialties,c.languages,c.country_code,c.city,c.default_session_minutes
 from public.coaches c where c.is_active and c.is_listed order by c.display_name,c.id;
$function$;

create function public.get_coach_role_candidates()
returns table(user_id uuid,full_name text,profile_image_url text)
language plpgsql stable security definer set search_path=''
as $function$
begin
 if auth.uid() is null or not public.has_community_role('admin') then raise exception 'Admin role required' using errcode='42501'; end if;
 return query select u.id,u.full_name,u.profile_image_url from public.user_roles r join public.users u on u.id=r.user_id
 where r.role='coach' and not exists(select 1 from public.coaches c where c.user_id=r.user_id) order by u.full_name,u.id;
end;
$function$;

create function public.request_coaching_session(p_coach_id uuid,p_requested_start_at timestamptz,p_requested_timezone text,p_client_note text default null)
returns table(id uuid,coach_id uuid,coach_display_name text,requested_start_at timestamptz,requested_timezone text,
 duration_minutes integer,client_note text,status text,created_at timestamptz)
language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_duration integer;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_requested_start_at is null or p_requested_start_at<=now() then raise exception 'Requested time must be in the future' using errcode='22023'; end if;
 if p_requested_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=p_requested_timezone) then
  raise exception 'Valid IANA timezone required' using errcode='22023'; end if;
 if p_client_note is not null and length(p_client_note)>3000 then raise exception 'Client note too long' using errcode='22023'; end if;
 select c.default_session_minutes into v_duration from public.coaches c where c.id=p_coach_id and c.is_active and c.is_listed;
 if v_duration is null then raise exception 'Coach unavailable' using errcode='P0002'; end if;
 return query insert into public.coaching_bookings as b(client_user_id,coach_id,requested_start_at,requested_timezone,duration_minutes,client_note,status)
 values(v_user,p_coach_id,p_requested_start_at,p_requested_timezone,v_duration,nullif(btrim(p_client_note),''),'pending')
 returning b.id,b.coach_id,(select c.display_name from public.coaches c where c.id=b.coach_id),b.requested_start_at,
 b.requested_timezone,b.duration_minutes,b.client_note,b.status,b.created_at;
end;
$function$;

create function public.decide_coaching_booking(p_booking_id uuid,p_decision text)
returns text language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_status text;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_decision not in ('confirmed','declined') then raise exception 'Invalid decision' using errcode='22023'; end if;
 update public.coaching_bookings b set status=p_decision,decision_by=v_user,decision_at=now()
 where b.id=p_booking_id and b.status='pending' and (public.has_community_role('admin') or exists(
  select 1 from public.coaches c where c.id=b.coach_id and c.user_id=v_user)) returning b.status into v_status;
 if v_status is null then raise exception 'Pending booking not found or not assigned to caller' using errcode='42501'; end if;
 return v_status;
end;
$function$;

create function public.cancel_coaching_booking(p_booking_id uuid)
returns text language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_status text;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 update public.coaching_bookings b set status='cancelled',cancelled_by=v_user,cancelled_at=now()
 where b.id=p_booking_id and b.status in ('pending','confirmed') and (
  (b.client_user_id=v_user and b.requested_start_at>now()) or public.has_community_role('admin')
  or exists(select 1 from public.coaches c where c.id=b.coach_id and c.user_id=v_user))
 returning b.status into v_status;
 if v_status is null then raise exception 'Booking cannot be cancelled by caller' using errcode='42501'; end if;
 return v_status;
end;
$function$;

create function public.complete_coaching_booking(p_booking_id uuid)
returns text language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_status text;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 update public.coaching_bookings b set status='completed',completed_at=now()
 where b.id=p_booking_id and b.status='confirmed' and b.requested_start_at<=now()
 and (public.has_community_role('admin') or exists(select 1 from public.coaches c where c.id=b.coach_id and c.user_id=v_user))
 returning b.status into v_status;
 if v_status is null then raise exception 'Confirmed booking is not eligible for completion' using errcode='42501'; end if;
 return v_status;
end;
$function$;

create function public.get_my_coaching_bookings()
returns table(id uuid,is_client_booking boolean,coach_id uuid,coach_display_name text,coach_profile_image_url text,client_display_name text,client_profile_image_url text,
 requested_start_at timestamptz,requested_timezone text,duration_minutes integer,client_note text,status text,
 decision_at timestamptz,cancelled_at timestamptz,completed_at timestamptz,created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_admin boolean; v_coach boolean;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 v_admin:=public.has_community_role('admin'); v_coach:=public.has_community_role('coach');
 return query select b.id,(b.client_user_id=v_user),b.coach_id,c.display_name,c.profile_image_url,
  case when v_admin or v_coach then coalesce(u.full_name,'Member') else null end,
  case when v_admin or v_coach then u.profile_image_url else null end,
  b.requested_start_at,b.requested_timezone,b.duration_minutes,b.client_note,b.status,b.decision_at,b.cancelled_at,b.completed_at,b.created_at
 from public.coaching_bookings b join public.coaches c on c.id=b.coach_id
 left join public.users u on u.id=b.client_user_id
 where b.client_user_id=v_user or v_admin or (v_coach and c.user_id=v_user)
 order by b.requested_start_at desc,b.id desc;
end;
$function$;

create function public.get_admin_coaches()
returns table(id uuid,user_id uuid,display_name text,title text,bio text,profile_image_url text,specialties text[],languages text[],
 country_code text,city text,is_active boolean,is_listed boolean,default_session_minutes integer,created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $function$
begin
 if auth.uid() is null or not public.has_community_role('admin') then raise exception 'Admin role required' using errcode='42501'; end if;
 return query select c.id,c.user_id,c.display_name,c.title,c.bio,c.profile_image_url,c.specialties,c.languages,
 c.country_code,c.city,c.is_active,c.is_listed,c.default_session_minutes,c.created_at from public.coaches c order by c.display_name,c.id;
end;
$function$;

revoke all on function public.create_coach_profile(uuid,text,text,text,text,text[],text[],text,text,integer) from public,anon,authenticated;
revoke all on function public.update_coach_profile(uuid,text,text,text,text,text[],text[],text,text,integer,boolean,boolean) from public,anon,authenticated;
revoke all on function public.get_listed_coaches() from public,anon,authenticated;
revoke all on function public.get_coach_role_candidates() from public,anon,authenticated;
revoke all on function public.request_coaching_session(uuid,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.decide_coaching_booking(uuid,text) from public,anon,authenticated;
revoke all on function public.cancel_coaching_booking(uuid) from public,anon,authenticated;
revoke all on function public.complete_coaching_booking(uuid) from public,anon,authenticated;
revoke all on function public.get_my_coaching_bookings() from public,anon,authenticated;
revoke all on function public.get_admin_coaches() from public,anon,authenticated;
grant execute on function public.create_coach_profile(uuid,text,text,text,text,text[],text[],text,text,integer) to authenticated;
grant execute on function public.update_coach_profile(uuid,text,text,text,text,text[],text[],text,text,integer,boolean,boolean) to authenticated;
grant execute on function public.get_listed_coaches() to anon,authenticated;
grant execute on function public.get_coach_role_candidates() to authenticated;
grant execute on function public.request_coaching_session(uuid,timestamptz,text,text) to authenticated;
grant execute on function public.decide_coaching_booking(uuid,text) to authenticated;
grant execute on function public.cancel_coaching_booking(uuid) to authenticated;
grant execute on function public.complete_coaching_booking(uuid) to authenticated;
grant execute on function public.get_my_coaching_bookings() to authenticated;
grant execute on function public.get_admin_coaches() to authenticated;

commit;
