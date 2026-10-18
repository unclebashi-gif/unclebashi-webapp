import React, { useCallback, useEffect, useState } from 'react';
import { checkAdminPaymentStatus, getAdminPayments } from '@/lib/paymentService';
import type { AdminPayment } from '@/types/payments';
import { Button } from '../ui/button';

const formatAmount = (amount: number, currency: string) =>
  `${currency} ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(amount)}`;

export const AdminPaymentsPanel: React.FC = () => {
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPayments(await getAdminPayments());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load payments.');
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPayments(); }, [loadPayments]);

  const checkStatus = async (paymentId: string) => {
    setCheckingId(paymentId);
    setError(null);
    try {
      const payment = payments.find((row) => row.payment_id === paymentId);
      await checkAdminPaymentStatus(paymentId, payment?.provider ?? 'mtn');
      await loadPayments();
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : 'Could not verify payment status.');
    } finally {
      setCheckingId(null);
    }
  };

  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1e3a5f]">Course payments</h2>
          <p className="mt-1 text-sm text-gray-500">MTN and Pesapal payment records, provider environments, and verified access grants.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadPayments()} disabled={loading}>Refresh</Button>
      </div>
      {error && <p className="mb-4 text-sm text-red-700" role="alert">{error}</p>}
      {loading ? <p className="text-sm text-gray-500" role="status">Loading payment records…</p> : null}
      {!loading && !error && payments.length === 0 ? <p className="text-sm text-gray-500">No course payments yet.</p> : null}
      <div className="space-y-3">
        {payments.map((payment) => (
          <article key={payment.payment_id} className="rounded-lg border border-gray-200 p-4">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              <div className="grid flex-1 gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                <div><p className="text-xs uppercase tracking-wide text-gray-500">Date</p><p className="text-sm text-gray-800">{new Date(payment.created_at).toLocaleString()}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-gray-500">Customer</p><p className="text-sm text-gray-800">{payment.customer_name}</p>{payment.customer_email && <p className="text-xs text-gray-500">{payment.customer_email}</p>}</div>
                <div><p className="text-xs uppercase tracking-wide text-gray-500">Course</p><p className="text-sm text-gray-800">{payment.course_title}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-gray-500">Amount</p><p className="text-sm font-semibold text-gray-800">{formatAmount(payment.amount, payment.currency)}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-gray-500">Provider</p><p className="text-sm text-gray-800">{payment.provider === 'mtn' ? `MTN${payment.payer_msisdn_masked ? ` · ${payment.payer_msisdn_masked}` : ''}` : 'Pesapal'}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-gray-500">Status / environment</p><p className={`text-sm capitalize ${payment.status === 'reversed' ? 'font-semibold text-amber-800' : 'text-gray-800'}`}>{payment.status === 'reversed' ? 'Reversed · Admin reconciliation' : payment.status}</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${payment.provider_environment === 'sandbox' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{payment.provider_environment === 'sandbox' ? 'Sandbox' : 'Production'}</span><p className="text-xs text-gray-500">Access {payment.access_granted_at ? 'granted · review if reversed' : 'not granted'}</p></div>
                <div className="sm:col-span-2 xl:col-span-3"><p className="text-xs uppercase tracking-wide text-gray-500">Provider reference</p><p className="break-all font-mono text-xs text-gray-700">{payment.provider_reference}</p></div>
                {payment.failure_reason && <div className="sm:col-span-2 xl:col-span-3"><p className="text-xs uppercase tracking-wide text-gray-500">Failure reason</p><p className="text-sm text-red-700">{payment.failure_reason}</p></div>}
              </div>
              {(payment.status === 'created' || payment.status === 'pending'
                || (payment.provider === 'pesapal' && payment.status === 'successful')) && (
                <Button variant="outline" size="sm" disabled={checkingId === payment.payment_id}
                  onClick={() => void checkStatus(payment.payment_id)}>
                  {checkingId === payment.payment_id ? 'Checking…' : 'Check status'}
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
