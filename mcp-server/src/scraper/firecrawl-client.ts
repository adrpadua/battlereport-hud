import FirecrawlApp from '@mendable/firecrawl-js';
import { getScraperConfig, type ScraperConfig } from './config.js';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface ScrapeResult {
  url: string;
  markdown: string;
  html?: string;
  metadata?: Record<string, unknown>;
  links?: string[];
  contentHash: string;
  scrapedAt: Date;
  fromCache: boolean;
}

export interface ScrapeOptions {
  useCache?: boolean;
  forceRefresh?: boolean;
  includeHtml?: boolean;
  extractLinks?: boolean;
  waitFor?: number; // ms to wait for JS rendering
  timeout?: number; // request timeout in ms (default 30000)
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
      includeHtml = true,
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
        const formats: ('markdown' | 'html')[] = includeHtml
          ? ['markdown', 'html']
          : ['markdown'];

        const response = await this.client.scrapeUrl(url, {
          formats,
          timeout,
        });

        if (!response.success) {
          throw new Error(`Firecrawl scrape failed: ${response.error || 'Unknown error'}`);
        }

        const markdown = response.markdown || '';
        const contentHash = createHash('sha256').update(markdown).digest('hex');

        const result: ScrapeResult = {
          url,
          markdown,
          html: includeHtml ? response.html : undefined,
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
