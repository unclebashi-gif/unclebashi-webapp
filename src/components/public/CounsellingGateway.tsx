import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { activateJourney, setJourneyStatus } from '@/lib/journeyService';
import {
  getMyCounsellingRequest,
  saveCounsellingRequest,
  submitCounsellingRequest,
  withdrawCounsellingRequest,
} from '@/lib/counsellingService';
import { journeyCoreEligible } from '@/lib/journeyEligibility';
import { useAppStore } from '@/lib/store';
import type { CounsellingRequest, CounsellingRequestDraft, CounsellingSupportType, CounsellingUrgency, CounsellingContactMethod, CounsellingPartnerParticipation } from '@/types/counselling';

const emptyDraft: CounsellingRequestDraft = {
  support_type: null,
  preferred_contact_method: null,
  contact_phone: null,
  preferred_time_notes: null,
  country_code: null,
  brief_reason: null,
  partner_participation: null,
  urgency_self_description: null,
  consent_to_contact: false,
};

const toDraft = (request: CounsellingRequest | null): CounsellingRequestDraft => request ? ({
  support_type: request.support_type,
  preferred_contact_method: request.preferred_contact_method,
  contact_phone: request.contact_phone,
  preferred_time_notes: request.preferred_time_notes,
  country_code: request.country_code,
  brief_reason: request.brief_reason,
  partner_participation: request.partner_participation,
  urgency_self_description: request.urgency_self_description,
  consent_to_contact: request.consent_to_contact,
}) : emptyDraft;

const supportOptions: Array<[CounsellingSupportType, string]> = [
  ['couples_counselling', 'Couples counselling'],
  ['family_counselling', 'Family counselling'],
  ['relationship_counselling', 'Relationship counselling'],
  ['individual_relationship_support', 'Individual relationship support'],
  ['crisis_support', 'Crisis support'],
  ['not_sure', 'I am not sure'],
];

const statusLabel: Record<string, string> = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under review', contacted: 'Contacted',
  referred: 'Referred', closed: 'Closed', withdrawn: 'Withdrawn',
};

const readyToSubmit = (draft: CounsellingRequestDraft): boolean => Boolean(
  draft.support_type
  && draft.urgency_self_description
  && draft.preferred_contact_method
  && draft.consent_to_contact
  && (draft.preferred_contact_method === 'email' || Boolean(draft.contact_phone?.trim()))
  && (draft.urgency_self_description === 'immediate_danger'
    || (draft.brief_reason?.trim() && /^[A-Za-z]{2}$/.test(draft.country_code?.trim() || ''))),
);

export const CounsellingGateway: React.FC = () => {
  const { isAuthenticated, user, journeys, upsertJourney, setShowAuthModal } = useAppStore();
  const journey = journeys.find((item) => item.journey_type === 'counselling');
  const eligible = journeyCoreEligible(user, 'counselling');
  const [request, setRequest] = useState<CounsellingRequest | null>(null);
  const [values, setValues] = useState<CounsellingRequestDraft>(emptyDraft);
  const [baseline, setBaseline] = useState<CounsellingRequestDraft>(emptyDraft);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dangerGuidanceDismissed, setDangerGuidanceDismissed] = useState(false);
  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(baseline), [values, baseline]);
  const isPaused = journey?.status === 'paused';
  const isImmediateDanger = values.urgency_self_description === 'immediate_danger';

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const current = await getMyCounsellingRequest();
      const draft = toDraft(current);
      setRequest(current);
      setValues(draft);
      setBaseline(draft);
      setDangerGuidanceDismissed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your counselling request could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
    else setLoading(false);
  }, [isAuthenticated, load]);

  const update = <K extends keyof CounsellingRequestDraft>(key: K, value: CounsellingRequestDraft[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setError('');
    setNotice('');
    if (key === 'urgency_self_description' && value === 'immediate_danger') setDangerGuidanceDismissed(false);
  };

  const saveDraft = async (draft = values): Promise<CounsellingRequest | null> => {
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await saveCounsellingRequest(draft);
      const savedDraft = toDraft(saved);
      setRequest(saved); setValues(savedDraft); setBaseline(savedDraft); setNotice('Draft saved.');
      return saved;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your counselling request could not be saved.');
      return null;
    } finally { setBusy(false); }
  };

  const submit = async () => {
    if (!readyToSubmit(values)) {
      setError('Complete the required request details before submitting.');
      setStep(values.support_type ? (values.urgency_self_description ? 3 : 1) : 0);
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      if (!request || dirty) {
        const saved = await saveCounsellingRequest(values);
        setRequest(saved); setValues(toDraft(saved)); setBaseline(toDraft(saved));
      }
      const submitted = await submitCounsellingRequest();
      const submittedDraft = toDraft(submitted);
      setRequest(submitted); setValues(submittedDraft); setBaseline(submittedDraft);
      setNotice('Your request has been submitted. A person may follow up using your selected contact method.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your counselling request could not be submitted.');
    } finally { setBusy(false); }
  };

  const withdraw = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const withdrawn = await withdrawCounsellingRequest();
      setRequest(withdrawn); setValues(toDraft(withdrawn)); setBaseline(toDraft(withdrawn));
      setNotice('Your request has been withdrawn.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your request could not be withdrawn.'); }
    finally { setBusy(false); }
  };

  const startJourney = async () => {
    setBusy(true); setError('');
    try {
      upsertJourney(await activateJourney('counselling', !journeys.some((item) => item.is_primary)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not activate your Counselling journey.'); }
    finally { setBusy(false); }
  };

  const startNewRequest = async () => {
    const saved = await saveDraft(emptyDraft);
    if (saved) { setStep(0); setDangerGuidanceDismissed(false); }
  };

  const updateJourney = async (status: 'active' | 'paused') => {
    setBusy(true); setError('');
    try {
      const updated = status === 'paused'
        ? await setJourneyStatus('counselling', 'paused')
        : await activateJourney('counselling', !journeys.some((item) => item.is_primary));
      upsertJourney(updated);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update your Counselling journey.'); }
    finally { setBusy(false); }
  };

  const canWithdraw = request && ['submitted', 'under_review', 'contacted'].includes(request.status);
  const journeyInactive = !journey || ['withdrawn'].includes(journey.status);
  const requestTerminal = request && ['closed', 'withdrawn'].includes(request.status);

  if (!isAuthenticated) return <section className="mx-auto my-12 max-w-4xl rounded-2xl border border-[#e8e1d8] bg-white p-6 sm:p-8">
    <h2 className="text-2xl font-bold text-[#1e3a5f]">Start a private counselling request</h2>
    <p className="mt-2 text-gray-600">Sign in to save a request and view its status.</p>
    <Button className="mt-4" onClick={() => setShowAuthModal(true)}>Sign in</Button>
  </section>;

  if (!eligible && !isPaused) return <section className="mx-auto my-12 max-w-4xl rounded-2xl border border-[#e8e1d8] bg-white p-6 sm:p-8">
    <h2 className="text-2xl font-bold text-[#1e3a5f]">Complete your account setup first</h2>
    <p className="mt-2 text-gray-600">Finish account setup before starting or updating a Counselling request.</p>
    <a href="/onboarding" className="mt-4 inline-block font-medium text-[#1e3a5f] underline">Continue account setup</a>
  </section>;

  if (journeyInactive || journey?.status === 'completed') return <section className="mx-auto my-12 max-w-4xl rounded-2xl border border-[#e8e1d8] bg-white p-6 sm:p-8">
    <h2 className="text-2xl font-bold text-[#1e3a5f]">{journey?.status === 'completed' ? 'Counselling journey completed' : 'Start your Counselling journey'}</h2>
    <p className="mt-2 text-gray-600">{journey?.status === 'completed' ? 'Contact support if you need help reopening this journey.' : 'Activate this journey to save or submit a request. You can pause it later and still read your saved request.'}</p>
    {journey?.status !== 'completed' && <Button className="mt-4" isLoading={busy} onClick={() => void startJourney()}>{journey?.status === 'withdrawn' ? 'Restart Counselling journey' : 'Start Counselling journey'}</Button>}
    {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
  </section>;

  return <section className="mx-auto my-12 max-w-4xl rounded-2xl border border-[#e8e1d8] bg-white p-6 shadow-sm sm:p-8" aria-labelledby="counselling-gateway-title">
    <header>
      <p className="text-sm font-semibold uppercase tracking-wide text-[#c4785a]">Counselling Gateway</p>
      <h2 id="counselling-gateway-title" className="mt-1 text-2xl font-bold text-[#1e3a5f]">Request a human follow-up</h2>
      <p className="mt-3 text-gray-600">Uncle Bashi helps connect you with human counselling support. This form is not a diagnosis or emergency service.</p>
      <p className="mt-2 text-sm text-gray-600">Your answers are visible to authorized staff who help route your counselling request. This page is not monitored in real time.</p>
    </header>

    {isPaused && <div className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900" role="status">
      <p>Your Counselling journey is paused. Your saved request remains available to read; resume to edit or submit.</p>
      <Button className="mt-3" size="sm" isLoading={busy} onClick={() => void updateJourney('active')}>Resume journey</Button>
    </div>}

    {loading ? <p className="py-8 text-gray-500" role="status">Loading your request…</p> : request && request.status !== 'draft' ? <div className="mt-6 rounded-xl border border-gray-200 p-5">
      <p className="font-semibold text-[#1e3a5f]">Request status: {statusLabel[request.status] ?? request.status}</p>
      <p className="mt-1 text-sm text-gray-600">{request.submitted_at ? `Submitted ${new Date(request.submitted_at).toLocaleString()}.` : 'This request has not been submitted.'}</p>
      {request.brief_reason && <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700">{request.brief_reason}</p>}
      {request.urgency_self_description === 'immediate_danger' && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-900" role="alert">This request is not monitored in real time. Contact local emergency services or go to the nearest emergency department. If you can, contact a trusted person nearby.</p>}
      {canWithdraw && <div className="mt-4"><p className="mb-2 text-sm text-gray-600">Withdrawing stops further follow-up on this request.</p><Button variant="outline" disabled={busy} isLoading={busy} onClick={() => void withdraw()}>Withdraw request</Button></div>}
      {requestTerminal && !isPaused && <Button className="mt-4" disabled={busy} isLoading={busy} onClick={() => void startNewRequest()}>Start a new request</Button>}
    </div> : !loading && <>
      <div className="mt-6 flex flex-wrap gap-2" aria-label="Request steps">
        {['Support type', 'Urgency', 'What is happening', 'Contact', 'Review'].map((label, index) => <span key={label} className={`rounded-full px-3 py-1 text-xs ${step === index ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600'}`}>{index + 1}. {label}</span>)}
      </div>
      {step === 0 && <fieldset disabled={busy || isPaused} className="mt-6">
        <legend className="text-lg font-semibold text-[#1e3a5f]">What kind of help are you looking for?</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{supportOptions.map(([value, label]) => <label key={value} className="flex items-center gap-3 rounded-lg border p-3"><input type="radio" name="support-type" checked={values.support_type === value} onChange={() => update('support_type', value)} /><span>{label}</span></label>)}</div>
        <fieldset className="mt-4"><legend className="text-sm font-medium text-gray-700">Would a partner or family member take part? (optional)</legend><div className="mt-2 flex flex-wrap gap-3">{([['yes', 'Yes'], ['no', 'No'], ['not_applicable', 'Not applicable'], ['not_sure', 'Not sure']] as Array<[CounsellingPartnerParticipation, string]>).map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm"><input type="radio" name="partner-participation" checked={values.partner_participation === value} onChange={() => update('partner_participation', value)} />{label}</label>)}</div></fieldset>
      </fieldset>}
      {step === 1 && <fieldset disabled={busy || isPaused} className="mt-6">
        <legend className="text-lg font-semibold text-[#1e3a5f]">How soon would you like human support?</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{([['routine', 'At a routine pace'], ['soon', 'Soon'], ['urgent', 'Urgent'], ['immediate_danger', 'I am in immediate danger']] as Array<[CounsellingUrgency, string]>).map(([value, label]) => <label key={value} className={`flex items-center gap-3 rounded-lg border p-3 ${value === 'immediate_danger' ? 'border-red-300' : ''}`}><input type="radio" name="urgency" checked={values.urgency_self_description === value} onChange={() => update('urgency_self_description', value)} /><span>{label}</span></label>)}</div>
      </fieldset>}
      {isImmediateDanger && !dangerGuidanceDismissed && <div className="mt-5 rounded-xl border-2 border-red-500 bg-red-50 p-5 text-red-950" role="alert" aria-live="assertive">
        <h3 className="text-lg font-bold">Please seek immediate help now</h3>
        <p className="mt-2">Uncle Bashi is not an emergency service and this request is not monitored in real time. Contact your local emergency services or go to the nearest emergency department. If you can, contact a trusted person nearby now. Do not wait for a response here.</p>
        <Button className="mt-4" variant="outline" onClick={() => setDangerGuidanceDismissed(true)}>I am safe to continue with this form</Button>
      </div>}
      {step === 2 && <div className="mt-6">
        <label className="block text-lg font-semibold text-[#1e3a5f]">Tell us briefly what is happening <span className="text-sm font-normal text-gray-500">(optional for immediate danger)</span>
          <textarea maxLength={1500} rows={5} value={values.brief_reason ?? ''} disabled={busy || isPaused} onChange={(event) => update('brief_reason', event.target.value || null)} className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-base font-normal" placeholder="Share only a brief description that will help route your request. Please do not include detailed plans, methods, or sensitive medical information." />
        </label><p className="mt-1 text-xs text-gray-500">{(values.brief_reason ?? '').length}/1500 characters</p>
      </div>}
      {step === 3 && <div className="mt-6 space-y-4">
        <label className="block font-semibold text-[#1e3a5f]">How should someone contact you?
          <select value={values.preferred_contact_method ?? ''} disabled={busy || isPaused} onChange={(event) => update('preferred_contact_method', (event.target.value || null) as CounsellingContactMethod | null)} className="mt-2 w-full rounded-lg border border-gray-300 p-3 font-normal"><option value="">Choose a contact method</option><option value="email">Email on my account</option><option value="phone">Phone</option><option value="either">Email or phone</option></select>
        </label>
        {(values.preferred_contact_method === 'phone' || values.preferred_contact_method === 'either') && <label className="block font-semibold text-[#1e3a5f]">Phone number for follow-up
          <input type="tel" autoComplete="tel" maxLength={32} value={values.contact_phone ?? ''} disabled={busy || isPaused} onChange={(event) => update('contact_phone', event.target.value || null)} className="mt-2 w-full rounded-lg border border-gray-300 p-3 font-normal" placeholder="Include country code, for example +256…" />
        </label>}
        <label className="block font-semibold text-[#1e3a5f]">Country code <span className="text-sm font-normal text-gray-500">(two letters, for example UG, KE, RW or CA)</span>
          <input maxLength={2} autoCapitalize="characters" value={values.country_code ?? ''} disabled={busy || isPaused} onChange={(event) => update('country_code', event.target.value.toUpperCase() || null)} className="mt-2 w-full rounded-lg border border-gray-300 p-3 font-normal" placeholder="UG" />
        </label>
        <label className="block font-semibold text-[#1e3a5f]">Times that usually work (optional)
          <textarea maxLength={800} rows={3} value={values.preferred_time_notes ?? ''} disabled={busy || isPaused} onChange={(event) => update('preferred_time_notes', event.target.value || null)} className="mt-2 w-full rounded-lg border border-gray-300 p-3 font-normal" placeholder="Days or times, if helpful." />
        </label><p className="text-xs text-gray-500">{(values.preferred_time_notes ?? '').length}/800 characters</p>
        <label className="flex items-start gap-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-700"><input type="checkbox" checked={values.consent_to_contact} disabled={busy || isPaused} onChange={(event) => update('consent_to_contact', event.target.checked)} className="mt-1" /><span>I agree that Uncle Bashi may use the contact method I selected to follow up about this request.</span></label>
      </div>}
      {step === 4 && <div className="mt-6 rounded-xl bg-[#faf6f1] p-5">
        <h3 className="font-semibold text-[#1e3a5f]">Review your request</h3>
        <dl className="mt-3 space-y-2 text-sm"><div><dt className="font-medium">Support type</dt><dd>{supportOptions.find(([value]) => value === values.support_type)?.[1] ?? 'Not selected'}</dd></div><div><dt className="font-medium">Urgency you selected</dt><dd>{values.urgency_self_description?.replace(/_/g, ' ') ?? 'Not selected'}</dd></div><div><dt className="font-medium">Contact method</dt><dd>{values.preferred_contact_method ?? 'Not selected'}</dd></div>{values.brief_reason && <div><dt className="font-medium">Brief description</dt><dd className="whitespace-pre-wrap">{values.brief_reason}</dd></div>}</dl>
        <p className="mt-4 text-sm text-gray-700">A human may follow up, but there is no real-time monitoring or guaranteed response time.</p>
        {isImmediateDanger && <p className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900">Submitting this request does not replace contacting local emergency services or visiting an emergency department.</p>}
      </div>}
      <div className="mt-6 flex flex-wrap justify-between gap-3">
        <div className="flex gap-2">{step > 0 && <Button variant="outline" disabled={busy} onClick={() => setStep((current) => Math.max(0, current - 1))}>Back</Button>}{step < 4 && <Button disabled={busy || (step === 0 && !values.support_type) || (step === 1 && (!values.urgency_self_description || (isImmediateDanger && !dangerGuidanceDismissed)))} onClick={() => setStep((current) => current === 1 && isImmediateDanger ? 3 : Math.min(4, current + 1))}>Continue</Button>}</div>
        <div className="flex gap-2"><Button variant="outline" disabled={busy || isPaused || (!dirty && request?.status === 'draft')} isLoading={busy && step !== 4} onClick={() => void saveDraft()}>Save draft</Button>{step === 4 && <Button disabled={busy || isPaused || !readyToSubmit(values)} isLoading={busy} onClick={() => void submit()}>Submit request</Button>}</div>
      </div>
    </>}
    {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
    {notice && <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800" role="status">{notice}</p>}
    {!loading && request && <p className="mt-4 text-xs text-gray-500">Request status: {statusLabel[request.status] ?? request.status}{request.updated_at ? ` · Last updated ${new Date(request.updated_at).toLocaleString()}` : ''}</p>}
    {journey?.status === 'active' && <div className="mt-5 border-t pt-4 text-right"><Button variant="ghost" size="sm" disabled={busy} onClick={() => void updateJourney('paused')}>Pause Counselling journey</Button></div>}
  </section>;
};
