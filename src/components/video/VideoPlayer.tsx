import React, { useState, useRef, useEffect, useCallback } from 'react';
import { getMyLessonProgress, saveLessonProgress } from '@/lib/educationService';
import type { UserLessonProgress } from '@/types/education';
import { PlayIcon, CheckCircleIcon } from '../ui/Icons';

interface YouTubePlayer {
  getCurrentTime: () => number;
  getDuration: () => number;
  mute: () => void;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  unMute: () => void;
}

interface YouTubePlayerEvent {
  data: number;
  target: YouTubePlayer;
}

interface YouTubeWindow extends Window {
  YT?: {
    Player: new (
      elementId: string,
      options: {
        videoId: string;
        playerVars: Record<string, number>;
        events: {
          onReady: (event: YouTubePlayerEvent) => void;
          onStateChange: (event: YouTubePlayerEvent) => void;
        };
      },
    ) => YouTubePlayer;
  };
  onYouTubeIframeAPIReady?: () => void;
}

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
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoUrl,
  lessonId,
  lessonTitle,
  durationMinutes,
  onComplete,
}) => {
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
  const [serverProgress, setServerProgress] = useState<UserLessonProgress | null>(null);
  const [isProgressLoading, setIsProgressLoading] = useState(true);
  const [showCompletionBanner, setShowCompletionBanner] = useState(false);
  const [isYouTube, setIsYouTube] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [youtubePlayer, setYoutubePlayer] = useState<YouTubePlayer | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [progressSaveError, setProgressSaveError] = useState<string | null>(null);
  const durationRef = useRef(durationMinutes * 60);
  durationRef.current = duration;
  
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const isPlayingRef = useRef(false);
  const serverProgressRef = useRef<UserLessonProgress | null>(null);
  const progressReadyRef = useRef(false);
  const lastPlaybackSampleRef = useRef<number | null>(null);
  const accumulatedWatchSecondsRef = useRef(0);
  const latestPositionRef = useRef(0);
  const latestSavedRef = useRef<{ position: number; accumulated: number } | null>(null);
  const pendingSaveRef = useRef<{ position: number; accumulated: number } | null>(null);
  const saveLoopRef = useRef<Promise<void> | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const onCompleteRef = useRef(onComplete);
  const markedComplete = serverProgress?.is_completed ?? false;
  const latestProgressIsSaved = Boolean(
    lastSyncTime && !progressSaveError && latestSavedRef.current
      && Math.floor(latestPositionRef.current) === latestSavedRef.current.position
      && Math.floor(accumulatedWatchSecondsRef.current) <= latestSavedRef.current.accumulated,
  );

  onCompleteRef.current = onComplete;

  // Extract YouTube video ID
  const getYouTubeId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  const youtubeId = getYouTubeId(videoUrl);

  useEffect(() => {
    setMediaError(false);
  }, [videoUrl]);

  // Load the caller's server progress before restoring playback.
  useEffect(() => {
    let isCurrent = true;
    progressReadyRef.current = false;
    setIsProgressLoading(true);
    setProgressSaveError(null);
    setServerProgress(null);
    serverProgressRef.current = null;
    latestSavedRef.current = null;
    accumulatedWatchSecondsRef.current = 0;
    latestPositionRef.current = 0;

    void getMyLessonProgress()
      .then((rows) => {
        if (!isCurrent) return;
        const row = rows.find((item) => item.lesson_id === lessonId) ?? null;
        serverProgressRef.current = row;
        setServerProgress(row);
        const position = row?.last_position_seconds ?? 0;
        latestPositionRef.current = position;
        accumulatedWatchSecondsRef.current = row?.accumulated_watch_seconds ?? 0;
        latestSavedRef.current = row ? {
          position,
          accumulated: row.accumulated_watch_seconds,
        } : null;
        setCurrentTime(position);
        const storedDurationSeconds = durationMinutes * 60;
        setProgress(storedDurationSeconds > 0 ? Math.min(100, (position / storedDurationSeconds) * 100) : 0);
        progressReadyRef.current = true;

        if (videoRef.current && videoRef.current.readyState >= 1) {
          videoRef.current.currentTime = position;
        }
        if (youtubePlayerRef.current) youtubePlayerRef.current.seekTo(position, true);
      })
      .catch((loadError: unknown) => {
        if (isCurrent) {
          setProgressSaveError(loadError instanceof Error ? loadError.message : 'Could not load saved lesson progress.');
        }
      })
      .finally(() => {
        if (isCurrent) setIsProgressLoading(false);
      });

    return () => { isCurrent = false; };
  }, [lessonId, durationMinutes]);

  const saveLatestProgress = useCallback(async () => {
    if (!progressReadyRef.current || serverProgressRef.current?.is_completed) return;

    const durationLimit = Math.max(0, Math.floor(durationMinutes * 60));
    const snapshot = {
      position: Math.min(durationLimit, Math.max(0, Math.floor(latestPositionRef.current))),
      accumulated: Math.min(durationLimit, Math.max(0, Math.floor(accumulatedWatchSecondsRef.current))),
    };
    const lastSaved = latestSavedRef.current;
    if (snapshot.position === 0 && snapshot.accumulated === 0) return;
    if (lastSaved && snapshot.position === lastSaved.position && snapshot.accumulated <= lastSaved.accumulated) return;

    pendingSaveRef.current = snapshot;
    if (!saveLoopRef.current) {
      const drain = async () => {
        while (pendingSaveRef.current) {
          const next = pendingSaveRef.current;
          pendingSaveRef.current = null;
          const alreadySaved = latestSavedRef.current;
          if (alreadySaved && next.position <= alreadySaved.position && next.accumulated <= alreadySaved.accumulated) {
            continue;
          }
          if (isMountedRef.current) setIsSyncing(true);

          try {
            await saveLessonProgress({
              lessonId,
              lastPositionSeconds: next.position,
              accumulatedWatchSeconds: next.accumulated,
              articleCompletionRequested: false,
            });
            const rows = await getMyLessonProgress();
            const authoritativeRow = rows.find((row) => row.lesson_id === lessonId) ?? null;
            if (!authoritativeRow) throw new Error('Progress was saved, but the authoritative lesson state could not be loaded.');

            const wasComplete = serverProgressRef.current?.is_completed ?? false;
            latestSavedRef.current = next;
            serverProgressRef.current = authoritativeRow;
            if (isMountedRef.current) {
              setServerProgress(authoritativeRow);
              setProgressSaveError(null);
              setLastSyncTime(new Date());
              if (!wasComplete && authoritativeRow.is_completed) {
                setShowCompletionBanner(true);
                onCompleteRef.current();
                window.setTimeout(() => {
                  if (isMountedRef.current) setShowCompletionBanner(false);
                }, 5000);
              }
            }
          } catch (saveError) {
            if (isMountedRef.current) {
              setProgressSaveError(saveError instanceof Error ? saveError.message : 'Could not save video progress.');
            }
            if (!pendingSaveRef.current) break;
          } finally {
            if (isMountedRef.current && !pendingSaveRef.current) setIsSyncing(false);
          }
        }
      };

      const drainPromise = drain();
      saveLoopRef.current = drainPromise;
      void drainPromise.finally(() => {
        if (saveLoopRef.current === drainPromise) saveLoopRef.current = null;
        if (pendingSaveRef.current && isMountedRef.current) void saveLatestProgress();
      });
    }

    await saveLoopRef.current;
  }, [durationMinutes, lessonId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      void saveLatestProgress();
    };
  }, [saveLatestProgress]);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => { void saveLatestProgress(); }, 10000);
    return () => window.clearInterval(interval);
  }, [isPlaying, saveLatestProgress]);

  const updatePlaybackSnapshot = useCallback((position: number, mediaDuration?: number) => {
    const totalDuration = mediaDuration ?? durationRef.current;
    const now = Date.now();
    if (isPlayingRef.current && lastPlaybackSampleRef.current !== null) {
      const elapsedSeconds = (now - lastPlaybackSampleRef.current) / 1000;
      if (elapsedSeconds > 0 && elapsedSeconds <= 5) {
        accumulatedWatchSecondsRef.current += Math.min(elapsedSeconds, 2);
      }
    }
    lastPlaybackSampleRef.current = now;
    latestPositionRef.current = Math.max(0, position);
    setCurrentTime(position);
    setProgress(totalDuration > 0 ? Math.min(100, (position / totalDuration) * 100) : 0);
  }, []);

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
      updatePlaybackSnapshot(current, total);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const mediaDuration = videoRef.current.duration;
      if (Number.isFinite(mediaDuration) && mediaDuration > 0) setDuration(mediaDuration);
      
      // Restore only from the authenticated server row.
      const savedPosition = serverProgressRef.current?.last_position_seconds;
      if (progressReadyRef.current && savedPosition !== undefined && savedPosition < mediaDuration) {
        videoRef.current.currentTime = savedPosition;
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
    if (isProgressLoading || !progressReadyRef.current) return;
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
    lastPlaybackSampleRef.current = Date.now();
    latestPositionRef.current = newTime;
    
    if (youtubePlayer) {
      youtubePlayer.seekTo(newTime, true);
    } else if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
    
    setCurrentTime(newTime);
    setProgress(Math.min(100, percentage));
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
    isPlayingRef.current = true;
    lastPlaybackSampleRef.current = Date.now();
    latestPositionRef.current = 0;
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
      const youtubeWindow = window as YouTubeWindow;
      youtubeWindow.onYouTubeIframeAPIReady = () => {
        const player = new youtubeWindow.YT!.Player(`youtube-player-${lessonId}`, {
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
            onReady: (event) => {
              setYoutubePlayer(event.target);
              youtubePlayerRef.current = event.target;
              const mediaDuration = event.target.getDuration();
              if (Number.isFinite(mediaDuration) && mediaDuration > 0) setDuration(mediaDuration);
              const savedPosition = serverProgressRef.current?.last_position_seconds;
              if (progressReadyRef.current && savedPosition !== undefined && savedPosition < mediaDuration) {
                event.target.seekTo(savedPosition, true);
              }
            },
            onStateChange: (event) => {
              const nowPlaying = event.data === 1;
              const wasPlaying = isPlayingRef.current;
              if (event.data === 5 || event.data === 100 || event.data === 101 || event.data === 150) {
                setMediaError(true);
              }
              isPlayingRef.current = nowPlaying;
              setIsPlaying(nowPlaying);
              if (nowPlaying) {
                setHasStarted(true);
                lastPlaybackSampleRef.current = Date.now();
              } else if (wasPlaying) {
                updatePlaybackSnapshot(event.target.getCurrentTime(), event.target.getDuration());
                void saveLatestProgress();
                lastPlaybackSampleRef.current = null;
              }
            },
          },
        });
      };

      // If API already loaded
      if (youtubeWindow.YT && youtubeWindow.onYouTubeIframeAPIReady) {
        youtubeWindow.onYouTubeIframeAPIReady();
      }
    }
  }, [youtubeId, lessonId, saveLatestProgress, updatePlaybackSnapshot]);

  // YouTube progress tracking
  useEffect(() => {
    if (!youtubePlayer || !isPlaying) return;

    const interval = setInterval(() => {
      const current = youtubePlayer.getCurrentTime();
      const total = youtubePlayer.getDuration();
      updatePlaybackSnapshot(current, total);
    }, 500);

    return () => clearInterval(interval);
  }, [youtubePlayer, isPlaying, updatePlaybackSnapshot]);

  if (!videoUrl.trim() || mediaError) {
    return (
      <div className="aspect-video rounded-xl bg-[#faf6f1] p-8 flex items-center justify-center text-center text-gray-600" role="status">
        {mediaError ? 'This lesson’s media is temporarily unavailable.' : 'This lesson’s video is being prepared.'}
      </div>
    );
  }

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
          onError={() => setMediaError(true)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onProgress={handleProgress}
          onPlay={() => {
            isPlayingRef.current = true;
            lastPlaybackSampleRef.current = Date.now();
            setIsPlaying(true);
          }}
          onPause={() => {
            const wasPlaying = isPlayingRef.current;
            if (wasPlaying && videoRef.current) updatePlaybackSnapshot(videoRef.current.currentTime, videoRef.current.duration || duration);
            isPlayingRef.current = false;
            lastPlaybackSampleRef.current = null;
            setIsPlaying(false);
            if (wasPlaying) void saveLatestProgress();
          }}
          onEnded={() => {
            if (videoRef.current) updatePlaybackSnapshot(videoRef.current.currentTime, videoRef.current.duration || duration);
            isPlayingRef.current = false;
            lastPlaybackSampleRef.current = null;
            setIsPlaying(false);
            void saveLatestProgress();
          }}
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
            {isProgressLoading && <span className="text-white/70 text-xs">Loading saved progress…</span>}
            {isSyncing && (
              <span className="flex items-center text-white/70 text-xs">
                <SyncIcon size={14} className="mr-1 animate-spin" />
                Syncing...
              </span>
            )}
            {latestProgressIsSaved && !isSyncing && (
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

      {progressSaveError && (
        <p className="absolute bottom-3 left-3 right-3 z-20 rounded bg-red-950/95 px-3 py-2 text-sm text-white" role="alert">
          {progressSaveError}
        </p>
      )}

      {/* Completion banner */}
      {showCompletionBanner && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-6 py-3 rounded-full shadow-lg flex items-center space-x-2 animate-bounce">
          <CheckCircleIcon size={20} />
          <span className="font-medium">Lesson complete</span>
        </div>
      )}

    </div>
  );
};

export default VideoPlayer;
