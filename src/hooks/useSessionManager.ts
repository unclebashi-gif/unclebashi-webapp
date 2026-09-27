import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { IdentityLoadError, loadIdentity } from '@/lib/identity';
import { useAppStore } from '@/lib/store';

const getIdentityMessage = (error: unknown): string => {
  if (error instanceof IdentityLoadError && error.kind === 'profile') {
    return 'Your account is signed in, but its profile is missing. Please contact support.';
  }
  if (error instanceof IdentityLoadError && error.kind === 'roles') {
    return 'Your account roles could not be verified. Please contact support.';
  }
  return 'We could not restore your account data. Please try again.';
};

export const useSessionManager = () => {
  const [isRestoring, setIsRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const setAuthenticatedUser = useAppStore((state) => state.setAuthenticatedUser);
  const clearUserSession = useAppStore((state) => state.clearUserSession);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const requestVersion = useRef(0);

  const applyAuthoritativeIdentity = useCallback(async (
    authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> },
    version: number
  ) => {
    try {
      const identity = await loadIdentity(authUser);
      if (requestVersion.current !== version) return;

      setAuthenticatedUser(identity.user, identity.onboardingData);
      setRestoreError(null);
      if (!identity.user.onboardingCompleted) {
        setCurrentView('onboarding');
      } else if (useAppStore.getState().currentView === 'home' || useAppStore.getState().currentView === 'onboarding') {
        setCurrentView('education');
      }
    } catch (error) {
      if (requestVersion.current !== version) return;
      clearUserSession();
      setRestoreError(getIdentityMessage(error));
    }
  }, [clearUserSession, setAuthenticatedUser, setCurrentView]);

  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      const version = ++requestVersion.current;
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!mounted || requestVersion.current !== version) return;

        if (session?.user) {
          await applyAuthoritativeIdentity(session.user, version);
        } else {
          clearUserSession();
          setRestoreError(null);
        }
      } catch (error) {
        if (mounted && requestVersion.current === version) {
          clearUserSession();
          setRestoreError(getIdentityMessage(error));
        }
      } finally {
        if (mounted) setIsRestoring(false);
      }
    };

    void restoreSession();
    return () => {
      mounted = false;
      requestVersion.current += 1;
    };
  }, [applyAuthoritativeIdentity, clearUserSession]);

  useEffect(() => {
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        requestVersion.current += 1;
        clearUserSession();
        setRestoreError(null);
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        const version = ++requestVersion.current;
        // Defer database reads until Supabase has returned from its auth callback.
        window.setTimeout(() => {
          if (mounted) void applyAuthoritativeIdentity(session.user, version);
        }, 0);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [applyAuthoritativeIdentity, clearUserSession]);

  return { isRestoring, restoreError };
};

export default useSessionManager;
