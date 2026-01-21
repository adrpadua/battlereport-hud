/**
 * Isolated cache management for enhancements data.
 * Encapsulates mutable state for faction-specific enhancement data.
 */

import type { EnhancementSearchResponse } from '@mcp/types';

// MCP Server API configuration
const MCP_SERVER_URL = 'http://localhost:40401';
const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: EnhancementSearchResponse;
  timestamp: number;
}

/**
 * Manages caching for enhancements fetched from the MCP server API.
 * Stores enhancements per-faction to support multi-faction games.
 */
export class EnhancementsCache {
  private cache = new Map<string, CacheEntry>();
  private readonly ttl: number;

  constructor(ttlMs: number = DEFAULT_CACHE_TTL) {
    this.ttl = ttlMs;
  }

  /**
   * Get enhancements for a faction from cache or fetch from API.
   * @param faction The faction ID to get enhancements for
   * @param fetcher Optional custom fetcher function (for testing)
   */
  async get(
    faction: string,
    fetcher?: (faction: string) => Promise<EnhancementSearchResponse | null>
  ): Promise<EnhancementSearchResponse | null> {
    const normalizedFaction = this.normalizeFaction(faction);
    const cached = this.cache.get(normalizedFaction);

    if (cached && this.isValid(cached)) {
      return cached.data;
    }

    const fetchFn = fetcher ?? this.defaultFetcher;
    const data = await fetchFn(normalizedFaction);

    if (data) {
      this.cache.set(normalizedFaction, { data, timestamp: Date.now() });
    }

    return data;
  }

  /**
   * Get enhancements for multiple factions.
   * Returns a map of faction -> enhancements.
   */
  async getForFactions(factions: string[]): Promise<Map<string, EnhancementSearchResponse>> {
    const results = new Map<string, EnhancementSearchResponse>();

    await Promise.all(
      factions.map(async (faction) => {
        const data = await this.get(faction);
        if (data) {
          results.set(faction, data);
        }
      })
    );

    return results;
  }

  /**
   * Get all enhancement names for the given factions.
   * Useful for term detection.
   */
  async getEnhancementNames(factions: string[]): Promise<string[]> {
    const data = await this.getForFactions(factions);
    const names = new Set<string>();

    for (const response of data.values()) {
      for (const enhancement of response.enhancements) {
        names.add(enhancement.name);
      }
    }

    return [...names];
  }

  /**
   * Check if a cache entry is valid (not expired).
   */
  private isValid(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < this.ttl;
  }

  /**
   * Invalidate cache for a specific faction.
   */
  invalidate(faction: string): void {
    this.cache.delete(this.normalizeFaction(faction));
  }

  /**
   * Invalidate all cached data.
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Peek at cached data for a faction without fetching.
   */
  peek(faction: string): EnhancementSearchResponse | null {
    const entry = this.cache.get(this.normalizeFaction(faction));
    return entry && this.isValid(entry) ? entry.data : null;
  }

  /**
   * Normalize faction identifier for cache key.
   */
  private normalizeFaction(faction: string): string {
    return faction.toLowerCase().replace(/\s+/g, '-');
  }

  /**
   * Default fetcher that calls the MCP server API.
   */
  private defaultFetcher = async (faction: string): Promise<EnhancementSearchResponse | null> => {
    try {
      const response = await fetch(
        `${MCP_SERVER_URL}/api/enhancements?faction=${encodeURIComponent(faction)}`
      );
      if (!response.ok) {
        console.warn(`Failed to fetch enhancements for ${faction}: ${response.status}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.warn('Failed to connect to MCP server for enhancements:', error);
      return null;
    }
  };
}

// Singleton instance for backwards compatibility
let globalCache: EnhancementsCache | null = null;

/**
 * Get the global enhancements cache instance.
 */
export function getEnhancementsCache(): EnhancementsCache {
  if (!globalCache) {
    globalCache = new EnhancementsCache();
  }
  return globalCache;
}

/**
 * Reset the global cache (for testing).
 */
export function resetEnhancementsCache(): void {
  globalCache = null;
}
