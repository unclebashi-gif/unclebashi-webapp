import { supabase } from '@/lib/supabase';
import type { User, UserRole } from '@/lib/store';

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
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const loadIdentity = async (
  authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }
): Promise<LoadedIdentity> => {
  const [profileResult, rolesResult, onboardingResult] = await Promise.all([
    supabase
      .from('users')
      .select('id,email,full_name,profile_image_url,onboarding_completed,onboarding_step,date_of_birth,gender,marriage_intention,commitment_level,values_assessment,readiness_score,matchmaking_unlocked')
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
  if (!profileResult.data) {
    throw new IdentityLoadError('profile', 'The authenticated account has no public profile row.');
  }

  const roles = rolesResult.data.map(({ role }) => role);
  if (roles.length === 0 || roles.some((role) => !supportedRoles.includes(role as UserRole))) {
    throw new IdentityLoadError('roles', 'The authenticated account has no valid application role.');
  }

  const profile = profileResult.data;
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
      fullName: profile.full_name || String(authUser.user_metadata?.full_name || 'User'),
      profileImageUrl: profile.profile_image_url || undefined,
      gender: profile.gender || undefined,
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
  };
};
