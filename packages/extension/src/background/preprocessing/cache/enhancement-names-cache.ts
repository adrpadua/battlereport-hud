/**
 * Cache for enhancement names and aliases.
 * Used for fast term detection during preprocessing.
 */

import type { ListValidNamesResponse } from '@mcp/types';

// MCP Server API configuration
const MCP_SERVER_URL = 'http://localhost:40401';
const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  names: string[];
  aliases: Map<string, string>;
  timestamp: number;
}

/**
 * Manages caching for enhancement names and aliases.
 * Pre-loads names from MCP server for fast term detection.
 */
export class EnhancementNamesCache {
  private cache = new Map<string, CacheEntry>();
  private readonly ttl: number;

  constructor(ttlMs: number = DEFAULT_CACHE_TTL) {
    this.ttl = ttlMs;
  }

  /**
   * Get enhancement names and aliases for a faction.
   * @param faction The faction ID (or null for all factions)
   * @param fetcher Optional custom fetcher function (for testing)
   */
  async get(
    faction: string | null,
    fetcher?: (faction: string | null) => Promise<ListValidNamesResponse | null>
  ): Promise<{ names: string[]; aliases: Map<string, string> } | null> {
    const cacheKey = faction ?? '__all__';
    const cached = this.cache.get(cacheKey);

    if (cached && this.isValid(cached)) {
      return { names: cached.names, aliases: cached.aliases };
    }

    const fetchFn = fetcher ?? this.defaultFetcher;
    const data = await fetchFn(faction);

    if (data) {
      const aliases = new Map<string, string>();
      if (data.aliases) {
        for (const [alias, canonical] of Object.entries(data.aliases)) {
          aliases.set(alias.toLowerCase(), canonical);
        }
      }

      const entry: CacheEntry = {
        names: data.names,
        aliases,
        timestamp: Date.now(),
      };

      this.cache.set(cacheKey, entry);
      return { names: entry.names, aliases: entry.aliases };
    }

    return null;
  }

  /**
   * Get enhancement names and aliases for multiple factions combined.
   */
  async getForFactions(factions: string[]): Promise<{ names: string[]; aliases: Map<string, string> }> {
    const allNames = new Set<string>();
    const allAliases = new Map<string, string>();

    await Promise.all(
      factions.map(async (faction) => {
        const data = await this.get(faction);
        if (data) {
          data.names.forEach((name) => allNames.add(name));
          data.aliases.forEach((value, key) => allAliases.set(key, value));
        }
      })
    );

    return { names: [...allNames], aliases: allAliases };
  }

  /**
   * Check if a term matches an enhancement name or alias.
   */
  async isEnhancement(term: string, factions: string[]): Promise<string | null> {
    const data = await this.getForFactions(factions);
    const normalized = term.toLowerCase();

    // Check direct name match
    const directMatch = data.names.find((n) => n.toLowerCase() === normalized);
    if (directMatch) {
      return directMatch;
    }

    // Check alias match
    const aliasMatch = data.aliases.get(normalized);
    if (aliasMatch) {
      return aliasMatch;
    }

    return null;
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
  invalidate(faction: string | null): void {
    this.cache.delete(faction ?? '__all__');
  }

  /**
   * Invalidate all cached data.
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Default fetcher that calls the MCP server API.
   */
  private defaultFetcher = async (faction: string | null): Promise<ListValidNamesResponse | null> => {
    try {
      const params = new URLSearchParams({ includeAliases: 'true' });
      if (faction) {
        params.set('faction', faction);
      }

      const response = await fetch(
        `${MCP_SERVER_URL}/api/valid-names/enhancements?${params.toString()}`
      );
      if (!response.ok) {
        console.warn(`Failed to fetch enhancement names: ${response.status}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.warn('Failed to connect to MCP server for enhancement names:', error);
      return null;
    }
  };
}

// Singleton instance
let globalCache: EnhancementNamesCache | null = null;

/**
 * Get the global enhancement names cache instance.
 */
export function getEnhancementNamesCache(): EnhancementNamesCache {
  if (!globalCache) {
    globalCache = new EnhancementNamesCache();
  }
  return globalCache;
}

/**
 * Reset the global cache (for testing).
 */
export function resetEnhancementNamesCache(): void {
  globalCache = null;
}
