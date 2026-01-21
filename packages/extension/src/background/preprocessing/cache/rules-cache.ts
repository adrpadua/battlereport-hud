/**
 * Cache for core rules fetched from MCP server.
 * Provides efficient access to rules data with lazy loading.
 */

import type {
  RulesIndexResponse,
  RuleDetailResponse,
  RulesCategoryResponse,
  GameTermsResponse,
  RuleContent,
  RuleReference,
} from '@mcp/types';

// MCP Server API configuration
const MCP_SERVER_URL = 'http://localhost:40401';
const DEFAULT_INDEX_TTL = 5 * 60 * 1000; // 5 minutes for index
const DEFAULT_CONTENT_TTL = 30 * 60 * 1000; // 30 minutes for content (rarely changes)
const FETCH_TIMEOUT_MS = 3000;

/**
 * Manages caching for core rules fetched from the MCP server API.
 * Provides tiered caching: index (compact) vs full content.
 */
export class RulesCache {
  private indexCache: RulesIndexResponse | null = null;
  private indexCacheTime = 0;
  private readonly indexTtl: number;

  private ruleContentCache = new Map<string, { data: RuleContent; time: number }>();
  private categoryCache = new Map<string, { data: RulesCategoryResponse; time: number }>();
  private readonly contentTtl: number;

  private gameTermsCache: string[] | null = null;
  private gameTermsCacheTime = 0;

  constructor(indexTtlMs: number = DEFAULT_INDEX_TTL, contentTtlMs: number = DEFAULT_CONTENT_TTL) {
    this.indexTtl = indexTtlMs;
    this.contentTtl = contentTtlMs;
  }

  /**
   * Get the rules index (compact: slugs + titles only).
   * Ideal for initial load and low-token reference lists.
   */
  async getIndex(): Promise<RulesIndexResponse | null> {
    if (this.isIndexValid()) {
      return this.indexCache;
    }

    const data = await this.fetchIndex();
    if (data) {
      this.indexCache = data;
      this.indexCacheTime = Date.now();
    }

    return this.indexCache;
  }

  /**
   * Get a single rule by slug with full content.
   */
  async getRule(slug: string): Promise<RuleContent | null> {
    const cached = this.ruleContentCache.get(slug);
    if (cached && Date.now() - cached.time < this.contentTtl) {
      return cached.data;
    }

    const data = await this.fetchRule(slug);
    if (data) {
      this.ruleContentCache.set(slug, { data, time: Date.now() });
    }

    return data;
  }

  /**
   * Get all rules in a category with full content.
   */
  async getRulesByCategory(category: string): Promise<RuleContent[]> {
    const cached = this.categoryCache.get(category);
    if (cached && Date.now() - cached.time < this.contentTtl) {
      return cached.data.rules;
    }

    const data = await this.fetchCategory(category);
    if (data) {
      this.categoryCache.set(category, { data, time: Date.now() });
      // Also populate individual rule cache
      for (const rule of data.rules) {
        this.ruleContentCache.set(rule.slug, { data: rule, time: Date.now() });
      }
      return data.rules;
    }

    return [];
  }

  /**
   * Get game mechanics terms for blocklist.
   * These terms should not be matched as units.
   */
  async getGameMechanicsTerms(): Promise<string[]> {
    if (this.gameTermsCache && Date.now() - this.gameTermsCacheTime < this.contentTtl) {
      return this.gameTermsCache;
    }

    const data = await this.fetchGameTerms();
    if (data) {
      this.gameTermsCache = data.terms;
      this.gameTermsCacheTime = Date.now();
    }

    return this.gameTermsCache ?? [];
  }

  /**
   * Get compact rule references by category from the index.
   * Low token cost - only returns slug, title, category.
   */
  async getRuleReferences(category?: string): Promise<RuleReference[]> {
    const index = await this.getIndex();
    if (!index) return [];

    if (category) {
      const cat = index.categories.find(c => c.category === category);
      return cat?.rules ?? [];
    }

    return index.categories.flatMap(c => c.rules);
  }

  /**
   * Get list of available categories.
   */
  async getCategories(): Promise<string[]> {
    const index = await this.getIndex();
    if (!index) return [];
    return index.categories.map(c => c.category);
  }

  /**
   * Check if the index cache is valid.
   */
  isIndexValid(): boolean {
    return this.indexCache !== null && Date.now() - this.indexCacheTime < this.indexTtl;
  }

  /**
   * Invalidate all caches.
   */
  invalidate(): void {
    this.indexCache = null;
    this.indexCacheTime = 0;
    this.ruleContentCache.clear();
    this.categoryCache.clear();
    this.gameTermsCache = null;
    this.gameTermsCacheTime = 0;
  }

  /**
   * Peek at cached index without fetching.
   */
  peekIndex(): RulesIndexResponse | null {
    return this.isIndexValid() ? this.indexCache : null;
  }

  // ============================================================================
  // Private fetch methods
  // ============================================================================

  private async fetchIndex(): Promise<RulesIndexResponse | null> {
    try {
      const response = await this.fetchWithTimeout(`${MCP_SERVER_URL}/api/rules/index`);
      if (!response.ok) {
        console.warn(`Failed to fetch rules index: ${response.status}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.warn('Failed to connect to MCP server for rules index:', error);
      return null;
    }
  }

  private async fetchRule(slug: string): Promise<RuleContent | null> {
    try {
      const response = await this.fetchWithTimeout(`${MCP_SERVER_URL}/api/rules/${encodeURIComponent(slug)}`);
      if (!response.ok) {
        console.warn(`Failed to fetch rule ${slug}: ${response.status}`);
        return null;
      }
      const data: RuleDetailResponse = await response.json();
      return data.rule;
    } catch (error) {
      console.warn(`Failed to fetch rule ${slug}:`, error);
      return null;
    }
  }

  private async fetchCategory(category: string): Promise<RulesCategoryResponse | null> {
    try {
      const response = await this.fetchWithTimeout(`${MCP_SERVER_URL}/api/rules/category/${encodeURIComponent(category)}`);
      if (!response.ok) {
        console.warn(`Failed to fetch rules category ${category}: ${response.status}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.warn(`Failed to fetch rules category ${category}:`, error);
      return null;
    }
  }

  private async fetchGameTerms(): Promise<GameTermsResponse | null> {
    try {
      const response = await this.fetchWithTimeout(`${MCP_SERVER_URL}/api/rules/game-terms`);
      if (!response.ok) {
        console.warn(`Failed to fetch game terms: ${response.status}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.warn('Failed to fetch game terms:', error);
      return null;
    }
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Singleton instance
let globalCache: RulesCache | null = null;

/**
 * Get the global rules cache instance.
 */
export function getRulesCache(): RulesCache {
  if (!globalCache) {
    globalCache = new RulesCache();
  }
  return globalCache;
}

/**
 * Reset the global cache (for testing).
 */
export function resetRulesCache(): void {
  globalCache = null;
}
