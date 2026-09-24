import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { useCourseProgress } from '@/hooks/useCourseProgress';
import { PlayIcon, CheckCircleIcon } from '../ui/Icons';

// Custom icons for video player
const PauseIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

const VolumeIcon: React.FC<{ size?: number; className?: string; muted?: boolean }> = ({ size = 24, className, muted }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
    {!muted && (
      <>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </>
    )}
    {muted && <line x1="23" y1="9" x2="17" y2="15" />}
    {muted && <line x1="17" y1="9" x2="23" y2="15" />}
  </svg>
);

const FullscreenIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);

const ExitFullscreenIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M8 3v3a2 2 0 0 1-2 2H3" />
    <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
    <path d="M3 16h3a2 2 0 0 1 2 2v3" />
    <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
  </svg>
);

const ReplayIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

const SyncIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
  </svg>
);

interface VideoPlayerProps {
  videoUrl: string;
  lessonId: string;
  lessonTitle: string;
  durationMinutes: number;
  onComplete: () => void;
  isCompleted?: boolean;
  courseId: string;
  readinessBonus?: number;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoUrl,
  lessonId,
  lessonTitle,
  durationMinutes,
  onComplete,
  isCompleted = false,
  courseId,
  readinessBonus = 5,
}) => {
  const { user, updateUser } = useAppStore();
  const { saveLessonProgress, getLessonProgress } = useCourseProgress();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationMinutes * 60);
  const [progress, setProgress] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [markedComplete, setMarkedComplete] = useState(isCompleted);
  const [showCompletionBanner, setShowCompletionBanner] = useState(false);
  const [isYouTube, setIsYouTube] = useState(false);
  const [youtubePlayer, setYoutubePlayer] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressStorageKey = `video-progress-${lessonId}`;

  // Extract YouTube video ID
  const getYouTubeId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  const youtubeId = getYouTubeId(videoUrl);

  // Load saved progress from database on mount
  useEffect(() => {
    const loadProgress = async () => {
      const dbProgress = getLessonProgress(lessonId);
      
      if (dbProgress) {
        setCurrentTime(dbProgress.lastPosition || 0);
        setProgress(dbProgress.watchProgress || 0);
        if (dbProgress.isCompleted) {
          setMarkedComplete(true);
        }
        if (dbProgress.totalDurationSeconds) {
          setDuration(dbProgress.totalDurationSeconds);
        }
      } else {
        // Fallback to localStorage for offline support
        const savedProgress = localStorage.getItem(progressStorageKey);
        if (savedProgress) {
          const parsed = JSON.parse(savedProgress);
          setCurrentTime(parsed.currentTime || 0);
          setProgress(parsed.progress || 0);
          if (parsed.markedComplete) {
            setMarkedComplete(true);
          }
        }
      }
    };
    
    loadProgress();
  }, [lessonId, getLessonProgress, progressStorageKey]);

  // Save progress to database periodically
  useEffect(() => {
    const saveToDatabase = async () => {
      if (!hasStarted) return;
      
      setIsSyncing(true);
      
      // Save to localStorage for offline support
      localStorage.setItem(progressStorageKey, JSON.stringify({
        currentTime,
        progress,
        markedComplete,
        lastUpdated: new Date().toISOString(),
      }));
      
      // Save to database
      await saveLessonProgress(
        lessonId,
        courseId,
        progress,
        currentTime,
        duration,
        markedComplete,
        markedComplete ? readinessBonus : 0
      );
      
      setLastSyncTime(new Date());
      setTimeout(() => setIsSyncing(false), 500);
    };

    // Save every 10 seconds while watching
    saveIntervalRef.current = setInterval(saveToDatabase, 10000);
    
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
      // Save on unmount
      saveToDatabase();
    };
  }, [currentTime, progress, markedComplete, hasStarted, lessonId, courseId, duration, readinessBonus, saveLessonProgress, progressStorageKey]);

  // Check for 90% completion
  useEffect(() => {
    if (progress >= 90 && !markedComplete) {
      setMarkedComplete(true);
      setShowCompletionBanner(true);
      
      // Update readiness score locally
      if (user && readinessBonus > 0) {
        const newScore = Math.min(100, (user.readinessScore || 0) + readinessBonus);
        updateUser({ readinessScore: newScore });
      }
      
      // Trigger completion callback
      onComplete();
      
      // Save completion state to localStorage
      localStorage.setItem(progressStorageKey, JSON.stringify({
        currentTime,
        progress,
        markedComplete: true,
        completedAt: new Date().toISOString(),
      }));

      // Save to database immediately
      saveLessonProgress(
        lessonId,
        courseId,
        progress,
        currentTime,
        duration,
        true,
        readinessBonus
      );

      // Hide banner after 5 seconds
      setTimeout(() => setShowCompletionBanner(false), 5000);
    }
  }, [progress, markedComplete, user, updateUser, readinessBonus, onComplete, currentTime, progressStorageKey, lessonId, courseId, duration, saveLessonProgress]);

  // Handle controls visibility
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying]);

  // Fullscreen handling
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  // Video event handlers for HTML5 video
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      const total = videoRef.current.duration || duration;
      setCurrentTime(current);
      setProgress((current / total) * 100);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      
      // Resume from saved position
      const dbProgress = getLessonProgress(lessonId);
      if (dbProgress && dbProgress.lastPosition && dbProgress.lastPosition < videoRef.current.duration * 0.95) {
        videoRef.current.currentTime = dbProgress.lastPosition;
      } else {
        const savedProgress = localStorage.getItem(progressStorageKey);
        if (savedProgress) {
          const parsed = JSON.parse(savedProgress);
          if (parsed.currentTime && parsed.currentTime < videoRef.current.duration * 0.95) {
            videoRef.current.currentTime = parsed.currentTime;
          }
        }
      }
    }
  };

  const handleProgress = () => {
    if (videoRef.current && videoRef.current.buffered.length > 0) {
      const bufferedEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
      const total = videoRef.current.duration || duration;
      setBuffered((bufferedEnd / total) * 100);
    }
  };

  const togglePlay = () => {
    if (!hasStarted) setHasStarted(true);
    
    if (youtubePlayer) {
      if (isPlaying) {
        youtubePlayer.pauseVideo();
      } else {
        youtubePlayer.playVideo();
      }
      setIsPlaying(!isPlaying);
    } else if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
    showControlsTemporarily();
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current) return;
    
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = (clickX / rect.width) * 100;
    const newTime = (percentage / 100) * duration;
    
    if (youtubePlayer) {
      youtubePlayer.seekTo(newTime, true);
    } else if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
    
    setCurrentTime(newTime);
    setProgress(percentage);
  };

  const toggleMute = () => {
    if (youtubePlayer) {
      if (isMuted) {
        youtubePlayer.unMute();
      } else {
        youtubePlayer.mute();
      }
    } else if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    
    if (youtubePlayer) {
      youtubePlayer.setVolume(newVolume * 100);
    } else if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
  };

  const replay = () => {
    if (youtubePlayer) {
      youtubePlayer.seekTo(0, true);
      youtubePlayer.playVideo();
    } else if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
    }
    setIsPlaying(true);
    setCurrentTime(0);
    setProgress(0);
  };

  // Format time display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // YouTube iframe setup
  useEffect(() => {
    if (youtubeId) {
      setIsYouTube(true);
      
      // Load YouTube IFrame API
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      // Initialize player when API is ready
      (window as any).onYouTubeIframeAPIReady = () => {
        const player = new (window as any).YT.Player(`youtube-player-${lessonId}`, {
          videoId: youtubeId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            fs: 0,
          },
          events: {
            onReady: (event: any) => {
              setYoutubePlayer(event.target);
              setDuration(event.target.getDuration());
              
              // Resume from saved position
              const dbProgress = getLessonProgress(lessonId);
              if (dbProgress && dbProgress.lastPosition && dbProgress.lastPosition < event.target.getDuration() * 0.95) {
                event.target.seekTo(dbProgress.lastPosition, true);
              } else {
                const savedProgress = localStorage.getItem(progressStorageKey);
                if (savedProgress) {
                  const parsed = JSON.parse(savedProgress);
                  if (parsed.currentTime && parsed.currentTime < event.target.getDuration() * 0.95) {
                    event.target.seekTo(parsed.currentTime, true);
                  }
                }
              }
            },
            onStateChange: (event: any) => {
              setIsPlaying(event.data === 1);
              if (event.data === 1) {
                setHasStarted(true);
              }
            },
          },
        });
      };

      // If API already loaded
      if ((window as any).YT && (window as any).YT.Player) {
        (window as any).onYouTubeIframeAPIReady();
      }
    }
  }, [youtubeId, lessonId, progressStorageKey, getLessonProgress]);

  // YouTube progress tracking
  useEffect(() => {
    if (!youtubePlayer || !isPlaying) return;

    const interval = setInterval(() => {
      const current = youtubePlayer.getCurrentTime();
      const total = youtubePlayer.getDuration();
      setCurrentTime(current);
      setProgress((current / total) * 100);
    }, 500);

    return () => clearInterval(interval);
  }, [youtubePlayer, isPlaying]);

  return (
    <div
      ref={containerRef}
      className={`relative bg-gray-900 rounded-xl overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'aspect-video'}`}
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* Video Element */}
      {isYouTube ? (
        <div className="absolute inset-0">
          <div id={`youtube-player-${lessonId}`} className="w-full h-full" />
        </div>
      ) : (
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onProgress={handleProgress}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        >
          <source src={videoUrl} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      )}

      {/* Play button overlay (when not started) */}
      {!hasStarted && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 cursor-pointer"
          onClick={togglePlay}
        >
          <div className="w-20 h-20 bg-white/90 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
            <PlayIcon size={40} className="text-[#1e3a5f] ml-1" />
          </div>
          <p className="text-white mt-4 text-lg font-medium">{lessonTitle}</p>
          <p className="text-white/70 text-sm">{durationMinutes} minutes</p>
          {progress > 0 && !markedComplete && (
            <p className="text-emerald-400 text-sm mt-2">
              Resume from {Math.round(progress)}%
            </p>
          )}
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          showControls && hasStarted ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Gradient overlays */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 to-transparent" />

        {/* Top bar - Title and sync status */}
        <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between">
          <h3 className="text-white font-medium truncate">{lessonTitle}</h3>
          <div className="flex items-center space-x-2">
            {isSyncing && (
              <span className="flex items-center text-white/70 text-xs">
                <SyncIcon size={14} className="mr-1 animate-spin" />
                Syncing...
              </span>
            )}
            {lastSyncTime && !isSyncing && (
              <span className="text-white/50 text-xs">
                Saved
              </span>
            )}
          </div>
        </div>

        {/* Center play/pause button */}
        <div
          className="absolute inset-0 flex items-center justify-center cursor-pointer"
          onClick={togglePlay}
        >
          <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
            {isPlaying ? (
              <PauseIcon size={32} className="text-white" />
            ) : (
              <PlayIcon size={32} className="text-white ml-1" />
            )}
          </div>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-0 inset-x-0 p-4">
          {/* Progress bar */}
          <div
            ref={progressBarRef}
            className="relative h-2 bg-white/30 rounded-full cursor-pointer mb-4 group"
            onClick={handleSeek}
          >
            {/* Buffered */}
            <div
              className="absolute h-full bg-white/40 rounded-full"
              style={{ width: `${buffered}%` }}
            />
            {/* Progress */}
            <div
              className="absolute h-full bg-[#c4785a] rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
            {/* Scrubber */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${progress}% - 8px)` }}
            />
            
            {/* 90% completion marker */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-emerald-400 rounded-full"
              style={{ left: '90%' }}
              title="90% - Auto-complete point"
            />
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Play/Pause */}
              <button
                onClick={togglePlay}
                className="text-white hover:text-[#c4785a] transition-colors"
              >
                {isPlaying ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
              </button>

              {/* Replay */}
              <button
                onClick={replay}
                className="text-white hover:text-[#c4785a] transition-colors"
              >
                <ReplayIcon size={20} />
              </button>

              {/* Volume */}
              <div className="flex items-center space-x-2 group">
                <button
                  onClick={toggleMute}
                  className="text-white hover:text-[#c4785a] transition-colors"
                >
                  <VolumeIcon size={20} muted={isMuted} />
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-0 group-hover:w-20 transition-all duration-200 accent-[#c4785a]"
                />
              </div>

              {/* Time display */}
              <span className="text-white text-sm">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center space-x-4">
              {/* Completion status */}
              {markedComplete && (
                <span className="flex items-center text-emerald-400 text-sm">
                  <CheckCircleIcon size={16} className="mr-1" />
                  Completed
                </span>
              )}

              {/* Progress percentage */}
              <span className="text-white/70 text-sm">
                {Math.round(progress)}% watched
              </span>

              {/* Fullscreen */}
              <button
                onClick={toggleFullscreen}
                className="text-white hover:text-[#c4785a] transition-colors"
              >
                {isFullscreen ? <ExitFullscreenIcon size={20} /> : <FullscreenIcon size={20} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Completion banner */}
      {showCompletionBanner && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-6 py-3 rounded-full shadow-lg flex items-center space-x-2 animate-bounce">
          <CheckCircleIcon size={20} />
          <span className="font-medium">Lesson Complete! +{readinessBonus} Readiness Points</span>
        </div>
      )}

      {/* 90% marker tooltip */}
      {progress >= 85 && progress < 90 && !markedComplete && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-[#1e3a5f] text-white px-4 py-2 rounded-lg text-sm shadow-lg">
          Almost there! Watch to 90% to complete this lesson.
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
