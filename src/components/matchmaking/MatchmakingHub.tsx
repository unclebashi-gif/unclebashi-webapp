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
import { MATCHMAKING_COUNTRIES, matchmakingCountryCode } from '@/types/matchmaking';
import type { MatchmakingDiscoveryProfile, MatchmakingInterest, MatchmakingPreferences, MatchmakingProfile, MatchmakingSetup } from '@/types/matchmaking';
import { ChoicePreference, CountryMultiSelect, PreferenceMode, TokenInput } from './ProfileInputs';

type Tab = 'profile' | 'discover' | 'interests';
type DraftState = { profile: Partial<MatchmakingProfile>; preferences: Partial<MatchmakingPreferences> };

const emptyProfile: Partial<MatchmakingProfile> = {
  nationality_country_code: null, country_of_origin_code: null, hometown: null, languages: [], height_cm: null,
  cultural_or_ethnic_community: null, show_cultural_community: false, use_cultural_community_for_matching: false,
  religion_or_faith: null, faith_practice_level: null, show_religion: false, use_religion_for_matching: false,
  education_level: null, field_of_study: null, employment_status: null, industry: null, marital_status: null,
  has_children: null, number_of_children: null, children_live_with_me: null, wants_children: null, preferred_number_of_children: null,
  smoking: null, drinking: null, exercise_level: null, social_style: null, interests: [], willing_to_relocate: null,
  preferred_country_to_build_home: null, diaspora_return_intention: null, introduction: null, use_profile_image_for_matchmaking: false,
};
const emptyPreferences: Partial<MatchmakingPreferences> = {
  preferred_partner_gender: undefined, age_min: null, age_max: null,
  preferred_nationalities: [], nationality_mode: 'open', preferred_origins: [], origin_mode: 'open',
  preferred_residences: [], residence_mode: 'open', preferred_cities: [], city_mode: 'open',
  preferred_languages: [], language_mode: 'open', min_height_cm: null, max_height_cm: null, height_mode: 'open',
  preferred_education_levels: [], education_mode: 'open', preferred_religions: [], religion_mode: 'open',
  preferred_faith_practice_levels: [], faith_practice_mode: 'open', preferred_cultural_communities: [], culture_mode: 'open',
  preferred_marital_statuses: [], marital_status_mode: 'open', accepts_partner_with_children: null, children_mode: 'open',
  preferred_wants_children: [], wants_children_mode: 'open', preferred_smoking: [], smoking_mode: 'open',
  preferred_drinking: [], drinking_mode: 'open', preferred_relocation: [], relocation_mode: 'open',
};
const textValue = (value: unknown) => value == null ? '' : String(value);
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const countryLabel = (value: string | null) => MATCHMAKING_COUNTRIES.find(country => country.code === value)?.country ?? value ?? '';
const requiredProfileFields = [
  'nationality_country_code', 'country_of_origin_code', 'introduction', 'education_level',
  'employment_status', 'marital_status', 'has_children', 'wants_children',
  'willing_to_relocate', 'preferred_partner_gender', 'age_min', 'age_max',
] as const;

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
  const [selected, setSelected] = useState<MatchmakingDiscoveryProfile | null>(null);
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
      const preferredPartnerGender: 'male' | 'female' | undefined = result.account?.gender === 'female'
        ? 'male'
        : result.account?.gender === 'male'
          ? 'female'
          : undefined;
      const nextPreferences = { ...emptyPreferences, ...(result.preferences ?? {}), preferred_partner_gender: preferredPartnerGender };
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
    try {
      setInterests(await getMyMatchmakingInterests());
    } catch (cause) {
      setError(errorMessage(cause, 'Could not load introductions.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSetup(); }, [loadSetup]);
  useEffect(() => {
    if (tab === 'discover') void loadDiscovery();
    if (tab === 'interests') void loadInterests();
  }, [tab, loadDiscovery, loadInterests]);

  const updateProfile = (key: keyof MatchmakingProfile, value: unknown) => { setProfile(current => ({ ...current, [key]: value })); setFieldErrors(current => { const next = { ...current }; delete next[key]; return next; }); };
  const updatePreference = (key: keyof MatchmakingPreferences, value: unknown) => { setPreferences(current => ({ ...current, [key]: value })); setFieldErrors(current => { const next = { ...current }; delete next[key]; return next; }); };

  const getValidationErrors = useCallback(() => {
    const next: Record<string, string> = {};
    const minAge = preferences.age_min;
    const maxAge = preferences.age_max;
    const requiredText: Array<[keyof MatchmakingProfile, string | null | undefined]> = [
      ['nationality_country_code', profile.nationality_country_code],
      ['country_of_origin_code', profile.country_of_origin_code],
      ['introduction', profile.introduction],
      ['education_level', profile.education_level],
      ['employment_status', profile.employment_status],
      ['marital_status', profile.marital_status],
      ['wants_children', profile.wants_children],
      ['willing_to_relocate', profile.willing_to_relocate],
    ];
    for (const [key, value] of requiredText) {
      if (!value?.trim()) next[key] = 'This field is required to submit your marriage profile.';
    }
    if (profile.has_children == null) next.has_children = 'Choose yes or no to continue.';
    if (!preferences.preferred_partner_gender) next.preferred_partner_gender = 'Choose the gender of the spouse you seek.';
    if (minAge == null) next.age_min = 'Enter the minimum preferred age.';
    if (maxAge == null) next.age_max = 'Enter the maximum preferred age.';
    if (minAge != null && (!Number.isInteger(minAge) || minAge < 18 || minAge > 100)) next.age_min = 'Enter a whole-number age from 18 to 100.';
    if (maxAge != null && (!Number.isInteger(maxAge) || maxAge < 18 || maxAge > 100)) next.age_max = 'Enter a whole-number age from 18 to 100.';
    if (minAge != null && maxAge != null && maxAge < minAge) next.age_max = 'Maximum age must be greater than or equal to minimum age.';
    if (profile.height_cm != null && (!Number.isInteger(profile.height_cm) || profile.height_cm < 120 || profile.height_cm > 230)) next.height_cm = 'Enter a whole-number height from 120 to 230 cm.';
    if (profile.number_of_children != null && (!Number.isInteger(profile.number_of_children) || profile.number_of_children < 0)) next.number_of_children = 'Enter a whole number of zero or more.';
    if (profile.preferred_number_of_children != null && (!Number.isInteger(profile.preferred_number_of_children) || profile.preferred_number_of_children < 0)) next.preferred_number_of_children = 'Enter a whole number of zero or more.';
    if (preferences.min_height_cm != null && (!Number.isInteger(preferences.min_height_cm) || preferences.min_height_cm < 120 || preferences.min_height_cm > 230)) next.min_height_cm = 'Enter a height from 120 to 230 cm.';
    if (preferences.max_height_cm != null && (!Number.isInteger(preferences.max_height_cm) || preferences.max_height_cm < 120 || preferences.max_height_cm > 230)) next.max_height_cm = 'Enter a height from 120 to 230 cm.';
    if (preferences.min_height_cm != null && preferences.max_height_cm != null && preferences.max_height_cm < preferences.min_height_cm) next.max_height_cm = 'Maximum height must be greater than or equal to minimum height.';
    return next;
  }, [
    profile.country_of_origin_code, profile.education_level, profile.employment_status, profile.has_children,
    profile.height_cm, profile.introduction, profile.marital_status, profile.nationality_country_code,
    profile.number_of_children, profile.preferred_number_of_children, profile.wants_children,
    profile.willing_to_relocate, preferences.age_min, preferences.age_max, preferences.min_height_cm,
    preferences.max_height_cm, preferences.preferred_partner_gender,
  ]);

  useEffect(() => { setFieldErrors(getValidationErrors()); }, [getValidationErrors]);
  const currentValidationErrors = getValidationErrors();
  const requiredFieldsRemaining = requiredProfileFields.filter(key => Boolean(currentValidationErrors[key])).length;

  const validate = () => {
    const next = getValidationErrors();
    setFieldErrors(next);
    if (Object.keys(next).length) {
      toast.error('Please complete the highlighted required fields.');
      requestAnimationFrame(() => {
        const firstInvalid = document.querySelector<HTMLElement>(`[data-profile-field="${Object.keys(next)[0]}"]`);
        firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstInvalid?.focus();
      });
      return false;
    }
    return true;
  };

  const save = async () => {
    if (!validate()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const savedProfile = await saveMatchmakingProfile(profile);
      const savedPreferences = await saveMatchmakingPreferences(preferences);
      const nextProfile = { ...emptyProfile, ...savedProfile };
      const nextPreferences = { ...emptyPreferences, ...savedPreferences };
      setProfile(nextProfile);
      setPreferences(nextPreferences);
      setSetup(current => current ? { ...current, profile: savedProfile, preferences: savedPreferences } : current);
      setBaseline({ profile: nextProfile, preferences: nextPreferences });
      setNotice('Marriage profile saved.');
      toast.success('Marriage profile saved.');
    } catch (cause) {
      const message = errorMessage(cause, 'Could not save your profile.');
      setError(message);
      toast.error('Profile not saved. Please check the highlighted fields.', { description: message });
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (setup?.account?.gender !== 'female' && setup?.account?.gender !== 'male') {
      const message = 'Your base profile needs a valid gender before you can submit for matchmaking.';
      setError(message);
      toast.error(message);
      return;
    }
    if (!validate()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const submitted = await submitMatchmakingProfile();
      const nextProfile = { ...emptyProfile, ...submitted };
      setProfile(nextProfile);
      setSetup(current => current ? { ...current, profile: submitted } : current);
      setBaseline(current => current ? { ...current, profile: nextProfile } : current);
      toast.success('Marriage profile submitted for review.');
      navigate('/', { replace: true });
    } catch (cause) {
      const message = errorMessage(cause, 'Could not submit profile.');
      setError(message);
      toast.error('Profile not submitted.', { description: message });
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, key: keyof MatchmakingProfile, type = 'text', required = false) => key === 'languages' || key === 'interests'
    ? <TokenInput label={`${label} · Optional`} value={(profile[key] as string[] | undefined) ?? []} onChange={value => updateProfile(key, value)} placeholder={key === 'languages' ? 'e.g., English, Luganda' : 'e.g., reading, hiking'} />
    : <label className="block text-sm text-gray-700">{label} <span className={required ? 'font-bold text-red-700' : 'text-xs text-gray-500'}>{required ? '*' : 'Optional'}</span>
      <input data-profile-field={key} aria-invalid={Boolean(fieldErrors[key])} type={type} min={key==='height_cm'?120:key==='number_of_children'||key==='preferred_number_of_children'?0:undefined} max={key==='height_cm'?230:undefined} value={textValue(profile[key])} onChange={event => updateProfile(key, type === 'number' ? (event.target.value ? Number(event.target.value) : null) : event.target.value)} className={`mt-1 w-full rounded-lg border px-3 py-2 ${fieldErrors[key] ? 'border-red-500' : 'border-gray-200'}`} />
      {fieldErrors[key] && <span className="mt-1 block text-xs text-red-700">{fieldErrors[key]}</span>}
    </label>;

  const preferenceTokens = (label: string, key: keyof MatchmakingPreferences, modeKey: keyof MatchmakingPreferences, placeholder?: string) => <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_250px] sm:items-end">
    <TokenInput label={`${label} · Optional`} value={(preferences[key] as string[] | undefined) ?? []} onChange={value => updatePreference(key, value)} placeholder={placeholder ?? 'Type and press Enter'} />
    <PreferenceMode value={textValue(preferences[modeKey] || 'open')} onChange={value => updatePreference(modeKey, value)} />
  </div>;

  const preferenceCountries = (label: string, key: 'preferred_nationalities' | 'preferred_origins' | 'preferred_residences', modeKey: keyof MatchmakingPreferences) => <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_250px] sm:items-end">
    <CountryMultiSelect label={label} value={(preferences[key] as string[] | undefined) ?? []} onChange={value => updatePreference(key, value)} />
    <PreferenceMode value={textValue(preferences[modeKey] || 'open')} onChange={value => updatePreference(modeKey, value)} />
  </div>;

  if (!user) return <div className="p-10 text-center">Sign in to use Matchmaking.</div>;

  if (selected) return <main className="min-h-screen bg-[#faf6f1] py-8"><div className="max-w-3xl mx-auto px-4"><Button variant="ghost" onClick={() => setSelected(null)}>← Back to discovery</Button><article className="bg-white rounded-2xl shadow-sm mt-4 overflow-hidden">
    {selected.profile_image_url && <img src={selected.profile_image_url} alt="" className="w-full h-72 object-cover" />}
    <div className="p-7"><p className="text-sm text-gray-500">{selected.age} · {selected.city ? `${selected.city}, ` : ''}{countryLabel(selected.country_code)}</p><h1 className="text-3xl text-[#1e3a5f] font-bold mt-1">{selected.introduction ? 'Marriage-minded member' : 'Member profile'}</h1>
      {selected.introduction && <p className="mt-5 whitespace-pre-wrap">{selected.introduction}</p>}
      <dl className="grid sm:grid-cols-2 gap-4 mt-6 text-sm">{[['Nationality',countryLabel(selected.nationality_country_code)],['Country of origin',countryLabel(selected.country_of_origin_code)],['Education',selected.education_level],['Work',selected.occupation],['Marital status',selected.marital_status],['Languages',selected.languages.join(', ')],['Children',selected.has_children == null ? 'Not shared' : selected.has_children ? 'Has children' : 'No children'],['Wants children',selected.wants_children],['Faith',selected.religion_or_faith],['Culture',selected.cultural_or_ethnic_community]].filter(item=>item[1]).map(([label,value])=><div key={String(label)}><dt className="text-gray-500">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>
      <p className="text-xs text-gray-500 mt-6">Profile information is shared for respectful marriage introductions.</p>
      <div className="flex flex-wrap gap-3 mt-6"><Button onClick={async()=>{try{await sendMatchmakingInterest(selected.profile_identifier);setNotice('Interest sent.');toast.success('Interest sent.');setSelected(null);}catch(cause){const message=errorMessage(cause,'Could not send interest.');setError(message);toast.error(message);}}}>Express interest</Button><Button variant="outline" onClick={async()=>{const reason=window.prompt('Reason: fake_profile, harassment, married_or_unavailable, sexual_solicitation, fraud_scam, abusive_conduct, inappropriate_photo, other','other');if(!reason)return;try{await reportMatchmakingProfile(selected.profile_identifier,reason);setNotice('Report sent privately to the team.');toast.success('Report sent privately to the team.');}catch(cause){const message=errorMessage(cause,'Could not send report.');setError(message);toast.error(message);}}}>Report</Button><Button variant="ghost" onClick={async()=>{if(!window.confirm('Block this profile?'))return;try{await blockMatchmakingProfile(selected.profile_identifier);setSelected(null);void loadDiscovery();toast.success('Profile blocked.');}catch(cause){const message=errorMessage(cause,'Could not block profile.');setError(message);toast.error(message);}}}>Block</Button></div>
    </div></article></div></main>;

  return <main className="min-h-screen bg-[#faf6f1] py-8"><div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
    <header className="mb-7"><h1 className="text-3xl font-bold text-[#1e3a5f]">Serious Marriage Matchmaking</h1><p className="text-gray-600 mt-2">Thoughtful profiles and mutual, intentional introductions.</p></header>
    {error && <div role="alert" className="bg-red-50 text-red-800 rounded-lg p-3 mb-4">{error}<button className="ml-3 underline" onClick={() => tab==='profile'?void loadSetup():tab==='discover'?void loadDiscovery():void loadInterests()}>Retry</button></div>}
    {notice && <p role="status" className="bg-emerald-50 text-emerald-800 rounded-lg p-3 mb-4">{notice}</p>}
    <nav className="flex flex-wrap gap-2 mb-6">{([['profile','My Marriage Profile'],['discover','Discover'],['interests','Interests / Introductions']] as const).map(([id,label])=><button key={id} onClick={() => setTab(id)} className={`rounded-lg px-4 py-2 ${tab===id?'bg-[#1e3a5f] text-white':'bg-white text-gray-700'}`}>{label}</button>)}</nav>
    {tab==='profile' && <section className="space-y-5">
      {loading ? <div className="bg-white rounded-xl p-8">Loading your profile…</div> : <>
        {setup?.profile?.status === 'pending_review' && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">Your marriage profile is under review.</p>}
        {setup?.profile?.status === 'approved' && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">Your marriage profile has been approved for matchmaking.</p>}
        {setup?.profile?.status === 'rejected' && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">Your profile needs changes before it can be approved.</p>}
        {setup?.profile?.status === 'hidden' && <p role="status" className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-gray-700">Your marriage profile is currently hidden from matchmaking.</p>}
        <section className="bg-white rounded-xl p-6 shadow-sm"><h2 className="text-xl font-semibold text-[#1e3a5f]">ABOUT YOU</h2><p className="text-sm text-gray-600 mt-2">* Required to submit your marriage profile</p><p className="text-sm text-gray-600">Account identity and current residence come from your account profile.</p>{setup?.account && <p className="text-sm mt-3">Age {setup.account.age ?? 'not set'} · {setup.account.gender ?? 'gender missing'} · {setup.account.city || 'City not set'}, {countryLabel(setup.account.country_code)} · Marriage intention: {setup.account.marriage_intention || 'not set'}</p>}{!setup?.account?.onboarding_completed && <p className="text-amber-800 mt-3">Complete onboarding before submitting for review.</p>}</section>
        <section className="bg-white rounded-xl p-6 shadow-sm space-y-4"><h2 className="font-semibold text-[#1e3a5f]">BACKGROUND & CULTURE</h2><div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-gray-700">Nationality <span className="font-bold text-red-700">*</span><select data-profile-field="nationality_country_code" aria-invalid={Boolean(fieldErrors.nationality_country_code)} value={matchmakingCountryCode(profile.nationality_country_code)} onChange={event=>updateProfile('nationality_country_code',event.target.value||null)} className={`mt-1 w-full rounded-lg border px-3 py-2 ${fieldErrors.nationality_country_code?'border-red-500':'border-gray-200'}`}><option value="">Choose nationality</option>{MATCHMAKING_COUNTRIES.map(country=><option key={country.code} value={country.code}>{country.nationality} ({country.country})</option>)}</select>{fieldErrors.nationality_country_code&&<span className="mt-1 block text-xs text-red-700">{fieldErrors.nationality_country_code}</span>}</label>
          <label className="block text-sm text-gray-700">Country of origin <span className="font-bold text-red-700">*</span><select data-profile-field="country_of_origin_code" aria-invalid={Boolean(fieldErrors.country_of_origin_code)} value={matchmakingCountryCode(profile.country_of_origin_code)} onChange={event=>updateProfile('country_of_origin_code',event.target.value||null)} className={`mt-1 w-full rounded-lg border px-3 py-2 ${fieldErrors.country_of_origin_code?'border-red-500':'border-gray-200'}`}><option value="">Choose country</option>{MATCHMAKING_COUNTRIES.map(country=><option key={country.code} value={country.code}>{country.country}</option>)}</select>{fieldErrors.country_of_origin_code&&<span className="mt-1 block text-xs text-red-700">{fieldErrors.country_of_origin_code}</span>}</label>
          {field('Hometown','hometown')}{field('Languages','languages' as keyof MatchmakingProfile)}
        </div><p className="text-xs text-gray-500">Faith and cultural community are optional. You decide whether to display them or use them for matching.</p><div className="grid gap-4 sm:grid-cols-2">{field('Cultural or ethnic community','cultural_or_ethnic_community')}{field('Religion or faith tradition','religion_or_faith')}{field('Faith practice level','faith_practice_level')}</div>
          <div className="grid gap-3 sm:grid-cols-2 text-sm"><label className="flex gap-2 items-start"><input type="checkbox" checked={Boolean(profile.show_cultural_community)} onChange={event=>updateProfile('show_cultural_community',event.target.checked)} /><span>Show my cultural community on my marriage profile</span></label><label className="flex gap-2 items-start"><input type="checkbox" checked={Boolean(profile.use_cultural_community_for_matching)} onChange={event=>updateProfile('use_cultural_community_for_matching',event.target.checked)} /><span>Use my cultural community preference when finding matches</span></label><label className="flex gap-2 items-start"><input type="checkbox" checked={Boolean(profile.show_religion)} onChange={event=>updateProfile('show_religion',event.target.checked)} /><span>Show my faith on my marriage profile</span></label><label className="flex gap-2 items-start"><input type="checkbox" checked={Boolean(profile.use_religion_for_matching)} onChange={event=>updateProfile('use_religion_for_matching',event.target.checked)} /><span>Use my faith preference when finding matches</span></label></div>
        </section>
        <section className="bg-white rounded-xl p-6 shadow-sm space-y-4"><h2 className="font-semibold text-[#1e3a5f]">EDUCATION & WORK</h2><div className="grid gap-4 sm:grid-cols-2">{field('Education level','education_level','text',true)}{field('Field of study','field_of_study')}{field('Employment status','employment_status','text',true)}{field('Industry / occupation','industry')}</div></section>
        <section className="bg-white rounded-xl p-6 shadow-sm space-y-4"><h2 className="font-semibold text-[#1e3a5f]">MARRIAGE & FAMILY</h2><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm text-gray-700">Marital status <span className="font-bold text-red-700">*</span><select data-profile-field="marital_status" aria-invalid={Boolean(fieldErrors.marital_status)} value={textValue(profile.marital_status)} onChange={event=>updateProfile('marital_status',event.target.value||null)} className={`mt-1 w-full rounded-lg border p-2 ${fieldErrors.marital_status?'border-red-500':'border-gray-200'}`}><option value="">Choose</option><option value="never_married">Never married</option><option value="divorced">Divorced</option><option value="widowed">Widowed</option><option value="separated">Separated</option></select>{fieldErrors.marital_status&&<span className="mt-1 block text-xs text-red-700">{fieldErrors.marital_status}</span>}</label><label className="block text-sm text-gray-700">Do you have children? <span className="font-bold text-red-700">*</span><select data-profile-field="has_children" aria-invalid={Boolean(fieldErrors.has_children)} value={profile.has_children==null?'':String(profile.has_children)} onChange={event=>updateProfile('has_children',event.target.value===''?null:event.target.value==='true')} className={`mt-1 w-full rounded-lg border p-2 ${fieldErrors.has_children?'border-red-500':'border-gray-200'}`}><option value="">Choose</option><option value="false">No</option><option value="true">Yes</option></select>{fieldErrors.has_children&&<span className="mt-1 block text-xs text-red-700">{fieldErrors.has_children}</span>}</label>{field('Number of children','number_of_children','number')}
          <label className="block text-sm text-gray-700">Do your children live with you? <span className="text-xs text-gray-500">Optional</span><select value={profile.children_live_with_me==null?'':String(profile.children_live_with_me)} onChange={event=>updateProfile('children_live_with_me',event.target.value===''?null:event.target.value==='true')} className="mt-1 w-full rounded-lg border p-2"><option value="">Prefer not to say</option><option value="false">No</option><option value="true">Yes</option></select></label>{field('Would you like children in the future?','wants_children','text',true)}{field('Preferred number of children','preferred_number_of_children','number')}</div></section>
        <section className="bg-white rounded-xl p-6 shadow-sm space-y-4"><h2 className="font-semibold text-[#1e3a5f]">LIFESTYLE & FUTURE</h2><div className="grid gap-4 sm:grid-cols-2">{field('Smoking','smoking')}{field('Drinking','drinking')}{field('Exercise','exercise_level')}{field('Social style','social_style')}{field('Interests','interests' as keyof MatchmakingProfile)}{field('Willing to relocate','willing_to_relocate','text',true)}
          <label className="block text-sm text-gray-700">Preferred country to build a home <span className="text-xs text-gray-500">Optional</span><select value={matchmakingCountryCode(profile.preferred_country_to_build_home)} onChange={event=>updateProfile('preferred_country_to_build_home',event.target.value||null)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"><option value="">Choose country</option>{MATCHMAKING_COUNTRIES.map(country=><option key={country.code} value={country.code}>{country.country}</option>)}</select></label>{field('Diaspora return intention','diaspora_return_intention')}{field('Height in cm','height_cm','number')}</div>
          <label className="block text-sm text-gray-700">Introduction <span className="font-bold text-red-700">*</span><textarea data-profile-field="introduction" aria-invalid={Boolean(fieldErrors.introduction)} value={textValue(profile.introduction)} onChange={event=>updateProfile('introduction',event.target.value)} maxLength={3000} rows={4} className={`mt-1 w-full rounded-lg border p-3 ${fieldErrors.introduction?'border-red-500':'border-gray-200'}`} />{fieldErrors.introduction&&<span className="mt-1 block text-xs text-red-700">{fieldErrors.introduction}</span>}</label>
          <label className="inline-flex gap-2 text-sm"><input type="checkbox" checked={Boolean(profile.use_profile_image_for_matchmaking)} onChange={event=>updateProfile('use_profile_image_for_matchmaking',event.target.checked)} />Allow my account profile photo to appear in matchmaking</label>
        </section>
        <section className="bg-white rounded-xl p-6 shadow-sm space-y-6"><div><h2 className="font-semibold text-xl text-[#1e3a5f]">THE SPOUSE YOU SEEK</h2><p className="mt-2 text-sm text-gray-600">Choose what matters to you. Must match filters, Prefer guides discovery, and No preference leaves the choice open.</p></div>
          <section className="rounded-xl border border-gray-100 p-4 sm:p-5 space-y-4"><h3 className="font-semibold text-[#1e3a5f]">ESSENTIALS</h3><div data-profile-field="preferred_partner_gender" aria-invalid={Boolean(fieldErrors.preferred_partner_gender)} tabIndex={-1} className={`rounded-lg border p-3 text-sm ${fieldErrors.preferred_partner_gender?'border-red-500 bg-red-50':'border-gray-200 bg-gray-50'}`}><span className="font-medium text-gray-700">Partner gender <span className="font-bold text-red-700">*</span></span><p className="mt-1">{setup?.account?.gender === 'female' ? 'You are seeking a man.' : setup?.account?.gender === 'male' ? 'You are seeking a woman.' : 'Update your base profile gender to use matchmaking.'}</p>{fieldErrors.preferred_partner_gender&&<span className="mt-1 block text-xs text-red-700">{fieldErrors.preferred_partner_gender}</span>}</div>
            <div className="rounded-lg bg-[#faf6f1] p-4"><p className="block text-sm font-medium text-gray-700">Preferred age <span className="font-bold text-red-700">*</span></p><div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3"><label className="text-xs text-gray-600">Minimum age<input aria-label="Minimum preferred age" aria-invalid={Boolean(fieldErrors.age_min)} data-profile-field="age_min" type="number" min="18" max="100" value={textValue(preferences.age_min)} onChange={event=>updatePreference('age_min',event.target.value?Number(event.target.value):null)} className={`mt-1 w-full rounded-lg border px-3 py-2 ${fieldErrors.age_min?'border-red-500':'border-gray-200'}`} /></label><span className="pt-4 text-sm text-gray-500">to</span><label className="text-xs text-gray-600">Maximum age<input aria-label="Maximum preferred age" aria-invalid={Boolean(fieldErrors.age_max)} data-profile-field="age_max" type="number" min="18" max="100" value={textValue(preferences.age_max)} onChange={event=>updatePreference('age_max',event.target.value?Number(event.target.value):null)} className={`mt-1 w-full rounded-lg border px-3 py-2 ${fieldErrors.age_max?'border-red-500':'border-gray-200'}`} /></label></div>{fieldErrors.age_min&&<p className="mt-1 text-xs text-red-700">{fieldErrors.age_min}</p>}{fieldErrors.age_max&&<p className="mt-1 text-xs text-red-700">{fieldErrors.age_max}</p>}</div>
          </section>
          <section className="rounded-xl border border-gray-100 p-4 sm:p-5 space-y-4"><h3 className="font-semibold text-[#1e3a5f]">LOCATION & BACKGROUND</h3>{preferenceCountries('Preferred nationalities','preferred_nationalities','nationality_mode')}{preferenceCountries('Countries of origin','preferred_origins','origin_mode')}{preferenceCountries('Countries of residence','preferred_residences','residence_mode')}{preferenceTokens('Preferred cities','preferred_cities','city_mode','e.g., Kampala, Kigali')}{preferenceTokens('Preferred languages','preferred_languages','language_mode','e.g., English, Luganda')}</section>
          <section className="rounded-xl border border-gray-100 p-4 sm:p-5 space-y-4"><h3 className="font-semibold text-[#1e3a5f]">EDUCATION & FAITH</h3><p className="text-sm text-gray-600">Faith is a tradition; faith practice describes how actively it is practiced. These choices are optional and self-declared.</p>{preferenceTokens('Education level of the spouse you seek','preferred_education_levels','education_mode',"e.g., Diploma, Bachelor's degree")}{preferenceTokens('Religion / faith tradition of the spouse you seek','preferred_religions','religion_mode')}{preferenceTokens('How practicing would you like your spouse to be?','preferred_faith_practice_levels','faith_practice_mode')}{preferenceTokens('Tribe / ethnic or cultural community of the spouse you seek','preferred_cultural_communities','culture_mode')}</section>
          <section className="rounded-xl border border-gray-100 p-4 sm:p-5 space-y-4"><h3 className="font-semibold text-[#1e3a5f]">MARRIAGE & FAMILY</h3><ChoicePreference label="What marital history are you open to?" value={preferences.preferred_marital_statuses ?? []} options={[{label:'Never married',value:'never_married'},{label:'Divorced',value:'divorced'},{label:'Widowed',value:'widowed'}]} multiple mode={textValue(preferences.marital_status_mode||'open')} onChange={value=>updatePreference('preferred_marital_statuses',value)} onModeChange={value=>updatePreference('marital_status_mode',value)} />
            <ChoicePreference label="Are you open to marrying someone who already has children?" value={preferences.accepts_partner_with_children==null?['no_preference']:[preferences.accepts_partner_with_children?'yes':'no']} options={[{label:'Yes',value:'yes'},{label:'No',value:'no'},{label:'No preference',value:'no_preference'}]} mode={textValue(preferences.children_mode||'open')} onChange={value=>updatePreference('accepts_partner_with_children',value[0]==='yes'?true:value[0]==='no'?false:null)} onModeChange={value=>updatePreference('children_mode',value)} />
            <ChoicePreference label="Would you like your future spouse to want children?" value={preferences.preferred_wants_children ?? []} options={[{label:'Yes',value:'yes'},{label:'No',value:'no'},{label:'Open to discussion',value:'open_to_discussion'}]} mode={textValue(preferences.wants_children_mode||'open')} onChange={value=>updatePreference('preferred_wants_children',value)} onModeChange={value=>updatePreference('wants_children_mode',value)} />
          </section>
          <section className="rounded-xl border border-gray-100 p-4 sm:p-5 space-y-4"><h3 className="font-semibold text-[#1e3a5f]">LIFESTYLE</h3><ChoicePreference label="Are you open to a spouse who smokes?" value={preferences.preferred_smoking ?? []} options={[{label:'Yes',value:'yes'},{label:'No',value:'no'}]} mode={textValue(preferences.smoking_mode||'open')} onChange={value=>updatePreference('preferred_smoking',value)} onModeChange={value=>updatePreference('smoking_mode',value)} /><ChoicePreference label="Are you open to a spouse who drinks alcohol?" value={preferences.preferred_drinking ?? []} options={[{label:'Yes',value:'yes'},{label:'No',value:'no'}]} mode={textValue(preferences.drinking_mode||'open')} onChange={value=>updatePreference('preferred_drinking',value)} onModeChange={value=>updatePreference('drinking_mode',value)} /><ChoicePreference label="Should your future spouse be willing to relocate?" value={preferences.preferred_relocation ?? []} options={[{label:'Yes',value:'yes'},{label:'No',value:'no'}]} mode={textValue(preferences.relocation_mode||'open')} onChange={value=>updatePreference('preferred_relocation',value)} onModeChange={value=>updatePreference('relocation_mode',value)} /><div className="space-y-3 rounded-lg bg-[#faf6f1] p-4"><h4 className="font-medium text-gray-800">Preferred height range</h4><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-gray-700">Minimum height (cm)<input data-profile-field="min_height_cm" aria-invalid={Boolean(fieldErrors.min_height_cm)} type="number" min="120" max="230" value={textValue(preferences.min_height_cm)} onChange={event=>updatePreference('min_height_cm',event.target.value?Number(event.target.value):null)} className={`mt-1 w-full rounded-lg border p-2 ${fieldErrors.min_height_cm?'border-red-500':'border-gray-200'}`} />{fieldErrors.min_height_cm&&<span className="text-xs text-red-700">{fieldErrors.min_height_cm}</span>}</label><label className="text-sm text-gray-700">Maximum height (cm)<input data-profile-field="max_height_cm" aria-invalid={Boolean(fieldErrors.max_height_cm)} type="number" min="120" max="230" value={textValue(preferences.max_height_cm)} onChange={event=>updatePreference('max_height_cm',event.target.value?Number(event.target.value):null)} className={`mt-1 w-full rounded-lg border p-2 ${fieldErrors.max_height_cm?'border-red-500':'border-gray-200'}`} />{fieldErrors.max_height_cm&&<span className="text-xs text-red-700">{fieldErrors.max_height_cm}</span>}</label></div><div className="sm:max-w-sm"><p className="mb-1 text-sm text-gray-700">Height preference</p><PreferenceMode value={textValue(preferences.height_mode||'open')} onChange={value=>updatePreference('height_mode',value)} /></div></div></section>
        </section>
        <div className="sticky bottom-3 z-10 bg-white/95 backdrop-blur rounded-xl border border-gray-200 p-4 shadow-lg flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">Profile completion: {profile.completion_percentage ?? 0}%</p><p className="text-sm text-gray-500">{busy?'Saving…':isDirty?'Unsaved changes':baseline?'Saved':''}</p><p className="text-sm font-medium text-[#1e3a5f]" role="status">{requiredFieldsRemaining ? `${requiredFieldsRemaining} required field${requiredFieldsRemaining === 1 ? '' : 's'} remaining` : 'All required fields completed'}</p><p className="text-xs text-gray-500">Sensitive optional answers do not count toward completion.</p></div><div className="flex gap-3"><Button variant="outline" disabled={busy || !isDirty} onClick={()=>void save()}>{busy?'Saving…':'Save Draft'}</Button><Button disabled={busy || profile.status==='hidden'} onClick={()=>void submit()}>{profile.status==='pending_review'?'Submitted for review':'Submit for review'}</Button></div></div>
      </>}
    </section>}
    {tab==='discover' && <section>{loading ? <div className="bg-white p-8 rounded-xl">Loading eligible profiles…</div> : discovery.length===0 && !error ? <div className="bg-white rounded-2xl p-12 text-center"><h2 className="text-xl text-[#1e3a5f] font-semibold">Discovery is getting ready</h2><p className="text-gray-600 mt-2">Your profile must be complete, approved, and mutually eligible before profiles appear.</p></div> : <><div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">{discovery.map(item=><article key={item.profile_identifier} className="bg-white rounded-xl shadow-sm overflow-hidden">{item.profile_image_url?<img src={item.profile_image_url} alt="" className="w-full h-48 object-cover"/>:<div className="h-48 bg-[#e9e2d8]"/>}<div className="p-5"><p className="text-sm text-gray-500">{item.age} · {item.city ? `${item.city}, ` : ''}{countryLabel(item.country_code)}</p><h3 className="text-xl font-semibold text-[#1e3a5f]">{countryLabel(item.nationality_country_code) || 'Member'}</h3><p className="line-clamp-3 mt-2 text-gray-700">{item.introduction}</p><div className="flex flex-wrap gap-2 mt-4"><Button size="sm" onClick={async()=>{try{setSelected(await getMatchmakingProfile(item.profile_identifier));}catch(cause){setError(errorMessage(cause,'Profile unavailable.'));}}}>View profile</Button><Button size="sm" variant="outline" onClick={async()=>{try{await sendMatchmakingInterest(item.profile_identifier);setNotice('Interest sent.');toast.success('Interest sent.');await loadInterests();}catch(cause){const message=errorMessage(cause,'Could not send interest.');setError(message);toast.error(message);}}}>Interest</Button></div></div></article>)}</div>{hasMoreDiscovery&&<div className="text-center mt-6"><Button variant="outline" disabled={busy} onClick={async()=>{const last=discovery[discovery.length-1];if(!last)return;setBusy(true);try{const rows=await getMatchmakingDiscovery(20,{createdAt:last.created_at,profileIdentifier:last.profile_identifier});setDiscovery(current=>[...current,...rows]);setHasMoreDiscovery(rows.length===20);}catch(cause){setError(errorMessage(cause,'Could not load more profiles.'));}finally{setBusy(false);}}}>{busy?'Loading…':'Load more profiles'}</Button></div>}</>}</section>}
    {tab==='interests' && <section className="bg-white rounded-xl p-6">{loading?<p>Loading introductions…</p>:interests.length===0?<p className="text-gray-600">No interest requests yet.</p>:<div className="space-y-3">{interests.map(item=><article key={item.interest_id} className="border rounded-lg p-4 flex flex-wrap justify-between gap-3"><div><p className="font-semibold">{item.display_name} {item.age?`· ${item.age}`:''}</p><p className="text-sm text-gray-500">{item.direction} · {item.status} · {item.city||countryLabel(item.country_code)}</p>{item.status==='accepted'&&<p className="text-sm text-emerald-700 mt-2">Mutual interest established. Uncle Bashi can guide the next introduction step.</p>}</div><div className="flex gap-2">{item.direction==='incoming'&&item.status==='pending'&&<><Button size="sm" onClick={async()=>{try{await respondMatchmakingInterest(item.interest_id,'accept');await loadInterests();}catch(cause){setError(errorMessage(cause,'Could not accept interest.'));}}}>Accept</Button><Button size="sm" variant="outline" onClick={async()=>{try{await respondMatchmakingInterest(item.interest_id,'decline');await loadInterests();}catch(cause){setError(errorMessage(cause,'Could not decline interest.'));}}}>Decline</Button></>}{item.direction==='outgoing'&&item.status==='pending'&&<Button size="sm" variant="outline" onClick={async()=>{try{await withdrawMatchmakingInterest(item.interest_id);await loadInterests();}catch(cause){setError(errorMessage(cause,'Could not withdraw interest.'));}}}>Withdraw</Button>}</div></article>)}</div>}</section>}
  </div></main>;
};
