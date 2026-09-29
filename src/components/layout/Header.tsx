import React, { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { Button } from '../ui/button';
import {
  MenuIcon,
  XIcon,
  HomeIcon,
  BookIcon,
  UsersIcon,
  HeartIcon,
  UserIcon,
  LogOutIcon,
  SettingsIcon,
  SparklesIcon,
} from '../ui/Icons';

export const Header: React.FC = () => {
  const {
    isAuthenticated,
    user,
    currentView,
    setCurrentView,
    setShowAuthModal,
    setAuthModalMode,
    clearUserSession,
  } = useAppStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const navItems = [
    { id: 'home', label: 'Home', icon: HomeIcon },
    { id: 'education', label: 'Courses', icon: BookIcon },
    { id: 'community', label: 'Community', icon: UsersIcon },
    { id: 'coaching', label: 'Coaching', icon: SparklesIcon },
    { id: 'matchmaking', label: 'Matching', icon: HeartIcon },
  ];

  const handleNavClick = (viewId: string) => {
    setCurrentView(viewId);
    setMobileMenuOpen(false);
  };

  const handleSignIn = () => {
    setAuthModalMode('login');
    setShowAuthModal(true);
  };

  const handleSignUp = () => {
    setAuthModalMode('signup');
    setShowAuthModal(true);
  };

  const handleLogout = async () => {
    setLogoutError('');
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      clearUserSession();
      setUserMenuOpen(false);
    } catch (error: unknown) {
      setLogoutError(error instanceof Error ? error.message : 'Sign out failed. Please try again.');
    }
  };

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div
            className="flex items-center cursor-pointer flex-shrink-0"
            onClick={() => handleNavClick('home')}
          >
            <img 
              src="https://d64gsuwffb70l.cloudfront.net/697e2149ef322799a47a3b66_1773995591062_8973536f.png" 
              alt="Uncle Bashi - Guiding Relationships, Harmonizing Families" 
              className="h-10 sm:h-12 md:h-14 w-auto"
            />
          </div>



          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              const isLocked = !isAuthenticated && item.id !== 'home';

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (isLocked) {
                      handleSignIn();
                    } else {
                      handleNavClick(item.id);
                    }
                  }}
                  className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#faf6f1] text-[#c4785a]'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-[#1e3a5f]'
                  } ${isLocked ? 'opacity-60' : ''}`}
                >
                  <Icon size={18} className="mr-1.5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center space-x-3">
            {isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 bg-[#c4785a] rounded-full flex items-center justify-center text-white text-sm font-medium">
                    {user?.fullName?.charAt(0) || 'U'}
                  </div>
                  <span className="hidden sm:block text-sm font-medium text-gray-700">
                    {user?.fullName?.split(' ')[0] || 'User'}
                  </span>
                </button>

                {userMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setUserMenuOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-20">
                      <div className="px-4 py-2 border-b border-gray-100">
                        <p className="text-sm font-medium text-[#1e3a5f]">{user?.fullName}</p>
                        <p className="text-xs text-gray-500">{user?.email}</p>
                      </div>

                      <button
                        onClick={() => {
                          handleNavClick('profile');
                          setUserMenuOpen(false);
                        }}
                        className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <UserIcon size={16} className="mr-3" />
                        My Profile
                      </button>

                      <button
                        onClick={() => {
                          handleNavClick('settings');
                          setUserMenuOpen(false);
                        }}
                        className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <SettingsIcon size={16} className="mr-3" />
                        Settings
                      </button>

                      {user?.roles.some((role) => role === 'admin' || role === 'moderator') && (
                        <button
                          onClick={() => {
                            handleNavClick('admin');
                            setUserMenuOpen(false);
                          }}
                          className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <SettingsIcon size={16} className="mr-3" />
                          {user.roles.includes('admin') ? 'Admin Panel' : 'Moderation'}
                        </button>
                      )}

                      <div className="border-t border-gray-100 mt-2 pt-2">
                        {logoutError && (
                          <p className="px-4 pb-2 text-xs text-red-700" role="alert">{logoutError}</p>
                        )}
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          <LogOutIcon size={16} className="mr-3" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="hidden sm:flex items-center space-x-2">
                <Button variant="ghost" size="sm" onClick={handleSignIn}>
                  Sign In
                </Button>
                <Button variant="primary" size="sm" onClick={handleSignUp}>
                  Get Started
                </Button>
              </div>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-50"
            >
              {mobileMenuOpen ? <XIcon size={24} /> : <MenuIcon size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white">
          <div className="px-4 py-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              const isLocked = !isAuthenticated && item.id !== 'home';

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (isLocked) {
                      handleSignIn();
                      setMobileMenuOpen(false);
                    } else {
                      handleNavClick(item.id);
                    }
                  }}
                  className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#faf6f1] text-[#c4785a]'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={18} className="mr-3" />
                  {item.label}
                  {isLocked && (
                    <span className="ml-auto text-xs text-gray-400">Sign in required</span>
                  )}
                </button>
              );
            })}

            {!isAuthenticated && (
              <div className="pt-3 border-t border-gray-100 space-y-2">
                <Button fullWidth variant="outline" onClick={handleSignIn}>
                  Sign In
                </Button>
                <Button fullWidth onClick={handleSignUp}>
                  Get Started
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
