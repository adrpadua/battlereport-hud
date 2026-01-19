import Fuse, { IFuseOptions } from 'fuse.js';
import type { FactionData, UnitData } from '@/types/bsdata';

export interface ValidatedUnit {
  originalName: string;
  matchedName: string;
  matchedUnit: UnitData | null;
  confidence: number; // 0-1 score
  isValidated: boolean;
}

// Fuse.js options tuned for unit name matching
const FUSE_OPTIONS: IFuseOptions<UnitData> = {
  keys: [
    { name: 'name', weight: 0.7 },
    { name: 'canonicalName', weight: 0.3 },
  ],
  threshold: 0.4, // Higher = more lenient matching
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 3,
};

// Cache Fuse instances per faction
const fuseCache = new Map<string, Fuse<UnitData>>();

/**
 * Get or create a Fuse instance for a faction.
 */
function getFuseForFaction(faction: FactionData): Fuse<UnitData> {
  if (fuseCache.has(faction.id)) {
    return fuseCache.get(faction.id)!;
  }

  const fuse = new Fuse(faction.units, FUSE_OPTIONS);
  fuseCache.set(faction.id, fuse);
  return fuse;
}

/**
 * Validate a single unit name against a faction's unit list.
 * Returns the best match with confidence score.
 */
export function validateUnit(
  unitName: string,
  faction: FactionData
): ValidatedUnit {
  const fuse = getFuseForFaction(faction);

  // Search for matches
  const results = fuse.search(unitName);

  if (results.length === 0 || results[0]!.score === undefined) {
    return {
      originalName: unitName,
      matchedName: unitName,
      matchedUnit: null,
      confidence: 0,
      isValidated: false,
    };
  }

  const bestMatch = results[0]!;
  // Fuse score is 0 (perfect) to 1 (worst), invert for confidence
  const confidence = 1 - bestMatch.score!;

  // Only validate if confidence is high enough
  const isValidated = confidence >= 0.6;

  return {
    originalName: unitName,
    matchedName: isValidated ? bestMatch.item.name : unitName,
    matchedUnit: isValidated ? bestMatch.item : null,
    confidence,
    isValidated,
  };
}

/**
 * Validate multiple unit names against a faction.
 */
export function validateUnits(
  unitNames: string[],
  faction: FactionData
): ValidatedUnit[] {
  return unitNames.map((name) => validateUnit(name, faction));
}

/**
 * Validate units against multiple factions.
 * Tries each faction and returns the best match.
 */
export function validateUnitAcrossFactions(
  unitName: string,
  factions: FactionData[]
): ValidatedUnit {
  let bestResult: ValidatedUnit | null = null;

  for (const faction of factions) {
    const result = validateUnit(unitName, faction);
    if (!bestResult || result.confidence > bestResult.confidence) {
      bestResult = result;
    }
  }

  return (
    bestResult ?? {
      originalName: unitName,
      matchedName: unitName,
      matchedUnit: null,
      confidence: 0,
      isValidated: false,
    }
  );
}

/**
 * Get the best match for a unit name, regardless of validation threshold.
 * Useful for showing suggestions to the user.
 */
export function getBestMatch(
  unitName: string,
  faction: FactionData
): ValidatedUnit | null {
  const fuse = getFuseForFaction(faction);
  const results = fuse.search(unitName);

  if (results.length === 0 || results[0]!.score === undefined) {
    return null;
  }

  const bestMatch = results[0]!;
  const confidence = 1 - bestMatch.score!;

  return {
    originalName: unitName,
    matchedName: bestMatch.item.name,
    matchedUnit: bestMatch.item,
    confidence,
    isValidated: confidence >= 0.6,
  };
}

/**
 * Clear the Fuse cache.
 */
export function clearValidatorCache(): void {
  fuseCache.clear();
}

/**
 * Get suggestions for a unit name (for autocomplete).
 */
export function getSuggestions(
  partialName: string,
  faction: FactionData,
  limit = 5
): UnitData[] {
  const fuse = getFuseForFaction(faction);
  const results = fuse.search(partialName, { limit });
  return results.map((r) => r.item);
}
