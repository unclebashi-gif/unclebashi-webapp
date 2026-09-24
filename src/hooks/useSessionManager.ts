import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore, User } from '@/lib/store';

/**
 * Manages Supabase auth session persistence.
 * On page load, checks for an existing session and restores the user
 * from the database so they can pick up where they left off.
 */
export const useSessionManager = () => {
  const [isRestoring, setIsRestoring] = useState(true);
  const { setUser, setCurrentView, user, isAuthenticated } = useAppStore();
  const hasRestored = useRef(false);

  // Fetch user profile from the database
  const fetchUserProfile = useCallback(async (userId: string, email: string, fallbackName?: string): Promise<User | null> => {
    try {
      const { data: profileData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching user profile:', error);
      }

      if (profileData) {
        return {
          id: userId,
          email: profileData.email || email,
          fullName: profileData.full_name || fallbackName || 'User',
          profileImage: profileData.profile_image,
          onboardingCompleted: profileData.onboarding_completed || false,
          onboardingStep: profileData.onboarding_step || 0,
          marriageIntention: profileData.marriage_intention,
          commitmentLevel: profileData.commitment_level,
          valuesAssessment: profileData.values_assessment || [],
          readinessScore: profileData.readiness_score || 0,
          matchmakingUnlocked: profileData.matchmaking_unlocked || false,
          role: (profileData.role || 'user') as User['role'],
        };
      }

      // No profile found - create a minimal one
      return {
        id: userId,
        email,
        fullName: fallbackName || 'User',
        onboardingCompleted: false,
        onboardingStep: 0,
        valuesAssessment: [],
        readinessScore: 0,
        matchmakingUnlocked: false,
        role: 'user',
      };
    } catch (err) {
      console.error('Error in fetchUserProfile:', err);
      return null;
    }
  }, []);

  // Restore onboarding data from database
  const restoreOnboardingData = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_onboarding_data')
        .select('onboarding_data')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching onboarding data:', error);
        return null;
      }

      return data?.onboarding_data || null;
    } catch (err) {
      console.error('Error restoring onboarding data:', err);
      return null;
    }
  }, []);

  // Restore session on mount
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;

    const restoreSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Session restore error:', error);
          setIsRestoring(false);
          return;
        }

        if (session?.user) {
          const authUser = session.user;
          const userProfile = await fetchUserProfile(
            authUser.id,
            authUser.email || '',
            authUser.user_metadata?.full_name
          );

          if (userProfile) {
            setUser(userProfile);

            // Restore onboarding data
            const onboardingData = await restoreOnboardingData(authUser.id);
            if (onboardingData) {
              useAppStore.getState().setOnboardingData(onboardingData);
            }

            // Set the appropriate view based on user state
            if (!userProfile.onboardingCompleted) {
              setCurrentView('onboarding');
            } else {
              // Keep whatever view was persisted, or default to education
              const currentView = useAppStore.getState().currentView;
              if (currentView === 'home') {
                setCurrentView('education');
              }
            }
          }
        }
      } catch (err) {
        console.error('Session restoration failed:', err);
      } finally {
        setIsRestoring(false);
      }
    };

    restoreSession();
  }, [fetchUserProfile, restoreOnboardingData, setUser, setCurrentView]);

  // Listen for auth state changes (e.g., sign out from another tab)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          useAppStore.getState().logout();
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          // Session was refreshed, ensure user is still loaded
          const currentUser = useAppStore.getState().user;
          if (!currentUser) {
            const userProfile = await fetchUserProfile(
              session.user.id,
              session.user.email || '',
              session.user.user_metadata?.full_name
            );
            if (userProfile) {
              setUser(userProfile);
            }
          }
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchUserProfile, setUser]);

  return { isRestoring };
};

export default useSessionManager;
