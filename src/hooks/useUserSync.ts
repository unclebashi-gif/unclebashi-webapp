import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/lib/store';

/**
 * Provides functions to sync user data to the database.
 * Call these after local state updates to persist changes.
 */
export const useUserSync = () => {
  const { user } = useAppStore();

  // Sync user profile to the database
  const syncUserProfile = useCallback(async (updates?: Record<string, unknown>) => {
    if (!user?.id) return;

    try {
      const profileData: Record<string, unknown> = {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        onboarding_completed: user.onboardingCompleted,
        onboarding_step: user.onboardingStep,
        marriage_intention: user.marriageIntention,
        commitment_level: user.commitmentLevel,
        values_assessment: user.valuesAssessment,
        readiness_score: user.readinessScore,
        matchmaking_unlocked: user.matchmakingUnlocked,
        role: user.role,
        updated_at: new Date().toISOString(),
        ...updates,
      };

      const { error } = await supabase
        .from('users')
        .upsert(profileData, { onConflict: 'id' });

      if (error) {
        console.error('Error syncing user profile:', error);
      }
    } catch (err) {
      console.error('Error in syncUserProfile:', err);
    }
  }, [user]);

  // Sync onboarding data to the database
  const syncOnboardingData = useCallback(async (onboardingData: Record<string, unknown>) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('user_onboarding_data')
        .upsert({
          user_id: user.id,
          onboarding_data: onboardingData,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) {
        console.error('Error syncing onboarding data:', error);
      }
    } catch (err) {
      console.error('Error in syncOnboardingData:', err);
    }
  }, [user?.id]);

  // Sync specific profile fields (for edit profile)
  const syncProfileFields = useCallback(async (fields: {
    fullName?: string;
    bio?: string;
    location?: string;
    occupation?: string;
    profileImage?: string;
  }) => {
    if (!user?.id) return;

    try {
      const dbFields: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (fields.fullName !== undefined) dbFields.full_name = fields.fullName;
      if (fields.bio !== undefined) dbFields.bio = fields.bio;
      if (fields.location !== undefined) dbFields.location = fields.location;
      if (fields.occupation !== undefined) dbFields.occupation = fields.occupation;
      if (fields.profileImage !== undefined) dbFields.profile_image = fields.profileImage;

      const { error } = await supabase
        .from('users')
        .update(dbFields)
        .eq('id', user.id);

      if (error) {
        console.error('Error syncing profile fields:', error);
      }
    } catch (err) {
      console.error('Error in syncProfileFields:', err);
    }
  }, [user?.id]);

  // Sync onboarding completion
  const syncOnboardingComplete = useCallback(async (data: {
    marriageIntention?: string;
    commitmentLevel?: string;
    valuesAssessment?: string[];
    readinessScore?: number;
    dateOfBirth?: string;
    gender?: string;
    countryCode?: string;
    city?: string;
    location?: string;
    locationCategory?: string;
    marriageTimeline?: string;
    partnerPreferences?: string;
  }) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('users')
        .update({
          onboarding_completed: true,
          onboarding_step: 10,
          marriage_intention: data.marriageIntention,
          commitment_level: data.commitmentLevel,
          values_assessment: data.valuesAssessment || [],
          readiness_score: data.readinessScore || 0,
          date_of_birth: data.dateOfBirth,
          gender: data.gender,
          country_code: data.countryCode,
          city: data.city,
          location: data.location,
          location_category: data.locationCategory,
          marriage_timeline: data.marriageTimeline,
          partner_preferences: data.partnerPreferences,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error syncing onboarding completion:', error);
      }
    } catch (err) {
      console.error('Error in syncOnboardingComplete:', err);
    }
  }, [user?.id]);

  // Sync readiness score update
  const syncReadinessScore = useCallback(async (newScore: number) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('users')
        .update({
          readiness_score: newScore,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error syncing readiness score:', error);
      }
    } catch (err) {
      console.error('Error in syncReadinessScore:', err);
    }
  }, [user?.id]);

  return {
    syncUserProfile,
    syncOnboardingData,
    syncProfileFields,
    syncOnboardingComplete,
    syncReadinessScore,
  };
};

export default useUserSync;
