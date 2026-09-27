import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/button';
import { useAppStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { IdentityLoadError, loadIdentity } from '@/lib/identity';
import { EyeIcon, EyeOffIcon, CheckCircleIcon } from '../ui/Icons';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const getAuthErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    return typeof message === 'string' && message ? message : fallback;
  }
  return fallback;
};

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { authModalMode, setAuthModalMode, setAuthenticatedUser, setCurrentView } = useAppStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    confirmPassword: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      // Validation
      if (!formData.email || !formData.password) {
        throw new Error('Please fill in all required fields');
      }

      if (authModalMode === 'signup') {
        if (!formData.fullName) {
          throw new Error('Please enter your full name');
        }
        if (formData.password !== formData.confirmPassword) {
          throw new Error('Passwords do not match');
        }
        if (formData.password.length < 8) {
          throw new Error('Password must be at least 8 characters');
        }

        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.fullName,
            },
          },
        });

        if (signUpError) throw signUpError;
        if (!authData.user) throw new Error('Supabase did not return a newly created account.');

        if (authData.session) {
          const identity = await loadIdentity(authData.user);
          setAuthenticatedUser(identity.user, identity.onboardingData);
          onClose();
          setCurrentView(identity.user.onboardingCompleted ? 'education' : 'onboarding');
        } else {
          setSuccess('Account created. Please check your email to verify your account before signing in.');
        }
      } else {
        const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (signInError) throw signInError;
        if (!authData.user) throw new Error('Supabase did not return the signed-in account.');

        const identity = await loadIdentity(authData.user);
        setAuthenticatedUser(identity.user, identity.onboardingData);
        onClose();
        setCurrentView(identity.user.onboardingCompleted ? 'education' : 'onboarding');
      }
    } catch (err: unknown) {
      if (err instanceof IdentityLoadError && err.kind === 'profile') {
        setError('Your account is authenticated, but its profile was not provisioned. Please contact support.');
      } else if (err instanceof IdentityLoadError && err.kind === 'roles') {
        setError('Your account roles could not be verified. Please contact support.');
      } else if (err instanceof IdentityLoadError) {
        setError('Your account is authenticated, but its data could not be loaded. Please try again.');
      } else {
        setError(getAuthErrorMessage(err, 'Authentication failed. Please try again.'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      if (!formData.email) {
        throw new Error('Please enter your email address');
      }

      const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setSuccess('Password reset email sent! Please check your inbox.');
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err, 'Failed to send reset email'));
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setAuthModalMode(authModalMode === 'login' ? 'signup' : 'login');
    setError('');
    setSuccess('');
    setShowForgotPassword(false);
    setFormData({ email: '', password: '', fullName: '', confirmPassword: '' });
  };

  // Forgot Password View
  if (showForgotPassword) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} size="md">
        <div className="p-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-[#1e3a5f]">Reset Password</h2>
            <p className="text-gray-600 mt-2">
              Enter your email and we'll send you a reset link
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-center">
              <CheckCircleIcon size={18} className="mr-2" />
              {success}
            </div>
          )}

          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent transition-all"
                placeholder="you@example.com"
              />
            </div>

            <Button type="submit" fullWidth isLoading={isLoading}>
              Send Reset Link
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setShowForgotPassword(false)}
              className="text-[#c4785a] font-medium hover:underline"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="p-6">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-[#1e3a5f]">
            {authModalMode === 'login' ? 'Welcome Back' : 'Begin Your Journey'}
          </h2>
          <p className="text-gray-600 mt-2">
            {authModalMode === 'login'
              ? 'Sign in to continue your preparation'
              : 'Create an account to start preparing for marriage'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-center">
            <CheckCircleIcon size={18} className="mr-2" />
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {authModalMode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent transition-all"
                placeholder="Enter your full name"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent transition-all"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent transition-all pr-10"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
              </button>
            </div>
          </div>

          {authModalMode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent transition-all"
                placeholder="Confirm your password"
              />
            </div>
          )}

          {authModalMode === 'login' && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-[#c4785a] hover:underline"
              >
                Forgot password?
              </button>
            </div>
          )}

          <Button type="submit" fullWidth isLoading={isLoading}>
            {authModalMode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600">
            {authModalMode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            <button
              onClick={toggleMode}
              className="ml-1 text-[#c4785a] font-medium hover:underline"
            >
              {authModalMode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>

        {authModalMode === 'signup' && (
          <p className="mt-4 text-xs text-gray-500 text-center">
            By creating an account, you agree to our Terms of Service and Privacy Policy.
            We are committed to protecting your data and never selling your personal information.
          </p>
        )}
      </div>
    </Modal>
  );
};
