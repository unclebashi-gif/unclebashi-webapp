import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { checkPesapalCoursePaymentStatus } from '@/lib/paymentService';
import { supabase } from '@/lib/supabase';
import type { PaymentFunctionResult } from '@/types/payments';
import { Button } from '@/components/ui/button';

const PAYMENT_POLL_INTERVAL_MS = 12_000;
const PAYMENT_AUTO_POLL_MAX_MS = 180_000;

export const PaymentReturn: React.FC = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const trackingId = params.get('OrderTrackingId') ?? params.get('orderTrackingId') ?? '';
  const merchantReference = params.get('OrderMerchantReference') ?? params.get('orderMerchantReference') ?? '';
  const [sessionResolved, setSessionResolved] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [result, setResult] = useState<PaymentFunctionResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingEnded, setPollingEnded] = useState(false);
  const startedAt = useRef<number | null>(null);
  const inFlight = useRef(false);
  const attempted = useRef(false);

  useEffect(() => {
    let current = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (current) {
        setSignedIn(Boolean(data.session));
        setSessionResolved(true);
      }
    }).catch(() => {
      if (current) setSessionResolved(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      setSessionResolved(true);
    });
    return () => { current = false; listener.subscription.unsubscribe(); };
  }, []);

  const verify = useCallback(async () => {
    if (!signedIn || !trackingId || !merchantReference || inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    setError(null);
    try {
      const next = await checkPesapalCoursePaymentStatus({
        orderTrackingId: trackingId,
        merchantReference,
      });
      setResult(next);
      if (next.status === 'pending' || next.status === 'created') {
        startedAt.current ??= Date.now();
      }
    } catch (verificationError) {
      setError(verificationError instanceof Error
        ? verificationError.message : 'Payment verification is temporarily unavailable.');
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }, [merchantReference, signedIn, trackingId]);

  useEffect(() => {
    if (!sessionResolved || !signedIn || !trackingId || !merchantReference || attempted.current) return;
    attempted.current = true;
    void verify();
  }, [merchantReference, sessionResolved, signedIn, trackingId, verify]);

  useEffect(() => {
    if (!result || (result.status !== 'pending' && result.status !== 'created') || pollingEnded) return;
    const started = startedAt.current ?? Date.now();
    const remaining = PAYMENT_AUTO_POLL_MAX_MS - (Date.now() - started);
    if (remaining <= 0) {
      setPollingEnded(true);
      return;
    }
    const timer = window.setTimeout(() => void verify(), Math.min(PAYMENT_POLL_INTERVAL_MS, remaining));
    return () => window.clearTimeout(timer);
  }, [pollingEnded, result, verify]);

  const content = !sessionResolved ? (
    <p className="text-gray-600" role="status">Restoring your sign-in session…</p>
  ) : !trackingId || !merchantReference ? (
    <div className="space-y-3"><p className="text-gray-700">Payment return details are missing. Check your course payment from Education.</p><Link className="text-[#1e3a5f] underline" to="/courses">Open Education</Link></div>
  ) : !signedIn ? (
    <div className="space-y-3"><p className="text-gray-700">Sign in to check your payment. Pesapal notifications can still securely update the payment in the background.</p><Link className="text-[#1e3a5f] underline" to="/">Go to sign in</Link></div>
  ) : error && !result ? (
    <div className="space-y-3"><h2 className="text-xl font-semibold text-amber-800">Payment verification is temporarily unavailable</h2><p className="text-gray-700">Your payment has not been marked successful from this page. Retry verification or check your payment from Education.</p></div>
  ) : result?.status === 'successful' && result.access_granted ? (
    <div className="space-y-3"><h2 className="text-xl font-semibold text-emerald-800">Payment confirmed</h2><p className="text-gray-700">Your course access is available.</p><Link className="text-[#1e3a5f] underline" to="/courses">Continue to Education</Link></div>
  ) : result?.status === 'reversed' ? (
    <p className="text-amber-800" role="alert">Pesapal reported a reversal. The payment needs review before access can be confirmed.</p>
  ) : result && ['failed', 'cancelled', 'expired'].includes(result.status) ? (
    <div className="space-y-2"><h2 className="text-xl font-semibold text-red-700">Payment was not completed</h2><p className="text-gray-700">No course access was granted. Return to Education to try again.</p><Link className="text-[#1e3a5f] underline" to="/courses">Open Education</Link></div>
  ) : (
    <div className="space-y-3"><h2 className="text-xl font-semibold text-[#1e3a5f]">Payment pending</h2><p className="text-gray-700">The payment is being verified with Pesapal. This page does not treat the return URL as proof of payment.</p>{pollingEnded && <p className="text-sm text-gray-600">Automatic checks have paused. Check again when ready.</p>}</div>
  );

  return (
    <main className="min-h-screen bg-[#faf6f1] px-4 py-16">
      <section className="mx-auto max-w-xl space-y-5 rounded-2xl bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#c4785a]">Course payment</p>
        {content}
        {error && <p className="text-sm text-red-700" role="alert">Payment verification is temporarily unavailable. {error}</p>}
        {signedIn && trackingId && merchantReference && result?.status !== 'successful'
          && result?.status !== 'reversed' && !['failed', 'cancelled', 'expired'].includes(result?.status ?? '') && (
          <Button variant="outline" onClick={() => { setPollingEnded(false); void verify(); }} disabled={checking}>
            {checking ? 'Checking with Pesapal…' : 'Check payment status'}
          </Button>
        )}
      </section>
    </main>
  );
};

export default PaymentReturn;
