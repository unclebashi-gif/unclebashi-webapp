import React from 'react';
import { Button } from '../ui/Button';
import { useAppStore } from '@/lib/store';
import { ArrowRightIcon, HeartIcon, ShieldIcon, BookIcon } from '../ui/Icons';

export const CTASection: React.FC = () => {
  const { setShowAuthModal, setAuthModalMode, isAuthenticated, setCurrentView } = useAppStore();

  const handleGetStarted = () => {
    if (isAuthenticated) {
      setCurrentView('education');
    } else {
      setAuthModalMode('signup');
      setShowAuthModal(true);
    }
  };

  const benefits = [
    { icon: BookIcon, text: 'Access all courses' },
    { icon: ShieldIcon, text: 'Verified community' },
    { icon: HeartIcon, text: 'Intentional matching' },
  ];

  return (
    <section className="py-20 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-br from-[#1e3a5f] to-[#2d4a6f] rounded-3xl p-8 lg:p-12 text-center relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-white/5 rounded-full" />
            <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-white/5 rounded-full" />
          </div>

          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-6">
              <HeartIcon size={32} className="text-[#c4785a]" />
            </div>

            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ready to Begin Your Journey?
            </h2>
            <p className="text-white/80 text-lg mb-8 max-w-2xl mx-auto">
              Join thousands of serious singles who are preparing for marriage the right way. 
              Your future relationship deserves this investment.
            </p>

            {/* Benefits */}
            <div className="flex flex-wrap justify-center gap-6 mb-8">
              {benefits.map((benefit, index) => {
                const Icon = benefit.icon;
                return (
                  <div key={index} className="flex items-center text-white/90">
                    <Icon size={20} className="text-[#c4785a] mr-2" />
                    {benefit.text}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                variant="secondary"
                onClick={handleGetStarted}
                rightIcon={<ArrowRightIcon size={20} />}
              >
                Start Free Today
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-white border-white/30 hover:bg-white/10"
                onClick={() => {
                  const element = document.getElementById('how-it-works');
                  element?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Learn More
              </Button>
            </div>

            <p className="mt-6 text-sm text-white/60">
              No credit card required. Start with our free courses.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
