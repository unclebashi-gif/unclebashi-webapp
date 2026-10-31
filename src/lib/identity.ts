import { supabase } from '@/lib/supabase';
import type { User, UserRole } from '@/lib/store';
import type { UserJourney } from '@/types/journey';

const supportedRoles: readonly UserRole[] = ['user', 'coach', 'moderator', 'admin'];

export type IdentityFailureKind = 'profile' | 'roles' | 'database';

export class IdentityLoadError extends Error {
  constructor(
    readonly kind: IdentityFailureKind,
    message: string
  ) {
    super(message);
    this.name = 'IdentityLoadError';
  }
}

export interface LoadedIdentity {
  user: User;
  onboardingData: Record<string, unknown>;
  journeys: UserJourney[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const loadIdentity = async (
  authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }
): Promise<LoadedIdentity> => {
  const [profileResult, rolesResult, onboardingResult, journeysResult] = await Promise.all([
    supabase
      .from('users')
      .select('id,email,full_name,display_name,profile_image_url,onboarding_completed,onboarding_step,date_of_birth,gender,nationality_country_code,country_of_origin_code,country_code,city,primary_language,other_languages,legal_marital_status,relationship_situation,primary_reason_for_joining,account_status,marriage_intention,commitment_level,values_assessment,readiness_score,matchmaking_unlocked')
      .eq('id', authUser.id)
      .maybeSingle(),
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', authUser.id),
    supabase
      .from('user_onboarding_data')
      .select('onboarding_data')
      .eq('user_id', authUser.id)
      .maybeSingle(),
    supabase
      .from('user_journeys')
      .select('*')
      .eq('user_id', authUser.id)
      .order('created_at', { ascending: true }),
  ]);

  if (profileResult.error) {
    throw new IdentityLoadError('database', profileResult.error.message);
  }
  if (rolesResult.error) {
    throw new IdentityLoadError('database', rolesResult.error.message);
  }
  if (onboardingResult.error) {
    throw new IdentityLoadError('database', onboardingResult.error.message);
  }
  if (journeysResult.error) {
    throw new IdentityLoadError('database', journeysResult.error.message);
  }
  if (!profileResult.data) {
    throw new IdentityLoadError('profile', 'The authenticated account has no public profile row.');
  }

  const roles = rolesResult.data.map(({ role }) => role);
  if (roles.length === 0 || roles.some((role) => !supportedRoles.includes(role as UserRole))) {
    throw new IdentityLoadError('roles', 'The authenticated account has no valid application role.');
  }

  const profile = profileResult.data;
  const journeys = (journeysResult.data ?? []) as UserJourney[];
  const onboardingData = isRecord(onboardingResult.data?.onboarding_data)
    ? onboardingResult.data.onboarding_data
    : {};
  const savedStep = onboardingData._currentStep;
  const databaseStep = profile.onboarding_step ?? 0;
  const onboardingStep =
    typeof savedStep === 'number' && Number.isInteger(savedStep) && savedStep >= 0 && savedStep <= 10
      ? savedStep
      : databaseStep;

  return {
    user: {
      id: authUser.id,
      email: profile.email || authUser.email || '',
      fullName: profile.display_name || profile.full_name || String(authUser.user_metadata?.full_name || 'User'),
      displayName: profile.display_name || profile.full_name || undefined,
      profileImageUrl: profile.profile_image_url || undefined,
      dateOfBirth: profile.date_of_birth || undefined,
      gender: profile.gender || undefined,
      nationalityCountryCode: profile.nationality_country_code || undefined,
      countryOfOriginCode: profile.country_of_origin_code || undefined,
      countryCode: profile.country_code || undefined,
      city: profile.city || undefined,
      primaryLanguage: profile.primary_language || undefined,
      otherLanguages: Array.isArray(profile.other_languages)
        ? profile.other_languages.filter((value): value is string => typeof value === 'string')
        : [],
      legalMaritalStatus: profile.legal_marital_status || undefined,
      relationshipSituation: profile.relationship_situation || undefined,
      primaryReasonForJoining: profile.primary_reason_for_joining || undefined,
      accountStatus: profile.account_status,
      onboardingCompleted: profile.onboarding_completed,
      onboardingStep,
      marriageIntention: profile.marriage_intention || undefined,
      commitmentLevel: profile.commitment_level || undefined,
      valuesAssessment: Array.isArray(profile.values_assessment)
        ? profile.values_assessment.filter((value): value is string => typeof value === 'string')
        : [],
      readinessScore: profile.readiness_score ?? 0,
      matchmakingUnlocked: profile.matchmaking_unlocked,
      roles: roles as UserRole[],
    },
    onboardingData,
    journeys,
  };
};
