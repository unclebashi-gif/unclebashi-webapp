import { supabase } from '@/lib/supabase';
import type { CoachingDraft, CoachingProfile, MarriageSupportDraft, MarriageSupportProfile } from '@/types/supportCoaching';

export class SupportCoachingServiceError extends Error {
  readonly code: 'AUTH_REQUIRED' | 'ACCESS_INACTIVE' | 'INVALID_INTAKE' | 'UNAVAILABLE';

  constructor(code: SupportCoachingServiceError['code'], message: string) {
    super(message);
    this.name = 'SupportCoachingServiceError';
    this.code = code;
  }
}

function safeError(error: { code?: string } | null, operation: 'load' | 'save' | 'complete'): SupportCoachingServiceError {
  if (error?.code === '42501') {
    return new SupportCoachingServiceError('ACCESS_INACTIVE', 'Your account or journey is not active. Resume a paused journey before editing or completing its intake.');
  }
  if (error?.code === '28000') {
    return new SupportCoachingServiceError('AUTH_REQUIRED', 'Sign in to access this private intake.');
  }
  if (error?.code === '22023') {
    return new SupportCoachingServiceError('INVALID_INTAKE', 'Check the required responses and try again.');
  }
  const message = operation === 'load'
    ? 'Your private intake could not be loaded. Try again.'
    : operation === 'save'
      ? 'Your private intake could not be saved. Try again.'
      : 'Your intake could not be completed. Check the required responses and try again.';
  return new SupportCoachingServiceError('UNAVAILABLE', message);
}

async function getOwnerProfile<T>(rpcName: string): Promise<T | null> {
  const { data, error } = await supabase.rpc(rpcName as never);
  if (error) throw safeError(error, 'load');
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? row as T : null;
}

async function saveOwnerProfile<T>(rpcName: string, profile: object): Promise<T> {
  const { data, error } = await supabase.rpc(rpcName as never, { p_profile: profile } as never);
  if (error) throw safeError(error, 'save');
  if (!data || typeof data !== 'object') throw safeError(null, 'save');
  return data as T;
}

async function completeOwnerProfile<T>(rpcName: string): Promise<T> {
  const { data, error } = await supabase.rpc(rpcName as never);
  if (error) throw safeError(error, 'complete');
  if (!data || typeof data !== 'object') throw safeError(null, 'complete');
  return data as T;
}

export const getMyMarriageSupportProfile = () => getOwnerProfile<MarriageSupportProfile>('get_my_marriage_support_profile');
export const saveMarriageSupportProfile = (profile: MarriageSupportDraft) =>
  saveOwnerProfile<MarriageSupportProfile>('save_marriage_support_profile', profile);
export const completeMarriageSupportIntake = () => completeOwnerProfile<MarriageSupportProfile>('complete_marriage_support_intake');

export const getMyCoachingProfile = () => getOwnerProfile<CoachingProfile>('get_my_coaching_profile');
export const saveCoachingProfile = (profile: CoachingDraft) =>
  saveOwnerProfile<CoachingProfile>('save_coaching_profile', profile);
export const completeCoachingIntake = () => completeOwnerProfile<CoachingProfile>('complete_coaching_intake');
