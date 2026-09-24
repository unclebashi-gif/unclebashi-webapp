import { useState, useEffect, useCallback } from 'react';

// Pilot countries configuration
export const PILOT_COUNTRIES = {
  LOCAL: ['UG', 'KE', 'RW'], // Uganda, Kenya, Rwanda
  DIASPORA: ['CA'], // Canada
};

export const COUNTRY_NAMES: Record<string, string> = {
  UG: 'Uganda',
  KE: 'Kenya',
  RW: 'Rwanda',
  CA: 'Canada',
};

export const COUNTRY_CITIES: Record<string, string[]> = {
  UG: ['Kampala', 'Entebbe', 'Jinja', 'Mbarara', 'Gulu', 'Lira', 'Masaka'],
  KE: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Thika', 'Malindi'],
  RW: ['Kigali', 'Butare', 'Gitarama', 'Ruhengeri', 'Gisenyi', 'Byumba'],
  CA: ['Toronto', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Montreal', 'Winnipeg'],
};

export type LocationCategory = 'local' | 'diaspora' | 'other';

export interface GeoLocation {
  latitude: number;
  longitude: number;
  country?: string;
  countryCode?: string;
  city?: string;
  region?: string;
  category: LocationCategory;
}

export interface UseGeolocationReturn {
  location: GeoLocation | null;
  loading: boolean;
  error: string | null;
  requestLocation: () => void;
  setManualLocation: (countryCode: string, city?: string) => void;
}

// Calculate distance between two coordinates (Haversine formula)
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Get category based on country code
export const getLocationCategory = (countryCode: string): LocationCategory => {
  if (PILOT_COUNTRIES.LOCAL.includes(countryCode)) return 'local';
  if (PILOT_COUNTRIES.DIASPORA.includes(countryCode)) return 'diaspora';
  return 'other';
};

// Approximate coordinates for pilot countries (capital cities)
const COUNTRY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  UG: { lat: 0.3476, lng: 32.5825 }, // Kampala
  KE: { lat: -1.2921, lng: 36.8219 }, // Nairobi
  RW: { lat: -1.9403, lng: 29.8739 }, // Kigali
  CA: { lat: 43.6532, lng: -79.3832 }, // Toronto
};

export const useGeolocation = (): UseGeolocationReturn => {
  const [location, setLocation] = useState<GeoLocation | null>(() => {
    // Try to load from localStorage
    const saved = localStorage.getItem('uncle-bashi-location');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Save location to localStorage when it changes
  useEffect(() => {
    if (location) {
      localStorage.setItem('uncle-bashi-location', JSON.stringify(location));
    }
  }, [location]);

  // Reverse geocode coordinates to get country
  const reverseGeocode = async (lat: number, lng: number): Promise<Partial<GeoLocation>> => {
    try {
      // Using a free reverse geocoding service
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`,
        {
          headers: {
            'User-Agent': 'UncleBashi/1.0',
          },
        }
      );
      
      if (!response.ok) throw new Error('Geocoding failed');
      
      const data = await response.json();
      const address = data.address || {};
      
      // Map country to country code
      const countryCode = address.country_code?.toUpperCase() || '';
      
      return {
        country: address.country,
        countryCode,
        city: address.city || address.town || address.village || address.state,
        region: address.state || address.region,
        category: getLocationCategory(countryCode),
      };
    } catch (err) {
      console.error('Reverse geocoding error:', err);
      return { category: 'other' };
    }
  };

  const requestLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        // Get country info from coordinates
        const geoData = await reverseGeocode(latitude, longitude);
        
        const newLocation: GeoLocation = {
          latitude,
          longitude,
          ...geoData,
          category: geoData.category || 'other',
        };
        
        setLocation(newLocation);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes cache
      }
    );
  }, []);

  const setManualLocation = useCallback((countryCode: string, city?: string) => {
    const coords = COUNTRY_COORDINATES[countryCode] || { lat: 0, lng: 0 };
    
    const newLocation: GeoLocation = {
      latitude: coords.lat,
      longitude: coords.lng,
      country: COUNTRY_NAMES[countryCode] || countryCode,
      countryCode,
      city: city || COUNTRY_CITIES[countryCode]?.[0],
      category: getLocationCategory(countryCode),
    };
    
    setLocation(newLocation);
    setError(null);
  }, []);

  return {
    location,
    loading,
    error,
    requestLocation,
    setManualLocation,
  };
};

// Utility to sort profiles by proximity to user
export const sortByProximity = <T extends { countryCode?: string; city?: string }>(
  profiles: T[],
  userLocation: GeoLocation | null
): T[] => {
  if (!userLocation || !userLocation.countryCode) {
    return profiles;
  }

  return [...profiles].sort((a, b) => {
    // Same country gets highest priority
    const aInSameCountry = a.countryCode === userLocation.countryCode;
    const bInSameCountry = b.countryCode === userLocation.countryCode;
    
    if (aInSameCountry && !bInSameCountry) return -1;
    if (!aInSameCountry && bInSameCountry) return 1;
    
    // Same category (local/diaspora) gets second priority
    const aCategory = a.countryCode ? getLocationCategory(a.countryCode) : 'other';
    const bCategory = b.countryCode ? getLocationCategory(b.countryCode) : 'other';
    
    if (aCategory === userLocation.category && bCategory !== userLocation.category) return -1;
    if (aCategory !== userLocation.category && bCategory === userLocation.category) return 1;
    
    // Same city gets third priority
    if (aInSameCountry && bInSameCountry) {
      const aInSameCity = a.city === userLocation.city;
      const bInSameCity = b.city === userLocation.city;
      
      if (aInSameCity && !bInSameCity) return -1;
      if (!aInSameCity && bInSameCity) return 1;
    }
    
    return 0;
  });
};

// Filter profiles by location criteria
export const filterByLocation = <T extends { countryCode?: string; category?: LocationCategory }>(
  profiles: T[],
  filters: {
    countryCode?: string;
    category?: LocationCategory;
    includeAllPilotCountries?: boolean;
  }
): T[] => {
  return profiles.filter((profile) => {
    if (filters.countryCode && profile.countryCode !== filters.countryCode) {
      return false;
    }
    
    if (filters.category && profile.category !== filters.category) {
      return false;
    }
    
    if (filters.includeAllPilotCountries) {
      const allPilotCountries = [...PILOT_COUNTRIES.LOCAL, ...PILOT_COUNTRIES.DIASPORA];
      return profile.countryCode && allPilotCountries.includes(profile.countryCode);
    }
    
    return true;
  });
};
