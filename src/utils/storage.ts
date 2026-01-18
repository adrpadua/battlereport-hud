// Chrome storage utility functions

export interface StorageData {
  apiKey: string | null;
  hudPosition: 'left' | 'right';
  autoExtract: boolean;
}

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
