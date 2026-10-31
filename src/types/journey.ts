export type JourneyType =
  | 'marriage_education'
  | 'marriage_preparation'
  | 'matchmaking'
  | 'marriage_support'
  | 'coaching'
  | 'counselling';

export type JourneyStatus = 'active' | 'paused' | 'completed' | 'withdrawn';

export interface UserJourney {
  user_id: string;
  journey_type: JourneyType;
  status: JourneyStatus;
  is_primary: boolean;
  started_at: string;
  completed_at: string | null;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
}

export const JOURNEY_TYPES: readonly JourneyType[] = [
  'marriage_education',
  'marriage_preparation',
  'matchmaking',
  'marriage_support',
  'coaching',
  'counselling',
];

export const JOURNEY_LABELS: Record<JourneyType, string> = {
  marriage_education: 'Marriage Education',
  marriage_preparation: 'Prepare for Marriage',
  matchmaking: 'Marriage Matching',
  marriage_support: 'Strengthen My Marriage',
  coaching: 'Coaching',
  counselling: 'Counselling',
};

export const JOURNEY_DESTINATIONS: Partial<Record<JourneyType, string>> = {
  marriage_education: 'education',
  marriage_preparation: 'education',
  matchmaking: 'matchmaking',
  coaching: 'coaching',
  counselling: 'counselling',
};
