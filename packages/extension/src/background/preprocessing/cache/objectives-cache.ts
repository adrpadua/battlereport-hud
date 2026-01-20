/**
 * Isolated cache management for objectives data.
 * Encapsulates mutable state that was previously at module level.
 */

import type { ObjectivesApiResponse } from '../types';

// MCP Server API configuration
const MCP_SERVER_URL = 'http://localhost:40401';
const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Manages caching for objectives fetched from the MCP server API.
 * Encapsulates mutable state and provides a clean interface.
 */
export class ObjectivesCache {
  private cache: ObjectivesApiResponse | null = null;
  private cacheTime = 0;
  private readonly ttl: number;

  constructor(ttlMs: number = DEFAULT_CACHE_TTL) {
    this.ttl = ttlMs;
  }

  /**
   * Get objectives from cache or fetch from API.
   * @param fetcher Optional custom fetcher function (for testing)
   */
  async get(fetcher?: () => Promise<ObjectivesApiResponse | null>): Promise<ObjectivesApiResponse | null> {
    if (this.isValid()) {
      return this.cache;
    }

    const fetchFn = fetcher ?? this.defaultFetcher;
    const data = await fetchFn();

    if (data) {
      this.cache = data;
      this.cacheTime = Date.now();
    }

    return this.cache;
  }

  /**
   * Check if the cache is valid (not expired).
   */
  isValid(): boolean {
    return this.cache !== null && Date.now() - this.cacheTime < this.ttl;
  }

  /**
   * Invalidate the cache, forcing a refresh on next access.
   */
  invalidate(): void {
    this.cache = null;
    this.cacheTime = 0;
  }

  /**
   * Get the cached data without fetching.
   * Returns null if cache is empty or expired.
   */
  peek(): ObjectivesApiResponse | null {
    return this.isValid() ? this.cache : null;
  }

  /**
   * Default fetcher that calls the MCP server API.
   */
  private defaultFetcher = async (): Promise<ObjectivesApiResponse | null> => {
    try {
      const response = await fetch(`${MCP_SERVER_URL}/api/objectives`);
      if (!response.ok) {
        console.warn(`Failed to fetch objectives from MCP server: ${response.status}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.warn('Failed to connect to MCP server for objectives:', error);
      return null;
    }
  };
}

// Singleton instance for backwards compatibility
let globalCache: ObjectivesCache | null = null;

/**
 * Get the global objectives cache instance.
 */
export function getObjectivesCache(): ObjectivesCache {
  if (!globalCache) {
    globalCache = new ObjectivesCache();
  }
  return globalCache;
}

/**
 * Reset the global cache (for testing).
 */
export function resetObjectivesCache(): void {
  globalCache = null;
}
