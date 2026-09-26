import React, { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { Button } from '../ui/button';
import { IMAGES } from '@/lib/constants';
import { useGeolocation, COUNTRY_NAMES, type LocationCategory } from '@/hooks/useGeolocation';
import {
  SparklesIcon,
  BookIcon,
  CalendarIcon,
  UserIcon,
  SendIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  MapPinIcon,
} from '../ui/Icons';

interface Coach {
  id: string;
  name: string;
  title: string;
  image: string;
  specialties: string[];
  availability: string;
  rating: number;
  sessions: number;
  location: string;
  countryCode: string;
  category: LocationCategory;
  languages: string[];
}

export const CoachingHub: React.FC = () => {
  const { user, journalEntries, addJournalEntry } = useAppStore();
  const { location: userLocation } = useGeolocation();
  const [activeTab, setActiveTab] = useState<'journal' | 'coaches' | 'sessions'>('journal');
  const [journalPrompt, setJournalPrompt] = useState('');
  const [journalResponse, setJournalResponse] = useState('');
  const [aiReflection, setAiReflection] = useState('');
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [isLoadingReflection, setIsLoadingReflection] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);
  const [filterCountry, setFilterCountry] = useState<string>('');

  // Coaches from pilot countries
  const coaches: Coach[] = [
    // Uganda coaches
    {
      id: '1',
      name: 'Dr. Patricia Namubiru',
      title: 'Lead Marriage Counselor',
      image: IMAGES.coaches[0],
      specialties: ['Pre-marital Counseling', 'Communication', 'Conflict Resolution'],
      availability: 'Mon, Wed, Fri',
      rating: 4.9,
      sessions: 500,
      location: 'Kampala, Uganda',
      countryCode: 'UG',
      category: 'local',
      languages: ['English', 'Luganda'],
    },
    {
      id: '2',
      name: 'Rev. James Okello',
      title: 'Spiritual Guidance Coach',
      image: IMAGES.coaches[1],
      specialties: ['Faith & Marriage', 'Values Alignment', 'Family Building'],
      availability: 'Tue, Thu, Sat',
      rating: 4.8,
      sessions: 350,
      location: 'Entebbe, Uganda',
      countryCode: 'UG',
      category: 'local',
      languages: ['English', 'Luganda', 'Swahili'],
    },
    // Kenya coaches
    {
      id: '3',
      name: 'Dr. Wanjiku Mwangi',
      title: 'Relationship Psychologist',
      image: IMAGES.coaches[0],
      specialties: ['Attachment Styles', 'Emotional Intelligence', 'Communication'],
      availability: 'Mon, Tue, Thu',
      rating: 4.9,
      sessions: 420,
      location: 'Nairobi, Kenya',
      countryCode: 'KE',
      category: 'local',
      languages: ['English', 'Swahili'],
    },
    {
      id: '4',
      name: 'Pastor David Ochieng',
      title: 'Family Life Coach',
      image: IMAGES.coaches[1],
      specialties: ['Pre-marital Preparation', 'Family Values', 'Spiritual Growth'],
      availability: 'Wed, Fri, Sat',
      rating: 4.7,
      sessions: 280,
      location: 'Mombasa, Kenya',
      countryCode: 'KE',
      category: 'local',
      languages: ['English', 'Swahili'],
    },
    // Rwanda coaches
    {
      id: '5',
      name: 'Dr. Claudine Uwimana',
      title: 'Marriage & Family Therapist',
      image: IMAGES.coaches[0],
      specialties: ['Cultural Integration', 'Conflict Resolution', 'Family Dynamics'],
      availability: 'Mon, Wed, Fri',
      rating: 4.8,
      sessions: 310,
      location: 'Kigali, Rwanda',
      countryCode: 'RW',
      category: 'local',
      languages: ['English', 'French', 'Kinyarwanda'],
    },
    // Canada (Diaspora) coaches
    {
      id: '6',
      name: 'Dr. Emmanuel Okonkwo',
      title: 'Diaspora Family Specialist',
      image: IMAGES.coaches[1],
      specialties: ['Cultural Identity', 'Diaspora Relationships', 'Intercultural Marriage'],
      availability: 'Tue, Thu, Sat',
      rating: 4.9,
      sessions: 450,
      location: 'Toronto, Canada',
      countryCode: 'CA',
      category: 'diaspora',
      languages: ['English', 'French'],
    },
    {
      id: '7',
      name: 'Dr. Amina Hassan',
      title: 'Cross-Cultural Counselor',
      image: IMAGES.coaches[0],
      specialties: ['Diaspora Identity', 'Blended Families', 'Long-Distance Relationships'],
      availability: 'Mon, Wed, Fri',
      rating: 4.8,
      sessions: 380,
      location: 'Vancouver, Canada',
      countryCode: 'CA',
      category: 'diaspora',
      languages: ['English', 'Swahili', 'French'],
    },
  ];

  // Sort coaches by proximity to user
  const sortedCoaches = [...coaches].sort((a, b) => {
    if (!userLocation?.countryCode) return 0;
    
    // Same country first
    const aInSameCountry = a.countryCode === userLocation.countryCode;
    const bInSameCountry = b.countryCode === userLocation.countryCode;
    
    if (aInSameCountry && !bInSameCountry) return -1;
    if (!aInSameCountry && bInSameCountry) return 1;
    
    // Same category second
    if (a.category === userLocation.category && b.category !== userLocation.category) return -1;
    if (a.category !== userLocation.category && b.category === userLocation.category) return 1;
    
    return 0;
  });

  // Filter coaches
  const filteredCoaches = filterCountry 
    ? sortedCoaches.filter(c => c.countryCode === filterCountry)
    : sortedCoaches;

  const fetchDailyPrompt = async () => {
    setIsLoadingPrompt(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-coaching', {
        body: { type: 'daily_prompt' },
      });

      if (error) throw error;
      setJournalPrompt(data.response);
    } catch (error) {
      console.error('Error fetching prompt:', error);
      setJournalPrompt('What aspects of your character would you like to develop before marriage?');
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  const getAiReflection = async () => {
    if (!journalResponse.trim()) return;

    setIsLoadingReflection(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-coaching', {
        body: {
          type: 'journal_reflection',
          journalEntry: journalResponse,
        },
      });

      if (error) throw error;
      setAiReflection(data.response);
    } catch (error) {
      console.error('Error getting reflection:', error);
      setAiReflection('Thank you for sharing. Your reflection shows thoughtful self-awareness. Consider how these insights might guide your preparation journey.');
    } finally {
      setIsLoadingReflection(false);
    }
  };

  const saveJournalEntry = () => {
    if (!journalResponse.trim()) return;

    const entry = {
      id: Date.now().toString(),
      prompt: journalPrompt,
      response: journalResponse,
      aiReflection: aiReflection,
      createdAt: new Date().toISOString(),
    };

    addJournalEntry(entry);
    setJournalPrompt('');
    setJournalResponse('');
    setAiReflection('');
  };

  const handleBookSession = (coach: Coach) => {
    setSelectedCoach(coach);
    setShowBooking(true);
  };

  const getCategoryLabel = (category: LocationCategory) => {
    switch (category) {
      case 'local':
        return 'East Africa';
      case 'diaspora':
        return 'Diaspora';
      default:
        return 'Other';
    }
  };

  const getCategoryColor = (category: LocationCategory) => {
    switch (category) {
      case 'local':
        return 'bg-emerald-100 text-emerald-700';
      case 'diaspora':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="min-h-screen bg-[#faf6f1] py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1e3a5f] mb-2">Coaching & Guidance</h1>
          <p className="text-gray-600">
            AI-guided reflection and access to human coaches across East Africa and the Diaspora.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-white rounded-xl p-1 mb-8 shadow-sm">
          {[
            { id: 'journal', label: 'AI Journaling', icon: SparklesIcon },
            { id: 'coaches', label: 'Our Coaches', icon: UserIcon },
            { id: 'sessions', label: 'My Sessions', icon: CalendarIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-lg font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[#1e3a5f] text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon size={18} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Journal Tab */}
        {activeTab === 'journal' && (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Journal writing area */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-[#1e3a5f]">Today's Reflection</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchDailyPrompt}
                    isLoading={isLoadingPrompt}
                  >
                    <SparklesIcon size={16} className="mr-2" />
                    Get Prompt
                  </Button>
                </div>

                {/* Prompt */}
                {journalPrompt && (
                  <div className="bg-[#faf6f1] rounded-xl p-4 mb-6">
                    <p className="text-sm font-medium text-[#c4785a] mb-2">Today's Prompt</p>
                    <p className="text-[#1e3a5f] italic">"{journalPrompt}"</p>
                  </div>
                )}

                {/* Journal input */}
                <textarea
                  value={journalResponse}
                  onChange={(e) => setJournalResponse(e.target.value)}
                  placeholder="Write your thoughts here... Take your time to reflect deeply."
                  rows={8}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent resize-none mb-4"
                />

                {/* AI Reflection */}
                {aiReflection && (
                  <div className="bg-blue-50 rounded-xl p-4 mb-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <SparklesIcon size={16} className="text-blue-600" />
                      <p className="text-sm font-medium text-blue-800">AI Reflection</p>
                    </div>
                    <p className="text-blue-700 text-sm">{aiReflection}</p>
                  </div>
                )}

                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    onClick={getAiReflection}
                    disabled={!journalResponse.trim()}
                    isLoading={isLoadingReflection}
                  >
                    <SparklesIcon size={16} className="mr-2" />
                    Get AI Insight
                  </Button>
                  <Button
                    onClick={saveJournalEntry}
                    disabled={!journalResponse.trim()}
                  >
                    Save Entry
                  </Button>
                </div>

                {/* Crisis notice */}
                <div className="mt-6 p-4 bg-amber-50 rounded-xl flex items-start space-x-3">
                  <AlertCircleIcon size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Need to talk to someone?</p>
                    <p className="text-sm text-amber-700">
                      If you're experiencing a crisis or need immediate support, please reach out to a human coach.
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-amber-700"
                      onClick={() => setActiveTab('coaches')}
                    >
                      Connect with a Coach →
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Past entries */}
            <div>
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <h3 className="font-semibold text-[#1e3a5f] mb-4">Past Entries</h3>
                {journalEntries.length === 0 ? (
                  <div className="text-center py-8">
                    <BookIcon size={32} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">No entries yet</p>
                    <p className="text-gray-400 text-xs">Start journaling to see your history</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {journalEntries.slice(0, 5).map((entry) => (
                      <div
                        key={entry.id}
                        className="p-3 bg-[#faf6f1] rounded-lg cursor-pointer hover:bg-[#f0e8df] transition-colors"
                      >
                        <p className="text-xs text-gray-500 mb-1">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </p>
                        <p className="text-sm text-[#1e3a5f] line-clamp-2">{entry.response}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Coaches Tab */}
        {activeTab === 'coaches' && (
          <div>
            {/* Location filter */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-2">
                  <MapPinIcon size={18} className="text-[#c4785a]" />
                  <span className="text-sm text-gray-600">
                    {userLocation 
                      ? `Showing coaches near ${userLocation.city || userLocation.country} first`
                      : 'Set your location to see nearby coaches first'}
                  </span>
                </div>
                <select
                  value={filterCountry}
                  onChange={(e) => setFilterCountry(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent text-sm"
                >
                  <option value="">All Locations</option>
                  <optgroup label="East Africa">
                    <option value="UG">Uganda</option>
                    <option value="KE">Kenya</option>
                    <option value="RW">Rwanda</option>
                  </optgroup>
                  <optgroup label="Diaspora">
                    <option value="CA">Canada</option>
                  </optgroup>
                </select>
              </div>
            </div>

            {/* Coaches grid */}
            <div className="grid md:grid-cols-2 gap-6">
              {filteredCoaches.map((coach) => (
                <div key={coach.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-6">
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
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(coach.category)}`}>
                            {getCategoryLabel(coach.category)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 mt-2 text-sm text-gray-500">
                          <MapPinIcon size={14} className="text-gray-400" />
                          <span>{coach.location}</span>
                        </div>
                        <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500">
                          <span className="flex items-center">
                            <CheckCircleIcon size={14} className="text-emerald-500 mr-1" />
                            {coach.sessions}+ sessions
                          </span>
                          <span>★ {coach.rating}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                        Specialties
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {coach.specialties.map((specialty, i) => (
                          <span
                            key={i}
                            className="px-2 py-1 bg-[#faf6f1] rounded text-xs text-[#1e3a5f]"
                          >
                            {specialty}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                        Languages
                      </p>
                      <p className="text-sm text-gray-600">{coach.languages.join(', ')}</p>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center text-sm text-gray-500">
                        <ClockIcon size={14} className="mr-1" />
                        Available: {coach.availability}
                      </div>
                      <Button size="sm" onClick={() => handleBookSession(coach)}>
                        Book Session
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredCoaches.length === 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
                <UserIcon size={48} className="text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-600 mb-2">No coaches found</h3>
                <p className="text-gray-500 mb-4">
                  Try selecting a different location filter.
                </p>
                <Button variant="outline" onClick={() => setFilterCountry('')}>
                  Show All Coaches
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Sessions Tab */}
        {activeTab === 'sessions' && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-[#1e3a5f] mb-6">My Sessions</h2>
            <div className="text-center py-12">
              <CalendarIcon size={48} className="text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">No sessions scheduled</h3>
              <p className="text-gray-500 mb-4">Book a session with one of our coaches to get started.</p>
              <Button onClick={() => setActiveTab('coaches')}>
                Browse Coaches
              </Button>
            </div>
          </div>
        )}

        {/* Booking Modal */}
        {showBooking && selectedCoach && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowBooking(false)} />
            <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold text-[#1e3a5f] mb-2">
                Book Session with {selectedCoach.name}
              </h3>
              <p className="text-sm text-gray-500 mb-4 flex items-center">
                <MapPinIcon size={14} className="mr-1" />
                {selectedCoach.location}
              </p>
              <p className="text-gray-600 mb-6">
                Select a time that works for you. Sessions are 45 minutes and conducted via video call.
              </p>

              <div className="space-y-3 mb-6">
                {['Monday 10:00 AM', 'Wednesday 2:00 PM', 'Friday 11:00 AM'].map((time) => (
                  <button
                    key={time}
                    className="w-full p-3 border border-gray-200 rounded-lg text-left hover:border-[#c4785a] hover:bg-[#faf6f1] transition-colors"
                  >
                    <span className="font-medium text-[#1e3a5f]">{time}</span>
                    <span className="text-sm text-gray-500 ml-2">
                      ({selectedCoach.countryCode === 'CA' ? 'EST' : 'EAT'})
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex space-x-3">
                <Button variant="outline" fullWidth onClick={() => setShowBooking(false)}>
                  Cancel
                </Button>
                <Button fullWidth onClick={() => {
                  alert('Session request submitted! The coach will confirm shortly.');
                  setShowBooking(false);
                }}>
                  Request Session
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
