export type CommunityContentStatus = 'visible' | 'hidden' | 'removed';
export type CommunityReportStatus = 'pending' | 'reviewed' | 'dismissed' | 'actioned';
export type CommunityReportReason =
  | 'spam'
  | 'harassment'
  | 'abuse'
  | 'sexual_content'
  | 'misinformation'
  | 'privacy'
  | 'other';
export type CommunityModerationAction = 'hide' | 'remove' | 'restore';

export interface CommunityPost {
  id: string;
  title: string | null;
  body: string;
  is_anonymous: boolean;
  status: CommunityContentStatus;
  created_at: string;
  updated_at: string;
  comment_count: number;
  author_display_name: string;
  author_profile_image_url: string | null;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  body: string;
  status: CommunityContentStatus;
  created_at: string;
  is_anonymous: boolean;
  author_display_name: string;
  author_profile_image_url: string | null;
}

export interface CommunityReport {
  report_id: string;
  target_type: 'post' | 'comment';
  target_id: string;
  target_author_id: string | null;
  target_is_anonymous: boolean;
  target_content: string | null;
  reason: CommunityReportReason;
  details: string | null;
  report_status: CommunityReportStatus;
  reporter_display_name: string;
  created_at: string;
}

export interface CommunityFeedCursor {
  createdAt: string;
  id: string;
}
