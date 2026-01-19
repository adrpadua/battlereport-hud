/**
 * MCP Client Service
 * HTTP client for fetching enhanced data from the local MCP server
 * with caching and graceful degradation
 */

import type {
  McpUnitResponse,
  McpStratagemResponse,
  McpHealthResponse,
  EnhancedUnitData,
  EnhancedStratagemData,
} from '@/types/mcp-types';

const MCP_BASE_URL = 'http://localhost:40401';
const DATA_TIMEOUT_MS = 3000;
const HEALTH_TIMEOUT_MS = 1000;
const CACHE_MAX_ENTRIES = 100;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Health check intervals with exponential backoff (when unavailable)
const HEALTH_CHECK_INTERVALS = [5000, 10000, 30000, 5 * 60 * 1000]; // 5s, 10s, 30s, 5min
// When server is available, check less frequently
const HEALTHY_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }

  set(key: string, data: T): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

class McpClient {
  private isAvailable = false;
  private healthCheckAttempts = 0;
  private healthCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private unitCache: LRUCache<EnhancedUnitData>;
  private stratagemCache: LRUCache<EnhancedStratagemData>;

  constructor() {
    this.unitCache = new LRUCache<EnhancedUnitData>(CACHE_MAX_ENTRIES, CACHE_TTL_MS);
    this.stratagemCache = new LRUCache<EnhancedStratagemData>(CACHE_MAX_ENTRIES, CACHE_TTL_MS);
    this.startHealthCheck();
  }

  /**
   * Check if MCP server is currently available
   */
  get available(): boolean {
    return this.isAvailable;
  }

  /**
   * Fetch enhanced unit data from MCP server
   * Returns null on failure (never throws)
   */
  async fetchUnit(unitName: string, faction?: string): Promise<EnhancedUnitData | null> {
    if (!this.isAvailable) return null;

    const cacheKey = `unit:${unitName}:${faction ?? ''}`;
    const cached = this.unitCache.get(cacheKey);
    if (cached) return cached;

    try {
      const params = new URLSearchParams();
      if (faction) params.set('faction', faction);

      const url = `${MCP_BASE_URL}/api/units/${encodeURIComponent(unitName)}${params.toString() ? '?' + params.toString() : ''}`;
      const response = await this.fetchWithTimeout(url, DATA_TIMEOUT_MS);

      if (!response.ok) return null;

      const data: McpUnitResponse = await response.json();
      const enhanced: EnhancedUnitData = {
        weapons: data.weapons,
        abilities: data.abilities,
        mcpFetched: true,
      };

      this.unitCache.set(cacheKey, enhanced);
      return enhanced;
    } catch {
      return null;
    }
  }

  /**
   * Fetch enhanced stratagem data from MCP server
   * Returns null on failure (never throws)
   */
  async fetchStratagem(stratagemName: string, faction?: string): Promise<EnhancedStratagemData | null> {
    if (!this.isAvailable) return null;

    const cacheKey = `stratagem:${stratagemName}:${faction ?? ''}`;
    const cached = this.stratagemCache.get(cacheKey);
    if (cached) return cached;

    try {
      const params = new URLSearchParams();
      if (faction) params.set('faction', faction);

      const url = `${MCP_BASE_URL}/api/stratagems/${encodeURIComponent(stratagemName)}${params.toString() ? '?' + params.toString() : ''}`;
      const response = await this.fetchWithTimeout(url, DATA_TIMEOUT_MS);

      if (!response.ok) return null;

      const data: McpStratagemResponse = await response.json();
      const enhanced: EnhancedStratagemData = {
        cpCost: data.stratagem.cpCost,
        phase: data.stratagem.phase,
        when: data.stratagem.when,
        target: data.stratagem.target,
        effect: data.stratagem.effect,
        detachment: data.stratagem.detachment,
        mcpFetched: true,
      };

      this.stratagemCache.set(cacheKey, enhanced);
      return enhanced;
    } catch {
      return null;
    }
  }

  /**
   * Force a health check (useful when user action might indicate server is up)
   */
  async checkHealthNow(): Promise<boolean> {
    return this.checkHealth();
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.unitCache.clear();
    this.stratagemCache.clear();
  }

  /**
   * Stop health checks and clean up (call on extension unload)
   */
  destroy(): void {
    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private async checkHealth(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${MCP_BASE_URL}/health`, HEALTH_TIMEOUT_MS);
      if (response.ok) {
        const data: McpHealthResponse = await response.json();
        if (data.status === 'ok') {
          this.setAvailable(true);
          return true;
        }
      }
    } catch {
      // Silent failure
    }

    this.setAvailable(false);
    return false;
  }

  private setAvailable(available: boolean): void {
    const wasAvailable = this.isAvailable;
    this.isAvailable = available;

    if (available) {
      // Reset backoff on success
      this.healthCheckAttempts = 0;
      console.log('[MCP Client] Server available');
    } else if (wasAvailable) {
      console.log('[MCP Client] Server unavailable');
    }
  }

  private startHealthCheck(): void {
    this.scheduleNextHealthCheck();
  }

  private scheduleNextHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer);
    }

    // Use longer interval when server is available, exponential backoff when not
    let interval: number;
    if (this.isAvailable) {
      interval = HEALTHY_CHECK_INTERVAL_MS;
    } else {
      const intervalIndex = Math.min(this.healthCheckAttempts, HEALTH_CHECK_INTERVALS.length - 1);
      interval = HEALTH_CHECK_INTERVALS[intervalIndex] ?? HEALTH_CHECK_INTERVALS[0] ?? 5000;
    }

    this.healthCheckTimer = setTimeout(async () => {
      const isHealthy = await this.checkHealth();
      if (!isHealthy) {
        this.healthCheckAttempts++;
      }
      this.scheduleNextHealthCheck();
    }, interval);
  }

  private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Singleton instance
export const mcpClient = new McpClient();
