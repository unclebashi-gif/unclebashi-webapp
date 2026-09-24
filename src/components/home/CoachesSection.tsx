import React from 'react';
import { IMAGES } from '@/lib/constants';
import { Button } from '../ui/Button';
import { useAppStore } from '@/lib/store';
import { CheckCircleIcon, AwardIcon, BookIcon, UsersIcon, MapPinIcon } from '../ui/Icons';

export const CoachesSection: React.FC = () => {
  const { setCurrentView, isAuthenticated, setShowAuthModal, setAuthModalMode } = useAppStore();

  const handleMeetCoaches = () => {
    if (isAuthenticated) {
      setCurrentView('coaching');
    } else {
      setAuthModalMode('signup');
      setShowAuthModal(true);
    }
  };

  const coaches = [
    {
      name: 'Dr. Patricia Namubiru',
      title: 'Lead Marriage Counselor',
      image: IMAGES.coaches[0],
      location: 'Kampala, Uganda',
      region: 'East Africa',
      credentials: ['Ph.D. Family Therapy', '25+ Years Experience', 'Author of 3 Books'],
      specialties: ['Pre-marital Counseling', 'Communication', 'Conflict Resolution'],
    },
    {
      name: 'Dr. Emmanuel Okonkwo',
      title: 'Diaspora Family Specialist',
      image: IMAGES.coaches[1],
      location: 'Toronto, Canada',
      region: 'Diaspora',
      credentials: ['M.Div. Theology', '20+ Years Ministry', 'Certified Coach'],
      specialties: ['Cultural Identity', 'Diaspora Relationships', 'Intercultural Marriage'],
    },
  ];

  const coachingBenefits = [
    {
      icon: BookIcon,
      title: 'Structured Guidance',
      description: 'Follow proven frameworks for self-discovery and growth',
    },
    {
      icon: UsersIcon,
      title: 'Personal Attention',
      description: 'One-on-one sessions tailored to your unique journey',
    },
    {
      icon: AwardIcon,
      title: 'Expert Insight',
      description: 'Learn from decades of combined experience',
    },
  ];

  return (
    <section className="py-20 bg-[#faf6f1]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#1e3a5f] mb-4">
              Guided by Experts Who Care
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              Our coaches bring decades of experience in marriage counseling, family therapy, 
              and spiritual guidance. With coaches across East Africa and the Diaspora, 
              they're here to support your journey with wisdom and compassion.
            </p>

            {/* Benefits */}
            <div className="space-y-4 mb-8">
              {coachingBenefits.map((benefit, index) => {
                const Icon = benefit.icon;
                return (
                  <div key={index} className="flex items-start space-x-4">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Icon size={20} className="text-[#c4785a]" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-[#1e3a5f]">{benefit.title}</h4>
                      <p className="text-sm text-gray-600">{benefit.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button onClick={handleMeetCoaches}>
              Meet Our Coaches
            </Button>
          </div>

          {/* Coaches cards */}
          <div className="space-y-6">
            {coaches.map((coach, index) => (
              <div
                key={index}
                className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300"
              >
                <div className="flex items-start space-x-4">
                  <img
                    src={coach.image}
                    alt={coach.name}
                    className="w-20 h-20 rounded-xl object-cover"
                  />
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-[#1e3a5f]">{coach.name}</h3>
                        <p className="text-[#c4785a] text-sm font-medium">{coach.title}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        coach.region === 'East Africa' 
                          ? 'bg-emerald-100 text-emerald-700' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {coach.region}
                      </span>
                    </div>
                    
                    {/* Location */}
                    <div className="flex items-center text-sm text-gray-500 mt-1 mb-3">
                      <MapPinIcon size={14} className="mr-1" />
                      {coach.location}
                    </div>
                    
                    {/* Credentials */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {coach.credentials.map((credential, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center px-2 py-1 bg-[#faf6f1] rounded text-xs text-gray-600"
                        >
                          <CheckCircleIcon size={12} className="text-emerald-500 mr-1" />
                          {credential}
                        </span>
                      ))}
                    </div>

                    {/* Specialties */}
                    <div className="flex flex-wrap gap-2">
                      {coach.specialties.map((specialty, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 bg-[#1e3a5f]/5 rounded text-xs text-[#1e3a5f] font-medium"
                        >
                          {specialty}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {/* More coaches teaser */}
            <div className="text-center p-4 bg-[#1e3a5f]/5 rounded-xl">
              <p className="text-sm text-gray-600">
                Plus coaches in <span className="font-medium text-[#1e3a5f]">Nairobi, Kigali, Vancouver</span> and more
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
