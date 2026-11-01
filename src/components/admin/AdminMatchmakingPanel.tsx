import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  getMatchmakingAdminProfileDetail, getMatchmakingAdminQueue, getMatchmakingAdminReports,
  getMatchmakingAdminReviewHistory, reviewMatchmakingProfile, reviewMatchmakingReport,
} from '@/lib/matchmakingService';
import type {
  MatchmakingAdminProfile, MatchmakingAdminProfileDetail, MatchmakingAdminReport,
  MatchmakingAdminReviewHistory,
} from '@/types/matchmaking';

type ReviewAction = 'approve' | 'reject' | 'hide';
type DetailField = keyof MatchmakingAdminProfileDetail;

const valueOrFallback = (value: unknown, fallback = 'Not provided') => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

const detailSections: Array<{ title: string; fields: Array<[string, DetailField]> }> = [
  { title: 'Core and review context', fields: [
    ['Member', 'display_name'], ['Age', 'age'], ['Current country', 'country_code'], ['City', 'city'],
    ['Core legal marital status', 'legal_marital_status'], ['Profile version', 'profile_version'],
    ['Completion', 'completion_percentage'], ['Status', 'status'], ['Submitted', 'submitted_at'],
  ] },
  { title: 'About and marriage vision', fields: [
    ['Height (cm)', 'height_cm'], ['Physical self-description', 'physical_self_description'],
    ['Introduction', 'introduction'], ['Marriage vision', 'marriage_vision_response'],
  ] },
  { title: 'Education and work', fields: [
    ['Education level', 'education_level'], ['Field of study', 'field_of_study'],
    ['Occupation', 'occupation'], ['Employment status', 'employment_status'],
  ] },
  { title: 'Family and future', fields: [
    ['Has children', 'has_children'], ['Wants children', 'wants_children'], ['Smoking', 'smoking'],
    ['Drinking', 'drinking'], ['Family background', 'family_background'], ['Family involvement', 'family_involvement'],
    ['Marriage timeline', 'marriage_timeline'], ['Marriage structure', 'marriage_structure'],
    ['Willing to relocate', 'willing_to_relocate'], ['Long-distance openness', 'long_distance_openness'],
    ['Provider model', 'provider_model'], ['Family / in-law expectations', 'family_in_law_expectations'],
  ] },
  { title: 'Faith (only when displayed to members)', fields: [
    ['Religion / faith', 'religion_or_faith'], ['Faith practice', 'faith_practice_level'],
    ['Denomination / tradition', 'denomination_or_tradition'], ['Faith expectations', 'faith_expectations'],
  ] },
  { title: 'Culture and region (only when displayed to members)', fields: [
    ['Cultural / ethnic community', 'cultural_or_ethnic_community'], ['Clan / region', 'clan_or_region'],
  ] },
];

export const AdminMatchmakingPanel: React.FC = () => {
  const [profiles, setProfiles] = useState<MatchmakingAdminProfile[]>([]);
  const [reviewHistory, setReviewHistory] = useState<MatchmakingAdminReviewHistory[]>([]);
  const [reports, setReports] = useState<MatchmakingAdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MatchmakingAdminProfileDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [queue, reportRows, history] = await Promise.all([
        getMatchmakingAdminQueue(), getMatchmakingAdminReports(), getMatchmakingAdminReviewHistory(),
      ]);
      setProfiles(queue);
      setReports(reportRows);
      setReviewHistory(history);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load matchmaking operations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openProfileDetail = async (userId: string) => {
    setDetailUserId(userId);
    setDetail(null);
    setDetailLoading(true);
    setError('');
    try {
      setDetail(await getMatchmakingAdminProfileDetail(userId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the review profile.');
    } finally {
      setDetailLoading(false);
    }
  };

  const reviewProfile = async (userId: string, action: ReviewAction) => {
    setBusy(userId);
    setError('');
    try {
      await reviewMatchmakingProfile(userId, action);
      setDetailUserId(null);
      setDetail(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not review profile.');
    } finally {
      setBusy(null);
    }
  };

  const reviewReport = async (id: string, status: 'reviewed' | 'dismissed' | 'actioned') => {
    setBusy(id);
    setError('');
    try {
      await reviewMatchmakingReport(id, status);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not review report.');
    } finally {
      setBusy(null);
    }
  };

  const hideReportedProfile = async (report: MatchmakingAdminReport) => {
    setBusy(report.report_id);
    setError('');
    try {
      await reviewMatchmakingProfile(report.reported_user_id, 'hide', 'Hidden after matchmaking safety report review.');
      await reviewMatchmakingReport(report.report_id, 'actioned', 'Reported profile hidden by an administrator.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not hide the reported profile.');
    } finally {
      setBusy(null);
    }
  };

  return <section className="bg-white rounded-xl shadow-sm p-6">
    <div className="flex justify-between items-center">
      <div><h2 className="text-xl font-semibold text-[#1e3a5f]">Matchmaking operations</h2><p className="text-sm text-gray-600 mt-1">Review profiles and safety reports. Private partner preferences are not shown here.</p></div>
      <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>Refresh</Button>
    </div>
    {error && <p role="alert" className="text-red-700 bg-red-50 rounded p-3 my-4">{error}</p>}
    {loading ? <p className="py-6 text-gray-500">Loading matchmaking queue…</p> : <>
      <h3 className="font-semibold mt-6 mb-3">Profiles</h3>
      {profiles.filter(profile => profile.status === 'pending_review').length === 0
        ? <p className="text-gray-500">No profiles are waiting for review.</p>
        : <div className="space-y-3">{profiles.filter(profile => profile.status === 'pending_review').map(profile => <article key={profile.user_id} className="border rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-medium">{profile.display_name} · {profile.age ?? 'Age unavailable'}</p><p className="text-sm text-gray-500">{[profile.city, profile.country_code].filter(Boolean).join(', ')} · {profile.completion_percentage}% · Pending review</p>{profile.introduction && <p className="mt-2 max-w-2xl text-sm">{profile.introduction}</p>}</div>
          <Button size="sm" onClick={() => void openProfileDetail(profile.user_id)} disabled={detailLoading}>Review profile</Button>
        </article>)}</div>}

      <h3 className="font-semibold mt-8 mb-3">Reviewed profiles</h3>
      {reviewHistory.length === 0 ? <p className="text-gray-500">No reviewed profiles yet.</p> : <div className="space-y-3">{reviewHistory.map(item => <article key={item.user_id} className="border rounded-lg p-4">
        <p className="font-medium capitalize">{item.status.replace('_', ' ')}</p><p className="text-sm text-gray-500">User {item.user_id} · Reviewed {item.reviewed_at ? new Date(item.reviewed_at).toLocaleString() : '—'} · Reviewer {item.reviewed_by ?? '—'}</p>{item.review_notes && <p className="mt-2 text-sm whitespace-pre-wrap">Internal review notes: {item.review_notes}</p>}
      </article>)}</div>}

      <h3 className="font-semibold mt-8 mb-3">Safety reports</h3>
      {reports.filter(report => report.status === 'pending').length === 0 ? <p className="text-gray-500">No pending matchmaking reports.</p> : <div className="space-y-3">{reports.filter(report => report.status === 'pending').map(report => <article key={report.report_id} className="border rounded-lg p-4">
        <p className="font-medium">{report.reason.replace(/_/g, ' ')}</p><p className="text-sm text-gray-500">Submitted {new Date(report.created_at).toLocaleString()}</p>{report.details && <p className="mt-2 text-sm whitespace-pre-wrap">{report.details}</p>}<p className="text-xs text-gray-400 mt-1">Reporter and subject identifiers are restricted to this admin screen.</p>
        <div className="flex gap-2 mt-3"><Button size="sm" onClick={() => void hideReportedProfile(report)} disabled={busy === report.report_id}>Hide profile</Button><Button size="sm" variant="outline" onClick={() => void reviewReport(report.report_id, 'dismissed')} disabled={busy === report.report_id}>Dismiss</Button></div>
      </article>)}</div>}
    </>}

    <Dialog open={detailUserId !== null} onOpenChange={open => { if (!open) { setDetailUserId(null); setDetail(null); } }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Matchmaking profile review</DialogTitle><DialogDescription>Review the member-visible profile content before taking action. Private partner preferences and financial readiness are excluded.</DialogDescription></DialogHeader>
        {detailLoading ? <p className="py-6 text-gray-500">Loading review profile…</p> : detail ? <>
          <div className="space-y-5">{detailSections.map(section => <section key={section.title} className="border-b pb-4 last:border-b-0">
            <h3 className="font-semibold text-[#1e3a5f]">{section.title}</h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">{section.fields.map(([label, key]) => <div key={key} className={['introduction', 'marriage_vision_response', 'physical_self_description', 'family_background', 'faith_expectations'].includes(key) ? 'sm:col-span-2' : ''}>
              <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{valueOrFallback(detail[key], key === 'religion_or_faith' || key === 'faith_practice_level' || key === 'denomination_or_tradition' || key === 'faith_expectations' || key === 'cultural_or_ethnic_community' || key === 'clan_or_region' ? 'Not provided or not displayed to members' : 'Not provided')}</dd>
            </div>)}</dl>
          </section>)}</div>
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button onClick={() => void reviewProfile(detail.user_id, 'approve')} disabled={busy === detail.user_id}>Approve</Button>
            <Button variant="outline" onClick={() => void reviewProfile(detail.user_id, 'reject')} disabled={busy === detail.user_id}>Reject</Button>
            <Button variant="ghost" onClick={() => void reviewProfile(detail.user_id, 'hide')} disabled={busy === detail.user_id}>Hide</Button>
          </div>
        </> : !detailLoading && <p className="py-6 text-gray-500">The review profile could not be loaded. Close this window and try again.</p>}
      </DialogContent>
    </Dialog>
  </section>;
};
