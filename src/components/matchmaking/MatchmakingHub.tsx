import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import {
  blockMatchmakingProfile, getMatchmakingDiscovery, getMatchmakingProfile, getMyMatchmakingInterests,
  getMyMatchmakingSetup, reportMatchmakingProfile, respondMatchmakingInterest, saveMatchmakingPreferences,
  saveMatchmakingProfile, sendMatchmakingInterest, submitMatchmakingProfile, withdrawMatchmakingInterest,
} from '@/lib/matchmakingService';
import { MATCHMAKING_COUNTRIES } from '@/types/matchmaking';
import type {
  MatchmakingDetailProfile, MatchmakingDiscoveryProfile, MatchmakingInterest,
  MatchmakingPreferences, MatchmakingProfile, MatchmakingSetup,
} from '@/types/matchmaking';
import { ChoicePreference, CountryMultiSelect, PreferenceMode, TokenInput } from './ProfileInputs';

type Tab = 'profile' | 'discover' | 'interests';
type DraftState = { profile: Partial<MatchmakingProfile>; preferences: Partial<MatchmakingPreferences> };
type Choice = { label: string; value: string };

const emptyProfile: Partial<MatchmakingProfile> = {
  profile_version: 1, height_cm: null, physical_self_description: null, occupation: null,
  education_level: null, field_of_study: null, employment_status: null, financial_readiness: null,
  religion_or_faith: null, faith_practice_level: null, faith_importance: null,
  denomination_or_tradition: null, faith_expectations: null, show_religion: false,
  use_religion_for_matching: false, cultural_or_ethnic_community: null, show_cultural_community: false,
  use_cultural_community_for_matching: false, clan_or_region: null, show_clan_or_region: false,
  family_background: null, family_involvement: null, has_children: null, number_of_children: null,
  children_live_with_me: null, wants_children: null, smoking: null, drinking: null,
  marriage_timeline: null, marriage_structure: null, willing_to_relocate: null,
  long_distance_openness: null, provider_model: null, family_in_law_expectations: null,
  introduction: null, marriage_vision_response: null, use_profile_image_for_matchmaking: false,
};
const emptyPreferences: Partial<MatchmakingPreferences> = {
  preferences_version: 1, preferred_partner_gender: undefined, age_min: null, age_max: null,
  preferred_residences: [], residence_mode: 'open', preferred_religions: [], religion_mode: 'open',
  preferred_marital_statuses: [], marital_status_mode: 'open', preferred_children_statuses: [],
  children_mode: 'open', preferred_wants_children: [], wants_children_mode: 'open',
  preferred_relocation: [], relocation_mode: 'open',
};
const yesNoMaybe: Choice[] = [{ label: 'Yes', value: 'yes' }, { label: 'Maybe', value: 'maybe' }, { label: 'No', value: 'no' }];
const futureChildren: Choice[] = [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }, { label: 'Open to discussion', value: 'open_to_discussion' }];
const maritalStatuses: Choice[] = [
  { label: 'Never married', value: 'never_married' }, { label: 'Divorced', value: 'divorced' },
  { label: 'Widowed', value: 'widowed' }, { label: 'Annulled', value: 'annulled' },
];
const textValue = (value: unknown) => value == null ? '' : String(value);
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const countryLabel = (value: string | null | undefined) => MATCHMAKING_COUNTRIES.find(country => country.code === value)?.country ?? value ?? '';
const humanize = (value: string | null | undefined) => value ? value.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase()) : 'Not set';
const modeOptions = [{ label: 'No preference', value: 'open' }, { label: 'Required', value: 'required' }, { label: 'Preferred', value: 'preferred' }];

export const MatchmakingHub: React.FC = () => {
  const navigate = useNavigate();
  const user = useAppStore(state => state.user);
  const [tab, setTab] = useState<Tab>('profile');
  const [setup, setSetup] = useState<MatchmakingSetup | null>(null);
  const [profile, setProfile] = useState<Partial<MatchmakingProfile>>(emptyProfile);
  const [preferences, setPreferences] = useState<Partial<MatchmakingPreferences>>(emptyPreferences);
  const [baseline, setBaseline] = useState<DraftState | null>(null);
  const [discovery, setDiscovery] = useState<MatchmakingDiscoveryProfile[]>([]);
  const [hasMoreDiscovery, setHasMoreDiscovery] = useState(false);
  const [interests, setInterests] = useState<MatchmakingInterest[]>([]);
  const [selected, setSelected] = useState<MatchmakingDetailProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const isDirty = Boolean(baseline) && (JSON.stringify(profile) !== JSON.stringify(baseline?.profile) || JSON.stringify(preferences) !== JSON.stringify(baseline?.preferences));

  const loadSetup = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getMyMatchmakingSetup();
      const nextProfile = { ...emptyProfile, ...(result.profile ?? {}) };
      const derivedGender: 'male' | 'female' | undefined = result.account?.gender === 'female' ? 'male' : result.account?.gender === 'male' ? 'female' : undefined;
      const nextPreferences = { ...emptyPreferences, ...(result.preferences ?? {}), preferred_partner_gender: derivedGender };
      setSetup(result);
      setProfile(nextProfile);
      setPreferences(nextPreferences);
      setBaseline({ profile: nextProfile, preferences: nextPreferences });
    } catch (cause) {
      setError(errorMessage(cause, 'Could not load your matchmaking profile.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDiscovery = useCallback(async () => {
    if (setup?.account?.gender !== 'female' && setup?.account?.gender !== 'male') {
      setDiscovery([]);
      setError('Your base profile needs a valid gender before you can use matchmaking.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const rows = await getMatchmakingDiscovery();
      setDiscovery(rows);
      setHasMoreDiscovery(rows.length === 20);
    } catch (cause) {
      setError(errorMessage(cause, 'Discovery is unavailable until your profile is eligible and approved.'));
    } finally {
      setLoading(false);
    }
  }, [setup?.account?.gender]);

  const loadInterests = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setInterests(await getMyMatchmakingInterests()); }
    catch (cause) { setError(errorMessage(cause, 'Could not load introductions.')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadSetup(); }, [loadSetup]);
  useEffect(() => {
    if (tab === 'discover') void loadDiscovery();
    if (tab === 'interests') void loadInterests();
  }, [tab, loadDiscovery, loadInterests]);

  const updateProfile = (key: keyof MatchmakingProfile, value: unknown) => {
    setProfile(current => ({ ...current, [key]: value }));
    setFieldErrors(current => { const next = { ...current }; delete next[key]; return next; });
  };
  const updatePreference = (key: keyof MatchmakingPreferences, value: unknown) => {
    setPreferences(current => ({ ...current, [key]: value }));
    setFieldErrors(current => { const next = { ...current }; delete next[key]; return next; });
  };

  const getValidationErrors = useCallback((forSubmission: boolean) => {
    const next: Record<string, string> = {};
    const minAge = preferences.age_min;
    const maxAge = preferences.age_max;
    if (forSubmission) {
      const requiredText: Array<[keyof MatchmakingProfile, string | null | undefined]> = [
        ['education_level', profile.education_level], ['occupation', profile.occupation], ['employment_status', profile.employment_status],
        ['financial_readiness', profile.financial_readiness], ['religion_or_faith', profile.religion_or_faith],
        ['faith_practice_level', profile.faith_practice_level], ['faith_importance', profile.faith_importance],
        ['family_involvement', profile.family_involvement], ['marriage_timeline', profile.marriage_timeline],
        ['marriage_structure', profile.marriage_structure], ['willing_to_relocate', profile.willing_to_relocate],
        ['long_distance_openness', profile.long_distance_openness], ['provider_model', profile.provider_model],
        ['family_in_law_expectations', profile.family_in_law_expectations], ['introduction', profile.introduction],
        ['marriage_vision_response', profile.marriage_vision_response],
      ];
      for (const [key, value] of requiredText) if (!value?.trim()) next[key] = 'Required to submit your marriage profile.';
      if (profile.height_cm == null) next.height_cm = 'Height is required to submit your marriage profile.';
      if (profile.has_children == null) next.has_children = 'Choose whether you have children.';
      if (!['yes', 'no', 'open_to_discussion'].includes(profile.wants_children ?? '')) next.wants_children = 'Choose a future-children response.';
      if (!['never', 'occasionally', 'regularly', 'prefer_to_discuss'].includes(profile.smoking ?? '')) next.smoking = 'Choose a smoking response.';
      if (!['never', 'occasionally', 'regularly', 'prefer_to_discuss'].includes(profile.drinking ?? '')) next.drinking = 'Choose an alcohol response.';
      if (typeof profile.introduction === 'string' && profile.introduction.trim().length > 0 && (profile.introduction.trim().length < 150 || profile.introduction.trim().length > 600)) next.introduction = 'Use 150–600 characters.';
      if (typeof profile.marriage_vision_response === 'string' && profile.marriage_vision_response.trim().length > 0 && (profile.marriage_vision_response.trim().length < 80 || profile.marriage_vision_response.trim().length > 600)) next.marriage_vision_response = 'Use 80–600 characters.';
      if (!preferences.preferred_partner_gender) next.preferred_partner_gender = 'Your Core Profile needs a valid gender.';
      if (!setup?.account?.onboarding_completed) next.core_account = 'Complete onboarding before submitting.';
    }
    if (minAge == null && forSubmission) next.age_min = 'Enter the minimum preferred age.';
    if (maxAge == null && forSubmission) next.age_max = 'Enter the maximum preferred age.';
    if (minAge != null && (!Number.isSafeInteger(minAge) || minAge < 18 || minAge > 100)) next.age_min = 'Enter a whole-number age from 18 to 100.';
    if (maxAge != null && (!Number.isSafeInteger(maxAge) || maxAge < 18 || maxAge > 100)) next.age_max = 'Enter a whole-number age from 18 to 100.';
    if (minAge != null && maxAge != null && maxAge < minAge) next.age_max = 'Maximum age must be greater than or equal to minimum age.';
    if (profile.height_cm != null && (!Number.isSafeInteger(profile.height_cm) || profile.height_cm < 120 || profile.height_cm > 230)) next.height_cm = 'Enter a whole-number height from 120 to 230 cm.';
    if (profile.number_of_children != null && (!Number.isSafeInteger(profile.number_of_children) || profile.number_of_children < 0)) next.number_of_children = 'Enter a whole number of zero or more.';
    if (profile.introduction?.trim() && profile.introduction.trim().length > 600) next.introduction = 'Use 600 characters or fewer.';
    if (profile.marriage_vision_response?.trim() && profile.marriage_vision_response.trim().length > 600) next.marriage_vision_response = 'Use 600 characters or fewer.';
    const preferenceDimensions: Array<[string, string, string[], string]> = [
      ['residence_mode', preferences.residence_mode ?? 'open', preferences.preferred_residences ?? [], 'preferred_residences'],
      ['religion_mode', preferences.religion_mode ?? 'open', preferences.preferred_religions ?? [], 'preferred_religions'],
      ['marital_status_mode', preferences.marital_status_mode ?? 'open', preferences.preferred_marital_statuses ?? [], 'preferred_marital_statuses'],
      ['children_mode', preferences.children_mode ?? 'open', preferences.preferred_children_statuses ?? [], 'preferred_children_statuses'],
      ['wants_children_mode', preferences.wants_children_mode ?? 'open', preferences.preferred_wants_children ?? [], 'preferred_wants_children'],
      ['relocation_mode', preferences.relocation_mode ?? 'open', preferences.preferred_relocation ?? [], 'preferred_relocation'],
    ];
    if (forSubmission) for (const [modeKey, mode, selections, fieldKey] of preferenceDimensions) {
      if (!['required', 'preferred', 'open'].includes(mode)) next[modeKey] = 'Choose Required, Preferred, or Open.';
      else if (mode !== 'open' && selections.length === 0) next[fieldKey] = 'Choose at least one response for this preference.';
    }
    return next;
  }, [profile, preferences, setup?.account?.onboarding_completed]);

  const currentValidationErrors = getValidationErrors(true);
  const requiredFieldsRemaining = Object.keys(currentValidationErrors).length;
  const validateAndFocus = () => {
    const next = getValidationErrors(true);
    setFieldErrors(next);
    if (!Object.keys(next).length) return true;
    toast.error('Please complete the highlighted required fields.');
    const firstKey = Object.keys(next)[0];
    requestAnimationFrame(() => {
      const firstInvalid = document.querySelector<HTMLElement>(`[data-profile-field="${firstKey}"]`);
      firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstInvalid?.focus();
    });
    return false;
  };

  const persistDraft = async () => {
    const formatErrors = getValidationErrors(false);
    setFieldErrors(formatErrors);
    if (Object.keys(formatErrors).length) {
      toast.error('Please correct the highlighted answers.');
      return false;
    }
    const savedProfile = await saveMatchmakingProfile(profile);
    const savedPreferences = await saveMatchmakingPreferences(preferences);
    const nextProfile = { ...emptyProfile, ...savedProfile };
    const nextPreferences = { ...emptyPreferences, ...savedPreferences, preferred_partner_gender: setup?.account?.gender === 'female' ? 'male' : setup?.account?.gender === 'male' ? 'female' : undefined };
    setProfile(nextProfile);
    setPreferences(nextPreferences);
    setSetup(current => current ? { ...current, profile: savedProfile, preferences: savedPreferences } : current);
    setBaseline({ profile: nextProfile, preferences: nextPreferences });
    return true;
  };

  const saveDraft = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      if (await persistDraft()) { setNotice('Marriage profile saved.'); toast.success('Marriage profile saved.'); }
    } catch (cause) {
      const message = errorMessage(cause, 'Could not save your profile.');
      setError(message); toast.error('Profile not saved. Please check the highlighted fields.', { description: message });
    } finally { setBusy(false); }
  };

  const submit = async () => {
    if (setup?.account?.gender !== 'female' && setup?.account?.gender !== 'male') {
      const message = 'Your base profile needs correction: add a valid gender in Core Profile before using Matchmaking.';
      setError(message); toast.error(message); return;
    }
    if (!validateAndFocus()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await persistDraft();
      const submitted = await submitMatchmakingProfile();
      const nextProfile = { ...emptyProfile, ...submitted };
      setProfile(nextProfile);
      setSetup(current => current ? { ...current, profile: submitted } : current);
      setBaseline(current => current ? { ...current, profile: nextProfile } : current);
      toast.success('Marriage profile submitted for review.');
      navigate('/', { replace: true });
    } catch (cause) {
      const message = errorMessage(cause, 'Could not submit profile.');
      setError(message); toast.error('Profile not submitted.', { description: message });
    } finally { setBusy(false); }
  };

  const field = (label: string, key: keyof MatchmakingProfile, required = false, type = 'text', maxLength?: number) => {
    const value = textValue(profile[key]);
    const errorText = fieldErrors[key];
    return <label className="block text-sm text-gray-700">{label} <span className={required ? 'font-bold text-red-700' : 'text-xs text-gray-500'}>{required ? '*' : 'Optional'}</span>
      <input data-profile-field={key} aria-invalid={Boolean(errorText)} type={type} min={key === 'height_cm' ? 120 : key === 'number_of_children' ? 0 : undefined} max={key === 'height_cm' ? 230 : undefined} maxLength={maxLength} value={value} onChange={event => updateProfile(key, type === 'number' ? (event.target.value ? Number(event.target.value) : null) : event.target.value)} className={`mt-1 w-full rounded-lg border px-3 py-2 ${errorText ? 'border-red-500' : 'border-gray-200'}`} />
      {errorText && <span className="mt-1 block text-xs text-red-700">{errorText}</span>}
    </label>;
  };
  const select = (label: string, key: keyof MatchmakingProfile, options: Choice[], required = false) => {
    const errorText = fieldErrors[key];
    return <label className="block text-sm text-gray-700">{label} <span className={required ? 'font-bold text-red-700' : 'text-xs text-gray-500'}>{required ? '*' : 'Optional'}</span>
      <select data-profile-field={key} aria-invalid={Boolean(errorText)} value={textValue(profile[key])} onChange={event => updateProfile(key, event.target.value || null)} className={`mt-1 w-full rounded-lg border px-3 py-2 ${errorText ? 'border-red-500' : 'border-gray-200'}`}><option value="">Choose</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      {errorText && <span className="mt-1 block text-xs text-red-700">{errorText}</span>}
    </label>;
  };
  const textarea = (label: string, key: 'introduction' | 'marriage_vision_response' | 'physical_self_description' | 'faith_expectations' | 'family_background', required: boolean, minimum?: number, maximum = 600) => {
    const value = textValue(profile[key]); const errorText = fieldErrors[key];
    return <label className="block text-sm text-gray-700">{label} <span className={required ? 'font-bold text-red-700' : 'text-xs text-gray-500'}>{required ? '*' : 'Optional'}</span>
      <textarea data-profile-field={key} aria-invalid={Boolean(errorText)} value={value} maxLength={maximum} rows={key === 'introduction' || key === 'marriage_vision_response' ? 5 : 3} onChange={event => updateProfile(key, event.target.value)} className={`mt-1 w-full rounded-lg border p-3 ${errorText ? 'border-red-500' : 'border-gray-200'}`} />
      <span className="text-xs text-gray-500">{value.trim().length}{minimum ? ` / ${minimum}–${maximum} characters` : ` / ${maximum} characters`}</span>{errorText && <span className="mt-1 block text-xs text-red-700">{errorText}</span>}
    </label>;
  };
  const booleanSelect = (label: string, key: 'has_children' | 'children_live_with_me', required = false) => {
    const errorText = fieldErrors[key];
    return <label className="block text-sm text-gray-700">{label} <span className={required ? 'font-bold text-red-700' : 'text-xs text-gray-500'}>{required ? '*' : 'Optional'}</span>
      <select data-profile-field={key} aria-invalid={Boolean(errorText)} value={profile[key] == null ? '' : String(profile[key])} onChange={event => updateProfile(key, event.target.value === '' ? null : event.target.value === 'true')} className={`mt-1 w-full rounded-lg border px-3 py-2 ${errorText ? 'border-red-500' : 'border-gray-200'}`}><option value="">Choose</option><option value="true">Yes</option><option value="false">No</option></select>{errorText && <span className="mt-1 block text-xs text-red-700">{errorText}</span>}
    </label>;
  };
  const modeFor = (key: keyof MatchmakingPreferences) => (textValue(preferences[key] || 'open') as 'required' | 'preferred' | 'open');
  const setMode = (key: keyof MatchmakingPreferences, value: 'required' | 'preferred' | 'open') => updatePreference(key, value);
  const modeControl = (modeKey: keyof MatchmakingPreferences) => <div><p className="mb-1 text-sm text-gray-700">Importance</p><PreferenceMode value={modeFor(modeKey)} onChange={value => setMode(modeKey, value)} /></div>;
  const choicePreference = (label: string, fieldKey: keyof MatchmakingPreferences, modeKey: keyof MatchmakingPreferences, values: string[], options: Choice[], multiple = false) => <div data-profile-field={fieldKey} tabIndex={-1} className={`min-w-0 rounded-lg border p-3 ${fieldErrors[fieldKey] ? 'border-red-500 bg-red-50' : 'border-transparent'}`}>
    <ChoicePreference label={label} value={values} options={options} mode={modeFor(modeKey)} onChange={value => updatePreference(fieldKey, value)} onModeChange={value => setMode(modeKey, value)} multiple={multiple} />
    {fieldErrors[modeKey] && <p className="mt-2 text-xs text-red-700">{fieldErrors[modeKey]}</p>}{fieldErrors[fieldKey] && <p className="mt-2 text-xs text-red-700">{fieldErrors[fieldKey]}</p>}
  </div>;

  if (!user) return <div className="p-10 text-center">Sign in to use Matchmaking.</div>;

  if (selected) return <main className="min-h-screen bg-[#faf6f1] py-8"><div className="max-w-3xl mx-auto px-4"><Button variant="ghost" onClick={() => setSelected(null)}>← Back to discovery</Button><article className="bg-white rounded-2xl shadow-sm mt-4 overflow-hidden">
    {selected.profile_image_url && <img src={selected.profile_image_url} alt="" className="w-full h-72 object-cover" />}
    <div className="p-7"><p className="text-sm text-gray-500">{selected.age} · {selected.city ? `${selected.city}, ` : ''}{countryLabel(selected.country_code)}</p><h1 className="text-3xl text-[#1e3a5f] font-bold mt-1">Marriage profile</h1>
      {selected.alignments.length > 0 && <section className="mt-5 rounded-xl bg-[#f4f1ec] p-4"><h2 className="font-semibold text-[#1e3a5f]">Why this profile may fit</h2><ul className="mt-2 list-disc pl-5 text-sm text-gray-700">{selected.alignments.map(alignment => <li key={alignment}>{alignment}</li>)}</ul></section>}
      {selected.introduction && <p className="mt-5 whitespace-pre-wrap">{selected.introduction}</p>}
      {selected.marriage_vision_response && <section className="mt-5"><h2 className="font-semibold text-[#1e3a5f]">The home they hope to build</h2><p className="mt-2 whitespace-pre-wrap">{selected.marriage_vision_response}</p></section>}
      <dl className="grid sm:grid-cols-2 gap-4 mt-6 text-sm">{[
        ['Physical description', selected.physical_self_description], ['Height', selected.height_cm ? `${selected.height_cm} cm` : null], ['Education', selected.education_level], ['Field of study', selected.field_of_study],
        ['Occupation', selected.occupation], ['Marital history', selected.marital_status], ['Languages', selected.languages.join(', ')],
        ['Children', selected.has_children == null ? null : selected.has_children ? 'Has children' : 'No children'], ['Future children', selected.wants_children],
        ['Faith', selected.religion_or_faith], ['Faith practice', selected.faith_practice_level], ['Faith expectations', selected.faith_expectations],
        ['Culture', selected.cultural_or_ethnic_community], ['Clan / region', selected.clan_or_region], ['Family involvement', selected.family_involvement],
        ['Family background', selected.family_background], ['Marriage timeline', selected.marriage_timeline], ['Marriage structure', selected.marriage_structure],
        ['Relocation', selected.willing_to_relocate], ['Long distance', selected.long_distance_openness], ['Provider model', selected.provider_model],
        ['Family / in-law expectations', selected.family_in_law_expectations],
      ].filter(item => item[1]).map(([label, value]) => <div key={String(label)}><dt className="text-gray-500">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>
      <p className="text-xs text-gray-500 mt-6">Profile information is shared for respectful marriage introductions.</p>
      <div className="flex flex-wrap gap-3 mt-6"><Button onClick={async () => { try { await sendMatchmakingInterest(selected.profile_identifier); setNotice('Interest sent.'); toast.success('Interest sent.'); setSelected(null); } catch (cause) { const message = errorMessage(cause, 'Could not send interest.'); setError(message); toast.error(message); } }}>Express interest</Button><Button variant="outline" onClick={async () => { const reason = window.prompt('Reason: fake_profile, harassment, married_or_unavailable, sexual_solicitation, fraud_scam, abusive_conduct, inappropriate_photo, other', 'other'); if (!reason) return; try { await reportMatchmakingProfile(selected.profile_identifier, reason); setNotice('Report sent privately to the team.'); toast.success('Report sent privately to the team.'); } catch (cause) { const message = errorMessage(cause, 'Could not send report.'); setError(message); toast.error(message); } }}>Report</Button><Button variant="ghost" onClick={async () => { if (!window.confirm('Block this profile?')) return; try { await blockMatchmakingProfile(selected.profile_identifier); setSelected(null); void loadDiscovery(); toast.success('Profile blocked.'); } catch (cause) { const message = errorMessage(cause, 'Could not block profile.'); setError(message); toast.error(message); } }}>Block</Button></div>
    </div></article></div></main>;

  return <main className="min-h-screen bg-[#faf6f1] py-8"><div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
    <header className="mb-7"><h1 className="text-3xl font-bold text-[#1e3a5f]">Serious Marriage Matchmaking</h1><p className="text-gray-600 mt-2">Thoughtful profiles and mutual, intentional introductions.</p></header>
    {error && <div role="alert" className="bg-red-50 text-red-800 rounded-lg p-3 mb-4">{error}<button className="ml-3 underline" onClick={() => tab === 'profile' ? void loadSetup() : tab === 'discover' ? void loadDiscovery() : void loadInterests()}>Retry</button></div>}
    {notice && <p role="status" className="bg-emerald-50 text-emerald-800 rounded-lg p-3 mb-4">{notice}</p>}
    <nav className="flex flex-wrap gap-2 mb-6">{([['profile','Marriage Profile'],['discover','Discover'],['interests','Interests / Introductions']] as const).map(([id,label]) => <button key={id} onClick={() => setTab(id)} className={`rounded-lg px-4 py-2 ${tab === id ? 'bg-[#1e3a5f] text-white' : 'bg-white text-gray-700'}`}>{label}</button>)}</nav>
    {tab === 'profile' && <section className="space-y-5">
      {loading ? <div className="bg-white rounded-xl p-8">Loading your profile…</div> : <>
        {setup?.profile?.status === 'pending_review' && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">Your marriage profile is under review.</p>}
        {setup?.profile?.status === 'approved' && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">Your marriage profile has been approved for matchmaking.</p>}
        {setup?.profile?.status === 'rejected' && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">Your profile needs changes before it can be approved.</p>}
        {setup?.profile?.status === 'hidden' && <p role="status" className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-gray-700">Your marriage profile is currently hidden from matchmaking.</p>}
        <section className="bg-white rounded-xl p-6 shadow-sm"><h2 className="text-xl font-semibold text-[#1e3a5f]">CORE DETAILS</h2><p className="text-sm text-gray-600 mt-2">* Required to submit your marriage profile. Core identity details are managed from your account profile.</p>
          {setup?.account && <dl className="grid gap-3 sm:grid-cols-2 mt-4 text-sm">{[
            ['Age', setup.account.age == null ? 'Not set' : String(setup.account.age)], ['Current location', [setup.account.city, countryLabel(setup.account.country_code)].filter(Boolean).join(', ') || 'Not set'],
            ['Nationality', countryLabel(setup.account.nationality_country_code) || 'Not set'], ['Country of origin', countryLabel(setup.account.country_of_origin_code) || 'Not set'],
            ['Legal marital status', humanize(setup.account.legal_marital_status)], ['Relationship situation', humanize(setup.account.relationship_situation)],
            ['Languages', [setup.account.primary_language, ...(setup.account.other_languages ?? [])].filter(Boolean).join(', ') || 'Not set'],
          ].map(([label,value]) => <div key={label}><dt className="text-gray-500">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>}
          <Button className="mt-4" size="sm" variant="outline" onClick={() => navigate('/profile')}>Update Core Profile</Button>
          {setup?.account?.gender !== 'female' && setup?.account?.gender !== 'male' && <p className="mt-3 text-sm text-amber-800">Your Core Profile needs a valid gender before Matchmaking can be used.</p>}
          {!setup?.account?.onboarding_completed && <p className="mt-3 text-sm text-amber-800">Complete onboarding before submitting for review.</p>}
        </section>
        <section className="bg-white rounded-xl p-6 shadow-sm space-y-4"><h2 className="font-semibold text-xl text-[#1e3a5f]">ABOUT ME</h2><div className="grid gap-4 sm:grid-cols-2">{field('Height (cm)','height_cm',true,'number')}{textarea('Physical self-description','physical_self_description',false,undefined,500)}</div>{textarea('Introduce yourself','introduction',true,150)}<p className="text-sm font-medium text-gray-700">What kind of home and marriage do you hope to build? *</p>{textarea('Your response','marriage_vision_response',true,80)}</section>
        <section className="bg-white rounded-xl p-6 shadow-sm space-y-4"><h2 className="font-semibold text-xl text-[#1e3a5f]">EDUCATION & WORK</h2><div className="grid gap-4 sm:grid-cols-2">{field('Education level','education_level',true)}{field('Field of study','field_of_study')}{field('Occupation','occupation',true)}{field('Employment status','employment_status',true)}{select('Financial readiness','financial_readiness',[{label:'Ready now',value:'ready_now'},{label:'Stable and preparing',value:'stable_and_preparing'},{label:'Building toward readiness',value:'building_toward_readiness'},{label:'Prefer to discuss',value:'prefer_to_discuss'}],true)}</div><p className="text-xs text-gray-500">We do not ask for salary, assets, or bank balances.</p></section>
        <section className="bg-white rounded-xl p-6 shadow-sm space-y-4"><h2 className="font-semibold text-xl text-[#1e3a5f]">FAITH & CULTURE</h2><p className="text-sm text-gray-600">Faith is your religion or tradition. Practice describes how actively you practice it. Display and matching consent are independent.</p><div className="grid gap-4 sm:grid-cols-2">{field('Religion / faith tradition','religion_or_faith',true)}{field('How actively do you practice?','faith_practice_level',true)}{select('How important is faith in your marriage?','faith_importance',[{label:'Central',value:'central'},{label:'Important',value:'important'},{label:'Somewhat important',value:'somewhat_important'},{label:'Not a priority',value:'not_a_priority'},{label:'Prefer to discuss',value:'prefer_to_discuss'}],true)}{field('Denomination / tradition','denomination_or_tradition')}{textarea('Faith expectations','faith_expectations',false,undefined,1200)}{field('Cultural or ethnic community','cultural_or_ethnic_community')}{field('Clan or region','clan_or_region')}
        </div>
          <div className="grid gap-3 sm:grid-cols-2 text-sm"><label className="flex gap-2 items-start"><input type="checkbox" checked={Boolean(profile.show_religion)} onChange={event=>updateProfile('show_religion',event.target.checked)} /><span>Show my faith on my marriage profile</span></label><label className="flex gap-2 items-start"><input type="checkbox" checked={Boolean(profile.use_religion_for_matching)} onChange={event=>updateProfile('use_religion_for_matching',event.target.checked)} /><span>Use my faith privately when finding matches</span></label><label className="flex gap-2 items-start"><input type="checkbox" checked={Boolean(profile.show_cultural_community)} onChange={event=>updateProfile('show_cultural_community',event.target.checked)} /><span>Show my cultural community on my profile</span></label><label className="flex gap-2 items-start"><input type="checkbox" checked={Boolean(profile.use_cultural_community_for_matching)} onChange={event=>updateProfile('use_cultural_community_for_matching',event.target.checked)} /><span>Use my cultural community when finding matches</span></label><label className="flex gap-2 items-start"><input type="checkbox" checked={Boolean(profile.show_clan_or_region)} onChange={event=>updateProfile('show_clan_or_region',event.target.checked)} /><span>Show my clan or region on my profile</span></label></div>
        </section>
        <section className="bg-white rounded-xl p-6 shadow-sm space-y-4"><h2 className="font-semibold text-xl text-[#1e3a5f]">FAMILY & CHILDREN</h2><div className="grid gap-4 sm:grid-cols-2">{booleanSelect('Do you have children?','has_children',true)}{field('Number of children','number_of_children',false,'number')}{booleanSelect('Do your children live with you?','children_live_with_me')}{select('Would you like children in the future?','wants_children',futureChildren,true)}
          <label className="block text-sm text-gray-700">Family involvement <span className="font-bold text-red-700">*</span><select data-profile-field="family_involvement" aria-invalid={Boolean(fieldErrors.family_involvement)} value={textValue(profile.family_involvement)} onChange={event=>updateProfile('family_involvement',event.target.value||null)} className={`mt-1 w-full rounded-lg border px-3 py-2 ${fieldErrors.family_involvement?'border-red-500':'border-gray-200'}`}><option value="">Choose</option><option value="very_involved">Very involved</option><option value="supportive_with_boundaries">Supportive with boundaries</option><option value="independent">Independent</option><option value="prefer_to_discuss">Prefer to discuss</option></select>{fieldErrors.family_involvement&&<span className="mt-1 block text-xs text-red-700">{fieldErrors.family_involvement}</span>}</label>
        </div>{textarea('Brief family background','family_background',false,undefined,1200)}</section>
        <section className="bg-white rounded-xl p-6 shadow-sm space-y-4"><h2 className="font-semibold text-xl text-[#1e3a5f]">MARRIAGE & FUTURE</h2><div className="grid gap-4 sm:grid-cols-2">
          {select('When would you hope to marry?','marriage_timeline',[{label:'Within 6 months',value:'within_6_months'},{label:'6–12 months',value:'6_to_12_months'},{label:'1–2 years',value:'1_to_2_years'},{label:'More than 2 years',value:'more_than_2_years'},{label:'Open to discussion',value:'open_to_discussion'}],true)}
          {select('Marriage structure','marriage_structure',[{label:'Monogamous',value:'monogamous'},{label:'Polygynous',value:'polygynous'},{label:'Open to discussion',value:'open_to_discussion'}],true)}
          {select('Willingness to relocate','willing_to_relocate',yesNoMaybe,true)}
          {select('Are you open to a long-distance relationship temporarily?','long_distance_openness',[{label:'Yes',value:'yes'},{label:'Temporarily',value:'temporarily'},{label:'No',value:'no'},{label:'Prefer to discuss',value:'prefer_to_discuss'}],true)}
          {select('Financial responsibility model','provider_model',[{label:'Single provider',value:'single_provider'},{label:'Shared financial responsibility',value:'shared_financial_responsibility'},{label:'Flexible by season',value:'flexible_by_season'},{label:'Prefer to discuss',value:'prefer_to_discuss'}],true)}
          {select('Family / in-law expectations','family_in_law_expectations',[{label:'Close involvement',value:'close_involvement'},{label:'Supportive boundaries',value:'supportive_boundaries'},{label:'Independent household',value:'independent_household'},{label:'Prefer to discuss',value:'prefer_to_discuss'}],true)}
          {select('Smoking','smoking',[{label:'Never',value:'never'},{label:'Occasionally',value:'occasionally'},{label:'Regularly',value:'regularly'},{label:'Prefer to discuss',value:'prefer_to_discuss'}],true)}
          {select('Alcohol / drinking','drinking',[{label:'Never',value:'never'},{label:'Occasionally',value:'occasionally'},{label:'Regularly',value:'regularly'},{label:'Prefer to discuss',value:'prefer_to_discuss'}],true)}
        </div></section>
        <section className="bg-white rounded-xl p-6 shadow-sm space-y-5"><div><h2 className="font-semibold text-xl text-[#1e3a5f]">PARTNER PREFERENCES</h2><p className="mt-2 text-sm text-gray-600">Required limits who can appear. Preferred helps rank suitable profiles. Open does not restrict matching.</p></div>
          <div data-profile-field="preferred_partner_gender" tabIndex={-1} className={`rounded-lg border p-4 text-sm ${fieldErrors.preferred_partner_gender?'border-red-500 bg-red-50':'border-gray-200 bg-gray-50'}`}><span className="font-medium">Spouse gender *</span><p className="mt-1">{setup?.account?.gender==='female'?'You are seeking a man.':setup?.account?.gender==='male'?'You are seeking a woman.':'Your Core Profile needs a valid gender.'}</p>{fieldErrors.preferred_partner_gender&&<span className="mt-1 block text-xs text-red-700">{fieldErrors.preferred_partner_gender}</span>}</div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-gray-700">Minimum age *<input data-profile-field="age_min" aria-invalid={Boolean(fieldErrors.age_min)} type="number" min="18" max="100" value={textValue(preferences.age_min)} onChange={event=>updatePreference('age_min',event.target.value?Number(event.target.value):null)} className={`mt-1 w-full rounded-lg border px-3 py-2 ${fieldErrors.age_min?'border-red-500':'border-gray-200'}`} />{fieldErrors.age_min&&<span className="text-xs text-red-700">{fieldErrors.age_min}</span>}</label><label className="text-sm text-gray-700">Maximum age *<input data-profile-field="age_max" aria-invalid={Boolean(fieldErrors.age_max)} type="number" min="18" max="100" value={textValue(preferences.age_max)} onChange={event=>updatePreference('age_max',event.target.value?Number(event.target.value):null)} className={`mt-1 w-full rounded-lg border px-3 py-2 ${fieldErrors.age_max?'border-red-500':'border-gray-200'}`} />{fieldErrors.age_max&&<span className="text-xs text-red-700">{fieldErrors.age_max}</span>}</label></div>
          <div className="grid gap-4 md:grid-cols-2"><div data-profile-field="preferred_residences" tabIndex={-1} className={`min-w-0 rounded-lg border p-3 ${fieldErrors.preferred_residences?'border-red-500 bg-red-50':'border-transparent'}`}><CountryMultiSelect label="Where may your spouse currently live?" value={preferences.preferred_residences??[]} onChange={value=>updatePreference('preferred_residences',value)} />{modeControl('residence_mode')}{fieldErrors.residence_mode&&<p className="mt-2 text-xs text-red-700">{fieldErrors.residence_mode}</p>}{fieldErrors.preferred_residences&&<p className="mt-2 text-xs text-red-700">{fieldErrors.preferred_residences}</p>}</div>
            <div data-profile-field="preferred_religions" tabIndex={-1} className={`min-w-0 rounded-lg border p-3 ${fieldErrors.preferred_religions?'border-red-500 bg-red-50':'border-transparent'}`}><TokenInput label="Religion / faith of spouse sought" value={preferences.preferred_religions??[]} onChange={value=>updatePreference('preferred_religions',value)} placeholder="Type and press Enter" />{modeControl('religion_mode')}{fieldErrors.religion_mode&&<p className="mt-2 text-xs text-red-700">{fieldErrors.religion_mode}</p>}{fieldErrors.preferred_religions&&<p className="mt-2 text-xs text-red-700">{fieldErrors.preferred_religions}</p>}</div>
            {choicePreference('What marital history are you open to?','preferred_marital_statuses','marital_status_mode',preferences.preferred_marital_statuses??[],maritalStatuses,true)}
            {choicePreference('Are you open to marrying someone who already has children?','preferred_children_statuses','children_mode',preferences.preferred_children_statuses??[],[{label:'Has children',value:'has_children'},{label:'No children',value:'no_children'}],true)}
            {choicePreference('Would you like your future spouse to want children?','preferred_wants_children','wants_children_mode',preferences.preferred_wants_children??[],futureChildren,true)}
            {choicePreference('Should your future spouse be willing to relocate?','preferred_relocation','relocation_mode',preferences.preferred_relocation??[],yesNoMaybe,true)}
          </div>
        </section>
        <div className="sticky bottom-3 z-10 bg-white/95 backdrop-blur rounded-xl border border-gray-200 p-4 shadow-lg flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">Marriage Profile completion: {profile.completion_percentage ?? 0}%</p><p className="text-sm text-gray-500">{busy?'Saving…':isDirty?'Unsaved changes':baseline?'Saved':''}</p><p className="text-sm font-medium text-[#1e3a5f]" role="status">{requiredFieldsRemaining?`${requiredFieldsRemaining} required response${requiredFieldsRemaining===1?'':'s'} remaining`:'All required responses completed'}</p></div><div className="flex gap-3"><Button variant="outline" disabled={busy||!isDirty} onClick={()=>void saveDraft()}>{busy?'Saving…':'Save Draft'}</Button><Button disabled={busy||profile.status==='hidden'} onClick={()=>void submit()}>{profile.status==='pending_review'?'Submitted for review':'Submit for review'}</Button></div></div>
      </>}
    </section>}
    {tab==='discover'&&<section>{loading?<div className="bg-white p-8 rounded-xl">Loading eligible profiles…</div>:discovery.length===0&&!error?<div className="bg-white rounded-2xl p-12 text-center"><h2 className="text-xl text-[#1e3a5f] font-semibold">Discovery is getting ready</h2><p className="text-gray-600 mt-2">Your v2 profile must be complete, approved, and mutually eligible before profiles appear.</p></div>:<><div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">{discovery.map(item=><article key={item.profile_identifier} className="bg-white rounded-xl shadow-sm overflow-hidden">{item.profile_image_url?<img src={item.profile_image_url} alt="" className="w-full h-48 object-cover"/>:<div className="h-48 bg-[#e9e2d8]"/>}<div className="p-5"><p className="text-sm text-gray-500">{item.age} · {item.city?`${item.city}, `:''}{countryLabel(item.country_code)}</p><h3 className="text-xl font-semibold text-[#1e3a5f]">Member profile</h3><p className="line-clamp-3 mt-2 text-gray-700">{item.introduction}</p><div className="flex flex-wrap gap-2 mt-4"><Button size="sm" onClick={async()=>{try{setSelected(await getMatchmakingProfile(item.profile_identifier));}catch(cause){setError(errorMessage(cause,'Profile unavailable.'));}}}>View profile</Button><Button size="sm" variant="outline" onClick={async()=>{try{await sendMatchmakingInterest(item.profile_identifier);setNotice('Interest sent.');toast.success('Interest sent.');await loadInterests();}catch(cause){const message=errorMessage(cause,'Could not send interest.');setError(message);toast.error(message);}}}>Interest</Button></div></div></article>)}</div>{hasMoreDiscovery&&<div className="text-center mt-6"><Button variant="outline" disabled={busy} onClick={async()=>{const last=discovery[discovery.length-1];if(!last)return;setBusy(true);try{const rows=await getMatchmakingDiscovery(20,{createdAt:last.created_at,profileIdentifier:last.profile_identifier});setDiscovery(current=>[...current,...rows]);setHasMoreDiscovery(rows.length===20);}catch(cause){setError(errorMessage(cause,'Could not load more profiles.'));}finally{setBusy(false);}}}>{busy?'Loading…':'Load more profiles'}</Button></div>}</>}</section>}
    {tab==='interests'&&<section className="bg-white rounded-xl p-6">{loading?<p>Loading introductions…</p>:interests.length===0?<p className="text-gray-600">No interest requests yet.</p>:<div className="space-y-3">{interests.map(item=><article key={item.interest_id} className="border rounded-lg p-4 flex flex-wrap justify-between gap-3"><div><p className="font-semibold">{item.display_name} {item.age?`· ${item.age}`:''}</p><p className="text-sm text-gray-500">{item.direction} · {item.status} · {item.city||countryLabel(item.country_code)}</p>{item.status==='accepted'&&<p className="text-sm text-emerald-700 mt-2">Mutual interest established. Uncle Bashi can guide the next introduction step.</p>}</div><div className="flex gap-2">{item.direction==='incoming'&&item.status==='pending'&&<><Button size="sm" onClick={async()=>{try{await respondMatchmakingInterest(item.interest_id,'accept');await loadInterests();}catch(cause){setError(errorMessage(cause,'Could not accept interest.'));}}}>Accept</Button><Button size="sm" variant="outline" onClick={async()=>{try{await respondMatchmakingInterest(item.interest_id,'decline');await loadInterests();}catch(cause){setError(errorMessage(cause,'Could not decline interest.'));}}}>Decline</Button></>}{item.direction==='outgoing'&&item.status==='pending'&&<Button size="sm" variant="outline" onClick={async()=>{try{await withdrawMatchmakingInterest(item.interest_id);await loadInterests();}catch(cause){setError(errorMessage(cause,'Could not withdraw interest.'));}}}>Withdraw</Button>}</div></article>)}</div>}</section>}
  </div></main>;
};
