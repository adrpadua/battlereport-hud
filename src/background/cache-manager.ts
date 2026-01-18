import type { BattleReport } from '@/types/battle-report';

const DB_NAME = 'battlereport-hud';
const DB_VERSION = 1;
const STORE_NAME = 'reports';
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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'videoId' });
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
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
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
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

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
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
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
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = (event) => {
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
  } catch (error) {
    console.error('Failed to clear expired cache:', error);
  }
}
