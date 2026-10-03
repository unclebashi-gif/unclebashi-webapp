begin;

-- Platform gender rule derives solely from public.users.gender.
create function public.assert_matchmaking_opposite_gender(p_profile_identifier uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not exists (
    select 1
    from public.matchmaking_profiles target_profile
    join public.users target_user on target_user.id = target_profile.user_id
    join public.users caller on caller.id = v_user
    where target_profile.id = p_profile_identifier
      and caller.gender in ('male','female')
      and target_user.gender = case caller.gender when 'female' then 'male' when 'male' then 'female' else null end
  ) then
    raise exception 'Profile unavailable' using errcode='P0002';
  end if;
end;
$function$;

-- Keep the legacy preference column populated from authoritative account gender.
update public.matchmaking_preferences preference
set preferred_partner_gender = case account.gender when 'female' then 'male' when 'male' then 'female' else null end
from public.users account
where account.id = preference.user_id;

create function public.derive_matchmaking_partner_gender()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare v_gender text;
begin
  select account.gender into v_gender
  from public.users account
  where account.id = new.user_id;
  new.preferred_partner_gender := case v_gender when 'female' then 'male' when 'male' then 'female' else null end;
  return new;
end;
$function$;

drop trigger if exists matchmaking_preferences_partner_gender_before_write on public.matchmaking_preferences;
create trigger matchmaking_preferences_partner_gender_before_write
before insert or update of user_id, preferred_partner_gender
on public.matchmaking_preferences
for each row execute function public.derive_matchmaking_partner_gender();
create or replace function public.get_matchmaking_discovery(p_limit integer default 20,p_cursor_created_at timestamptz default null,p_cursor_user_id uuid default null)
returns table(profile_identifier uuid,age integer,gender text,nationality_country_code text,country_of_origin_code text,
 country_code text,city text,introduction text,education_level text,occupation text,marital_status text,has_children boolean,
 wants_children text,languages text[],interests text[],willing_to_relocate text,values_assessment text[],
 profile_image_url text,religion_or_faith text,cultural_or_ethnic_community text,created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_limit integer:=least(greatest(coalesce(p_limit,20),1),50); v_cursor_tier integer;
begin
 if v_user is null or not public.is_matchmaking_eligible(v_user) then raise exception 'Eligible matchmaking profile required' using errcode='42501'; end if;
 if (p_cursor_created_at is null)<>(p_cursor_user_id is null) then raise exception 'Supply both cursor values' using errcode='22023'; end if;
 if p_cursor_user_id is not null then
  select case when (pref.origin_mode='preferred' and p.country_of_origin_code=any(pref.preferred_origins))
                  or (pref.nationality_mode='preferred' and p.nationality_country_code=any(pref.preferred_nationalities)) then 0
              when (pref.residence_mode='preferred' and u.country_code=any(pref.preferred_residences))
                  or (pref.city_mode='preferred' and u.city=any(pref.preferred_cities)) then 1 else 2 end
   into v_cursor_tier
   from public.matchmaking_profiles p join public.users u on u.id=p.user_id
   cross join public.matchmaking_preferences pref
   where p.id=p_cursor_user_id and pref.user_id=v_user;
  if v_cursor_tier is null then raise exception 'Invalid discovery cursor' using errcode='22023'; end if;
 end if;
 return query
 select p.id,extract(year from age(current_date,u.date_of_birth))::integer,u.gender,p.nationality_country_code,p.country_of_origin_code,
  u.country_code,u.city,p.introduction,p.education_level,coalesce(p.industry,u.occupation),p.marital_status,p.has_children,p.wants_children,p.languages,p.interests,
  p.willing_to_relocate,coalesce(u.values_assessment,'{}'::text[]),
  case when p.use_profile_image_for_matchmaking then u.profile_image_url else null end,
  case when p.show_religion then p.religion_or_faith else null end,
  case when p.show_cultural_community then p.cultural_or_ethnic_community else null end,p.created_at
 from public.matchmaking_profiles p
 join public.users u on u.id=p.user_id
 join public.matchmaking_preferences f on f.user_id=p.user_id
 where p.user_id<>v_user and public.is_matchmaking_eligible(p.user_id)
  and (p_cursor_created_at is null
    or (case when exists(select 1 from public.matchmaking_preferences pref where pref.user_id=v_user and
                         ((pref.origin_mode='preferred' and p.country_of_origin_code=any(pref.preferred_origins))
                          or (pref.nationality_mode='preferred' and p.nationality_country_code=any(pref.preferred_nationalities)))) then 0
             when exists(select 1 from public.matchmaking_preferences pref where pref.user_id=v_user and
                         ((pref.residence_mode='preferred' and u.country_code=any(pref.preferred_residences))
                          or (pref.city_mode='preferred' and u.city=any(pref.preferred_cities)))) then 1 else 2 end)>v_cursor_tier
    or ((case when exists(select 1 from public.matchmaking_preferences pref where pref.user_id=v_user and
                         ((pref.origin_mode='preferred' and p.country_of_origin_code=any(pref.preferred_origins))
                          or (pref.nationality_mode='preferred' and p.nationality_country_code=any(pref.preferred_nationalities)))) then 0
             when exists(select 1 from public.matchmaking_preferences pref where pref.user_id=v_user and
                         ((pref.residence_mode='preferred' and u.country_code=any(pref.preferred_residences))
                          or (pref.city_mode='preferred' and u.city=any(pref.preferred_cities)))) then 1 else 2 end)=v_cursor_tier
        and (p.created_at,p.id)<(p_cursor_created_at,p_cursor_user_id)))
  and not exists(select 1 from public.matchmaking_blocks b where (b.blocker_user_id=v_user and b.blocked_user_id=p.user_id) or (b.blocker_user_id=p.user_id and b.blocked_user_id=v_user))
  and not exists(select 1 from public.matchmaking_interests i where i.status='accepted' and least(i.initiator_user_id,i.recipient_user_id)=least(v_user,p.user_id) and greatest(i.initiator_user_id,i.recipient_user_id)=greatest(v_user,p.user_id))
  and u.gender = case (select me.gender from public.users me where me.id=v_user) when 'female' then 'male' when 'male' then 'female' else null end
  and exists(select 1 from public.users me join public.matchmaking_preferences mf on mf.user_id=me.id
    join public.matchmaking_profiles mp on mp.user_id=me.id
    where me.id=v_user and me.gender in ('male','female') and u.gender = case me.gender when 'female' then 'male' when 'male' then 'female' else null end
      and extract(year from age(current_date,u.date_of_birth))::integer between mf.age_min and mf.age_max
      and extract(year from age(current_date,me.date_of_birth))::integer between f.age_min and f.age_max
      and (mf.nationality_mode<>'required' or p.nationality_country_code=any(mf.preferred_nationalities))
      and (mf.origin_mode<>'required' or p.country_of_origin_code=any(mf.preferred_origins))
      and (mf.residence_mode<>'required' or u.country_code=any(mf.preferred_residences))
      and (mf.city_mode<>'required' or u.city=any(mf.preferred_cities))
      and (mf.language_mode<>'required' or p.languages&&mf.preferred_languages)
      and (mf.height_mode<>'required' or (p.height_cm is not null and (mf.min_height_cm is null or p.height_cm>=mf.min_height_cm) and (mf.max_height_cm is null or p.height_cm<=mf.max_height_cm)))
      and (mf.education_mode<>'required' or p.education_level=any(mf.preferred_education_levels))
      and (mf.religion_mode<>'required' or (p.use_religion_for_matching and p.religion_or_faith=any(mf.preferred_religions)))
      and (mf.faith_practice_mode<>'required' or (p.use_religion_for_matching and p.faith_practice_level=any(mf.preferred_faith_practice_levels)))
      and (mf.culture_mode<>'required' or (p.use_cultural_community_for_matching and p.cultural_or_ethnic_community=any(mf.preferred_cultural_communities)))
      and (mf.marital_status_mode<>'required' or p.marital_status=any(mf.preferred_marital_statuses))
      and (mf.children_mode<>'required' or (mf.accepts_partner_with_children is true or p.has_children is false))
      and (mf.wants_children_mode<>'required' or p.wants_children=any(mf.preferred_wants_children))
      and (mf.smoking_mode<>'required' or p.smoking=any(mf.preferred_smoking))
      and (mf.drinking_mode<>'required' or p.drinking=any(mf.preferred_drinking))
      and (mf.relocation_mode<>'required' or p.willing_to_relocate=any(mf.preferred_relocation))
      and (f.nationality_mode<>'required' or mp.nationality_country_code=any(f.preferred_nationalities))
      and (f.origin_mode<>'required' or mp.country_of_origin_code=any(f.preferred_origins))
      and (f.residence_mode<>'required' or me.country_code=any(f.preferred_residences))
      and (f.city_mode<>'required' or me.city=any(f.preferred_cities))
      and (f.language_mode<>'required' or mp.languages&&f.preferred_languages)
      and (f.height_mode<>'required' or (mp.height_cm is not null and (f.min_height_cm is null or mp.height_cm>=f.min_height_cm) and (f.max_height_cm is null or mp.height_cm<=f.max_height_cm)))
      and (f.education_mode<>'required' or mp.education_level=any(f.preferred_education_levels))
      and (f.religion_mode<>'required' or (mp.use_religion_for_matching and mp.religion_or_faith=any(f.preferred_religions)))
      and (f.faith_practice_mode<>'required' or (mp.use_religion_for_matching and mp.faith_practice_level=any(f.preferred_faith_practice_levels)))
      and (f.culture_mode<>'required' or (mp.use_cultural_community_for_matching and mp.cultural_or_ethnic_community=any(f.preferred_cultural_communities)))
      and (f.marital_status_mode<>'required' or mp.marital_status=any(f.preferred_marital_statuses))
      and (f.children_mode<>'required' or (f.accepts_partner_with_children is true or mp.has_children is false))
      and (f.wants_children_mode<>'required' or mp.wants_children=any(f.preferred_wants_children))
      and (f.smoking_mode<>'required' or mp.smoking=any(f.preferred_smoking))
      and (f.drinking_mode<>'required' or mp.drinking=any(f.preferred_drinking))
      and (f.relocation_mode<>'required' or mp.willing_to_relocate=any(f.preferred_relocation)))
 order by (case when exists(select 1 from public.matchmaking_preferences pref where pref.user_id=v_user and
                       ((pref.origin_mode='preferred' and p.country_of_origin_code=any(pref.preferred_origins))
                        or (pref.nationality_mode='preferred' and p.nationality_country_code=any(pref.preferred_nationalities)))) then 0
                when exists(select 1 from public.matchmaking_preferences pref where pref.user_id=v_user and
                       ((pref.residence_mode='preferred' and u.country_code=any(pref.preferred_residences))
                        or (pref.city_mode='preferred' and u.city=any(pref.preferred_cities)))) then 1 else 2 end),
          p.created_at desc,p.id limit v_limit;
end;
$function$;

create or replace function public.get_matchmaking_profile(p_profile_identifier uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_result jsonb; v_cursor timestamptz; v_cursor_id uuid; v_row record; v_count integer;
begin
 if v_user is null or not public.is_matchmaking_eligible(v_user) then raise exception 'Eligible matchmaking profile required' using errcode='42501'; end if;
 perform public.assert_matchmaking_opposite_gender(p_profile_identifier);
 loop
  v_count:=0;
  for v_row in select * from public.get_matchmaking_discovery(50,v_cursor,v_cursor_id) loop
   v_count:=v_count+1;
   if v_row.profile_identifier=p_profile_identifier then return to_jsonb(v_row); end if;
   v_cursor:=v_row.created_at;
   v_cursor_id:=v_row.profile_identifier;
  end loop;
  exit when v_count<50;
 end loop;
 raise exception 'Profile unavailable' using errcode='P0002';
end;
$function$;

create or replace function public.send_matchmaking_interest(p_profile_identifier uuid)
returns table(id uuid,status text,created_at timestamptz)
language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_target uuid; v_status text; v_id uuid; v_initiator uuid; v_recipient uuid;
 v_cursor timestamptz; v_cursor_id uuid; v_row record; v_count integer; v_found boolean:=false;
begin
 if v_user is null or not public.is_matchmaking_eligible(v_user) then raise exception 'Eligible matchmaking profile required' using errcode='42501'; end if;
 perform public.assert_matchmaking_opposite_gender(p_profile_identifier);
 loop
  v_count:=0;
  for v_row in select * from public.get_matchmaking_discovery(50,v_cursor,v_cursor_id) loop
   v_count:=v_count+1;
   if v_row.profile_identifier=p_profile_identifier then v_found:=true; exit; end if;
   v_cursor:=v_row.created_at;
   v_cursor_id:=v_row.profile_identifier;
  end loop;
  exit when v_found or v_count<50;
 end loop;
 if not v_found then raise exception 'Profile unavailable' using errcode='P0002'; end if;
 select p.user_id into strict v_target from public.matchmaking_profiles p where p.id=p_profile_identifier;
 select i.id,i.status,i.initiator_user_id,i.recipient_user_id into v_id,v_status,v_initiator,v_recipient
 from public.matchmaking_interests i where least(i.initiator_user_id,i.recipient_user_id)=least(v_user,v_target)
   and greatest(i.initiator_user_id,i.recipient_user_id)=greatest(v_user,v_target) for update;
 if v_id is null then
   insert into public.matchmaking_interests(initiator_user_id,recipient_user_id) values(v_user,v_target) returning matchmaking_interests.id,matchmaking_interests.status,matchmaking_interests.created_at into id,status,created_at;
 elsif v_status='pending' and v_initiator=v_target and v_recipient=v_user then
   update public.matchmaking_interests set status='accepted',responded_at=now() where matchmaking_interests.id=v_id returning matchmaking_interests.id,matchmaking_interests.status,matchmaking_interests.created_at into id,status,created_at;
 else raise exception 'An interest already exists for this profile pair' using errcode='23505';
 end if;
 return next;
end;
$function$;
revoke all on function public.assert_matchmaking_opposite_gender(uuid) from public, anon, authenticated;
revoke all on function public.derive_matchmaking_partner_gender() from public, anon, authenticated;
revoke all on function public.get_matchmaking_discovery(integer,timestamptz,uuid) from public, anon, authenticated;
revoke all on function public.get_matchmaking_profile(uuid) from public, anon, authenticated;
revoke all on function public.send_matchmaking_interest(uuid) from public, anon, authenticated;
grant execute on function public.get_matchmaking_discovery(integer,timestamptz,uuid) to authenticated;
grant execute on function public.get_matchmaking_profile(uuid) to authenticated;
grant execute on function public.send_matchmaking_interest(uuid) to authenticated;

commit;