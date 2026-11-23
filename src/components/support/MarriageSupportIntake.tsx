import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { completeMarriageSupportIntake, getMyMarriageSupportProfile, saveMarriageSupportProfile } from '@/lib/supportCoachingService';
import type { IntakeTiming, MarriageSupportArea, MarriageSupportDraft, MarriageSupportPath, MarriageSupportProfile, PartnerParticipation } from '@/types/supportCoaching';

const areas: Array<[MarriageSupportArea, string]> = [
  ['communication', 'Communication'], ['emotional_connection', 'Emotional connection'], ['conflict_patterns', 'Conflict patterns'],
  ['trust_after_hurt', 'Rebuilding trust'], ['intimacy_and_affection', 'Intimacy and affection'], ['parenting_teamwork', 'Parenting as a team'],
  ['finances_and_roles', 'Finances and roles'], ['in_law_boundaries', 'In-law boundaries'], ['faith_and_values', 'Faith and values'],
  ['household_partnership', 'Sharing household responsibilities'], ['other', 'Other'],
];
const paths: Array<[MarriageSupportPath, string]> = [
  ['self_guided', 'Self-guided resources'], ['couple_support', 'Support together as a couple'], ['individual_guidance', 'Individual guidance'],
  ['coaching', 'Coaching'], ['counselling', 'Counselling information'], ['not_sure', 'Not sure yet'],
];
const blank: MarriageSupportDraft = {
  support_areas: [], primary_concern: null, desired_outcomes: null, partner_participation: null,
  preferred_support_path: null, timing_preference: null,
};
const toDraft = (profile: MarriageSupportProfile | null): MarriageSupportDraft => profile ? ({
  support_areas: profile.support_areas ?? [], primary_concern: profile.primary_concern,
  desired_outcomes: profile.desired_outcomes, partner_participation: profile.partner_participation,
  preferred_support_path: profile.preferred_support_path, timing_preference: profile.timing_preference,
}) : blank;
const isComplete = (value: MarriageSupportDraft) => value.support_areas.length > 0
  && Boolean(value.primary_concern?.trim()) && Boolean(value.desired_outcomes?.trim())
  && Boolean(value.partner_participation) && Boolean(value.preferred_support_path) && Boolean(value.timing_preference);

export const MarriageSupportIntake: React.FC<{ readOnly?: boolean }> = ({ readOnly = false }) => {
  const journey = useAppStore(state => state.journeys.find(item => item.journey_type === 'marriage_support'));
  const locked = readOnly || journey?.status === 'paused';
  const [values, setValues] = useState<MarriageSupportDraft>(blank);
  const [baseline, setBaseline] = useState<MarriageSupportDraft>(blank);
  const [profile, setProfile] = useState<MarriageSupportProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(baseline), [values, baseline]);

  const load = useCallback(async () => {
    setError('');
    try {
      const current = await getMyMarriageSupportProfile();
      const draft = toDraft(current);
      setProfile(current); setValues(draft); setBaseline(draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your private intake could not be loaded.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const update = <K extends keyof MarriageSupportDraft>(key: K, value: MarriageSupportDraft[K]) => {
    setValues(current => ({ ...current, [key]: value }));
    setNotice('');
  };
  const save = async (): Promise<MarriageSupportProfile | null> => {
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await saveMarriageSupportProfile(values);
      const draft = toDraft(saved);
      setProfile(saved); setValues(draft); setBaseline(draft); setNotice('Draft saved.');
      return saved;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your private intake could not be saved.');
      return null;
    } finally { setBusy(false); }
  };
  const complete = async () => {
    if (!isComplete(values)) { setError('Complete each required response before continuing.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      let saved = profile;
      if (dirty || !saved) {
        saved = await saveMarriageSupportProfile(values);
        const draft = toDraft(saved);
        setProfile(saved); setValues(draft); setBaseline(draft);
      }
      const completed = await completeMarriageSupportIntake();
      const draft = toDraft(completed);
      setProfile(completed); setValues(draft); setBaseline(draft); setNotice('Marriage Support intake complete.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your intake could not be completed.');
    } finally { setBusy(false); }
  };

  const toggleArea = (area: MarriageSupportArea) => update('support_areas', values.support_areas.includes(area)
    ? values.support_areas.filter(item => item !== area) : [...values.support_areas, area]);

  return <main className="mx-auto my-8 max-w-4xl px-4">
    <section className="rounded-2xl border border-[#e8e1d8] bg-white p-6 shadow-sm sm:p-8">
      <header><p className="text-sm font-semibold uppercase tracking-wide text-[#c4785a]">Marriage Support</p><h1 className="mt-1 text-3xl font-bold text-[#1e3a5f]">Strengthen your marriage</h1><p className="mt-3 text-gray-600">This private intake helps us understand what you would like to strengthen and what support may be useful.</p></header>
      <div className="mt-5 space-y-3 rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
        <p>Your answers are private and used to prepare your support experience. Marriage Support is educational and non-clinical; it is not psychotherapy.</p>
        <p>Immediate danger or crisis needs should use local emergency resources or Counselling, not this Marriage Support intake. <a className="font-medium underline" href="/counselling">View Counselling information</a>.</p>
      </div>
      {locked && <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">Your Marriage Support journey is paused. Your saved intake remains available to read; resume the journey to edit or complete it.</p>}
      {loading ? <p className="py-8 text-gray-500" role="status">Loading your private intake…</p> : <div className="mt-7 space-y-7">
        <fieldset disabled={locked || busy} className="space-y-3"><legend className="text-lg font-semibold text-[#1e3a5f]">What would you like to strengthen?</legend><p className="text-sm text-gray-600">Choose one or more areas.</p><div className="grid gap-2 sm:grid-cols-2">{areas.map(([value, label]) => <label key={value} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3"><input type="checkbox" checked={values.support_areas.includes(value)} onChange={() => toggleArea(value)} /><span>{label}</span></label>)}</div></fieldset>
        <label className="block"><span className="font-semibold text-[#1e3a5f]">What is happening now?</span><span className="mt-1 block text-sm text-gray-600">Share only what you are comfortable sharing. Please avoid sensitive health information or detailed allegations.</span><textarea maxLength={1500} rows={5} value={values.primary_concern ?? ''} disabled={locked || busy} onChange={event => update('primary_concern', event.target.value || null)} className="mt-2 w-full rounded-lg border border-gray-300 p-3" placeholder="What would you like support with?" /><span className="text-xs text-gray-500">{(values.primary_concern ?? '').length}/1500</span></label>
        <label className="block"><span className="font-semibold text-[#1e3a5f]">What would a better marriage look like?</span><textarea maxLength={1500} rows={4} value={values.desired_outcomes ?? ''} disabled={locked || busy} onChange={event => update('desired_outcomes', event.target.value || null)} className="mt-2 w-full rounded-lg border border-gray-300 p-3" placeholder="What would you hope to experience or do differently?" /><span className="text-xs text-gray-500">{(values.desired_outcomes ?? '').length}/1500</span></label>
        <fieldset disabled={locked || busy}><legend className="font-semibold text-[#1e3a5f]">Would your spouse participate?</legend><div className="mt-2 flex flex-wrap gap-2">{([['yes', 'Yes'], ['maybe', 'Maybe'], ['not_now', 'Not now'], ['unknown', 'Not sure']] as Array<[PartnerParticipation, string]>).map(([value, label]) => <label key={value} className={`rounded-full border px-4 py-2 text-sm ${values.partner_participation === value ? 'border-[#1e3a5f] bg-blue-50' : 'border-gray-300'}`}><input className="sr-only" type="radio" name="partner-participation" checked={values.partner_participation === value} onChange={() => update('partner_participation', value)} />{label}</label>)}</div></fieldset>
        <label className="block"><span className="font-semibold text-[#1e3a5f]">What kind of support may help?</span><select value={values.preferred_support_path ?? ''} disabled={locked || busy} onChange={event => update('preferred_support_path', (event.target.value || null) as MarriageSupportPath | null)} className="mt-2 w-full rounded-lg border border-gray-300 p-3"><option value="">Choose an option</option>{paths.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="block"><span className="font-semibold text-[#1e3a5f]">When would you like to begin?</span><select value={values.timing_preference ?? ''} disabled={locked || busy} onChange={event => update('timing_preference', (event.target.value || null) as IntakeTiming | null)} className="mt-2 w-full rounded-lg border border-gray-300 p-3"><option value="">Choose a timeframe</option><option value="now">As soon as possible</option><option value="next_few_weeks">In the next few weeks</option><option value="exploring">I am exploring options</option></select></label>
      </div>}
      {profile && <p className="mt-5 text-sm text-gray-600" role="status">{profile.intake_completed_at ? 'Intake complete' : 'Draft'}{profile.updated_at ? ` · Last saved ${new Date(profile.updated_at).toLocaleString()}` : ''}</p>}
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      {notice && <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800" role="status">{notice}</p>}
      {!loading && <div className="mt-6 flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={locked || busy || !dirty} isLoading={busy} onClick={() => void save()}>Save draft</Button><Button disabled={locked || busy || !isComplete(values)} isLoading={busy} onClick={() => void complete()}>Complete intake</Button></div>}
    </section>
  </main>;
};
