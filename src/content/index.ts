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
  store.setLoading(true);

  // Inject HUD
  injectHud();
  injectCaptionStyles();

  // Check cache first
  const cachedReport = await checkCache(videoId);
  if (cachedReport) {
    console.log('Battle Report HUD: Using cached report');
    store.setReport(cachedReport, videoId);
    initializeTooltips(cachedReport);
    return;
  }

  // Extract video data and send to service worker
  try {
    const videoData = await extractVideoData();
    if (!videoData) {
      store.setError('Failed to extract video data');
      return;
    }

    console.log('Battle Report HUD: Extracted video data', videoData);

    // Send to service worker for AI processing
    const response = await sendMessageWithRetry({
      type: 'EXTRACT_BATTLE_REPORT',
      payload: videoData,
    });

    if (response.type === 'EXTRACTION_RESULT') {
      store.setReport(response.payload, videoId);
      initializeTooltips(response.payload);
    } else if (response.type === 'EXTRACTION_ERROR') {
      store.setError(response.payload.error);
    }
  } catch (error) {
    console.error('Battle Report HUD: Error', error);
    store.setError(
      error instanceof Error ? error.message : 'An unexpected error occurred'
    );
  }
}

async function checkCache(videoId: string): Promise<BattleReport | null> {
  try {
    const response = await sendMessageWithRetry({
      type: 'GET_CACHED_REPORT',
      payload: { videoId },
    });

    if (response.type === 'CACHE_HIT') {
      return response.payload;
    }
  } catch (error) {
    console.error('Battle Report HUD: Cache check failed', error);
  }

  return null;
}

async function sendMessageWithRetry(message: Message, retries = 3): Promise<Message> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await sendMessage(message);
      return response;
    } catch (error) {
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
