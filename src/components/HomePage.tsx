import React from 'react';
import { useAppStore } from '@/lib/store';
import { HeroSection } from './home/HeroSection';
import { HowItWorks } from './home/HowItWorks';
import { FeaturesSection } from './home/FeaturesSection';
import { TestimonialsSection } from './home/TestimonialsSection';
import { CoachesSection } from './home/CoachesSection';
import { CTASection } from './home/CTASection';
import { ContinueWatching } from './dashboard/ContinueWatching';

export const HomePage: React.FC = () => {
  const { isAuthenticated } = useAppStore();

  return (
    <div>
      {/* Show Continue Watching section for authenticated users */}
      {isAuthenticated && (
        <div className="bg-[#faf6f1] py-8">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <ContinueWatching />
          </div>
        </div>
      )}
      
      <HeroSection />
      <HowItWorks />
      <FeaturesSection />
      <TestimonialsSection />
      <CoachesSection />
      <CTASection />
    </div>
  );
};
