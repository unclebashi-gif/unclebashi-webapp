const enabled = (value: string | undefined): boolean => value?.trim().toLowerCase() === 'true';

export const features = {
  matchmakingPhotosUI: enabled(import.meta.env.VITE_MATCHMAKING_PHOTOS_UI),
  matchmakingPhotosDiscovery: enabled(import.meta.env.VITE_MATCHMAKING_PHOTOS_DISCOVERY),
  marriageSupportIntake: enabled(import.meta.env.VITE_MARRIAGE_SUPPORT_INTAKE),
  coachingIntake: enabled(import.meta.env.VITE_COACHING_INTAKE),
  counsellingGateway: enabled(import.meta.env.VITE_COUNSELLING_GATEWAY),
  trustVerificationUI: enabled(import.meta.env.VITE_TRUST_VERIFICATION_UI),
  matchmakingPhoneVerificationEnforcement: enabled(import.meta.env.VITE_MATCHMAKING_PHONE_VERIFICATION_ENFORCEMENT),
  accountLifecycleUI: enabled(import.meta.env.VITE_ACCOUNT_LIFECYCLE_UI),
  hardAccountDeletion: enabled(import.meta.env.VITE_HARD_ACCOUNT_DELETION),
} as const;
