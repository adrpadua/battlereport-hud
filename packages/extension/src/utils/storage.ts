// Chrome storage utility functions
import type { UserMapping } from '@battlereport/shared/types';

export interface StorageData {
  apiKey: string | null;
  hudPosition: 'left' | 'right';
  autoExtract: boolean;
}

// Storage key for user mappings (separate from settings)
const USER_MAPPINGS_KEY = 'userMappings';

const DEFAULT_SETTINGS: StorageData = {
  apiKey: null,
  hudPosition: 'right',
  autoExtract: true,
};

export async function getStorageData<K extends keyof StorageData>(
  key: K
): Promise<StorageData[K]> {
  try {
    const result = await chrome.storage.local.get(key);
    return (result[key] as StorageData[K]) ?? DEFAULT_SETTINGS[key];
  } catch (error) {
    console.error(`Failed to get storage key "${key}":`, error);
    return DEFAULT_SETTINGS[key];
  }
}

export async function setStorageData<K extends keyof StorageData>(
  key: K,
  value: StorageData[K]
): Promise<void> {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (error) {
    console.error(`Failed to set storage key "${key}":`, error);
    throw error;
  }
}

export async function getAllStorageData(): Promise<StorageData> {
  try {
    const result = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
    return {
      ...DEFAULT_SETTINGS,
      ...result,
    } as StorageData;
  } catch (error) {
    console.error('Failed to get all storage data:', error);
    return DEFAULT_SETTINGS;
  }
}

export async function clearStorageData(): Promise<void> {
  try {
    await chrome.storage.local.clear();
  } catch (error) {
    console.error('Failed to clear storage data:', error);
    throw error;
  }
}

// Listen for storage changes
export function onStorageChange(
  callback: (changes: { [key: string]: chrome.storage.StorageChange }) => void
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName === 'local') {
      callback(changes);
    }
  };

  chrome.storage.onChanged.addListener(listener);

  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

// ============================================
// User Mapping Persistence
// ============================================

/**
 * Get all user mappings from storage.
 */
export async function getUserMappings(): Promise<UserMapping[]> {
  try {
    const result = await chrome.storage.local.get(USER_MAPPINGS_KEY);
    return (result[USER_MAPPINGS_KEY] as UserMapping[]) ?? [];
  } catch (error) {
    console.error('Failed to get user mappings:', error);
    return [];
  }
}

/**
 * Save all user mappings to storage (replaces existing).
 */
export async function saveUserMappings(mappings: UserMapping[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [USER_MAPPINGS_KEY]: mappings });
  } catch (error) {
    console.error('Failed to save user mappings:', error);
    throw error;
  }
}

/**
 * Save a single user mapping (adds to existing).
 */
export async function saveUserMapping(mapping: UserMapping): Promise<void> {
  try {
    const existing = await getUserMappings();
    const updated = [...existing, mapping];
    await saveUserMappings(updated);
  } catch (error) {
    console.error('Failed to save user mapping:', error);
    throw error;
  }
}

/**
 * Delete a user mapping by ID.
 */
export async function deleteUserMapping(mappingId: string): Promise<void> {
  try {
    const existing = await getUserMappings();
    const filtered = existing.filter((m) => m.id !== mappingId);
    await saveUserMappings(filtered);
  } catch (error) {
    console.error('Failed to delete user mapping:', error);
    throw error;
  }
}
