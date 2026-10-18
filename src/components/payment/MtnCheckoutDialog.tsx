import React, { useCallback, useEffect, useRef, useState } from 'react';
import { checkCoursePaymentStatus, getMyCoursePayments, requestCourseCheckout } from '@/lib/paymentService';
import type { Course } from '@/types/education';
import type { CoursePaymentStatus, CoursePaymentSummary, PaymentFunctionResult } from '@/types/payments';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Modal } from '../ui/Modal';

type CheckoutStage = 'ready' | 'requesting' | 'pending' | 'successful' | 'failed' | 'expired' | 'cancelled';
const PAYMENT_POLL_INTERVAL_MS = 12_000;
const PAYMENT_AUTO_POLL_MAX_MS = 180_000;

interface MtnCheckoutDialogProps {
  course: Course | null;
  recoveryPayment?: CoursePaymentSummary | null;
  isOpen: boolean;
  onClose: () => void;
  onAccessGranted: () => Promise<void>;
}

const terminalStage = (status: CoursePaymentStatus): CheckoutStage | null => {
  if (status === 'successful') return 'successful';
  if (status === 'failed' || status === 'cancelled' || status === 'expired') return status;
  return null;
};

const formatAmount = (amount: number, currency: string) =>
  `${currency} ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(amount)}`;

export const MtnCheckoutDialog: React.FC<MtnCheckoutDialogProps> = ({
  course,
  recoveryPayment = null,
  isOpen,
  onClose,
  onAccessGranted,
}) => {
  const [phone, setPhone] = useState('');
  const [stage, setStage] = useState<CheckoutStage>('ready');
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [attemptTerms, setAttemptTerms] = useState<{ amount: number; currency: string } | null>(null);
  const [resumingCreatedPayment, setResumingCreatedPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [autoPollingEnded, setAutoPollingEnded] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const accessRefreshDone = useRef(false);
  const pendingStartedAt = useRef<number | null>(null);
  const statusRequestInFlight = useRef(false);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const enterPending = useCallback((id: string, terms?: { amount: number; currency: string }) => {
    setPaymentId(id);
    if (terms) setAttemptTerms(terms);
    pendingStartedAt.current = Date.now();
    setAutoPollingEnded(false);
    setStage('pending');
  }, []);

  const applyServerStatus = useCallback(async (result: PaymentFunctionResult): Promise<void> => {
    if (result.status === 'successful' && result.access_granted) {
      setStage('successful');
      if (!accessRefreshDone.current) {
        accessRefreshDone.current = true;
        try {
          await onAccessGranted();
        } catch {
          if (isOpenRef.current) setError('Payment is confirmed, but course access could not be refreshed. Close and reopen Education.');
        }
      }
      return;
    }
    const terminal = terminalStage(result.status);
    if (terminal && terminal !== 'successful') {
      setStage(terminal);
      return;
    }
    setStage('pending');
  }, [onAccessGranted]);

  useEffect(() => {
    if (!isOpen || (!course && !recoveryPayment)) return;
    let current = true;
    setPhone('');
    setStage('ready');
    setPaymentId(null);
    setAttemptTerms(null);
    setResumingCreatedPayment(false);
    setError(null);
    setCheckingStatus(false);
    setAutoPollingEnded(false);
    pendingStartedAt.current = null;
    statusRequestInFlight.current = false;
    idempotencyKey.current = null;
    accessRefreshDone.current = false;

    const restorePayment = async (summary: CoursePaymentSummary) => {
      if (!current) return;
      setPaymentId(summary.payment_id);
      setAttemptTerms({ amount: summary.amount, currency: summary.currency });
      if (summary.status === 'successful' && summary.access_granted) {
        setStage('successful');
        accessRefreshDone.current = true;
        try {
          await onAccessGranted();
        } catch {
          if (current) setError('Payment is confirmed, but course access could not be refreshed. Close and reopen Education.');
        }
      } else if (summary.status === 'created' || summary.status === 'pending') {
        if (summary.status === 'created') {
          // A created row has not been submitted to MTN yet. Keep the form
          // available so the learner can resume through the checkout request.
          setResumingCreatedPayment(true);
          setStage('ready');
        } else {
          enterPending(summary.payment_id, { amount: summary.amount, currency: summary.currency });
        }
      } else if (summary.status === 'successful') {
        setStage('pending');
        setError('Payment is confirmed. Access is still being refreshed; check its status again shortly.');
        pendingStartedAt.current = Date.now();
      } else {
        const terminal = terminalStage(summary.status);
        if (terminal) setStage(terminal);
      }
    };

    if (recoveryPayment) {
      void restorePayment(recoveryPayment);
    } else if (course) {
      void getMyCoursePayments(course.id).then(async (rows) => {
        if (!current) return;
        // A normal course checkout should recover only an open attempt or a
        // successful payment. Older terminal attempts are history and must
        // not prevent a fresh checkout form from opening.
        const recoverablePayment = rows.find((row) =>
          row.status === 'created' || row.status === 'pending' || row.status === 'successful'
        );
        if (recoverablePayment) await restorePayment(recoverablePayment);
      }).catch(() => {
        if (current) setError('Could not load the saved payment state. Try again or reopen checkout.');
      });
    }
    return () => { current = false; };
  }, [applyServerStatus, course, enterPending, isOpen, onAccessGranted, recoveryPayment]);

  useEffect(() => {
    if (!isOpen || stage !== 'pending' || !paymentId || autoPollingEnded) return;
    let current = true;
    let timeoutId: number | undefined;

    const scheduleNext = () => {
      const startedAt = pendingStartedAt.current ?? Date.now();
      const remaining = PAYMENT_AUTO_POLL_MAX_MS - (Date.now() - startedAt);
      if (remaining <= 0) {
        setAutoPollingEnded(true);
        return;
      }
      timeoutId = window.setTimeout(() => void recheck(), Math.min(PAYMENT_POLL_INTERVAL_MS, remaining));
    };

    const recheck = async () => {
      if (!current || !isOpenRef.current) return;
      if (statusRequestInFlight.current) {
        scheduleNext();
        return;
      }
      statusRequestInFlight.current = true;
      try {
        const result = await checkCoursePaymentStatus(paymentId);
        if (!current || !isOpenRef.current) return;
        setError(null);
        await applyServerStatus(result);
        if (result.status === 'pending' || result.status === 'created'
            || (result.status === 'successful' && !result.access_granted)) scheduleNext();
      } catch {
        if (!current || !isOpenRef.current) return;
        setError('Payment status is temporarily unavailable. You can check again.');
        scheduleNext();
      } finally {
        statusRequestInFlight.current = false;
      }
    };

    scheduleNext();
    return () => {
      current = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [applyServerStatus, autoPollingEnded, isOpen, paymentId, stage]);

  const checkStatus = async () => {
    if (!paymentId || statusRequestInFlight.current) return;
    statusRequestInFlight.current = true;
    setCheckingStatus(true);
    setError(null);
    try {
      const result = await checkCoursePaymentStatus(paymentId);
      if (!isOpenRef.current) return;
      await applyServerStatus(result);
      if (result.status === 'pending' || result.status === 'created'
          || (result.status === 'successful' && !result.access_granted)) setError('Payment is still being confirmed.');
    } catch {
      if (isOpenRef.current) setError('We could not check payment status right now. Please try again.');
    } finally {
      statusRequestInFlight.current = false;
      if (isOpenRef.current) setCheckingStatus(false);
    }
  };

  const beginCheckout = async (event: React.FormEvent) => {
    event.preventDefault();
    const courseId = course?.id ?? (recoveryPayment?.status === 'created' ? recoveryPayment.course_id : null);
    if (!courseId || stage === 'requesting' || stage === 'pending') return;
    setError(null);
    setStage('requesting');
    try {
      idempotencyKey.current ??= crypto.randomUUID();
      const result = await requestCourseCheckout(courseId, phone, idempotencyKey.current);
      if (!isOpenRef.current) return;
      setResumingCreatedPayment(false);
      setPaymentId(result.payment_id);
      const terms = { amount: result.amount, currency: result.currency };
      setAttemptTerms(terms);
      if (result.status === 'successful' && result.access_granted) {
        await applyServerStatus(result);
      } else if (result.status === 'pending' || result.status === 'created'
          || (result.status === 'successful' && !result.access_granted)) {
        enterPending(result.payment_id, terms);
      } else {
        const terminal = terminalStage(result.status);
        if (terminal) setStage(terminal);
      }
    } catch (checkoutError) {
      if (!isOpenRef.current) return;
      setStage('ready');
      setError(checkoutError instanceof Error ? checkoutError.message : 'Could not start MTN MoMo checkout.');
    }
  };

  const retry = () => {
    idempotencyKey.current = crypto.randomUUID();
    setResumingCreatedPayment(false);
    pendingStartedAt.current = null;
    setAutoPollingEnded(false);
    setPaymentId(null);
    setAttemptTerms(null);
    setStage('ready');
    setError(null);
  };

  if (!course && !recoveryPayment) return null;
  const courseTitle = recoveryPayment?.course_title ?? course?.title ?? 'Course';
  const priceAmount = attemptTerms?.amount ?? course?.price_amount ?? null;
  const priceCurrency = attemptTerms?.currency ?? course?.currency ?? 'UGX';
  const pendingOnly = !course && Boolean(recoveryPayment);
  const canResumeCreatedPayment = resumingCreatedPayment
    && (Boolean(course) || recoveryPayment?.status === 'created');

  const content = stage === 'successful' ? (
    <div className="p-6 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-hidden="true">✓</div>
      <h4 className="text-xl font-semibold text-[#1e3a5f]">Payment confirmed</h4>
      <p className="mt-2 text-sm text-gray-600">Course access has been granted.</p>
      <Button className="mt-6" onClick={onClose}>Continue to course</Button>
    </div>
  ) : stage === 'requesting' ? (
    <div className="p-6" role="status"><p className="text-gray-700">Requesting MTN MoMo approval…</p></div>
  ) : stage === 'pending' ? (
    <div className="p-6">
      <p className="font-medium text-[#1e3a5f]" role="status">Payment is still being confirmed.</p>
      <p className="mt-2 text-sm text-gray-600">The payment request was sent to MTN. Approve it on your MTN MoMo phone. Access is enabled only after server verification.</p>
      {priceAmount !== null && <p className="mt-2 text-sm font-medium text-gray-700">{formatAmount(priceAmount, priceCurrency)}</p>}
      {autoPollingEnded && <p className="mt-3 text-sm text-gray-600">We haven’t received a final payment status yet. You can check again.</p>}
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={() => void checkStatus()} disabled={checkingStatus}>{checkingStatus ? 'Checking…' : 'Check payment status'}</Button>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    </div>
  ) : stage === 'failed' || stage === 'expired' || stage === 'cancelled' ? (
    <div className="p-6">
      <p className="font-medium text-red-700" role="alert">Payment was not completed. No course access was granted.</p>
      <p className="mt-2 text-sm text-gray-600">Status: {stage}.</p>
      <div className="mt-5 flex gap-3">
        {course && <Button onClick={retry}>Try again</Button>}
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
      {pendingOnly && <p className="mt-3 text-xs text-gray-500">Return to this course when it is available to start another payment attempt.</p>}
    </div>
  ) : (
    <form className="space-y-4 p-6" onSubmit={(event) => void beginCheckout(event)}>
      <div className="rounded-lg bg-[#faf6f1] p-4">
        <p className="text-sm text-gray-600">Course</p>
        <p className="font-semibold text-[#1e3a5f]">{courseTitle}</p>
        <p className="mt-1 text-lg font-bold text-[#1e3a5f]">
          {priceAmount !== null && Number.isSafeInteger(priceAmount) ? formatAmount(priceAmount, priceCurrency) : 'Price unavailable'}
        </p>
      </div>
      <label className="block text-sm font-medium text-gray-700" htmlFor="mtn-payer-phone">MTN MoMo phone number</label>
      <Input id="mtn-payer-phone" type="tel" autoComplete="tel" placeholder="07… or +2567…" value={phone}
        onChange={(event) => setPhone(event.target.value)} required />
      <p className="text-sm text-gray-500">
        {canResumeCreatedPayment
          ? 'This payment attempt has not yet been sent to MTN. Resume it to send a payment request to your phone.'
          : 'A payment request will be sent to your MTN MoMo phone for approval.'} Never enter your MoMo PIN here.
      </p>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={(!course && !canResumeCreatedPayment) || priceAmount === null || !Number.isSafeInteger(priceAmount) || !priceCurrency || !phone.trim()}>
          {canResumeCreatedPayment ? 'Resume payment' : 'Request MTN MoMo payment'}
        </Button>
      </div>
    </form>
  );
  return <Modal isOpen={isOpen} onClose={stage === 'requesting' ? () => undefined : onClose} title="MTN MoMo checkout">{content}</Modal>;
};
