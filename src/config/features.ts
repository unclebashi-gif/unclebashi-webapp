const enabled = (value: string | undefined): boolean => value?.trim().toLowerCase() === 'true';

export const features = {
  matchmakingPhotosUI: enabled(import.meta.env.VITE_MATCHMAKING_PHOTOS_UI),
  matchmakingPhotosDiscovery: enabled(import.meta.env.VITE_MATCHMAKING_PHOTOS_DISCOVERY),
  marriageSupportIntake: enabled(import.meta.env.VITE_MARRIAGE_SUPPORT_INTAKE),
  coachingIntake: enabled(import.meta.env.VITE_COACHING_INTAKE),
  counsellingGateway: enabled(import.meta.env.VITE_COUNSELLING_GATEWAY),
} as const;
