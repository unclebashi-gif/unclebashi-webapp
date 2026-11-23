export type MarriageSupportArea =
  | 'communication'
  | 'emotional_connection'
  | 'conflict_patterns'
  | 'trust_after_hurt'
  | 'intimacy_and_affection'
  | 'parenting_teamwork'
  | 'finances_and_roles'
  | 'in_law_boundaries'
  | 'faith_and_values'
  | 'household_partnership'
  | 'other';

export type PartnerParticipation = 'yes' | 'maybe' | 'not_now' | 'unknown';
export type MarriageSupportPath = 'self_guided' | 'couple_support' | 'individual_guidance' | 'coaching' | 'counselling' | 'not_sure';
export type IntakeTiming = 'now' | 'next_few_weeks' | 'exploring';

export interface MarriageSupportProfile {
  user_id: string;
  profile_version: number;
  intake_completed_at: string | null;
  support_areas: MarriageSupportArea[];
  primary_concern: string | null;
  desired_outcomes: string | null;
  partner_participation: PartnerParticipation | null;
  preferred_support_path: MarriageSupportPath | null;
  timing_preference: IntakeTiming | null;
  created_at: string;
  updated_at: string;
}

export type CoachingFocusArea =
  | 'communication_skills'
  | 'marriage_preparation'
  | 'relationship_skills'
  | 'confidence_and_boundaries'
  | 'family_roles'
  | 'personal_growth'
  | 'accountability'
  | 'conflict_skills'
  | 'relationship_decision_making'
  | 'other';

export type CoachingFormat = 'individual' | 'couple' | 'group' | 'not_sure';
export type CoachingFrequency = 'one_off' | 'weekly' | 'biweekly' | 'flexible';
export type CoachGenderPreference = 'male' | 'female' | 'no_preference';

export interface CoachingProfile {
  user_id: string;
  profile_version: number;
  intake_completed_at: string | null;
  focus_areas: CoachingFocusArea[];
  primary_goal: string | null;
  desired_outcome: string | null;
  preferred_format: CoachingFormat | null;
  session_frequency: CoachingFrequency | null;
  coach_gender_preference: CoachGenderPreference | null;
  availability_notes: string | null;
  created_at: string;
  updated_at: string;
}

export type MarriageSupportDraft = Pick<MarriageSupportProfile,
  'support_areas' | 'primary_concern' | 'desired_outcomes' | 'partner_participation' | 'preferred_support_path' | 'timing_preference'>;

export type CoachingDraft = Pick<CoachingProfile,
  'focus_areas' | 'primary_goal' | 'desired_outcome' | 'preferred_format' | 'session_frequency' | 'coach_gender_preference' | 'availability_notes'>;
