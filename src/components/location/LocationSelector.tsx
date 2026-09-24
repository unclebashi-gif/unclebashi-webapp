import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { 
  PILOT_COUNTRIES, 
  COUNTRY_NAMES, 
  COUNTRY_CITIES,
  useGeolocation,
  type GeoLocation,
  type LocationCategory 
} from '@/hooks/useGeolocation';
import { MapPinIcon, GlobeIcon, CheckCircleIcon } from '../ui/Icons';

interface LocationSelectorProps {
  onLocationSet?: (location: GeoLocation) => void;
  compact?: boolean;
}

export const LocationSelector: React.FC<LocationSelectorProps> = ({ 
  onLocationSet,
  compact = false 
}) => {
  const { location, loading, error, requestLocation, setManualLocation } = useGeolocation();
  const [showManualSelect, setShowManualSelect] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');

  const allPilotCountries = [...PILOT_COUNTRIES.LOCAL, ...PILOT_COUNTRIES.DIASPORA];

  const handleAutoDetect = async () => {
    await requestLocation();
    if (location && onLocationSet) {
      onLocationSet(location);
    }
  };

  const handleManualSelect = () => {
    if (selectedCountry) {
      setManualLocation(selectedCountry, selectedCity || undefined);
      setShowManualSelect(false);
      
      // Notify parent if callback provided
      if (onLocationSet && location) {
        onLocationSet(location);
      }
    }
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

  if (compact && location) {
    return (
      <div className="flex items-center space-x-2 text-sm">
        <MapPinIcon size={16} className="text-[#c4785a]" />
        <span className="text-gray-600">
          {location.city && `${location.city}, `}
          {location.country}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(location.category)}`}>
          {getCategoryLabel(location.category)}
        </span>
        <button 
          onClick={() => setShowManualSelect(true)}
          className="text-[#c4785a] hover:underline text-xs"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center space-x-2 mb-4">
        <GlobeIcon size={20} className="text-[#1e3a5f]" />
        <h3 className="font-semibold text-[#1e3a5f]">Your Location</h3>
      </div>

      {location && !showManualSelect ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-[#faf6f1] rounded-lg">
            <div className="flex items-center space-x-3">
              <MapPinIcon size={18} className="text-[#c4785a]" />
              <div>
                <p className="font-medium text-[#1e3a5f]">
                  {location.city && `${location.city}, `}
                  {location.country}
                </p>
                <p className="text-xs text-gray-500">
                  {location.countryCode && PILOT_COUNTRIES.LOCAL.includes(location.countryCode) 
                    ? 'East Africa Region' 
                    : location.countryCode && PILOT_COUNTRIES.DIASPORA.includes(location.countryCode)
                    ? 'Diaspora Region'
                    : 'International'}
                </p>
              </div>
            </div>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(location.category)}`}>
              {getCategoryLabel(location.category)}
            </span>
          </div>
          
          <button 
            onClick={() => setShowManualSelect(true)}
            className="text-sm text-[#c4785a] hover:underline"
          >
            Change location
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {!showManualSelect && (
            <>
              <p className="text-sm text-gray-600">
                Set your location to see matches near you first.
              </p>
              
              <Button
                variant="outline"
                fullWidth
                onClick={handleAutoDetect}
                isLoading={loading}
              >
                <MapPinIcon size={16} className="mr-2" />
                Detect My Location
              </Button>

              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-500">or select manually</span>
                </div>
              </div>

              <button
                onClick={() => setShowManualSelect(true)}
                className="w-full text-center text-sm text-[#c4785a] hover:underline"
              >
                Choose from pilot countries
              </button>
            </>
          )}

          {showManualSelect && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Country
                </label>
                <select
                  value={selectedCountry}
                  onChange={(e) => {
                    setSelectedCountry(e.target.value);
                    setSelectedCity('');
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                >
                  <option value="">Select a country</option>
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

              {selectedCountry && COUNTRY_CITIES[selectedCountry] && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City (Optional)
                  </label>
                  <select
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                  >
                    <option value="">Select a city</option>
                    {COUNTRY_CITIES[selectedCountry].map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  fullWidth
                  onClick={() => setShowManualSelect(false)}
                >
                  Cancel
                </Button>
                <Button
                  fullWidth
                  onClick={handleManualSelect}
                  disabled={!selectedCountry}
                >
                  <CheckCircleIcon size={16} className="mr-2" />
                  Confirm
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
