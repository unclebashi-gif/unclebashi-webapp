export type AppView =
  | 'home'
  | 'education'
  | 'community'
  | 'coaching'
  | 'matchmaking'
  | 'counselling'
  | 'media'
  | 'contact'
  | 'about'
  | 'privacy'
  | 'terms'
  | 'admin'
  | 'profile'
  | 'settings'
  | 'onboarding';

export type PrimaryNavigationItem = {
  view: AppView;
  label: string;
  requiresAuth: boolean;
};

export const PRIMARY_NAVIGATION: readonly PrimaryNavigationItem[] = [
  { view: 'home', label: 'Home', requiresAuth: false },
  { view: 'education', label: 'Courses', requiresAuth: true },
  { view: 'matchmaking', label: 'Marriage Matching', requiresAuth: true },
  { view: 'coaching', label: 'Coaching', requiresAuth: true },
  { view: 'counselling', label: 'Counselling', requiresAuth: false },
  { view: 'media', label: 'Media', requiresAuth: false },
  { view: 'community', label: 'Community', requiresAuth: true },
  { view: 'contact', label: 'Contact', requiresAuth: false },
];

export const PUBLIC_VIEWS: readonly AppView[] = ['home', 'about', 'counselling', 'media', 'contact', 'privacy', 'terms'];

export const isPublicView = (view: AppView): boolean => PUBLIC_VIEWS.includes(view);

const viewPaths: Record<AppView, string> = {
  home: '/',
  education: '/courses',
  community: '/community',
  coaching: '/coaching',
  matchmaking: '/matching',
  counselling: '/counselling',
  media: '/media',
  contact: '/contact',
  about: '/about',
  privacy: '/privacy',
  terms: '/terms',
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
  '/counselling': 'counselling',
  '/media': 'media',
  '/contact': 'contact',
  '/about': 'about',
  '/privacy': 'privacy',
  '/terms': 'terms',
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
