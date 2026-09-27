-- Replace the unsupported JSONB object-length call while preserving the
-- deployed complete_onboarding contract and validation behavior.
begin;

create or replace function public.complete_onboarding(
  p_onboarding_data jsonb,
  p_marriage_intention text,
  p_commitment_level text,
  p_values_assessment text[],
  p_date_of_birth date,
  p_gender text,
  p_country_code text,
  p_city text,
  p_location text,
  p_location_category text,
  p_marriage_timeline text,
  p_partner_preferences text
)
returns table (
  id uuid,
  onboarding_completed boolean,
  onboarding_step smallint,
  readiness_score integer,
  marriage_intention text,
  commitment_level text,
  values_assessment text[],
  gender text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_readiness_answers jsonb;
  v_readiness_key_count integer;
  v_readiness_score integer;
  v_answer_count integer;
  v_total_score numeric;
  v_invalid_answer boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to complete onboarding.'
      using errcode = '42501';
  end if;

  if p_onboarding_data is null or jsonb_typeof(p_onboarding_data) is distinct from 'object' then
    raise exception 'Onboarding data must be a JSON object.'
      using errcode = '22023';
  end if;

  -- Keep the typed summary arguments consistent with the final JSON snapshot.
  if (p_onboarding_data ->> 'marriageIntention') is distinct from p_marriage_intention
    or (p_onboarding_data ->> 'commitmentLevel') is distinct from p_commitment_level
    or (p_onboarding_data ->> 'dateOfBirth')::date is distinct from p_date_of_birth
    or (p_onboarding_data ->> 'gender') is distinct from p_gender
    or (p_onboarding_data ->> 'countryCode') is distinct from p_country_code
    or (p_onboarding_data ->> 'city') is distinct from p_city
    or (p_onboarding_data ->> 'location') is distinct from p_location
    or (p_onboarding_data ->> 'locationCategory') is distinct from p_location_category
    or (p_onboarding_data ->> 'marriageTimeline') is distinct from p_marriage_timeline
    or (p_onboarding_data ->> 'partnerPreferences') is distinct from p_partner_preferences
    or to_jsonb(p_values_assessment) is distinct from p_onboarding_data -> 'selectedValues'
  then
    raise exception 'Onboarding summary values do not match the final onboarding data.'
      using errcode = '22023';
  end if;

  if p_country_code is not null and p_country_code !~ '^[A-Z]{2}$' then
    raise exception 'Country code must be a two-letter uppercase code.'
      using errcode = '22023';
  end if;

  if p_location_category is not null
    and p_location_category not in ('local', 'diaspora', 'other') then
    raise exception 'Location category is invalid.'
      using errcode = '22023';
  end if;

  if p_values_assessment is null
    or cardinality(p_values_assessment) < 3
    or cardinality(p_values_assessment) > 10 then
    raise exception 'Select between 3 and 10 values.'
      using errcode = '22023';
  end if;

  v_readiness_answers := p_onboarding_data -> 'readinessAnswers';
  if v_readiness_answers is null or jsonb_typeof(v_readiness_answers) is distinct from 'object' then
    raise exception 'All eight readiness answers are required.'
      using errcode = '22023';
  end if;

  select count(*)::integer
  into v_readiness_key_count
  from jsonb_object_keys(v_readiness_answers);

  if v_readiness_key_count <> 8
    or not (v_readiness_answers ?& array[
      'emotional', 'financial', 'communication', 'conflict',
      'accountability', 'growth', 'expectations', 'support'
    ]) then
    raise exception 'All eight readiness answers are required.'
      using errcode = '22023';
  end if;

  select
    count(*)::integer,
    coalesce(bool_or(
      jsonb_typeof(answer.value) is distinct from 'number'
      or (answer.value #>> '{}')::numeric <> trunc((answer.value #>> '{}')::numeric)
      or (answer.value #>> '{}')::numeric < 1
      or (answer.value #>> '{}')::numeric > 5
    ), false),
    sum((answer.value #>> '{}')::numeric)
  into v_answer_count, v_invalid_answer, v_total_score
  from jsonb_each(v_readiness_answers) as answer(key, value);

  if v_answer_count <> 8 or v_invalid_answer then
    raise exception 'Each readiness answer must be an integer from 1 to 5.'
      using errcode = '22023';
  end if;

  -- Match the current eight-question frontend formula: round(sum / 40 * 100).
  v_readiness_score := round((v_total_score / 40) * 100)::integer;

  perform 1
  from public.users as profile
  where profile.id = v_user_id
  for update;

  if not found then
    raise exception 'The authenticated account has no provisioned profile.'
      using errcode = 'P0002';
  end if;

  insert into public.user_onboarding_data (user_id, onboarding_data)
  values (v_user_id, p_onboarding_data)
  on conflict (user_id) do update
    set onboarding_data = excluded.onboarding_data;

  return query
  update public.users as profile
  set
    marriage_intention = p_marriage_intention,
    commitment_level = p_commitment_level,
    values_assessment = p_values_assessment,
    readiness_score = v_readiness_score,
    date_of_birth = p_date_of_birth,
    gender = p_gender,
    country_code = p_country_code,
    city = p_city,
    location = p_location,
    location_category = p_location_category,
    marriage_timeline = p_marriage_timeline,
    partner_preferences = p_partner_preferences,
    onboarding_step = 10,
    onboarding_completed = true
  where profile.id = v_user_id
  returning
    profile.id,
    profile.onboarding_completed,
    profile.onboarding_step,
    profile.readiness_score,
    profile.marriage_intention,
    profile.commitment_level,
    profile.values_assessment,
    profile.gender;
end;
$$;

revoke all on function public.complete_onboarding(
  jsonb, text, text, text[], date, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.complete_onboarding(
  jsonb, text, text, text[], date, text, text, text, text, text, text, text
) to authenticated;

commit;
