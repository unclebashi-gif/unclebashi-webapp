import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { Button } from '../ui/button';
import { ProfileCard } from '../ui/card';
import { ProgressBar } from '../ui/ProgressBar';
import { LocationSelector } from '../location/LocationSelector';
import { IMAGES } from '@/lib/constants';
import {
  useGeolocation,
  sortByProximity,
  PILOT_COUNTRIES,
  COUNTRY_NAMES,
  type LocationCategory,
} from '@/hooks/useGeolocation';
import {
  HeartIcon,
  PlayIcon,
  CheckCircleIcon,
  ShieldIcon,
  UserIcon,
  MapPinIcon,
  FilterIcon,
  SearchIcon,
  CloseIcon,
  BookIcon,
  ClockIcon,
} from '../ui/Icons';

// Extended profile type with location data
interface ProfileWithLocation {
  id: string;
  name: string;
  age: number;
  location: string;
  city: string;
  countryCode: string;
  category: LocationCategory;
  profileImage: string;
  valuesSummary: string;
  intentionsStatement: string;
  readinessScore: number;
  coursesCompleted: number;
}

export const MatchmakingHub: React.FC = () => {
  const { user, setCurrentView } = useAppStore();
  const { location: userLocation } = useGeolocation();
  const [selectedProfile, setSelectedProfile] = useState<ProfileWithLocation | null>(null);
  const [introRequested, setIntroRequested] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Location filters
  const [filterCountry, setFilterCountry] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<LocationCategory | ''>('');

  // Recommendation popup states (non-blocking)
  const [showCourseRecommendation, setShowCourseRecommendation] = useState(false);
  const [showVideoRecommendation, setShowVideoRecommendation] = useState(false);
  const [dismissedCoursePopup, setDismissedCoursePopup] = useState(false);
  const [dismissedVideoPopup, setDismissedVideoPopup] = useState(false);

  // Check user progress (for recommendations, not blocking)
  const hasLowReadiness = (user?.readinessScore || 0) < 50;
  const hasNotCompletedOverview = (user?.readinessScore || 0) < 20;

  // Show gentle recommendations after a delay (non-blocking)
  useEffect(() => {
    if (hasLowReadiness && !dismissedCoursePopup) {
      const timer = setTimeout(() => {
        setShowCourseRecommendation(true);
      }, 5000); // Show after 5 seconds of browsing
      return () => clearTimeout(timer);
    }
  }, [hasLowReadiness, dismissedCoursePopup]);

  useEffect(() => {
    if (hasNotCompletedOverview && !dismissedVideoPopup && !showCourseRecommendation) {
      const timer = setTimeout(() => {
        setShowVideoRecommendation(true);
      }, 15000); // Show after 15 seconds
      return () => clearTimeout(timer);
    }
  }, [hasNotCompletedOverview, dismissedVideoPopup, showCourseRecommendation]);

  // Sample profiles with pilot country locations
  const sampleProfiles: ProfileWithLocation[] = [
    // Uganda profiles
    {
      id: '1',
      name: 'Sarah N.',
      age: 29,
      location: 'Kampala, Uganda',
      city: 'Kampala',
      countryCode: 'UG',
      category: 'local',
      profileImage: IMAGES.profiles.women[0],
      valuesSummary: 'Faith, Family, Integrity, Growth',
      intentionsStatement: 'Seeking a partner who values open communication and shared spiritual growth.',
      readinessScore: 85,
      coursesCompleted: 5,
    },
    {
      id: '2',
      name: 'Grace M.',
      age: 27,
      location: 'Entebbe, Uganda',
      city: 'Entebbe',
      countryCode: 'UG',
      category: 'local',
      profileImage: IMAGES.profiles.women[1],
      valuesSummary: 'Education, Service, Respect, Commitment',
      intentionsStatement: 'Looking for a lifelong partner to build a family rooted in mutual respect.',
      readinessScore: 78,
      coursesCompleted: 4,
    },
    // Kenya profiles
    {
      id: '3',
      name: 'Amara W.',
      age: 31,
      location: 'Nairobi, Kenya',
      city: 'Nairobi',
      countryCode: 'KE',
      category: 'local',
      profileImage: IMAGES.profiles.women[2],
      valuesSummary: 'Stability, Communication, Faith, Family',
      intentionsStatement: 'Ready to meet someone serious about building a lasting marriage.',
      readinessScore: 92,
      coursesCompleted: 5,
    },
    {
      id: '4',
      name: 'Faith K.',
      age: 28,
      location: 'Mombasa, Kenya',
      city: 'Mombasa',
      countryCode: 'KE',
      category: 'local',
      profileImage: IMAGES.profiles.women[0],
      valuesSummary: 'Integrity, Growth, Family, Service',
      intentionsStatement: 'Seeking a partner who shares my commitment to personal growth and family values.',
      readinessScore: 88,
      coursesCompleted: 5,
    },
    // Rwanda profiles
    {
      id: '5',
      name: 'Diane U.',
      age: 30,
      location: 'Kigali, Rwanda',
      city: 'Kigali',
      countryCode: 'RW',
      category: 'local',
      profileImage: IMAGES.profiles.women[1],
      valuesSummary: 'Faith, Communication, Stability, Respect',
      intentionsStatement: 'Looking for a thoughtful partner to share life\'s journey.',
      readinessScore: 75,
      coursesCompleted: 4,
    },
    {
      id: '6',
      name: 'Claudine N.',
      age: 26,
      location: 'Butare, Rwanda',
      city: 'Butare',
      countryCode: 'RW',
      category: 'local',
      profileImage: IMAGES.profiles.women[2],
      valuesSummary: 'Commitment, Education, Integrity, Growth',
      intentionsStatement: 'Ready to find a partner who values deep connection and shared goals.',
      readinessScore: 82,
      coursesCompleted: 5,
    },
    // Canada (Diaspora) profiles
    {
      id: '7',
      name: 'Michelle O.',
      age: 32,
      location: 'Toronto, Canada',
      city: 'Toronto',
      countryCode: 'CA',
      category: 'diaspora',
      profileImage: IMAGES.profiles.women[0],
      valuesSummary: 'Faith, Family, Growth, Service',
      intentionsStatement: 'Seeking a partner who understands both African heritage and diaspora life.',
      readinessScore: 90,
      coursesCompleted: 5,
    },
    {
      id: '8',
      name: 'Jennifer A.',
      age: 29,
      location: 'Vancouver, Canada',
      city: 'Vancouver',
      countryCode: 'CA',
      category: 'diaspora',
      profileImage: IMAGES.profiles.women[1],
      valuesSummary: 'Education, Respect, Communication, Family',
      intentionsStatement: 'Looking for someone who values cultural roots while embracing growth.',
      readinessScore: 87,
      coursesCompleted: 5,
    },
    // Male profiles - Uganda
    {
      id: '9',
      name: 'David K.',
      age: 32,
      location: 'Kampala, Uganda',
      city: 'Kampala',
      countryCode: 'UG',
      category: 'local',
      profileImage: IMAGES.profiles.men[0],
      valuesSummary: 'Integrity, Growth, Family, Service',
      intentionsStatement: 'Seeking a partner who shares my commitment to personal growth and family values.',
      readinessScore: 88,
      coursesCompleted: 5,
    },
    {
      id: '10',
      name: 'Joseph M.',
      age: 30,
      location: 'Jinja, Uganda',
      city: 'Jinja',
      countryCode: 'UG',
      category: 'local',
      profileImage: IMAGES.profiles.men[1],
      valuesSummary: 'Faith, Communication, Stability, Respect',
      intentionsStatement: 'Looking for a thoughtful partner to share life\'s journey.',
      readinessScore: 75,
      coursesCompleted: 4,
    },
    // Male profiles - Kenya
    {
      id: '11',
      name: 'Michael O.',
      age: 34,
      location: 'Nairobi, Kenya',
      city: 'Nairobi',
      countryCode: 'KE',
      category: 'local',
      profileImage: IMAGES.profiles.men[2],
      valuesSummary: 'Commitment, Education, Integrity, Growth',
      intentionsStatement: 'Ready to find a partner who values deep connection and shared goals.',
      readinessScore: 82,
      coursesCompleted: 5,
    },
    {
      id: '12',
      name: 'Peter W.',
      age: 31,
      location: 'Kisumu, Kenya',
      city: 'Kisumu',
      countryCode: 'KE',
      category: 'local',
      profileImage: IMAGES.profiles.men[0],
      valuesSummary: 'Faith, Family, Integrity, Growth',
      intentionsStatement: 'Seeking a partner who values open communication and shared spiritual growth.',
      readinessScore: 85,
      coursesCompleted: 5,
    },
    // Male profiles - Rwanda
    {
      id: '13',
      name: 'Jean-Paul N.',
      age: 33,
      location: 'Kigali, Rwanda',
      city: 'Kigali',
      countryCode: 'RW',
      category: 'local',
      profileImage: IMAGES.profiles.men[1],
      valuesSummary: 'Education, Service, Respect, Commitment',
      intentionsStatement: 'Looking for a lifelong partner to build a family rooted in mutual respect.',
      readinessScore: 78,
      coursesCompleted: 4,
    },
    // Male profiles - Canada (Diaspora)
    {
      id: '14',
      name: 'Emmanuel T.',
      age: 35,
      location: 'Toronto, Canada',
      city: 'Toronto',
      countryCode: 'CA',
      category: 'diaspora',
      profileImage: IMAGES.profiles.men[2],
      valuesSummary: 'Faith, Family, Growth, Service',
      intentionsStatement: 'Seeking a partner who understands both African heritage and diaspora life.',
      readinessScore: 91,
      coursesCompleted: 5,
    },
    {
      id: '15',
      name: 'Daniel M.',
      age: 30,
      location: 'Calgary, Canada',
      city: 'Calgary',
      countryCode: 'CA',
      category: 'diaspora',
      profileImage: IMAGES.profiles.men[0],
      valuesSummary: 'Education, Respect, Communication, Family',
      intentionsStatement: 'Looking for someone who values cultural roots while embracing growth.',
      readinessScore: 86,
      coursesCompleted: 5,
    },
  ];

  // Filter profiles based on user gender (show opposite gender)
  const genderFilteredProfiles = sampleProfiles.filter((p) => {
    const isWoman = IMAGES.profiles.women.includes(p.profileImage);
    return user?.gender === 'male' ? isWoman : !isWoman;
  });

  // Apply location filters and search, then sort by proximity
  const displayProfiles = useMemo(() => {
    let filtered = genderFilteredProfiles;

    // Apply country filter
    if (filterCountry) {
      filtered = filtered.filter((p) => p.countryCode === filterCountry);
    }

    // Apply category filter
    if (filterCategory) {
      filtered = filtered.filter((p) => p.category === filterCategory);
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.location.toLowerCase().includes(query) ||
          p.city.toLowerCase().includes(query) ||
          p.valuesSummary.toLowerCase().includes(query)
      );
    }

    // Sort by proximity to user's location
    return sortByProximity(filtered, userLocation);
  }, [genderFilteredProfiles, filterCountry, filterCategory, searchQuery, userLocation]);

  const handleRequestIntro = (profileId: string) => {
    setIntroRequested([...introRequested, profileId]);
  };

  const clearFilters = () => {
    setFilterCountry('');
    setFilterCategory('');
    setSearchQuery('');
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

  // Profile detail view
  if (selectedProfile) {
    return (
      <div className="min-h-screen bg-[#faf6f1] py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Button variant="ghost" onClick={() => setSelectedProfile(null)} className="mb-6">
            ← Back to Matches
          </Button>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="relative h-64">
              <img
                src={selectedProfile.profileImage}
                alt={selectedProfile.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-4 left-4 flex items-center space-x-2">
                <span className="bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium text-[#1e3a5f]">
                  {selectedProfile.readinessScore}% Ready
                </span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getCategoryColor(selectedProfile.category)}`}>
                  {getCategoryLabel(selectedProfile.category)}
                </span>
              </div>
            </div>

            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#1e3a5f]">
                    {selectedProfile.name}, {selectedProfile.age}
                  </h1>
                  <div className="flex items-center space-x-2 text-gray-500">
                    <MapPinIcon size={16} className="text-[#c4785a]" />
                    <span>{selectedProfile.location}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2 text-sm text-gray-500">
                  <ShieldIcon size={16} className="text-emerald-500" />
                  <span>Verified</span>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">
                    Core Values
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedProfile.valuesSummary.split(', ').map((value: string, i: number) => (
                      <span
                        key={i}
                        className="px-3 py-1 bg-[#faf6f1] rounded-full text-sm text-[#1e3a5f]"
                      >
                        {value}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">
                    Intentions
                  </h3>
                  <p className="text-gray-700">{selectedProfile.intentionsStatement}</p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">
                    Preparation
                  </h3>
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <span className="flex items-center">
                      <CheckCircleIcon size={16} className="text-emerald-500 mr-1" />
                      {selectedProfile.coursesCompleted} courses completed
                    </span>
                    <span className="flex items-center">
                      <UserIcon size={16} className="text-blue-500 mr-1" />
                      Profile verified
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-100">
                {introRequested.includes(selectedProfile.id) ? (
                  <div className="bg-emerald-50 rounded-xl p-4 text-center">
                    <CheckCircleIcon size={24} className="text-emerald-500 mx-auto mb-2" />
                    <p className="font-medium text-emerald-800">Introduction Requested</p>
                    <p className="text-sm text-emerald-600">
                      Our team will review and facilitate the introduction.
                    </p>
                  </div>
                ) : (
                  <Button
                    fullWidth
                    onClick={() => handleRequestIntro(selectedProfile.id)}
                  >
                    <HeartIcon size={18} className="mr-2" />
                    Request Introduction
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf6f1] py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1e3a5f] mb-2">Intentional Matching</h1>
          <p className="text-gray-600">
            Carefully selected profiles based on shared values, mutual readiness, and location.
          </p>
        </div>

        {/* Gentle Readiness Tip Banner (non-blocking) */}
        {hasLowReadiness && !dismissedCoursePopup && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 mb-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <BookIcon size={20} className="text-amber-600" />
                </div>
                <div>
                  <h3 className="font-medium text-amber-900">Boost Your Profile</h3>
                  <p className="text-sm text-amber-700 mt-1">
                    Complete our FREE 10-minute overview to increase your readiness score and attract better matches.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentView('education')}
                    className="mt-2 border-amber-300 text-amber-700 hover:bg-amber-100"
                  >
                    <PlayIcon size={14} className="mr-1" />
                    Watch Free Overview
                  </Button>
                </div>
              </div>
              <button
                onClick={() => setDismissedCoursePopup(true)}
                className="text-amber-400 hover:text-amber-600"
              >
                <CloseIcon size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Location & Trust banner */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <LocationSelector compact={!!userLocation} />
          
          <div className="bg-[#1e3a5f] rounded-xl p-4 flex items-center space-x-4">
            <ShieldIcon size={24} className="text-[#c4785a]" />
            <div>
              <p className="text-white font-medium">Human-Reviewed Introductions</p>
              <p className="text-white/70 text-sm">
                Every introduction request is reviewed by our team.
              </p>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <SearchIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, location, or values..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
              />
            </div>

            {/* Filter toggle */}
            <Button
              variant={showFilters ? 'primary' : 'outline'}
              onClick={() => setShowFilters(!showFilters)}
            >
              <FilterIcon size={18} className="mr-2" />
              Filters
              {(filterCountry || filterCategory) && (
                <span className="ml-2 bg-[#c4785a] text-white text-xs px-2 py-0.5 rounded-full">
                  {[filterCountry, filterCategory].filter(Boolean).length}
                </span>
              )}
            </Button>
          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="grid md:grid-cols-3 gap-4">
                {/* Country filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Country
                  </label>
                  <select
                    value={filterCountry}
                    onChange={(e) => setFilterCountry(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                  >
                    <option value="">All Countries</option>
                    <optgroup label="East Africa (Local)">
                      {PILOT_COUNTRIES.LOCAL.map((code) => (
                        <option key={code} value={code}>
                          {COUNTRY_NAMES[code]}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Diaspora">
                      {PILOT_COUNTRIES.DIASPORA.map((code) => (
                        <option key={code} value={code}>
                          {COUNTRY_NAMES[code]}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {/* Category filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Region
                  </label>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value as LocationCategory | '')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                  >
                    <option value="">All Regions</option>
                    <option value="local">East Africa (Uganda, Kenya, Rwanda)</option>
                    <option value="diaspora">Diaspora (Canada)</option>
                  </select>
                </div>

                {/* Clear filters */}
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    onClick={clearFilters}
                    disabled={!filterCountry && !filterCategory && !searchQuery}
                    className="w-full"
                  >
                    Clear All Filters
                  </Button>
                </div>
              </div>

              {/* Active filters display */}
              {(filterCountry || filterCategory || searchQuery) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {filterCountry && (
                    <span className="inline-flex items-center px-3 py-1 bg-[#faf6f1] rounded-full text-sm text-[#1e3a5f]">
                      {COUNTRY_NAMES[filterCountry]}
                      <button
                        onClick={() => setFilterCountry('')}
                        className="ml-2 text-gray-400 hover:text-gray-600"
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {filterCategory && (
                    <span className="inline-flex items-center px-3 py-1 bg-[#faf6f1] rounded-full text-sm text-[#1e3a5f]">
                      {getCategoryLabel(filterCategory)}
                      <button
                        onClick={() => setFilterCategory('')}
                        className="ml-2 text-gray-400 hover:text-gray-600"
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {searchQuery && (
                    <span className="inline-flex items-center px-3 py-1 bg-[#faf6f1] rounded-full text-sm text-[#1e3a5f]">
                      Search: "{searchQuery}"
                      <button
                        onClick={() => setSearchQuery('')}
                        className="ml-2 text-gray-400 hover:text-gray-600"
                      >
                        ×
                      </button>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-600">
            Showing {displayProfiles.length} profile{displayProfiles.length !== 1 ? 's' : ''}
            {userLocation && (
              <span className="ml-1">
                (sorted by proximity to {userLocation.city || userLocation.country})
              </span>
            )}
          </p>
        </div>

        {/* Profiles grid */}
        {displayProfiles.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayProfiles.map((profile) => (
              <div key={profile.id} className="relative">
                {/* Location badge */}
                <div className="absolute top-3 right-3 z-10">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(profile.category)}`}>
                    {getCategoryLabel(profile.category)}
                  </span>
                </div>
                
                <ProfileCard
                  image={profile.profileImage}
                  name={profile.name}
                  age={profile.age}
                  location={profile.location}
                  values={profile.valuesSummary}
                  intentions={profile.intentionsStatement}
                  readinessScore={profile.readinessScore}
                  onViewProfile={() => setSelectedProfile(profile)}
                  onRequestIntro={
                    introRequested.includes(profile.id)
                      ? undefined
                      : () => handleRequestIntro(profile.id)
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <MapPinIcon size={48} className="text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">No profiles found</h3>
            <p className="text-gray-500 mb-4">
              Try adjusting your filters or search criteria.
            </p>
            <Button variant="outline" onClick={clearFilters}>
              Clear All Filters
            </Button>
          </div>
        )}

        {/* Pending introductions */}
        {introRequested.length > 0 && (
          <div className="mt-8 bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-4">Pending Introductions</h2>
            <div className="space-y-3">
              {introRequested.map((id) => {
                const profile = sampleProfiles.find((p) => p.id === id);
                if (!profile) return null;
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between p-3 bg-[#faf6f1] rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <img
                        src={profile.profileImage}
                        alt={profile.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <div>
                        <p className="font-medium text-[#1e3a5f]">{profile.name}</p>
                        <p className="text-sm text-gray-500 flex items-center">
                          <MapPinIcon size={12} className="mr-1" />
                          {profile.location}
                        </p>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                      Pending
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Course Recommendation Popup (non-blocking modal) */}
      {showCourseRecommendation && (
        <div className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in slide-in-from-bottom-4">
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <PlayIcon size={24} className="text-emerald-600" />
              </div>
              <button
                onClick={() => {
                  setShowCourseRecommendation(false);
                  setDismissedCoursePopup(true);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <CloseIcon size={24} />
              </button>
            </div>
            
            <h3 className="text-xl font-bold text-[#1e3a5f] mb-2">
              Quick Tip: Boost Your Profile!
            </h3>
            <p className="text-gray-600 mb-4">
              Profiles with higher readiness scores get 3x more introduction requests. 
              Watch our FREE 10-minute overview to get started!
            </p>
            
            <div className="bg-[#faf6f1] rounded-xl p-4 mb-4">
              <div className="flex items-center space-x-3">
                <ClockIcon size={20} className="text-[#c4785a]" />
                <div>
                  <p className="font-medium text-[#1e3a5f]">Just 10 minutes</p>
                  <p className="text-sm text-gray-500">Quick overview of marriage preparation</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                fullWidth
                onClick={() => {
                  setShowCourseRecommendation(false);
                  setDismissedCoursePopup(true);
                }}
              >
                Maybe Later
              </Button>
              <Button
                fullWidth
                onClick={() => {
                  setShowCourseRecommendation(false);
                  setCurrentView('education');
                }}
              >
                Watch Now - Free
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
