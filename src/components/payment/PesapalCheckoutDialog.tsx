import React, { useCallback, useEffect, useRef, useState } from 'react';
import { checkPesapalCoursePaymentStatus, requestPesapalCourseCheckout } from '@/lib/paymentService';
import type { Course } from '@/types/education';
import type { CoursePaymentSummary, PaymentFunctionResult } from '@/types/payments';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';

type Stage = 'ready' | 'requesting' | 'redirecting' | 'pending' | 'successful' | 'failed' | 'reversed';

interface PesapalCheckoutDialogProps {
  course: Course | null;
  recoveryPayment?: CoursePaymentSummary | null;
  isOpen: boolean;
  onClose: () => void;
  onAccessGranted: () => Promise<void>;
}

const amountLabel = (amount: number, currency: string) =>
  `${currency} ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(amount)}`;

export const PesapalCheckoutDialog: React.FC<PesapalCheckoutDialogProps> = ({
  course, recoveryPayment = null, isOpen, onClose, onAccessGranted,
}) => {
  const [stage, setStage] = useState<Stage>('ready');
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const applyResult = useCallback(async (result: PaymentFunctionResult) => {
    setPaymentId(result.payment_id);
    setRedirectUrl(result.redirect_url ?? null);
    if (result.status === 'successful' && result.access_granted) {
      setStage('successful');
      try {
        await onAccessGranted();
      } catch {
        if (isOpenRef.current) setError('Payment is confirmed, but course access could not be refreshed. Reopen Education to check again.');
      }
    } else if (result.status === 'reversed') {
      setStage('reversed');
    } else if (['failed', 'cancelled', 'expired'].includes(result.status)) {
      setStage('failed');
    } else {
      setStage('pending');
    }
  }, [onAccessGranted]);

  useEffect(() => {
    if (!isOpen || (!course && !recoveryPayment)) return;
    setStage('ready');
    setPaymentId(null);
    setRedirectUrl(null);
    setError(null);
    setChecking(false);
    idempotencyKey.current = null;

    if (!recoveryPayment) return;
    setPaymentId(recoveryPayment.payment_id);
    setRedirectUrl(recoveryPayment.redirect_url);
    if (recoveryPayment.status === 'successful' && recoveryPayment.access_granted) {
      setStage('successful');
      void onAccessGranted().catch(() => {
        if (isOpenRef.current) setError('Payment is confirmed, but course access could not be refreshed. Reopen Education to check again.');
      });
    } else if (recoveryPayment.status === 'reversed') {
      setStage('reversed');
    } else if (recoveryPayment.status === 'pending') {
      setStage('pending');
    } else if (recoveryPayment.status === 'failed' || recoveryPayment.status === 'cancelled'
        || recoveryPayment.status === 'expired') {
      setStage('failed');
    }
  }, [course, isOpen, onAccessGranted, recoveryPayment]);

  const beginCheckout = async () => {
    const courseId = course?.id ?? recoveryPayment?.course_id;
    if (!courseId || stage === 'requesting') return;
    setStage('requesting');
    setError(null);
    try {
      idempotencyKey.current ??= crypto.randomUUID();
      const result = await requestPesapalCourseCheckout(courseId, idempotencyKey.current);
      if (!isOpenRef.current) return;
      if (result.status === 'pending' && result.redirect_url) {
        setPaymentId(result.payment_id);
        setRedirectUrl(result.redirect_url);
        setStage('redirecting');
        window.location.assign(result.redirect_url);
        return;
      }
      await applyResult(result);
      if (result.status === 'pending' && !result.redirect_url) {
        setError('The payment request is being reconciled. Check status again shortly.');
      }
    } catch (checkoutError) {
      if (!isOpenRef.current) return;
      setStage('ready');
      setError(checkoutError instanceof Error ? checkoutError.message : 'Pesapal checkout could not be started.');
    }
  };

  const openHostedCheckout = () => {
    if (!redirectUrl) return;
    setStage('redirecting');
    window.location.assign(redirectUrl);
  };

  const checkStatus = async () => {
    if (!paymentId || checking) return;
    setChecking(true);
    setError(null);
    try {
      const result = await checkPesapalCoursePaymentStatus({ paymentId });
      if (!isOpenRef.current) return;
      await applyResult(result);
      if (result.status === 'pending' || result.status === 'created') {
        setError('Payment is still being confirmed. You can continue to the secure checkout or check again.');
      }
    } catch (statusError) {
      if (isOpenRef.current) setError(statusError instanceof Error ? statusError.message : 'Payment verification is temporarily unavailable.');
    } finally {
      if (isOpenRef.current) setChecking(false);
    }
  };

  const retry = () => {
    idempotencyKey.current = crypto.randomUUID();
    setPaymentId(null);
    setRedirectUrl(null);
    setError(null);
    setStage('ready');
  };

  if (!course && !recoveryPayment) return null;
  const courseTitle = recoveryPayment?.course_title ?? course?.title ?? 'Course';
  const amount = recoveryPayment?.amount ?? course?.price_amount ?? null;
  const currency = recoveryPayment?.currency ?? course?.currency ?? 'UGX';
  const content = stage === 'successful' ? (
    <div className="p-6 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-hidden="true">✓</div>
      <h3 className="text-xl font-semibold text-[#1e3a5f]">Payment confirmed</h3>
      <p className="mt-2 text-sm text-gray-600">Course access has been granted.</p>
      {error && <p className="mt-3 text-sm text-amber-800" role="status">{error}</p>}
      <Button className="mt-6" onClick={onClose}>Continue to course</Button>
    </div>
  ) : stage === 'requesting' || stage === 'redirecting' ? (
    <div className="p-6" role="status"><p className="text-gray-700">{stage === 'requesting' ? 'Preparing secure checkout…' : 'Redirecting to Pesapal…'}</p></div>
  ) : stage === 'pending' ? (
    <div className="space-y-4 p-6">
      <p className="font-medium text-[#1e3a5f]" role="status">Payment is still being confirmed.</p>
      <p className="text-sm text-gray-600">Continue to the hosted Pesapal checkout to approve your payment. Course access becomes available only after server verification.</p>
      {amount !== null && <p className="text-sm font-semibold text-gray-700">{amountLabel(amount, currency)}</p>}
      {error && <p className="text-sm text-amber-800" role="status">{error}</p>}
      <div className="flex flex-wrap gap-3">
        {redirectUrl && <Button onClick={openHostedCheckout}>Continue to secure checkout</Button>}
        <Button variant="outline" onClick={() => void checkStatus()} disabled={checking || !paymentId}>{checking ? 'Checking…' : 'Check payment status'}</Button>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    </div>
  ) : stage === 'reversed' ? (
    <div className="space-y-3 p-6"><p className="font-medium text-amber-800" role="alert">Pesapal reported a reversal. Course access is not being confirmed; contact support if access was already granted.</p><Button variant="outline" onClick={onClose}>Close</Button></div>
  ) : stage === 'failed' ? (
    <div className="space-y-3 p-6"><p className="font-medium text-red-700" role="alert">Payment was not completed. No course access was granted.</p>{error && <p className="text-sm text-red-700">{error}</p>}<div className="flex gap-3"><Button onClick={retry}>Try again</Button><Button variant="outline" onClick={onClose}>Close</Button></div></div>
  ) : (
    <div className="space-y-4 p-6">
      <div className="rounded-lg bg-[#faf6f1] p-4">
        <p className="text-sm text-gray-600">Course</p><p className="font-semibold text-[#1e3a5f]">{courseTitle}</p>
        <p className="mt-1 text-lg font-bold text-[#1e3a5f]">{amount !== null && Number.isSafeInteger(amount) ? amountLabel(amount, currency) : 'Price unavailable'}</p>
      </div>
      <p className="text-sm text-gray-600">Pay securely with Mobile Money or Card on Pesapal’s hosted checkout.</p>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => void beginCheckout()} disabled={amount === null || !Number.isSafeInteger(amount) || amount <= 0 || !currency}>{recoveryPayment?.status === 'created' ? 'Resume payment' : 'Pay securely'}</Button></div>
    </div>
  );
  return <Modal isOpen={isOpen} onClose={stage === 'requesting' || stage === 'redirecting' ? () => undefined : onClose} title="Secure course checkout">{content}</Modal>;
};
