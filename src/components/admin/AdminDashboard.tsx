import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../ui/button';
import { useAppStore } from '@/lib/store';
import { getCommunityReports, moderateCommunityContent, reviewCommunityReport, suspendCommunityUser } from '@/lib/communityService';
import type { CommunityReport } from '@/types/community';
import { getAdminOverview, getAdminUsers } from '@/lib/adminService';
import type { AdminOverview, AdminUser } from '@/types/admin';
import { AdminCoachingPanel } from './AdminCoachingPanel';
import { AdminMatchmakingPanel } from './AdminMatchmakingPanel';
import { AdminPaymentsPanel } from './AdminPaymentsPanel';
import { AdminCoursesPanel } from './AdminCoursesPanel';
import {
  UsersIcon,
  BookIcon,
  FlagIcon,
  HeartIcon,
} from '../ui/Icons';

const ADMIN_TABS = ['overview', 'users', 'moderation', 'matching', 'coaching', 'payments', 'courses'] as const;
type AdminTab = (typeof ADMIN_TABS)[number];

export const AdminDashboard: React.FC = () => {
  const { user } = useAppStore();
  const isAdmin = user?.roles.includes('admin') ?? false;
  const isModerator = user?.roles.includes('moderator') ?? false;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: AdminTab = isAdmin
    ? ADMIN_TABS.includes(requestedTab as AdminTab) ? requestedTab as AdminTab : 'overview'
    : isModerator ? 'moderation' : 'overview';

  useEffect(() => {
    if (!isAdmin && !isModerator) return;
    if (requestedTab === activeTab) return;

    const normalizedParams = new URLSearchParams(searchParams);
    normalizedParams.set('tab', activeTab);
    setSearchParams(normalizedParams, { replace: true });
  }, [activeTab, isAdmin, isModerator, requestedTab, searchParams, setSearchParams]);

  const selectTab = (tab: AdminTab) => {
    if (isAdmin || (isModerator && tab === 'moderation')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('tab', tab);
      setSearchParams(nextParams);
    }
  };
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState('');
  const [reportActionId, setReportActionId] = useState<string | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [recentUsers, setRecentUsers] = useState<AdminUser[]>([]);
  const [recentUsersLoading, setRecentUsersLoading] = useState(false);
  const [recentUsersError, setRecentUsersError] = useState('');
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [usersCursor, setUsersCursor] = useState<{ before: string; userId: string } | null>(null);
  const usersRequestId = useRef(0);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError('');
    try {
      setOverview(await getAdminOverview());
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : 'Could not load admin overview.');
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const loadRecentUsers = useCallback(async () => {
    setRecentUsersLoading(true);
    setRecentUsersError('');
    try {
      const page = await getAdminUsers({ limit: 5 });
      setRecentUsers(page.users);
    } catch (error) {
      setRecentUsersError(error instanceof Error ? error.message : 'Could not load recent users.');
    } finally {
      setRecentUsersLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async (append = false, before?: { before: string; userId: string }) => {
    const requestId = ++usersRequestId.current;
    setUsersLoading(true);
    setUsersError('');
    try {
      const page = await getAdminUsers({
        search: userSearch,
        before: before?.before,
        beforeUserId: before?.userId,
      });
      if (requestId !== usersRequestId.current) return;
      setAdminUsers((current) => append ? [...current, ...page.users] : page.users);
      setUsersHasMore(page.hasMore);
      setUsersCursor(page.nextBefore && page.nextBeforeUserId
        ? { before: page.nextBefore, userId: page.nextBeforeUserId }
        : null);
    } catch (error) {
      if (requestId !== usersRequestId.current) return;
      setUsersError(error instanceof Error ? error.message : 'Could not load users.');
    } finally {
      if (requestId === usersRequestId.current) setUsersLoading(false);
    }
  }, [userSearch]);

  useEffect(() => {
    if (activeTab !== 'overview' || !isAdmin) return;
    void loadOverview();
    void loadRecentUsers();
  }, [activeTab, isAdmin, loadOverview, loadRecentUsers]);

  useEffect(() => {
    if (activeTab !== 'users' || !isAdmin) return;
    const timer = window.setTimeout(() => void loadUsers(), 250);
    return () => window.clearTimeout(timer);
  }, [activeTab, isAdmin, loadUsers]);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    setReportsError('');
    try {
      setReports(await getCommunityReports());
    } catch (error) {
      setReportsError(error instanceof Error ? error.message : 'Could not load moderation reports.');
    } finally {
      setReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'moderation' && (isAdmin || isModerator)) void loadReports();
  }, [activeTab, isAdmin, isModerator, loadReports]);

  const handleReview = async (report: CommunityReport, status: 'dismissed' | 'actioned', action?: 'hide' | 'remove') => {
    setReportActionId(report.report_id);
    setReportsError('');
    try {
      if (action) {
        const reason = window.prompt(`Reason to ${action} this ${report.target_type}:`);
        if (!reason?.trim()) return;
        await moderateCommunityContent({
          ...(report.target_type === 'post' ? { postId: report.target_id } : { commentId: report.target_id }),
          action,
          reason: reason.trim(),
        });
      }
      await reviewCommunityReport({
        reportId: report.report_id,
        status,
        resolutionNotes: action ? `Content ${action}d after report review.` : 'Report dismissed.',
      });
      await loadReports();
    } catch (error) {
      setReportsError(error instanceof Error ? error.message : 'Could not complete the moderation action.');
    } finally {
      setReportActionId(null);
    }
  };

  const handleSuspend = async (report: CommunityReport) => {
    if (!isAdmin || !report.target_author_id) return;
    const reason = window.prompt('Reason for suspending this user:');
    if (!reason?.trim()) return;
    setReportActionId(report.report_id);
    setReportsError('');
    try {
      await suspendCommunityUser(report.target_author_id, reason.trim());
      await reviewCommunityReport({
        reportId: report.report_id,
        status: 'actioned',
        resolutionNotes: 'The reported author was suspended by an administrator.',
      });
      await loadReports();
    } catch (error) {
      setReportsError(error instanceof Error ? error.message : 'Could not suspend this user.');
    } finally {
      setReportActionId(null);
    }
  };

  const stats = [
    { label: 'Total Users', value: overview?.total_users, icon: UsersIcon },
    { label: 'Published Courses', value: overview?.published_courses, icon: BookIcon },
    { label: 'Pending Reports', value: overview?.pending_community_reports, icon: FlagIcon },
    { label: 'Pending Match Reviews', value: overview?.pending_matchmaking_reviews, icon: HeartIcon },
  ];

  return (
    <div className="min-h-screen bg-[#faf6f1] py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1e3a5f] mb-2">{isAdmin ? 'Admin Dashboard' : 'Community Moderation'}</h1>
          <p className="text-gray-600">{isAdmin ? 'Manage users, content, and matchmaking' : 'Review Community reports and moderate content.'}</p>
        </div>

        {/* Stats */}
        {isAdmin && activeTab === 'overview' && <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div key={index} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <Icon size={20} className="text-[#c4785a]" />
                </div>
                <p className="text-2xl font-bold text-[#1e3a5f]">{overviewLoading ? '—' : (stat.value ?? '—').toLocaleString()}</p>
                <p className="text-sm text-gray-500">{stat.label}</p>
              </div>
            );
          })}
        </div>}

        {isAdmin && activeTab === 'overview' && overviewError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-800" role="alert">
            <p>{overviewError}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void loadOverview()}>Retry overview</Button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 bg-white rounded-xl p-1 mb-8 shadow-sm">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'users', label: 'Users' },
            { id: 'moderation', label: 'Moderation' },
            { id: 'matching', label: 'Matching' },
            { id: 'coaching', label: 'Coaching' },
            { id: 'payments', label: 'Payments' },
            { id: 'courses', label: 'Courses' },
          ].filter((tab) => tab.id === 'moderation' || isAdmin).map((tab) => (
            <button
              key={tab.id}
              onClick={() => selectTab(tab.id as AdminTab)}
              className={`min-w-[96px] flex-1 py-3 rounded-lg font-medium transition-colors ${
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[#1e3a5f]">Recent Users</h2>
                {recentUsersError && <Button variant="outline" size="sm" onClick={() => void loadRecentUsers()}>Retry</Button>}
              </div>
              {recentUsersError && <p className="text-sm text-red-700 mb-3" role="alert">{recentUsersError}</p>}
              {recentUsersLoading && <p className="text-sm text-gray-500" role="status">Loading users…</p>}
              {!recentUsersLoading && !recentUsersError && recentUsers.length === 0 && <p className="text-gray-500">No user records yet.</p>}
              <div className="space-y-3">
                {recentUsers.map((recentUser) => (
                  <div key={recentUser.user_id} className="flex items-center justify-between p-3 bg-[#faf6f1] rounded-lg">
                    <div className="min-w-0">
                      <p className="font-medium text-[#1e3a5f] truncate">{recentUser.full_name || 'Name not provided'}</p>
                      <p className="text-sm text-gray-500 truncate">{recentUser.email}</p>
                      <p className="text-xs text-gray-400">Joined {new Date(recentUser.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${recentUser.onboarding_completed ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>
                        {recentUser.onboarding_completed ? 'Onboarding complete' : 'Onboarding incomplete'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-4">Operations</h2>
              {overviewLoading && <p className="text-sm text-gray-500" role="status">Loading metrics…</p>}
              {!overviewLoading && overview && <dl className="grid grid-cols-2 gap-4">
                <Metric label="Users onboarded" value={overview.onboarded_users} />
                <Metric label="Active enrollments" value={overview.active_enrollments} />
                <Metric label="Listed coaches" value={overview.listed_coaches} />
                <Metric label="Pending coaching" value={overview.pending_coaching_bookings} />
                <Metric label="Production successful payments" value={overview.successful_payments} />
                <Metric label="Production failed payments" value={overview.failed_payments} />
                <Metric label="Production verified UGX volume" value={`UGX ${overview.verified_payment_volume_ugx.toLocaleString()}`} />
              </dl>}
              {!overviewLoading && !overview && !overviewError && <p className="text-gray-500">No overview data available.</p>}
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[#1e3a5f]">Users</h2>
                  <p className="text-sm text-gray-500 mt-1">Read-only account summary</p>
                </div>
                <input
                  type="text"
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                />
              </div>
            </div>
            {usersError && <div className="p-6 text-sm text-red-700" role="alert">{usersError}<Button variant="outline" size="sm" className="ml-3" onClick={() => void loadUsers()}>Retry</Button></div>}
            {usersLoading && adminUsers.length === 0 && <p className="p-6 text-gray-500" role="status">Loading users…</p>}
            {!usersLoading && !usersError && adminUsers.length === 0 && <p className="p-6 text-gray-500">No users match this search.</p>}
            {adminUsers.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[850px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Onboarding</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Roles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {adminUsers.map((adminUser) => (
                  <tr key={adminUser.user_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-[#1e3a5f]">{adminUser.full_name || 'Name not provided'}</p>
                        <p className="text-sm text-gray-500">{adminUser.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{new Date(adminUser.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{adminUser.onboarding_completed ? 'Complete' : 'Incomplete'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{[adminUser.city, adminUser.country_code].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-6 py-4"><div className="flex flex-wrap gap-1">{adminUser.roles.map((role) => <span key={role} className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs">{role}</span>)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table></div>}
            {usersHasMore && <div className="p-4 text-center border-t border-gray-100"><Button variant="outline" onClick={() => usersCursor && void loadUsers(true, usersCursor)} disabled={usersLoading}>{usersLoading ? 'Loading…' : 'Load more'}</Button></div>}
          </div>
        )}

        {/* Moderation Tab */}
        {activeTab === 'moderation' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#1e3a5f]">Moderation Queue</h2>
              <Button variant="outline" size="sm" onClick={() => void loadReports()} disabled={reportsLoading}>Refresh</Button>
            </div>
            {reportsError && <p className="text-sm text-red-700 mb-4" role="alert">{reportsError}</p>}
            {reportsLoading ? <p className="text-gray-500" role="status">Loading reports…</p> : null}
            {!reportsLoading && !reportsError && reports.length === 0 ? <p className="text-gray-500">No pending reports.</p> : null}
            <div className="space-y-4">
              {reports.map((report) => (
                <div key={report.report_id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">{report.target_type}</span>
                        <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">{report.reason.replace(/_/g, ' ')}</span>
                        <time className="text-sm text-gray-500" dateTime={report.created_at}>{new Date(report.created_at).toLocaleString()}</time>
                      </div>
                      <p className="text-[#1e3a5f] font-medium whitespace-pre-wrap">{report.target_content}</p>
                      {report.details && <p className="text-sm text-gray-600 mt-2">Report details: {report.details}</p>}
                      <p className="text-sm text-gray-500 mt-1">Reported by: {report.reporter_display_name}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" disabled={reportActionId === report.report_id} onClick={() => void handleReview(report, 'dismissed')}>Dismiss</Button>
                      <Button variant="outline" size="sm" disabled={reportActionId === report.report_id} onClick={() => void handleReview(report, 'actioned', 'hide')}>Hide</Button>
                      <Button variant="danger" size="sm" disabled={reportActionId === report.report_id} onClick={() => void handleReview(report, 'actioned', 'remove')}>Remove</Button>
                      {isAdmin && report.target_author_id && <Button variant="ghost" size="sm" disabled={reportActionId === report.report_id} onClick={() => void handleSuspend(report)}>Suspend user</Button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Matching Tab */}
        {activeTab === 'matching' && (
          <AdminMatchmakingPanel />
        )}
        {activeTab === 'coaching' && isAdmin && <AdminCoachingPanel />}
        {activeTab === 'payments' && isAdmin && <AdminPaymentsPanel />}
        {activeTab === 'courses' && isAdmin && <AdminCoursesPanel />}
      </div>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div className="rounded-lg bg-[#faf6f1] p-3">
    <dt className="text-xs text-gray-500">{label}</dt>
    <dd className="mt-1 font-semibold text-[#1e3a5f]">{typeof value === 'number' ? value.toLocaleString() : value}</dd>
  </div>
);
