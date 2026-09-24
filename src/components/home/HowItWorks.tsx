import React from 'react';
import { IMAGES } from '@/lib/constants';
import { UserIcon, BookIcon, UsersIcon, HeartIcon, ShieldIcon, CheckCircleIcon } from '../ui/Icons';

export const HowItWorks: React.FC = () => {
  const steps = [
    {
      number: '01',
      icon: UserIcon,
      title: 'Create Your Profile',
      description: 'Complete our structured onboarding to share your values, intentions, and readiness level. We ask thoughtful questions to understand who you truly are.',
      color: 'bg-blue-50 text-blue-600',
    },
    {
      number: '02',
      icon: BookIcon,
      title: 'Complete Preparation',
      description: 'Work through our expert-designed courses on marriage readiness, communication, and character. Build the foundation for a lasting relationship.',
      color: 'bg-amber-50 text-amber-600',
    },
    {
      number: '03',
      icon: UsersIcon,
      title: 'Connect',
      description: 'Connect with others on the same journey in our moderated spaces. Learn from shared experiences while your contact details remain private.This is voluntary!',
      color: 'bg-emerald-50 text-emerald-600',
    },
    {
      number: '04',
      icon: HeartIcon,
      title: 'Intentional Matching',
      description: 'Once prepared, receive carefully selected introductions based on values alignment. Every connection is human-reviewed before messaging begins.',
      color: 'bg-rose-50 text-rose-600',
    },
  ];

  const principles = [
    {
      icon: ShieldIcon,
      title: 'Accountability Before Privacy',
      description: 'Every profile is verified. Every introduction is reviewed. Trust is built through transparency.',
    },
    {
      icon: BookIcon,
      title: 'Preparation Before Connection',
      description: 'Complete courses demonstrate commitment. Readiness is earned, not assumed.',
    },
    {
      icon: UsersIcon,
      title: 'Human Oversight Always',
      description: 'Real coaches review matches. Moderators protect the community. Technology serves, not replaces.',
    },
  ];

  return (
    <section id="how-it-works" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#1e3a5f] mb-4">
            How Uncle Bashi Works
          </h2>
          <p className="text-lg text-gray-600">
            A structured journey from self-discovery to meaningful connection. 
            No shortcuts. No compromises. Just intentional preparation.
          </p>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-20">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={index} className="relative">
                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-12 left-full w-full h-0.5 bg-gray-200 -translate-y-1/2 z-0">
                    <div className="absolute right-0 w-2 h-2 bg-gray-300 rounded-full -translate-y-1/2 translate-x-1/2" />
                  </div>
                )}

                <div className="relative z-10 bg-white">
                  <div className={`w-12 h-12 ${step.color} rounded-xl flex items-center justify-center mb-4`}>
                    <Icon size={24} />
                  </div>
                  <span className="text-xs font-bold text-gray-400 tracking-wider">STEP {step.number}</span>
                  <h3 className="text-xl font-semibold text-[#1e3a5f] mt-2 mb-3">{step.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Principles section */}
        <div className="bg-[#faf6f1] rounded-2xl p-8 lg:p-12">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-2xl sm:text-3xl font-bold text-[#1e3a5f] mb-6">
                Our Guiding Principles
              </h3>
              <p className="text-gray-600 mb-8">
                Uncle Bashi is built on the belief that lasting marriages require intentional preparation. 
                We've designed every feature to support this mission.
              </p>

              <div className="space-y-6">
                {principles.map((principle, index) => {
                  const Icon = principle.icon;
                  return (
                    <div key={index} className="flex items-start space-x-4">
                      <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Icon size={20} className="text-[#c4785a]" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-[#1e3a5f] mb-1">{principle.title}</h4>
                        <p className="text-sm text-gray-600">{principle.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="relative">
              <img
                src={IMAGES.family}
                alt="Happy family"
                className="rounded-xl shadow-lg w-full"
              />
              <div className="absolute -bottom-4 -right-4 bg-white rounded-lg shadow-lg p-4 max-w-[180px]">
                <div className="flex items-center space-x-2 mb-2">
                  <CheckCircleIcon size={20} className="text-emerald-500" />
                  <span className="text-sm font-medium text-[#1e3a5f]">Trust First</span>
                </div>
                <p className="text-xs text-gray-500">Every step builds confidence and safety</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
