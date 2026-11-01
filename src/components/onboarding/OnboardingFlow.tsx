import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useUserSync } from '@/hooks/useUserSync';
import { Button } from '@/components/ui/button';
import { StepProgress } from '@/components/ui/ProgressBar';
import { MATCHMAKING_COUNTRIES } from '@/types/matchmaking';
import type { JourneyType } from '@/types/journey';
import { JOURNEY_LABELS } from '@/types/journey';
import { LogOutIcon } from '@/components/ui/Icons';
import { supabase } from '@/lib/supabase';

type CoreDraft = {
  displayName: string;
  dateOfBirth: string;
  gender: '' | 'male' | 'female';
  nationalityCountryCode: string;
  countryOfOriginCode: string;
  countryCode: string;
  city: string;
  primaryLanguage: string;
  otherLanguages: string[];
  legalMaritalStatus: string;
  relationshipSituation: string;
  primaryReasonForJoining: JourneyType | '';
};

const emptyDraft: CoreDraft = {
  displayName: '', dateOfBirth: '', gender: '', nationalityCountryCode: '',
  countryOfOriginCode: '', countryCode: '', city: '', primaryLanguage: '',
  otherLanguages: [], legalMaritalStatus: '', relationshipSituation: '', primaryReasonForJoining: '',
};

const journeyDetails: Array<{ type: JourneyType; description: string }> = [
  { type: 'marriage_education', description: 'Learn about love, relationships, marriage and family life.' },
  { type: 'marriage_preparation', description: 'Build knowledge and readiness for a future marriage.' },
  { type: 'matchmaking', description: 'Activate Uncle Bashi Marriage Matching.' },
  { type: 'marriage_support', description: 'Education and support for an existing marriage.' },
  { type: 'coaching', description: 'Practical guidance and structured support.' },
  { type: 'counselling', description: 'Connect to emotional, relationship, family or couples support.' },
];

const legalStatuses = [
  ['never_married', 'Never married'], ['married', 'Married'], ['divorced', 'Divorced'],
  ['widowed', 'Widowed'], ['separated', 'Separated'], ['annulled', 'Marriage annulled'],
  ['prefer_to_discuss', 'Prefer to discuss'],
];
const relationshipStatuses = [
  ['single', 'Single'], ['committed_relationship', 'In a committed relationship'],
  ['engaged', 'Engaged'], ['married', 'Married'], ['separated', 'Separated'],
  ['prefer_to_discuss', 'Prefer to discuss'],
];
const totalSteps = 6;

function initialDraft(stored: Record<string, unknown>, user: ReturnType<typeof useAppStore.getState>['user']): CoreDraft {
  if (stored._flowVersion === 'core_v2') {
    const saved = { ...emptyDraft, ...stored } as CoreDraft;
    return {
      ...saved,
      gender: saved.gender === 'male' || saved.gender === 'female' ? saved.gender : '',
      primaryReasonForJoining: saved.primaryReasonForJoining || '',
      otherLanguages: Array.isArray(saved.otherLanguages)
        ? saved.otherLanguages.filter((value): value is string => typeof value === 'string')
        : [],
    };
  }
  return {
    ...emptyDraft,
    displayName: user?.displayName || user?.fullName || '',
    dateOfBirth: user?.dateOfBirth || '',
    gender: user?.gender === 'male' || user?.gender === 'female' ? user.gender : '',
    nationalityCountryCode: user?.nationalityCountryCode || '',
    countryOfOriginCode: user?.countryOfOriginCode || '',
    countryCode: user?.countryCode || '',
    city: user?.city || '',
    primaryLanguage: user?.primaryLanguage || '',
    otherLanguages: user?.otherLanguages || [],
    legalMaritalStatus: user?.legalMaritalStatus || '',
    relationshipSituation: user?.relationshipSituation || '',
    primaryReasonForJoining: user?.primaryReasonForJoining as JourneyType || '',
  };
}

const isAdult = (dateValue: string): boolean => {
  if (!dateValue) return false;
  const birthDate = new Date(`${dateValue}T00:00:00`);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 18);
  return Number.isFinite(birthDate.getTime()) && birthDate <= cutoff;
};

export const OnboardingFlow: React.FC = () => {
  const user = useAppStore((state) => state.user);
  const storedOnboardingData = useAppStore((state) => state.onboardingData);
  const setOnboardingData = useAppStore((state) => state.setOnboardingData);
  const updateUser = useAppStore((state) => state.updateUser);
  const setJourneys = useAppStore((state) => state.setJourneys);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const { syncOnboardingData, completeCoreOnboardingV2 } = useUserSync();
  const initial = useMemo(() => initialDraft(storedOnboardingData, user), [storedOnboardingData, user]);
  const [draft, setDraft] = useState<CoreDraft>(initial);
  const [currentStep, setCurrentStep] = useState(() => {
    const step = storedOnboardingData._flowVersion === 'core_v2' ? storedOnboardingData._currentStep : 0;
    return typeof step === 'number' && Number.isInteger(step) ? Math.max(0, Math.min(step, totalSteps - 1)) : 0;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hasEdited, setHasEdited] = useState(storedOnboardingData._flowVersion === 'core_v2');
  const [error, setError] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  const matchmakingEligible = ['never_married', 'divorced', 'widowed', 'annulled'].includes(draft.legalMaritalStatus)
    && draft.relationshipSituation === 'single';
  const supportEligible = ['married', 'separated'].includes(draft.legalMaritalStatus)
    || ['married', 'separated'].includes(draft.relationshipSituation);

  useEffect(() => {
    setOnboardingData({});
  }, [setOnboardingData]);

  useEffect(() => {
    if (!hasEdited) return;
    const snapshot = { ...draft, _flowVersion: 'core_v2', _currentStep: currentStep };
    setOnboardingData(snapshot);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      saveQueue.current = saveQueue.current.catch(() => undefined).then(() => syncOnboardingData(snapshot));
      void saveQueue.current.catch((saveError: unknown) => {
        setError(saveError instanceof Error ? saveError.message : 'Could not save your progress.');
      });
    }, 1000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [currentStep, draft, hasEdited, setOnboardingData, syncOnboardingData]);

  const updateDraft = <K extends keyof CoreDraft>(key: K, value: CoreDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setHasEdited(true);
    setError('');
  };

  const stepIsValid = (): boolean => {
    if (currentStep === 1) return Boolean(draft.displayName.trim() && isAdult(draft.dateOfBirth) && draft.gender);
    if (currentStep === 2) return Boolean(
      draft.nationalityCountryCode && draft.countryOfOriginCode && draft.countryCode
      && draft.city.trim() && draft.primaryLanguage.trim(),
    );
    if (currentStep === 3) return Boolean(draft.legalMaritalStatus && draft.relationshipSituation);
    if (currentStep === 4) {
      return Boolean(draft.primaryReasonForJoining)
        && (draft.primaryReasonForJoining !== 'matchmaking' || matchmakingEligible)
        && (draft.primaryReasonForJoining !== 'marriage_support' || supportEligible);
    }
    return true;
  };

  const handleNext = () => {
    if (!stepIsValid()) {
      setError('Complete the required fields on this screen to continue.');
      return;
    }
    setError('');
    setCurrentStep((step) => Math.min(totalSteps - 1, step + 1));
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setError('');
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await saveQueue.current.catch(() => undefined);
      if (hasEdited) {
        await syncOnboardingData({ ...draft, _flowVersion: 'core_v2', _currentStep: currentStep });
      }
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out. Please try again.');
      setIsSigningOut(false);
    }
  };

  const handleComplete = async () => {
    if (isSaving || !draft.primaryReasonForJoining || !stepIsValid()) return;
    setIsSaving(true);
    setError('');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await saveQueue.current.catch(() => undefined);
      const completedAt = new Date().toISOString();
      const onboardingData = {
        ...draft,
        _flowVersion: 'core_v2',
        _currentStep: totalSteps,
        _completed: true,
        _completedAt: completedAt,
      };
      const completed = await completeCoreOnboardingV2({
        onboardingData,
        displayName: draft.displayName.trim(),
        dateOfBirth: draft.dateOfBirth,
        gender: draft.gender as 'male' | 'female',
        nationalityCountryCode: draft.nationalityCountryCode,
        countryOfOriginCode: draft.countryOfOriginCode,
        countryCode: draft.countryCode,
        city: draft.city.trim(),
        primaryLanguage: draft.primaryLanguage.trim(),
        otherLanguages: draft.otherLanguages.map((value) => value.trim()).filter(Boolean),
        legalMaritalStatus: draft.legalMaritalStatus,
        relationshipSituation: draft.relationshipSituation,
        primaryReasonForJoining: draft.primaryReasonForJoining,
      });
      updateUser({
        fullName: completed.displayName,
        displayName: completed.displayName,
        dateOfBirth: completed.dateOfBirth,
        gender: completed.gender,
        nationalityCountryCode: completed.nationalityCountryCode,
        countryOfOriginCode: completed.countryOfOriginCode,
        countryCode: completed.countryCode,
        city: completed.city,
        primaryLanguage: completed.primaryLanguage,
        otherLanguages: completed.otherLanguages,
        legalMaritalStatus: completed.legalMaritalStatus,
        relationshipSituation: completed.relationshipSituation,
        primaryReasonForJoining: completed.primaryReasonForJoining,
        onboardingCompleted: true,
        onboardingStep: 10,
      });
      setJourneys([completed.journey]);
      setOnboardingData(onboardingData);
      const destinations: Record<JourneyType, string> = {
        marriage_education: 'education',
        marriage_preparation: 'education',
        matchmaking: 'matchmaking',
        marriage_support: 'home',
        coaching: 'coaching',
        counselling: 'counselling',
      };
      setCurrentView(destinations[completed.primaryReasonForJoining], { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete setup. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const countrySelect = (label: string, value: string, onChange: (value: string) => void) => (
    <label className="block text-sm font-medium text-gray-700">
      {label} <span aria-hidden="true" className="text-red-700">*</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">
        <option value="">Choose a country</option>
        {MATCHMAKING_COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.country} ({country.code})</option>)}
      </select>
    </label>
  );

  const renderStep = () => {
    if (currentStep === 0) return <div className="text-center py-4">
      <h2 className="text-2xl font-bold text-[#1e3a5f]">Welcome to Uncle Bashi</h2>
      <p className="mx-auto mt-3 max-w-lg text-gray-600">Let's set up your account and understand how we can support you.</p>
      <p className="mt-6 text-sm text-gray-500">Your information helps us connect you with relevant learning and support.</p>
    </div>;

    if (currentStep === 1) return <section className="space-y-4">
      <h2 className="text-xl font-bold text-[#1e3a5f]">About You</h2>
      <label className="block text-sm font-medium text-gray-700">Name you would like us to use *<input required autoComplete="name" value={draft.displayName} onChange={(event) => updateDraft('displayName', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
      <label className="block text-sm font-medium text-gray-700">Date of birth *<input required type="date" value={draft.dateOfBirth} onChange={(event) => updateDraft('dateOfBirth', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /><span className="mt-1 block text-xs font-normal text-gray-500">You must be at least 18 to create an account.</span></label>
      <fieldset><legend className="mb-2 text-sm font-medium text-gray-700">Gender *</legend><div className="flex gap-3">{(['female', 'male'] as const).map((gender) => <button type="button" key={gender} aria-pressed={draft.gender === gender} onClick={() => updateDraft('gender', gender)} className={`flex-1 rounded-lg border px-4 py-2.5 capitalize ${draft.gender === gender ? 'border-[#c4785a] bg-[#faf6f1] text-[#1e3a5f]' : 'border-gray-300'}`}>{gender}</button>)}</div></fieldset>
    </section>;

    if (currentStep === 2) return <section className="space-y-4">
      <h2 className="text-xl font-bold text-[#1e3a5f]">Background & Residence</h2>
      <p className="text-sm text-gray-600">Country and city are enough; no exact address or GPS is needed.</p>
      {countrySelect('Nationality', draft.nationalityCountryCode, (value) => updateDraft('nationalityCountryCode', value))}
      {countrySelect('Country of origin', draft.countryOfOriginCode, (value) => updateDraft('countryOfOriginCode', value))}
      {countrySelect('Current country', draft.countryCode, (value) => updateDraft('countryCode', value))}
      <label className="block text-sm font-medium text-gray-700">City or town *<input required autoComplete="address-level2" value={draft.city} onChange={(event) => updateDraft('city', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
      <label className="block text-sm font-medium text-gray-700">Primary language *<input required value={draft.primaryLanguage} onChange={(event) => updateDraft('primaryLanguage', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" placeholder="e.g., English, Luganda" /></label>
      <label className="block text-sm font-medium text-gray-700">Other languages <span className="font-normal text-gray-500">(Optional)</span><input value={draft.otherLanguages.join(', ')} onChange={(event) => updateDraft('otherLanguages', event.target.value.split(/[,;]/).map((value) => value.trim()).filter(Boolean))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" placeholder="e.g., Swahili, Runyankole" /></label>
    </section>;

    if (currentStep === 3) return <section className="space-y-4">
      <h2 className="text-xl font-bold text-[#1e3a5f]">Your Current Situation</h2>
      <p className="text-sm text-gray-600">Legal marital status and current relationship situation are different, so we ask about them separately.</p>
      <label className="block text-sm font-medium text-gray-700">Legal marital status *<select value={draft.legalMaritalStatus} onChange={(event) => updateDraft('legalMaritalStatus', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="">Choose one</option>{legalStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block text-sm font-medium text-gray-700">Current relationship situation *<select value={draft.relationshipSituation} onChange={(event) => updateDraft('relationshipSituation', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="">Choose one</option>{relationshipStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </section>;

    if (currentStep === 4) return <section className="space-y-4">
      <h2 className="text-xl font-bold text-[#1e3a5f]">How Can Uncle Bashi Help You?</h2>
      <p className="text-sm text-gray-600">Choose one initial primary journey. You can activate additional journeys later.</p>
      <div className="space-y-3">{journeyDetails.map(({ type, description }) => {
        const unavailable = (type === 'matchmaking' && !matchmakingEligible) || (type === 'marriage_support' && !supportEligible);
        const reason = type === 'matchmaking'
          ? 'Marriage Matching is available when your legal status is never married, divorced, widowed or annulled, and your current relationship situation is single.'
          : 'Marriage Support is available when you indicate a married or separated situation.';
        return <button type="button" key={type} disabled={unavailable} aria-pressed={draft.primaryReasonForJoining === type} onClick={() => updateDraft('primaryReasonForJoining', type)} className={`w-full rounded-xl border-2 p-4 text-left ${unavailable ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-75' : draft.primaryReasonForJoining === type ? 'border-[#c4785a] bg-[#faf6f1]' : 'border-gray-200 hover:border-gray-300'}`}>
          <span className="font-semibold text-[#1e3a5f]">{JOURNEY_LABELS[type]}</span><span className="mt-1 block text-sm text-gray-600">{description}</span>
          {unavailable && <span className="mt-2 block text-xs text-gray-600">{reason}</span>}
        </button>;
      })}</div>
    </section>;

    return <section className="space-y-4">
      <h2 className="text-xl font-bold text-[#1e3a5f]">Review & Complete</h2>
      <div className="rounded-xl bg-[#faf6f1] p-4"><h3 className="font-semibold text-[#1e3a5f]">About you</h3><p className="mt-2 text-sm text-gray-700">{draft.displayName} · {draft.dateOfBirth} · {draft.gender}</p><p className="text-sm text-gray-700">{draft.nationalityCountryCode} nationality · from {draft.countryOfOriginCode} · living in {draft.city}, {draft.countryCode}</p><p className="text-sm text-gray-700">Primary language: {draft.primaryLanguage}</p></div>
      <div className="rounded-xl bg-[#faf6f1] p-4"><h3 className="font-semibold text-[#1e3a5f]">Current situation</h3><p className="mt-2 text-sm text-gray-700">{legalStatuses.find(([value]) => value === draft.legalMaritalStatus)?.[1]} · {relationshipStatuses.find(([value]) => value === draft.relationshipSituation)?.[1]}</p></div>
      <div className="rounded-xl bg-[#faf6f1] p-4"><h3 className="font-semibold text-[#1e3a5f]">Initial primary journey</h3><p className="mt-2 text-sm text-gray-700">{draft.primaryReasonForJoining ? JOURNEY_LABELS[draft.primaryReasonForJoining] : ''}</p></div>
      <p className="text-sm text-gray-600">Complete Setup saves your profile and activates this journey.</p>
    </section>;
  };

  return <div className="min-h-screen bg-[#faf6f1] px-4 py-8">
    <div className="relative mx-auto max-w-2xl">
      <div className="absolute right-0 top-0"><Button type="button" variant="ghost" size="sm" isLoading={isSigningOut} disabled={isSaving} onClick={() => void handleSignOut()}>{isSigningOut ? 'Signing out…' : 'Sign out'}{!isSigningOut && <LogOutIcon size={16} className="ml-2" />}</Button></div>
      <header className="mb-8 pt-10 text-center"><h1 className="text-2xl font-bold text-[#1e3a5f]">Welcome to Uncle Bashi</h1><p className="mt-2 text-gray-600">Let's set up your account and understand how we can support you.</p><p className="mt-3 text-xs text-gray-500">Your progress saves automatically.</p></header>
      <div className="mb-8"><StepProgress currentStep={currentStep} totalSteps={totalSteps} /></div>
      <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm lg:p-8">{renderStep()}</div>
      <div className="flex items-center justify-between"><Button variant="ghost" disabled={currentStep === 0 || isSaving} onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}>Back</Button>{currentStep === totalSteps - 1 ? <Button disabled={isSaving || !stepIsValid()} isLoading={isSaving} onClick={() => void handleComplete()}>Complete Setup</Button> : <Button disabled={!stepIsValid() || isSigningOut} onClick={handleNext}>Continue</Button>}</div>
      {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
    </div>
  </div>;
};

export default OnboardingFlow;
