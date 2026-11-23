import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { completeCoachingIntake, getMyCoachingProfile, saveCoachingProfile } from '@/lib/supportCoachingService';
import type { CoachingDraft, CoachingFocusArea, CoachingProfile, CoachGenderPreference, CoachingFormat, CoachingFrequency } from '@/types/supportCoaching';

const focusAreas: Array<[CoachingFocusArea, string]> = [
  ['communication_skills', 'Communication skills'], ['marriage_preparation', 'Marriage preparation'], ['relationship_skills', 'Relationship skills'],
  ['confidence_and_boundaries', 'Confidence and boundaries'], ['family_roles', 'Family roles'], ['personal_growth', 'Personal growth'],
  ['accountability', 'Accountability'], ['conflict_skills', 'Constructive conflict skills'], ['relationship_decision_making', 'Relationship decision-making'], ['other', 'Other'],
];
const blank: CoachingDraft = { focus_areas: [], primary_goal: null, desired_outcome: null, preferred_format: null, session_frequency: null, coach_gender_preference: null, availability_notes: null };
const toDraft = (profile: CoachingProfile | null): CoachingDraft => profile ? ({
  focus_areas: profile.focus_areas ?? [], primary_goal: profile.primary_goal, desired_outcome: profile.desired_outcome,
  preferred_format: profile.preferred_format, session_frequency: profile.session_frequency,
  coach_gender_preference: profile.coach_gender_preference, availability_notes: profile.availability_notes,
}) : blank;
const isComplete = (value: CoachingDraft) => value.focus_areas.length > 0 && Boolean(value.primary_goal?.trim())
  && Boolean(value.desired_outcome?.trim()) && Boolean(value.preferred_format) && Boolean(value.session_frequency);

export const CoachingIntakePanel: React.FC<{ readOnly?: boolean }> = ({ readOnly = false }) => {
  const journey = useAppStore(state => state.journeys.find(item => item.journey_type === 'coaching'));
  const locked = readOnly || journey?.status === 'paused';
  const [profile, setProfile] = useState<CoachingProfile | null>(null);
  const [values, setValues] = useState<CoachingDraft>(blank);
  const [baseline, setBaseline] = useState<CoachingDraft>(blank);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(baseline), [values, baseline]);
  const load = useCallback(async () => {
    setError('');
    try {
      const current = await getMyCoachingProfile();
      const draft = toDraft(current);
      setProfile(current); setValues(draft); setBaseline(draft);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your private coaching intake could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const update = <K extends keyof CoachingDraft>(key: K, value: CoachingDraft[K]) => {
    setValues(current => ({ ...current, [key]: value })); setNotice('');
  };
  const save = async (): Promise<CoachingProfile | null> => {
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await saveCoachingProfile(values);
      const draft = toDraft(saved);
      setProfile(saved); setValues(draft); setBaseline(draft); setNotice('Coaching draft saved.');
      return saved;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your private coaching intake could not be saved.'); return null; }
    finally { setBusy(false); }
  };
  const complete = async () => {
    if (!isComplete(values)) { setError('Choose at least one focus area and complete the required responses.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      let saved = profile;
      if (dirty || !saved) {
        saved = await saveCoachingProfile(values);
        const draft = toDraft(saved); setProfile(saved); setValues(draft); setBaseline(draft);
      }
      const completed = await completeCoachingIntake();
      const draft = toDraft(completed); setProfile(completed); setValues(draft); setBaseline(draft); setNotice('Coaching intake complete.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your coaching intake could not be completed.'); }
    finally { setBusy(false); }
  };
  const toggle = (area: CoachingFocusArea) => update('focus_areas', values.focus_areas.includes(area)
    ? values.focus_areas.filter(value => value !== area) : [...values.focus_areas, area]);

  return <section className="mb-8 rounded-2xl border border-[#e8e1d8] bg-white p-6 shadow-sm" aria-labelledby="coaching-intake-heading">
    <p className="text-sm font-semibold uppercase tracking-wide text-[#c4785a]">Coaching Intake</p>
    <h2 id="coaching-intake-heading" className="mt-1 text-2xl font-bold text-[#1e3a5f]">Set a goal for your coaching</h2>
    <p className="mt-2 text-sm text-gray-600">Coaching supports goals, relationship skills and accountability. It is educational and goal-oriented, not psychotherapy. Your answers are private and used to prepare your coaching experience.</p>
    <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">If you need clinical or crisis help, or there is immediate danger, use local emergency resources or visit <a href="/counselling" className="font-medium underline">Counselling information</a>. This intake does not assess crises.</p>
    {loading ? <p className="py-5 text-sm text-gray-500" role="status">Loading your private intake…</p> : <div className="mt-5 space-y-5">
      {locked && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">Your Coaching journey is paused. You can read this saved intake; resume the journey to edit or complete it.</p>}
      <fieldset disabled={locked || busy}><legend className="font-semibold text-[#1e3a5f]">Which areas should we focus on?</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{focusAreas.map(([value, label]) => <label key={value} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3"><input type="checkbox" checked={values.focus_areas.includes(value)} onChange={() => toggle(value)} /><span>{label}</span></label>)}</div></fieldset>
      <label className="block"><span className="font-semibold text-[#1e3a5f]">What would you like coaching to help you achieve?</span><textarea maxLength={1200} rows={4} value={values.primary_goal ?? ''} disabled={locked || busy} onChange={event => update('primary_goal', event.target.value || null)} className="mt-2 w-full rounded-lg border border-gray-300 p-3" /><span className="text-xs text-gray-500">{(values.primary_goal ?? '').length}/1200</span></label>
      <label className="block"><span className="font-semibold text-[#1e3a5f]">What would success look like?</span><textarea maxLength={1500} rows={4} value={values.desired_outcome ?? ''} disabled={locked || busy} onChange={event => update('desired_outcome', event.target.value || null)} className="mt-2 w-full rounded-lg border border-gray-300 p-3" /><span className="text-xs text-gray-500">{(values.desired_outcome ?? '').length}/1500</span></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="font-semibold text-[#1e3a5f]">Preferred coaching format</span><select value={values.preferred_format ?? ''} disabled={locked || busy} onChange={event => update('preferred_format', (event.target.value || null) as CoachingFormat | null)} className="mt-2 w-full rounded-lg border border-gray-300 p-3"><option value="">Choose a format</option><option value="individual">Individual</option><option value="couple">As a couple</option><option value="group">Group</option><option value="not_sure">Not sure</option></select></label>
        <label className="block"><span className="font-semibold text-[#1e3a5f]">Preferred frequency</span><select value={values.session_frequency ?? ''} disabled={locked || busy} onChange={event => update('session_frequency', (event.target.value || null) as CoachingFrequency | null)} className="mt-2 w-full rounded-lg border border-gray-300 p-3"><option value="">Choose frequency</option><option value="one_off">One time</option><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="flexible">Flexible</option></select></label></div>
      <fieldset disabled={locked || busy}><legend className="font-semibold text-[#1e3a5f]">Coach gender preference (optional)</legend><div className="mt-2 flex flex-wrap gap-2">{([['male', 'Man'], ['female', 'Woman'], ['no_preference', 'No preference']] as Array<[CoachGenderPreference, string]>).map(([value, label]) => <label key={value} className={`rounded-full border px-4 py-2 text-sm ${values.coach_gender_preference === value ? 'border-[#1e3a5f] bg-blue-50' : 'border-gray-300'}`}><input className="sr-only" type="radio" name="coach-gender-preference" checked={values.coach_gender_preference === value} onChange={() => update('coach_gender_preference', value)} />{label}</label>)}</div></fieldset>
      <label className="block"><span className="font-semibold text-[#1e3a5f]">Availability notes (optional)</span><textarea maxLength={800} rows={3} value={values.availability_notes ?? ''} disabled={locked || busy} onChange={event => update('availability_notes', event.target.value || null)} className="mt-2 w-full rounded-lg border border-gray-300 p-3" /><span className="text-xs text-gray-500">{(values.availability_notes ?? '').length}/800</span></label>
    </div>}
    {profile && <p className="mt-4 text-sm text-gray-600" role="status">{profile.intake_completed_at ? 'Intake complete' : 'Draft'}{profile.updated_at ? ` · Last saved ${new Date(profile.updated_at).toLocaleString()}` : ''}</p>}
    {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
    {notice && <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800" role="status">{notice}</p>}
    {!loading && !locked && <div className="mt-5 flex justify-end gap-3"><Button variant="outline" disabled={busy || !dirty} isLoading={busy} onClick={() => void save()}>Save draft</Button><Button disabled={busy || !isComplete(values)} isLoading={busy} onClick={() => void complete()}>Complete intake</Button></div>}
  </section>;
};
