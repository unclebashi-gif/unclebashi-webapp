import React, { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { getMyJourneys } from '@/lib/journeyService';
import {
  deactivateMyAccount,
  deleteMyMatchmakingData,
  getAccountDeletionReadiness,
  getAccountLifecycleStatus,
  reactivateMyAccount,
} from '@/lib/accountLifecycleService';
import type { AccountDeletionReadiness, AccountLifecycleStatus } from '@/types/accountLifecycle';
import { Button } from '@/components/ui/button';

export const AccountLifecyclePanel: React.FC = () => {
  const user = useAppStore((state) => state.user);
  const updateUser = useAppStore((state) => state.updateUser);
  const setJourneys = useAppStore((state) => state.setJourneys);
  const [status, setStatus] = useState<AccountLifecycleStatus | null>(null);
  const [readiness, setReadiness] = useState<AccountDeletionReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextStatus, nextReadiness] = await Promise.all([
        getAccountLifecycleStatus(),
        getAccountDeletionReadiness(),
      ]);
      setStatus(nextStatus);
      setReadiness(nextReadiness);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load account lifecycle information.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const updateAccountStatus = (accountStatus: AccountLifecycleStatus['account_status']) => {
    setStatus((current) => current ? { ...current, account_status: accountStatus } : current);
    updateUser({ accountStatus });
  };

  const deactivate = async () => {
    if (!window.confirm('Deactivate your Uncle Bashi account? You can reactivate it later. Your account and payment records will remain, and active participation will be blocked.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const accountStatus = await deactivateMyAccount();
      updateAccountStatus(accountStatus);
      setNotice('Your account is deactivated. Your data and payment history remain in place.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not deactivate this account.');
    } finally { setBusy(false); }
  };

  const reactivate = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const accountStatus = await reactivateMyAccount();
      updateAccountStatus(accountStatus);
      setNotice('Your account is active again. Previously withdrawn journeys were not restarted.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reactivate this account.');
    } finally { setBusy(false); }
  };

  const removeMatchmaking = async () => {
    if (!window.confirm('Remove your Marriage Matching profile, preferences, interests, and photos? This does not delete your Uncle Bashi account or other journeys. Photo files are queued for background cleanup.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await deleteMyMatchmakingData();
      setJourneys(await getMyJourneys());
      setNotice(result.profile_removed || result.photos_removed > 0
        ? 'Your Matchmaking participation was removed. Photo file cleanup may finish in the background.'
        : 'No active Matchmaking profile data remained to remove.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove Matchmaking participation.');
    } finally { setBusy(false); }
  };

  const accountStatus = status?.account_status ?? user?.accountStatus;
  const paymentBlocked = readiness?.has_payment_history ?? false;

  return <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm" aria-labelledby="account-lifecycle-heading">
    <h2 id="account-lifecycle-heading" className="text-xl font-bold text-[#1e3a5f]">Account lifecycle</h2>
    <p className="mt-1 text-sm text-gray-600">Manage participation separately from your Uncle Bashi account.</p>
    {loading && <p className="mt-4 text-sm text-gray-500" role="status">Loading account controls…</p>}
    {error && <div className="mt-4 text-sm text-red-700" role="alert">{error} <button className="underline" type="button" onClick={() => void refresh()}>Try again</button></div>}
    {notice && <p className="mt-4 text-sm text-emerald-800" role="status">{notice}</p>}
    {!loading && !error && <div className="mt-5 grid gap-4 md:grid-cols-2">
      <article className="rounded-xl bg-[#faf6f1] p-4">
        <h3 className="font-semibold text-[#1e3a5f]">Marriage Matching</h3>
        <p className="mt-2 text-sm text-gray-600">Your Matchmaking profile, preferences, photos and active participation will be removed. Safety and moderation records such as blocks or reports may be retained. This does not delete your Uncle Bashi account.</p>
        <Button className="mt-4" variant="outline" disabled={busy} onClick={() => void removeMatchmaking()}>Delete Matchmaking profile and participation</Button>
      </article>
      <article className="rounded-xl bg-[#faf6f1] p-4">
        <h3 className="font-semibold text-[#1e3a5f]">Deactivate account</h3>
        <p className="mt-2 text-sm text-gray-600">Deactivation is reversible. It blocks active participation and Matchmaking discovery while retaining your account data and payment history.</p>
        {accountStatus === 'active'
          ? <Button className="mt-4" variant="outline" disabled={busy} onClick={() => void deactivate()}>Deactivate account</Button>
          : accountStatus === 'deactivated'
            ? <Button className="mt-4" disabled={busy} onClick={() => void reactivate()}>Reactivate account</Button>
            : <p className="mt-4 text-sm text-gray-600">Account status is restricted. Contact support for assistance.</p>}
      </article>
      <article className="rounded-xl border border-gray-200 p-4 md:col-span-2">
        <h3 className="font-semibold text-[#1e3a5f]">Delete account</h3>
        {paymentBlocked
          ? <p className="mt-2 text-sm text-gray-700">Your account cannot currently be hard-deleted because transaction records must remain linked under the current accounting design. You can deactivate the account instead.</p>
          : <p className="mt-2 text-sm text-gray-700">Hard deletion is not available through this account control. Active profile and product data can be removed where supported; some operational records may remain. You can deactivate the account instead.</p>}
        {readiness && readiness.retained_record_categories.length > 0 && <p className="mt-2 text-xs text-gray-500">Records currently linked to this account may include: {readiness.retained_record_categories.map((item) => item.replaceAll('_', ' ')).join(', ')}.</p>}
      </article>
    </div>}
  </section>;
};
