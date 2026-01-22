import { extractVideoData, getVideoId } from './youtube-extractor';
import { injectHud, removeHud } from './hud-injector';
import {
  startCaptionObserver,
  stopCaptionObserver,
  injectCaptionStyles,
} from './caption-observer';
import {
  initTooltipManager,
  showTooltip,
  hideTooltip,
  cleanupTooltipManager,
} from './tooltip-manager';
import { useBattleStore } from '@/store/battle-store';
import type { Message } from '@/types/messages';
import type { BattleReport, Unit, Stratagem } from '@/types/battle-report';

let currentVideoId: string | null = null;
let navigationObserver: MutationObserver | null = null;

// Expose extraction functions globally for HUD to call
declare global {
  interface Window {
    battleReportHudRefresh?: () => Promise<void>;
    battleReportStartExtraction?: () => Promise<void>;
    battleReportContinueWithFactions?: (factions: [string, string]) => Promise<void>;
  }
}

// Initialize on page load
async function initialize(): Promise<void> {
  console.log('Battle Report HUD: Initializing...');

  const videoId = getVideoId();
  if (!videoId) {
    console.log('Battle Report HUD: Not a watch page');
    return;
  }

  // Skip if same video
  if (videoId === currentVideoId) {
    return;
  }

  currentVideoId = videoId;
  const store = useBattleStore.getState();

  // Reset state
  store.reset();
  store.setVideoId(videoId);

  // Inject HUD
  injectHud();
  injectCaptionStyles();

  // Check cache first - if cached, show results immediately
  const cachedReport = await checkCache(videoId);
  if (cachedReport) {
    console.log('Battle Report HUD: Using cached report');
    store.setReport(cachedReport, videoId);
    initializeTooltips(cachedReport);
    return;
  }

  // No cache - stay in idle state, user must click Extract
  console.log('Battle Report HUD: Ready for extraction');
  store.setPhase('idle', 'Click Extract to analyze this video');
}

async function checkCache(videoId: string): Promise<BattleReport | null> {
  try {
    const response = await sendMessageWithRetry({
      type: 'GET_CACHED_REPORT',
      payload: { videoId },
    });

    if (response.type === 'CACHE_HIT') {
      // Payload now contains { report, artifacts? }
      return response.payload.report;
    }
  } catch (error) {
    console.error('Battle Report HUD: Cache check failed', error);
  }

  return null;
}

async function getCachedVideoData(videoId: string): Promise<import('@/types/youtube').VideoData | null> {
  try {
    const response = await sendMessageWithRetry({
      type: 'GET_CACHED_VIDEO_DATA',
      payload: { videoId },
    });

    if (response.type === 'VIDEO_DATA_HIT') {
      return response.payload;
    }
  } catch (error) {
    console.error('Battle Report HUD: Video data cache check failed', error);
  }

  return null;
}

function cacheVideoData(videoData: import('@/types/youtube').VideoData): void {
  // Cache in background (don't await)
  sendMessageWithRetry({
    type: 'CACHE_VIDEO_DATA',
    payload: videoData,
  }).catch((error) => {
    console.error('Battle Report HUD: Failed to cache video data', error);
  });
}

/**
 * Check if the extension context is still valid.
 * This becomes invalid after extension reload/update.
 */
function isExtensionContextValid(): boolean {
  try {
    // Accessing chrome.runtime.id will throw if context is invalid
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

/**
 * Handle extension context invalidation by showing a reload prompt.
 */
function handleContextInvalidated(): void {
  const store = useBattleStore.getState();
  store.setError('Extension was updated. Please reload the page to continue.');
  store.setLoading(false);
}

async function sendMessageWithRetry(message: Message, retries = 3): Promise<Message> {
  // Check if extension context is still valid before attempting
  if (!isExtensionContextValid()) {
    handleContextInvalidated();
    throw new Error('Extension context invalidated - please reload the page');
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await sendMessage(message);
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for context invalidation errors
      if (
        errorMessage.includes('Extension context invalidated') ||
        errorMessage.includes('context invalidated') ||
        !isExtensionContextValid()
      ) {
        handleContextInvalidated();
        throw new Error('Extension context invalidated - please reload the page');
      }

      console.warn(`Battle Report HUD: Message attempt ${attempt + 1} failed`, error);
      if (attempt < retries - 1) {
        // Wait a bit before retrying to let service worker wake up
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      } else {
        throw error;
      }
    }
  }
  throw new Error('All retry attempts failed');
}

async function sendMessage(message: Message): Promise<Message> {
  // Check context validity first
  if (!isExtensionContextValid()) {
    throw new Error('Extension context invalidated');
  }

  // Use the Promise-based API (MV3 feature)
  const response = await chrome.runtime.sendMessage(message);
  if (chrome.runtime.lastError) {
    throw new Error(chrome.runtime.lastError.message);
  }
  if (!response) {
    throw new Error('No response received from service worker');
  }
  return response as Message;
}

function initializeTooltips(report: BattleReport): void {
  initTooltipManager(report);
  startCaptionObserver(report, handleTooltip);
}

function handleTooltip(
  entity: Unit | Stratagem | null,
  x: number,
  y: number
): void {
  if (entity) {
    showTooltip(entity, x, y);
  } else {
    hideTooltip();
  }
}

// Phase 1: Start extraction - extract video data and detect factions
async function startExtraction(): Promise<void> {
  const videoId = getVideoId();
  if (!videoId) {
    console.log('Battle Report HUD: Cannot extract - not on a watch page');
    return;
  }

  const store = useBattleStore.getState();
  store.startExtraction();

  try {
    // Check for cached video data first
    let videoData = await getCachedVideoData(videoId);

    if (videoData) {
      console.log('Battle Report HUD: Using cached video data', {
        videoId: videoData.videoId,
        transcriptLength: videoData.transcript.length,
      });
    } else {
      // Extract video data from DOM
      videoData = await extractVideoData();
      if (!videoData) {
        store.setError('Failed to extract video data');
        return;
      }

      console.log('Battle Report HUD: Extracted video data from DOM', {
        videoId: videoData.videoId,
        transcriptLength: videoData.transcript.length,
      });

      // Cache the video data for future use
      cacheVideoData(videoData);
    }

    store.setVideoData(videoData);
    store.setPhase('extracting', 'Detecting factions...');

    // Detect factions
    const response = await sendMessageWithRetry({
      type: 'DETECT_FACTIONS',
      payload: videoData,
    });

    if (response.type === 'FACTIONS_DETECTED') {
      const { detectedFactions, allFactions } = response.payload;
      console.log('Battle Report HUD: Detected factions', detectedFactions);

      store.setDetectedFactions(detectedFactions, allFactions);
      store.setPhase('faction-select', 'Select factions');
      store.setLoading(false);
    } else {
      store.setError('Failed to detect factions');
    }
  } catch (error) {
    console.error('Battle Report HUD: Extraction error', error);
    store.setError(
      error instanceof Error ? error.message : 'An unexpected error occurred'
    );
  }
}

// Phase 2: Continue with selected factions - preprocess and extract
async function continueWithFactions(factions: [string, string]): Promise<void> {
  const store = useBattleStore.getState();
  const { videoData, videoId } = store;

  if (!videoData || !videoId) {
    store.setError('No video data available');
    return;
  }

  store.setSelectedFactions(factions);
  store.setPhase('ai-extracting', 'Extracting army lists...');
  store.setLoading(true);

  try {
    // Send to service worker for AI processing with selected factions
    const response = await sendMessageWithRetry({
      type: 'EXTRACT_WITH_FACTIONS',
      payload: { videoData, factions },
    });

    if (response.type === 'EXTRACTION_RESULT') {
      // Payload now contains { report, artifacts? }
      const { report } = response.payload;
      store.setReport(report, videoId);
      initializeTooltips(report);
    } else if (response.type === 'EXTRACTION_ERROR') {
      store.setError(response.payload.error);
    }
  } catch (error) {
    console.error('Battle Report HUD: Extraction error', error);
    store.setError(
      error instanceof Error ? error.message : 'An unexpected error occurred'
    );
  }
}

// Force refresh: clear cache and restart extraction
async function forceRefresh(): Promise<void> {
  const videoId = getVideoId();
  if (!videoId) {
    console.log('Battle Report HUD: Cannot refresh - not on a watch page');
    return;
  }

  const store = useBattleStore.getState();

  // Clear cache for this video
  try {
    await sendMessageWithRetry({
      type: 'CLEAR_CACHE',
      payload: { videoId },
    });
    console.log('Battle Report HUD: Cache cleared');
  } catch (error) {
    console.error('Battle Report HUD: Failed to clear cache', error);
  }

  // Reset and start fresh extraction
  store.reset();
  store.setVideoId(videoId);

  // Start the phased extraction flow
  await startExtraction();
}

// Expose to window for HUD component
window.battleReportHudRefresh = forceRefresh;
window.battleReportStartExtraction = startExtraction;
window.battleReportContinueWithFactions = continueWithFactions;

function cleanup(): void {
  stopCaptionObserver();
  cleanupTooltipManager();
  removeHud();
  currentVideoId = null;
}

// Watch for YouTube SPA navigation
function setupNavigationObserver(): void {
  // YouTube uses SPA navigation, so we need to detect URL changes
  let lastUrl = location.href;

  navigationObserver = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      handleNavigation();
    }
  });

  navigationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Also listen for popstate
  window.addEventListener('popstate', handleNavigation);
}

function handleNavigation(): void {
  const videoId = getVideoId();

  if (!videoId) {
    // Not a watch page, cleanup
    cleanup();
    return;
  }

  if (videoId !== currentVideoId) {
    // Different video, reinitialize
    cleanup();
    initialize();
  }
}

// Start the extension
setupNavigationObserver();
initialize();

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  cleanup();
  if (navigationObserver) {
    navigationObserver.disconnect();
  }
});
