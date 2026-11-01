begin;

do $preconditions$
begin
  if pg_catalog.to_regclass('public.matchmaking_profiles') is null
     or pg_catalog.to_regclass('public.matchmaking_preferences') is null
     or pg_catalog.to_regclass('public.matchmaking_interests') is null
     or pg_catalog.to_regclass('public.matchmaking_blocks') is null
     or pg_catalog.to_regclass('public.users') is null then
    raise exception 'Required Matchmaking profile, preference, interest, block, or user tables are missing.';
  end if;
  if pg_catalog.to_regprocedure('public.is_matchmaking_eligible(uuid)') is null
     or pg_catalog.to_regprocedure('public.has_community_role(text)') is null
     or pg_catalog.to_regprocedure('public.get_matchmaking_discovery(integer,timestamptz,uuid)') is null
     or pg_catalog.to_regprocedure('public.get_my_matchmaking_interests()') is null
     or pg_catalog.to_regprocedure('public.get_matchmaking_profile(uuid)') is null
     or pg_catalog.to_regprocedure('public.get_matchmaking_admin_profile_detail(uuid)') is null
     or pg_catalog.to_regprocedure('public.review_matchmaking_profile(uuid,text,text)') is null then
    raise exception 'Required Matchmaking authorization or RPC functions are missing.';
  end if;
end;
$preconditions$;

alter table public.matchmaking_profiles
  add column last_approved_review_snapshot jsonb,
  add column last_approved_at timestamptz;

create or replace function public._matchmaking_review_snapshot(p_profile public.matchmaking_profiles)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'legal_marital_status', (
      select account.legal_marital_status
      from public.users as account
      where account.id = (p_profile).user_id
    ),
    'country_code', (
      select account.country_code
      from public.users as account
      where account.id = (p_profile).user_id
    ),
    'city', (
      select account.city
      from public.users as account
      where account.id = (p_profile).user_id
    ),
    'height_cm',(p_profile).height_cm,
    'physical_self_description',(p_profile).physical_self_description,
    'introduction',(p_profile).introduction,
    'marriage_vision_response',(p_profile).marriage_vision_response,
    'education_level',(p_profile).education_level,
    'field_of_study',(p_profile).field_of_study,
    'occupation',(p_profile).occupation,
    'employment_status',(p_profile).employment_status,
    'has_children',(p_profile).has_children,
    'wants_children',(p_profile).wants_children,
    'smoking',(p_profile).smoking,
    'drinking',(p_profile).drinking,
    'family_background',(p_profile).family_background,
    'family_involvement',(p_profile).family_involvement,
    'marriage_timeline',(p_profile).marriage_timeline,
    'marriage_structure',(p_profile).marriage_structure,
    'willing_to_relocate',(p_profile).willing_to_relocate,
    'long_distance_openness',(p_profile).long_distance_openness,
    'provider_model',(p_profile).provider_model,
    'family_in_law_expectations',(p_profile).family_in_law_expectations,
    'show_religion',(p_profile).show_religion,
    'religion_or_faith',case when (p_profile).show_religion then (p_profile).religion_or_faith else null end,
    'faith_practice_level',case when (p_profile).show_religion then (p_profile).faith_practice_level else null end,
    'denomination_or_tradition',case when (p_profile).show_religion then (p_profile).denomination_or_tradition else null end,
    'faith_expectations',case when (p_profile).show_religion then (p_profile).faith_expectations else null end,
    'show_cultural_community',(p_profile).show_cultural_community,
    'cultural_or_ethnic_community',case when (p_profile).show_cultural_community then (p_profile).cultural_or_ethnic_community else null end,
    'show_clan_or_region',(p_profile).show_clan_or_region,
    'clan_or_region',case when (p_profile).show_clan_or_region then (p_profile).clan_or_region else null end
  )
$function$;

revoke all on function public._matchmaking_review_snapshot(public.matchmaking_profiles) from public,anon,authenticated;

update public.matchmaking_profiles as profile_row
set last_approved_review_snapshot = public._matchmaking_review_snapshot(profile_row),
    last_approved_at = coalesce(profile_row.last_approved_at, profile_row.reviewed_at, profile_row.updated_at, now())
where profile_row.status = 'approved'
  and profile_row.profile_version >= 2
  and profile_row.last_approved_review_snapshot is null;

create or replace function public.review_matchmaking_profile(p_profile_user_id uuid,p_action text,p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_profile public.matchmaking_profiles%rowtype;
begin
  if v_actor is null or not public.has_community_role('admin') then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('approve','reject','hide') then
    raise exception 'Invalid review action' using errcode = '22023';
  end if;
  if p_action in ('approve','reject') and not exists (
    select 1 from public.matchmaking_profiles as profile_row
    where profile_row.user_id = p_profile_user_id and profile_row.status = 'pending_review'
  ) then
    raise exception 'Only submitted profiles can be approved or rejected' using errcode = '22023';
  end if;

  update public.matchmaking_profiles
  set status = case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'hidden' end,
      reviewed_by = v_actor,
      reviewed_at = now(),
      review_notes = nullif(btrim(p_notes), '')
  where user_id = p_profile_user_id;
  if not found then raise exception 'Profile not found' using errcode = 'P0002'; end if;

  if p_action = 'approve' and not public.is_matchmaking_eligible(p_profile_user_id) then
    raise exception 'Profile does not meet current eligibility requirements' using errcode = '22023';
  end if;

  if p_action = 'approve' then
    update public.matchmaking_profiles as profile_row
    set last_approved_review_snapshot = public._matchmaking_review_snapshot(profile_row),
        last_approved_at = now()
    where profile_row.user_id = p_profile_user_id;
  end if;

  select profile_row.* into strict v_profile
  from public.matchmaking_profiles as profile_row
  where profile_row.user_id = p_profile_user_id;
  return to_jsonb(v_profile);
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
  if v_admin is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if not public.has_community_role('admin') then raise exception 'Admin role required.' using errcode = '42501'; end if;

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
    'show_religion', profile_row.show_religion,
    'religion_or_faith', case when profile_row.show_religion then profile_row.religion_or_faith else null end,
    'faith_practice_level', case when profile_row.show_religion then profile_row.faith_practice_level else null end,
    'denomination_or_tradition', case when profile_row.show_religion then profile_row.denomination_or_tradition else null end,
    'faith_expectations', case when profile_row.show_religion then profile_row.faith_expectations else null end,
    'show_cultural_community', profile_row.show_cultural_community,
    'cultural_or_ethnic_community', case when profile_row.show_cultural_community then profile_row.cultural_or_ethnic_community else null end,
    'show_clan_or_region', profile_row.show_clan_or_region,
    'clan_or_region', case when profile_row.show_clan_or_region then profile_row.clan_or_region else null end,
    'previous_approved_snapshot', profile_row.last_approved_review_snapshot
  ) into v_result
  from public.matchmaking_profiles as profile_row
  join public.users as account on account.id = profile_row.user_id
  where profile_row.user_id = p_profile_user_id;

  if v_result is null then raise exception 'Matchmaking profile not found.' using errcode = 'P0002'; end if;
  return v_result;
end;
$function$;

drop function public.get_matchmaking_discovery(integer,timestamptz,uuid);
create function public.get_matchmaking_discovery(
  p_limit integer default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_user_id uuid default null
)
returns table(
  profile_identifier uuid, public_first_name text, age integer, gender text,
  nationality_country_code text, country_of_origin_code text, country_code text, city text,
  introduction text, education_level text, occupation text, marital_status text, has_children boolean,
  wants_children text, languages text[], interests text[], willing_to_relocate text,
  values_assessment text[], profile_image_url text, religion_or_faith text,
  cultural_or_ethnic_community text, created_at timestamptz
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
    select profile_row.id as profile_id, profile_row.created_at,
      nullif(split_part(btrim(coalesce(account.display_name, '')), ' ', 1), '') as first_name,
      extract(year from age(current_date,account.date_of_birth))::integer as candidate_age,
      account.gender as candidate_gender, account.country_code as candidate_country, account.city as candidate_city,
      profile_row.introduction, profile_row.education_level, profile_row.occupation,
      account.legal_marital_status as candidate_marital, profile_row.has_children, profile_row.wants_children,
      profile_row.willing_to_relocate,
      case when profile_row.use_profile_image_for_matchmaking then account.profile_image_url else null end as candidate_image,
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
  select candidates.profile_id,candidates.first_name,candidates.candidate_age,candidates.candidate_gender,
    null::text,null::text,candidates.candidate_country,candidates.candidate_city,candidates.introduction,
    null::text,null::text,null::text,null::boolean,null::text,array[]::text[],array[]::text[],null::text,
    array[]::text[],candidates.candidate_image,null::text,null::text,candidates.created_at
  from candidates
  where p_cursor_created_at is null
     or candidates.preference_rank < v_cursor_rank
     or (candidates.preference_rank=v_cursor_rank and (candidates.created_at < p_cursor_created_at
         or (candidates.created_at=p_cursor_created_at and candidates.profile_id > p_cursor_user_id)))
  order by candidates.preference_rank desc,candidates.created_at desc,candidates.profile_id asc
  limit v_limit;
end;
$function$;

drop function public.get_my_matchmaking_interests();
create function public.get_my_matchmaking_interests()
returns table(interest_id uuid,other_profile_identifier uuid,direction text,status text,public_first_name text,age integer,country_code text,city text,profile_image_url text,created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  return query
  select i.id,p.id,
    case when i.initiator_user_id=v_user then 'outgoing' else 'incoming' end,
    i.status,
    nullif(split_part(btrim(coalesce(u.display_name, '')), ' ', 1), ''),
    extract(year from age(current_date,u.date_of_birth))::integer,
    u.country_code,u.city,
    case when p.use_profile_image_for_matchmaking then u.profile_image_url else null end,
    i.created_at
  from public.matchmaking_interests as i
  join public.users as u on u.id=case when i.initiator_user_id=v_user then i.recipient_user_id else i.initiator_user_id end
  join public.matchmaking_profiles as p on p.user_id=u.id
  where (i.initiator_user_id=v_user or i.recipient_user_id=v_user)
    and not exists(select 1 from public.matchmaking_blocks as b where (b.blocker_user_id=v_user and b.blocked_user_id=u.id) or (b.blocker_user_id=u.id and b.blocked_user_id=v_user))
  order by i.updated_at desc;
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
    v_count := 0;
    for v_row in select * from public.get_matchmaking_discovery(50,v_cursor,v_cursor_id) loop
      v_count := v_count + 1;
      if v_row.profile_identifier = p_profile_identifier then
        select * into strict v_profile from public.matchmaking_profiles where id=p_profile_identifier;
        select * into strict v_account from public.users where id=v_profile.user_id;
        select * into strict v_preferences from public.matchmaking_preferences where user_id=v_user;
        if v_account.date_of_birth between (current_date - make_interval(years=>v_preferences.age_max))::date and (current_date - make_interval(years=>v_preferences.age_min))::date then v_alignments:=array_append(v_alignments,'Within your preferred age range'); end if;
        if v_preferences.residence_mode in ('required','preferred') and v_account.country_code=any(v_preferences.preferred_residences) then v_alignments:=array_append(v_alignments,'Location aligns with your preference'); end if;
        if v_preferences.religion_mode in ('required','preferred') and v_profile.show_religion and v_profile.use_religion_for_matching and v_profile.religion_or_faith=any(v_preferences.preferred_religions) then v_alignments:=array_append(v_alignments,'Faith aligns with your preference'); end if;
        if v_preferences.marital_status_mode in ('required','preferred') and v_account.legal_marital_status=any(v_preferences.preferred_marital_statuses) then v_alignments:=array_append(v_alignments,'Marital history aligns'); end if;
        if v_preferences.children_mode in ('required','preferred') and (case when v_profile.has_children then 'has_children' else 'no_children' end)=any(v_preferences.preferred_children_statuses) then v_alignments:=array_append(v_alignments,'Children preference aligns'); end if;
        if v_preferences.wants_children_mode in ('required','preferred') and v_profile.wants_children=any(v_preferences.preferred_wants_children) then v_alignments:=array_append(v_alignments,'Future-family plans align'); end if;
        if v_preferences.relocation_mode in ('required','preferred') and v_profile.willing_to_relocate=any(v_preferences.preferred_relocation) then v_alignments:=array_append(v_alignments,'Relocation preference aligns'); end if;
        v_result := jsonb_build_object(
          'profile_identifier',v_profile.id,
          'public_first_name',nullif(split_part(btrim(coalesce(v_account.display_name, '')), ' ', 1), ''),
          'age',extract(year from age(current_date,v_account.date_of_birth))::integer,
          'gender',v_account.gender,'country_code',v_account.country_code,'city',v_account.city,
          'introduction',v_profile.introduction,'marriage_vision_response',v_profile.marriage_vision_response,
          'physical_self_description',v_profile.physical_self_description,'height_cm',v_profile.height_cm,
          'education_level',v_profile.education_level,'field_of_study',v_profile.field_of_study,'occupation',v_profile.occupation,
          'marital_status',v_account.legal_marital_status,'has_children',v_profile.has_children,'wants_children',v_profile.wants_children,
          'languages',pg_catalog.array_remove(array[v_account.primary_language] || coalesce(v_account.other_languages,array[]::text[]),null),
          'willing_to_relocate',v_profile.willing_to_relocate,'marriage_timeline',v_profile.marriage_timeline,
          'marriage_structure',v_profile.marriage_structure,'long_distance_openness',v_profile.long_distance_openness,
          'provider_model',v_profile.provider_model,'family_in_law_expectations',v_profile.family_in_law_expectations,
          'family_involvement',v_profile.family_involvement,'family_background',v_profile.family_background,
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
      v_cursor := v_row.created_at;
      v_cursor_id := v_row.profile_identifier;
    end loop;
    exit when v_count < 50;
  end loop;
  raise exception 'Profile unavailable.' using errcode='P0002';
end;
$function$;

revoke all on function public._matchmaking_review_snapshot(public.matchmaking_profiles) from public,anon,authenticated;
revoke all on function public.review_matchmaking_profile(uuid,text,text) from public,anon,authenticated;
revoke all on function public.get_matchmaking_discovery(integer,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.get_my_matchmaking_interests() from public,anon,authenticated;
revoke all on function public.get_matchmaking_profile(uuid) from public,anon,authenticated;
revoke all on function public.get_matchmaking_admin_profile_detail(uuid) from public,anon,authenticated;
grant execute on function public.review_matchmaking_profile(uuid,text,text) to authenticated;
grant execute on function public.get_matchmaking_discovery(integer,timestamptz,uuid) to authenticated;
grant execute on function public.get_my_matchmaking_interests() to authenticated;
grant execute on function public.get_matchmaking_profile(uuid) to authenticated;
grant execute on function public.get_matchmaking_admin_profile_detail(uuid) to authenticated;

do $postconditions$
begin
  if pg_catalog.to_regclass('public.matchmaking_profiles') is null
     or not exists (
       select 1 from pg_catalog.pg_attribute as a
       where a.attrelid = 'public.matchmaking_profiles'::regclass
         and a.attname = 'last_approved_review_snapshot'
         and not a.attisdropped
     )
     or not exists (
       select 1 from pg_catalog.pg_attribute as a
       where a.attrelid = 'public.matchmaking_profiles'::regclass
         and a.attname = 'last_approved_at'
         and not a.attisdropped
     ) then
    raise exception 'Postcondition failed: approved review snapshot columns are missing.';
  end if;
  if exists (
    select 1
    from public.matchmaking_profiles as profile_row
    where profile_row.status = 'approved'
      and profile_row.profile_version >= 2
      and profile_row.last_approved_review_snapshot is null
  ) then
    raise exception 'Postcondition failed: an approved v2 profile has no review snapshot.';
  end if;
  if pg_catalog.to_regprocedure('public._matchmaking_review_snapshot(public.matchmaking_profiles)') is null then
    raise exception 'Postcondition failed: review snapshot helper is missing.';
  end if;
  if pg_catalog.has_function_privilege('authenticated','public._matchmaking_review_snapshot(public.matchmaking_profiles)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public._matchmaking_review_snapshot(public.matchmaking_profiles)','EXECUTE') then
    raise exception 'Postcondition failed: review snapshot helper must remain private.';
  end if;
  if pg_catalog.has_function_privilege('anon','public.get_matchmaking_discovery(integer,timestamptz,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.get_my_matchmaking_interests()','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.get_matchmaking_profile(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.review_matchmaking_profile(uuid,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.get_matchmaking_admin_profile_detail(uuid)','EXECUTE') then
    raise exception 'Postcondition failed: anonymous Matchmaking RPC access exists.';
  end if;
  if not pg_catalog.has_function_privilege('authenticated','public.get_matchmaking_discovery(integer,timestamptz,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.get_my_matchmaking_interests()','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.get_matchmaking_profile(uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.review_matchmaking_profile(uuid,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.get_matchmaking_admin_profile_detail(uuid)','EXECUTE') then
    raise exception 'Postcondition failed: authenticated Matchmaking RPC access is incomplete.';
  end if;
  if pg_catalog.pg_get_function_result('public.get_matchmaking_discovery(integer,timestamptz,uuid)'::regprocedure) not like '%public_first_name text%'
     or pg_catalog.pg_get_function_result('public.get_my_matchmaking_interests()'::regprocedure) not like '%public_first_name text%' then
    raise exception 'Postcondition failed: member-facing first-name projections are missing.';
  end if;
end;
$postconditions$;

commit;
