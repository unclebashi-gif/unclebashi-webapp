import React from 'react';
import { Button } from '../ui/Button';
import { useAppStore } from '@/lib/store';
import { IMAGES } from '@/lib/constants';
import { ShieldIcon, CheckCircleIcon, UsersIcon, ArrowRightIcon, GlobeIcon, MapPinIcon } from '../ui/Icons';

export const HeroSection: React.FC = () => {
  const { setShowAuthModal, setAuthModalMode, isAuthenticated, setCurrentView } = useAppStore();

  const handleGetStarted = () => {
    if (isAuthenticated) {
      setCurrentView('education');
    } else {
      setAuthModalMode('signup');
      setShowAuthModal(true);
    }
  };

  const handleLearnMore = () => {
    const element = document.getElementById('how-it-works');
    element?.scrollIntoView({ behavior: 'smooth' });
  };

  const stats = [
    { value: '4', label: 'Countries Served' },
    { value: '10+', label: 'Successful Matches' },
    { value: '95%', label: 'Course Completion' },
    { value: '10+', label: 'Partner Therapists' },
  ];


  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#faf6f1] via-white to-[#faf6f1]">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-[#c4785a]/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#1e3a5f]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Content */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center px-4 py-2 bg-[#1e3a5f]/5 rounded-full text-sm font-medium text-[#1e3a5f] mb-6">
              <GlobeIcon size={16} className="mr-2 text-[#c4785a]" />
              Serving East Africa & Diaspora
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1e3a5f] leading-tight mb-6">
              Serious Marriage Matching <span className="text-[#c4785a]"> Marriage Courses</span> {''}
              Couples Therapy
            </h1>

            <p className="text-lg sm:text-xl text-gray-600 mb-6 max-w-xl mx-auto lg:mx-0">
              Through preparation, guidance, and intentional connection. No swiping. 
              No games. Just meaningful preparation for the most important decision of your life.
            </p>

            {/* Countries served badge */}
            <div className="flex flex-wrap gap-2 justify-center lg:justify-start mb-8">
              <span className="inline-flex items-center px-3 py-1.5 bg-emerald-50 rounded-full text-sm font-medium text-emerald-700">
                <MapPinIcon size={14} className="mr-1.5" />
                Uganda
              </span>
              <span className="inline-flex items-center px-3 py-1.5 bg-emerald-50 rounded-full text-sm font-medium text-emerald-700">
                <MapPinIcon size={14} className="mr-1.5" />
                Kenya
              </span>
              <span className="inline-flex items-center px-3 py-1.5 bg-emerald-50 rounded-full text-sm font-medium text-emerald-700">
                <MapPinIcon size={14} className="mr-1.5" />
                Rwanda
              </span>
              <span className="inline-flex items-center px-3 py-1.5 bg-blue-50 rounded-full text-sm font-medium text-blue-700">
                <MapPinIcon size={14} className="mr-1.5" />
                Canada (Diaspora)
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-10">
              <Button
                size="lg"
                onClick={handleGetStarted}
                rightIcon={<ArrowRightIcon size={20} />}
              >
                Begin Your Journey
              </Button>
              <Button variant="outline" size="lg" onClick={handleLearnMore}>
                Learn How It Works
              </Button>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap gap-4 justify-center lg:justify-start">
              <div className="flex items-center text-sm text-gray-600">
                <CheckCircleIcon size={18} className="text-emerald-500 mr-2" />
                Human-verified profiles
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <CheckCircleIcon size={18} className="text-emerald-500 mr-2" />
                Expert-led courses
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <CheckCircleIcon size={18} className="text-emerald-500 mr-2" />
                Location-aware matching
              </div>
            </div>
          </div>

          {/* Hero Image */}
          <div className="relative">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl">
              <img
                src={IMAGES.hero}
                alt="Couple having meaningful conversation"
                className="w-full h-auto object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1e3a5f]/20 to-transparent" />
            </div>

            {/* Floating card */}
            <div className="absolute -bottom-6 -left-6 bg-white rounded-xl shadow-lg p-4 max-w-[220px] hidden sm:block">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                  <UsersIcon size={20} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#1e3a5f]">10+</p>
                  <p className="text-xs text-gray-500">Successful Matches</p>
                </div>
              </div>
            </div>

            {/* Location floating card */}
            <div className="absolute -top-4 -right-4 bg-white rounded-xl shadow-lg p-3 hidden sm:block">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <GlobeIcon size={16} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1e3a5f]">4 Countries</p>
                  <p className="text-xs text-gray-500">East Africa & Diaspora</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-16 pt-12 border-t border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <p className="text-3xl sm:text-4xl font-bold text-[#1e3a5f]">{stat.value}</p>
                <p className="text-sm text-gray-600 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
