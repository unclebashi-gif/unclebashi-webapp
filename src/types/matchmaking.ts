export type MatchmakingProfileStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'hidden';
export type PreferenceMode = 'required' | 'preferred' | 'open';
export type MatchmakingInterestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';
export type MatchmakingReportReason =
  | 'fake_profile' | 'harassment' | 'married_or_unavailable' | 'sexual_solicitation'
  | 'fraud_scam' | 'abusive_conduct' | 'inappropriate_photo' | 'other';
export type MatchmakingReportStatus = 'pending' | 'reviewed' | 'dismissed' | 'actioned';

export const MATCHMAKING_COUNTRIES = [
  { code: 'UG', country: 'Uganda', nationality: 'Ugandan' },
  { code: 'KE', country: 'Kenya', nationality: 'Kenyan' },
  { code: 'RW', country: 'Rwanda', nationality: 'Rwandan' },
  { code: 'BI', country: 'Burundi', nationality: 'Burundian' },
  { code: 'TZ', country: 'Tanzania', nationality: 'Tanzanian' },
  { code: 'SS', country: 'South Sudan', nationality: 'South Sudanese' },
  { code: 'ET', country: 'Ethiopia', nationality: 'Ethiopian' },
  { code: 'NG', country: 'Nigeria', nationality: 'Nigerian' },
  { code: 'ZA', country: 'South Africa', nationality: 'South African' },
  { code: 'CA', country: 'Canada', nationality: 'Canadian' },
  { code: 'US', country: 'United States', nationality: 'American' },
  { code: 'GB', country: 'United Kingdom', nationality: 'British' },
  { code: 'AU', country: 'Australia', nationality: 'Australian' },
  { code: 'DE', country: 'Germany', nationality: 'German' },
  { code: 'FR', country: 'France', nationality: 'French' },
  { code: 'IE', country: 'Ireland', nationality: 'Irish' },
  { code: 'NL', country: 'Netherlands', nationality: 'Dutch' },
  { code: 'SE', country: 'Sweden', nationality: 'Swedish' },
] as const;

export function matchmakingCountryCode(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toUpperCase();
  const country = MATCHMAKING_COUNTRIES.find(item =>
    item.code === normalized || item.country.toUpperCase() === normalized || item.nationality.toUpperCase() === normalized,
  );
  return country?.code ?? (/^[A-Z]{2}$/.test(normalized) ? normalized : '');
}

export interface MatchmakingProfile {
  id: string;
  user_id: string;
  profile_version: number;
  nationality_country_code: string | null;
  country_of_origin_code: string | null;
  hometown: string | null;
  languages: string[];
  height_cm: number | null;
  physical_self_description: string | null;
  occupation: string | null;
  financial_readiness: string | null;
  cultural_or_ethnic_community: string | null;
  clan_or_region: string | null;
  show_clan_or_region: boolean;
  family_background: string | null;
  family_involvement: string | null;
  show_cultural_community: boolean;
  use_cultural_community_for_matching: boolean;
  religion_or_faith: string | null;
  faith_practice_level: string | null;
  faith_importance: string | null;
  denomination_or_tradition: string | null;
  faith_expectations: string | null;
  show_religion: boolean;
  use_religion_for_matching: boolean;
  education_level: string | null;
  field_of_study: string | null;
  employment_status: string | null;
  industry: string | null;
  marital_status: 'never_married' | 'divorced' | 'widowed' | 'separated' | 'annulled' | null;
  has_children: boolean | null;
  number_of_children: number | null;
  children_live_with_me: boolean | null;
  wants_children: string | null;
  preferred_number_of_children: number | null;
  smoking: string | null;
  drinking: string | null;
  exercise_level: string | null;
  social_style: string | null;
  interests: string[];
  willing_to_relocate: string | null;
  marriage_timeline: string | null;
  marriage_structure: string | null;
  long_distance_openness: string | null;
  provider_model: string | null;
  family_in_law_expectations: string | null;
  preferred_country_to_build_home: string | null;
  diaspora_return_intention: string | null;
  introduction: string | null;
  marriage_vision_response: string | null;
  use_profile_image_for_matchmaking: boolean;
  completion_percentage: number;
  status: MatchmakingProfileStatus;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatchmakingPreferences {
  user_id: string;
  preferences_version: number;
  preferred_partner_gender: 'male' | 'female';
  age_min: number | null;
  age_max: number | null;
  preferred_nationalities: string[];
  nationality_mode: PreferenceMode;
  preferred_origins: string[];
  origin_mode: PreferenceMode;
  preferred_residences: string[];
  residence_mode: PreferenceMode;
  preferred_cities: string[];
  city_mode: PreferenceMode;
  preferred_languages: string[];
  language_mode: PreferenceMode;
  min_height_cm: number | null;
  max_height_cm: number | null;
  height_mode: PreferenceMode;
  preferred_education_levels: string[];
  education_mode: PreferenceMode;
  preferred_religions: string[];
  religion_mode: PreferenceMode;
  preferred_faith_practice_levels: string[];
  faith_practice_mode: PreferenceMode;
  preferred_cultural_communities: string[];
  culture_mode: PreferenceMode;
  preferred_marital_statuses: string[];
  marital_status_mode: PreferenceMode;
  preferred_children_statuses: string[];
  accepts_partner_with_children: boolean | null;
  children_mode: PreferenceMode;
  preferred_wants_children: string[];
  wants_children_mode: PreferenceMode;
  preferred_smoking: string[];
  smoking_mode: PreferenceMode;
  preferred_drinking: string[];
  drinking_mode: PreferenceMode;
  preferred_relocation: string[];
  relocation_mode: PreferenceMode;
  created_at: string;
  updated_at: string;
}

export interface MatchmakingAccount {
  display_name: string | null;
  date_of_birth: string | null;
  age: number | null;
  gender: string | null;
  country_code: string | null;
  city: string | null;
  nationality_country_code: string | null;
  country_of_origin_code: string | null;
  primary_language: string | null;
  other_languages: string[];
  legal_marital_status: string | null;
  relationship_situation: string | null;
  profile_image_url: string | null;
  onboarding_completed: boolean;
  account_status: string;
}
export interface MatchmakingSetup {
  account: MatchmakingAccount | null;
  profile: MatchmakingProfile | null;
  preferences: MatchmakingPreferences | null;
}
export interface MatchmakingDiscoveryProfile {
  profile_identifier: string;
  age: number;
  gender: string;
  nationality_country_code: string | null;
  country_of_origin_code: string | null;
  country_code: string;
  city: string | null;
  introduction: string | null;
  education_level: string | null;
  occupation: string | null;
  marital_status: string | null;
  has_children: boolean | null;
  wants_children: string | null;
  languages: string[];
  interests: string[];
  willing_to_relocate: string | null;
  values_assessment: string[];
  profile_image_url: string | null;
  religion_or_faith: string | null;
  cultural_or_ethnic_community: string | null;
  created_at: string;
}
export interface MatchmakingDetailProfile {
  profile_identifier: string;
  age: number;
  gender: string;
  country_code: string;
  city: string | null;
  introduction: string | null;
  physical_self_description: string | null;
  education_level: string | null;
  occupation: string | null;
  marital_status: string;
  has_children: boolean | null;
  wants_children: string | null;
  willing_to_relocate: string | null;
  languages: string[];
  profile_image_url: string | null;
  religion_or_faith: string | null;
  faith_practice_level: string | null;
  faith_expectations: string | null;
  cultural_or_ethnic_community: string | null;
  marriage_vision_response: string | null;
  height_cm: number | null;
  field_of_study: string | null;
  marriage_timeline: string | null;
  marriage_structure: string | null;
  long_distance_openness: string | null;
  provider_model: string | null;
  family_in_law_expectations: string | null;
  family_involvement: string | null;
  family_background: string | null;
  clan_or_region: string | null;
  alignments: string[];
}
export interface MatchmakingInterest {
  interest_id: string;
  other_profile_identifier: string;
  direction: 'incoming' | 'outgoing';
  status: MatchmakingInterestStatus;
  display_name: string;
  age: number | null;
  country_code: string | null;
  city: string | null;
  profile_image_url: string | null;
  created_at: string;
}
export interface MatchmakingAdminProfile {
  user_id: string;
  display_name: string;
  age: number | null;
  country_code: string | null;
  city: string | null;
  completion_percentage: number;
  status: MatchmakingProfileStatus;
  submitted_at: string | null;
  introduction: string | null;
}
export interface MatchmakingAdminProfileDetail {
  user_id: string;
  display_name: string;
  age: number | null;
  country_code: string | null;
  city: string | null;
  legal_marital_status: string | null;
  profile_version: number;
  completion_percentage: number;
  status: MatchmakingProfileStatus;
  submitted_at: string | null;
  height_cm: number | null;
  physical_self_description: string | null;
  introduction: string | null;
  marriage_vision_response: string | null;
  education_level: string | null;
  field_of_study: string | null;
  occupation: string | null;
  employment_status: string | null;
  has_children: boolean | null;
  wants_children: string | null;
  smoking: string | null;
  drinking: string | null;
  family_background: string | null;
  family_involvement: string | null;
  marriage_timeline: string | null;
  marriage_structure: string | null;
  willing_to_relocate: string | null;
  long_distance_openness: string | null;
  provider_model: string | null;
  family_in_law_expectations: string | null;
  religion_or_faith: string | null;
  faith_practice_level: string | null;
  denomination_or_tradition: string | null;
  faith_expectations: string | null;
  cultural_or_ethnic_community: string | null;
  clan_or_region: string | null;
}
export interface MatchmakingAdminReviewHistory {
  user_id: string;
  status: 'approved' | 'rejected' | 'hidden';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}
export interface MatchmakingAdminReport {
  report_id: string;
  reporter_user_id: string;
  reported_user_id: string;
  reason: MatchmakingReportReason;
  details: string | null;
  status: MatchmakingReportStatus;
  created_at: string;
}

