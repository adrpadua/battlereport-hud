import type { BattleReport } from '@/types/battle-report';
import type { LlmPreprocessResult, CachedPreprocessResult } from '@/types/llm-preprocess';

const DB_NAME = 'battlereport-hud';
const DB_VERSION = 2;
const REPORTS_STORE = 'reports';
const LLM_PREPROCESS_STORE = 'llm-preprocess';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedReport {
  videoId: string;
  report: BattleReport;
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

    // Clear expired reports
    const reportsTransaction = db.transaction(REPORTS_STORE, 'readwrite');
    const reportsStore = reportsTransaction.objectStore(REPORTS_STORE);
    const reportsRequest = reportsStore.openCursor();

    reportsRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const cached = cursor.value as CachedReport;
        const now = Date.now();
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
        const now = Date.now();
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
