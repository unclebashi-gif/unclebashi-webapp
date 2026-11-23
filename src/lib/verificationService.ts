import { supabase } from '@/lib/supabase';

export type IdentityVerificationStatus = 'not_submitted' | 'pending' | 'verified' | 'rejected' | 'expired';
export type PhoneVerificationStatus = 'unverified' | 'pending' | 'verified';

export interface MyVerificationStatus {
  email_verified: boolean;
  phone_status: PhoneVerificationStatus;
  masked_phone: string | null;
  identity_status: IdentityVerificationStatus;
  identity_rejection_reason: string | null;
}

const identityStatuses = new Set<IdentityVerificationStatus>([
  'not_submitted', 'pending', 'verified', 'rejected', 'expired',
]);

export const getMyVerificationStatus = async (): Promise<MyVerificationStatus> => {
  const { data, error } = await supabase.rpc('get_my_verification_status');
  if (error) throw new Error(error.message || 'Could not load verification status.');

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') throw new Error('Verification status is unavailable.');

  const result = row as Record<string, unknown>;
  const phoneStatus = result.phone_status;
  const identityStatus = result.identity_status;
  if (typeof result.email_verified !== 'boolean'
      || (phoneStatus !== 'unverified' && phoneStatus !== 'pending' && phoneStatus !== 'verified')
      || typeof identityStatus !== 'string'
      || !identityStatuses.has(identityStatus as IdentityVerificationStatus)) {
    throw new Error('Verification status response was invalid.');
  }

  const maskedPhone = typeof result.masked_phone === 'string'
    && /^•{4} \d{4}$/.test(result.masked_phone)
    && phoneStatus === 'verified'
    ? result.masked_phone
    : null;

  return {
    email_verified: result.email_verified,
    phone_status: phoneStatus,
    masked_phone: maskedPhone,
    identity_status: identityStatus as IdentityVerificationStatus,
    identity_rejection_reason: typeof result.identity_rejection_reason === 'string'
      ? result.identity_rejection_reason
      : null,
  };
};
