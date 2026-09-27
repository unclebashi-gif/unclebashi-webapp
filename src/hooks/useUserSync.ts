import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/lib/store';

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

  return { syncOnboardingData, syncProfileFields, completeOnboarding };
};

export default useUserSync;
