import React from 'react';
import { useAppStore } from '@/lib/store';
import { Button } from '../ui/button';
import { IMAGES } from '@/lib/constants';
import {
  BookIcon,
  UsersIcon,
  SparklesIcon,
  HeartIcon,
  ShieldIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  LockIcon,
} from '../ui/Icons';

export const FeaturesSection: React.FC = () => {
  const { setCurrentView, isAuthenticated, setShowAuthModal, setAuthModalMode } = useAppStore();

  const handleFeatureClick = (view: string) => {
    if (isAuthenticated) {
      setCurrentView(view);
    } else {
      setAuthModalMode('signup');
      setShowAuthModal(true);
    }
  };

  const features = [
    {
      id: 'education',
      icon: BookIcon,
      title: 'Marriage Courses',
      description: 'Expert-designed curriculum covering marriage readiness, communication, character development, and conflict resolution.',
      highlights: ['5 Core Modules', 'Video & Reflection', 'Progress Tracking', 'Certificates'],
      image: IMAGES.journey,
      color: 'from-blue-500 to-blue-600',
    },
    {
      id: 'community',
      icon: UsersIcon,
      title: 'Moderated Community',
      description: 'Connect with others on the same journey in tiered, small group moderated spaces. Share experiences while keeping contact details private.',
      highlights: ['Open Discussions', 'Guided Groups', 'Preparation Circles', 'Safe Spaces'],
      image: IMAGES.community,
      color: 'from-emerald-500 to-emerald-600',
    },
    {
      id: 'coaching',
      icon: SparklesIcon,
      title: 'Coaching & Guidance',
      description: 'AI-guided journaling for daily reflection, with human coaches available for deeper conversations and sensitive situations.',
      highlights: ['AI Journaling', 'Human Coaches', 'Personal Growth', 'Crisis Support'],
      image: IMAGES.coaches[0],
      color: 'from-amber-500 to-amber-600',
    },
    {
      id: 'matchmaking',
      icon: HeartIcon,
      title: 'Intentional Matching',
      description: 'Readiness-gated introductions based on values alignment. Every match is human-reviewed before connection.',
      highlights: ['Values-Based', 'Human Review', 'Limited Intros', 'Mutual Readiness'],
      image: IMAGES.hero,
      color: 'from-rose-500 to-rose-600',
      locked: true,
    },
  ];

  return (
    <section className="py-20 bg-[#faf6f1]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#1e3a5f] mb-4">
            Everything You Need to Prepare
          </h2>
          <p className="text-lg text-gray-600">
            A complete ecosystem for marriage preparation. Each module builds on the last, 
            creating a comprehensive journey toward readiness.
          </p>
        </div>

        {/* Features grid */}
        <div className="grid md:grid-cols-2 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.id}
                className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 group"
              >
                {/* Image header */}
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={feature.image}
                    alt={feature.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-60`} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                      <Icon size={32} className="text-white" />
                    </div>
                  </div>
                  {feature.locked && (
                    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full flex items-center space-x-1">
                      <LockIcon size={14} className="text-gray-600" />
                      <span className="text-xs font-medium text-gray-600">Unlocks with progress</span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-6">
                  <h3 className="text-xl font-bold text-[#1e3a5f] mb-3">{feature.title}</h3>
                  <p className="text-gray-600 mb-4">{feature.description}</p>

                  {/* Highlights */}
                  <div className="grid grid-cols-2 gap-2 mb-6">
                    {feature.highlights.map((highlight, i) => (
                      <div key={i} className="flex items-center text-sm text-gray-600">
                        <CheckCircleIcon size={16} className="text-emerald-500 mr-2 flex-shrink-0" />
                        {highlight}
                      </div>
                    ))}
                  </div>

                  <Button
                    variant={feature.locked ? 'outline' : 'primary'}
                    fullWidth
                    onClick={() => handleFeatureClick(feature.id)}
                    rightIcon={<ArrowRightIcon size={18} />}
                  >
                    {feature.locked ? 'Learn More' : 'Explore'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Trust banner */}
        <div className="mt-16 bg-[#1e3a5f] rounded-2xl p-8 lg:p-12 text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-white/10 rounded-xl flex items-center justify-center">
              <ShieldIcon size={32} className="text-[#c4785a]" />
            </div>
          </div>
          <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Your Safety is Our Priority
          </h3>
          <p className="text-white/80 max-w-2xl mx-auto mb-8">
            Every profile is verified. Every community space is moderated. Every match is human-reviewed. 
            We've built Uncle Bashi with safety at its core, because trust is the foundation of lasting relationships.
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            <div className="flex items-center text-white/90">
              <CheckCircleIcon size={20} className="text-emerald-400 mr-2" />
              Identity Verification
            </div>
            <div className="flex items-center text-white/90">
              <CheckCircleIcon size={20} className="text-emerald-400 mr-2" />
              24/7 Moderation
            </div>
            <div className="flex items-center text-white/90">
              <CheckCircleIcon size={20} className="text-emerald-400 mr-2" />
              Crisis Support
            </div>
            <div className="flex items-center text-white/90">
              <CheckCircleIcon size={20} className="text-emerald-400 mr-2" />
              Data Protection
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
