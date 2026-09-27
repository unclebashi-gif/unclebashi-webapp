import React, { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Button } from '../ui/button';
import { IMAGES, COMMUNITY_TIERS } from '@/lib/constants';
import { useGeolocation, COUNTRY_NAMES, type LocationCategory } from '@/hooks/useGeolocation';
import {
  GlobeIcon,
  UsersIcon,
  LockIcon,
  SendIcon,
  FlagIcon,
  MessageCircleIcon,
  CheckCircleIcon,
  ShieldIcon,
  MapPinIcon,
} from '../ui/Icons';

interface Post {
  id: string;
  userId: string;
  userName: string;
  userImage: string;
  tier: 'open' | 'guided' | 'preparation';
  title?: string;
  content: string;
  isAnonymous: boolean;
  createdAt: string;
  commentCount: number;
  comments?: Comment[];
  location?: string;
  countryCode?: string;
  category?: LocationCategory;
}

interface Comment {
  id: string;
  userName: string;
  content: string;
  createdAt: string;
  isAnonymous: boolean;
}

export const CommunityHub: React.FC = () => {
  const { user } = useAppStore();
  const { location: userLocation } = useGeolocation();
  const [selectedTier, setSelectedTier] = useState<'open' | 'guided' | 'preparation'>('open');
  const [showNewPost, setShowNewPost] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [newComment, setNewComment] = useState('');
  const [filterRegion, setFilterRegion] = useState<string>('');

  // Sample posts with pilot country locations
  const [posts, setPosts] = useState<Post[]>([
    {
      id: '1',
      userId: '1',
      userName: 'Sarah N.',
      userImage: IMAGES.profiles.women[0],
      tier: 'open',
      title: 'How do you handle different communication styles?',
      content: 'My partner and I have very different ways of expressing ourselves. I\'m more direct while they tend to be more reserved. Has anyone else navigated this? What helped you find common ground?',
      isAnonymous: false,
      createdAt: '2 hours ago',
      commentCount: 8,
      location: 'Kampala, Uganda',
      countryCode: 'UG',
      category: 'local',
      comments: [
        { id: '1', userName: 'James O.', content: 'We found that scheduled "check-in" conversations helped a lot. It gave my partner time to prepare what they wanted to say.', createdAt: '1 hour ago', isAnonymous: false },
        { id: '2', userName: 'Anonymous', content: 'Reading about love languages was a game changer for us. Highly recommend!', createdAt: '45 min ago', isAnonymous: true },
      ],
    },
    {
      id: '2',
      userId: '2',
      userName: 'Anonymous',
      userImage: '',
      tier: 'open',
      title: 'Dealing with family expectations',
      content: 'Both our families have strong opinions about how our marriage should look. How do you balance honoring family traditions while building your own path?',
      isAnonymous: true,
      createdAt: '5 hours ago',
      commentCount: 12,
      location: 'Nairobi, Kenya',
      countryCode: 'KE',
      category: 'local',
    },
    {
      id: '3',
      userId: '3',
      userName: 'David M.',
      userImage: IMAGES.profiles.men[0],
      tier: 'open',
      title: 'The Character & Accountability course changed my perspective',
      content: 'Just finished the course and I\'m honestly surprised at how much I learned about myself. The section on taking responsibility really hit home. Anyone else have similar experiences?',
      isAnonymous: false,
      createdAt: '1 day ago',
      commentCount: 15,
      location: 'Toronto, Canada',
      countryCode: 'CA',
      category: 'diaspora',
    },
    {
      id: '4',
      userId: '4',
      userName: 'Grace U.',
      userImage: IMAGES.profiles.women[1],
      tier: 'guided',
      title: 'Weekly Discussion: What does commitment mean to you?',
      content: 'This week\'s guided discussion topic: Share your thoughts on what commitment means in the context of marriage. How has your understanding evolved through the courses?',
      isAnonymous: false,
      createdAt: '3 days ago',
      commentCount: 24,
      location: 'Kigali, Rwanda',
      countryCode: 'RW',
      category: 'local',
    },
    {
      id: '5',
      userId: '5',
      userName: 'Michael W.',
      userImage: IMAGES.profiles.men[1],
      tier: 'preparation',
      title: 'Pre-matching reflection: Clarifying my values',
      content: 'As I prepare for the matching process, I\'ve been reflecting on my core values. The preparation course helped me articulate what I\'m truly looking for. Grateful for this community.',
      isAnonymous: false,
      createdAt: '1 week ago',
      commentCount: 7,
      location: 'Mombasa, Kenya',
      countryCode: 'KE',
      category: 'local',
    },
    {
      id: '6',
      userId: '6',
      userName: 'Jennifer A.',
      userImage: IMAGES.profiles.women[2],
      tier: 'open',
      title: 'Navigating cultural identity in the diaspora',
      content: 'As someone raised in Canada with Ugandan roots, I sometimes struggle with balancing both cultures in my relationship expectations. Anyone else in the diaspora relate to this?',
      isAnonymous: false,
      createdAt: '2 days ago',
      commentCount: 18,
      location: 'Vancouver, Canada',
      countryCode: 'CA',
      category: 'diaspora',
    },
  ]);

  // Filter posts by tier and optionally by region
  const filteredPosts = posts.filter((post) => {
    const tierMatch = post.tier === selectedTier;
    const regionMatch = !filterRegion || 
      (filterRegion === 'local' && post.category === 'local') ||
      (filterRegion === 'diaspora' && post.category === 'diaspora');
    return tierMatch && regionMatch;
  });

  // Sort posts - same location/region first
  const sortedPosts = [...filteredPosts].sort((a, b) => {
    if (!userLocation?.countryCode) return 0;
    
    const aInSameCountry = a.countryCode === userLocation.countryCode;
    const bInSameCountry = b.countryCode === userLocation.countryCode;
    
    if (aInSameCountry && !bInSameCountry) return -1;
    if (!aInSameCountry && bInSameCountry) return 1;
    
    const aInSameCategory = a.category === userLocation.category;
    const bInSameCategory = b.category === userLocation.category;
    
    if (aInSameCategory && !bInSameCategory) return -1;
    if (!aInSameCategory && bInSameCategory) return 1;
    
    return 0;
  });

  const tierIcons = {
    open: GlobeIcon,
    guided: UsersIcon,
    preparation: ShieldIcon,
  };

  const canAccessTier = (tier: string) => {
    if (tier === 'open') return true;
    if (tier === 'guided') return (user?.readinessScore || 0) >= 30;
    if (tier === 'preparation') return (user?.readinessScore || 0) >= 70;
    return false;
  };




  const handleCreatePost = () => {
    if (!newPostContent.trim()) return;

    const newPost: Post = {
      id: Date.now().toString(),
      userId: user?.id || '',
      userName: isAnonymous ? 'Anonymous' : (user?.fullName || 'User'),
      userImage: isAnonymous ? '' : (user?.profileImageUrl || IMAGES.profiles.men[0]),
      tier: selectedTier,
      content: newPostContent,
      isAnonymous,
      createdAt: 'Just now',
      commentCount: 0,
      comments: [],
    };

    setPosts([newPost, ...posts]);
    setNewPostContent('');
    setShowNewPost(false);
    setIsAnonymous(false);
  };

  const handleAddComment = () => {
    if (!newComment.trim() || !selectedPost) return;

    const comment: Comment = {
      id: Date.now().toString(),
      userName: user?.fullName || 'User',
      content: newComment,
      createdAt: 'Just now',
      isAnonymous: false,
    };

    const updatedPosts = posts.map((p) =>
      p.id === selectedPost.id
        ? {
            ...p,
            comments: [...(p.comments || []), comment],
            commentCount: p.commentCount + 1,
          }
        : p
    );

    setPosts(updatedPosts);
    setSelectedPost({
      ...selectedPost,
      comments: [...(selectedPost.comments || []), comment],
      commentCount: selectedPost.commentCount + 1,
    });
    setNewComment('');
  };

  if (selectedPost) {
    return (
      <div className="min-h-screen bg-[#faf6f1] py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Button variant="ghost" onClick={() => setSelectedPost(null)} className="mb-6">
            ← Back to Community
          </Button>

          {/* Post detail */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6">
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                {selectedPost.isAnonymous ? (
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                    <UsersIcon size={20} className="text-gray-400" />
                  </div>
                ) : (
                  <img
                    src={selectedPost.userImage}
                    alt={selectedPost.userName}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                )}
                <div>
                  <p className="font-medium text-[#1e3a5f]">{selectedPost.userName}</p>
                  <p className="text-sm text-gray-500">{selectedPost.createdAt}</p>
                </div>
              </div>

              {selectedPost.title && (
                <h2 className="text-xl font-bold text-[#1e3a5f] mb-3">{selectedPost.title}</h2>
              )}
              <p className="text-gray-700 leading-relaxed">{selectedPost.content}</p>
            </div>

            {/* Comments */}
            <div className="border-t border-gray-100">
              <div className="p-4 bg-gray-50">
                <h3 className="font-medium text-[#1e3a5f]">
                  {selectedPost.commentCount} Comments
                </h3>
              </div>

              <div className="divide-y divide-gray-100">
                {selectedPost.comments?.map((comment) => (
                  <div key={comment.id} className="p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="font-medium text-[#1e3a5f] text-sm">
                        {comment.isAnonymous ? 'Anonymous' : comment.userName}
                      </span>
                      <span className="text-xs text-gray-400">{comment.createdAt}</span>
                    </div>
                    <p className="text-gray-700 text-sm">{comment.content}</p>
                  </div>
                ))}
              </div>

              {/* Add comment */}
              <div className="p-4 border-t border-gray-100">
                <div className="flex space-x-3">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
                  />
                  <Button onClick={handleAddComment} disabled={!newComment.trim()}>
                    <SendIcon size={18} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf6f1] py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1e3a5f] mb-2">Community</h1>
          <p className="text-gray-600">
            Connect with others on the same journey. Share experiences, ask questions, and grow together.
          </p>
        </div>

        {/* Tier selector */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {COMMUNITY_TIERS.map((tier) => {
            const Icon = tierIcons[tier.id as keyof typeof tierIcons];
            const isAccessible = canAccessTier(tier.id);
            const isSelected = selectedTier === tier.id;

            return (
              <button
                key={tier.id}
                onClick={() => isAccessible && setSelectedTier(tier.id as typeof selectedTier)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  isSelected
                    ? 'border-[#c4785a] bg-white shadow-sm'
                    : isAccessible
                    ? 'border-gray-200 bg-white hover:border-gray-300'
                    : 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon size={24} className={isSelected ? 'text-[#c4785a]' : 'text-gray-400'} />
                  {!isAccessible && <LockIcon size={16} className="text-gray-400" />}
                </div>
                <h3 className="font-semibold text-[#1e3a5f]">{tier.title}</h3>
                <p className="text-sm text-gray-600 mt-1">{tier.description}</p>
                <p className="text-xs text-gray-400 mt-2">{tier.requirement}</p>
              </button>
            );
          })}
        </div>

        {/* Community guidelines */}
        <div className="bg-[#1e3a5f]/5 rounded-xl p-4 mb-6 flex items-start space-x-3">
          <ShieldIcon size={20} className="text-[#1e3a5f] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-[#1e3a5f] font-medium">Community Guidelines</p>
            <p className="text-sm text-gray-600">
              All discussions are moderated. Contact details are hidden. Be respectful and supportive.
            </p>
          </div>
        </div>

        {/* New post button */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-[#1e3a5f]">
            {COMMUNITY_TIERS.find((t) => t.id === selectedTier)?.title} Discussions
          </h2>
          <Button onClick={() => setShowNewPost(true)}>
            Start Discussion
          </Button>
        </div>

        {/* New post form */}
        {showNewPost && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-[#1e3a5f] mb-4">Start a New Discussion</h3>
            <textarea
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              placeholder="Share your thoughts, questions, or experiences..."
              rows={4}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent resize-none mb-4"
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-[#c4785a] focus:ring-[#c4785a]"
                />
                <span className="text-sm text-gray-600">Post anonymously</span>
              </label>
              <div className="flex space-x-3">
                <Button variant="ghost" onClick={() => setShowNewPost(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreatePost} disabled={!newPostContent.trim()}>
                  Post
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Posts list */}
        <div className="space-y-4">
          {filteredPosts.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center">
              <MessageCircleIcon size={48} className="text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">No discussions yet</h3>
              <p className="text-gray-500">Be the first to start a conversation!</p>
            </div>
          ) : (
            filteredPosts.map((post) => (
              <div
                key={post.id}
                onClick={() => setSelectedPost(post)}
                className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-center space-x-3 mb-3">
                  {post.isAnonymous ? (
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                      <UsersIcon size={20} className="text-gray-400" />
                    </div>
                  ) : (
                    <img
                      src={post.userImage}
                      alt={post.userName}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  )}
                  <div>
                    <p className="font-medium text-[#1e3a5f]">{post.userName}</p>
                    <p className="text-sm text-gray-500">{post.createdAt}</p>
                  </div>
                </div>

                {post.title && (
                  <h3 className="text-lg font-semibold text-[#1e3a5f] mb-2">{post.title}</h3>
                )}
                <p className="text-gray-700 line-clamp-3">{post.content}</p>

                <div className="flex items-center space-x-4 mt-4 pt-4 border-t border-gray-100">
                  <span className="flex items-center text-sm text-gray-500">
                    <MessageCircleIcon size={16} className="mr-1" />
                    {post.commentCount} comments
                  </span>
                  <button className="flex items-center text-sm text-gray-500 hover:text-red-500">
                    <FlagIcon size={16} className="mr-1" />
                    Report
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
