import { useImperativeHandle, forwardRef, useId } from 'react';
import { useYouTubePlayer } from '../hooks/useYouTubePlayer';

export interface YouTubePlayerHandle {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  getCurrentTime: () => number;
}

interface YouTubePlayerProps {
  videoId: string | null;
  onReady?: () => void;
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer({ videoId, onReady }, ref) {
    const uniqueId = useId();
    const containerId = `youtube-player-${uniqueId.replace(/:/g, '')}`;

    const { seekTo, play, pause, getCurrentTime, isReady } = useYouTubePlayer({
      containerId,
      videoId: videoId || '',
      onReady,
    });

    // Expose player methods to parent via ref
    useImperativeHandle(ref, () => ({
      seekTo,
      play,
      pause,
      getCurrentTime,
    }), [seekTo, play, pause, getCurrentTime]);

    if (!videoId) {
      return (
        <div className="youtube-player-container flex items-center justify-center bg-hud-surface">
          <div className="text-hud-muted text-center p-8">
            <svg
              className="w-16 h-16 mx-auto mb-4 opacity-50"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
            </svg>
            <p>Enter a YouTube URL to get started</p>
          </div>
        </div>
      );
    }

    return (
      <div className="youtube-player-container">
        <div id={containerId} />
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="animate-spin h-8 w-8 border-2 border-white border-t-transparent rounded-full" />
          </div>
        )}
      </div>
    );
  }
);
