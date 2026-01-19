import type { Message } from '@/types/messages';
import type { VideoData } from '@/types/youtube';
import { getCachedReport, setCachedReport, deleteCachedReport } from './cache-manager';
import { extractBattleReport, detectFactionNamesFromVideo, extractWithFactions } from './ai-service';
import { getAllFactionNames } from '@/utils/faction-loader';

export function handleMessage(
  message: Message,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: Message) => void
): boolean {
  // Handle the message asynchronously
  (async () => {
    try {
      const response = await processMessage(message);
      sendResponse(response);
    } catch (error) {
      console.error('Message handler error:', error);
      sendResponse({
        type: 'EXTRACTION_ERROR',
        payload: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
    }
  })();

  // Return true synchronously to keep the message channel open
  return true;
}

async function processMessage(message: Message): Promise<Message> {
  switch (message.type) {
    case 'GET_CACHED_REPORT': {
      const { videoId } = message.payload;
      const cached = await getCachedReport(videoId);

      if (cached) {
        return { type: 'CACHE_HIT', payload: cached };
      } else {
        return { type: 'CACHE_MISS' };
      }
    }

    case 'EXTRACT_BATTLE_REPORT': {
      const videoData = message.payload as VideoData;
      const apiKey = await getApiKey();

      if (!apiKey) {
        return {
          type: 'EXTRACTION_ERROR',
          payload: { error: 'No API key configured. Please set your OpenAI API key in the extension popup.' },
        };
      }

      try {
        const report = await extractBattleReport(videoData, apiKey);
        await setCachedReport(videoData.videoId, report);
        return { type: 'EXTRACTION_RESULT', payload: report };
      } catch (error) {
        console.error('Extraction error:', error);
        return {
          type: 'EXTRACTION_ERROR',
          payload: {
            error: error instanceof Error ? error.message : 'Failed to extract battle report',
          },
        };
      }
    }

    case 'GET_API_KEY': {
      const apiKey = await getApiKey();
      return { type: 'API_KEY_RESULT', payload: { apiKey } };
    }

    case 'CLEAR_CACHE': {
      const { videoId } = message.payload;
      try {
        await deleteCachedReport(videoId);
        console.log('Battle Report HUD: Cleared cache for video', videoId);
        return { type: 'CLEAR_CACHE_RESULT', payload: { success: true } };
      } catch (error) {
        console.error('Battle Report HUD: Failed to clear cache', error);
        return { type: 'CLEAR_CACHE_RESULT', payload: { success: false } };
      }
    }

    case 'DETECT_FACTIONS': {
      const videoData = message.payload as VideoData;
      const detectedFactions = detectFactionNamesFromVideo(videoData);
      const allFactions = getAllFactionNames();

      return {
        type: 'FACTIONS_DETECTED',
        payload: { detectedFactions, allFactions },
      };
    }

    case 'EXTRACT_WITH_FACTIONS': {
      const { videoData, factions } = message.payload;
      const apiKey = await getApiKey();

      if (!apiKey) {
        return {
          type: 'EXTRACTION_ERROR',
          payload: { error: 'No API key configured. Please set your OpenAI API key in the extension popup.' },
        };
      }

      try {
        const report = await extractWithFactions(videoData, factions, apiKey);
        await setCachedReport(videoData.videoId, report);
        return { type: 'EXTRACTION_RESULT', payload: report };
      } catch (error) {
        console.error('Extraction error:', error);
        return {
          type: 'EXTRACTION_ERROR',
          payload: {
            error: error instanceof Error ? error.message : 'Failed to extract battle report',
          },
        };
      }
    }

    default:
      console.warn('Unknown message type:', message);
      return {
        type: 'EXTRACTION_ERROR',
        payload: { error: 'Unknown message type' },
      };
  }
}

async function getApiKey(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get('apiKey');
    return result.apiKey ?? null;
  } catch {
    return null;
  }
}
