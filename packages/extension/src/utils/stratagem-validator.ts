import Fuse, { IFuseOptions } from 'fuse.js';

/**
 * Stratagem data from MCP server
 */
export interface StratagemData {
  name: string;
  cpCost: string;
  phase: string;
  when: string | null;
  target: string | null;
  effect: string;
  detachment: string | null;
}

/**
 * Validated stratagem result
 */
export interface ValidatedStratagem {
  originalName: string;
  matchedName: string;
  matchedStratagem: StratagemData | null;
  confidence: number; // 0-1 score
  isValidated: boolean;
}

/**
 * Stratagem suggestion for UI
 */
export interface StratagemSuggestion {
  name: string;
  confidence: number;
  cpCost?: string;
  phase?: string;
}

// Fuse.js options tuned for stratagem name matching
const FUSE_OPTIONS: IFuseOptions<StratagemData> = {
  keys: [{ name: 'name', weight: 1.0 }],
  threshold: 0.4, // Higher = more lenient matching
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 3,
};

// Cache Fuse instances and stratagem data per faction
const fuseCache = new Map<string, Fuse<StratagemData>>();
const stratagemCache = new Map<string, StratagemData[]>();

// MCP server URL
const MCP_SERVER_URL = 'http://localhost:40401';

/**
 * Fetch stratagems for a faction from MCP server
 */
async function fetchStratagemsForFaction(faction: string): Promise<StratagemData[]> {
  // Check cache first
  const cacheKey = faction.toLowerCase();
  if (stratagemCache.has(cacheKey)) {
    return stratagemCache.get(cacheKey)!;
  }

  try {
    const response = await fetch(
      `${MCP_SERVER_URL}/api/stratagems?faction=${encodeURIComponent(faction)}`
    );

    if (!response.ok) {
      console.warn(`Failed to fetch stratagems for ${faction}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const stratagems: StratagemData[] = data.stratagems || [];

    // Cache the results
    stratagemCache.set(cacheKey, stratagems);

    return stratagems;
  } catch (error) {
    console.error(`Error fetching stratagems for ${faction}:`, error);
    return [];
  }
}

/**
 * Get or create a Fuse instance for a faction's stratagems
 */
async function getFuseForFaction(faction: string): Promise<Fuse<StratagemData> | null> {
  const cacheKey = faction.toLowerCase();

  if (fuseCache.has(cacheKey)) {
    return fuseCache.get(cacheKey)!;
  }

  const stratagems = await fetchStratagemsForFaction(faction);
  if (stratagems.length === 0) {
    return null;
  }

  const fuse = new Fuse(stratagems, FUSE_OPTIONS);
  fuseCache.set(cacheKey, fuse);
  return fuse;
}

/**
 * Validate a single stratagem name against a faction's stratagem list.
 * Returns the best match with confidence score.
 */
export async function validateStratagem(
  stratagemName: string,
  faction: string
): Promise<ValidatedStratagem> {
  const fuse = await getFuseForFaction(faction);

  if (!fuse) {
    // No stratagems loaded for faction
    return {
      originalName: stratagemName,
      matchedName: stratagemName,
      matchedStratagem: null,
      confidence: 0,
      isValidated: false,
    };
  }

  // Search for matches using Fuse.js
  const results = fuse.search(stratagemName);

  if (results.length > 0 && results[0]!.score !== undefined) {
    const bestMatch = results[0]!;
    // Fuse score is 0 (perfect) to 1 (worst), invert for confidence
    const confidence = 1 - bestMatch.score!;

    // High confidence match - use it directly
    if (confidence >= 0.6) {
      return {
        originalName: stratagemName,
        matchedName: bestMatch.item.name,
        matchedStratagem: bestMatch.item,
        confidence,
        isValidated: true,
      };
    }

    // Low confidence - return as suggestion but not validated
    return {
      originalName: stratagemName,
      matchedName: stratagemName,
      matchedStratagem: null,
      confidence,
      isValidated: false,
    };
  }

  return {
    originalName: stratagemName,
    matchedName: stratagemName,
    matchedStratagem: null,
    confidence: 0,
    isValidated: false,
  };
}

/**
 * Validate multiple stratagem names against a faction.
 */
export async function validateStratagems(
  stratagemNames: string[],
  faction: string
): Promise<ValidatedStratagem[]> {
  return Promise.all(stratagemNames.map((name) => validateStratagem(name, faction)));
}

/**
 * Get the best match for a stratagem name, regardless of validation threshold.
 * Useful for showing suggestions to the user.
 */
export async function getBestStratagemMatch(
  stratagemName: string,
  faction: string
): Promise<ValidatedStratagem | null> {
  const fuse = await getFuseForFaction(faction);

  if (!fuse) {
    return null;
  }

  const results = fuse.search(stratagemName);

  if (results.length > 0 && results[0]!.score !== undefined) {
    const match = results[0]!;
    const confidence = 1 - match.score!;

    return {
      originalName: stratagemName,
      matchedName: match.item.name,
      matchedStratagem: match.item,
      confidence,
      isValidated: confidence >= 0.6,
    };
  }

  return null;
}

/**
 * Get multiple suggestions for a stratagem name
 */
export async function getStratagemSuggestions(
  stratagemName: string,
  faction: string,
  limit = 5
): Promise<StratagemSuggestion[]> {
  const fuse = await getFuseForFaction(faction);

  if (!fuse) {
    return [];
  }

  const results = fuse.search(stratagemName, { limit });

  return results.map((result) => ({
    name: result.item.name,
    confidence: 1 - (result.score ?? 1),
    cpCost: result.item.cpCost,
    phase: result.item.phase,
  }));
}

/**
 * Clear all caches
 */
export function clearStratagemCache(): void {
  fuseCache.clear();
  stratagemCache.clear();
}

/**
 * Preload stratagems for factions (call during initialization)
 */
export async function preloadStratagemsForFactions(factions: string[]): Promise<void> {
  await Promise.all(factions.map((faction) => fetchStratagemsForFaction(faction)));
}
