begin;

create table public.matchmaking_profiles (
  id uuid not null unique default gen_random_uuid(),
  user_id uuid primary key references auth.users(id) on delete cascade,
  nationality_country_code text,
  country_of_origin_code text,
  hometown text,
  languages text[] not null default '{}',
  height_cm integer check (height_cm between 120 and 230),
  cultural_or_ethnic_community text,
  show_cultural_community boolean not null default false,
  use_cultural_community_for_matching boolean not null default false,
  religion_or_faith text,
  faith_practice_level text,
  show_religion boolean not null default false,
  use_religion_for_matching boolean not null default false,
  education_level text,
  field_of_study text,
  employment_status text,
  industry text,
  marital_status text check (marital_status in ('never_married','divorced','widowed','separated')),
  has_children boolean,
  number_of_children integer check (number_of_children is null or number_of_children >= 0),
  children_live_with_me boolean,
  wants_children text,
  preferred_number_of_children integer check (preferred_number_of_children is null or preferred_number_of_children >= 0),
  smoking text,
  drinking text,
  exercise_level text,
  social_style text,
  interests text[] not null default '{}',
  willing_to_relocate text,
  preferred_country_to_build_home text,
  diaspora_return_intention text,
  introduction text check (introduction is null or length(introduction) <= 3000),
  use_profile_image_for_matchmaking boolean not null default false,
  completion_percentage integer not null default 0 check (completion_percentage between 0 and 100),
  status text not null default 'draft' check (status in ('draft','pending_review','approved','rejected','hidden')),
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nationality_country_code is null or nationality_country_code ~ '^[A-Z]{2}$'),
  check (country_of_origin_code is null or country_of_origin_code ~ '^[A-Z]{2}$'),
  check (hometown is null or length(hometown)<=160),
  check (cultural_or_ethnic_community is null or length(cultural_or_ethnic_community)<=160),
  check (religion_or_faith is null or length(religion_or_faith)<=120),
  check (faith_practice_level is null or length(faith_practice_level)<=120),
  check (cardinality(languages)<=30 and cardinality(interests)<=50)
);

create table public.matchmaking_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_partner_gender text check (preferred_partner_gender in ('male','female')),
  age_min integer check (age_min between 18 and 100),
  age_max integer check (age_max between 18 and 100),
  preferred_nationalities text[] not null default '{}', nationality_mode text not null default 'open' check (nationality_mode in ('required','preferred','open')),
  preferred_origins text[] not null default '{}', origin_mode text not null default 'open' check (origin_mode in ('required','preferred','open')),
  preferred_residences text[] not null default '{}', residence_mode text not null default 'open' check (residence_mode in ('required','preferred','open')),
  preferred_cities text[] not null default '{}', city_mode text not null default 'open' check (city_mode in ('required','preferred','open')),
  preferred_languages text[] not null default '{}', language_mode text not null default 'open' check (language_mode in ('required','preferred','open')),
  min_height_cm integer check (min_height_cm between 120 and 230),
  max_height_cm integer check (max_height_cm between 120 and 230),
  height_mode text not null default 'open' check (height_mode in ('required','preferred','open')),
  preferred_education_levels text[] not null default '{}', education_mode text not null default 'open' check (education_mode in ('required','preferred','open')),
  preferred_religions text[] not null default '{}', religion_mode text not null default 'open' check (religion_mode in ('required','preferred','open')),
  preferred_faith_practice_levels text[] not null default '{}', faith_practice_mode text not null default 'open' check (faith_practice_mode in ('required','preferred','open')),
  preferred_cultural_communities text[] not null default '{}', culture_mode text not null default 'open' check (culture_mode in ('required','preferred','open')),
  preferred_marital_statuses text[] not null default '{}', marital_status_mode text not null default 'open' check (marital_status_mode in ('required','preferred','open')),
  accepts_partner_with_children boolean,
  children_mode text not null default 'open' check (children_mode in ('required','preferred','open')),
  preferred_wants_children text[] not null default '{}', wants_children_mode text not null default 'open' check (wants_children_mode in ('required','preferred','open')),
  preferred_smoking text[] not null default '{}', smoking_mode text not null default 'open' check (smoking_mode in ('required','preferred','open')),
  preferred_drinking text[] not null default '{}', drinking_mode text not null default 'open' check (drinking_mode in ('required','preferred','open')),
  preferred_relocation text[] not null default '{}', relocation_mode text not null default 'open' check (relocation_mode in ('required','preferred','open')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (age_min is null or age_max is null or age_min <= age_max),
  check (min_height_cm is null or max_height_cm is null or min_height_cm <= max_height_cm)
);

create table public.matchmaking_interests (
  id uuid primary key default gen_random_uuid(),
  initiator_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  check (initiator_user_id <> recipient_user_id)
);
create unique index matchmaking_interests_pair_key
  on public.matchmaking_interests (least(initiator_user_id,recipient_user_id), greatest(initiator_user_id,recipient_user_id));

create table public.matchmaking_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (blocker_user_id <> blocked_user_id),
  unique (blocker_user_id,blocked_user_id)
);

create table public.matchmaking_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('fake_profile','harassment','married_or_unavailable','sexual_solicitation','fraud_scam','abusive_conduct','inappropriate_photo','other')),
  details text check (details is null or length(details) <= 3000),
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed','actioned')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  check (reporter_user_id <> reported_user_id),
  check ((status='pending' and reviewed_by is null and reviewed_at is null) or (status<>'pending' and reviewed_by is not null and reviewed_at is not null))
);
create unique index matchmaking_reports_pending_pair_key on public.matchmaking_reports(reporter_user_id,reported_user_id) where status='pending';

create index matchmaking_profiles_discovery_idx on public.matchmaking_profiles(status,created_at desc,user_id);
create index matchmaking_profiles_origin_idx on public.matchmaking_profiles(country_of_origin_code,nationality_country_code);
create index matchmaking_preferences_gender_age_idx on public.matchmaking_preferences(preferred_partner_gender,age_min,age_max);
create index matchmaking_interests_initiator_idx on public.matchmaking_interests(initiator_user_id,status,updated_at desc);
create index matchmaking_interests_recipient_idx on public.matchmaking_interests(recipient_user_id,status,updated_at desc);
create index matchmaking_blocks_reverse_idx on public.matchmaking_blocks(blocked_user_id,blocker_user_id);
create index matchmaking_reports_queue_idx on public.matchmaking_reports(status,created_at);

create trigger matchmaking_profiles_updated_at before update on public.matchmaking_profiles for each row execute function public.set_updated_at();
create trigger matchmaking_preferences_updated_at before update on public.matchmaking_preferences for each row execute function public.set_updated_at();
create trigger matchmaking_interests_updated_at before update on public.matchmaking_interests for each row execute function public.set_updated_at();

alter table public.matchmaking_profiles enable row level security;
alter table public.matchmaking_preferences enable row level security;
alter table public.matchmaking_interests enable row level security;
alter table public.matchmaking_blocks enable row level security;
alter table public.matchmaking_reports enable row level security;

revoke all on table public.matchmaking_profiles, public.matchmaking_preferences, public.matchmaking_interests, public.matchmaking_blocks, public.matchmaking_reports from public, anon, authenticated;
grant select on public.matchmaking_profiles, public.matchmaking_preferences, public.matchmaking_interests, public.matchmaking_blocks, public.matchmaking_reports to authenticated;

create policy matchmaking_profiles_select_own on public.matchmaking_profiles for select to authenticated using (user_id=(select auth.uid()));
create policy matchmaking_preferences_select_own on public.matchmaking_preferences for select to authenticated using (user_id=(select auth.uid()));
create policy matchmaking_interests_select_involved on public.matchmaking_interests for select to authenticated using (initiator_user_id=(select auth.uid()) or recipient_user_id=(select auth.uid()));
create policy matchmaking_blocks_select_own on public.matchmaking_blocks for select to authenticated using (blocker_user_id=(select auth.uid()));
create policy matchmaking_reports_select_own on public.matchmaking_reports for select to authenticated using (reporter_user_id=(select auth.uid()));

create function public.recompute_matchmaking_completion(p_user_id uuid)
returns integer language plpgsql security definer set search_path=''
as $function$
declare v_count integer;
begin
  select
    (case when p.nationality_country_code is not null then 1 else 0 end) +
    (case when p.country_of_origin_code is not null then 1 else 0 end) +
    (case when nullif(btrim(p.introduction),'') is not null then 1 else 0 end) +
    (case when nullif(btrim(p.education_level),'') is not null then 1 else 0 end) +
    (case when nullif(btrim(p.employment_status),'') is not null then 1 else 0 end) +
    (case when p.marital_status is not null then 1 else 0 end) +
    (case when p.has_children is not null then 1 else 0 end) +
    (case when nullif(btrim(p.wants_children),'') is not null then 1 else 0 end) +
    (case when nullif(btrim(p.willing_to_relocate),'') is not null then 1 else 0 end) +
    (case when f.preferred_partner_gender is not null then 1 else 0 end) +
    (case when f.age_min is not null then 1 else 0 end) +
    (case when f.age_max is not null then 1 else 0 end)
  into v_count
  from (select 1) seed
  left join public.matchmaking_profiles p on p.user_id=p_user_id
  left join public.matchmaking_preferences f on f.user_id=p_user_id;
  update public.matchmaking_profiles set completion_percentage=round(v_count*100.0/12)::integer where user_id=p_user_id;
  return round(v_count*100.0/12)::integer;
end;
$function$;

create function public.is_matchmaking_eligible(p_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $function$
  select exists (
    select 1
    from public.users u
    join public.matchmaking_profiles p on p.user_id=u.id
    join public.matchmaking_preferences f on f.user_id=u.id
    where u.id=p_user_id and u.onboarding_completed is true
      and u.date_of_birth is not null and u.date_of_birth <= (current_date - interval '18 years')::date
      and u.gender in ('male','female') and nullif(btrim(u.country_code),'') is not null
      and u.marriage_intention='seeking_marriage'
      and p.completion_percentage=100 and p.status='approved'
      and p.marital_status in ('never_married','divorced','widowed')
      and f.preferred_partner_gender in ('male','female')
      and f.age_min between 18 and 100 and f.age_max between f.age_min and 100
      and not public.is_community_user_suspended(u.id)
  );
$function$;

create function public.save_matchmaking_profile(p_profile jsonb)
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
  return (select to_jsonb(p) from public.matchmaking_profiles p where p.user_id=v_user);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid matchmaking profile value' using errcode='22023';
end;
$function$;

create function public.save_matchmaking_preferences(p_preferences jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_bad text;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_preferences is null or jsonb_typeof(p_preferences)<>'object' then raise exception 'Preferences must be an object' using errcode='22023'; end if;
  select k into v_bad from jsonb_object_keys(p_preferences) k where k not in (
    'preferred_partner_gender','age_min','age_max','preferred_nationalities','nationality_mode','preferred_origins','origin_mode',
    'preferred_residences','residence_mode','preferred_cities','city_mode','preferred_languages','language_mode','min_height_cm','max_height_cm','height_mode',
    'preferred_education_levels','education_mode','preferred_religions','religion_mode','preferred_faith_practice_levels','faith_practice_mode',
    'preferred_cultural_communities','culture_mode','preferred_marital_statuses','marital_status_mode','accepts_partner_with_children','children_mode',
    'preferred_wants_children','wants_children_mode','preferred_smoking','smoking_mode','preferred_drinking','drinking_mode','preferred_relocation','relocation_mode'
  ) limit 1;
  if v_bad is not null then raise exception 'Unsupported preference field: %',v_bad using errcode='22023'; end if;
  if exists (
    select 1 from jsonb_array_elements_text(coalesce(p_preferences->'preferred_nationalities','[]'::jsonb) ||
      coalesce(p_preferences->'preferred_origins','[]'::jsonb) ||
      coalesce(p_preferences->'preferred_residences','[]'::jsonb)) code
    where code !~ '^[A-Z]{2}$'
  ) then raise exception 'Country preferences must be uppercase two-letter country codes' using errcode='22023'; end if;
  insert into public.matchmaking_preferences as old(user_id,preferred_partner_gender,age_min,age_max,
    preferred_nationalities,nationality_mode,preferred_origins,origin_mode,preferred_residences,residence_mode,preferred_cities,city_mode,
    preferred_languages,language_mode,min_height_cm,max_height_cm,height_mode,preferred_education_levels,education_mode,
    preferred_religions,religion_mode,preferred_faith_practice_levels,faith_practice_mode,preferred_cultural_communities,culture_mode,
    preferred_marital_statuses,marital_status_mode,accepts_partner_with_children,children_mode,preferred_wants_children,wants_children_mode,
    preferred_smoking,smoking_mode,preferred_drinking,drinking_mode,preferred_relocation,relocation_mode)
  values(v_user,p_preferences->>'preferred_partner_gender',nullif(p_preferences->>'age_min','')::integer,nullif(p_preferences->>'age_max','')::integer,
    coalesce(array(select jsonb_array_elements_text(p_preferences->'preferred_nationalities')),'{}'),coalesce(p_preferences->>'nationality_mode','open'),
    coalesce(array(select jsonb_array_elements_text(p_preferences->'preferred_origins')),'{}'),coalesce(p_preferences->>'origin_mode','open'),
    coalesce(array(select jsonb_array_elements_text(p_preferences->'preferred_residences')),'{}'),coalesce(p_preferences->>'residence_mode','open'),
    coalesce(array(select jsonb_array_elements_text(p_preferences->'preferred_cities')),'{}'),coalesce(p_preferences->>'city_mode','open'),
    coalesce(array(select jsonb_array_elements_text(p_preferences->'preferred_languages')),'{}'),coalesce(p_preferences->>'language_mode','open'),
    nullif(p_preferences->>'min_height_cm','')::integer,nullif(p_preferences->>'max_height_cm','')::integer,coalesce(p_preferences->>'height_mode','open'),
    coalesce(array(select jsonb_array_elements_text(p_preferences->'preferred_education_levels')),'{}'),coalesce(p_preferences->>'education_mode','open'),
    coalesce(array(select jsonb_array_elements_text(p_preferences->'preferred_religions')),'{}'),coalesce(p_preferences->>'religion_mode','open'),
    coalesce(array(select jsonb_array_elements_text(p_preferences->'preferred_faith_practice_levels')),'{}'),coalesce(p_preferences->>'faith_practice_mode','open'),
    coalesce(array(select jsonb_array_elements_text(p_preferences->'preferred_cultural_communities')),'{}'),coalesce(p_preferences->>'culture_mode','open'),
    coalesce(array(select jsonb_array_elements_text(p_preferences->'preferred_marital_statuses')),'{}'),coalesce(p_preferences->>'marital_status_mode','open'),
    nullif(p_preferences->>'accepts_partner_with_children','')::boolean,coalesce(p_preferences->>'children_mode','open'),
    coalesce(array(select jsonb_array_elements_text(p_preferences->'preferred_wants_children')),'{}'),coalesce(p_preferences->>'wants_children_mode','open'),
    coalesce(array(select jsonb_array_elements_text(p_preferences->'preferred_smoking')),'{}'),coalesce(p_preferences->>'smoking_mode','open'),
    coalesce(array(select jsonb_array_elements_text(p_preferences->'preferred_drinking')),'{}'),coalesce(p_preferences->>'drinking_mode','open'),
    coalesce(array(select jsonb_array_elements_text(p_preferences->'preferred_relocation')),'{}'),coalesce(p_preferences->>'relocation_mode','open'))
  on conflict(user_id) do update set preferred_partner_gender=excluded.preferred_partner_gender,age_min=excluded.age_min,age_max=excluded.age_max,
    preferred_nationalities=excluded.preferred_nationalities,nationality_mode=excluded.nationality_mode,preferred_origins=excluded.preferred_origins,origin_mode=excluded.origin_mode,
    preferred_residences=excluded.preferred_residences,residence_mode=excluded.residence_mode,preferred_cities=excluded.preferred_cities,city_mode=excluded.city_mode,
    preferred_languages=excluded.preferred_languages,language_mode=excluded.language_mode,min_height_cm=excluded.min_height_cm,max_height_cm=excluded.max_height_cm,height_mode=excluded.height_mode,
    preferred_education_levels=excluded.preferred_education_levels,education_mode=excluded.education_mode,preferred_religions=excluded.preferred_religions,religion_mode=excluded.religion_mode,
    preferred_faith_practice_levels=excluded.preferred_faith_practice_levels,faith_practice_mode=excluded.faith_practice_mode,
    preferred_cultural_communities=excluded.preferred_cultural_communities,culture_mode=excluded.culture_mode,
    preferred_marital_statuses=excluded.preferred_marital_statuses,marital_status_mode=excluded.marital_status_mode,
    accepts_partner_with_children=excluded.accepts_partner_with_children,children_mode=excluded.children_mode,
    preferred_wants_children=excluded.preferred_wants_children,wants_children_mode=excluded.wants_children_mode,
    preferred_smoking=excluded.preferred_smoking,smoking_mode=excluded.smoking_mode,preferred_drinking=excluded.preferred_drinking,drinking_mode=excluded.drinking_mode,
    preferred_relocation=excluded.preferred_relocation,relocation_mode=excluded.relocation_mode;
  perform public.recompute_matchmaking_completion(v_user);
  return (select to_jsonb(f) from public.matchmaking_preferences f where f.user_id=v_user);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid matchmaking preference value' using errcode='22023';
end;
$function$;

create function public.get_my_matchmaking_setup()
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
  'profile',(select to_jsonb(p) from public.matchmaking_profiles p where p.user_id=v_user),
  'preferences',(select to_jsonb(f) from public.matchmaking_preferences f where f.user_id=v_user));
end;
$function$;

create function public.submit_matchmaking_profile()
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
 return (select to_jsonb(p) from public.matchmaking_profiles p where p.user_id=v_user);
end;
$function$;

create function public.review_matchmaking_profile(p_profile_user_id uuid,p_action text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_actor uuid:=auth.uid();
begin
 if v_actor is null or not public.has_community_role('admin') then raise exception 'Admin role required' using errcode='42501'; end if;
 if p_action is null or p_action not in ('approve','reject','hide') then raise exception 'Invalid review action' using errcode='22023'; end if;
 if p_action in ('approve','reject') and not exists(select 1 from public.matchmaking_profiles p where p.user_id=p_profile_user_id and p.status='pending_review') then
   raise exception 'Only submitted profiles can be approved or rejected' using errcode='22023'; end if;
 update public.matchmaking_profiles set status=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'hidden' end,
  reviewed_by=v_actor,reviewed_at=now(),review_notes=nullif(btrim(p_notes),'')
 where user_id=p_profile_user_id;
 if not found then raise exception 'Profile not found' using errcode='P0002'; end if;
 if p_action='approve' and not public.is_matchmaking_eligible(p_profile_user_id) then raise exception 'Profile does not meet current eligibility requirements' using errcode='22023'; end if;
 return (select to_jsonb(p) from public.matchmaking_profiles p where p.user_id=p_profile_user_id);
end;
$function$;

create function public.get_matchmaking_discovery(p_limit integer default 20,p_cursor_created_at timestamptz default null,p_cursor_user_id uuid default null)
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
  and f.preferred_partner_gender=u.gender
  and exists(select 1 from public.users me join public.matchmaking_preferences mf on mf.user_id=me.id
    join public.matchmaking_profiles mp on mp.user_id=me.id
    where me.id=v_user and me.gender=f.preferred_partner_gender and mf.preferred_partner_gender=u.gender
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

create function public.get_matchmaking_profile(p_profile_identifier uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_result jsonb; v_cursor timestamptz; v_cursor_id uuid; v_row record; v_count integer;
begin
 if v_user is null or not public.is_matchmaking_eligible(v_user) then raise exception 'Eligible matchmaking profile required' using errcode='42501'; end if;
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

create function public.send_matchmaking_interest(p_profile_identifier uuid)
returns table(id uuid,status text,created_at timestamptz)
language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_target uuid; v_status text; v_id uuid; v_initiator uuid; v_recipient uuid;
 v_cursor timestamptz; v_cursor_id uuid; v_row record; v_count integer; v_found boolean:=false;
begin
 if v_user is null or not public.is_matchmaking_eligible(v_user) then raise exception 'Eligible matchmaking profile required' using errcode='42501'; end if;
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

create function public.respond_matchmaking_interest(p_interest_id uuid,p_decision text)
returns text language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_status text;
begin
 if v_user is null or p_decision is null or p_decision not in ('accept','decline') then raise exception 'Invalid request' using errcode='22023'; end if;
 update public.matchmaking_interests set status=case p_decision when 'accept' then 'accepted' else 'declined' end,responded_at=now()
 where id=p_interest_id and recipient_user_id=v_user and status='pending' returning matchmaking_interests.status into v_status;
 if v_status is null then raise exception 'Pending incoming interest not found' using errcode='P0002'; end if;
 return v_status;
end;
$function$;

create function public.withdraw_matchmaking_interest(p_interest_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
 update public.matchmaking_interests set status='withdrawn',responded_at=now()
 where id=p_interest_id and initiator_user_id=v_user and status='pending' returning id into v_id;
 if v_id is null then raise exception 'Pending outgoing interest not found' using errcode='P0002'; end if;
 return true;
end;
$function$;

create function public.block_matchmaking_profile(p_profile_identifier uuid)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_target uuid;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select p.user_id into v_target from public.matchmaking_profiles p where p.id=p_profile_identifier;
 if v_target is null or v_user=v_target then raise exception 'Invalid profile' using errcode='22023'; end if;
 insert into public.matchmaking_blocks(blocker_user_id,blocked_user_id) values(v_user,v_target) on conflict do nothing;
 update public.matchmaking_interests set status='withdrawn',responded_at=now()
 where status in ('pending','accepted') and least(initiator_user_id,recipient_user_id)=least(v_user,v_target)
  and greatest(initiator_user_id,recipient_user_id)=greatest(v_user,v_target);
 return true;
end;
$function$;

create function public.report_matchmaking_profile(p_profile_identifier uuid,p_reason text,p_details text default null)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid(); v_target uuid; v_id uuid;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select p.user_id into v_target from public.matchmaking_profiles p where p.id=p_profile_identifier and p.status='approved';
 if v_target is null or v_user=v_target then raise exception 'Invalid report target' using errcode='22023'; end if;
 if p_reason is null or p_reason not in ('fake_profile','harassment','married_or_unavailable','sexual_solicitation','fraud_scam','abusive_conduct','inappropriate_photo','other') then raise exception 'Invalid report reason' using errcode='22023'; end if;
 insert into public.matchmaking_reports(reporter_user_id,reported_user_id,reason,details) values(v_user,v_target,p_reason,nullif(btrim(p_details),''))
 returning id into v_id;
 return v_id;
exception when unique_violation then raise exception 'A pending report already exists for this profile' using errcode='23505';
end;
$function$;

create function public.get_my_matchmaking_interests()
returns table(interest_id uuid,other_profile_identifier uuid,direction text,status text,display_name text,age integer,country_code text,city text,profile_image_url text,created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 return query select i.id,p.id,
  case when i.initiator_user_id=v_user then 'outgoing' else 'incoming' end,i.status,
  'Member',extract(year from age(current_date,u.date_of_birth))::integer,u.country_code,u.city,
  case when p.use_profile_image_for_matchmaking then u.profile_image_url else null end,i.created_at
 from public.matchmaking_interests i join public.users u on u.id=case when i.initiator_user_id=v_user then i.recipient_user_id else i.initiator_user_id end
 join public.matchmaking_profiles p on p.user_id=u.id
 where (i.initiator_user_id=v_user or i.recipient_user_id=v_user)
   and not exists(select 1 from public.matchmaking_blocks b where (b.blocker_user_id=v_user and b.blocked_user_id=u.id) or (b.blocker_user_id=u.id and b.blocked_user_id=v_user))
 order by i.updated_at desc;
end;
$function$;

create function public.get_matchmaking_admin_queue()
returns table(user_id uuid,display_name text,age integer,country_code text,city text,completion_percentage integer,status text,submitted_at timestamptz,introduction text)
language plpgsql stable security definer set search_path=''
as $function$
begin
 if auth.uid() is null or not public.has_community_role('admin') then raise exception 'Admin role required' using errcode='42501'; end if;
 return query select p.user_id,coalesce(nullif(u.full_name,''),'Member'),extract(year from age(current_date,u.date_of_birth))::integer,u.country_code,u.city,p.completion_percentage,p.status,p.submitted_at,p.introduction
 from public.matchmaking_profiles p join public.users u on u.id=p.user_id where p.status in ('pending_review','approved','hidden','rejected')
 order by case p.status when 'pending_review' then 0 else 1 end,p.submitted_at desc nulls last,p.user_id;
end;
$function$;

create function public.get_matchmaking_admin_reports()
returns table(report_id uuid,reporter_user_id uuid,reported_user_id uuid,reason text,details text,status text,created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $function$
begin
 if auth.uid() is null or not public.has_community_role('admin') then raise exception 'Admin role required' using errcode='42501'; end if;
 return query select r.id,r.reporter_user_id,r.reported_user_id,r.reason,r.details,r.status,r.created_at from public.matchmaking_reports r order by (r.status='pending') desc,r.created_at,r.id;
end;
$function$;

create function public.review_matchmaking_report(p_report_id uuid,p_status text,p_notes text default null)
returns text language plpgsql security definer set search_path=''
as $function$
declare v_actor uuid:=auth.uid(); v_result text;
begin
 if v_actor is null or not public.has_community_role('admin') then raise exception 'Admin role required' using errcode='42501'; end if;
 if p_status is null or p_status not in ('reviewed','dismissed','actioned') then raise exception 'Invalid report status' using errcode='22023'; end if;
 update public.matchmaking_reports set status=p_status,reviewed_by=v_actor,reviewed_at=now(),resolution_notes=nullif(btrim(p_notes),'')
 where id=p_report_id and status='pending' returning status into v_result;
 if v_result is null then raise exception 'Pending report not found' using errcode='P0002'; end if;
 return v_result;
end;
$function$;

-- Every callable RPC is explicitly restricted to authenticated; internal helpers stay private.
revoke all on function public.recompute_matchmaking_completion(uuid) from public,anon,authenticated;
revoke all on function public.is_matchmaking_eligible(uuid) from public,anon,authenticated;
revoke all on function public.save_matchmaking_profile(jsonb) from public,anon,authenticated;
revoke all on function public.save_matchmaking_preferences(jsonb) from public,anon,authenticated;
revoke all on function public.get_my_matchmaking_setup() from public,anon,authenticated;
revoke all on function public.submit_matchmaking_profile() from public,anon,authenticated;
revoke all on function public.review_matchmaking_profile(uuid,text,text) from public,anon,authenticated;
revoke all on function public.get_matchmaking_discovery(integer,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.get_matchmaking_profile(uuid) from public,anon,authenticated;
revoke all on function public.send_matchmaking_interest(uuid) from public,anon,authenticated;
revoke all on function public.respond_matchmaking_interest(uuid,text) from public,anon,authenticated;
revoke all on function public.withdraw_matchmaking_interest(uuid) from public,anon,authenticated;
revoke all on function public.block_matchmaking_profile(uuid) from public,anon,authenticated;
revoke all on function public.report_matchmaking_profile(uuid,text,text) from public,anon,authenticated;
revoke all on function public.get_my_matchmaking_interests() from public,anon,authenticated;
revoke all on function public.get_matchmaking_admin_queue() from public,anon,authenticated;
revoke all on function public.get_matchmaking_admin_reports() from public,anon,authenticated;
revoke all on function public.review_matchmaking_report(uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_matchmaking_profile(jsonb) to authenticated;
grant execute on function public.save_matchmaking_preferences(jsonb) to authenticated;
grant execute on function public.get_my_matchmaking_setup() to authenticated;
grant execute on function public.submit_matchmaking_profile() to authenticated;
grant execute on function public.review_matchmaking_profile(uuid,text,text) to authenticated;
grant execute on function public.get_matchmaking_discovery(integer,timestamptz,uuid) to authenticated;
grant execute on function public.get_matchmaking_profile(uuid) to authenticated;
grant execute on function public.send_matchmaking_interest(uuid) to authenticated;
grant execute on function public.respond_matchmaking_interest(uuid,text) to authenticated;
grant execute on function public.withdraw_matchmaking_interest(uuid) to authenticated;
grant execute on function public.block_matchmaking_profile(uuid) to authenticated;
grant execute on function public.report_matchmaking_profile(uuid,text,text) to authenticated;
grant execute on function public.get_my_matchmaking_interests() to authenticated;
grant execute on function public.get_matchmaking_admin_queue() to authenticated;
grant execute on function public.get_matchmaking_admin_reports() to authenticated;
grant execute on function public.review_matchmaking_report(uuid,text,text) to authenticated;

commit;

