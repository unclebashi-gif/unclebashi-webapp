import React, { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useUserSync } from '@/hooks/useUserSync';
import { Button } from '../ui/button';
import { ProgressBar } from '../ui/ProgressBar';
import { IMAGES, VALUES_OPTIONS } from '@/lib/constants';
import {
  UserIcon,
  CheckCircleIcon,
  ShieldIcon,
  BookIcon,
  HeartIcon,
  PenIcon,
} from '../ui/Icons';



export const ProfilePage: React.FC = () => {
  const { user, updateUser, onboardingData } = useAppStore();
  const { syncProfileFields } = useUserSync();
  const getOnboardingText = (key: string) => {
    const value = onboardingData[key];
    return typeof value === 'string' ? value : '';
  };
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editData, setEditData] = useState({
    fullName: user?.fullName || '',
    bio: getOnboardingText('bio'),
    location: getOnboardingText('location'),
    occupation: getOnboardingText('occupation'),
  });

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    
    // Update local state
    updateUser({ fullName: editData.fullName });
    
    // Sync to database
    await syncProfileFields({
      fullName: editData.fullName,
      bio: editData.bio,
      location: editData.location,
      occupation: editData.occupation,
    });
    
    setIsSaving(false);
    setSaveSuccess(true);
    setIsEditing(false);
    
    // Clear success message after 3 seconds
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const selectedValues = user?.valuesAssessment || [];
  const valueLabels = selectedValues
    .map((id) => VALUES_OPTIONS.find((v) => v.id === id)?.label)
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-[#faf6f1] py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Save success notification */}
        {saveSuccess && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-center animate-in fade-in slide-in-from-top-2">
            <CheckCircleIcon size={18} className="mr-2 flex-shrink-0" />
            Profile saved successfully! Your changes are synced across all devices.
          </div>
        )}

        {/* Profile Header */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6">
          <div className="h-32 bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f]" />
          <div className="px-6 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between -mt-12">
              <div className="flex items-end space-x-4">
                <div className="w-24 h-24 bg-[#c4785a] rounded-xl flex items-center justify-center text-white text-3xl font-bold border-4 border-white shadow-lg">
                  {user?.fullName?.charAt(0) || 'U'}
                </div>
                <div className="pb-2">
                  <h1 className="text-2xl font-bold text-[#1e3a5f]">{user?.fullName || 'User'}</h1>
                  <p className="text-gray-500">{user?.email}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
                className="mt-4 sm:mt-0"
              >
                <PenIcon size={16} className="mr-2" />
                {isEditing ? 'Cancel' : 'Edit Profile'}
              </Button>

            </div>
          </div>
        </div>

        {/* Edit Form */}
        {isEditing && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-4">Edit Profile</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={editData.fullName}
                  onChange={(e) => setEditData({ ...editData, fullName: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input
                  type="text"
                  value={editData.location}
                  onChange={(e) => setEditData({ ...editData, location: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                  placeholder="City, State"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Occupation</label>
                <input
                  type="text"
                  value={editData.occupation}
                  onChange={(e) => setEditData({ ...editData, occupation: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                  placeholder="Your occupation"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                <textarea
                  value={editData.bio}
                  onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent resize-none"
                  placeholder="Tell us about yourself..."
                />
              </div>
              <div className="flex items-center space-x-3">
                <Button onClick={handleSave} isLoading={isSaving}>
                  Save Changes
                </Button>
                <span className="text-xs text-gray-400">Changes are saved to your account</span>
              </div>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Progress Card */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-4">Your Progress</h2>
            
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Readiness Score</span>
                  <span className="text-sm font-medium text-[#1e3a5f]">{user?.readinessScore || 0}%</span>
                </div>
                <ProgressBar progress={user?.readinessScore || 0} color="secondary" />
              </div>

              <div className="pt-4 border-t border-gray-100">
                <div className="flex items-center space-x-3 mb-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    user?.onboardingCompleted ? 'bg-emerald-100' : 'bg-gray-100'
                  }`}>
                    <CheckCircleIcon size={16} className={user?.onboardingCompleted ? 'text-emerald-600' : 'text-gray-400'} />
                  </div>
                  <div>
                    <p className="font-medium text-[#1e3a5f]">Onboarding</p>
                    <p className="text-sm text-gray-500">{user?.onboardingCompleted ? 'Completed' : 'In Progress'}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 mb-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    (user?.readinessScore || 0) >= 70 ? 'bg-emerald-100' : 'bg-gray-100'
                  }`}>
                    <BookIcon size={16} className={(user?.readinessScore || 0) >= 70 ? 'text-emerald-600' : 'text-gray-400'} />
                  </div>
                  <div>
                    <p className="font-medium text-[#1e3a5f]">Required Courses</p>
                    <p className="text-sm text-gray-500">{(user?.readinessScore || 0) >= 70 ? 'Completed' : 'In Progress'}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    user?.matchmakingUnlocked ? 'bg-emerald-100' : 'bg-gray-100'
                  }`}>
                    <HeartIcon size={16} className={user?.matchmakingUnlocked ? 'text-emerald-600' : 'text-gray-400'} />
                  </div>
                  <div>
                    <p className="font-medium text-[#1e3a5f]">Matchmaking</p>
                    <p className="text-sm text-gray-500">{user?.matchmakingUnlocked ? 'Unlocked' : 'Locked'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Values Card */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-4">Your Values</h2>
            
            {valueLabels.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {valueLabels.map((label, index) => (
                  <span
                    key={index}
                    className="px-3 py-1.5 bg-[#faf6f1] rounded-full text-sm text-[#1e3a5f]"
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Complete onboarding to set your values</p>
            )}

            <div className="mt-6 pt-4 border-t border-gray-100">
              <h3 className="font-medium text-[#1e3a5f] mb-2">Marriage Intention</h3>
              <p className="text-gray-600 capitalize">
                {user?.marriageIntention?.replace(/_/g, ' ') || 'Not set'}
              </p>
            </div>

            <div className="mt-4">
              <h3 className="font-medium text-[#1e3a5f] mb-2">Commitment Level</h3>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                user?.commitmentLevel === 'ready' ? 'bg-emerald-100 text-emerald-700' :
                user?.commitmentLevel === 'serious' ? 'bg-amber-100 text-amber-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {user?.commitmentLevel?.charAt(0).toUpperCase() + (user?.commitmentLevel?.slice(1) || '') || 'Not set'}
              </span>
            </div>
          </div>

          {/* Verification Card */}
          <div className="bg-white rounded-2xl shadow-sm p-6 md:col-span-2">
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-4">Verification Status</h2>
            
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="flex items-center space-x-3 p-4 bg-[#faf6f1] rounded-xl">
                <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                  <CheckCircleIcon size={20} className="text-emerald-600" />
                </div>
                <div>
                  <p className="font-medium text-[#1e3a5f]">Email Verified</p>
                  <p className="text-sm text-gray-500">Confirmed</p>
                </div>
              </div>

              <div className="flex items-center space-x-3 p-4 bg-[#faf6f1] rounded-xl">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                  <ShieldIcon size={20} className="text-amber-600" />
                </div>
                <div>
                  <p className="font-medium text-[#1e3a5f]">Identity</p>
                  <p className="text-sm text-gray-500">Pending Review</p>
                </div>
              </div>

              <div className="flex items-center space-x-3 p-4 bg-[#faf6f1] rounded-xl">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <UserIcon size={20} className="text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-[#1e3a5f]">Profile</p>
                  <p className="text-sm text-gray-500">Complete</p>
                </div>
              </div>
            </div>

            <p className="mt-4 text-sm text-gray-500">
              Your profile is reviewed by our team to ensure a safe, trustworthy community. 
              This process typically takes 24-48 hours.
            </p>
          </div>

          {/* Data Sync Status Card */}
          <div className="bg-white rounded-2xl shadow-sm p-6 md:col-span-2">
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-4">Account & Data</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 bg-[#faf6f1] rounded-xl">
                <div className="flex items-center space-x-2 mb-2">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <h3 className="font-medium text-[#1e3a5f]">Cloud Sync</h3>
                </div>
                <p className="text-sm text-gray-600">
                  Your progress, reflections, and course completions are automatically saved to the cloud. 
                  Sign in on any device to pick up where you left off.
                </p>
              </div>
              <div className="p-4 bg-[#faf6f1] rounded-xl">
                <div className="flex items-center space-x-2 mb-2">
                  <svg className="w-5 h-5 text-[#1e3a5f]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <h3 className="font-medium text-[#1e3a5f]">Privacy</h3>
                </div>
                <p className="text-sm text-gray-600">
                  Your data is encrypted and securely stored. Only you can access your personal information, 
                  reflections, and journal entries.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
