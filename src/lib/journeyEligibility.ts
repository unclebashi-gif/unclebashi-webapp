import type { User } from '@/lib/store';
import type { JourneyType } from '@/types/journey';

export const matchmakingCoreEligible = (user: User | null): boolean => Boolean(
  user
  && ['never_married', 'divorced', 'widowed', 'annulled'].includes(user.legalMaritalStatus || '')
  && user.relationshipSituation === 'single',
);

export const journeyCoreEligible = (user: User | null, type: JourneyType): boolean => {
  if (!user || user.accountStatus !== 'active' || !user.onboardingCompleted) return false;
  if (type === 'matchmaking') return matchmakingCoreEligible(user);
  if (type === 'marriage_support') {
    return ['married', 'separated'].includes(user.legalMaritalStatus || '')
      || ['married', 'separated'].includes(user.relationshipSituation || '');
  }
  return true;
};

export const journeyEligibilityMessage = (type: JourneyType): string => {
  if (type === 'matchmaking') {
    return 'Marriage Matching is available when your legal marital status is never married, divorced, widowed or annulled, and your current relationship situation is single.';
  }
  if (type === 'marriage_support') {
    return 'Marriage Support is available when your core profile indicates a married or separated situation.';
  }
  return 'Complete your account setup before activating this journey.';
};
