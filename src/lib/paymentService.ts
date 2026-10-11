import { supabase } from '@/lib/supabase';
import type { AdminPayment, CoursePaymentSummary, PaymentFunctionResult } from '@/types/payments';

async function requireSignedIn(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error('Sign in to purchase a course.');
}

export async function getMyCoursePayments(courseId?: string): Promise<CoursePaymentSummary[]> {
  await requireSignedIn();
  const { data, error } = await supabase.rpc('get_my_course_payments', {
    p_course_id: courseId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as CoursePaymentSummary[];
}

export async function requestCourseCheckout(
  courseId: string,
  payerPhone: string,
  idempotencyKey: string,
): Promise<PaymentFunctionResult> {
  await requireSignedIn();
  const { data, error } = await supabase.functions.invoke('mtn-checkout', {
    body: { course_id: courseId, payer_phone: payerPhone, idempotency_key: idempotencyKey },
  });
  if (error) throw error;
  return data as PaymentFunctionResult;
}

export async function checkCoursePaymentStatus(paymentId: string): Promise<PaymentFunctionResult> {
  await requireSignedIn();
  const { data, error } = await supabase.functions.invoke('mtn-checkout', {
    body: { action: 'status', payment_id: paymentId },
  });
  if (error) throw error;
  return data as PaymentFunctionResult;
}

export async function getAdminPayments(): Promise<AdminPayment[]> {
  await requireSignedIn();
  const { data, error } = await supabase.rpc('get_admin_payments', {
    p_limit: 50,
    p_before: null,
  });
  if (error) throw error;
  return (data ?? []) as AdminPayment[];
}

export async function checkAdminPaymentStatus(paymentId: string): Promise<PaymentFunctionResult> {
  await requireSignedIn();
  const { data, error } = await supabase.functions.invoke('mtn-checkout', {
    body: { action: 'status', payment_id: paymentId },
  });
  if (error) throw error;
  return data as PaymentFunctionResult;
}
