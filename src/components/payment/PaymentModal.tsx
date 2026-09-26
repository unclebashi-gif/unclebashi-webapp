import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';
import { useGeolocation, COUNTRY_NAMES } from '@/hooks/useGeolocation';
import { 
  usePayments, 
  PAYMENT_OPTIONS, 
  CURRENCY_INFO,
  type PaymentMethod,
  type PaymentOption,
  type Receipt,
} from '@/hooks/usePayments';
import {
  CreditCardIcon,
  PhoneIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ShieldIcon,
  GlobeIcon,
  ClockIcon,
} from '../ui/Icons';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  course: {
    id: string;
    title: string;
    price: number;
    description?: string;
  };
  userId: string;
  userEmail: string;
  userName: string;
  onPaymentSuccess: (receipt: Receipt) => void;
}

type PaymentStep = 'select_method' | 'enter_details' | 'processing' | 'success' | 'error';

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  course,
  userId,
  userEmail,
  userName,
  onPaymentSuccess,
}) => {
  const { location, setManualLocation } = useGeolocation();
  const { initiatePayment, verifyPayment, getPaymentOptions, getLocalPrice } = usePayments(userId);
  
  const [step, setStep] = useState<PaymentStep>('select_method');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [showCountrySelector, setShowCountrySelector] = useState(false);

  const countryCode = location?.countryCode || 'CA';
  const availableOptions = getPaymentOptions(countryCode);
  const localPrice = getLocalPrice(course.price, countryCode);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('select_method');
      setSelectedMethod(null);
      setPhoneNumber('');
      setErrorMessage('');
      setTransactionRef('');
      setReceipt(null);
      setPollCount(0);
    }
  }, [isOpen]);

  // Poll for mobile money payment completion
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;
    
    if (step === 'processing' && transactionRef && selectedMethod !== 'card') {
      pollInterval = setInterval(async () => {
        setPollCount(prev => prev + 1);
        
        const result = await verifyPayment(transactionRef);
        
        if (result.status === 'completed') {
          setReceipt(result.receipt);
          setStep('success');
          onPaymentSuccess(result.receipt);
          clearInterval(pollInterval);
        } else if (result.status === 'failed' || pollCount > 60) {
          setErrorMessage(result.message || 'Payment verification failed');
          setStep('error');
          clearInterval(pollInterval);
        }
      }, 5000); // Poll every 5 seconds
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [step, transactionRef, selectedMethod, pollCount, verifyPayment, onPaymentSuccess]);

  const handleMethodSelect = (method: PaymentMethod) => {
    setSelectedMethod(method);
    if (method === 'card') {
      // For card payments, we can proceed directly
      setStep('enter_details');
    } else {
      // For mobile money, we need phone number
      setStep('enter_details');
    }
  };

  const handleSubmitPayment = async () => {
    if (!selectedMethod) return;
    
    // Validate phone number for mobile money
    if (selectedMethod !== 'card' && !phoneNumber) {
      setErrorMessage('Please enter your phone number');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');

    try {
      const result = await initiatePayment({
        userId,
        courseId: course.id,
        courseTitle: course.title,
        amount: course.price,
        paymentMethod: selectedMethod,
        countryCode,
        phoneNumber: selectedMethod !== 'card' ? phoneNumber : undefined,
        email: userEmail,
        name: userName,
      });

      if (result.success) {
        setTransactionRef(result.transactionRef || '');
        
        if (result.paymentLink) {
          // For card payments, redirect to Flutterwave
          window.location.href = result.paymentLink;
        } else if (result.requiresAction) {
          // For mobile money, show processing screen
          setStep('processing');
        }
      } else {
        setErrorMessage(result.error || 'Payment failed');
        setStep('error');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Payment failed');
      setStep('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const getMethodIcon = (method: PaymentMethod) => {
    if (method === 'card') {
      return <CreditCardIcon size={24} className="text-[#1e3a5f]" />;
    }
    return <PhoneIcon size={24} className="text-[#1e3a5f]" />;
  };

  const getMethodColor = (method: PaymentMethod) => {
    switch (method) {
      case 'mpesa': return 'bg-green-500';
      case 'mtn_momo': return 'bg-yellow-500';
      case 'airtel_money': return 'bg-red-500';
      default: return 'bg-blue-500';
    }
  };

  const renderSelectMethod = () => (
    <div className="space-y-6">
      {/* Course Summary */}
      <div className="bg-[#faf6f1] rounded-xl p-4">
        <h3 className="font-semibold text-[#1e3a5f] mb-1">{course.title}</h3>
        <div className="flex items-center justify-between">
          <span className="text-gray-600 text-sm">Course Price</span>
          <div className="text-right">
            <span className="text-2xl font-bold text-[#1e3a5f]">${course.price}</span>
            {countryCode !== 'US' && (
              <p className="text-sm text-gray-500">
                ≈ {localPrice.symbol} {localPrice.amount.toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Location Indicator */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center text-gray-600">
          <GlobeIcon size={16} className="mr-2" />
          <span>Paying from {COUNTRY_NAMES[countryCode] || countryCode}</span>
        </div>
        <button
          onClick={() => setShowCountrySelector(!showCountrySelector)}
          className="text-[#c4785a] hover:underline"
        >
          Change
        </button>
      </div>

      {/* Country Selector */}
      {showCountrySelector && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-sm text-gray-600 mb-2">Select your country:</p>
          <div className="grid grid-cols-2 gap-2">
            {['UG', 'KE', 'RW', 'CA'].map(code => (
              <button
                key={code}
                onClick={() => {
                  setManualLocation(code);
                  setShowCountrySelector(false);
                  setSelectedMethod(null);
                }}
                className={`p-2 rounded-lg text-sm font-medium transition-colors ${
                  countryCode === code
                    ? 'bg-[#1e3a5f] text-white'
                    : 'bg-white border border-gray-200 hover:border-[#1e3a5f]'
                }`}
              >
                {COUNTRY_NAMES[code]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Payment Methods */}
      <div>
        <h4 className="font-medium text-[#1e3a5f] mb-3">Select Payment Method</h4>
        <div className="space-y-3">
          {availableOptions.map(option => (
            <button
              key={option.id}
              onClick={() => handleMethodSelect(option.id)}
              className={`w-full p-4 rounded-xl border-2 transition-all flex items-center ${
                selectedMethod === option.id
                  ? 'border-[#1e3a5f] bg-[#1e3a5f]/5'
                  : 'border-gray-200 hover:border-[#1e3a5f]/50'
              }`}
            >
              <div className={`w-12 h-12 rounded-full ${getMethodColor(option.id)} flex items-center justify-center mr-4`}>
                {getMethodIcon(option.id)}
              </div>
              <div className="text-left flex-1">
                <p className="font-semibold text-[#1e3a5f]">{option.name}</p>
                <p className="text-sm text-gray-500">{option.description}</p>
              </div>
              {selectedMethod === option.id && (
                <CheckCircleIcon size={24} className="text-[#1e3a5f]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Security Badge */}
      <div className="flex items-center justify-center text-sm text-gray-500 pt-4 border-t border-gray-100">
        <ShieldIcon size={16} className="mr-2 text-emerald-500" />
        <span>Secured by Flutterwave. Your payment is protected.</span>
      </div>
    </div>
  );

  const renderEnterDetails = () => (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={() => setStep('select_method')}
        className="text-sm text-[#c4785a] hover:underline"
      >
        ← Back to payment methods
      </button>

      {/* Selected Method */}
      <div className="bg-[#faf6f1] rounded-xl p-4 flex items-center">
        <div className={`w-10 h-10 rounded-full ${getMethodColor(selectedMethod!)} flex items-center justify-center mr-3`}>
          {getMethodIcon(selectedMethod!)}
        </div>
        <div>
          <p className="font-semibold text-[#1e3a5f]">
            {PAYMENT_OPTIONS.find(o => o.id === selectedMethod)?.name}
          </p>
          <p className="text-sm text-gray-500">
            {localPrice.symbol} {localPrice.amount.toLocaleString()} ({course.price} USD)
          </p>
        </div>
      </div>

      {/* Phone Number Input (for mobile money) */}
      {selectedMethod !== 'card' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Mobile Money Phone Number
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              {countryCode === 'UG' ? '+256' : countryCode === 'KE' ? '+254' : '+250'}
            </span>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
              placeholder="7XXXXXXXX"
              className="w-full pl-16 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Enter your {PAYMENT_OPTIONS.find(o => o.id === selectedMethod)?.name} registered number
          </p>
        </div>
      )}

      {/* Card Payment Info */}
      {selectedMethod === 'card' && (
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-sm text-blue-800">
            You'll be redirected to our secure payment page to enter your card details.
          </p>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg flex items-center">
          <AlertCircleIcon size={18} className="mr-2" />
          {errorMessage}
        </div>
      )}

      {/* Submit Button */}
      <Button
        fullWidth
        size="lg"
        onClick={handleSubmitPayment}
        isLoading={isProcessing}
        disabled={selectedMethod !== 'card' && !phoneNumber}
      >
        {selectedMethod === 'card' ? 'Proceed to Payment' : `Pay ${localPrice.symbol} ${localPrice.amount.toLocaleString()}`}
      </Button>
    </div>
  );

  const renderProcessing = () => (
    <div className="text-center py-8 space-y-6">
      {/* Animated Phone */}
      <div className="relative mx-auto w-24 h-24">
        <div className="absolute inset-0 bg-[#1e3a5f]/10 rounded-full animate-ping" />
        <div className="relative w-24 h-24 bg-[#1e3a5f] rounded-full flex items-center justify-center">
          <PhoneIcon size={40} className="text-white animate-pulse" />
        </div>
      </div>

      <div>
        <h3 className="text-xl font-bold text-[#1e3a5f] mb-2">Check Your Phone</h3>
        <p className="text-gray-600">
          A payment prompt has been sent to your phone. Please enter your PIN to complete the payment.
        </p>
      </div>

      {/* Phone Number Display */}
      <div className="bg-[#faf6f1] rounded-xl p-4">
        <p className="text-sm text-gray-500">Payment request sent to</p>
        <p className="font-semibold text-[#1e3a5f]">
          {countryCode === 'UG' ? '+256' : countryCode === 'KE' ? '+254' : '+250'}{phoneNumber}
        </p>
      </div>

      {/* Waiting Indicator */}
      <div className="flex items-center justify-center text-sm text-gray-500">
        <ClockIcon size={16} className="mr-2 animate-spin" />
        <span>Waiting for confirmation... ({pollCount}s)</span>
      </div>

      {/* Cancel Button */}
      <Button variant="outline" onClick={onClose}>
        Cancel
      </Button>
    </div>
  );

  const renderSuccess = () => (
    <div className="text-center py-8 space-y-6">
      {/* Success Icon */}
      <div className="mx-auto w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
        <CheckCircleIcon size={48} className="text-emerald-500" />
      </div>

      <div>
        <h3 className="text-xl font-bold text-[#1e3a5f] mb-2">Payment Successful!</h3>
        <p className="text-gray-600">
          Thank you for your purchase. You now have full access to the course.
        </p>
      </div>

      {/* Receipt Summary */}
      {receipt && (
        <div className="bg-[#faf6f1] rounded-xl p-4 text-left">
          <h4 className="font-semibold text-[#1e3a5f] mb-3">Receipt</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Receipt #</span>
              <span className="font-medium">{receipt.receipt_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Course</span>
              <span className="font-medium">{receipt.course_title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Amount</span>
              <span className="font-medium">
                {CURRENCY_INFO[countryCode]?.symbol || '$'} {receipt.amount}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Date</span>
              <span className="font-medium">
                {new Date(receipt.issued_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-3">
        <Button fullWidth onClick={onClose}>
          Start Learning
        </Button>
        <button className="text-sm text-[#c4785a] hover:underline">
          Download Receipt (PDF)
        </button>
      </div>
    </div>
  );

  const renderError = () => (
    <div className="text-center py-8 space-y-6">
      {/* Error Icon */}
      <div className="mx-auto w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
        <AlertCircleIcon size={48} className="text-red-500" />
      </div>

      <div>
        <h3 className="text-xl font-bold text-[#1e3a5f] mb-2">Payment Failed</h3>
        <p className="text-gray-600">{errorMessage || 'Something went wrong with your payment.'}</p>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        <Button fullWidth onClick={() => setStep('select_method')}>
          Try Again
        </Button>
        <Button variant="outline" fullWidth onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={step === 'success' ? '' : 'Complete Your Purchase'}>
      <div className="p-6">
        {step === 'select_method' && renderSelectMethod()}
        {step === 'enter_details' && renderEnterDetails()}
        {step === 'processing' && renderProcessing()}
        {step === 'success' && renderSuccess()}
        {step === 'error' && renderError()}
      </div>
    </Modal>
  );
};
