import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { getMatchmakingAdminQueue, getMatchmakingAdminReports, getMatchmakingAdminReviewHistory, reviewMatchmakingProfile, reviewMatchmakingReport } from '@/lib/matchmakingService';
import type { MatchmakingAdminProfile, MatchmakingAdminReport, MatchmakingAdminReviewHistory } from '@/types/matchmaking';

export const AdminMatchmakingPanel: React.FC = () => {
  const [profiles,setProfiles]=useState<MatchmakingAdminProfile[]>([]);
  const [reviewHistory,setReviewHistory]=useState<MatchmakingAdminReviewHistory[]>([]);
  const [reports,setReports]=useState<MatchmakingAdminReport[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try { const [p,r,h]=await Promise.all([getMatchmakingAdminQueue(),getMatchmakingAdminReports(),getMatchmakingAdminReviewHistory()]);setProfiles(p);setReports(r);setReviewHistory(h); }
    catch(e){setError(e instanceof Error?e.message:'Could not load matchmaking operations.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  const reviewProfile=async(userId:string,action:'approve'|'reject'|'hide')=>{
    setBusy(userId);setError('');
    try{await reviewMatchmakingProfile(userId,action);await load();}
    catch(e){setError(e instanceof Error?e.message:'Could not review profile.');}
    finally{setBusy(null);}
  };
  const reviewReport=async(id:string,status:'reviewed'|'dismissed'|'actioned')=>{
    setBusy(id);setError('');
    try{await reviewMatchmakingReport(id,status);await load();}
    catch(e){setError(e instanceof Error?e.message:'Could not review report.');}
    finally{setBusy(null);}
  };
  const hideReportedProfile=async(report:MatchmakingAdminReport)=>{
    setBusy(report.report_id);setError('');
    try{await reviewMatchmakingProfile(report.reported_user_id,'hide','Hidden after matchmaking safety report review.');await reviewMatchmakingReport(report.report_id,'actioned','Reported profile hidden by an administrator.');await load();}
    catch(e){setError(e instanceof Error?e.message:'Could not hide the reported profile.');}
    finally{setBusy(null);}
  };
  return <section className="bg-white rounded-xl shadow-sm p-6">
    <div className="flex justify-between items-center"><div><h2 className="text-xl font-semibold text-[#1e3a5f]">Matchmaking operations</h2><p className="text-sm text-gray-600 mt-1">Review profiles and safety reports. Sensitive preference answers are not shown here.</p></div><Button variant="outline" size="sm" onClick={()=>void load()} disabled={loading}>Refresh</Button></div>
    {error&&<p role="alert" className="text-red-700 bg-red-50 rounded p-3 my-4">{error}</p>}
    {loading?<p className="py-6 text-gray-500">Loading matchmaking queue…</p>:<>
    <h3 className="font-semibold mt-6 mb-3">Profiles</h3>
    {profiles.filter(p=>p.status==='pending_review').length===0?<p className="text-gray-500">No profiles are waiting for review.</p>:<div className="space-y-3">{profiles.filter(p=>p.status==='pending_review').map(p=><article key={p.user_id} className="border rounded-lg p-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{p.display_name} · {p.age??'Age unavailable'}</p><p className="text-sm text-gray-500">{[p.city,p.country_code].filter(Boolean).join(', ')} · {p.completion_percentage}% · Pending review</p>{p.introduction&&<p className="mt-2 max-w-2xl text-sm">{p.introduction}</p>}</div><div className="flex gap-2"><Button size="sm" onClick={()=>void reviewProfile(p.user_id,'approve')} disabled={busy===p.user_id}>Approve</Button><Button size="sm" variant="outline" onClick={()=>void reviewProfile(p.user_id,'reject')} disabled={busy===p.user_id}>Reject</Button><Button size="sm" variant="ghost" onClick={()=>void reviewProfile(p.user_id,'hide')} disabled={busy===p.user_id}>Hide</Button></div></article>)}</div>}
    <h3 className="font-semibold mt-8 mb-3">Reviewed profiles</h3>
    {reviewHistory.length===0?<p className="text-gray-500">No reviewed profiles yet.</p>:<div className="space-y-3">{reviewHistory.map(item=><article key={item.user_id} className="border rounded-lg p-4"><p className="font-medium capitalize">{item.status.replace('_',' ')}</p><p className="text-sm text-gray-500">User {item.user_id} · Reviewed {item.reviewed_at?new Date(item.reviewed_at).toLocaleString():'—'} · Reviewer {item.reviewed_by??'—'}</p>{item.review_notes&&<p className="mt-2 text-sm whitespace-pre-wrap">Internal review notes: {item.review_notes}</p>}</article>)}</div>}
    <h3 className="font-semibold mt-8 mb-3">Safety reports</h3>
    {reports.filter(r=>r.status==='pending').length===0?<p className="text-gray-500">No pending matchmaking reports.</p>:<div className="space-y-3">{reports.filter(r=>r.status==='pending').map(r=><article key={r.report_id} className="border rounded-lg p-4"><p className="font-medium">{r.reason.replace(/_/g,' ')}</p><p className="text-sm text-gray-500">Submitted {new Date(r.created_at).toLocaleString()}</p>{r.details&&<p className="mt-2 text-sm whitespace-pre-wrap">{r.details}</p>}<p className="text-xs text-gray-400 mt-1">Reporter and subject identifiers are restricted to this admin screen.</p><div className="flex gap-2 mt-3"><Button size="sm" onClick={()=>void hideReportedProfile(r)} disabled={busy===r.report_id}>Hide profile</Button><Button size="sm" variant="outline" onClick={()=>void reviewReport(r.report_id,'dismissed')} disabled={busy===r.report_id}>Dismiss</Button></div></article>)}</div>}
    </>}
  </section>;
};

