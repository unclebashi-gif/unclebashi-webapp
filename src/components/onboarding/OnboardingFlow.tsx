import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { useUserSync } from '@/hooks/useUserSync';
import { Button } from '../ui/button';
import { StepProgress } from '../ui/ProgressBar';
import { IMAGES, VALUES_OPTIONS, MARRIAGE_INTENTIONS, COMMITMENT_LEVELS, READINESS_QUESTIONS } from '@/lib/constants';
import type { GeoLocation, LocationCategory } from '@/hooks/useGeolocation';
import { 
  PILOT_COUNTRIES, 
  COUNTRY_NAMES, 
  COUNTRY_CITIES,
  useGeolocation,
  getLocationCategory,
} from '@/hooks/useGeolocation';
import {
  HeartIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  ShieldIcon,
  BookIcon,
  UsersIcon,
  MapPinIcon,
  GlobeIcon,
} from '../ui/Icons';

interface OnboardingData extends Record<string, unknown> {
  agreementAccepted?: boolean;
  city?: string;
  commitmentLevel?: string;
  countryCode?: string;
  dateOfBirth?: string;
  gender?: string;
  location?: string;
  locationCategory?: LocationCategory;
  marriageIntention?: string;
  marriageTimeline?: string;
  partnerPreferences?: string;
  readinessAnswers?: Record<string, number>;
  selectedValues?: string[];
  verificationAcknowledged?: boolean;
}

export const OnboardingFlow: React.FC = () => {
  const { user, updateUser, setCurrentView, onboardingData: storedOnboardingData, updateOnboardingData } = useAppStore();
  const onboardingData = storedOnboardingData as OnboardingData;
  const { syncOnboardingData, syncOnboardingComplete, syncUserProfile } = useUserSync();
  const { location: detectedLocation, requestLocation, setManualLocation, loading: locationLoading } = useGeolocation();
  const [currentStep, setCurrentStep] = useState(user?.onboardingStep || 0);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncedStep, setLastSyncedStep] = useState(-1);

  const totalSteps = 10;

  // Debounced sync of onboarding data to database
  const debouncedSync = useCallback(
    (() => {
      let timeout: ReturnType<typeof setTimeout>;
      return (data: Record<string, unknown>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          syncOnboardingData(data);
        }, 1500); // Sync after 1.5s of inactivity
      };
    })(),
    [syncOnboardingData]
  );

  // Sync onboarding data whenever it changes
  useEffect(() => {
    if (Object.keys(onboardingData).length > 0) {
      debouncedSync(onboardingData);
    }
  }, [onboardingData, debouncedSync]);

  // Sync step progress to database when step changes
  useEffect(() => {
    if (currentStep !== lastSyncedStep && user?.id) {
      setLastSyncedStep(currentStep);
      // Update the user's onboarding step in the store
      updateUser({ onboardingStep: currentStep });
      // Sync to database (debounced via the onboarding data sync)
      syncOnboardingData({ ...onboardingData, _currentStep: currentStep });
    }
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      updateUser({ onboardingStep: nextStep });
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    
    // Calculate readiness score
    const readinessAnswers = onboardingData.readinessAnswers || {};
    const totalScore = Object.values(readinessAnswers).reduce((sum, value) => sum + (value || 0), 0);
    const maxScore = READINESS_QUESTIONS.length * 5;
    const readinessScore = Math.round((totalScore / maxScore) * 100);

    // Update local state
    updateUser({
      onboardingCompleted: true,
      onboardingStep: totalSteps,
      marriageIntention: onboardingData.marriageIntention,
      commitmentLevel: onboardingData.commitmentLevel,
      valuesAssessment: onboardingData.selectedValues || [],
      readinessScore,
    });

    // Sync completion to database
    await syncOnboardingComplete({
      marriageIntention: onboardingData.marriageIntention,
      commitmentLevel: onboardingData.commitmentLevel,
      valuesAssessment: onboardingData.selectedValues || [],
      readinessScore,
      dateOfBirth: onboardingData.dateOfBirth,
      gender: onboardingData.gender,
      countryCode: onboardingData.countryCode,
      city: onboardingData.city,
      location: onboardingData.location,
      locationCategory: onboardingData.locationCategory,
      marriageTimeline: onboardingData.marriageTimeline,
      partnerPreferences: onboardingData.partnerPreferences,
    });

    // Also sync the final onboarding data snapshot
    await syncOnboardingData({ ...onboardingData, _completed: true, _completedAt: new Date().toISOString() });

    setIsLoading(false);
    setCurrentView('education');
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep />;
      case 1:
        return <JourneyStep data={onboardingData} updateData={updateOnboardingData} />;
      case 2:
        return (
          <PersonalInfoStep 
            data={onboardingData} 
            updateData={updateOnboardingData}
            detectedLocation={detectedLocation}
            requestLocation={requestLocation}
            setManualLocation={setManualLocation}
            locationLoading={locationLoading}
          />
        );
      case 3:
        return <ValuesStep data={onboardingData} updateData={updateOnboardingData} />;
      case 4:
        return <IntentionsStep data={onboardingData} updateData={updateOnboardingData} />;
      case 5:
        return <CommitmentStep data={onboardingData} updateData={updateOnboardingData} />;
      case 6:
        return <ReadinessStep data={onboardingData} updateData={updateOnboardingData} />;
      case 7:
        return <VerificationStep data={onboardingData} updateData={updateOnboardingData} />;
      case 8:
        return <AgreementStep data={onboardingData} updateData={updateOnboardingData} />;
      case 9:
        return <CompleteStep />;
      default:
        return <WelcomeStep />;
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return !!onboardingData.marriageIntention;
      case 2:
        return !!onboardingData.dateOfBirth && !!onboardingData.gender && !!onboardingData.countryCode;
      case 3:
        return (onboardingData.selectedValues?.length || 0) >= 3;
      case 4:
        return !!onboardingData.marriageIntention;
      case 5:
        return !!onboardingData.commitmentLevel;
      case 6:
        return Object.keys(onboardingData.readinessAnswers || {}).length >= READINESS_QUESTIONS.length;
      case 7:
        return onboardingData.verificationAcknowledged;
      case 8:
        return onboardingData.agreementAccepted;
      default:
        return true;
    }
  };

  return (
    <div className="min-h-screen bg-[#faf6f1] py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-[#1e3a5f] rounded-xl flex items-center justify-center">
              <HeartIcon className="text-white" size={24} />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-[#1e3a5f]">Welcome to Uncle Bashi</h1>
          <p className="text-gray-600 mt-2">Let's begin your journey to marriage readiness</p>
          {/* Session persistence indicator */}
          <div className="flex items-center justify-center mt-3 text-xs text-gray-400">
            <svg className="w-3 h-3 mr-1 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Progress saved automatically
          </div>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <StepProgress currentStep={currentStep} totalSteps={totalSteps} />
        </div>

        {/* Step content */}
        <div className="bg-white rounded-2xl shadow-sm p-6 lg:p-8 mb-6">
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={currentStep === 0}
            leftIcon={<ChevronLeftIcon size={20} />}
          >
            Back
          </Button>

          {currentStep === totalSteps - 1 ? (
            <Button
              onClick={handleComplete}
              isLoading={isLoading}
              rightIcon={<CheckCircleIcon size={20} />}
            >
              Complete Setup
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              rightIcon={<ChevronRightIcon size={20} />}
            >
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

// Step Components
const WelcomeStep: React.FC = () => (
  <div className="text-center">
    <img
      src={IMAGES.journey}
      alt="Journey"
      className="w-full h-48 object-cover rounded-xl mb-6"
    />
    <h2 className="text-2xl font-bold text-[#1e3a5f] mb-4">
      Your Journey Begins Here
    </h2>
    <p className="text-gray-600 mb-6">
      Over the next few minutes, we'll learn about you, your values, and your intentions. 
      This helps us provide the most relevant courses, community, and eventually, matches.
    </p>
    <div className="grid grid-cols-3 gap-4 text-center">
      <div className="p-4 bg-[#faf6f1] rounded-xl">
        <ShieldIcon className="mx-auto text-[#c4785a] mb-2" size={24} />
        <p className="text-sm text-gray-600">Private & Secure</p>
      </div>
      <div className="p-4 bg-[#faf6f1] rounded-xl">
        <BookIcon className="mx-auto text-[#c4785a] mb-2" size={24} />
        <p className="text-sm text-gray-600">Thoughtful Questions</p>
      </div>
      <div className="p-4 bg-[#faf6f1] rounded-xl">
        <UsersIcon className="mx-auto text-[#c4785a] mb-2" size={24} />
        <p className="text-sm text-gray-600">Human Review</p>
      </div>
    </div>
  </div>
);

const JourneyStep: React.FC<{ data: OnboardingData; updateData: (d: Record<string, unknown>) => void }> = ({ data, updateData }) => (
  <div>
    <h2 className="text-xl font-bold text-[#1e3a5f] mb-2">What brings you to Uncle Bashi?</h2>
    <p className="text-gray-600 mb-6">Select the option that best describes your current situation.</p>
    <div className="space-y-3">
      {MARRIAGE_INTENTIONS.map((intention) => (
        <button
          key={intention.id}
          onClick={() => updateData({ marriageIntention: intention.id })}
          className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
            data.marriageIntention === intention.id
              ? 'border-[#c4785a] bg-[#faf6f1]'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <h3 className="font-semibold text-[#1e3a5f]">{intention.title}</h3>
          <p className="text-sm text-gray-600 mt-1">{intention.description}</p>
        </button>
      ))}
    </div>
  </div>
);

interface PersonalInfoStepProps {
  data: OnboardingData;
  updateData: (d: Record<string, unknown>) => void;
  detectedLocation: GeoLocation | null;
  requestLocation: () => void;
  setManualLocation: (code: string, city?: string) => void;
  locationLoading: boolean;
}

const PersonalInfoStep: React.FC<PersonalInfoStepProps> = ({ 
  data, 
  updateData, 
  detectedLocation,
  requestLocation,
  setManualLocation,
  locationLoading
}) => {
  const [showLocationOptions, setShowLocationOptions] = useState(!data.countryCode);
  const allPilotCountries = [...PILOT_COUNTRIES.LOCAL, ...PILOT_COUNTRIES.DIASPORA];

  const handleDetectLocation = async () => {
    await requestLocation();
    if (detectedLocation) {
      updateData({
        countryCode: detectedLocation.countryCode,
        city: detectedLocation.city,
        location: `${detectedLocation.city || ''}, ${detectedLocation.country || ''}`.replace(/^, /, ''),
        locationCategory: detectedLocation.category,
      });
      setShowLocationOptions(false);
    }
  };

  const handleCountrySelect = (countryCode: string) => {
    const category = getLocationCategory(countryCode);
    updateData({
      countryCode,
      city: '',
      location: COUNTRY_NAMES[countryCode] || countryCode,
      locationCategory: category,
    });
  };

  const handleCitySelect = (city: string) => {
    updateData({
      city,
      location: `${city}, ${COUNTRY_NAMES[data.countryCode] || data.countryCode}`,
    });
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-[#1e3a5f] mb-2">Tell us about yourself</h2>
      <p className="text-gray-600 mb-6">Basic information helps us personalize your experience.</p>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
          <input
            type="date"
            value={data.dateOfBirth || ''}
            onChange={(e) => updateData({ dateOfBirth: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">We ask this to ensure age-appropriate matching</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
          <div className="flex gap-4">
            {['male', 'female'].map((gender) => (
              <button
                key={gender}
                onClick={() => updateData({ gender })}
                className={`flex-1 py-2.5 rounded-lg border-2 font-medium capitalize transition-all ${
                  data.gender === gender
                    ? 'border-[#c4785a] bg-[#faf6f1] text-[#c4785a]'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {gender}
              </button>
            ))}
          </div>
        </div>
        
        {/* Location Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <span className="flex items-center">
              <MapPinIcon size={16} className="mr-1 text-[#c4785a]" />
              Location
            </span>
          </label>
          
          {data.countryCode && !showLocationOptions ? (
            <div className="p-4 bg-[#faf6f1] rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <GlobeIcon size={18} className="text-[#1e3a5f]" />
                  <span className="font-medium text-[#1e3a5f]">
                    {data.city ? `${data.city}, ` : ''}{COUNTRY_NAMES[data.countryCode] || data.countryCode}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    data.locationCategory === 'local' 
                      ? 'bg-emerald-100 text-emerald-700' 
                      : data.locationCategory === 'diaspora'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {data.locationCategory === 'local' ? 'East Africa' : data.locationCategory === 'diaspora' ? 'Diaspora' : 'Other'}
                  </span>
                </div>
                <button
                  onClick={() => setShowLocationOptions(true)}
                  className="text-sm text-[#c4785a] hover:underline"
                >
                  Change
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Button
                variant="outline"
                fullWidth
                onClick={handleDetectLocation}
                isLoading={locationLoading}
              >
                <MapPinIcon size={16} className="mr-2" />
                Detect My Location
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-500">or select manually</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
                <select
                  value={data.countryCode || ''}
                  onChange={(e) => handleCountrySelect(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                >
                  <option value="">Select your country</option>
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

              {data.countryCode && COUNTRY_CITIES[data.countryCode] && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">City (Optional)</label>
                  <select
                    value={data.city || ''}
                    onChange={(e) => handleCitySelect(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                  >
                    <option value="">Select your city</option>
                    {COUNTRY_CITIES[data.countryCode].map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {data.countryCode && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLocationOptions(false)}
                  className="w-full"
                >
                  Confirm Location
                </Button>
              )}
            </div>
          )}
          
          <p className="text-xs text-gray-500 mt-2">
            Uncle Bashi currently serves Uganda, Kenya, Rwanda, and Canada (Diaspora). 
            Your location helps us show you relevant matches nearby.
          </p>
        </div>
      </div>
    </div>
  );
};


const ValuesStep: React.FC<{ data: OnboardingData; updateData: (d: Record<string, unknown>) => void }> = ({ data, updateData }) => {
  const selectedValues = data.selectedValues || [];
  const toggleValue = (valueId: string) => {
    const newValues = selectedValues.includes(valueId)
      ? selectedValues.filter((v: string) => v !== valueId)
      : [...selectedValues, valueId];
    updateData({ selectedValues: newValues });
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-[#1e3a5f] mb-2">What matters most to you?</h2>
      <p className="text-gray-600 mb-6">Select at least 3 values that are most important in your life and future marriage.</p>
      <div className="grid grid-cols-2 gap-3">
        {VALUES_OPTIONS.map((value) => (
          <button
            key={value.id}
            onClick={() => toggleValue(value.id)}
            className={`p-3 rounded-xl border-2 text-left transition-all ${
              selectedValues.includes(value.id)
                ? 'border-[#c4785a] bg-[#faf6f1]'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <span className="font-medium text-[#1e3a5f] text-sm">{value.label}</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-gray-500 mt-4">
        Selected: {selectedValues.length}/10 (minimum 3)
      </p>
    </div>
  );
};

const IntentionsStep: React.FC<{ data: OnboardingData; updateData: (d: Record<string, unknown>) => void }> = ({ data, updateData }) => (
  <div>
    <h2 className="text-xl font-bold text-[#1e3a5f] mb-2">Your Marriage Intentions</h2>
    <p className="text-gray-600 mb-6">Help us understand your timeline and expectations.</p>
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">When are you hoping to marry?</label>
        <select
          value={data.marriageTimeline || ''}
          onChange={(e) => updateData({ marriageTimeline: e.target.value })}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
        >
          <option value="">Select a timeline</option>
          <option value="1-2-years">Within 1-2 years</option>
          <option value="2-3-years">Within 2-3 years</option>
          <option value="3-5-years">Within 3-5 years</option>
          <option value="when-ready">When I'm ready</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">What are you looking for in a partner? (Optional)</label>
        <textarea
          value={data.partnerPreferences || ''}
          onChange={(e) => updateData({ partnerPreferences: e.target.value })}
          placeholder="Share what qualities and values are important to you..."
          rows={4}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent resize-none"
        />
      </div>
    </div>
  </div>
);

const CommitmentStep: React.FC<{ data: OnboardingData; updateData: (d: Record<string, unknown>) => void }> = ({ data, updateData }) => (
  <div>
    <h2 className="text-xl font-bold text-[#1e3a5f] mb-2">Your Commitment Level</h2>
    <p className="text-gray-600 mb-6">Be honest about where you are in your journey.</p>
    <div className="space-y-3">
      {COMMITMENT_LEVELS.map((level) => (
        <button
          key={level.id}
          onClick={() => updateData({ commitmentLevel: level.id })}
          className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
            data.commitmentLevel === level.id
              ? 'border-[#c4785a] bg-[#faf6f1]'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-[#1e3a5f]">{level.title}</h3>
            <span className={`px-2 py-1 rounded text-xs font-medium ${level.color}`}>
              {level.title}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">{level.description}</p>
        </button>
      ))}
    </div>
  </div>
);

const ReadinessStep: React.FC<{ data: OnboardingData; updateData: (d: Record<string, unknown>) => void }> = ({ data, updateData }) => {
  const answers = data.readinessAnswers || {};
  const setAnswer = (questionId: string, value: number) => {
    updateData({ readinessAnswers: { ...answers, [questionId]: value } });
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-[#1e3a5f] mb-2">Readiness Self-Assessment</h2>
      <p className="text-gray-600 mb-6">Rate how much you agree with each statement (1 = Disagree, 5 = Strongly Agree)</p>
      <div className="space-y-6">
        {READINESS_QUESTIONS.map((question) => (
          <div key={question.id}>
            <p className="text-sm font-medium text-[#1e3a5f] mb-2">{question.question}</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  onClick={() => setAnswer(question.id, value)}
                  className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    answers[question.id] === value
                      ? 'border-[#c4785a] bg-[#c4785a] text-white'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const VerificationStep: React.FC<{ data: OnboardingData; updateData: (d: Record<string, unknown>) => void }> = ({ data, updateData }) => (
  <div>
    <h2 className="text-xl font-bold text-[#1e3a5f] mb-2">Identity Verification</h2>
    <p className="text-gray-600 mb-6">We verify all profiles to maintain a safe, trustworthy community.</p>
    <div className="bg-[#faf6f1] rounded-xl p-6 mb-6">
      <h3 className="font-semibold text-[#1e3a5f] mb-3">Why we verify:</h3>
      <ul className="space-y-2 text-sm text-gray-600">
        <li className="flex items-start">
          <CheckCircleIcon size={16} className="text-emerald-500 mr-2 mt-0.5 flex-shrink-0" />
          Ensures all members are who they say they are
        </li>
        <li className="flex items-start">
          <CheckCircleIcon size={16} className="text-emerald-500 mr-2 mt-0.5 flex-shrink-0" />
          Protects the community from bad actors
        </li>
        <li className="flex items-start">
          <CheckCircleIcon size={16} className="text-emerald-500 mr-2 mt-0.5 flex-shrink-0" />
          Builds trust before any introductions are made
        </li>
      </ul>
    </div>
    <label className="flex items-start space-x-3 cursor-pointer">
      <input
        type="checkbox"
        checked={data.verificationAcknowledged || false}
        onChange={(e) => updateData({ verificationAcknowledged: e.target.checked })}
        className="mt-1 w-5 h-5 rounded border-gray-300 text-[#c4785a] focus:ring-[#c4785a]"
      />
      <span className="text-sm text-gray-600">
        I understand that my profile will be reviewed by the Uncle Bashi team before I can access matching features.
      </span>
    </label>
  </div>
);

const AgreementStep: React.FC<{ data: OnboardingData; updateData: (d: Record<string, unknown>) => void }> = ({ data, updateData }) => (
  <div>
    <h2 className="text-xl font-bold text-[#1e3a5f] mb-2">Community Guidelines</h2>
    <p className="text-gray-600 mb-6">Please review and accept our community standards.</p>
    <div className="bg-[#faf6f1] rounded-xl p-6 mb-6 max-h-64 overflow-y-auto">
      <h3 className="font-semibold text-[#1e3a5f] mb-3">I agree to:</h3>
      <ul className="space-y-3 text-sm text-gray-600">
        <li>• Treat all members with respect and dignity</li>
        <li>• Be honest in my profile and communications</li>
        <li>• Keep contact details private until mutual readiness</li>
        <li>• Report any concerning behavior to moderators</li>
        <li>• Complete required courses before matching</li>
        <li>• Approach this journey with serious intentions</li>
        <li>• Never share inappropriate content</li>
        <li>• Respect the boundaries of others</li>
      </ul>
    </div>
    <label className="flex items-start space-x-3 cursor-pointer">
      <input
        type="checkbox"
        checked={data.agreementAccepted || false}
        onChange={(e) => updateData({ agreementAccepted: e.target.checked })}
        className="mt-1 w-5 h-5 rounded border-gray-300 text-[#c4785a] focus:ring-[#c4785a]"
      />
      <span className="text-sm text-gray-600">
        I have read and agree to the Community Guidelines, Terms of Service, and Privacy Policy.
      </span>
    </label>
  </div>
);

const CompleteStep: React.FC = () => (
  <div className="text-center">
    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
      <CheckCircleIcon size={40} className="text-emerald-500" />
    </div>
    <h2 className="text-2xl font-bold text-[#1e3a5f] mb-4">You're All Set!</h2>
    <p className="text-gray-600 mb-6">
      Your profile is complete. You can now access our courses, join the community, 
      and begin your journey toward marriage readiness.
    </p>
    <div className="bg-[#faf6f1] rounded-xl p-6">
      <h3 className="font-semibold text-[#1e3a5f] mb-3">What's Next:</h3>
      <ul className="space-y-2 text-sm text-gray-600 text-left">
        <li className="flex items-center">
          <span className="w-6 h-6 bg-[#1e3a5f] text-white rounded-full flex items-center justify-center text-xs mr-3">1</span>
          Start with the Marriage Readiness Foundations course
        </li>
        <li className="flex items-center">
          <span className="w-6 h-6 bg-[#1e3a5f] text-white rounded-full flex items-center justify-center text-xs mr-3">2</span>
          Join the community discussions
        </li>
        <li className="flex items-center">
          <span className="w-6 h-6 bg-[#1e3a5f] text-white rounded-full flex items-center justify-center text-xs mr-3">3</span>
          Try AI-guided journaling for reflection
        </li>
      </ul>
    </div>
  </div>
);
