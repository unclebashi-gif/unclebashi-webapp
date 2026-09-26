import React, { useState } from 'react';
import { Button } from '../ui/button';
import { IMAGES } from '@/lib/constants';
import {
  UsersIcon,
  BookIcon,
  FlagIcon,
  HeartIcon,
  TrendingUpIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  EyeIcon,
  ShieldIcon,
} from '../ui/Icons';

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'moderation' | 'matching'>('overview');

  const stats = [
    { label: 'Total Users', value: '10,234', change: '+12%', icon: UsersIcon },
    { label: 'Active Courses', value: '5', change: '0%', icon: BookIcon },
    { label: 'Pending Flags', value: '23', change: '-5%', icon: FlagIcon },
    { label: 'Pending Matches', value: '47', change: '+8%', icon: HeartIcon },
  ];

  const recentUsers = [
    { id: '1', name: 'Sarah Mitchell', email: 'sarah@example.com', status: 'verified', progress: 75, image: IMAGES.profiles.women[0] },
    { id: '2', name: 'David Kim', email: 'david@example.com', status: 'pending', progress: 45, image: IMAGES.profiles.men[0] },
    { id: '3', name: 'Amara Johnson', email: 'amara@example.com', status: 'verified', progress: 100, image: IMAGES.profiles.women[1] },
    { id: '4', name: 'Michael Roberts', email: 'michael@example.com', status: 'verified', progress: 60, image: IMAGES.profiles.men[1] },
  ];

  const moderationQueue = [
    { id: '1', type: 'post', content: 'Flagged for inappropriate language', reporter: 'Anonymous', status: 'pending', createdAt: '2 hours ago' },
    { id: '2', type: 'user', content: 'Profile verification request', reporter: 'System', status: 'pending', createdAt: '3 hours ago' },
    { id: '3', type: 'comment', content: 'Reported for sharing contact info', reporter: 'Sarah M.', status: 'pending', createdAt: '5 hours ago' },
  ];

  const pendingMatches = [
    { id: '1', userA: 'Sarah M.', userB: 'David K.', requestedAt: '1 day ago', compatibility: 85 },
    { id: '2', userA: 'Amara J.', userB: 'Michael R.', requestedAt: '2 days ago', compatibility: 78 },
    { id: '3', userA: 'Grace A.', userB: 'James T.', requestedAt: '3 days ago', compatibility: 92 },
  ];

  return (
    <div className="min-h-screen bg-[#faf6f1] py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1e3a5f] mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">Manage users, content, and matchmaking</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div key={index} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <Icon size={20} className="text-[#c4785a]" />
                  <span className={`text-xs font-medium ${
                    stat.change.startsWith('+') ? 'text-emerald-600' : 
                    stat.change.startsWith('-') ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {stat.change}
                  </span>
                </div>
                <p className="text-2xl font-bold text-[#1e3a5f]">{stat.value}</p>
                <p className="text-sm text-gray-500">{stat.label}</p>
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-white rounded-xl p-1 mb-8 shadow-sm">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'users', label: 'Users' },
            { id: 'moderation', label: 'Moderation' },
            { id: 'matching', label: 'Matching' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#1e3a5f] text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Recent Users */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-4">Recent Users</h2>
              <div className="space-y-3">
                {recentUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-[#faf6f1] rounded-lg">
                    <div className="flex items-center space-x-3">
                      <img src={user.image} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
                      <div>
                        <p className="font-medium text-[#1e3a5f]">{user.name}</p>
                        <p className="text-sm text-gray-500">{user.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.status === 'verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {user.status}
                      </span>
                      <p className="text-xs text-gray-400 mt-1">{user.progress}% complete</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Activity Chart Placeholder */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-4">User Activity</h2>
              <div className="h-64 bg-[#faf6f1] rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <TrendingUpIcon size={48} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">Activity chart would display here</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#1e3a5f]">User Management</h2>
                <input
                  type="text"
                  placeholder="Search users..."
                  className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                />
              </div>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <img src={user.image} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
                        <div>
                          <p className="font-medium text-[#1e3a5f]">{user.name}</p>
                          <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.status === 'verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div className="bg-[#c4785a] h-2 rounded-full" style={{ width: `${user.progress}%` }} />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex space-x-2">
                        <Button variant="ghost" size="sm">
                          <EyeIcon size={16} />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <ShieldIcon size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Moderation Tab */}
        {activeTab === 'moderation' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-4">Moderation Queue</h2>
            <div className="space-y-4">
              {moderationQueue.map((item) => (
                <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          item.type === 'post' ? 'bg-blue-100 text-blue-700' :
                          item.type === 'user' ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {item.type}
                        </span>
                        <span className="text-sm text-gray-500">{item.createdAt}</span>
                      </div>
                      <p className="text-[#1e3a5f] font-medium">{item.content}</p>
                      <p className="text-sm text-gray-500 mt-1">Reported by: {item.reporter}</p>
                    </div>
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm">
                        <CheckCircleIcon size={16} className="mr-1" />
                        Approve
                      </Button>
                      <Button variant="danger" size="sm">
                        <AlertCircleIcon size={16} className="mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Matching Tab */}
        {activeTab === 'matching' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-4">Pending Match Reviews</h2>
            <div className="space-y-4">
              {pendingMatches.map((match) => (
                <div key={match.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="text-center">
                        <p className="font-medium text-[#1e3a5f]">{match.userA}</p>
                        <p className="text-xs text-gray-500">Requester</p>
                      </div>
                      <HeartIcon size={24} className="text-[#c4785a]" />
                      <div className="text-center">
                        <p className="font-medium text-[#1e3a5f]">{match.userB}</p>
                        <p className="text-xs text-gray-500">Recipient</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">{match.requestedAt}</p>
                      <p className="text-sm font-medium text-emerald-600">{match.compatibility}% compatible</p>
                    </div>
                  </div>
                  <div className="flex space-x-2 mt-4">
                    <Button variant="outline" size="sm" fullWidth>
                      View Profiles
                    </Button>
                    <Button size="sm" fullWidth>
                      Approve Introduction
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
