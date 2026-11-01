import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { saveCoreProfile, type CoreProfileDraft } from '@/lib/coreProfileService';
import { getMyJourneys } from '@/lib/journeyService';
import { MATCHMAKING_COUNTRIES } from '@/types/matchmaking';

const emptyProfile: CoreProfileDraft = {
  display_name: '', nationality_country_code: '', country_of_origin_code: '', country_code: '', city: '',
  primary_language: '', other_languages: [], legal_marital_status: '', relationship_situation: '',
};

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

export const CoreProfileEditor: React.FC = () => {
  const user = useAppStore((state) => state.user);
  const updateUser = useAppStore((state) => state.updateUser);
  const setJourneys = useAppStore((state) => state.setJourneys);
  const [draft, setDraft] = useState<CoreProfileDraft>(emptyProfile);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft({
      display_name: user?.displayName || user?.fullName || '',
      nationality_country_code: user?.nationalityCountryCode || '',
      country_of_origin_code: user?.countryOfOriginCode || '',
      country_code: user?.countryCode || '',
      city: user?.city || '',
      primary_language: user?.primaryLanguage || '',
      other_languages: user?.otherLanguages || [],
      legal_marital_status: user?.legalMaritalStatus || '',
      relationship_situation: user?.relationshipSituation || '',
    });
  }, [user]);

  const update = <K extends keyof CoreProfileDraft>(key: K, value: CoreProfileDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice('');
    setError('');
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await saveCoreProfile(draft);
      updateUser({
        displayName: saved.display_name,
        nationalityCountryCode: saved.nationality_country_code,
        countryOfOriginCode: saved.country_of_origin_code,
        countryCode: saved.country_code,
        city: saved.city,
        primaryLanguage: saved.primary_language,
        otherLanguages: saved.other_languages,
        legalMaritalStatus: saved.legal_marital_status,
        relationshipSituation: saved.relationship_situation,
      });
      setDraft(saved);
      setNotice('Core profile saved.');
      try {
        setJourneys(await getMyJourneys());
      } catch {
        setError('Core profile saved, but your journeys could not be refreshed. Please reload this page.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your core profile.');
    } finally {
      setSaving(false);
    }
  };

  const countrySelect = (label: string, key: 'nationality_country_code' | 'country_of_origin_code' | 'country_code') => (
    <label className="block text-sm font-medium text-gray-700">{label}
      <select required value={draft[key]} onChange={(event) => update(key, event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">
        <option value="">Choose a country</option>
        {!MATCHMAKING_COUNTRIES.some((country) => country.code === draft[key]) && draft[key] && <option value={draft[key]}>{draft[key]} (saved country code)</option>}
        {MATCHMAKING_COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.country} ({country.code})</option>)}
      </select>
    </label>
  );

  return <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm" aria-labelledby="core-profile-heading">
    <h2 id="core-profile-heading" className="text-xl font-bold text-[#1e3a5f]">Core Profile</h2>
    <p className="mt-1 text-sm text-gray-600">Keep your identity, background and current situation up to date.</p>
    <form onSubmit={(event) => void handleSave(event)} className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-medium text-gray-700 sm:col-span-2">Display name<input required value={draft.display_name} onChange={(event) => update('display_name', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
      {countrySelect('Nationality', 'nationality_country_code')}
      {countrySelect('Country of origin', 'country_of_origin_code')}
      {countrySelect('Current country', 'country_code')}
      <label className="block text-sm font-medium text-gray-700">City or town<input required value={draft.city} onChange={(event) => update('city', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
      <label className="block text-sm font-medium text-gray-700">Primary language<input required value={draft.primary_language} onChange={(event) => update('primary_language', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" /></label>
      <label className="block text-sm font-medium text-gray-700">Other languages (optional)<input value={draft.other_languages.join(', ')} onChange={(event) => update('other_languages', event.target.value.split(/[,;]/).map((value) => value.trim()).filter(Boolean))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5" placeholder="e.g., English, Luganda" /></label>
      <label className="block text-sm font-medium text-gray-700">Legal marital status<select required value={draft.legal_marital_status} onChange={(event) => update('legal_marital_status', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="">Choose one</option>{legalStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block text-sm font-medium text-gray-700">Current relationship situation<select required value={draft.relationship_situation} onChange={(event) => update('relationship_situation', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"><option value="">Choose one</option>{relationshipStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><Button type="submit" disabled={saving} isLoading={saving}>Save Core Profile</Button>{notice && <span className="text-sm text-emerald-700" role="status">{notice}</span>}{error && <span className="text-sm text-red-700" role="alert">{error}</span>}</div>
    </form>
  </section>;
};

export default CoreProfileEditor;
