import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/lib/store';
import type { JourneyType, UserJourney } from '@/types/journey';

export interface OnboardingCompletionInput {
  onboardingData: Record<string, unknown>;
  marriageIntention?: string;
  commitmentLevel?: string;
  valuesAssessment: string[];
  dateOfBirth?: string;
  gender?: string;
  countryCode?: string;
  city?: string;
  location?: string;
  locationCategory?: string;
  marriageTimeline?: string;
  partnerPreferences?: string;
}

export interface OnboardingCompletionResult {
  id: string;
  onboardingCompleted: true;
  onboardingStep: 10;
  readinessScore: number;
  marriageIntention: string | null;
  commitmentLevel: string | null;
  valuesAssessment: string[];
  gender: string | null;
}

export interface CoreOnboardingCompletionInput {
  onboardingData: Record<string, unknown>;
  displayName: string;
  dateOfBirth: string;
  gender: 'male' | 'female';
  nationalityCountryCode: string;
  countryOfOriginCode: string;
  countryCode: string;
  city: string;
  primaryLanguage: string;
  otherLanguages: string[];
  legalMaritalStatus: string;
  relationshipSituation: string;
  primaryReasonForJoining: JourneyType;
}

export interface CoreOnboardingCompletionResult {
  userId: string;
  onboardingCompleted: true;
  onboardingStep: 10;
  displayName: string;
  dateOfBirth: string;
  gender: 'male' | 'female';
  nationalityCountryCode: string;
  countryOfOriginCode: string;
  countryCode: string;
  city: string;
  primaryLanguage: string;
  otherLanguages: string[];
  legalMaritalStatus: string;
  relationshipSituation: string;
  primaryReasonForJoining: JourneyType;
  journey: UserJourney;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

/** Persist only fields allowed by the current identity-schema grants. */
export const useUserSync = () => {
  const user = useAppStore((state) => state.user);

  const syncOnboardingData = useCallback(async (onboardingData: Record<string, unknown>) => {
    const { error } = await supabase.rpc('save_onboarding_data', {
      p_onboarding_data: onboardingData,
    });

    if (error) throw new Error(`Could not save onboarding data: ${error.message}`);
  }, []);

  const syncProfileFields = useCallback(async (fields: {
    fullName?: string;
    bio?: string;
    location?: string;
    occupation?: string;
    profileImageUrl?: string;
  }) => {
    if (!user?.id) throw new Error('Cannot save profile without an authenticated user.');

    const dbFields: Record<string, string> = {};
    if (fields.fullName !== undefined) dbFields.full_name = fields.fullName;
    if (fields.bio !== undefined) dbFields.bio = fields.bio;
    if (fields.location !== undefined) dbFields.location = fields.location;
    if (fields.occupation !== undefined) dbFields.occupation = fields.occupation;
    if (fields.profileImageUrl !== undefined) dbFields.profile_image_url = fields.profileImageUrl;

    if (Object.keys(dbFields).length === 0) return;

    const { data, error } = await supabase
      .from('users')
      .update(dbFields)
      .eq('id', user.id)
      .select('id')
      .maybeSingle();

    if (error) throw new Error(`Could not save profile: ${error.message}`);
    if (!data) throw new Error('The profile row was not updated.');
  }, [user?.id]);

  const completeOnboarding = useCallback(async (input: OnboardingCompletionInput) => {
    if (!user?.id) throw new Error('Cannot complete onboarding without an authenticated user.');

    const { data, error } = await supabase.rpc('complete_onboarding', {
      p_onboarding_data: input.onboardingData,
      p_marriage_intention: input.marriageIntention ?? null,
      p_commitment_level: input.commitmentLevel ?? null,
      p_values_assessment: input.valuesAssessment,
      p_date_of_birth: input.dateOfBirth ?? null,
      p_gender: input.gender ?? null,
      p_country_code: input.countryCode ?? null,
      p_city: input.city ?? null,
      p_location: input.location ?? null,
      p_location_category: input.locationCategory ?? null,
      p_marriage_timeline: input.marriageTimeline ?? null,
      p_partner_preferences: input.partnerPreferences ?? null,
    });

    if (error) throw new Error(`Could not complete onboarding: ${error.message}`);
    if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) {
      throw new Error('Onboarding completion was not confirmed by the server.');
    }

    const row = data[0];
    if (
      typeof row.id !== 'string' ||
      row.id !== user.id ||
      row.onboarding_completed !== true ||
      row.onboarding_step !== 10 ||
      typeof row.readiness_score !== 'number' ||
      !isNullableString(row.marriage_intention) ||
      !isNullableString(row.commitment_level) ||
      !isNullableString(row.gender) ||
      !Array.isArray(row.values_assessment) ||
      !row.values_assessment.every((value): value is string => typeof value === 'string')
    ) {
      throw new Error('The server returned incomplete onboarding completion data.');
    }

    return {
      id: row.id,
      onboardingCompleted: true,
      onboardingStep: 10,
      readinessScore: row.readiness_score,
      marriageIntention: row.marriage_intention,
      commitmentLevel: row.commitment_level,
      valuesAssessment: row.values_assessment,
      gender: row.gender,
    } satisfies OnboardingCompletionResult;
  }, [user?.id]);

  const completeCoreOnboardingV2 = useCallback(async (
    input: CoreOnboardingCompletionInput
  ): Promise<CoreOnboardingCompletionResult> => {
    if (!user?.id) throw new Error('Cannot complete onboarding without an authenticated user.');
    const { data, error } = await supabase.rpc('complete_core_onboarding_v2', {
      p_onboarding_data: input.onboardingData,
      p_display_name: input.displayName,
      p_date_of_birth: input.dateOfBirth,
      p_gender: input.gender,
      p_nationality_country_code: input.nationalityCountryCode,
      p_country_of_origin_code: input.countryOfOriginCode,
      p_country_code: input.countryCode,
      p_city: input.city,
      p_primary_language: input.primaryLanguage,
      p_other_languages: input.otherLanguages,
      p_legal_marital_status: input.legalMaritalStatus,
      p_relationship_situation: input.relationshipSituation,
      p_primary_reason_for_joining: input.primaryReasonForJoining,
    });
    if (error) throw new Error(`Could not complete setup: ${error.message}`);
    if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) {
      throw new Error('Setup completion was not confirmed by the server.');
    }

    const row = data[0];
    if (
      row.id !== user.id || row.onboarding_completed !== true || row.onboarding_step !== 10 ||
      typeof row.display_name !== 'string' || typeof row.date_of_birth !== 'string' ||
      (row.gender !== 'male' && row.gender !== 'female') ||
      typeof row.nationality_country_code !== 'string' ||
      typeof row.country_of_origin_code !== 'string' || typeof row.country_code !== 'string' ||
      typeof row.city !== 'string' || typeof row.primary_language !== 'string' ||
      !Array.isArray(row.other_languages) ||
      typeof row.legal_marital_status !== 'string' ||
      typeof row.relationship_situation !== 'string' ||
      typeof row.primary_reason_for_joining !== 'string' ||
      typeof row.journey_type !== 'string' || row.journey_status !== 'active' || row.journey_is_primary !== true
    ) {
      throw new Error('The server returned incomplete setup completion data.');
    }

    const journey: UserJourney = {
      user_id: row.id,
      journey_type: row.journey_type as JourneyType,
      status: 'active',
      is_primary: true,
      started_at: String(row.journey_started_at),
      completed_at: null,
      withdrawn_at: null,
      created_at: String(row.journey_created_at),
      updated_at: String(row.journey_updated_at),
    };
    return {
      userId: row.id,
      onboardingCompleted: true,
      onboardingStep: 10,
      displayName: row.display_name,
      dateOfBirth: row.date_of_birth,
      gender: row.gender,
      nationalityCountryCode: row.nationality_country_code,
      countryOfOriginCode: row.country_of_origin_code,
      countryCode: row.country_code,
      city: row.city,
      primaryLanguage: row.primary_language,
      otherLanguages: row.other_languages.filter((value): value is string => typeof value === 'string'),
      legalMaritalStatus: row.legal_marital_status,
      relationshipSituation: row.relationship_situation,
      primaryReasonForJoining: row.primary_reason_for_joining as JourneyType,
      journey,
    };
  }, [user?.id]);

  return { syncOnboardingData, syncProfileFields, completeOnboarding, completeCoreOnboardingV2 };
};

export default useUserSync;
