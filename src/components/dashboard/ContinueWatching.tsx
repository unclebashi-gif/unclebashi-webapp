import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { getMyContinueWatchingEntries } from '@/lib/educationService';
import type { ContinueWatchingEntry } from '@/types/education';
import { Button } from '../ui/button';
import { PlayIcon, ClockIcon, CheckCircleIcon, BookIcon } from '../ui/Icons';

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatPosition(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export const ContinueWatching: React.FC = () => {
  const { isAuthenticated, user, setCurrentView, setEducationResumeTarget } = useAppStore();
  const [entries, setEntries] = useState<ContinueWatchingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(isAuthenticated);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    if (!isAuthenticated) {
      setEntries([]);
      setError(null);
      setIsLoading(false);
      return () => { isCurrent = false; };
    }

    setIsLoading(true);
    setError(null);
    void getMyContinueWatchingEntries()
      .then((result) => {
        if (isCurrent) setEntries(result);
      })
      .catch((loadError: unknown) => {
        if (isCurrent) {
          setEntries([]);
          setError(loadError instanceof Error ? loadError.message : 'Unable to load your lesson progress.');
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => { isCurrent = false; };
  }, [isAuthenticated, user?.id, retryKey]);

  const openEntry = (entry: ContinueWatchingEntry) => {
    setEducationResumeTarget({
      courseId: entry.course.id,
      lessonId: entry.lesson.id,
      positionSeconds: entry.lessonProgress.last_position_seconds,
    });
    setCurrentView('education');
  };

  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm" role="status" aria-label="Loading lesson progress">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-48 mb-4" />
          <div className="h-24 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm" role="alert">
        <h3 className="text-lg font-bold text-[#1e3a5f] mb-2">Progress is unavailable</h3>
        <p className="text-sm text-gray-600">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => setRetryKey((key) => key + 1)}>
          Try again
        </Button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f] rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold mb-2">Continue Your Learning</h3>
            <p className="text-white/80 mb-4">
              Lessons you start will appear here when they are available.
            </p>
            <Button variant="secondary" onClick={() => setCurrentView('education')}>
              <BookIcon size={18} className="mr-2" />
              Browse Education
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
        <h3 className="text-xl font-bold text-[#1e3a5f]">Continue Where You Left Off</h3>
      </div>

      <div className="divide-y divide-gray-100">
        {entries.map((entry) => {
          const courseProgress = entry.courseProgress?.progress_percentage;
          return (
            <button
              key={`${entry.course.id}-${entry.lesson.id}`}
              type="button"
              onClick={() => openEntry(entry)}
              className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <div className="relative w-24 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-[#1e3a5f] flex items-center justify-center">
                  {entry.course.thumbnail_url ? (
                    <img src={entry.course.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <BookIcon size={28} className="text-white/80" />
                  )}
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <div className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center">
                      <PlayIcon size={16} className="text-[#1e3a5f] ml-0.5" />
                    </div>
                  </div>
                  {courseProgress !== undefined && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/30">
                      <div className="h-full bg-[#c4785a]" style={{ width: `${courseProgress}%` }} />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#c4785a] font-medium uppercase tracking-wide mb-1">Continue lesson</p>
                  <h4 className="font-semibold text-[#1e3a5f] truncate">{entry.lesson.title}</h4>
                  <p className="text-sm text-gray-500 truncate">{entry.course.title} · {entry.module.title}</p>
                  <div className="flex items-center space-x-3 mt-1 text-xs text-gray-400">
                    <span className="flex items-center">
                      <ClockIcon size={12} className="mr-1" />
                      {formatTimeAgo(entry.lessonProgress.updated_at)}
                    </span>
                    <span>Resume at {formatPosition(entry.lessonProgress.last_position_seconds)}</span>
                    {courseProgress !== undefined && <span>{Math.round(courseProgress)}% course progress</span>}
                  </div>
                </div>

                <span className="flex-shrink-0 rounded-lg border border-[#1e3a5f] px-3 py-2 text-sm font-medium text-[#1e3a5f]">
                  Resume
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-4 bg-[#faf6f1] border-t border-gray-100 flex items-center gap-2 text-sm text-emerald-700">
        <CheckCircleIcon size={14} />
        Progress loaded from your account
      </div>
    </div>
  );
};

export default ContinueWatching;
