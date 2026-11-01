begin;

do $preconditions$
begin
  if pg_catalog.to_regclass('public.users') is null
     or pg_catalog.to_regclass('public.user_journeys') is null
     or pg_catalog.to_regclass('public.matchmaking_profiles') is null
     or pg_catalog.to_regclass('public.matchmaking_preferences') is null
     or pg_catalog.to_regclass('public.matchmaking_interests') is null
     or pg_catalog.to_regclass('public.matchmaking_blocks') is null then
    raise exception 'Required Core Profile, journey, or Matchmaking tables are missing.';
  end if;
  if pg_catalog.to_regprocedure('public.is_community_user_suspended(uuid)') is null
     or pg_catalog.to_regprocedure('public.assert_matchmaking_opposite_gender(uuid)') is null
     or pg_catalog.to_regprocedure('public.has_community_role(text)') is null
     or pg_catalog.to_regprocedure('public.recompute_matchmaking_completion(uuid)') is null
     or pg_catalog.to_regprocedure('public.is_matchmaking_eligible(uuid)') is null
     or pg_catalog.to_regprocedure('public.save_matchmaking_profile(jsonb)') is null
     or pg_catalog.to_regprocedure('public.save_matchmaking_preferences(jsonb)') is null
     or pg_catalog.to_regprocedure('public.get_my_matchmaking_setup()') is null
     or pg_catalog.to_regprocedure('public.submit_matchmaking_profile()') is null
     or pg_catalog.to_regprocedure('public.get_matchmaking_discovery(integer,timestamptz,uuid)') is null
     or pg_catalog.to_regprocedure('public.get_matchmaking_profile(uuid)') is null then
    raise exception 'Required Matchmaking security helpers are missing.';
  end if;
end;
$preconditions$;

alter table public.matchmaking_profiles
  add column profile_version smallint not null default 1,
  add column physical_self_description text,
  add column occupation text,
  add column financial_readiness text,
  add column faith_importance text,
  add column denomination_or_tradition text,
  add column faith_expectations text,
  add column clan_or_region text,
  add column show_clan_or_region boolean not null default false,
  add column family_background text,
  add column family_involvement text,
  add column marriage_timeline text,
  add column marriage_structure text,
  add column long_distance_openness text,
  add column provider_model text,
  add column family_in_law_expectations text,
  add column marriage_vision_response text;

alter table public.matchmaking_profiles
  drop constraint if exists matchmaking_profiles_marital_status_check;
alter table public.matchmaking_profiles
  add constraint matchmaking_profiles_marital_status_check
  check (marital_status is null or marital_status in ('never_married','divorced','widowed','separated','annulled')) not valid;

alter table public.matchmaking_preferences
  add column preferences_version smallint not null default 1,
  add column preferred_children_statuses text[] not null default array[]::text[];

alter table public.matchmaking_profiles
  add constraint matchmaking_profiles_profile_version_check check (profile_version in (1,2)) not valid,
  add constraint matchmaking_profiles_v2_enum_values_check check (
    profile_version = 1 or (
      (financial_readiness is null or financial_readiness in ('ready_now','stable_and_preparing','building_toward_readiness','prefer_to_discuss'))
      and (faith_importance is null or faith_importance in ('central','important','somewhat_important','not_a_priority','prefer_to_discuss'))
      and (family_involvement is null or family_involvement in ('very_involved','supportive_with_boundaries','independent','prefer_to_discuss'))
      and (marriage_timeline is null or marriage_timeline in ('within_6_months','6_to_12_months','1_to_2_years','more_than_2_years','open_to_discussion'))
      and (marriage_structure is null or marriage_structure in ('monogamous','polygynous','open_to_discussion'))
      and (willing_to_relocate is null or willing_to_relocate in ('yes','maybe','no'))
      and (long_distance_openness is null or long_distance_openness in ('yes','temporarily','no','prefer_to_discuss'))
      and (provider_model is null or provider_model in ('single_provider','shared_financial_responsibility','flexible_by_season','prefer_to_discuss'))
      and (family_in_law_expectations is null or family_in_law_expectations in ('close_involvement','supportive_boundaries','independent_household','prefer_to_discuss'))
      and (wants_children is null or wants_children in ('yes','no','open_to_discussion'))
      and (smoking is null or smoking in ('never','occasionally','regularly','prefer_to_discuss'))
      and (drinking is null or drinking in ('never','occasionally','regularly','prefer_to_discuss'))
    )
  ) not valid,
  add constraint matchmaking_profiles_v2_text_lengths_check check (
    profile_version = 1 or (
      (physical_self_description is null or length(physical_self_description) <= 500)
      and (occupation is null or length(occupation) <= 160)
      and (denomination_or_tradition is null or length(denomination_or_tradition) <= 160)
      and (faith_expectations is null or length(faith_expectations) <= 1200)
      and (clan_or_region is null or length(clan_or_region) <= 160)
      and (family_background is null or length(family_background) <= 1200)
      and (marriage_vision_response is null or length(marriage_vision_response) <= 600)
    )
  ) not valid;

alter table public.matchmaking_preferences
  add constraint matchmaking_preferences_version_check check (preferences_version in (1,2)) not valid,
  add constraint matchmaking_preferences_v2_children_values_check check (
    preferences_version = 1 or preferred_children_statuses <@ array['has_children','no_children']::text[]
  ) not valid;

create or replace function public._matchmaking_v2_actor()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.users as account
    where account.id = v_actor
      and account.account_status = 'active'
      and account.onboarding_completed is true
      and account.date_of_birth is not null
      and account.date_of_birth <= (current_date - interval '18 years')::date
      and account.gender in ('male','female')
      and nullif(pg_catalog.btrim(account.country_code), '') is not null
      and account.legal_marital_status in ('never_married','divorced','widowed','annulled')
      and account.relationship_situation = 'single'
      and exists (
        select 1 from public.user_journeys as journey_row
        where journey_row.user_id = account.id
          and journey_row.journey_type = 'matchmaking'
          and journey_row.status = 'active'
      )
  ) then
    raise exception 'Complete your eligible Core Profile and activate the Matchmaking journey before editing this profile.' using errcode = '22023';
  end if;
  if public.is_community_user_suspended(v_actor) then
    raise exception 'Suspended accounts cannot edit matchmaking profiles.' using errcode = '42501';
  end if;
  return v_actor;
end;
$function$;

create or replace function public._matchmaking_v2_preference_response_complete(p_mode text, p_values text[])
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select p_mode = 'open' or (p_mode in ('required','preferred') and cardinality(coalesce(p_values, array[]::text[])) > 0)
$function$;

create or replace function public.matchmaking_profile_user_projection(p_profile public.matchmaking_profiles)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $function$
  select
    jsonb_build_object(
      'id',(p_profile).id,
      'user_id',(p_profile).user_id,
      'nationality_country_code',(p_profile).nationality_country_code,
      'country_of_origin_code',(p_profile).country_of_origin_code,
      'hometown',(p_profile).hometown,
      'languages',(p_profile).languages,
      'height_cm',(p_profile).height_cm,
      'physical_self_description',(p_profile).physical_self_description,
      'occupation',(p_profile).occupation,
      'financial_readiness',(p_profile).financial_readiness,
      'cultural_or_ethnic_community',(p_profile).cultural_or_ethnic_community,
      'show_cultural_community',(p_profile).show_cultural_community,
      'use_cultural_community_for_matching',(p_profile).use_cultural_community_for_matching,
      'clan_or_region',(p_profile).clan_or_region,
      'show_clan_or_region',(p_profile).show_clan_or_region,
      'family_background',(p_profile).family_background,
      'family_involvement',(p_profile).family_involvement,
      'religion_or_faith',(p_profile).religion_or_faith,
      'faith_practice_level',(p_profile).faith_practice_level,
      'faith_importance',(p_profile).faith_importance,
      'denomination_or_tradition',(p_profile).denomination_or_tradition,
      'faith_expectations',(p_profile).faith_expectations,
      'show_religion',(p_profile).show_religion,
      'use_religion_for_matching',(p_profile).use_religion_for_matching,
      'education_level',(p_profile).education_level,
      'field_of_study',(p_profile).field_of_study,
      'employment_status',(p_profile).employment_status,
      'industry',(p_profile).industry,
      'marital_status',(p_profile).marital_status,
      'has_children',(p_profile).has_children,
      'number_of_children',(p_profile).number_of_children,
      'children_live_with_me',(p_profile).children_live_with_me
    )
    ||
    jsonb_build_object(
      'wants_children',(p_profile).wants_children,
      'preferred_number_of_children',(p_profile).preferred_number_of_children,
      'smoking',(p_profile).smoking,
      'drinking',(p_profile).drinking,
      'exercise_level',(p_profile).exercise_level,
      'social_style',(p_profile).social_style,
      'interests',(p_profile).interests,
      'willing_to_relocate',(p_profile).willing_to_relocate,
      'marriage_timeline',(p_profile).marriage_timeline,
      'marriage_structure',(p_profile).marriage_structure,
      'long_distance_openness',(p_profile).long_distance_openness,
      'provider_model',(p_profile).provider_model,
      'family_in_law_expectations',(p_profile).family_in_law_expectations,
      'preferred_country_to_build_home',(p_profile).preferred_country_to_build_home,
      'diaspora_return_intention',(p_profile).diaspora_return_intention,
      'introduction',(p_profile).introduction,
      'marriage_vision_response',(p_profile).marriage_vision_response,
      'use_profile_image_for_matchmaking',(p_profile).use_profile_image_for_matchmaking,
      'profile_version',(p_profile).profile_version,
      'completion_percentage',(p_profile).completion_percentage,
      'status',(p_profile).status,
      'submitted_at',(p_profile).submitted_at,
      'created_at',(p_profile).created_at,
      'updated_at',(p_profile).updated_at
    );
$function$;

create or replace function public.recompute_matchmaking_completion(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
  v_total constant integer := 30;
begin
  select
    (case when p.height_cm between 120 and 230 then 1 else 0 end) +
    (case when nullif(pg_catalog.btrim(p.education_level),'') is not null then 1 else 0 end) +
    (case when nullif(pg_catalog.btrim(p.occupation),'') is not null then 1 else 0 end) +
    (case when nullif(pg_catalog.btrim(p.employment_status),'') is not null then 1 else 0 end) +
    (case when p.financial_readiness in ('ready_now','stable_and_preparing','building_toward_readiness','prefer_to_discuss') then 1 else 0 end) +
    (case when nullif(pg_catalog.btrim(p.religion_or_faith),'') is not null then 1 else 0 end) +
    (case when nullif(pg_catalog.btrim(p.faith_practice_level),'') is not null then 1 else 0 end) +
    (case when p.faith_importance in ('central','important','somewhat_important','not_a_priority','prefer_to_discuss') then 1 else 0 end) +
    (case when p.has_children is not null then 1 else 0 end) +
    (case when p.wants_children in ('yes','no','open_to_discussion') then 1 else 0 end) +
    (case when p.smoking in ('never','occasionally','regularly','prefer_to_discuss') then 1 else 0 end) +
    (case when p.drinking in ('never','occasionally','regularly','prefer_to_discuss') then 1 else 0 end) +
    (case when p.family_involvement in ('very_involved','supportive_with_boundaries','independent','prefer_to_discuss') then 1 else 0 end) +
    (case when p.marriage_timeline in ('within_6_months','6_to_12_months','1_to_2_years','more_than_2_years','open_to_discussion') then 1 else 0 end) +
    (case when p.marriage_structure in ('monogamous','polygynous','open_to_discussion') then 1 else 0 end) +
    (case when p.willing_to_relocate in ('yes','maybe','no') then 1 else 0 end) +
    (case when p.long_distance_openness in ('yes','temporarily','no','prefer_to_discuss') then 1 else 0 end) +
    (case when p.provider_model in ('single_provider','shared_financial_responsibility','flexible_by_season','prefer_to_discuss') then 1 else 0 end) +
    (case when p.family_in_law_expectations in ('close_involvement','supportive_boundaries','independent_household','prefer_to_discuss') then 1 else 0 end) +
    (case when pg_catalog.length(pg_catalog.btrim(p.introduction)) between 150 and 600 then 1 else 0 end) +
    (case when pg_catalog.length(pg_catalog.btrim(p.marriage_vision_response)) between 80 and 600 then 1 else 0 end) +
    (case when f.age_min between 18 and 100 then 1 else 0 end) +
    (case when f.age_max between f.age_min and 100 then 1 else 0 end) +
    (case when f.preferred_partner_gender in ('male','female') then 1 else 0 end) +
    (case when public._matchmaking_v2_preference_response_complete(f.residence_mode,f.preferred_residences) then 1 else 0 end) +
    (case when public._matchmaking_v2_preference_response_complete(f.religion_mode,f.preferred_religions) then 1 else 0 end) +
    (case when public._matchmaking_v2_preference_response_complete(f.marital_status_mode,f.preferred_marital_statuses) then 1 else 0 end) +
    (case when public._matchmaking_v2_preference_response_complete(f.children_mode,f.preferred_children_statuses) then 1 else 0 end) +
    (case when public._matchmaking_v2_preference_response_complete(f.wants_children_mode,f.preferred_wants_children) then 1 else 0 end) +
    (case when public._matchmaking_v2_preference_response_complete(f.relocation_mode,f.preferred_relocation) then 1 else 0 end)
  into v_count
  from (select 1) as seed
  left join public.matchmaking_profiles as p on p.user_id = p_user_id
  left join public.matchmaking_preferences as f on f.user_id = p_user_id;

  update public.matchmaking_profiles
  set completion_percentage = round(v_count * 100.0 / v_total)::integer
  where user_id = p_user_id;
  return round(v_count * 100.0 / v_total)::integer;
end;
$function$;

create or replace function public.save_matchmaking_profile(p_profile jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := public._matchmaking_v2_actor();
  v_core public.users%rowtype;
  v_bad text;
  v_row public.matchmaking_profiles%rowtype;
  v_marital text;
begin
  if p_profile is null or pg_catalog.jsonb_typeof(p_profile) <> 'object' then
    raise exception 'Profile must be an object.' using errcode = '22023';
  end if;
  select key into v_bad from pg_catalog.jsonb_object_keys(p_profile) as keys(key)
  where key not in (
    'height_cm','physical_self_description','occupation','education_level','field_of_study','employment_status','financial_readiness',
    'religion_or_faith','faith_practice_level','faith_importance','denomination_or_tradition','faith_expectations','show_religion','use_religion_for_matching',
    'cultural_or_ethnic_community','show_cultural_community','use_cultural_community_for_matching','clan_or_region','show_clan_or_region',
    'family_background','family_involvement','has_children','number_of_children','children_live_with_me','wants_children',
    'smoking','drinking','marriage_timeline','marriage_structure','willing_to_relocate','long_distance_openness','provider_model',
    'family_in_law_expectations','introduction','marriage_vision_response','use_profile_image_for_matchmaking'
  ) limit 1;
  if v_bad is not null then
    raise exception 'Unsupported profile field: %', v_bad using errcode = '22023';
  end if;

  select * into strict v_core from public.users as account where account.id = v_user for share;
  if p_profile ? 'height_cm' and nullif(p_profile->>'height_cm','') is not null
     and (p_profile->>'height_cm')::integer not between 120 and 230 then
    raise exception 'Height must be a whole number from 120 to 230 cm.' using errcode = '22023';
  end if;
  if p_profile ? 'has_children' and p_profile->'has_children' <> 'null'::jsonb
     and pg_catalog.jsonb_typeof(p_profile->'has_children') <> 'boolean' then
    raise exception 'Choose whether you have children.' using errcode = '22023';
  end if;
  if p_profile ? 'children_live_with_me' and p_profile->'children_live_with_me' <> 'null'::jsonb
     and pg_catalog.jsonb_typeof(p_profile->'children_live_with_me') <> 'boolean' then
    raise exception 'Children living arrangement must be yes or no.' using errcode = '22023';
  end if;
  if p_profile ? 'number_of_children' and nullif(p_profile->>'number_of_children','') is not null
     and (p_profile->>'number_of_children')::integer < 0 then
    raise exception 'Number of children cannot be negative.' using errcode = '22023';
  end if;
  if (p_profile ? 'financial_readiness' and p_profile->>'financial_readiness' not in ('ready_now','stable_and_preparing','building_toward_readiness','prefer_to_discuss'))
     or (p_profile ? 'faith_importance' and p_profile->>'faith_importance' not in ('central','important','somewhat_important','not_a_priority','prefer_to_discuss'))
     or (p_profile ? 'family_involvement' and p_profile->>'family_involvement' not in ('very_involved','supportive_with_boundaries','independent','prefer_to_discuss'))
     or (p_profile ? 'marriage_timeline' and p_profile->>'marriage_timeline' not in ('within_6_months','6_to_12_months','1_to_2_years','more_than_2_years','open_to_discussion'))
     or (p_profile ? 'marriage_structure' and p_profile->>'marriage_structure' not in ('monogamous','polygynous','open_to_discussion'))
     or (p_profile ? 'willing_to_relocate' and p_profile->>'willing_to_relocate' not in ('yes','maybe','no'))
     or (p_profile ? 'long_distance_openness' and p_profile->>'long_distance_openness' not in ('yes','temporarily','no','prefer_to_discuss'))
     or (p_profile ? 'provider_model' and p_profile->>'provider_model' not in ('single_provider','shared_financial_responsibility','flexible_by_season','prefer_to_discuss'))
     or (p_profile ? 'family_in_law_expectations' and p_profile->>'family_in_law_expectations' not in ('close_involvement','supportive_boundaries','independent_household','prefer_to_discuss'))
     or (p_profile ? 'wants_children' and p_profile->>'wants_children' not in ('yes','no','open_to_discussion'))
     or (p_profile ? 'smoking' and p_profile->>'smoking' not in ('never','occasionally','regularly','prefer_to_discuss'))
     or (p_profile ? 'drinking' and p_profile->>'drinking' not in ('never','occasionally','regularly','prefer_to_discuss')) then
    raise exception 'One or more structured profile answers are invalid.' using errcode = '22023';
  end if;
  if exists (select 1 from pg_catalog.jsonb_object_keys(p_profile) as supplied(key)
    where supplied.key in ('show_religion','use_religion_for_matching','show_cultural_community','use_cultural_community_for_matching','show_clan_or_region','use_profile_image_for_matchmaking')
      and pg_catalog.jsonb_typeof(p_profile->supplied.key) not in ('boolean','null')) then
    raise exception 'Consent controls must be boolean.' using errcode = '22023';
  end if;
  if exists(select 1 from (values
      ('physical_self_description',500),('occupation',160),('education_level',160),('field_of_study',160),('employment_status',100),
      ('financial_readiness',60),('religion_or_faith',120),('faith_practice_level',120),('faith_importance',60),
      ('denomination_or_tradition',160),('faith_expectations',1200),('cultural_or_ethnic_community',160),('clan_or_region',160),
      ('family_background',1200),('introduction',600),('marriage_vision_response',600)) as limits(field_name,max_length)
    where p_profile ? limits.field_name and pg_catalog.length(pg_catalog.btrim(coalesce(p_profile->>limits.field_name,''))) > limits.max_length) then
    raise exception 'A profile answer exceeds its maximum length.' using errcode = '22023';
  end if;

  v_marital := v_core.legal_marital_status;
  insert into public.matchmaking_profiles as old (
    user_id,nationality_country_code,country_of_origin_code,hometown,languages,marital_status,
    height_cm,physical_self_description,occupation,education_level,field_of_study,employment_status,financial_readiness,
    religion_or_faith,faith_practice_level,faith_importance,denomination_or_tradition,faith_expectations,show_religion,use_religion_for_matching,
    cultural_or_ethnic_community,show_cultural_community,use_cultural_community_for_matching,clan_or_region,show_clan_or_region,
    family_background,family_involvement,has_children,number_of_children,children_live_with_me,wants_children,smoking,drinking,
    marriage_timeline,marriage_structure,willing_to_relocate,long_distance_openness,provider_model,family_in_law_expectations,
    introduction,marriage_vision_response,use_profile_image_for_matchmaking,profile_version
  ) values (
    v_user,v_core.nationality_country_code,v_core.country_of_origin_code,null,
    array(select language_value from pg_catalog.unnest(array[v_core.primary_language] || coalesce(v_core.other_languages,array[]::text[])) with ordinality as core_languages(language_value,position)
      where nullif(pg_catalog.btrim(language_value),'') is not null order by position limit 30),v_marital,
    nullif(p_profile->>'height_cm','')::integer,nullif(pg_catalog.btrim(p_profile->>'physical_self_description'),''),nullif(pg_catalog.btrim(p_profile->>'occupation'),''),
    nullif(pg_catalog.btrim(p_profile->>'education_level'),''),nullif(pg_catalog.btrim(p_profile->>'field_of_study'),''),nullif(pg_catalog.btrim(p_profile->>'employment_status'),''),p_profile->>'financial_readiness',
    nullif(pg_catalog.btrim(p_profile->>'religion_or_faith'),''),nullif(pg_catalog.btrim(p_profile->>'faith_practice_level'),''),p_profile->>'faith_importance',
    nullif(pg_catalog.btrim(p_profile->>'denomination_or_tradition'),''),nullif(pg_catalog.btrim(p_profile->>'faith_expectations'),''),coalesce((p_profile->>'show_religion')::boolean,false),coalesce((p_profile->>'use_religion_for_matching')::boolean,false),
    nullif(pg_catalog.btrim(p_profile->>'cultural_or_ethnic_community'),''),coalesce((p_profile->>'show_cultural_community')::boolean,false),coalesce((p_profile->>'use_cultural_community_for_matching')::boolean,false),
    nullif(pg_catalog.btrim(p_profile->>'clan_or_region'),''),coalesce((p_profile->>'show_clan_or_region')::boolean,false),
    nullif(pg_catalog.btrim(p_profile->>'family_background'),''),p_profile->>'family_involvement',nullif(p_profile->>'has_children','')::boolean,
    nullif(p_profile->>'number_of_children','')::integer,nullif(p_profile->>'children_live_with_me','')::boolean,p_profile->>'wants_children',p_profile->>'smoking',p_profile->>'drinking',
    p_profile->>'marriage_timeline',p_profile->>'marriage_structure',p_profile->>'willing_to_relocate',p_profile->>'long_distance_openness',p_profile->>'provider_model',p_profile->>'family_in_law_expectations',
    nullif(pg_catalog.btrim(p_profile->>'introduction'),''),nullif(pg_catalog.btrim(p_profile->>'marriage_vision_response'),''),coalesce((p_profile->>'use_profile_image_for_matchmaking')::boolean,false),2
  )
  on conflict(user_id) do update set
    nationality_country_code=excluded.nationality_country_code,country_of_origin_code=excluded.country_of_origin_code,
    hometown=excluded.hometown,languages=excluded.languages,marital_status=excluded.marital_status,
    height_cm=excluded.height_cm,physical_self_description=excluded.physical_self_description,occupation=excluded.occupation,
    education_level=excluded.education_level,field_of_study=excluded.field_of_study,employment_status=excluded.employment_status,financial_readiness=excluded.financial_readiness,
    religion_or_faith=excluded.religion_or_faith,faith_practice_level=excluded.faith_practice_level,faith_importance=excluded.faith_importance,
    denomination_or_tradition=excluded.denomination_or_tradition,faith_expectations=excluded.faith_expectations,show_religion=excluded.show_religion,use_religion_for_matching=excluded.use_religion_for_matching,
    cultural_or_ethnic_community=excluded.cultural_or_ethnic_community,show_cultural_community=excluded.show_cultural_community,use_cultural_community_for_matching=excluded.use_cultural_community_for_matching,
    clan_or_region=excluded.clan_or_region,show_clan_or_region=excluded.show_clan_or_region,family_background=excluded.family_background,family_involvement=excluded.family_involvement,
    has_children=excluded.has_children,number_of_children=excluded.number_of_children,children_live_with_me=excluded.children_live_with_me,wants_children=excluded.wants_children,
    smoking=excluded.smoking,drinking=excluded.drinking,marriage_timeline=excluded.marriage_timeline,marriage_structure=excluded.marriage_structure,willing_to_relocate=excluded.willing_to_relocate,
    long_distance_openness=excluded.long_distance_openness,provider_model=excluded.provider_model,family_in_law_expectations=excluded.family_in_law_expectations,
    introduction=excluded.introduction,marriage_vision_response=excluded.marriage_vision_response,use_profile_image_for_matchmaking=excluded.use_profile_image_for_matchmaking,
    profile_version=2,status=case when old.status='hidden' then 'hidden' else 'draft' end,
    submitted_at=null,reviewed_by=null,reviewed_at=null,review_notes=null;
  perform public.recompute_matchmaking_completion(v_user);
  select * into strict v_row from public.matchmaking_profiles where user_id=v_user;
  return public.matchmaking_profile_user_projection(v_row);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'A numeric or structured profile answer is invalid.' using errcode = '22023';
end;
$function$;

create or replace function public.save_matchmaking_preferences(p_preferences jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := public._matchmaking_v2_actor();
  v_gender text;
  v_bad text;
  v_row public.matchmaking_preferences%rowtype;
  v_residences text[];
  v_religions text[];
  v_marital text[];
  v_children text[];
  v_future text[];
  v_relocation text[];
  v_residence_mode text;
  v_religion_mode text;
  v_marital_mode text;
  v_children_mode text;
  v_future_mode text;
  v_relocation_mode text;
  v_age_min integer;
  v_age_max integer;
begin
  if p_preferences is null or pg_catalog.jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'Preferences must be an object.' using errcode = '22023';
  end if;
  select key into v_bad from pg_catalog.jsonb_object_keys(p_preferences) as keys(key)
  where key not in ('age_min','age_max','preferred_residences','residence_mode','preferred_religions','religion_mode',
    'preferred_marital_statuses','marital_status_mode','preferred_children_statuses','children_mode',
    'preferred_wants_children','wants_children_mode','preferred_relocation','relocation_mode') limit 1;
  if v_bad is not null then raise exception 'Unsupported preference field: %',v_bad using errcode='22023'; end if;

  select account.gender into v_gender from public.users as account where account.id=v_user;
  if v_gender not in ('male','female') then raise exception 'Your Core Profile needs a valid gender before matchmaking can be used.' using errcode='22023'; end if;
  v_age_min := nullif(p_preferences->>'age_min','')::integer;
  v_age_max := nullif(p_preferences->>'age_max','')::integer;
  if v_age_min is not null and v_age_min not between 18 and 100 then raise exception 'Minimum age must be from 18 to 100.' using errcode='22023'; end if;
  if v_age_max is not null and v_age_max not between 18 and 100 then raise exception 'Maximum age must be from 18 to 100.' using errcode='22023'; end if;
  if v_age_min is not null and v_age_max is not null and v_age_min > v_age_max then raise exception 'Minimum age cannot exceed maximum age.' using errcode='22023'; end if;

  if exists (select 1 from pg_catalog.jsonb_each(p_preferences) as pair(key,value)
    where pair.key in ('preferred_residences','preferred_religions','preferred_marital_statuses','preferred_children_statuses','preferred_wants_children','preferred_relocation')
      and pg_catalog.jsonb_typeof(pair.value) <> 'array') then
    raise exception 'Preference selections must be arrays.' using errcode='22023';
  end if;
  v_residences := coalesce(array(select pg_catalog.upper(pg_catalog.btrim(item)) from pg_catalog.jsonb_array_elements_text(coalesce(p_preferences->'preferred_residences','[]'::jsonb)) as items(item)),array[]::text[]);
  v_religions := coalesce(array(select pg_catalog.btrim(item) from pg_catalog.jsonb_array_elements_text(coalesce(p_preferences->'preferred_religions','[]'::jsonb)) as items(item) where pg_catalog.btrim(item)<>''),array[]::text[]);
  v_marital := coalesce(array(select pg_catalog.btrim(item) from pg_catalog.jsonb_array_elements_text(coalesce(p_preferences->'preferred_marital_statuses','[]'::jsonb)) as items(item)),array[]::text[]);
  v_children := coalesce(array(select pg_catalog.btrim(item) from pg_catalog.jsonb_array_elements_text(coalesce(p_preferences->'preferred_children_statuses','[]'::jsonb)) as items(item)),array[]::text[]);
  v_future := coalesce(array(select pg_catalog.btrim(item) from pg_catalog.jsonb_array_elements_text(coalesce(p_preferences->'preferred_wants_children','[]'::jsonb)) as items(item)),array[]::text[]);
  v_relocation := coalesce(array(select pg_catalog.btrim(item) from pg_catalog.jsonb_array_elements_text(coalesce(p_preferences->'preferred_relocation','[]'::jsonb)) as items(item)),array[]::text[]);
  if exists(select 1 from pg_catalog.unnest(v_residences) as codes(code) where code !~ '^[A-Z]{2}$') then raise exception 'Location selections must be uppercase two-letter country codes.' using errcode='22023'; end if;
  if exists(select 1 from pg_catalog.unnest(v_marital) as items(item) where item not in ('never_married','divorced','widowed','annulled')) then raise exception 'Marital-history selection is invalid.' using errcode='22023'; end if;
  if exists(select 1 from pg_catalog.unnest(v_children) as items(item) where item not in ('has_children','no_children')) then raise exception 'Existing-children selection is invalid.' using errcode='22023'; end if;
  if exists(select 1 from pg_catalog.unnest(v_future) as items(item) where item not in ('yes','no','open_to_discussion')) then raise exception 'Future-children selection is invalid.' using errcode='22023'; end if;
  if exists(select 1 from pg_catalog.unnest(v_relocation) as items(item) where item not in ('yes','maybe','no')) then raise exception 'Relocation selection is invalid.' using errcode='22023'; end if;
  if exists(select 1 from pg_catalog.unnest(v_religions) as items(item) where pg_catalog.length(item)>120) then raise exception 'Faith selections must be 120 characters or fewer.' using errcode='22023'; end if;

  v_residence_mode := coalesce(p_preferences->>'residence_mode','open');
  v_religion_mode := coalesce(p_preferences->>'religion_mode','open');
  v_marital_mode := coalesce(p_preferences->>'marital_status_mode','open');
  v_children_mode := coalesce(p_preferences->>'children_mode','open');
  v_future_mode := coalesce(p_preferences->>'wants_children_mode','open');
  v_relocation_mode := coalesce(p_preferences->>'relocation_mode','open');
  if v_residence_mode not in ('required','preferred','open') or v_religion_mode not in ('required','preferred','open')
     or v_marital_mode not in ('required','preferred','open') or v_children_mode not in ('required','preferred','open')
     or v_future_mode not in ('required','preferred','open') or v_relocation_mode not in ('required','preferred','open') then
    raise exception 'Preference importance must be Required, Preferred, or Open.' using errcode='22023';
  end if;
  insert into public.matchmaking_preferences as old (
    user_id,preferred_partner_gender,age_min,age_max,preferred_residences,residence_mode,preferred_religions,religion_mode,
    preferred_marital_statuses,marital_status_mode,preferred_children_statuses,children_mode,preferred_wants_children,wants_children_mode,
    preferred_relocation,relocation_mode,preferred_nationalities,nationality_mode,preferred_origins,origin_mode,preferred_cities,city_mode,
    preferred_languages,language_mode,min_height_cm,max_height_cm,height_mode,preferred_education_levels,education_mode,
    preferred_faith_practice_levels,faith_practice_mode,preferred_cultural_communities,culture_mode,accepts_partner_with_children,
    preferred_smoking,smoking_mode,preferred_drinking,drinking_mode,preferences_version
  ) values (
    v_user,case v_gender when 'female' then 'male' else 'female' end,v_age_min,v_age_max,v_residences,v_residence_mode,v_religions,v_religion_mode,
    v_marital,v_marital_mode,v_children,v_children_mode,v_future,v_future_mode,v_relocation,v_relocation_mode,
    array[]::text[],'open',array[]::text[],'open',array[]::text[],'open',array[]::text[],'open',null,null,'open',array[]::text[],'open',
    array[]::text[],'open',array[]::text[],'open',null,array[]::text[],'open',array[]::text[],'open',2
  ) on conflict(user_id) do update set
    preferred_partner_gender=excluded.preferred_partner_gender,age_min=excluded.age_min,age_max=excluded.age_max,
    preferred_residences=excluded.preferred_residences,residence_mode=excluded.residence_mode,
    preferred_religions=excluded.preferred_religions,religion_mode=excluded.religion_mode,
    preferred_marital_statuses=excluded.preferred_marital_statuses,marital_status_mode=excluded.marital_status_mode,
    preferred_children_statuses=excluded.preferred_children_statuses,children_mode=excluded.children_mode,
    preferred_wants_children=excluded.preferred_wants_children,wants_children_mode=excluded.wants_children_mode,
    preferred_relocation=excluded.preferred_relocation,relocation_mode=excluded.relocation_mode,
    preferred_nationalities=array[]::text[],nationality_mode='open',preferred_origins=array[]::text[],origin_mode='open',
    preferred_cities=array[]::text[],city_mode='open',preferred_languages=array[]::text[],language_mode='open',
    min_height_cm=null,max_height_cm=null,height_mode='open',preferred_education_levels=array[]::text[],education_mode='open',
    preferred_faith_practice_levels=array[]::text[],faith_practice_mode='open',preferred_cultural_communities=array[]::text[],culture_mode='open',
    accepts_partner_with_children=null,preferred_smoking=array[]::text[],smoking_mode='open',preferred_drinking=array[]::text[],drinking_mode='open',preferences_version=2;
  perform public.recompute_matchmaking_completion(v_user);
  select * into strict v_row from public.matchmaking_preferences where user_id=v_user;
  return pg_catalog.to_jsonb(v_row);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'A numeric or structured preference answer is invalid.' using errcode='22023';
end;
$function$;

create or replace function public.get_my_matchmaking_setup()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  return jsonb_build_object(
    'account',(select jsonb_build_object(
      'display_name',account.display_name,'date_of_birth',account.date_of_birth,
      'age',case when account.date_of_birth is null then null else extract(year from age(current_date,account.date_of_birth))::integer end,
      'gender',account.gender,'nationality_country_code',account.nationality_country_code,
      'country_of_origin_code',account.country_of_origin_code,'country_code',account.country_code,'city',account.city,
      'primary_language',account.primary_language,'other_languages',account.other_languages,
      'legal_marital_status',account.legal_marital_status,'relationship_situation',account.relationship_situation,
      'profile_image_url',account.profile_image_url,'onboarding_completed',account.onboarding_completed,'account_status',account.account_status
    ) from public.users as account where account.id=v_user),
    'profile',(select public.matchmaking_profile_user_projection(profile_row) from public.matchmaking_profiles as profile_row where profile_row.user_id=v_user),
    'preferences',(select pg_catalog.to_jsonb(preference_row) from public.matchmaking_preferences as preference_row where preference_row.user_id=v_user)
  );
end;
$function$;

create or replace function public.is_matchmaking_eligible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.users as account
    join public.matchmaking_profiles as profile_row on profile_row.user_id=account.id
    join public.matchmaking_preferences as preference_row on preference_row.user_id=account.id
    where account.id=p_user_id and account.account_status='active' and account.onboarding_completed is true
      and account.date_of_birth is not null and account.date_of_birth <= (current_date-interval '18 years')::date
      and account.gender in ('male','female') and nullif(pg_catalog.btrim(account.country_code),'') is not null
      and account.legal_marital_status in ('never_married','divorced','widowed','annulled') and account.relationship_situation='single'
      and exists(select 1 from public.user_journeys as journey_row where journey_row.user_id=account.id and journey_row.journey_type='matchmaking' and journey_row.status='active')
      and profile_row.profile_version >= 2 and profile_row.completion_percentage=100 and profile_row.status='approved'
      and profile_row.marital_status in ('never_married','divorced','widowed','annulled')
      and preference_row.preferences_version >= 2 and preference_row.preferred_partner_gender in ('male','female')
      and preference_row.age_min between 18 and 100 and preference_row.age_max between preference_row.age_min and 100
      and not public.is_community_user_suspended(account.id)
  );
$function$;

create or replace function public.submit_matchmaking_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := public._matchmaking_v2_actor();
  v_completion integer;
  v_profile public.matchmaking_profiles%rowtype;
  v_preferences public.matchmaking_preferences%rowtype;
begin
  v_completion := public.recompute_matchmaking_completion(v_user);
  select * into v_profile from public.matchmaking_profiles where user_id=v_user;
  if not found then raise exception 'Save your Matchmaking profile before submitting.' using errcode='22023'; end if;
  select * into v_preferences from public.matchmaking_preferences where user_id=v_user;
  if not found then raise exception 'Save partner preferences before submitting.' using errcode='22023'; end if;
  if v_profile.profile_version < 2 or v_preferences.preferences_version < 2 then
    raise exception 'Save your Matchmaking profile and partner preferences before submitting.' using errcode='22023';
  end if;
  if v_profile.status='hidden' then raise exception 'This profile is hidden and cannot be submitted.' using errcode='22023'; end if;
  if v_completion <> 100 then raise exception 'Complete the required profile and partner preference responses before submitting.' using errcode='22023'; end if;
  update public.matchmaking_profiles
  set status='pending_review',submitted_at=now(),reviewed_by=null,reviewed_at=null,review_notes=null
  where user_id=v_user;
  select * into strict v_profile from public.matchmaking_profiles where user_id=v_user;
  return public.matchmaking_profile_user_projection(v_profile);
end;
$function$;

create or replace function public.get_matchmaking_discovery(
  p_limit integer default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_user_id uuid default null
)
returns table(
  profile_identifier uuid,age integer,gender text,nationality_country_code text,country_of_origin_code text,
  country_code text,city text,introduction text,education_level text,occupation text,marital_status text,has_children boolean,
  wants_children text,languages text[],interests text[],willing_to_relocate text,values_assessment text[],profile_image_url text,
  religion_or_faith text,cultural_or_ethnic_community text,created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit,20),1),50);
  v_cursor_rank integer;
begin
  if v_user is null or not public.is_matchmaking_eligible(v_user) then
    raise exception 'Eligible matchmaking profile required.' using errcode='42501';
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_user_id is null) then
    raise exception 'Supply both cursor values.' using errcode='22023';
  end if;
  if p_cursor_user_id is not null then
    select (case when f.residence_mode='preferred' and u.country_code=any(f.preferred_residences) then 1 else 0 end +
            case when f.religion_mode='preferred' and profile_row.use_religion_for_matching and profile_row.religion_or_faith=any(f.preferred_religions) then 1 else 0 end +
            case when f.marital_status_mode='preferred' and account.legal_marital_status=any(f.preferred_marital_statuses) then 1 else 0 end +
            case when f.children_mode='preferred' and (case when profile_row.has_children then 'has_children' else 'no_children' end)=any(f.preferred_children_statuses) then 1 else 0 end +
            case when f.wants_children_mode='preferred' and profile_row.wants_children=any(f.preferred_wants_children) then 1 else 0 end +
            case when f.relocation_mode='preferred' and profile_row.willing_to_relocate=any(f.preferred_relocation) then 1 else 0 end)
      into v_cursor_rank
      from public.matchmaking_profiles as profile_row
      join public.users as account on account.id=profile_row.user_id
      join public.matchmaking_preferences as f on f.user_id=v_user
      join public.users as u on u.id=profile_row.user_id
      where profile_row.id=p_cursor_user_id and profile_row.user_id<>v_user and public.is_matchmaking_eligible(profile_row.user_id);
    if v_cursor_rank is null then raise exception 'Invalid discovery cursor.' using errcode='22023'; end if;
  end if;

  return query
  with candidates as (
    select profile_row.id as profile_id,profile_row.created_at,
      extract(year from age(current_date,account.date_of_birth))::integer as candidate_age,
      account.gender as candidate_gender,account.country_code as candidate_country,account.city as candidate_city,
      profile_row.introduction,profile_row.education_level,profile_row.occupation,
      account.legal_marital_status as candidate_marital,profile_row.has_children,profile_row.wants_children,
      profile_row.willing_to_relocate,
      case when profile_row.use_profile_image_for_matchmaking then account.profile_image_url else null end as candidate_image,
      case when profile_row.show_religion then profile_row.religion_or_faith else null end as visible_faith,
      case when profile_row.show_cultural_community then profile_row.cultural_or_ethnic_community else null end as visible_culture,
      pg_catalog.array_remove(array[account.primary_language] || coalesce(account.other_languages,array[]::text[]),null) as candidate_languages,
      (case when f.residence_mode='preferred' and account.country_code=any(f.preferred_residences) then 1 else 0 end +
       case when f.religion_mode='preferred' and profile_row.use_religion_for_matching and profile_row.religion_or_faith=any(f.preferred_religions) then 1 else 0 end +
       case when f.marital_status_mode='preferred' and account.legal_marital_status=any(f.preferred_marital_statuses) then 1 else 0 end +
       case when f.children_mode='preferred' and (case when profile_row.has_children then 'has_children' else 'no_children' end)=any(f.preferred_children_statuses) then 1 else 0 end +
       case when f.wants_children_mode='preferred' and profile_row.wants_children=any(f.preferred_wants_children) then 1 else 0 end +
       case when f.relocation_mode='preferred' and profile_row.willing_to_relocate=any(f.preferred_relocation) then 1 else 0 end) as preference_rank
    from public.matchmaking_profiles as profile_row
    join public.users as account on account.id=profile_row.user_id
    join public.matchmaking_preferences as candidate_preferences on candidate_preferences.user_id=profile_row.user_id
    join public.matchmaking_profiles as own_profile on own_profile.user_id=v_user
    join public.users as own_account on own_account.id=v_user
    join public.matchmaking_preferences as f on f.user_id=v_user
    where profile_row.user_id<>v_user
      and public.is_matchmaking_eligible(profile_row.user_id)
      and account.gender=case own_account.gender when 'female' then 'male' when 'male' then 'female' else null end
      and account.legal_marital_status in ('never_married','divorced','widowed','annulled')
      and extract(year from age(current_date,account.date_of_birth))::integer between f.age_min and f.age_max
      and extract(year from age(current_date,own_account.date_of_birth))::integer between candidate_preferences.age_min and candidate_preferences.age_max
      and (f.residence_mode<>'required' or account.country_code=any(f.preferred_residences))
      and (candidate_preferences.residence_mode<>'required' or own_account.country_code=any(candidate_preferences.preferred_residences))
      and (f.religion_mode<>'required' or (profile_row.use_religion_for_matching and profile_row.religion_or_faith=any(f.preferred_religions)))
      and (candidate_preferences.religion_mode<>'required' or (own_profile.use_religion_for_matching and own_profile.religion_or_faith=any(candidate_preferences.preferred_religions)))
      and (f.marital_status_mode<>'required' or account.legal_marital_status=any(f.preferred_marital_statuses))
      and (candidate_preferences.marital_status_mode<>'required' or own_account.legal_marital_status=any(candidate_preferences.preferred_marital_statuses))
      and (f.children_mode<>'required' or (case when profile_row.has_children then 'has_children' else 'no_children' end)=any(f.preferred_children_statuses))
      and (candidate_preferences.children_mode<>'required' or (case when own_profile.has_children then 'has_children' else 'no_children' end)=any(candidate_preferences.preferred_children_statuses))
      and (f.wants_children_mode<>'required' or profile_row.wants_children=any(f.preferred_wants_children))
      and (candidate_preferences.wants_children_mode<>'required' or own_profile.wants_children=any(candidate_preferences.preferred_wants_children))
      and (f.relocation_mode<>'required' or profile_row.willing_to_relocate=any(f.preferred_relocation))
      and (candidate_preferences.relocation_mode<>'required' or own_profile.willing_to_relocate=any(candidate_preferences.preferred_relocation))
      and not exists(select 1 from public.matchmaking_blocks as block_row where
        (block_row.blocker_user_id=v_user and block_row.blocked_user_id=profile_row.user_id)
        or (block_row.blocker_user_id=profile_row.user_id and block_row.blocked_user_id=v_user))
      and not exists(select 1 from public.matchmaking_interests as interest_row where interest_row.status='accepted'
        and least(interest_row.initiator_user_id,interest_row.recipient_user_id)=least(v_user,profile_row.user_id)
        and greatest(interest_row.initiator_user_id,interest_row.recipient_user_id)=greatest(v_user,profile_row.user_id))
  )
  select candidates.profile_id,candidates.candidate_age,candidates.candidate_gender,
    null::text,null::text,candidates.candidate_country,candidates.candidate_city,candidates.introduction,
    null::text,null::text,null::text,null::boolean,null::text,
    array[]::text[],array[]::text[],null::text,array[]::text[],candidates.candidate_image,
    null::text,null::text,candidates.created_at
  from candidates
  where p_cursor_created_at is null
     or candidates.preference_rank < v_cursor_rank
     or (candidates.preference_rank=v_cursor_rank and (candidates.created_at < p_cursor_created_at
         or (candidates.created_at=p_cursor_created_at and candidates.profile_id > p_cursor_user_id)))
  order by candidates.preference_rank desc,candidates.created_at desc,candidates.profile_id asc
  limit v_limit;
end;
$function$;

create or replace function public.get_matchmaking_profile(p_profile_identifier uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_cursor timestamptz := null;
  v_cursor_id uuid := null;
  v_row record;
  v_count integer;
  v_result jsonb;
  v_profile public.matchmaking_profiles%rowtype;
  v_account public.users%rowtype;
  v_preferences public.matchmaking_preferences%rowtype;
  v_alignments text[] := array[]::text[];
begin
  if v_user is null or not public.is_matchmaking_eligible(v_user) then raise exception 'Eligible matchmaking profile required.' using errcode='42501'; end if;
  perform public.assert_matchmaking_opposite_gender(p_profile_identifier);
  loop
    v_count:=0;
    for v_row in select * from public.get_matchmaking_discovery(50,v_cursor,v_cursor_id) loop
      v_count:=v_count+1;
      if v_row.profile_identifier=p_profile_identifier then
        select * into strict v_profile from public.matchmaking_profiles where id=p_profile_identifier;
        select * into strict v_account from public.users where id=v_profile.user_id;
        select * into strict v_preferences from public.matchmaking_preferences where user_id=v_user;
        if v_account.date_of_birth between (current_date - make_interval(years=>v_preferences.age_max))::date and (current_date - make_interval(years=>v_preferences.age_min))::date then
          v_alignments:=array_append(v_alignments,'Within your preferred age range');
        end if;
        if v_preferences.residence_mode in ('required','preferred') and v_account.country_code=any(v_preferences.preferred_residences) then v_alignments:=array_append(v_alignments,'Location aligns with your preference'); end if;
        if v_preferences.religion_mode in ('required','preferred') and v_profile.show_religion and v_profile.use_religion_for_matching and v_profile.religion_or_faith=any(v_preferences.preferred_religions) then v_alignments:=array_append(v_alignments,'Faith aligns with your preference'); end if;
        if v_preferences.marital_status_mode in ('required','preferred') and v_account.legal_marital_status=any(v_preferences.preferred_marital_statuses) then v_alignments:=array_append(v_alignments,'Marital history aligns'); end if;
        if v_preferences.children_mode in ('required','preferred') and (case when v_profile.has_children then 'has_children' else 'no_children' end)=any(v_preferences.preferred_children_statuses) then v_alignments:=array_append(v_alignments,'Children preference aligns'); end if;
        if v_preferences.wants_children_mode in ('required','preferred') and v_profile.wants_children=any(v_preferences.preferred_wants_children) then v_alignments:=array_append(v_alignments,'Future-family plans align'); end if;
        if v_preferences.relocation_mode in ('required','preferred') and v_profile.willing_to_relocate=any(v_preferences.preferred_relocation) then v_alignments:=array_append(v_alignments,'Relocation preference aligns'); end if;
        v_result:=jsonb_build_object(
          'profile_identifier',v_profile.id,'age',extract(year from age(current_date,v_account.date_of_birth))::integer,
          'gender',v_account.gender,'country_code',v_account.country_code,'city',v_account.city,
          'introduction',v_profile.introduction,'marriage_vision_response',v_profile.marriage_vision_response,
          'physical_self_description',v_profile.physical_self_description,
          'height_cm',v_profile.height_cm,'education_level',v_profile.education_level,'field_of_study',v_profile.field_of_study,
          'occupation',v_profile.occupation,'marital_status',v_account.legal_marital_status,'has_children',v_profile.has_children,
          'wants_children',v_profile.wants_children,'languages',pg_catalog.array_remove(array[v_account.primary_language] || coalesce(v_account.other_languages,array[]::text[]),null),
          'willing_to_relocate',v_profile.willing_to_relocate,'marriage_timeline',v_profile.marriage_timeline,
          'marriage_structure',v_profile.marriage_structure,'long_distance_openness',v_profile.long_distance_openness,
          'provider_model',v_profile.provider_model,'family_in_law_expectations',v_profile.family_in_law_expectations,
          'family_involvement',v_profile.family_involvement,
          'family_background',v_profile.family_background,
          'religion_or_faith',case when v_profile.show_religion then v_profile.religion_or_faith else null end,
          'faith_practice_level',case when v_profile.show_religion then v_profile.faith_practice_level else null end,
          'faith_expectations',case when v_profile.show_religion then v_profile.faith_expectations else null end,
          'denomination_or_tradition',case when v_profile.show_religion then v_profile.denomination_or_tradition else null end,
          'cultural_or_ethnic_community',case when v_profile.show_cultural_community then v_profile.cultural_or_ethnic_community else null end,
          'clan_or_region',case when v_profile.show_clan_or_region then v_profile.clan_or_region else null end,
          'profile_image_url',case when v_profile.use_profile_image_for_matchmaking then v_account.profile_image_url else null end,
          'alignments',v_alignments
        );
        return v_result;
      end if;
      v_cursor:=v_row.created_at;
      v_cursor_id:=v_row.profile_identifier;
    end loop;
    exit when v_count<50;
  end loop;
  raise exception 'Profile unavailable.' using errcode='P0002';
end;
$function$;

create or replace function public.get_matchmaking_admin_profile_detail(p_profile_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := auth.uid();
  v_result jsonb;
begin
  if v_admin is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not public.has_community_role('admin') then
    raise exception 'Admin role required.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'user_id', profile_row.user_id,
    'display_name', coalesce(nullif(account.display_name, ''), nullif(account.full_name, ''), 'Member'),
    'age', case when account.date_of_birth is null then null else extract(year from age(current_date, account.date_of_birth))::integer end,
    'country_code', account.country_code,
    'city', account.city,
    'legal_marital_status', account.legal_marital_status,
    'profile_version', profile_row.profile_version,
    'completion_percentage', profile_row.completion_percentage,
    'status', profile_row.status,
    'submitted_at', profile_row.submitted_at,
    'height_cm', profile_row.height_cm,
    'physical_self_description', profile_row.physical_self_description,
    'introduction', profile_row.introduction,
    'marriage_vision_response', profile_row.marriage_vision_response,
    'education_level', profile_row.education_level,
    'field_of_study', profile_row.field_of_study,
    'occupation', profile_row.occupation,
    'employment_status', profile_row.employment_status,
    'has_children', profile_row.has_children,
    'wants_children', profile_row.wants_children,
    'smoking', profile_row.smoking,
    'drinking', profile_row.drinking,
    'family_background', profile_row.family_background,
    'family_involvement', profile_row.family_involvement,
    'marriage_timeline', profile_row.marriage_timeline,
    'marriage_structure', profile_row.marriage_structure,
    'willing_to_relocate', profile_row.willing_to_relocate,
    'long_distance_openness', profile_row.long_distance_openness,
    'provider_model', profile_row.provider_model,
    'family_in_law_expectations', profile_row.family_in_law_expectations,
    'religion_or_faith', case when profile_row.show_religion then profile_row.religion_or_faith else null end,
    'faith_practice_level', case when profile_row.show_religion then profile_row.faith_practice_level else null end,
    'denomination_or_tradition', case when profile_row.show_religion then profile_row.denomination_or_tradition else null end,
    'faith_expectations', case when profile_row.show_religion then profile_row.faith_expectations else null end,
    'cultural_or_ethnic_community', case when profile_row.show_cultural_community then profile_row.cultural_or_ethnic_community else null end,
    'clan_or_region', case when profile_row.show_clan_or_region then profile_row.clan_or_region else null end
  )
  into v_result
  from public.matchmaking_profiles as profile_row
  join public.users as account on account.id = profile_row.user_id
  where profile_row.user_id = p_profile_user_id;

  if v_result is null then
    raise exception 'Matchmaking profile not found.' using errcode = 'P0002';
  end if;
  return v_result;
end;
$function$;

revoke all on function public._matchmaking_v2_actor() from public,anon,authenticated;
revoke all on function public._matchmaking_v2_preference_response_complete(text,text[]) from public,anon,authenticated;
revoke all on function public.matchmaking_profile_user_projection(public.matchmaking_profiles) from public,anon,authenticated;
revoke all on function public.recompute_matchmaking_completion(uuid) from public,anon,authenticated;
revoke all on function public.is_matchmaking_eligible(uuid) from public,anon,authenticated;
revoke all on function public.get_my_matchmaking_setup() from public,anon,authenticated;
revoke all on function public.save_matchmaking_profile(jsonb) from public,anon,authenticated;
revoke all on function public.save_matchmaking_preferences(jsonb) from public,anon,authenticated;
revoke all on function public.submit_matchmaking_profile() from public,anon,authenticated;
revoke all on function public.get_matchmaking_discovery(integer,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.get_matchmaking_profile(uuid) from public,anon,authenticated;
revoke all on function public.get_matchmaking_admin_profile_detail(uuid) from public,anon,authenticated;
grant execute on function public.get_my_matchmaking_setup() to authenticated;
grant execute on function public.save_matchmaking_profile(jsonb) to authenticated;
grant execute on function public.save_matchmaking_preferences(jsonb) to authenticated;
grant execute on function public.submit_matchmaking_profile() to authenticated;
grant execute on function public.get_matchmaking_discovery(integer,timestamptz,uuid) to authenticated;
grant execute on function public.get_matchmaking_profile(uuid) to authenticated;
grant execute on function public.get_matchmaking_admin_profile_detail(uuid) to authenticated;

do $postconditions$
declare
  v_preferences_definition text;
begin
  if pg_catalog.has_function_privilege('authenticated','public._matchmaking_v2_actor()','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public._matchmaking_v2_preference_response_complete(text,text[])','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.recompute_matchmaking_completion(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.is_matchmaking_eligible(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.matchmaking_profile_user_projection(public.matchmaking_profiles)','EXECUTE') then
    raise exception 'Postcondition failed: internal Matchmaking v2 helpers must remain private.';
  end if;
  if pg_catalog.to_regprocedure('public.matchmaking_profile_user_projection(public.matchmaking_profiles)') is null then
    raise exception 'Postcondition failed: Matchmaking profile projection helper is missing.';
  end if;
  if pg_catalog.has_function_privilege('anon','public.matchmaking_profile_user_projection(public.matchmaking_profiles)','EXECUTE') then
    raise exception 'Postcondition failed: anonymous role can execute the Matchmaking profile projection helper.';
  end if;
  if not pg_catalog.has_function_privilege('authenticated','public.get_my_matchmaking_setup()','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.save_matchmaking_profile(jsonb)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.save_matchmaking_preferences(jsonb)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.submit_matchmaking_profile()','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.get_matchmaking_discovery(integer,timestamptz,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.get_matchmaking_profile(uuid)','EXECUTE') then
    raise exception 'Postcondition failed: authenticated Matchmaking RPC access is incomplete.';
  end if;
  if pg_catalog.has_function_privilege('anon','public.save_matchmaking_profile(jsonb)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.save_matchmaking_preferences(jsonb)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.submit_matchmaking_profile()','EXECUTE') then
    raise exception 'Postcondition failed: anonymous Matchmaking mutation access exists.';
  end if;
  if pg_catalog.to_regprocedure('public.get_matchmaking_admin_profile_detail(uuid)') is null then
    raise exception 'Postcondition failed: admin Matchmaking profile detail RPC is missing.';
  end if;
  if not pg_catalog.has_function_privilege('authenticated','public.get_matchmaking_admin_profile_detail(uuid)','EXECUTE') then
    raise exception 'Postcondition failed: authenticated role cannot call the admin profile detail RPC.';
  end if;
  if pg_catalog.has_function_privilege('anon','public.get_matchmaking_admin_profile_detail(uuid)','EXECUTE') then
    raise exception 'Postcondition failed: anonymous role can call the admin profile detail RPC.';
  end if;
  select pg_catalog.pg_get_functiondef('public.save_matchmaking_preferences(jsonb)'::pg_catalog.regprocedure)
    into v_preferences_definition;
  if pg_catalog.strpos(v_preferences_definition, 'preferred_education_levels=array[]::text[]') = 0
     or pg_catalog.strpos(v_preferences_definition, 'education_mode=''open''') = 0 then
    raise exception 'Postcondition failed: legacy education preference must be reset to Open with an empty selection.';
  end if;
end;
$postconditions$;

commit;
