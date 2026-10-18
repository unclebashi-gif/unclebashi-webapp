import { supabase } from '@/lib/supabase';
import type { AdminCourseCommercialTerms, AdminCourseCommercialUpdate, AdminOverview, AdminUser, AdminUsersPage } from '@/types/admin';

const ADMIN_USERS_PAGE_SIZE = 50;

export async function getAdminOverview(): Promise<AdminOverview> {
  const { data, error } = await supabase.rpc('get_admin_overview');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('The admin overview returned no data.');
  return row as AdminOverview;
}

export async function getAdminUsers(options: {
  search?: string;
  before?: string | null;
  beforeUserId?: string | null;
  limit?: number;
} = {}): Promise<AdminUsersPage> {
  const pageSize = Math.max(1, Math.min(options.limit ?? ADMIN_USERS_PAGE_SIZE, 99));
  const { data, error } = await supabase.rpc('get_admin_users', {
    p_search: options.search?.trim() || null,
    p_limit: pageSize + 1,
    p_before: options.before ?? null,
    p_before_user_id: options.beforeUserId ?? null,
  });
  if (error) throw error;

  const returnedRows = (data ?? []) as AdminUser[];
  const hasMore = returnedRows.length > pageSize;
  const rows = returnedRows.slice(0, pageSize);
  const last = rows[rows.length - 1];
  return {
    users: rows,
    hasMore,
    nextBefore: hasMore ? last.created_at : null,
    nextBeforeUserId: hasMore ? last.user_id : null,
  };
}


export async function getAdminCourseCommercialTerms(): Promise<AdminCourseCommercialTerms[]> {
  const { data, error } = await supabase.rpc('get_admin_course_commercial_terms');
  if (error) throw error;
  return (data ?? []) as AdminCourseCommercialTerms[];
}

export async function updateAdminCourseCommercialTerms(input: {
  courseId: string;
  isFree: boolean;
  priceAmount: number | null;
}): Promise<AdminCourseCommercialUpdate> {
  const { data, error } = await supabase.rpc('admin_update_course_commercial_terms', {
    p_course_id: input.courseId,
    p_is_free: input.isFree,
    p_price_amount: input.priceAmount,
    p_currency: input.isFree ? null : 'UGX',
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('The commercial-terms update returned no course.');
  return row as AdminCourseCommercialUpdate;
}
