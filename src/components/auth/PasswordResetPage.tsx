import React, { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '../ui/button';

export const PasswordResetPage: React.FC = () => {
  const navigate = useNavigate();
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      setHasRecoverySession(!sessionError && !!data.session);
      setIsCheckingSession(false);
      if (sessionError) setError('The password-reset link could not be verified. Request a new link and try again.');
    }).catch(() => {
      if (!active) return;
      setError('The password-reset link could not be verified. Request a new link and try again.');
      setIsCheckingSession(false);
    });
    return () => { active = false; };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess(true);
    } catch (updateError: unknown) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update the password.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#faf6f1] px-4 py-12">
      <section className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Reset your password</h1>
        {isCheckingSession ? (
          <p className="mt-4 text-sm text-gray-600" role="status">Verifying your reset link…</p>
        ) : success ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-emerald-700" role="status">Your password has been updated.</p>
            <Button fullWidth onClick={() => navigate('/', { replace: true })}>Continue to Uncle Bashi</Button>
          </div>
        ) : hasRecoverySession ? (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5"
                minLength={8}
                required
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5"
                minLength={8}
                required
              />
            </label>
            {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
            <Button type="submit" fullWidth isLoading={isSaving}>Update password</Button>
          </form>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-gray-600">This reset link is missing or expired. Request a new password-reset email.</p>
            {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
            <Link to="/" className="inline-block text-sm font-medium text-[#c4785a] hover:underline">Return home</Link>
          </div>
        )}
      </section>
    </main>
  );
};
