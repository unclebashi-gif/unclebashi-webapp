import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useCourseProgress, LessonProgress } from '@/hooks/useCourseProgress';
import { Button } from '../ui/button';
import { PlayIcon, ClockIcon, CheckCircleIcon, BookIcon } from '../ui/Icons';
import { IMAGES } from '@/lib/constants';


// Course metadata for display
const COURSE_METADATA: Record<string, { title: string; thumbnail: string }> = {
  'free-overview': {
    title: 'Marriage Preparation Overview',
    thumbnail: IMAGES.hero,
  },
  'premium-full-course': {
    title: 'Complete Pre-Marriage Course',
    thumbnail: IMAGES.journey,
  },
  '11111111-1111-1111-1111-111111111111': {
    title: 'Marriage Readiness Foundations',
    thumbnail: IMAGES.journey,
  },
  '22222222-2222-2222-2222-222222222222': {
    title: 'Character & Accountability',
    thumbnail: IMAGES.journey,
  },
  '33333333-3333-3333-3333-333333333333': {
    title: 'Communication Essentials',
    thumbnail: IMAGES.community,
  },
};

// Lesson metadata for display
const LESSON_METADATA: Record<string, { title: string; courseId: string }> = {
  'overview-1': { title: 'Welcome to Uncle Bashi', courseId: 'free-overview' },
  'overview-2': { title: 'The Journey Ahead', courseId: 'free-overview' },
  'overview-3': { title: 'Your First Step', courseId: 'free-overview' },
  'p1': { title: 'Understanding Your Values', courseId: 'premium-full-course' },
  'p2': { title: 'Communication Foundations', courseId: 'premium-full-course' },
  'p3': { title: 'Conflict Resolution', courseId: 'premium-full-course' },
  'p4': { title: 'Financial Partnership', courseId: 'premium-full-course' },
  'p5': { title: 'Family & Future Planning', courseId: 'premium-full-course' },
  'p6': { title: 'Your Readiness Assessment', courseId: 'premium-full-course' },
  '1': { title: 'Why Marriage?', courseId: '11111111-1111-1111-1111-111111111111' },
  '2': { title: 'Self-Assessment', courseId: '11111111-1111-1111-1111-111111111111' },
  '3': { title: 'Expectations vs Reality', courseId: '11111111-1111-1111-1111-111111111111' },
  '4': { title: 'The Foundation of Integrity', courseId: '22222222-2222-2222-2222-222222222222' },
  '5': { title: 'Taking Responsibility', courseId: '22222222-2222-2222-2222-222222222222' },
  '6': { title: 'Active Listening', courseId: '33333333-3333-3333-3333-333333333333' },
  '7': { title: 'Expressing Needs', courseId: '33333333-3333-3333-3333-333333333333' },
};

interface ContinueItem {
  type: 'course' | 'lesson';
  courseId: string;
  lessonId?: string;
  courseName: string;
  lessonName?: string;
  progress: number;
  lastAccessed: string;
  thumbnail: string;
}

export const ContinueWatching: React.FC = () => {
  const { setCurrentView, isAuthenticated } = useAppStore();
  const { courseProgress, lessonProgress, isLoading } = useCourseProgress();
  const [continueItems, setContinueItems] = useState<ContinueItem[]>([]);

  useEffect(() => {
    if (isLoading) return;

    const items: ContinueItem[] = [];

    // Find in-progress courses and their lessons
    courseProgress.forEach((cp, courseId) => {
      if (cp.status === 'in_progress') {
        const courseMeta = COURSE_METADATA[courseId];
        if (!courseMeta) return;

        // Find the first incomplete lesson in this course
        let firstIncompleteLesson: LessonProgress | null = null;
        lessonProgress.forEach((lp, lessonId) => {
          if (lp.courseId === courseId && !lp.isCompleted) {
            if (!firstIncompleteLesson || LESSON_METADATA[lessonId]) {
              firstIncompleteLesson = lp;
            }
          }
        });

        if (firstIncompleteLesson) {
          const lessonMeta = LESSON_METADATA[firstIncompleteLesson.lessonId];
          items.push({
            type: 'lesson',
            courseId,
            lessonId: firstIncompleteLesson.lessonId,
            courseName: courseMeta.title,
            lessonName: lessonMeta?.title || 'Continue Lesson',
            progress: firstIncompleteLesson.watchProgress,
            lastAccessed: cp.lastAccessed,
            thumbnail: courseMeta.thumbnail,
          });
        } else {
          items.push({
            type: 'course',
            courseId,
            courseName: courseMeta.title,
            progress: cp.progress,
            lastAccessed: cp.lastAccessed,
            thumbnail: courseMeta.thumbnail,
          });
        }
      }
    });

    // Sort by last accessed
    items.sort((a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime());

    setContinueItems(items.slice(0, 3)); // Show max 3 items
  }, [courseProgress, lessonProgress, isLoading]);

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleContinue = (item: ContinueItem) => {
    // Navigate to education hub - the course/lesson will be selected there
    setCurrentView('education');
  };

  if (!isAuthenticated) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-48 mb-4" />
          <div className="h-24 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (continueItems.length === 0) {
    return (
      <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f] rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold mb-2">Start Your Journey</h3>
            <p className="text-white/80 mb-4">
              Begin with our FREE 10-minute overview course and discover the path to a fulfilling marriage.
            </p>
            <Button
              variant="secondary"
              onClick={() => setCurrentView('education')}
            >
              <PlayIcon size={18} className="mr-2" />
              Start Free Course
            </Button>
          </div>
          <div className="hidden md:block">
            <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center">
              <BookIcon size={40} className="text-white/80" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-[#1e3a5f]">Continue Where You Left Off</h3>
          <button
            onClick={() => setCurrentView('education')}
            className="text-[#c4785a] hover:text-[#b36a4a] text-sm font-medium"
          >
            View All Courses
          </button>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {continueItems.map((item, index) => (
          <div
            key={`${item.courseId}-${item.lessonId || 'course'}`}
            className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
            onClick={() => handleContinue(item)}
          >
            <div className="flex items-center space-x-4">
              {/* Thumbnail */}
              <div className="relative w-24 h-16 rounded-lg overflow-hidden flex-shrink-0">
                <img
                  src={item.thumbnail}
                  alt={item.courseName}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center">
                    <PlayIcon size={16} className="text-[#1e3a5f] ml-0.5" />
                  </div>
                </div>
                {/* Progress overlay */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/30">
                  <div
                    className="h-full bg-[#c4785a]"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#c4785a] font-medium uppercase tracking-wide mb-1">
                  {item.type === 'lesson' ? 'Continue Lesson' : 'Continue Course'}
                </p>
                <h4 className="font-semibold text-[#1e3a5f] truncate">
                  {item.type === 'lesson' ? item.lessonName : item.courseName}
                </h4>
                {item.type === 'lesson' && (
                  <p className="text-sm text-gray-500 truncate">{item.courseName}</p>
                )}
                <div className="flex items-center space-x-3 mt-1 text-xs text-gray-400">
                  <span className="flex items-center">
                    <ClockIcon size={12} className="mr-1" />
                    {formatTimeAgo(item.lastAccessed)}
                  </span>
                  <span>{Math.round(item.progress)}% complete</span>
                </div>
              </div>

              {/* Action */}
              <div className="flex-shrink-0">
                <Button size="sm" variant="outline">
                  Resume
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick stats */}
      <div className="p-4 bg-[#faf6f1] border-t border-gray-100">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-4">
            <span className="text-gray-600">
              <span className="font-semibold text-[#1e3a5f]">
                {Array.from(courseProgress.values()).filter(c => c.status === 'completed').length}
              </span>{' '}
              courses completed
            </span>
            <span className="text-gray-600">
              <span className="font-semibold text-[#1e3a5f]">
                {Array.from(lessonProgress.values()).filter(l => l.isCompleted).length}
              </span>{' '}
              lessons watched
            </span>
          </div>
          <span className="flex items-center text-emerald-600">
            <CheckCircleIcon size={14} className="mr-1" />
            Progress synced
          </span>
        </div>
      </div>
    </div>
  );
};

export default ContinueWatching;
