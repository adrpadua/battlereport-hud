import FirecrawlApp from '@mendable/firecrawl-js';
import { getScraperConfig, type ScraperConfig } from './config.js';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface ScrapeResult {
  url: string;
  markdown: string;
  /**
   * HTML content from Firecrawl. Required for Wahapedia parsing since our parsers
   * use CSS selectors (e.g., .str10Name, .str10Wrap) that only exist in HTML.
   * Markdown conversion loses these class names and structural information.
   */
  html: string;
  metadata?: Record<string, unknown>;
  links?: string[];
  contentHash: string;
  scrapedAt: Date;
  fromCache: boolean;
}

/**
 * Wahapedia content filter settings.
 *
 * NOTE: These settings correspond to Wahapedia's localStorage-based visibility toggles.
 * However, Firecrawl extracts raw HTML/markdown regardless of CSS visibility rules,
 * so these settings must be applied during HTML parsing (not scraping).
 *
 * The CSS classes used by Wahapedia for content visibility:
 * - ShowFluff: Lore/flavor text
 * - ShowLegendaryDatasheets: Legends units (marked with Legends logo)
 * - ShowForgeWorldDatasheets: Forge World units
 * - ShowCrusadeRules: Crusade-specific rules
 * - ShowBoardingActions / sShowBoardingActions: Boarding Actions content
 * - ShowBaseSize: Base size info (⌀60mm etc)
 * - ShowCoreStratagems: Core stratagems section
 * - ShowDatasheetFeatures: Datasheet-specific stratagems/enhancements
 */
export interface WahapediaSettings {
  /** Show fluff/lore text (CSS class: ShowFluff) */
  showFluff?: boolean;
  /** Show Legends and not recommended rules/datasheets (CSS class: ShowLegendaryDatasheets) */
  showLegendaryDatasheets?: boolean;
  /** Show Forge World datasheets (CSS class: ShowForgeWorldDatasheets) */
  showForgeWorldDatasheets?: boolean;
  /** Show Crusade Rules (CSS class: ShowCrusadeRules) */
  showCrusadeRules?: boolean;
  /** Show Boarding Actions rules (CSS classes: ShowBoardingActions, sShowBoardingActions) */
  showBoardingActions?: boolean;
  /** Show base size information (CSS class: ShowBaseSize) */
  showBaseSize?: boolean;
  /** Show Core Stratagems (CSS class: ShowCoreStratagems) */
  showCoreStratagems?: boolean;
  /** Show datasheet features like Stratagems, Enhancements (CSS class: ShowDatasheetFeatures) */
  showDatasheetFeatures?: boolean;
}

/**
 * Default Wahapedia settings optimized for data extraction:
 * - Hides fluff text to reduce noise
 * - Hides Legends, Forge World, Crusade, Boarding Actions (non-standard content)
 * - Shows base size and core stratagems (useful data)
 * - Hides datasheet features to focus on unit data
 */
export const DEFAULT_WAHAPEDIA_SETTINGS: WahapediaSettings = {
  showFluff: false,
  showLegendaryDatasheets: false,
  showForgeWorldDatasheets: false,
  showCrusadeRules: false,
  showBoardingActions: false,
  showBaseSize: true,
  showCoreStratagems: true,
  showDatasheetFeatures: false,
};

/**
 * CSS class selectors to remove from HTML when filtering Wahapedia content.
 * Maps setting names to their CSS class selectors.
 */
export const WAHAPEDIA_CSS_SELECTORS: Record<keyof WahapediaSettings, string[]> = {
  showFluff: ['.ShowFluff'],
  showLegendaryDatasheets: ['.ShowLegendaryDatasheets'],
  showForgeWorldDatasheets: ['.ShowForgeWorldDatasheets'],
  showCrusadeRules: ['.ShowCrusadeRules'],
  showBoardingActions: ['.ShowBoardingActions', '.sShowBoardingActions'],
  showBaseSize: ['.ShowBaseSize'],
  showCoreStratagems: ['.ShowCoreStratagems'],
  showDatasheetFeatures: ['.ShowDatasheetFeatures'],
};

export interface ScrapeOptions {
  useCache?: boolean;
  forceRefresh?: boolean;
  extractLinks?: boolean;
  waitFor?: number; // ms to wait for JS rendering
  timeout?: number; // request timeout in ms (default 30000)
  // Note: HTML is always fetched for Wahapedia since parsers require CSS selectors
}

export class FirecrawlClient {
  private client: FirecrawlApp;
  private config: ScraperConfig;
  private requestCount = 0;
  private lastRequestTime = 0;

  constructor(config?: Partial<ScraperConfig>) {
    this.config = { ...getScraperConfig(), ...config };
    this.client = new FirecrawlApp({ apiKey: this.config.firecrawlApiKey });
    this.ensureCacheDir();
  }

  private ensureCacheDir(): void {
    if (!existsSync(this.config.cacheDir)) {
      mkdirSync(this.config.cacheDir, { recursive: true });
    }
  }

  private getCachePath(url: string): string {
    const urlHash = createHash('md5').update(url).digest('hex');
    return join(this.config.cacheDir, `${urlHash}.json`);
  }

  private loadFromCache(url: string): ScrapeResult | null {
    const cachePath = this.getCachePath(url);
    if (!existsSync(cachePath)) {
      return null;
    }

    try {
      const cached = JSON.parse(readFileSync(cachePath, 'utf-8'));

      // Ensure HTML exists (required for Wahapedia parsing)
      // Legacy cache entries might only have markdown
      if (!cached.html) {
        console.warn(`[Cache] Entry missing HTML, will re-fetch: ${url}`);
        return null;
      }

      return {
        ...cached,
        scrapedAt: new Date(cached.scrapedAt),
        fromCache: true,
      };
    } catch {
      return null;
    }
  }

  private saveToCache(result: ScrapeResult): void {
    const cachePath = this.getCachePath(result.url);
    writeFileSync(cachePath, JSON.stringify(result, null, 2));
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const minInterval = (60 * 1000) / this.config.rateLimit;
    const elapsed = now - this.lastRequestTime;

    if (elapsed < minInterval) {
      await this.sleep(minInterval - elapsed);
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async scrape(url: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const {
      useCache = true,
      forceRefresh = false,
      extractLinks = true,
      timeout = 30000,
    } = options;

    // Check cache first
    if (useCache && !forceRefresh) {
      const cached = this.loadFromCache(url);
      if (cached) {
        console.log(`[Cache] Hit: ${url}`);
        return cached;
      }
    }

    // Rate limit
    await this.rateLimit();
    console.log(`[Scrape] Fetching: ${url}`);

    // Retry logic
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        // Always request both markdown and HTML - HTML is required for CSS selector parsing
        const response = await this.client.scrapeUrl(url, {
          formats: ['markdown', 'html'],
          timeout,
        });

        if (!response.success) {
          throw new Error(`Firecrawl scrape failed: ${response.error || 'Unknown error'}`);
        }

        const markdown = response.markdown || '';
        const html = response.html || '';
        const contentHash = createHash('sha256').update(html || markdown).digest('hex');

        if (!html) {
          console.warn(`[Scrape] Warning: No HTML content returned for ${url}`);
        }

        const result: ScrapeResult = {
          url,
          markdown,
          html,
          metadata: response.metadata as Record<string, unknown> | undefined,
          links: extractLinks ? this.extractLinks(markdown, url) : undefined,
          contentHash,
          scrapedAt: new Date(),
          fromCache: false,
        };

        // Save to cache
        if (useCache) {
          this.saveToCache(result);
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`[Scrape] Attempt ${attempt} failed: ${lastError.message}`);

        if (attempt < this.config.retryAttempts) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
          console.log(`[Scrape] Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Scrape failed');
  }

  private extractLinks(markdown: string, baseUrl: string): string[] {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const links: string[] = [];
    let match;

    while ((match = linkRegex.exec(markdown)) !== null) {
      const link = match[2];
      if (link) {
        // Convert relative URLs to absolute
        if (link.startsWith('/')) {
          const base = new URL(baseUrl);
          links.push(`${base.origin}${link}`);
        } else if (link.startsWith('http')) {
          links.push(link);
        }
      }
    }

    // Deduplicate and filter to wahapedia links
    return [...new Set(links)].filter((l) => l.includes('wahapedia.ru'));
  }

  async scrapeMultiple(
    urls: string[],
    options: ScrapeOptions = {}
  ): Promise<Map<string, ScrapeResult>> {
    const results = new Map<string, ScrapeResult>();

    for (const url of urls) {
      try {
        const result = await this.scrape(url, options);
        results.set(url, result);
      } catch (error) {
        console.error(`[Scrape] Failed to scrape ${url}:`, error);
      }
    }

    return results;
  }

  getStats(): { requestCount: number; cacheDir: string } {
    return {
      requestCount: this.requestCount,
      cacheDir: this.config.cacheDir,
    };
  }
}
