/**
 * User corrections storage utility.
 * Saves user corrections for incorrectly identified units to localStorage.
 */

const STORAGE_KEY = 'battlereport-unit-corrections';

export interface UserCorrection {
  original: string;      // What was detected
  corrected: string;     // What user selected
  faction: string;       // Faction context
  timestamp: number;     // When correction was made
}

interface StoredCorrections {
  version: 1;
  corrections: UserCorrection[];
}

/**
 * Get all stored corrections from localStorage
 */
function getStoredCorrections(): StoredCorrections {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.version === 1 && Array.isArray(parsed.corrections)) {
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return { version: 1, corrections: [] };
}

/**
 * Save corrections to localStorage
 */
function setStoredCorrections(data: StoredCorrections): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
}

/**
 * Save a new user correction.
 * If a correction for this original + faction already exists, it will be updated.
 */
export function saveCorrection(original: string, corrected: string, faction: string): void {
  const data = getStoredCorrections();

  // Normalize for comparison
  const normalizedOriginal = original.toLowerCase().trim();
  const normalizedFaction = faction.toLowerCase().trim();

  // Find existing correction
  const existingIndex = data.corrections.findIndex(
    c => c.original.toLowerCase().trim() === normalizedOriginal &&
         c.faction.toLowerCase().trim() === normalizedFaction
  );

  const correction: UserCorrection = {
    original,
    corrected,
    faction,
    timestamp: Date.now(),
  };

  if (existingIndex !== -1) {
    // Update existing
    data.corrections[existingIndex] = correction;
  } else {
    // Add new
    data.corrections.push(correction);
  }

  setStoredCorrections(data);
}

/**
 * Get all corrections as a Map from original name to corrected name.
 * Only includes corrections that match the current faction if specified.
 */
export function getCorrections(faction?: string): Map<string, string> {
  const data = getStoredCorrections();
  const map = new Map<string, string>();

  const normalizedFaction = faction?.toLowerCase().trim();

  for (const correction of data.corrections) {
    // If faction is specified, only include matching corrections
    if (normalizedFaction && correction.faction.toLowerCase().trim() !== normalizedFaction) {
      continue;
    }
    map.set(correction.original.toLowerCase().trim(), correction.corrected);
  }

  return map;
}

/**
 * Get a correction for a specific term.
 * Returns the corrected name, or null if no correction exists.
 */
export function getCorrectionForTerm(term: string, faction?: string): string | null {
  const corrections = getCorrections(faction);
  return corrections.get(term.toLowerCase().trim()) ?? null;
}

/**
 * Clear all stored corrections.
 */
export function clearCorrections(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore errors
  }
}

/**
 * Get all corrections as an array (for debugging/export)
 */
export function getAllCorrections(): UserCorrection[] {
  return getStoredCorrections().corrections;
}

/**
 * Remove a specific correction
 */
export function removeCorrection(original: string, faction: string): void {
  const data = getStoredCorrections();

  const normalizedOriginal = original.toLowerCase().trim();
  const normalizedFaction = faction.toLowerCase().trim();

  data.corrections = data.corrections.filter(
    c => !(c.original.toLowerCase().trim() === normalizedOriginal &&
           c.faction.toLowerCase().trim() === normalizedFaction)
  );

  setStoredCorrections(data);
}
