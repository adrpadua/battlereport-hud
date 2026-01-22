import type { BattleReport } from '@/types/battle-report';
import type { LlmPreprocessResult, CachedPreprocessResult } from '@/types/llm-preprocess';
import type { VideoData } from '@/types/youtube';

const DB_NAME = 'battlereport-hud';
const DB_VERSION = 3; // Bumped for transcripts store
const REPORTS_STORE = 'reports';
const LLM_PREPROCESS_STORE = 'llm-preprocess';
const VIDEO_DATA_STORE = 'video-data';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedReport {
  videoId: string;
  report: BattleReport;
  cachedAt: number;
}

interface CachedVideoData {
  videoId: string;
  data: VideoData;
  cachedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(REPORTS_STORE)) {
        db.createObjectStore(REPORTS_STORE, { keyPath: 'videoId' });
      }
      if (!db.objectStoreNames.contains(LLM_PREPROCESS_STORE)) {
        db.createObjectStore(LLM_PREPROCESS_STORE, { keyPath: 'videoId' });
      }
      if (!db.objectStoreNames.contains(VIDEO_DATA_STORE)) {
        db.createObjectStore(VIDEO_DATA_STORE, { keyPath: 'videoId' });
      }
    };
  });
}

export async function getCachedReport(
  videoId: string
): Promise<BattleReport | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(REPORTS_STORE, 'readonly');
      const store = transaction.objectStore(REPORTS_STORE);
      const request = store.get(videoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cached = request.result as CachedReport | undefined;
        if (!cached) {
          resolve(null);
          return;
        }

        // Check if cache is expired
        const now = Date.now();
        if (now - cached.cachedAt > CACHE_TTL_MS) {
          // Delete expired entry
          deleteCachedReport(videoId).catch(console.error);
          resolve(null);
          return;
        }

        resolve(cached.report);
      };
    });
  } catch (error) {
    console.error('Failed to get cached report:', error);
    return null;
  }
}

export async function setCachedReport(
  videoId: string,
  report: BattleReport
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(REPORTS_STORE, 'readwrite');
      const store = transaction.objectStore(REPORTS_STORE);

      const cached: CachedReport = {
        videoId,
        report,
        cachedAt: Date.now(),
      };

      const request = store.put(cached);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('Failed to cache report:', error);
  }
}

export async function deleteCachedReport(videoId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(REPORTS_STORE, 'readwrite');
      const store = transaction.objectStore(REPORTS_STORE);
      const request = store.delete(videoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('Failed to delete cached report:', error);
  }
}

export async function clearExpiredCache(): Promise<void> {
  try {
    const db = await openDB();
    const now = Date.now();

    // Clear expired reports
    const reportsTransaction = db.transaction(REPORTS_STORE, 'readwrite');
    const reportsStore = reportsTransaction.objectStore(REPORTS_STORE);
    const reportsRequest = reportsStore.openCursor();

    reportsRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const cached = cursor.value as CachedReport;
        if (now - cached.cachedAt > CACHE_TTL_MS) {
          cursor.delete();
        }
        cursor.continue();
      }
    };

    // Clear expired LLM preprocess results
    const preprocessTransaction = db.transaction(LLM_PREPROCESS_STORE, 'readwrite');
    const preprocessStore = preprocessTransaction.objectStore(LLM_PREPROCESS_STORE);
    const preprocessRequest = preprocessStore.openCursor();

    preprocessRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const cached = cursor.value as CachedPreprocessResult;
        if (now - cached.cachedAt > CACHE_TTL_MS) {
          cursor.delete();
        }
        cursor.continue();
      }
    };

    // Clear expired video data (transcripts)
    const videoDataTransaction = db.transaction(VIDEO_DATA_STORE, 'readwrite');
    const videoDataStore = videoDataTransaction.objectStore(VIDEO_DATA_STORE);
    const videoDataRequest = videoDataStore.openCursor();

    videoDataRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const cached = cursor.value as CachedVideoData;
        if (now - cached.cachedAt > CACHE_TTL_MS) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  } catch (error) {
    console.error('Failed to clear expired cache:', error);
  }
}

export async function getCachedPreprocess(
  videoId: string
): Promise<LlmPreprocessResult | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(LLM_PREPROCESS_STORE, 'readonly');
      const store = transaction.objectStore(LLM_PREPROCESS_STORE);
      const request = store.get(videoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cached = request.result as CachedPreprocessResult | undefined;
        if (!cached) {
          resolve(null);
          return;
        }

        // Check if cache is expired
        const now = Date.now();
        if (now - cached.cachedAt > CACHE_TTL_MS) {
          // Delete expired entry
          deleteCachedPreprocess(videoId).catch(console.error);
          resolve(null);
          return;
        }

        resolve(cached.result);
      };
    });
  } catch (error) {
    console.error('Failed to get cached preprocess:', error);
    return null;
  }
}

export async function setCachedPreprocess(
  videoId: string,
  result: LlmPreprocessResult
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(LLM_PREPROCESS_STORE, 'readwrite');
      const store = transaction.objectStore(LLM_PREPROCESS_STORE);

      const cached: CachedPreprocessResult = {
        videoId,
        result,
        cachedAt: Date.now(),
      };

      const request = store.put(cached);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('Failed to cache preprocess result:', error);
  }
}

export async function deleteCachedPreprocess(videoId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(LLM_PREPROCESS_STORE, 'readwrite');
      const store = transaction.objectStore(LLM_PREPROCESS_STORE);
      const request = store.delete(videoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('Failed to delete cached preprocess:', error);
  }
}

// ============================================================================
// Video Data (Transcript) Caching
// ============================================================================

export async function getCachedVideoData(
  videoId: string
): Promise<VideoData | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(VIDEO_DATA_STORE, 'readonly');
      const store = transaction.objectStore(VIDEO_DATA_STORE);
      const request = store.get(videoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cached = request.result as CachedVideoData | undefined;
        if (!cached) {
          resolve(null);
          return;
        }

        // Check if cache is expired
        const now = Date.now();
        if (now - cached.cachedAt > CACHE_TTL_MS) {
          // Delete expired entry
          deleteCachedVideoData(videoId).catch(console.error);
          resolve(null);
          return;
        }

        resolve(cached.data);
      };
    });
  } catch (error) {
    console.error('Failed to get cached video data:', error);
    return null;
  }
}

export async function setCachedVideoData(
  videoId: string,
  data: VideoData
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(VIDEO_DATA_STORE, 'readwrite');
      const store = transaction.objectStore(VIDEO_DATA_STORE);

      const cached: CachedVideoData = {
        videoId,
        data,
        cachedAt: Date.now(),
      };

      const request = store.put(cached);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('Failed to cache video data:', error);
  }
}

export async function deleteCachedVideoData(videoId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(VIDEO_DATA_STORE, 'readwrite');
      const store = transaction.objectStore(VIDEO_DATA_STORE);
      const request = store.delete(videoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('Failed to delete cached video data:', error);
  }
}
