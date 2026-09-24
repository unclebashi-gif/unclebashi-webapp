import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useGeolocation } from './useGeolocation';

export interface Payment {
  id: string;
  user_id: string;
  course_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_provider: string;
  provider_reference: string;
  provider_transaction_id?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  phone_number?: string;
  country_code?: string;
  metadata?: Record<string, unknown>;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

export interface UserPurchase {
  id: string;
  user_id: string;
  course_id: string;
  payment_id?: string;
  purchase_type: 'paid' | 'free' | 'gifted' | 'promo';
  amount_paid: number;
  currency: string;
  is_active: boolean;
  access_granted_at: string;
  expires_at?: string;
}

export interface Receipt {
  id: string;
  payment_id: string;
  user_id: string;
  receipt_number: string;
  course_title: string;
  amount: number;
  currency: string;
  payment_method: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  issued_at: string;
}

export type PaymentMethod = 'card' | 'mpesa' | 'mtn_momo' | 'airtel_money';

export interface PaymentOption {
  id: PaymentMethod;
  name: string;
  description: string;
  icon: string;
  countries: string[];
}

// Available payment options by region
export const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    id: 'card',
    name: 'Credit/Debit Card',
    description: 'Pay with Visa, Mastercard, or Amex',
    icon: 'card',
    countries: ['CA', 'US', 'GB', 'UG', 'KE', 'RW'],
  },
  {
    id: 'mpesa',
    name: 'M-Pesa',
    description: 'Pay with M-Pesa mobile money',
    icon: 'phone',
    countries: ['KE'],
  },
  {
    id: 'mtn_momo',
    name: 'MTN Mobile Money',
    description: 'Pay with MTN MoMo',
    icon: 'phone',
    countries: ['UG', 'RW'],
  },
  {
    id: 'airtel_money',
    name: 'Airtel Money',
    description: 'Pay with Airtel Money',
    icon: 'phone',
    countries: ['UG', 'RW'],
  },
];

// Currency info by country
export const CURRENCY_INFO: Record<string, { code: string; symbol: string; rate: number }> = {
  UG: { code: 'UGX', symbol: 'UGX', rate: 3750 },
  KE: { code: 'KES', symbol: 'KES', rate: 153 },
  RW: { code: 'RWF', symbol: 'RWF', rate: 1250 },
  CA: { code: 'CAD', symbol: 'C$', rate: 1.36 },
  US: { code: 'USD', symbol: '$', rate: 1 },
};

export interface UsePaymentsReturn {
  purchases: UserPurchase[];
  isLoading: boolean;
  error: string | null;
  hasPurchased: (courseId: string) => boolean;
  getPaymentOptions: (countryCode: string) => PaymentOption[];
  getLocalPrice: (usdAmount: number, countryCode: string) => { amount: number; currency: string; symbol: string };
  initiatePayment: (params: InitiatePaymentParams) => Promise<InitiatePaymentResult>;
  verifyPayment: (transactionRef: string, transactionId?: string) => Promise<VerifyPaymentResult>;
  refreshPurchases: () => Promise<void>;
}

export interface InitiatePaymentParams {
  userId: string;
  courseId: string;
  courseTitle: string;
  amount: number;
  paymentMethod: PaymentMethod;
  countryCode: string;
  phoneNumber?: string;
  email: string;
  name: string;
}

export interface InitiatePaymentResult {
  success: boolean;
  paymentId?: string;
  paymentLink?: string;
  transactionRef?: string;
  message?: string;
  requiresAction?: boolean;
  actionType?: string;
  error?: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  status: 'completed' | 'pending' | 'failed';
  payment?: Payment;
  receipt?: Receipt;
  message?: string;
  error?: string;
}

export const usePayments = (userId?: string): UsePaymentsReturn => {
  const [purchases, setPurchases] = useState<UserPurchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { location } = useGeolocation();

  // Fetch user purchases
  const fetchPurchases = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase.functions.invoke('process-payment', {
        body: { action: 'get_purchases', userId },
      });

      if (fetchError) throw fetchError;
      setPurchases(data?.purchases || []);
    } catch (err) {
      console.error('Error fetching purchases:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch purchases');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  // Check if user has purchased a course
  const hasPurchased = useCallback((courseId: string): boolean => {
    return purchases.some(p => p.course_id === courseId && p.is_active);
  }, [purchases]);

  // Get available payment options for a country
  const getPaymentOptions = useCallback((countryCode: string): PaymentOption[] => {
    return PAYMENT_OPTIONS.filter(option => option.countries.includes(countryCode));
  }, []);

  // Convert USD price to local currency
  const getLocalPrice = useCallback((usdAmount: number, countryCode: string): { amount: number; currency: string; symbol: string } => {
    const currencyInfo = CURRENCY_INFO[countryCode] || CURRENCY_INFO.US;
    const localAmount = Math.round(usdAmount * currencyInfo.rate);
    return {
      amount: localAmount,
      currency: currencyInfo.code,
      symbol: currencyInfo.symbol,
    };
  }, []);

  // Initiate a payment
  const initiatePayment = useCallback(async (params: InitiatePaymentParams): Promise<InitiatePaymentResult> => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('process-payment', {
        body: {
          action: 'initiate',
          ...params,
        },
      });

      if (invokeError) throw invokeError;

      if (data?.success) {
        return {
          success: true,
          paymentId: data.paymentId,
          paymentLink: data.paymentLink,
          transactionRef: data.transactionRef,
          message: data.message,
          requiresAction: data.requiresAction,
          actionType: data.actionType,
        };
      }

      return {
        success: false,
        error: data?.error || 'Payment initiation failed',
      };
    } catch (err) {
      console.error('Payment initiation error:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Payment initiation failed',
      };
    }
  }, []);

  // Verify a payment
  const verifyPayment = useCallback(async (transactionRef: string, transactionId?: string): Promise<VerifyPaymentResult> => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('process-payment', {
        body: {
          action: 'verify',
          userId,
          transactionRef,
          transactionId,
        },
      });

      if (invokeError) throw invokeError;

      if (data?.success) {
        // Refresh purchases if payment completed
        if (data.status === 'completed') {
          await fetchPurchases();
        }

        return {
          success: true,
          status: data.status,
          payment: data.payment,
          receipt: data.receipt,
          message: data.message,
        };
      }

      return {
        success: false,
        status: 'failed',
        message: data?.message || 'Payment verification failed',
      };
    } catch (err) {
      console.error('Payment verification error:', err);
      return {
        success: false,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Payment verification failed',
      };
    }
  }, [userId, fetchPurchases]);

  return {
    purchases,
    isLoading,
    error,
    hasPurchased,
    getPaymentOptions,
    getLocalPrice,
    initiatePayment,
    verifyPayment,
    refreshPurchases: fetchPurchases,
  };
};
