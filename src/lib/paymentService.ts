import { supabase } from '@/lib/supabase';
import { COURSE_AUDIENCE_RESTRICTION_MESSAGE } from '@/lib/educationService';
import type { AdminPayment, CoursePaymentProvider, CoursePaymentSummary, PaymentFunctionResult } from '@/types/payments';

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
  if (error) {
    const context = error.context;
    if (context instanceof Response) {
      try {
        const body = await context.clone().json() as { code?: unknown };
        if (body.code === 'COURSE_AUDIENCE_INELIGIBLE') {
          throw new Error(COURSE_AUDIENCE_RESTRICTION_MESSAGE);
        }
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message === COURSE_AUDIENCE_RESTRICTION_MESSAGE) {
          throw parseError;
        }
      }
    }
    throw error;
  }
  return data as PaymentFunctionResult;
}

async function invokePesapal(body: Record<string, string>): Promise<PaymentFunctionResult> {
  await requireSignedIn();
  const { data, error } = await supabase.functions.invoke('pesapal-checkout', { body });
  if (error) {
    const context = error.context;
    if (context instanceof Response) {
      try {
        const responseBody = await context.clone().json() as { code?: unknown };
        if (responseBody.code === 'COURSE_AUDIENCE_INELIGIBLE') {
          throw new Error(COURSE_AUDIENCE_RESTRICTION_MESSAGE);
        }
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message === COURSE_AUDIENCE_RESTRICTION_MESSAGE) {
          throw parseError;
        }
      }
    }
    throw error;
  }
  return data as PaymentFunctionResult;
}

export async function requestPesapalCourseCheckout(
  courseId: string,
  idempotencyKey: string,
): Promise<PaymentFunctionResult> {
  return invokePesapal({ course_id: courseId, idempotency_key: idempotencyKey });
}

export async function checkPesapalCoursePaymentStatus(
  lookup: { paymentId?: string; orderTrackingId?: string; merchantReference?: string },
): Promise<PaymentFunctionResult> {
  const body: Record<string, string> = { action: 'status' };
  if (lookup.paymentId) body.payment_id = lookup.paymentId;
  if (lookup.orderTrackingId) body.order_tracking_id = lookup.orderTrackingId;
  if (lookup.merchantReference) body.order_merchant_reference = lookup.merchantReference;
  return invokePesapal(body);
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

export async function checkAdminPaymentStatus(
  paymentId: string,
  provider: CoursePaymentProvider = 'mtn',
): Promise<PaymentFunctionResult> {
  await requireSignedIn();
  const { data, error } = await supabase.functions.invoke(provider === 'pesapal' ? 'pesapal-checkout' : 'mtn-checkout', {
    body: { action: 'status', payment_id: paymentId },
  });
  if (error) throw error;
  return data as PaymentFunctionResult;
}
