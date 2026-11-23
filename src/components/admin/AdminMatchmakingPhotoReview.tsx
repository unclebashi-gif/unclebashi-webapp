import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getAdminMatchmakingPhotoReviewQueue, getMatchmakingPhotoViewUrl, reviewMatchmakingPhoto } from '@/lib/matchmakingService';
import type { MatchmakingAdminPhotoReview } from '@/types/matchmaking';

export const AdminMatchmakingPhotoReview: React.FC = () => {
  const [queue, setQueue] = useState<MatchmakingAdminPhotoReview[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    setUrls({});
    try {
      const rows = await getAdminMatchmakingPhotoReviewQueue();
      setQueue(rows);
      const entries = await Promise.all(rows.map(async row => {
        try { return [row.id, await getMatchmakingPhotoViewUrl(row.id)] as const; }
        catch { return [row.id, ''] as const; }
      }));
      setUrls(Object.fromEntries(entries.filter(([, url]) => url)));
    } catch (cause) {
      setQueue([]);
      setError(cause instanceof Error ? cause.message : 'The photo review queue could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 4 * 60 * 1000);
    return () => clearInterval(timer);
  }, [load]);

  const decide = async (row: MatchmakingAdminPhotoReview, decision: 'approve' | 'reject') => {
    const reason = reasons[row.id]?.trim() ?? '';
    if (decision === 'reject' && (!reason || reason.length > 500)) {
      setError('Enter a rejection reason of 1 to 500 characters.');
      return;
    }
    setBusy(row.id);
    setError('');
    try {
      await reviewMatchmakingPhoto(row.id, decision, decision === 'reject' ? reason : undefined);
      toast.success(decision === 'approve' ? 'Photo approved.' : 'Photo rejected.');
      await load();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The photo review could not be saved.';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  return <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-[#1e3a5f]">Matchmaking photo review</h2><p className="mt-1 text-sm text-gray-600">Photo review is separate from biodata approval.</p></div><Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>Refresh</Button></div>
    {error && <p role="alert" className="mt-4 rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loading ? <p className="py-5 text-sm text-gray-500">Loading pending photos…</p> : queue.length === 0
      ? <p className="py-5 text-sm text-gray-500">No photos are waiting for review.</p>
      : <div className="mt-4 grid gap-4 md:grid-cols-2">{queue.map(row => <article key={row.id} className="rounded-lg border p-4">
        {urls[row.id] ? <img src={urls[row.id]} alt={`Pending Matchmaking photo for member ${row.user_id}`} className="aspect-[4/3] w-full rounded object-cover" /> : <div className="flex aspect-[4/3] items-center justify-center rounded bg-gray-100 text-sm text-gray-500">Photo preview unavailable</div>}
        <p className="mt-3 text-sm font-medium">Member {row.user_id}</p>
        <p className="text-xs text-gray-500">Position {row.display_order} · Uploaded {new Date(row.uploaded_at).toLocaleString()}</p>
        <label className="mt-3 block text-sm">Rejection reason (required to reject)<textarea maxLength={500} value={reasons[row.id] ?? ''} onChange={event => setReasons(current => ({ ...current, [row.id]: event.target.value }))} className="mt-1 min-h-20 w-full rounded-md border border-gray-300 p-2" /></label>
        <p className="text-right text-xs text-gray-500">{(reasons[row.id] ?? '').length}/500</p>
        <div className="mt-3 flex justify-end gap-2"><Button variant="outline" disabled={busy !== null} onClick={() => void decide(row, 'reject')}>Reject</Button><Button disabled={busy !== null} onClick={() => void decide(row, 'approve')}>Approve</Button></div>
      </article>)}</div>}
    {busy && <p className="mt-3 text-sm text-gray-500" role="status">Saving photo decision…</p>}
  </section>;
};
