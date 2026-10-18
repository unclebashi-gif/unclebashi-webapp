export interface AdminOverview {
  total_users: number;
  onboarded_users: number;
  published_courses: number;
  active_enrollments: number;
  pending_community_reports: number;
  pending_matchmaking_reviews: number;
  listed_coaches: number;
  pending_coaching_bookings: number;
  successful_payments: number;
  failed_payments: number;
  verified_payment_volume_ugx: number;
}

export interface AdminUser {
  user_id: string;
  full_name: string;
  email: string;
  created_at: string;
  onboarding_completed: boolean;
  gender: string | null;
  country_code: string | null;
  city: string | null;
  roles: string[];
}

export interface AdminUsersPage {
  users: AdminUser[];
  hasMore: boolean;
  nextBefore: string | null;
  nextBeforeUserId: string | null;
}


export type AdminCourseStatus = 'draft' | 'published' | 'archived';
export type AdminCourseAudienceGender = 'all' | 'female' | 'male';

export interface AdminCourseCommercialTerms {
  course_id: string;
  slug: string;
  title: string;
  status: AdminCourseStatus;
  is_free: boolean;
  price_amount: number | null;
  currency: string | null;
  audience_gender: AdminCourseAudienceGender;
  updated_at: string;
}

export interface AdminCourseCommercialUpdate {
  course_id: string;
  is_free: boolean;
  price_amount: number | null;
  currency: string | null;
  updated_at: string;
}
