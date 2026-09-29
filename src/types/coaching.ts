export interface ListedCoach {
  id: string;
  display_name: string;
  title: string | null;
  bio: string | null;
  profile_image_url: string | null;
  specialties: string[];
  languages: string[];
  country_code: string | null;
  city: string | null;
  default_session_minutes: number;
}

export interface CoachRoleCandidate {
  user_id: string;
  full_name: string;
  profile_image_url: string | null;
}

export interface AdminCoach extends ListedCoach {
  user_id: string;
  is_active: boolean;
  is_listed: boolean;
  created_at: string;
}

export type CoachingBookingStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'completed';

export interface CoachingBooking {
  id: string;
  is_client_booking: boolean;
  coach_id: string;
  coach_display_name: string;
  coach_profile_image_url: string | null;
  client_display_name: string | null;
  client_profile_image_url: string | null;
  requested_start_at: string;
  requested_timezone: string;
  duration_minutes: number;
  client_note: string | null;
  status: CoachingBookingStatus;
  decision_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export type CoachProfileInput = Omit<AdminCoach, 'id' | 'user_id' | 'created_at'>;

export interface NewCoachProfile {
  user_id: string;
  display_name: string;
  title: string | null;
  bio: string | null;
  profile_image_url: string | null;
  specialties: string[];
  languages: string[];
  country_code: string | null;
  city: string | null;
  default_session_minutes: number;
}
