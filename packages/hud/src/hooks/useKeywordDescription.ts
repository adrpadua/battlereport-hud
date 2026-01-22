/**
 * Hook for fetching keyword descriptions from the API.
 * Caches results to avoid refetching.
 */

import { useState, useEffect } from 'react';

interface KeywordResult {
  name: string;
  description: string | null;
  type: string;
}

// Module-level cache to persist across component instances
const keywordCache = new Map<string, string | null>();
const pendingRequests = new Map<string, Promise<string | null>>();

// API base URL - defaults to local MCP server
const API_BASE = 'http://localhost:40401';

/**
 * Hardcoded fallback descriptions for common weapon abilities.
 * Used when API is unavailable or keyword is not found.
 */
const FALLBACK_DESCRIPTIONS: Record<string, string> = {
  'LETHAL HITS':
    'Critical hits (unmodified hit rolls of 6) automatically wound the target.',
  'SUSTAINED HITS':
    'Critical hits (unmodified hit rolls of 6) score additional hits.',
  'DEVASTATING WOUNDS':
    'Critical wounds (unmodified wound rolls of 6) cause mortal wounds instead of normal damage.',
  'RAPID FIRE':
    'When within half range, this weapon makes additional attacks.',
  ASSAULT:
    'Can fire after Advancing (at -1 to hit).',
  HEAVY:
    '+1 to hit if Remained Stationary. Cannot fire after Advancing.',
  PISTOL:
    'Can fire while Engaged. Can only target enemies within Engagement Range when Engaged.',
  BLAST:
    '+1 Attack per 5 models in target unit. Cannot target units within Engagement Range.',
  MELTA:
    'Increased Damage within half range.',
  TORRENT: 'Automatically hits.',
  HAZARDOUS:
    'Roll D6 after attacking; on a 1, bearer suffers 3 mortal wounds.',
  PRECISION:
    'Can target attached Characters instead of Bodyguard unit.',
  'INDIRECT FIRE':
    'Can target units not visible. -1 to hit, target has Benefit of Cover.',
  'ONE SHOT': 'Can only fire once per battle.',
  PSYCHIC: 'Psychic weapon. Target suffers Perils of the Warp on wound.',
  'TWIN-LINKED': 'Re-roll wound rolls.',
  LANCE: '+1 to wound if bearer Charged this turn.',
  'IGNORES COVER': 'Target does not receive Benefit of Cover.',
  'EXTRA ATTACKS': 'Can be used in addition to other melee weapons.',
  'FEEL NO PAIN': 'Roll to ignore wounds (typically 5+ or 6+).',
  'DEADLY DEMISE': 'On destruction, nearby units may suffer mortal wounds.',
  'DEEP STRIKE': 'Can be set up in Reserves and arrive from Reserves.',
  'FIGHTS FIRST': 'Fights in the Fights First step.',
  'LONE OPERATIVE': 'Can only be targeted within 12" unless Attached.',
  STEALTH: '-1 to hit rolls when targeted.',
  SCOUTS: 'Can make a Normal move before the first turn.',
  INFILTRATORS: 'Can deploy anywhere 9"+ from enemy deployment and models.',
  HOVER: 'Can change to 20" Move characteristic.',
  LEADER: 'Can be attached to eligible Bodyguard units.',
  'FIRING DECK': 'Embarked models can shoot from this transport.',
};

/**
 * Fetch a single keyword description from the API.
 */
async function fetchKeywordDescription(keyword: string): Promise<string | null> {
  const normalized = keyword.toUpperCase().trim();

  // Check cache first
  if (keywordCache.has(normalized)) {
    return keywordCache.get(normalized) ?? null;
  }

  // Check if there's a pending request
  if (pendingRequests.has(normalized)) {
    return pendingRequests.get(normalized)!;
  }

  // Check fallback before making API call
  const fallback = FALLBACK_DESCRIPTIONS[normalized];

  // Create the fetch promise
  const fetchPromise = (async () => {
    try {
      const response = await fetch(
        `${API_BASE}/api/keywords/${encodeURIComponent(keyword)}`,
        { signal: AbortSignal.timeout(3000) }
      );

      if (response.ok) {
        const data = await response.json();
        const description = data.keyword?.description ?? null;
        keywordCache.set(normalized, description);
        return description;
      }
    } catch (error) {
      // API error - use fallback
      console.debug(`Failed to fetch keyword "${keyword}":`, error);
    }

    // Use fallback
    const result = fallback ?? null;
    keywordCache.set(normalized, result);
    return result;
  })();

  pendingRequests.set(normalized, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    pendingRequests.delete(normalized);
  }
}

/**
 * Batch fetch multiple keyword descriptions.
 */
async function fetchKeywordDescriptionsBatch(
  keywords: string[]
): Promise<Record<string, string | null>> {
  const results: Record<string, string | null> = {};
  const uncached: string[] = [];

  // Check cache first
  for (const keyword of keywords) {
    const normalized = keyword.toUpperCase().trim();
    if (keywordCache.has(normalized)) {
      results[keyword] = keywordCache.get(normalized) ?? null;
    } else if (FALLBACK_DESCRIPTIONS[normalized]) {
      results[keyword] = FALLBACK_DESCRIPTIONS[normalized];
      keywordCache.set(normalized, FALLBACK_DESCRIPTIONS[normalized]);
    } else {
      uncached.push(keyword);
    }
  }

  // Fetch uncached keywords in batch
  if (uncached.length > 0) {
    try {
      const response = await fetch(`${API_BASE}/api/keywords/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: uncached }),
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        const batchResults = data.keywords as Record<string, KeywordResult | null>;

        for (const [keyword, result] of Object.entries(batchResults)) {
          const normalized = keyword.toUpperCase().trim();
          const description = result?.description ?? null;
          keywordCache.set(normalized, description);
          results[keyword] = description;
        }
      }
    } catch (error) {
      console.debug('Batch keyword fetch failed:', error);
      // Fall back to individual lookups from fallback
      for (const keyword of uncached) {
        const normalized = keyword.toUpperCase().trim();
        results[keyword] = FALLBACK_DESCRIPTIONS[normalized] ?? null;
      }
    }
  }

  return results;
}

/**
 * Hook to fetch a single keyword description.
 *
 * @param keyword The keyword to look up
 * @returns { description, isLoading, error }
 */
export function useKeywordDescription(keyword: string | null | undefined) {
  const [description, setDescription] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!keyword) {
      setDescription(null);
      return;
    }

    const normalized = keyword.toUpperCase().trim();

    // Check cache
    if (keywordCache.has(normalized)) {
      setDescription(keywordCache.get(normalized) ?? null);
      return;
    }

    // Check fallback
    if (FALLBACK_DESCRIPTIONS[normalized]) {
      setDescription(FALLBACK_DESCRIPTIONS[normalized]);
      keywordCache.set(normalized, FALLBACK_DESCRIPTIONS[normalized]);
      return;
    }

    // Fetch from API
    setIsLoading(true);
    setError(null);

    fetchKeywordDescription(keyword)
      .then(setDescription)
      .catch((err) => setError(err))
      .finally(() => setIsLoading(false));
  }, [keyword]);

  return { description, isLoading, error };
}

/**
 * Hook to fetch descriptions for multiple keywords.
 *
 * @param keywords Array of keywords to look up
 * @returns { descriptions, isLoading, error }
 */
export function useKeywordDescriptions(keywords: string[]) {
  const [descriptions, setDescriptions] = useState<Record<string, string | null>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!keywords.length) {
      setDescriptions({});
      return;
    }

    // Check if all are cached
    const allCached = keywords.every((k) => {
      const normalized = k.toUpperCase().trim();
      return keywordCache.has(normalized) || FALLBACK_DESCRIPTIONS[normalized];
    });

    if (allCached) {
      const cached: Record<string, string | null> = {};
      for (const k of keywords) {
        const normalized = k.toUpperCase().trim();
        cached[k] = keywordCache.get(normalized) ?? FALLBACK_DESCRIPTIONS[normalized] ?? null;
      }
      setDescriptions(cached);
      return;
    }

    setIsLoading(true);
    setError(null);

    fetchKeywordDescriptionsBatch(keywords)
      .then(setDescriptions)
      .catch((err) => setError(err))
      .finally(() => setIsLoading(false));
  }, [keywords.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return { descriptions, isLoading, error };
}

/**
 * Get a keyword description synchronously from cache.
 * Returns null if not cached.
 */
export function getCachedKeywordDescription(keyword: string): string | null {
  const normalized = keyword.toUpperCase().trim();
  return keywordCache.get(normalized) ?? FALLBACK_DESCRIPTIONS[normalized] ?? null;
}

/**
 * Prefetch keyword descriptions for a list of keywords.
 * Useful for preloading before render.
 */
export function prefetchKeywordDescriptions(keywords: string[]): void {
  fetchKeywordDescriptionsBatch(keywords).catch(() => {
    // Ignore errors during prefetch
  });
}
