import { supabase } from '@/lib/supabase';
import type { JourneyStatus, JourneyType, UserJourney } from '@/types/journey';

const firstJourney = (data: unknown): UserJourney => {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object' || !('journey_type' in row)) {
    throw new Error('The server did not confirm the journey update.');
  }
  return row as UserJourney;
};

export const getMyJourneys = async (): Promise<UserJourney[]> => {
  const { data, error } = await supabase
    .from('user_journeys')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Could not load your journeys: ${error.message}`);
  return (data ?? []) as UserJourney[];
};

export const activateJourney = async (
  journeyType: JourneyType,
  makePrimary = false
): Promise<UserJourney> => {
  const { data, error } = await supabase.rpc('activate_user_journey', {
    p_journey_type: journeyType,
    p_make_primary: makePrimary,
  });
  if (error) throw new Error(error.message || 'Could not activate this journey.');
  return firstJourney(data);
};

export const setJourneyStatus = async (
  journeyType: JourneyType,
  status: Exclude<JourneyStatus, 'active'>
): Promise<UserJourney> => {
  const { data, error } = await supabase.rpc('set_user_journey_status', {
    p_journey_type: journeyType,
    p_status: status,
  });
  if (error) throw new Error(error.message || 'Could not update this journey.');
  return firstJourney(data);
};
