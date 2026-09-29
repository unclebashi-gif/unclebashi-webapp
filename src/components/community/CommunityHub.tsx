import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { COMMUNITY_TIERS } from '@/lib/constants';
import {
  createCommunityComment,
  createCommunityPost,
  getCommunityComments,
  getCommunityFeed,
  reportCommunityContent,
} from '@/lib/communityService';
import type { CommunityComment, CommunityPost, CommunityReportReason } from '@/types/community';
import {
  GlobeIcon,
  UsersIcon,
  SendIcon,
  FlagIcon,
  MessageCircleIcon,
  ShieldIcon,
} from '../ui/Icons';

type TierId = 'open' | 'guided' | 'preparation';
type ReportTarget = { kind: 'post' | 'comment'; id: string };

const reportReasons: { value: CommunityReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'abuse', label: 'Abuse' },
  { value: 'sexual_content', label: 'Sexual content' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'privacy', label: 'Privacy concern' },
  { value: 'other', label: 'Other' },
];

const formatDate = (value: string) => new Date(value).toLocaleString();

export const CommunityHub: React.FC = () => {
  const [selectedTier, setSelectedTier] = useState<TierId>('open');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState('');
  const [showNewPost, setShowNewPost] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isCreatingComment, setIsCreatingComment] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportReason, setReportReason] = useState<CommunityReportReason>('other');
  const [reportDetails, setReportDetails] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const refreshFeed = useCallback(async () => {
    setIsLoading(true);
    setFeedError('');
    try {
      const result = await getCommunityFeed();
      setPosts(result);
      setHasMore(result.length === 20);
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : 'Could not load Community posts.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshFeed();
  }, [refreshFeed]);

  const loadMore = async () => {
    const lastPost = posts[posts.length - 1];
    if (!lastPost || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    setFeedError('');
    try {
      const result = await getCommunityFeed(20, { createdAt: lastPost.created_at, id: lastPost.id });
      setPosts((current) => [...current, ...result]);
      setHasMore(result.length === 20);
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : 'Could not load more posts.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const openPost = async (post: CommunityPost) => {
    setSelectedPost(post);
    setComments([]);
    setCommentsLoading(true);
    setCommentsError('');
    try {
      setComments(await getCommunityComments(post.id));
    } catch (error) {
      setCommentsError(error instanceof Error ? error.message : 'Could not load comments.');
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleCreatePost = async () => {
    if (!newPostContent.trim() || isCreatingPost) return;
    setIsCreatingPost(true);
    setActionError('');
    try {
      await createCommunityPost(newPostContent.trim(), isAnonymous);
      setNewPostContent('');
      setShowNewPost(false);
      setIsAnonymous(false);
      await refreshFeed();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not publish your post.');
    } finally {
      setIsCreatingPost(false);
    }
  };

  const handleCreateComment = async () => {
    if (!newComment.trim() || !selectedPost || isCreatingComment) return;
    setIsCreatingComment(true);
    setActionError('');
    try {
      await createCommunityComment(selectedPost.id, newComment.trim());
      setNewComment('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not publish your comment.');
      setIsCreatingComment(false);
      return;
    }
    try {
      const [freshComments, freshFeed] = await Promise.all([
        getCommunityComments(selectedPost.id),
        getCommunityFeed(),
      ]);
      setComments(freshComments);
      setPosts(freshFeed);
      const refreshedPost = freshFeed.find((post) => post.id === selectedPost.id);
      setSelectedPost({
        ...(refreshedPost ?? selectedPost),
        comment_count: freshComments.length,
      });
      setHasMore(freshFeed.length === 20);
    } catch (error) {
      setActionError(`Comment posted, but the latest discussion state could not be refreshed: ${error instanceof Error ? error.message : 'refresh failed.'}`);
    } finally {
      setIsCreatingComment(false);
    }
  };

  const handleReport = async () => {
    if (!reportTarget || reporting) return;
    setReporting(true);
    setReportMessage('');
    try {
      await reportCommunityContent({
        ...(reportTarget.kind === 'post' ? { postId: reportTarget.id } : { commentId: reportTarget.id }),
        reason: reportReason,
        details: reportDetails,
      });
      setReportTarget(null);
      setReportDetails('');
      setReportMessage('Report submitted for moderator review.');
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : 'Could not submit the report.');
    } finally {
      setReporting(false);
    }
  };

  const tierIcons: Record<TierId, typeof GlobeIcon> = {
    open: GlobeIcon,
    guided: UsersIcon,
    preparation: ShieldIcon,
  };

  if (selectedPost) {
    return (
      <div className="min-h-screen bg-[#faf6f1] py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Button variant="ghost" onClick={() => { setSelectedPost(null); setActionError(''); }} className="mb-6">
            ← Back to Community
          </Button>
          <article className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6">
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                {selectedPost.author_profile_image_url ? (
                  <img src={selectedPost.author_profile_image_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center"><UsersIcon size={20} className="text-gray-400" /></div>
                )}
                <div>
                  <p className="font-medium text-[#1e3a5f]">{selectedPost.author_display_name}</p>
                  <time className="text-sm text-gray-500" dateTime={selectedPost.created_at}>{formatDate(selectedPost.created_at)}</time>
                </div>
              </div>
              {selectedPost.title && <h2 className="text-xl font-bold text-[#1e3a5f] mb-3">{selectedPost.title}</h2>}
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{selectedPost.body}</p>
              <button type="button" onClick={() => setReportTarget({ kind: 'post', id: selectedPost.id })} className="mt-4 flex items-center text-sm text-gray-500 hover:text-red-600">
                <FlagIcon size={16} className="mr-1" /> Report post
              </button>
            </div>
            <div className="border-t border-gray-100">
              <div className="p-4 bg-gray-50"><h3 className="font-medium text-[#1e3a5f]">{selectedPost.comment_count} Comments</h3></div>
              {commentsLoading ? <p className="p-5 text-sm text-gray-500">Loading comments…</p> : null}
              {commentsError ? <div className="p-5 text-sm text-red-700" role="alert">{commentsError}<button type="button" className="ml-2 underline" onClick={() => void openPost(selectedPost)}>Retry</button></div> : null}
              {!commentsLoading && !commentsError && comments.length === 0 ? <p className="p-5 text-sm text-gray-500">No comments yet.</p> : null}
              <div className="divide-y divide-gray-100">
                {comments.map((comment) => (
                  <div key={comment.id} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-[#1e3a5f] text-sm">{comment.author_display_name}</span>
                        <time className="text-xs text-gray-400" dateTime={comment.created_at}>{formatDate(comment.created_at)}</time>
                      </div>
                      <button type="button" onClick={() => setReportTarget({ kind: 'comment', id: comment.id })} className="text-xs text-gray-500 hover:text-red-600">Report</button>
                    </div>
                    <p className="text-gray-700 text-sm whitespace-pre-wrap">{comment.body}</p>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-gray-100">
                {actionError && <p role="alert" className="text-sm text-red-700 mb-3">{actionError}</p>}
                <div className="flex space-x-3">
                  <input type="text" value={newComment} onChange={(event) => setNewComment(event.target.value)} placeholder="Add a comment…" maxLength={3000} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent" onKeyDown={(event) => { if (event.key === 'Enter') void handleCreateComment(); }} />
                  <Button onClick={() => void handleCreateComment()} disabled={!newComment.trim() || isCreatingComment} isLoading={isCreatingComment} aria-label="Send comment"><SendIcon size={18} /></Button>
                </div>
              </div>
            </div>
          </article>
          {reportMessage && <p role="status" className="text-sm text-[#1e3a5f]">{reportMessage}</p>}
          {reportTarget && <ReportForm reason={reportReason} details={reportDetails} busy={reporting} setReason={setReportReason} setDetails={setReportDetails} onSubmit={() => void handleReport()} onCancel={() => setReportTarget(null)} />}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf6f1] py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1e3a5f] mb-2">Community</h1>
          <p className="text-gray-600">Connect with others on the same journey. Share experiences, ask questions, and grow together.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {COMMUNITY_TIERS.map((tier) => {
            const tierId = tier.id as TierId;
            const Icon = tierIcons[tierId];
            const isSelected = selectedTier === tierId;
            return (
              <button type="button" key={tier.id} aria-pressed={isSelected} onClick={() => setSelectedTier(tierId)} className={`p-4 rounded-xl border-2 text-left transition-all ${isSelected ? 'border-[#c4785a] bg-white shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <div className="flex items-center justify-between mb-2"><Icon size={24} className={isSelected ? 'text-[#c4785a]' : 'text-gray-400'} /></div>
                <h3 className="font-semibold text-[#1e3a5f]">{tier.title}</h3>
                <p className="text-sm text-gray-600 mt-1">{tier.description}</p>
                <p className="text-xs text-gray-400 mt-2">{tier.requirement}</p>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 -mt-5 mb-6">These cards describe future community formats; access is not determined by a readiness score.</p>

        <div className="bg-[#1e3a5f]/5 rounded-xl p-4 mb-6 flex items-start space-x-3">
          <ShieldIcon size={20} className="text-[#1e3a5f] flex-shrink-0 mt-0.5" />
          <div><p className="text-sm text-[#1e3a5f] font-medium">Community Guidelines</p><p className="text-sm text-gray-600">Be respectful and supportive. Posts and comments can be reported for moderator review.</p></div>
        </div>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-[#1e3a5f]">{COMMUNITY_TIERS.find((tier) => tier.id === selectedTier)?.title} Discussions</h2>
          <Button onClick={() => { setShowNewPost(true); setActionError(''); }}>Start Discussion</Button>
        </div>

        {showNewPost && <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-[#1e3a5f] mb-4">Start a New Discussion</h3>
          <textarea value={newPostContent} onChange={(event) => setNewPostContent(event.target.value)} placeholder="Share your thoughts, questions, or experiences…" rows={4} maxLength={5000} className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent resize-none mb-4" />
          <div className="flex items-center justify-between">
            <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={isAnonymous} onChange={(event) => setIsAnonymous(event.target.checked)} className="w-4 h-4 rounded border-gray-300 text-[#c4785a] focus:ring-[#c4785a]" /><span className="text-sm text-gray-600">Post anonymously</span></label>
            <div className="flex space-x-3"><Button variant="ghost" onClick={() => setShowNewPost(false)}>Cancel</Button><Button onClick={() => void handleCreatePost()} disabled={!newPostContent.trim() || isCreatingPost} isLoading={isCreatingPost}>Post</Button></div>
          </div>
          {actionError && <p role="alert" className="text-sm text-red-700 mt-3">{actionError}</p>}
        </div>}

        {reportMessage && <p role="status" className="text-sm text-[#1e3a5f] mb-4">{reportMessage}</p>}
        {reportTarget && <ReportForm reason={reportReason} details={reportDetails} busy={reporting} setReason={setReportReason} setDetails={setReportDetails} onSubmit={() => void handleReport()} onCancel={() => setReportTarget(null)} />}
        {isLoading ? <div className="bg-white rounded-xl p-12 text-center text-gray-500" role="status">Loading discussions…</div> : null}
        {!isLoading && feedError ? <div className="bg-white rounded-xl p-8 text-center" role="alert"><p className="text-red-700 mb-3">{feedError}</p><Button variant="outline" onClick={() => void refreshFeed()}>Retry</Button></div> : null}
        {!isLoading && !feedError && posts.length === 0 ? <div className="bg-white rounded-xl p-12 text-center"><MessageCircleIcon size={48} className="text-gray-300 mx-auto mb-4" /><h3 className="text-lg font-medium text-gray-600 mb-2">No discussions yet</h3><p className="text-gray-500">Be the first to start a conversation!</p></div> : null}
        {!isLoading && !feedError && posts.length > 0 ? <div className="space-y-4">
          {posts.map((post) => <article key={post.id} className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center space-x-3 mb-3">
              {post.author_profile_image_url ? <img src={post.author_profile_image_url} alt="" className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center"><UsersIcon size={20} className="text-gray-400" /></div>}
              <div><p className="font-medium text-[#1e3a5f]">{post.author_display_name}</p><time className="text-sm text-gray-500" dateTime={post.created_at}>{formatDate(post.created_at)}</time></div>
            </div>
            {post.title && <h3 className="text-lg font-semibold text-[#1e3a5f] mb-2">{post.title}</h3>}
            <p className="text-gray-700 line-clamp-3 whitespace-pre-wrap">{post.body}</p>
            <div className="flex items-center space-x-4 mt-4 pt-4 border-t border-gray-100">
              <button type="button" onClick={() => void openPost(post)} className="flex items-center text-sm text-gray-500 hover:text-[#1e3a5f]"><MessageCircleIcon size={16} className="mr-1" />{post.comment_count} comments</button>
              <button type="button" onClick={() => { setReportTarget({ kind: 'post', id: post.id }); setReportMessage(''); }} className="flex items-center text-sm text-gray-500 hover:text-red-500"><FlagIcon size={16} className="mr-1" />Report</button>
            </div>
          </article>)}
          {feedError && <p role="alert" className="text-sm text-red-700">{feedError}</p>}
          {hasMore && <div className="text-center"><Button variant="outline" onClick={() => void loadMore()} disabled={isLoadingMore} isLoading={isLoadingMore}>Load more</Button></div>}
        </div> : null}
      </div>
    </div>
  );
};

interface ReportFormProps {
  reason: CommunityReportReason;
  details: string;
  busy: boolean;
  setReason: (reason: CommunityReportReason) => void;
  setDetails: (details: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const ReportForm: React.FC<ReportFormProps> = ({ reason, details, busy, setReason, setDetails, onSubmit, onCancel }) => (
  <div className="bg-white rounded-xl shadow-sm p-5 mb-5 border border-gray-200">
    <h3 className="font-semibold text-[#1e3a5f] mb-3">Report content</h3>
    <label className="block text-sm text-gray-600 mb-3">Reason<select value={reason} onChange={(event) => setReason(event.target.value as CommunityReportReason)} className="block w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg">{reportReasons.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    <label className="block text-sm text-gray-600 mb-4">Details (optional)<textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={2000} rows={3} className="block w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg" /></label>
    <div className="flex justify-end gap-3"><Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button><Button onClick={onSubmit} disabled={busy} isLoading={busy}>Submit report</Button></div>
  </div>
);
