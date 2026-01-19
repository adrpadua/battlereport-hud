/**
 * YouTube IFrame Player API hook.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface UseYouTubePlayerOptions {
  containerId: string;
  videoId: string;
  onReady?: () => void;
  onStateChange?: (state: number) => void;
}

export function useYouTubePlayer({
  containerId,
  videoId,
  onReady,
  onStateChange,
}: UseYouTubePlayerOptions) {
  const playerRef = useRef<YT.Player | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Load YouTube IFrame API
  useEffect(() => {
    // If API is already loaded
    if (window.YT && window.YT.Player) {
      return;
    }

    // Load the API
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
  }, []);

  // Initialize player when API is ready and videoId changes
  useEffect(() => {
    if (!videoId) return;

    const initPlayer = () => {
      // Destroy existing player
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
        setIsReady(false);
      }

      // Create new player
      playerRef.current = new window.YT.Player(containerId, {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            setIsReady(true);
            onReady?.();
          },
          onStateChange: (event) => {
            onStateChange?.(event.data);
          },
        },
      });
    };

    // Check if API is ready
    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      // Wait for API to be ready
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [videoId, containerId, onReady, onStateChange]);

  /**
   * Seek to a specific time in seconds.
   */
  const seekTo = useCallback((seconds: number) => {
    if (playerRef.current && isReady) {
      playerRef.current.seekTo(seconds, true);
      playerRef.current.playVideo();
    }
  }, [isReady]);

  /**
   * Play the video.
   */
  const play = useCallback(() => {
    if (playerRef.current && isReady) {
      playerRef.current.playVideo();
    }
  }, [isReady]);

  /**
   * Pause the video.
   */
  const pause = useCallback(() => {
    if (playerRef.current && isReady) {
      playerRef.current.pauseVideo();
    }
  }, [isReady]);

  /**
   * Get current time in seconds.
   */
  const getCurrentTime = useCallback(() => {
    if (playerRef.current && isReady) {
      return playerRef.current.getCurrentTime();
    }
    return 0;
  }, [isReady]);

  return {
    player: playerRef.current,
    isReady,
    seekTo,
    play,
    pause,
    getCurrentTime,
  };
}
