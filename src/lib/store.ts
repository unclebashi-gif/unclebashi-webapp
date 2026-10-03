import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { navigateToView } from './navigation';


// Types
export type UserRole = 'user' | 'coach' | 'moderator' | 'admin';

export interface User {
  id: string;
  email: string;
  fullName: string;
  gender?: string;
  profileImageUrl?: string;
  onboardingCompleted: boolean;
  onboardingStep: number;
  marriageIntention?: string;
  commitmentLevel?: string;
  valuesAssessment: string[];
  readinessScore: number;
  matchmakingUnlocked: boolean;
  roles: UserRole[];
}

export interface JournalEntry {
  id: string;
  prompt: string;
  response: string;
  aiReflection?: string;
  mood?: string;
  createdAt: string;
}

// App State
interface AppState {
  // Auth & User
  isAuthenticated: boolean;
  user: User | null;
  setAuthenticatedUser: (user: User, onboardingData: Record<string, unknown>) => void;
  updateUser: (updates: Partial<User>) => void;
  clearUserSession: (options?: { navigateHome?: boolean }) => void;

  // Navigation
  currentView: string;
  setCurrentView: (view: string, options?: { replace?: boolean }) => void;
  syncCurrentView: (view: string) => void;
  educationResumeTarget: { courseId: string; lessonId: string; positionSeconds: number } | null;
  setEducationResumeTarget: (target: AppState['educationResumeTarget']) => void;

  // Onboarding
  onboardingData: Record<string, unknown>;
  setOnboardingData: (data: Record<string, unknown>) => void;
  updateOnboardingData: (updates: Record<string, unknown>) => void;

  // Journal
  journalEntries: JournalEntry[];
  addJournalEntry: (entry: JournalEntry) => void;

  // UI State
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
  authModalMode: 'login' | 'signup';
  setAuthModalMode: (mode: 'login' | 'signup') => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Auth & User
      isAuthenticated: false,
      user: null,
      setAuthenticatedUser: (user, onboardingData) =>
        set({ user, isAuthenticated: true, onboardingData }),
      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
      clearUserSession: (options) => {
        set({
          isAuthenticated: false,
          user: null,
          onboardingData: {},
          educationResumeTarget: null,
          journalEntries: [],
          currentView: 'home',
        });
        if (options?.navigateHome !== false) navigateToView('home', true);
      },


      // Navigation
      currentView: 'home',
      setCurrentView: (view, options) => {
        navigateToView(view, options?.replace);
        set({ currentView: view });
      },
      syncCurrentView: (view) => set({ currentView: view }),
      educationResumeTarget: null,
      setEducationResumeTarget: (target) => set({ educationResumeTarget: target }),

      // Onboarding
      onboardingData: {},
      setOnboardingData: (data) => set({ onboardingData: data }),
      updateOnboardingData: (updates) =>
        set((state) => ({
          onboardingData: { ...state.onboardingData, ...updates },
        })),

      // Journal
      journalEntries: [],
      addJournalEntry: (entry) =>
        set((state) => ({
          journalEntries: [entry, ...state.journalEntries],
        })),

      // UI State
      showAuthModal: false,
      setShowAuthModal: (show) => set({ showAuthModal: show }),
      authModalMode: 'login',
      setAuthModalMode: (mode) => set({ authModalMode: mode }),
    }),
    {
      name: 'uncle-bashi-storage',
      version: 1,
      migrate: (persistedState: unknown) => {
        const migratedState = persistedState && typeof persistedState === 'object'
          ? { ...(persistedState as Record<string, unknown>) }
          : {};
        delete migratedState.courses;
        return migratedState as Partial<AppState>;
      },
      partialize: (state) => ({
        journalEntries: state.journalEntries,
      }),
    }
  )
);
