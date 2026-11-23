import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getAdminCounsellingRequests, updateCounsellingRequestStatus } from '@/lib/counsellingService';
import type { AdminCounsellingRequest, CounsellingRequestStatus } from '@/types/counselling';

const filters: Array<[string, CounsellingRequestStatus | undefined]> = [
  ['Open requests', undefined], ['Submitted', 'submitted'], ['Under review', 'under_review'],
  ['Contacted', 'contacted'], ['Referred', 'referred'], ['Closed', 'closed'], ['Withdrawn', 'withdrawn'],
];

const nextActions = (status: CounsellingRequestStatus): Array<[string, Extract<CounsellingRequestStatus, 'under_review' | 'contacted' | 'referred' | 'closed'>]> => {
  if (status === 'submitted') return [['Move to review', 'under_review'], ['Close request', 'closed']];
  if (status === 'under_review') return [['Mark contacted', 'contacted'], ['Close request', 'closed']];
  if (status === 'contacted') return [['Mark referred', 'referred'], ['Close request', 'closed']];
  if (status === 'referred') return [['Close request', 'closed']];
  return [];
};

export const AdminCounsellingQueue: React.FC = () => {
  const [filter, setFilter] = useState<CounsellingRequestStatus | undefined>();
  const [rows, setRows] = useState<AdminCounsellingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(await getAdminCounsellingRequests(filter)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Counselling requests could not be loaded.'); }
    finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { void refresh(); }, [refresh]);

  const changeStatus = async (row: AdminCounsellingRequest, status: Extract<CounsellingRequestStatus, 'under_review' | 'contacted' | 'referred' | 'closed'>) => {
    setBusyId(row.request_id); setError(''); setNotice('');
    try {
      await updateCounsellingRequestStatus(row.request_id, status);
      setNotice(`Request updated to ${status.replace(/_/g, ' ')}.`);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Counselling request could not be updated.'); }
    finally { setBusyId(null); }
  };

  return <section className="rounded-xl bg-white p-5 shadow-sm sm:p-6" aria-labelledby="admin-counselling-queue-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="admin-counselling-queue-heading" className="text-xl font-bold text-[#1e3a5f]">Counselling requests</h2><p className="mt-1 text-sm text-gray-600">Operational routing only. Do not add clinical notes or diagnoses here.</p></div>
      <Button variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>Refresh</Button>
    </div>
    <label className="mt-4 block max-w-sm text-sm font-medium text-gray-700">Filter requests
      <select value={filter ?? ''} onChange={(event) => setFilter((event.target.value || undefined) as CounsellingRequestStatus | undefined)} className="mt-1 w-full rounded-lg border border-gray-300 p-2">
        {filters.map(([label, status]) => <option key={status ?? 'open'} value={status ?? ''}>{label}</option>)}
      </select>
    </label>
    {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
    {notice && <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800" role="status">{notice}</p>}
    {loading && <p className="mt-5 text-sm text-gray-500" role="status">Loading counselling requests…</p>}
    {!loading && !error && rows.length === 0 && <p className="mt-5 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">No requests in this queue.</p>}
    <div className="mt-5 space-y-4">
      {rows.map((row) => <article key={row.request_id} className="rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="font-semibold text-[#1e3a5f]">{row.display_name || 'Name not provided'} · {row.contact_email || row.user_id}</h3><p className="mt-1 text-xs text-gray-500">{row.request_id} · Submitted {row.submitted_at ? new Date(row.submitted_at).toLocaleString() : '—'}</p></div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium capitalize text-blue-800">{row.status.replace(/_/g, ' ')}</span>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium text-gray-700">Support type</dt><dd className="capitalize text-gray-600">{row.support_type?.replace(/_/g, ' ') || 'Not selected'}</dd></div>
          <div><dt className="font-medium text-gray-700">Urgency self-description</dt><dd className="capitalize text-gray-600">{row.urgency_self_description?.replace(/_/g, ' ') || 'Not selected'}</dd></div>
          <div><dt className="font-medium text-gray-700">Country</dt><dd className="text-gray-600">{row.country_code || '—'}</dd></div>
          <div><dt className="font-medium text-gray-700">Preferred contact</dt><dd className="capitalize text-gray-600">{row.preferred_contact_method || '—'}{row.contact_phone ? ` · ${row.contact_phone}` : ''}</dd></div>
        </dl>
        {row.brief_reason && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{row.brief_reason}</p>}
        {nextActions(row.status).length > 0 && <div className="mt-4 flex flex-wrap gap-2">{nextActions(row.status).map(([label, status]) => <Button key={status} size="sm" variant={status === 'closed' ? 'outline' : undefined} disabled={busyId === row.request_id} onClick={() => void changeStatus(row, status)}>{label}</Button>)}</div>}
      </article>)}
    </div>
  </section>;
};
