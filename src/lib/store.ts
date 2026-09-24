import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';


// Types
export interface User {
  id: string;
  email: string;
  fullName: string;
  profileImage?: string;
  onboardingCompleted: boolean;
  onboardingStep: number;
  marriageIntention?: string;
  commitmentLevel?: string;
  valuesAssessment: string[];
  readinessScore: number;
  matchmakingUnlocked: boolean;
  role: 'user' | 'moderator' | 'coach' | 'admin';
}

export interface Course {
  id: string;
  title: string;
  description: string;
  category: string;
  durationMinutes: number;
  orderIndex: number;
  isRequired: boolean;
  thumbnailUrl?: string;
  progress?: number;
  status?: 'not_started' | 'in_progress' | 'completed';
}

export interface JournalEntry {
  id: string;
  prompt: string;
  response: string;
  aiReflection?: string;
  mood?: string;
  createdAt: string;
}

export interface CommunityPost {
  id: string;
  userId: string;
  userName: string;
  userImage?: string;
  tier: 'open' | 'guided' | 'preparation';
  title?: string;
  content: string;
  isAnonymous: boolean;
  createdAt: string;
  commentCount: number;
}

export interface MatchProfile {
  id: string;
  userId: string;
  name: string;
  age: number;
  location: string;
  profileImage: string;
  valuesSummary: string;
  intentionsStatement: string;
  readinessScore: number;
  coursesCompleted: number;
}

// App State
interface AppState {
  // Auth & User
  isAuthenticated: boolean;
  user: User | null;
  setUser: (user: User | null) => void;
  updateUser: (updates: Partial<User>) => void;
  logout: () => void;

  // Navigation
  currentView: string;
  setCurrentView: (view: string) => void;

  // Onboarding
  onboardingData: Record<string, any>;
  setOnboardingData: (data: Record<string, any>) => void;
  updateOnboardingData: (updates: Record<string, any>) => void;

  // Courses
  courses: Course[];
  setCourses: (courses: Course[]) => void;
  updateCourseProgress: (courseId: string, progress: number, status: string) => void;

  // Journal
  journalEntries: JournalEntry[];
  addJournalEntry: (entry: JournalEntry) => void;

  // Community
  communityPosts: CommunityPost[];
  setCommunityPosts: (posts: CommunityPost[]) => void;
  addCommunityPost: (post: CommunityPost) => void;

  // Matchmaking
  matchProfiles: MatchProfile[];
  setMatchProfiles: (profiles: MatchProfile[]) => void;

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
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
      logout: () => {
        // Sign out from Supabase auth
        supabase.auth.signOut().catch(console.error);
        set({
          isAuthenticated: false,
          user: null,
          onboardingData: {},
          currentView: 'home',
        });
      },


      // Navigation
      currentView: 'home',
      setCurrentView: (view) => set({ currentView: view }),

      // Onboarding
      onboardingData: {},
      setOnboardingData: (data) => set({ onboardingData: data }),
      updateOnboardingData: (updates) =>
        set((state) => ({
          onboardingData: { ...state.onboardingData, ...updates },
        })),

      // Courses
      courses: [],
      setCourses: (courses) => set({ courses }),
      updateCourseProgress: (courseId, progress, status) =>
        set((state) => ({
          courses: state.courses.map((c) =>
            c.id === courseId ? { ...c, progress, status: status as any } : c
          ),
        })),

      // Journal
      journalEntries: [],
      addJournalEntry: (entry) =>
        set((state) => ({
          journalEntries: [entry, ...state.journalEntries],
        })),

      // Community
      communityPosts: [],
      setCommunityPosts: (posts) => set({ communityPosts: posts }),
      addCommunityPost: (post) =>
        set((state) => ({
          communityPosts: [post, ...state.communityPosts],
        })),

      // Matchmaking
      matchProfiles: [],
      setMatchProfiles: (profiles) => set({ matchProfiles: profiles }),

      // UI State
      showAuthModal: false,
      setShowAuthModal: (show) => set({ showAuthModal: show }),
      authModalMode: 'login',
      setAuthModalMode: (mode) => set({ authModalMode: mode }),
    }),
    {
      name: 'uncle-bashi-storage',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        onboardingData: state.onboardingData,
        journalEntries: state.journalEntries,
        courses: state.courses,
      }),
    }
  )
);
