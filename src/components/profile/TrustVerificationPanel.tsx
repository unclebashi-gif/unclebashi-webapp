import React, { useCallback, useEffect, useState } from 'react';
import { getMyVerificationStatus, type MyVerificationStatus } from '@/lib/verificationService';
import { Button } from '@/components/ui/button';

interface TrustVerificationPanelProps {
  matchmakingReadiness?: boolean;
}

const identityLabel: Record<MyVerificationStatus['identity_status'], string> = {
  not_submitted: 'Not submitted',
  pending: 'Pending',
  verified: 'Verified',
  rejected: 'Rejected',
  expired: 'Expired',
};

export const TrustVerificationPanel: React.FC<TrustVerificationPanelProps> = ({ matchmakingReadiness = false }) => {
  const [status, setStatus] = useState<MyVerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStatus(await getMyVerificationStatus());
    } catch (cause) {
      setStatus(null);
      setError(cause instanceof Error ? cause.message : 'Could not load verification status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  return <section className="rounded-xl bg-white p-6 shadow-sm" aria-labelledby="trust-verification-heading">
    <h2 id="trust-verification-heading" className="text-xl font-semibold text-[#1e3a5f]">
      {matchmakingReadiness ? 'Verification readiness' : 'Verification'}
    </h2>
    {loading ? <p className="mt-3 text-sm text-gray-600" role="status">Loading your verification status…</p> : error ? <div className="mt-3" role="alert">
      <p className="text-sm text-red-700">{error}</p>
      <Button className="mt-3" size="sm" variant="outline" onClick={() => void loadStatus()}>Retry</Button>
    </div> : status && <>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3 text-sm">
        <div><dt className="text-gray-500">Email</dt><dd className="font-medium">{status.email_verified ? 'Verified' : 'Not verified'}</dd></div>
        <div><dt className="text-gray-500">Phone</dt><dd className="font-medium">{status.phone_status === 'verified' ? `Verified${status.masked_phone ? ` (${status.masked_phone})` : ''}` : status.phone_status === 'pending' ? 'Pending' : 'Not verified'}</dd></div>
        <div><dt className="text-gray-500">Optional government ID</dt><dd className="font-medium">{identityLabel[status.identity_status]}</dd></div>
      </dl>
      {status.identity_status === 'rejected' && status.identity_rejection_reason && !matchmakingReadiness && <p className="mt-3 text-sm text-gray-600">{status.identity_rejection_reason}</p>}
      <div className="mt-4 space-y-2 text-sm text-gray-600">
        <p>Phone verification is not yet available. No code has been sent, and an unverified phone does not prevent email sign-in.</p>
        <p>Optional ID verification is not yet available. Do not upload identity documents through this screen.</p>
        {matchmakingReadiness && <p>Phone verification will be required before Matchmaking activation. This is informational only; it does not affect current access or discovery. Government ID remains optional.</p>}
      </div>
    </>}
  </section>;
};

export default TrustVerificationPanel;
