import { supabase } from '@/lib/supabase';
import type {
  AdminCoach,
  CoachingBooking,
  CoachRoleCandidate,
  ListedCoach,
  NewCoachProfile,
} from '@/types/coaching';

const rows = <T>(data: unknown): T[] => (Array.isArray(data) ? data as T[] : data ? [data as T] : []);
const rpc = async <T>(name: string, args?: Record<string, unknown>): Promise<T[]> => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return rows<T>(data);
};

export const getListedCoaches = () => rpc<ListedCoach>('get_listed_coaches');
export const getMyCoachingBookings = () => rpc<CoachingBooking>('get_my_coaching_bookings');
export const getAdminCoaches = () => rpc<AdminCoach>('get_admin_coaches');
export const getCoachRoleCandidates = () => rpc<CoachRoleCandidate>('get_coach_role_candidates');

export async function requestCoachingSession(input: {
  coachId: string;
  requestedStartAt: string;
  requestedTimezone: string;
  clientNote: string;
}): Promise<Pick<CoachingBooking, 'id' | 'coach_id' | 'coach_display_name' | 'requested_start_at' |
  'requested_timezone' | 'duration_minutes' | 'client_note' | 'status' | 'created_at'>> {
  const [booking] = await rpc<Pick<CoachingBooking, 'id' | 'coach_id' | 'coach_display_name' |
    'requested_start_at' | 'requested_timezone' | 'duration_minutes' | 'client_note' | 'status' | 'created_at'>>(
    'request_coaching_session',
    {
      p_coach_id: input.coachId,
      p_requested_start_at: input.requestedStartAt,
      p_requested_timezone: input.requestedTimezone,
      p_client_note: input.clientNote.trim() || null,
    }
  );
  if (!booking) throw new Error('The booking request was not confirmed by the server.');
  return booking;
}

export async function decideCoachingBooking(bookingId: string, decision: 'confirmed' | 'declined') {
  await rpc<string>('decide_coaching_booking', { p_booking_id: bookingId, p_decision: decision });
}

export async function cancelCoachingBooking(bookingId: string) {
  await rpc<string>('cancel_coaching_booking', { p_booking_id: bookingId });
}

export async function completeCoachingBooking(bookingId: string) {
  await rpc<string>('complete_coaching_booking', { p_booking_id: bookingId });
}

export async function createCoachProfile(input: NewCoachProfile) {
  const [coach] = await rpc<AdminCoach>('create_coach_profile', {
    p_user_id: input.user_id,
    p_display_name: input.display_name,
    p_title: input.title,
    p_bio: input.bio,
    p_profile_image_url: input.profile_image_url,
    p_specialties: input.specialties,
    p_languages: input.languages,
    p_country_code: input.country_code,
    p_city: input.city,
    p_default_session_minutes: input.default_session_minutes,
  });
  if (!coach) throw new Error('Coach profile creation was not confirmed by the server.');
  return coach;
}

export async function updateCoachProfile(coach: AdminCoach) {
  const [updated] = await rpc<AdminCoach>('update_coach_profile', {
    p_coach_id: coach.id,
    p_display_name: coach.display_name,
    p_title: coach.title,
    p_bio: coach.bio,
    p_profile_image_url: coach.profile_image_url,
    p_specialties: coach.specialties,
    p_languages: coach.languages,
    p_country_code: coach.country_code,
    p_city: coach.city,
    p_default_session_minutes: coach.default_session_minutes,
    p_is_active: coach.is_active,
    p_is_listed: coach.is_listed,
  });
  if (!updated) throw new Error('Coach profile update was not confirmed by the server.');
  return updated;
}
