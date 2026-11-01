import { supabase } from '@/lib/supabase';
import type {
  MatchmakingAdminProfile, MatchmakingAdminProfileDetail, MatchmakingAdminReport, MatchmakingAdminReviewHistory, MatchmakingDiscoveryProfile,
  MatchmakingDetailProfile, MatchmakingInterest, MatchmakingProfile, MatchmakingPreferences, MatchmakingSetup,
} from '@/types/matchmaking';
import { MATCHMAKING_COUNTRIES } from '@/types/matchmaking';

async function requireSession(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.user.id) throw new Error('Sign in to use Matchmaking.');
}
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  await requireSession();
  const { data, error } = await supabase.rpc(name, args as never);
  if (error) throw new Error(error.message || `Matchmaking request failed (${name}).`);
  return data as T;
}
export const getMyMatchmakingSetup = () => rpc<MatchmakingSetup>('get_my_matchmaking_setup');

const countryAliases: Record<string, string> = {
  UGANDA: 'UG', UGANDAN: 'UG',
  KENYA: 'KE', KENYAN: 'KE',
  RWANDA: 'RW', RWANDAN: 'RW',
  BURUNDI: 'BI', BURUNDIAN: 'BI',
  TANZANIA: 'TZ', TANZANIAN: 'TZ',
  'SOUTH SUDAN': 'SS', 'SOUTH SUDANESE': 'SS',
  ETHIOPIA: 'ET', ETHIOPIAN: 'ET',
  NIGERIA: 'NG', NIGERIAN: 'NG',
  'SOUTH AFRICA': 'ZA', 'SOUTH AFRICAN': 'ZA',
  CANADA: 'CA', CANADIAN: 'CA',
  'UNITED STATES': 'US', 'UNITED STATES OF AMERICA': 'US', AMERICAN: 'US',
  'UNITED KINGDOM': 'GB', BRITAIN: 'GB', BRITISH: 'GB',
  AUSTRALIA: 'AU', AUSTRALIAN: 'AU',
  GERMANY: 'DE', GERMAN: 'DE',
  FRANCE: 'FR', FRENCH: 'FR',
  IRELAND: 'IE', IRISH: 'IE',
  NETHERLANDS: 'NL', DUTCH: 'NL',
  SWEDEN: 'SE', SWEDISH: 'SE',
};

function normalizeCountryCode(value: unknown, field: string): string | null {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  if (typeof value !== 'string') throw new Error(`${field} must be a two-letter country code.`);
  const normalized = value.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;
  const alias = countryAliases[normalized];
  if (alias && MATCHMAKING_COUNTRIES.some(country => country.code === alias)) return alias;
  throw new Error(`Choose a country from the list for ${field.toLowerCase()}.`);
}

const nullableProfileTextFields = [
  'physical_self_description', 'occupation', 'financial_readiness', 'religion_or_faith', 'faith_practice_level',
  'faith_importance', 'denomination_or_tradition', 'faith_expectations', 'cultural_or_ethnic_community',
  'clan_or_region', 'family_background', 'family_involvement', 'education_level', 'field_of_study',
  'employment_status', 'wants_children', 'smoking', 'drinking', 'willing_to_relocate', 'marriage_timeline',
  'marriage_structure', 'long_distance_openness', 'provider_model', 'family_in_law_expectations',
  'introduction', 'marriage_vision_response',
] as const;
const optionalIntegerFields = ['height_cm', 'number_of_children'] as const;

function normalizeOptionalInteger(value: unknown, field: string): number | null {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number)) {
    throw new Error(`${field.replace(/_/g, ' ')} must be a whole number or left blank.`);
  }
  return number;
}

function normalizeProfilePayload(profile: Partial<MatchmakingProfile>): Partial<MatchmakingProfile> {
  const payload = pickFields(profile, profileFields) as Record<string, unknown>;
  for (const field of nullableProfileTextFields) {
    const value = payload[field];
    if (typeof value === 'string') payload[field] = value.trim() || null;
  }
  for (const field of optionalIntegerFields) {
    payload[field] = normalizeOptionalInteger(payload[field], field);
  }
  return payload as Partial<MatchmakingProfile>;
}
function normalizePreferencesPayload(preferences: Partial<MatchmakingPreferences>): Partial<MatchmakingPreferences> {
  const payload = pickFields(preferences, preferenceFields) as Record<string, unknown>;
  if (Array.isArray(payload.preferred_residences)) {
    payload.preferred_residences = (payload.preferred_residences as unknown[])
      .filter(value => typeof value === 'string' && value.trim() !== '')
      .map(value => normalizeCountryCode(value, 'Current residence preference'));
  }
  for (const field of ['age_min', 'age_max']) {
    if (field in payload) payload[field] = normalizeOptionalInteger(payload[field], field);
  }
  return payload as Partial<MatchmakingPreferences>;
}
const profileFields = [
  'height_cm','physical_self_description','occupation','education_level','field_of_study','employment_status','financial_readiness',
  'religion_or_faith','faith_practice_level','faith_importance','denomination_or_tradition','faith_expectations','show_religion','use_religion_for_matching',
  'cultural_or_ethnic_community','show_cultural_community','use_cultural_community_for_matching','clan_or_region','show_clan_or_region',
  'family_background','family_involvement','has_children','number_of_children','children_live_with_me','wants_children','smoking','drinking',
  'marriage_timeline','marriage_structure','willing_to_relocate','long_distance_openness','provider_model','family_in_law_expectations',
  'introduction','marriage_vision_response','use_profile_image_for_matchmaking',
] as const;
const preferenceFields = [
  'age_min','age_max','preferred_residences','residence_mode','preferred_religions','religion_mode',
  'preferred_marital_statuses','marital_status_mode','preferred_children_statuses','children_mode',
  'preferred_wants_children','wants_children_mode','preferred_relocation','relocation_mode',
] as const;
function pickFields<T extends object>(value: T, fields: readonly string[]): Partial<T> {
  return Object.fromEntries(fields.filter(key => key in value).map(key => [key, (value as Record<string, unknown>)[key]])) as Partial<T>;
}
export const saveMatchmakingProfile = (profile: Partial<MatchmakingProfile>) =>
  rpc<MatchmakingProfile>('save_matchmaking_profile', { p_profile: normalizeProfilePayload(profile) });
export const saveMatchmakingPreferences = (preferences: Partial<MatchmakingPreferences>) =>
  rpc<MatchmakingPreferences>('save_matchmaking_preferences', {
    p_preferences: normalizePreferencesPayload(preferences),
  });
export const submitMatchmakingProfile = () => rpc<MatchmakingProfile>('submit_matchmaking_profile');
export const getMatchmakingDiscovery = (
  limit = 20,
  cursor?: { createdAt: string; profileIdentifier: string },
) => rpc<MatchmakingDiscoveryProfile[]>('get_matchmaking_discovery', {
  p_limit: limit,
  p_cursor_created_at: cursor?.createdAt ?? null,
  p_cursor_user_id: cursor?.profileIdentifier ?? null,
});
export const getMatchmakingProfile = (profileIdentifier: string) =>
  rpc<MatchmakingDetailProfile>('get_matchmaking_profile', { p_profile_identifier: profileIdentifier });
export const sendMatchmakingInterest = (profileIdentifier: string) =>
  rpc<{ id: string; status: 'pending' | 'accepted'; created_at: string }[]>('send_matchmaking_interest', { p_profile_identifier: profileIdentifier });
export const respondMatchmakingInterest = (interestId: string, decision: 'accept' | 'decline') =>
  rpc<string>('respond_matchmaking_interest', { p_interest_id: interestId, p_decision: decision });
export const withdrawMatchmakingInterest = (interestId: string) =>
  rpc<boolean>('withdraw_matchmaking_interest', { p_interest_id: interestId });
export const getMyMatchmakingInterests = () => rpc<MatchmakingInterest[]>('get_my_matchmaking_interests');
export const blockMatchmakingProfile = (profileIdentifier: string) =>
  rpc<boolean>('block_matchmaking_profile', { p_profile_identifier: profileIdentifier });
export const reportMatchmakingProfile = (
  profileIdentifier: string,
  reason: string,
  details?: string,
) => rpc<string>('report_matchmaking_profile', { p_profile_identifier: profileIdentifier, p_reason: reason, p_details: details ?? null });
export const getMatchmakingAdminQueue = () => rpc<MatchmakingAdminProfile[]>('get_matchmaking_admin_queue');
export const getMatchmakingAdminProfileDetail = (userId: string) =>
  rpc<MatchmakingAdminProfileDetail>('get_matchmaking_admin_profile_detail', { p_profile_user_id: userId });
export const getMatchmakingAdminReviewHistory = () => rpc<MatchmakingAdminReviewHistory[]>('get_matchmaking_admin_review_history');
export const getMatchmakingAdminReports = () => rpc<MatchmakingAdminReport[]>('get_matchmaking_admin_reports');
export const reviewMatchmakingProfile = (userId: string, action: 'approve' | 'reject' | 'hide', notes?: string) =>
  rpc<MatchmakingProfile>('review_matchmaking_profile', { p_profile_user_id: userId, p_action: action, p_notes: notes ?? null });
export const reviewMatchmakingReport = (reportId: string, status: 'reviewed' | 'dismissed' | 'actioned', notes?: string) =>
  rpc<string>('review_matchmaking_report', { p_report_id: reportId, p_status: status, p_notes: notes ?? null });

