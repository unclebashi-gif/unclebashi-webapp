import { supabase } from '@/lib/supabase';
import type {
  AdminCounsellingRequest,
  CounsellingRequest,
  CounsellingRequestDraft,
  CounsellingRequestStatus,
} from '@/types/counselling';

export class CounsellingServiceError extends Error {
  readonly code: 'AUTH_REQUIRED' | 'ACCESS_INACTIVE' | 'INVALID_REQUEST' | 'NOT_AUTHORIZED' | 'UNAVAILABLE';

  constructor(code: CounsellingServiceError['code'], message: string) {
    super(message);
    this.name = 'CounsellingServiceError';
    this.code = code;
  }
}

const safeError = (error: { code?: string } | null, operation: 'load' | 'save' | 'submit' | 'withdraw' | 'admin'): CounsellingServiceError => {
  if (operation === 'admin' && error?.code === '42501') return new CounsellingServiceError('NOT_AUTHORIZED', 'You are not authorized to manage counselling requests.');
  if (error?.code === '28000') return new CounsellingServiceError('AUTH_REQUIRED', 'Sign in to use this counselling request.');
  if (operation === 'withdraw' && error?.code === '42501') return new CounsellingServiceError('ACCESS_INACTIVE', 'An active account is required to withdraw this request.');
  if (error?.code === '42501') {
    return new CounsellingServiceError('ACCESS_INACTIVE', 'Your account or Counselling journey is not active. Resume a paused journey before editing or submitting.');
  }
  if (error?.code === '22023') return new CounsellingServiceError('INVALID_REQUEST', 'Check the required request details and try again.');
  const message = operation === 'load'
    ? 'Your counselling request could not be loaded. Try again.'
    : operation === 'save'
      ? 'Your counselling request could not be saved. Try again.'
      : operation === 'submit'
        ? 'Your counselling request could not be submitted. Try again.'
        : operation === 'withdraw'
          ? 'Your counselling request could not be withdrawn. Try again.'
          : 'Counselling requests could not be managed. Try again.';
  return new CounsellingServiceError('UNAVAILABLE', message);
};

export const getMyCounsellingRequest = async (): Promise<CounsellingRequest | null> => {
  const { data, error } = await supabase.rpc('get_my_counselling_request');
  if (error) throw safeError(error, 'load');
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? row as CounsellingRequest : null;
};

export const saveCounsellingRequest = async (request: CounsellingRequestDraft): Promise<CounsellingRequest> => {
  const { data, error } = await supabase.rpc('save_counselling_request', { p_request: request } as never);
  if (error) throw safeError(error, 'save');
  if (!data || typeof data !== 'object') throw safeError(null, 'save');
  return data as CounsellingRequest;
};

export const submitCounsellingRequest = async (): Promise<CounsellingRequest> => {
  const { data, error } = await supabase.rpc('submit_counselling_request');
  if (error) throw safeError(error, 'submit');
  if (!data || typeof data !== 'object') throw safeError(null, 'submit');
  return data as CounsellingRequest;
};

export const withdrawCounsellingRequest = async (): Promise<CounsellingRequest> => {
  const { data, error } = await supabase.rpc('withdraw_counselling_request');
  if (error) throw safeError(error, 'withdraw');
  if (!data || typeof data !== 'object') throw safeError(null, 'withdraw');
  return data as CounsellingRequest;
};

export const getAdminCounsellingRequests = async (status?: CounsellingRequestStatus): Promise<AdminCounsellingRequest[]> => {
  const { data, error } = await supabase.rpc('get_counselling_request_queue', {
    p_status: status ?? null,
    p_limit: 100,
  } as never);
  if (error) throw safeError(error, 'admin');
  return Array.isArray(data) ? data as AdminCounsellingRequest[] : [];
};

export const updateCounsellingRequestStatus = async (
  requestId: string,
  status: Extract<CounsellingRequestStatus, 'under_review' | 'contacted' | 'referred' | 'closed'>,
): Promise<CounsellingRequestStatus> => {
  const { data, error } = await supabase.rpc('update_counselling_request_status', {
    p_request_id: requestId,
    p_status: status,
  } as never);
  if (error) throw safeError(error, 'admin');
  if (typeof data !== 'string') throw safeError(null, 'admin');
  return data as CounsellingRequestStatus;
};
