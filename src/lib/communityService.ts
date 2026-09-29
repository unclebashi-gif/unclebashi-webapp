import { supabase } from '@/lib/supabase';
import type {
  CommunityComment,
  CommunityFeedCursor,
  CommunityModerationAction,
  CommunityPost,
  CommunityReport,
  CommunityReportReason,
  CommunityReportStatus,
} from '@/types/community';

async function requireAuthenticatedSession(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.user.id) throw new Error('Sign in to use Community.');
}

export async function getCommunityFeed(
  limit = 20,
  cursor?: CommunityFeedCursor,
): Promise<CommunityPost[]> {
  await requireAuthenticatedSession();
  const { data, error } = await supabase.rpc('get_community_feed', {
    p_limit: limit,
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
  });
  if (error) throw error;
  return (data ?? []) as CommunityPost[];
}

export async function getCommunityComments(postId: string): Promise<CommunityComment[]> {
  await requireAuthenticatedSession();
  const { data, error } = await supabase.rpc('get_community_comments', { p_post_id: postId });
  if (error) throw error;
  return (data ?? []) as CommunityComment[];
}

export async function createCommunityPost(body: string, isAnonymous: boolean): Promise<void> {
  await requireAuthenticatedSession();
  const { error } = await supabase.rpc('create_community_post', {
    p_title: null,
    p_body: body,
    p_is_anonymous: isAnonymous,
  });
  if (error) throw error;
}

export async function createCommunityComment(postId: string, body: string): Promise<void> {
  await requireAuthenticatedSession();
  const { error } = await supabase.rpc('create_community_comment', {
    p_post_id: postId,
    p_body: body,
  });
  if (error) throw error;
}

export async function reportCommunityContent(input: {
  postId?: string;
  commentId?: string;
  reason: CommunityReportReason;
  details?: string;
}): Promise<void> {
  await requireAuthenticatedSession();
  if (Boolean(input.postId) === Boolean(input.commentId)) {
    throw new Error('Report exactly one post or comment.');
  }
  const { error } = await supabase.rpc('report_community_content', {
    p_post_id: input.postId ?? null,
    p_comment_id: input.commentId ?? null,
    p_reason: input.reason,
    p_details: input.details?.trim() || null,
  });
  if (error) throw error;
}

export async function getCommunityReports(limit = 50): Promise<CommunityReport[]> {
  await requireAuthenticatedSession();
  const { data, error } = await supabase.rpc('get_community_reports', { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as CommunityReport[];
}

export async function moderateCommunityContent(input: {
  postId?: string;
  commentId?: string;
  action: CommunityModerationAction;
  reason: string;
}): Promise<void> {
  await requireAuthenticatedSession();
  if (Boolean(input.postId) === Boolean(input.commentId)) {
    throw new Error('Select exactly one post or comment to moderate.');
  }
  const { error } = await supabase.rpc('moderate_community_content', {
    p_post_id: input.postId ?? null,
    p_comment_id: input.commentId ?? null,
    p_action: input.action,
    p_reason: input.reason,
  });
  if (error) throw error;
}

export async function reviewCommunityReport(input: {
  reportId: string;
  status: Exclude<CommunityReportStatus, 'pending'>;
  resolutionNotes?: string;
}): Promise<void> {
  await requireAuthenticatedSession();
  const { error } = await supabase.rpc('review_community_report', {
    p_report_id: input.reportId,
    p_status: input.status,
    p_resolution_notes: input.resolutionNotes?.trim() || null,
  });
  if (error) throw error;
}

export async function suspendCommunityUser(userId: string, reason: string): Promise<void> {
  await requireAuthenticatedSession();
  const { error } = await supabase.rpc('suspend_community_user', {
    p_user_id: userId,
    p_reason: reason,
    p_ends_at: null,
  });
  if (error) throw error;
}

export async function revokeCommunitySuspension(suspensionId: string): Promise<void> {
  await requireAuthenticatedSession();
  const { error } = await supabase.rpc('revoke_community_suspension', {
    p_suspension_id: suspensionId,
  });
  if (error) throw error;
}
