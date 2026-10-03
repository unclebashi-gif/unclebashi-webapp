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
  ): Promise<boolean> => {
    try {
      const identity = await loadIdentity(authUser);
      if (requestVersion.current !== version) return false;

      setAuthenticatedUser(identity.user, identity.onboardingData);
      setRestoreError(null);
      if (!identity.user.onboardingCompleted) {
        setCurrentView('onboarding');
      }
      return true;
    } catch (error) {
      if (requestVersion.current !== version) return false;
      clearUserSession({ navigateHome: false });
      setRestoreError(getIdentityMessage(error));
      return false;
    }
  }, [clearUserSession, setAuthenticatedUser, setCurrentView]);

  const restoreIdentityFromAuthEvent = useCallback(async (
    authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> },
    version: number
  ) => {
    const identityLoaded = await applyAuthoritativeIdentity(authUser, version);
    if (identityLoaded && requestVersion.current === version) setIsRestoring(false);
  }, [applyAuthoritativeIdentity]);

  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      const version = ++requestVersion.current;
      let restorationResolved = false;
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!mounted || requestVersion.current !== version) return;

        if (session?.user) {
          restorationResolved = await applyAuthoritativeIdentity(session.user, version);
        } else {
          clearUserSession();
          setRestoreError(null);
          restorationResolved = true;
        }
      } catch (error) {
        if (mounted && requestVersion.current === version) {
          // A failed getSession call does not prove the user is signed out.
          setRestoreError(getIdentityMessage(error));
        }
      } finally {
        // An auth event may have started a newer identity load while this
        // request was pending. Only the latest request can resolve startup.
        if (mounted && requestVersion.current === version && restorationResolved) setIsRestoring(false);
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
        setIsRestoring(false);
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        const version = ++requestVersion.current;
        setIsRestoring(true);
        // Defer database reads until Supabase has returned from its auth callback.
        window.setTimeout(() => {
          if (mounted) void restoreIdentityFromAuthEvent(session.user, version);
        }, 0);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [restoreIdentityFromAuthEvent, clearUserSession]);

  return { isRestoring, restoreError };
};

export default useSessionManager;
