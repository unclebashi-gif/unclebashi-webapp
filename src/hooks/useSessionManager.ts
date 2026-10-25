import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, clearSupabaseLocalAuthStorage } from '@/lib/supabase';
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

const invalidSessionCodes = new Set([
  'bad_jwt',
  'invalid_jwt',
  'invalid_token',
  'invalid_grant',
  'invalid_refresh_token',
  'session_not_found',
  'session_expired',
  'token_expired',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'user_not_found',
]);

const isInvalidAuthSessionError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; name?: unknown; status?: unknown };
  return candidate.name === 'AuthSessionMissingError'
    || candidate.name === 'AuthInvalidTokenResponseError'
    || candidate.status === 401
    || (typeof candidate.code === 'string' && invalidSessionCodes.has(candidate.code));
};

type RestorableAuthSession = {
  access_token: string;
  user: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
};

export const useSessionManager = () => {
  const [isRestoring, setIsRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const setAuthenticatedUser = useAppStore((state) => state.setAuthenticatedUser);
  const clearUserSession = useAppStore((state) => state.clearUserSession);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const requestVersion = useRef(0);
  const initialBootstrapComplete = useRef(false);
  const identityUserId = useRef<string | null>(null);

  const applyAuthoritativeIdentity = useCallback(async (
    authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> },
    version: number
  ): Promise<boolean> => {
    try {
      const identity = await loadIdentity(authUser);
      if (requestVersion.current !== version) return false;

      setAuthenticatedUser(identity.user, identity.onboardingData);
      identityUserId.current = identity.user.id;
      setRestoreError(null);
      if (!identity.user.onboardingCompleted) {
        setCurrentView('onboarding');
      }
      return true;
    } catch (error) {
      if (requestVersion.current !== version) return false;
      identityUserId.current = null;
      clearUserSession({ navigateHome: false });
      setRestoreError(getIdentityMessage(error));
      return false;
    }
  }, [clearUserSession, setAuthenticatedUser, setCurrentView]);

  const clearInvalidSession = useCallback(async (version: number) => {
    if (requestVersion.current !== version) return;

    let needsStorageFallback = false;
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      needsStorageFallback = Boolean(error);
    } catch {
      needsStorageFallback = true;
    }

    // A newer sign-in/auth event wins. Never clear its storage or identity.
    if (requestVersion.current !== version) return;

    if (needsStorageFallback) {
      try {
        clearSupabaseLocalAuthStorage();
      } catch {
        // Still clear in-memory account state if browser storage is unavailable.
      }
    }

    if (requestVersion.current !== version) return;
    requestVersion.current += 1;
    identityUserId.current = null;
    clearUserSession();
    setRestoreError(null);
    initialBootstrapComplete.current = true;
    setIsRestoring(false);
  }, [clearUserSession]);

  const validateAndRestoreIdentity = useCallback(async (
    session: RestorableAuthSession,
    version: number
  ): Promise<boolean> => {
    try {
      const { data: { user: validatedUser }, error } =
        await supabase.auth.getUser(session.access_token);

      if (requestVersion.current !== version) return false;

      if (error) {
        if (isInvalidAuthSessionError(error)) {
          await clearInvalidSession(version);
        } else {
          setRestoreError('We could not verify your session. Please check your connection and try again.');
        }
        return false;
      }

      if (!validatedUser || validatedUser.id !== session.user.id) {
        await clearInvalidSession(version);
        return false;
      }

      return await applyAuthoritativeIdentity(validatedUser, version);
    } catch (error) {
      if (requestVersion.current !== version) return false;

      if (isInvalidAuthSessionError(error)) {
        await clearInvalidSession(version);
      } else {
        // Network and service failures do not prove the session is invalid.
        setRestoreError('We could not verify your session. Please check your connection and try again.');
      }
      return false;
    }
  }, [applyAuthoritativeIdentity, clearInvalidSession]);

  const restoreIdentityFromAuthEvent = useCallback(async (
    session: RestorableAuthSession,
    version: number
  ) => {
    const identityLoaded = await validateAndRestoreIdentity(session, version);
    if (identityLoaded && requestVersion.current === version) {
      initialBootstrapComplete.current = true;
      setIsRestoring(false);
    }
  }, [validateAndRestoreIdentity]);

  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      const version = ++requestVersion.current;
      let restorationResolved = false;
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!mounted || requestVersion.current !== version) return;

        if (session?.access_token && session.user) {
          restorationResolved = await validateAndRestoreIdentity(session, version);
        } else if (session) {
          await clearInvalidSession(version);
        } else {
          identityUserId.current = null;
          clearUserSession();
          setRestoreError(null);
          restorationResolved = true;
        }
      } catch (error) {
        if (mounted && requestVersion.current === version) {
          if (isInvalidAuthSessionError(error)) {
            await clearInvalidSession(version);
          } else {
            // Auth service/network failures remain retryable, not signed-out.
            setRestoreError('We could not verify your session. Please check your connection and try again.');
          }
        }
      } finally {
        if (mounted && requestVersion.current === version && restorationResolved) {
          initialBootstrapComplete.current = true;
          setIsRestoring(false);
        }
      }
    };

    void restoreSession();
    return () => {
      mounted = false;
      requestVersion.current += 1;
    };
  }, [clearInvalidSession, clearUserSession, validateAndRestoreIdentity]);

  useEffect(() => {
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        requestVersion.current += 1;
        initialBootstrapComplete.current = true;
        identityUserId.current = null;
        clearUserSession();
        setRestoreError(null);
        setIsRestoring(false);
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        if (
          event === 'TOKEN_REFRESHED'
          && initialBootstrapComplete.current
          && identityUserId.current === session.user.id
        ) return;

        const version = ++requestVersion.current;
        if (!initialBootstrapComplete.current) setIsRestoring(true);
        // Defer Auth validation and account reads until Supabase returns from its callback.
        window.setTimeout(() => {
          if (mounted) void restoreIdentityFromAuthEvent(session, version);
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