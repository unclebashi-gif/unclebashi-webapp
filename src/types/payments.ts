export type CoursePaymentStatus =
  | 'created'
  | 'pending'
  | 'successful'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'reversed';

export type CoursePaymentProvider = 'mtn' | 'pesapal';

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
  provider: CoursePaymentProvider;
  redirect_url: string | null;
}

export type PaymentProviderEnvironment = 'sandbox' | 'production';

export interface AdminPayment {
  payment_id: string;
  created_at: string;
  customer_name: string;
  customer_email: string | null;
  course_id: string;
  course_title: string;
  amount: number;
  currency: string;
  provider: CoursePaymentProvider;
  payer_msisdn_masked: string | null;
  status: CoursePaymentStatus;
  provider_reference: string;
  verified_at: string | null;
  access_granted_at: string | null;
  failure_reason: string | null;
  provider_environment: PaymentProviderEnvironment;
}

export interface PaymentFunctionResult {
  payment_id: string;
  course_id: string;
  amount: number;
  currency: string;
  status: CoursePaymentStatus;
  access_granted: boolean;
  redirect_url?: string | null;
}
