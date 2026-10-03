begin;

-- A fixed user-facing projection prevents admin review metadata from being
-- returned by ordinary profile read/save/submit RPCs.
create function public.matchmaking_profile_user_projection(p_profile public.matchmaking_profiles)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', (p_profile).id,
    'user_id', (p_profile).user_id,
    'nationality_country_code', (p_profile).nationality_country_code,
    'country_of_origin_code', (p_profile).country_of_origin_code,
    'hometown', (p_profile).hometown,
    'languages', (p_profile).languages,
    'height_cm', (p_profile).height_cm,
    'cultural_or_ethnic_community', (p_profile).cultural_or_ethnic_community,
    'show_cultural_community', (p_profile).show_cultural_community,
    'use_cultural_community_for_matching', (p_profile).use_cultural_community_for_matching,
    'religion_or_faith', (p_profile).religion_or_faith,
    'faith_practice_level', (p_profile).faith_practice_level,
    'show_religion', (p_profile).show_religion,
    'use_religion_for_matching', (p_profile).use_religion_for_matching,
    'education_level', (p_profile).education_level,
    'field_of_study', (p_profile).field_of_study,
    'employment_status', (p_profile).employment_status,
    'industry', (p_profile).industry,
    'marital_status', (p_profile).marital_status,
    'has_children', (p_profile).has_children,
    'number_of_children', (p_profile).number_of_children,
    'children_live_with_me', (p_profile).children_live_with_me,
    'wants_children', (p_profile).wants_children,
    'preferred_number_of_children', (p_profile).preferred_number_of_children,
    'smoking', (p_profile).smoking,
    'drinking', (p_profile).drinking,
    'exercise_level', (p_profile).exercise_level,
    'social_style', (p_profile).social_style,
    'interests', (p_profile).interests,
    'willing_to_relocate', (p_profile).willing_to_relocate,
    'preferred_country_to_build_home', (p_profile).preferred_country_to_build_home,
    'diaspora_return_intention', (p_profile).diaspora_return_intention,
    'introduction', (p_profile).introduction,
    'use_profile_image_for_matchmaking', (p_profile).use_profile_image_for_matchmaking,
    'completion_percentage', (p_profile).completion_percentage,
    'status', (p_profile).status,
    'submitted_at', (p_profile).submitted_at,
    'created_at', (p_profile).created_at,
    'updated_at', (p_profile).updated_at
  );
$function$;

create or replace function public.get_my_matchmaking_setup()
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 return jsonb_build_object(
  'account',(select jsonb_build_object('date_of_birth',u.date_of_birth,'age',extract(year from age(current_date,u.date_of_birth))::integer,
    'gender',u.gender,'country_code',u.country_code,'city',u.city,'location',u.location,'marriage_intention',u.marriage_intention,
    'marriage_timeline',u.marriage_timeline,'commitment_level',u.commitment_level,'values_assessment',u.values_assessment,
    'occupation',u.occupation,'bio',u.bio,'profile_image_url',u.profile_image_url,'onboarding_completed',u.onboarding_completed)
    from public.users u where u.id=v_user),
  'profile',(select public.matchmaking_profile_user_projection(p) from public.matchmaking_profiles p where p.user_id=v_user),
  'preferences',(select to_jsonb(f) from public.matchmaking_preferences f where f.user_id=v_user));
end;
$function$;

create or replace function public.save_matchmaking_profile(p_profile jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_bad text;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_profile is null or jsonb_typeof(p_profile)<>'object' then raise exception 'Profile must be an object' using errcode='22023'; end if;
  select k into v_bad from jsonb_object_keys(p_profile) k where k not in (
    'nationality_country_code','country_of_origin_code','hometown','languages','height_cm',
    'cultural_or_ethnic_community','show_cultural_community','use_cultural_community_for_matching',
    'religion_or_faith','faith_practice_level','show_religion','use_religion_for_matching',
    'education_level','field_of_study','employment_status','industry','marital_status',
    'has_children','number_of_children','children_live_with_me','wants_children','preferred_number_of_children',
    'smoking','drinking','exercise_level','social_style','interests','willing_to_relocate',
    'preferred_country_to_build_home','diaspora_return_intention','introduction','use_profile_image_for_matchmaking'
  ) limit 1;
  if v_bad is not null then raise exception 'Unsupported profile field: %',v_bad using errcode='22023'; end if;
  insert into public.matchmaking_profiles as existing(user_id,nationality_country_code,country_of_origin_code,hometown,languages,height_cm,
    cultural_or_ethnic_community,show_cultural_community,use_cultural_community_for_matching,religion_or_faith,faith_practice_level,show_religion,use_religion_for_matching,
    education_level,field_of_study,employment_status,industry,marital_status,has_children,number_of_children,children_live_with_me,wants_children,
    preferred_number_of_children,smoking,drinking,exercise_level,social_style,interests,willing_to_relocate,preferred_country_to_build_home,
    diaspora_return_intention,introduction,use_profile_image_for_matchmaking)
  values(v_user,p_profile->>'nationality_country_code',p_profile->>'country_of_origin_code',p_profile->>'hometown',
    coalesce(array(select jsonb_array_elements_text(p_profile->'languages')),'{}'),
    nullif(p_profile->>'height_cm','')::integer,p_profile->>'cultural_or_ethnic_community',
    coalesce((p_profile->>'show_cultural_community')::boolean,false),coalesce((p_profile->>'use_cultural_community_for_matching')::boolean,false),
    p_profile->>'religion_or_faith',p_profile->>'faith_practice_level',coalesce((p_profile->>'show_religion')::boolean,false),
    coalesce((p_profile->>'use_religion_for_matching')::boolean,false),p_profile->>'education_level',p_profile->>'field_of_study',
    p_profile->>'employment_status',p_profile->>'industry',p_profile->>'marital_status',nullif(p_profile->>'has_children','')::boolean,
    nullif(p_profile->>'number_of_children','')::integer,nullif(p_profile->>'children_live_with_me','')::boolean,p_profile->>'wants_children',
    nullif(p_profile->>'preferred_number_of_children','')::integer,p_profile->>'smoking',p_profile->>'drinking',p_profile->>'exercise_level',
    p_profile->>'social_style',coalesce(array(select jsonb_array_elements_text(p_profile->'interests')),'{}'),
    p_profile->>'willing_to_relocate',p_profile->>'preferred_country_to_build_home',p_profile->>'diaspora_return_intention',
    p_profile->>'introduction',coalesce((p_profile->>'use_profile_image_for_matchmaking')::boolean,false))
  on conflict(user_id) do update set
    nationality_country_code=excluded.nationality_country_code,country_of_origin_code=excluded.country_of_origin_code,hometown=excluded.hometown,
    languages=excluded.languages,height_cm=excluded.height_cm,cultural_or_ethnic_community=excluded.cultural_or_ethnic_community,
    show_cultural_community=excluded.show_cultural_community,use_cultural_community_for_matching=excluded.use_cultural_community_for_matching,
    religion_or_faith=excluded.religion_or_faith,faith_practice_level=excluded.faith_practice_level,show_religion=excluded.show_religion,
    use_religion_for_matching=excluded.use_religion_for_matching,education_level=excluded.education_level,field_of_study=excluded.field_of_study,
    employment_status=excluded.employment_status,industry=excluded.industry,marital_status=excluded.marital_status,has_children=excluded.has_children,
    number_of_children=excluded.number_of_children,children_live_with_me=excluded.children_live_with_me,wants_children=excluded.wants_children,
    preferred_number_of_children=excluded.preferred_number_of_children,smoking=excluded.smoking,drinking=excluded.drinking,exercise_level=excluded.exercise_level,
    social_style=excluded.social_style,interests=excluded.interests,willing_to_relocate=excluded.willing_to_relocate,
    preferred_country_to_build_home=excluded.preferred_country_to_build_home,diaspora_return_intention=excluded.diaspora_return_intention,
    introduction=excluded.introduction,use_profile_image_for_matchmaking=excluded.use_profile_image_for_matchmaking,
    status=case when existing.status='hidden' then 'hidden' else 'draft' end,submitted_at=null,reviewed_by=null,reviewed_at=null,review_notes=null;
  perform public.recompute_matchmaking_completion(v_user);
  return (select public.matchmaking_profile_user_projection(p) from public.matchmaking_profiles p where p.user_id=v_user);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid matchmaking profile value' using errcode='22023';
end;
$function$;

create or replace function public.submit_matchmaking_profile()
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_completion integer;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 v_completion:=public.recompute_matchmaking_completion(v_user);
 if v_completion<>100 then raise exception 'Complete all required profile and spouse preference fields first' using errcode='22023'; end if;
 if not exists(select 1 from public.users u where u.id=v_user and u.onboarding_completed and u.date_of_birth <= (current_date-interval '18 years')::date and u.gender in ('male','female') and nullif(btrim(u.country_code),'') is not null and u.marriage_intention='seeking_marriage') then
   raise exception 'Account profile does not meet matchmaking prerequisites' using errcode='22023'; end if;
 if public.is_community_user_suspended(v_user) then raise exception 'Suspended accounts cannot submit matchmaking profiles' using errcode='42501'; end if;
 if not exists(select 1 from public.matchmaking_profiles p where p.user_id=v_user and p.marital_status in ('never_married','divorced','widowed') and p.status<>'hidden') then
   raise exception 'Select an eligible marital status or contact support if profile is hidden' using errcode='22023'; end if;
 update public.matchmaking_profiles set status='pending_review',submitted_at=now() where user_id=v_user;
 return (select public.matchmaking_profile_user_projection(p) from public.matchmaking_profiles p where p.user_id=v_user);
end;
$function$;

-- Separate admin-only history from the user-facing setup projection.
create function public.get_matchmaking_admin_review_history()
returns table(user_id uuid,status text,reviewed_by uuid,reviewed_at timestamptz,review_notes text)
language plpgsql stable security definer set search_path=''
as $function$
begin
 if auth.uid() is null or not public.has_community_role('admin') then
   raise exception 'Admin role required' using errcode='42501';
 end if;
 return query
   select p.user_id,p.status,p.reviewed_by,p.reviewed_at,p.review_notes
   from public.matchmaking_profiles p
   where p.status in ('approved','rejected','hidden')
   order by p.reviewed_at desc nulls last,p.user_id;
end;
$function$;

revoke all on function public.matchmaking_profile_user_projection(public.matchmaking_profiles) from public,anon,authenticated;
revoke all on function public.get_my_matchmaking_setup() from public,anon,authenticated;
revoke all on function public.save_matchmaking_profile(jsonb) from public,anon,authenticated;
revoke all on function public.submit_matchmaking_profile() from public,anon,authenticated;
revoke all on function public.get_matchmaking_admin_review_history() from public,anon,authenticated;
grant execute on function public.get_my_matchmaking_setup() to authenticated;
grant execute on function public.save_matchmaking_profile(jsonb) to authenticated;
grant execute on function public.submit_matchmaking_profile() to authenticated;
grant execute on function public.get_matchmaking_admin_review_history() to authenticated;

commit;
