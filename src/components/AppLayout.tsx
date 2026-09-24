import React from 'react';
import { useAppStore } from '@/lib/store';
import { useSessionManager } from '@/hooks/useSessionManager';
import { Header } from './layout/Header';
import { Footer } from './layout/Footer';
import { AuthModal } from './auth/AuthModal';
import { HomePage } from './HomePage';
import { OnboardingFlow } from './onboarding/OnboardingFlow';
import { EducationHub } from './education/EducationHub';
import { CommunityHub } from './community/CommunityHub';
import { CoachingHub } from './coaching/CoachingHub';
import { MatchmakingHub } from './matchmaking/MatchmakingHub';
import { ProfilePage } from './profile/ProfilePage';
import { AdminDashboard } from './admin/AdminDashboard';

const AppLayout: React.FC = () => {
  const { currentView, showAuthModal, setShowAuthModal, user, isAuthenticated } = useAppStore();
  const { isRestoring } = useSessionManager();

  // Show a loading screen while restoring the session
  if (isRestoring) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#faf6f1]">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 bg-[#1e3a5f] rounded-2xl flex items-center justify-center shadow-lg animate-pulse">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-[#1e3a5f]">Welcome back</h2>
            <p className="text-sm text-gray-500 mt-1">Restoring your session...</p>
          </div>
          <div className="w-48 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-[#c4785a] rounded-full animate-[loading_1.5s_ease-in-out_infinite]" 
              style={{ 
                animation: 'loading 1.5s ease-in-out infinite',
                width: '60%',
              }} 
            />
          </div>
        </div>
        <style>{`
          @keyframes loading {
            0% { transform: translateX(-100%); }
            50% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
          }
        `}</style>
      </div>
    );
  }

  // Render onboarding flow without header/footer
  if (currentView === 'onboarding' && isAuthenticated && !user?.onboardingCompleted) {
    return <OnboardingFlow />;
  }

  const renderContent = () => {
    // If not authenticated, show home page for most views
    if (!isAuthenticated && currentView !== 'home') {
      return <HomePage />;
    }

    switch (currentView) {
      case 'home':
        return <HomePage />;
      case 'education':
        return <EducationHub />;
      case 'community':
        return <CommunityHub />;
      case 'coaching':
        return <CoachingHub />;
      case 'matchmaking':
        return <MatchmakingHub />;
      case 'profile':
        return <ProfilePage />;
      case 'admin':
        return user?.role === 'admin' ? <AdminDashboard /> : <HomePage />;
      case 'settings':
        return <ProfilePage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      
      <main className="flex-1">
        {renderContent()}
      </main>

      {currentView === 'home' && <Footer />}

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
};

export default AppLayout;
