export type AppView = 'home' | 'education' | 'community' | 'coaching' | 'matchmaking' | 'admin' | 'profile' | 'settings' | 'onboarding';

const viewPaths: Record<AppView, string> = {
  home: '/',
  education: '/courses',
  community: '/community',
  coaching: '/coaching',
  matchmaking: '/matching',
  admin: '/admin',
  profile: '/profile',
  settings: '/settings',
  onboarding: '/onboarding',
};

const pathViews: Record<string, AppView> = {
  '/': 'home',
  '/home': 'home',
  '/courses': 'education',
  '/community': 'community',
  '/coaching': 'coaching',
  '/matching': 'matchmaking',
  '/admin': 'admin',
  '/profile': 'profile',
  '/settings': 'settings',
  '/onboarding': 'onboarding',
};

export const getViewFromPath = (pathname: string): AppView | null => pathViews[pathname] ?? null;

export const getPathForView = (view: string): string => viewPaths[view as AppView] ?? '/';

export const navigateToView = (view: string, replace = false): void => {
  if (typeof window === 'undefined') return;
  const path = getPathForView(view);
  if (window.location.pathname !== path) {
    if (replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
    // React Router listens for popstate; dispatch it so existing store actions
    // remain the shared navigation mechanism for all top-level controls.
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
};
