import React, { useEffect, useState } from 'react';
import { getListedCoaches } from '@/lib/coachingService';
import type { ListedCoach } from '@/types/coaching';
import { Button } from '../ui/button';
import { useAppStore } from '@/lib/store';
import { CheckCircleIcon, AwardIcon, BookIcon, UsersIcon, MapPinIcon } from '../ui/Icons';

export const CoachesSection: React.FC = () => {
  const { setCurrentView, isAuthenticated, setShowAuthModal, setAuthModalMode } = useAppStore();
  const [coaches, setCoaches] = useState<ListedCoach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getListedCoaches().then((result) => { if (active) setCoaches(result); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load coaches.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const handleMeetCoaches = () => {
    if (isAuthenticated) setCurrentView('coaching');
    else { setAuthModalMode('signup'); setShowAuthModal(true); }
  };
  const benefits = [
    { icon: BookIcon, title: 'Structured Guidance', description: 'Follow proven frameworks for self-discovery and growth' },
    { icon: UsersIcon, title: 'Personal Attention', description: 'One-on-one sessions tailored to your unique journey' },
    { icon: AwardIcon, title: 'Expert Insight', description: 'Learn from qualified coaches and their experience' },
  ];

  return <section className="py-20 bg-[#faf6f1]"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div className="grid lg:grid-cols-2 gap-12 items-center">
    <div><h2 className="text-3xl sm:text-4xl font-bold text-[#1e3a5f] mb-4">Guided by Experts Who Care</h2>
      <p className="text-lg text-gray-600 mb-8">Our coaches provide marriage preparation, relationship guidance, and support across East Africa and the Diaspora.</p>
      <div className="space-y-4 mb-8">{benefits.map((benefit) => { const Icon=benefit.icon; return <div key={benefit.title} className="flex items-start space-x-4"><div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm"><Icon size={20} className="text-[#c4785a]"/></div><div><h4 className="font-semibold text-[#1e3a5f]">{benefit.title}</h4><p className="text-sm text-gray-600">{benefit.description}</p></div></div>; })}</div>
      <Button onClick={handleMeetCoaches}>Meet Our Coaches</Button>
    </div>
    <div className="space-y-6">
      {loading ? <p role="status" className="bg-white rounded-xl p-6 text-gray-500">Loading coaches…</p> :
       error ? <p role="alert" className="bg-white rounded-xl p-6 text-red-700">{error}</p> :
       coaches.length===0 ? <p className="bg-white rounded-xl p-6 text-gray-600">Our coaching team is being prepared. Please check back soon.</p> :
       coaches.slice(0,2).map((coach) => <article key={coach.id} className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start space-x-4">{coach.profile_image_url ? <img src={coach.profile_image_url} alt="" className="w-20 h-20 rounded-xl object-cover"/> : <div className="w-20 h-20 rounded-xl bg-[#faf6f1]"/>}
          <div className="flex-1"><h3 className="text-lg font-semibold text-[#1e3a5f]">{coach.display_name}</h3>{coach.title && <p className="text-[#c4785a] text-sm font-medium">{coach.title}</p>}
            <div className="flex items-center text-sm text-gray-500 mt-1 mb-3"><MapPinIcon size={14} className="mr-1"/>{[coach.city,coach.country_code].filter(Boolean).join(', ') || 'Location not provided'}</div>
            <span className="inline-flex items-center px-2 py-1 bg-[#faf6f1] rounded text-xs text-gray-600"><CheckCircleIcon size={12} className="text-emerald-500 mr-1"/>{coach.default_session_minutes} minute sessions</span>
            <div className="flex flex-wrap gap-2 mt-3">{coach.specialties.map((item) => <span key={item} className="px-2 py-1 bg-[#1e3a5f]/5 rounded text-xs text-[#1e3a5f] font-medium">{item}</span>)}</div>
          </div>
        </div>
       </article>)}
      {!loading && !error && coaches.length>2 && <p className="text-center p-4 bg-[#1e3a5f]/5 rounded-xl text-sm text-gray-600">Meet more coaches in the Coaching section.</p>}
    </div>
  </div></div></section>;
};
