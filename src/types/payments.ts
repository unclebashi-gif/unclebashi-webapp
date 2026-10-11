export type CoursePaymentStatus =
  | 'created'
  | 'pending'
  | 'successful'
  | 'failed'
  | 'cancelled'
  | 'expired';

export interface CoursePaymentSummary {
  payment_id: string;
  course_id: string;
  course_title: string;
  amount: number;
  currency: string;
  status: CoursePaymentStatus;
  created_at: string;
  verified_at: string | null;
  access_granted: boolean;
}

export interface AdminPayment {
  payment_id: string;
  created_at: string;
  customer_name: string;
  customer_email: string | null;
  course_id: string;
  course_title: string;
  amount: number;
  currency: string;
  provider: 'mtn_momo';
  payer_msisdn_masked: string | null;
  status: CoursePaymentStatus;
  provider_reference: string;
  verified_at: string | null;
  access_granted_at: string | null;
  failure_reason: string | null;
}

export interface PaymentFunctionResult {
  payment_id: string;
  course_id: string;
  amount: number;
  currency: string;
  status: CoursePaymentStatus;
  access_granted: boolean;
}
