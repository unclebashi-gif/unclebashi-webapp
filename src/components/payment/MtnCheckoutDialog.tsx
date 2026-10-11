import React, { useEffect, useRef, useState } from 'react';
import { checkCoursePaymentStatus, getMyCoursePayments, requestCourseCheckout } from '@/lib/paymentService';
import type { Course } from '@/types/education';
import type { CoursePaymentStatus } from '@/types/payments';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Modal } from '../ui/Modal';

type CheckoutStage = 'ready' | 'requesting' | 'pending' | 'successful' | 'failed' | 'expired' | 'cancelled';

interface MtnCheckoutDialogProps {
  course: Course | null;
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
  isOpen,
  onClose,
  onAccessGranted,
}) => {
  const [phone, setPhone] = useState('');
  const [stage, setStage] = useState<CheckoutStage>('ready');
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const accessRefreshDone = useRef(false);

  useEffect(() => {
    if (!isOpen || !course) return;
    let current = true;
    setPhone('');
    setStage('ready');
    setPaymentId(null);
    setError(null);
    idempotencyKey.current = null;
    accessRefreshDone.current = false;
    void getMyCoursePayments(course.id).then(async (rows) => {
      if (!current) return;
      const latest = rows[0];
      if (!latest) return;
      if (latest.status === 'successful' && latest.access_granted) {
        setPaymentId(latest.payment_id);
        setStage('successful');
        try {
          await onAccessGranted();
        } catch {
          if (current) setError('Payment is verified, but course access could not be refreshed. Close and reopen the course.');
        }
      } else if (latest.status === 'pending' || latest.status === 'created') {
        setPaymentId(latest.payment_id);
        setStage('pending');
      }
    }).catch((loadError: unknown) => {
      if (current) setError(loadError instanceof Error ? loadError.message : 'Could not load payment status.');
    });
    return () => { current = false; };
  }, [course, isOpen, onAccessGranted]);

  useEffect(() => {
    if (stage !== 'pending' || !paymentId) return;
    let current = true;
    let timeoutId: number | undefined;
    const recheck = async () => {
      try {
        const result = await checkCoursePaymentStatus(paymentId);
        if (!current) return;
        const terminal = terminalStage(result.status);
        if (terminal === 'successful' && result.access_granted) {
          setStage('successful');
          if (!accessRefreshDone.current) {
            accessRefreshDone.current = true;
            try {
              await onAccessGranted();
            } catch {
              if (current) setError('Payment is verified, but course access could not be refreshed. Close and reopen the course.');
            }
          }
        } else if (terminal) {
          setStage(terminal);
        } else {
          setError(null);
          timeoutId = window.setTimeout(() => void recheck(), 5000);
        }
      } catch (statusError) {
        if (!current) return;
        setError(statusError instanceof Error ? statusError.message : 'Could not check payment status.');
        timeoutId = window.setTimeout(() => void recheck(), 8000);
      }
    };
    timeoutId = window.setTimeout(() => void recheck(), 5000);
    return () => {
      current = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [onAccessGranted, paymentId, stage]);

  const beginCheckout = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!course) return;
    setError(null);
    setStage('requesting');
    try {
      idempotencyKey.current ??= crypto.randomUUID();
      const result = await requestCourseCheckout(course.id, phone, idempotencyKey.current);
      setPaymentId(result.payment_id);
      const terminal = terminalStage(result.status);
      if (terminal === 'successful' && result.access_granted) {
        setStage('successful');
        accessRefreshDone.current = true;
        try {
          await onAccessGranted();
        } catch {
          setError('Payment is verified, but course access could not be refreshed. Close and reopen the course.');
        }
      } else if (terminal) {
        setStage(terminal);
      } else {
        setStage('pending');
      }
    } catch (checkoutError) {
      setStage('ready');
      setError(checkoutError instanceof Error ? checkoutError.message : 'Could not start MTN MoMo checkout.');
    }
  };

  const retry = () => {
    idempotencyKey.current = crypto.randomUUID();
    setPaymentId(null);
    setStage('ready');
    setError(null);
  };

  if (!course) return null;

  const price = course.price_amount;
  const content = stage === 'successful' ? (
    <div className="p-6 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-hidden="true">✓</div>
      <h4 className="text-xl font-semibold text-[#1e3a5f]">Payment verified</h4>
      <p className="mt-2 text-sm text-gray-600">Your course access is ready.</p>
      <Button className="mt-6" onClick={onClose}>Continue to course</Button>
    </div>
  ) : stage === 'requesting' ? (
    <div className="p-6" role="status"><p className="text-gray-700">Requesting MTN MoMo approval…</p></div>
  ) : stage === 'pending' ? (
    <div className="p-6">
      <p className="font-medium text-[#1e3a5f]" role="status">Pending approval</p>
      <p className="mt-2 text-sm text-gray-600">Approve the payment request on your MTN MoMo phone. Access will be enabled only after the payment is verified.</p>
      {error && <p className="mt-4 text-sm text-red-700" role="alert">{error} We’ll keep checking the status.</p>}
      <Button variant="outline" className="mt-5" onClick={onClose}>Close</Button>
    </div>
  ) : stage === 'failed' || stage === 'expired' || stage === 'cancelled' ? (
    <div className="p-6">
      <p className="font-medium text-red-700" role="alert">Payment {stage}.</p>
      <p className="mt-2 text-sm text-gray-600">No course access was granted.</p>
      <div className="mt-5 flex gap-3"><Button onClick={retry}>Try again</Button><Button variant="outline" onClick={onClose}>Close</Button></div>
    </div>
  ) : (
    <form className="space-y-4 p-6" onSubmit={(event) => void beginCheckout(event)}>
      <div className="rounded-lg bg-[#faf6f1] p-4">
        <p className="text-sm text-gray-600">Course</p>
        <p className="font-semibold text-[#1e3a5f]">{course.title}</p>
        <p className="mt-1 text-lg font-bold text-[#1e3a5f]">
          {price !== null && Number.isSafeInteger(price) ? formatAmount(price, course.currency ?? 'UGX') : 'Price unavailable'}
        </p>
      </div>
      <label className="block text-sm font-medium text-gray-700" htmlFor="mtn-payer-phone">MTN MoMo phone number</label>
      <Input id="mtn-payer-phone" type="tel" autoComplete="tel" placeholder="07… or +2567…" value={phone}
        onChange={(event) => setPhone(event.target.value)} required />
      <p className="text-sm text-gray-500">A payment request will be sent to your MTN MoMo phone for approval. Never enter your MoMo PIN here.</p>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={price === null || !Number.isSafeInteger(price) || !course.currency || !phone.trim()}>
          Request MTN MoMo payment
        </Button>
      </div>
    </form>
  );

  return <Modal isOpen={isOpen} onClose={stage === 'requesting' ? () => undefined : onClose} title="MTN MoMo checkout">{content}</Modal>;
};
