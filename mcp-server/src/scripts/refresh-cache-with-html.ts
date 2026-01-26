import 'dotenv/config';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { FirecrawlClient, type ScrapeResult } from '../scraper/firecrawl-client.js';

interface RefreshOptions {
  dryRun: boolean;
  factionOnly: boolean;
  verbose: boolean;
}

interface RefreshStats {
  totalCacheFiles: number;
  withHtml: number;
  markdownOnly: number;
  refreshed: number;
  failed: number;
  skipped: number;
  errors: Array<{ url: string; error: string }>;
}

function parseArgs(): RefreshOptions {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    factionOnly: args.includes('--factions-only'),
    verbose: args.includes('--verbose') || args.includes('-v'),
  };
}

function printUsage(): void {
  console.log(`
Usage: npx tsx src/scripts/refresh-cache-with-html.ts [options]

Re-scrape cached pages that were originally scraped as Markdown-only.
This fetches HTML content from Firecrawl for better parsing.

Options:
  --dry-run        Preview which pages would be refreshed (no API calls)
  --factions-only  Only refresh faction main pages (not unit datasheets)
  --verbose, -v    Show detailed output

Examples:
  npx tsx src/scripts/refresh-cache-with-html.ts --dry-run
  npx tsx src/scripts/refresh-cache-with-html.ts --factions-only
  npx tsx src/scripts/refresh-cache-with-html.ts --verbose
`);
}

function hasHtmlContent(cached: ScrapeResult): boolean {
  return cached.html !== undefined && cached.html !== null && cached.html.length > 100;
}

function isFactionPage(url: string): boolean {
  // Faction pages: /wh40k10ed/factions/{faction-slug}/ (no unit slug)
  return /\/wh40k10ed\/factions\/[^/]+\/?$/.test(url);
}

async function loadMarkdownOnlyCache(
  cacheDir: string,
  factionOnly: boolean
): Promise<ScrapeResult[]> {
  const files = readdirSync(cacheDir).filter(f => f.endsWith('.json'));
  const markdownOnly: ScrapeResult[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(cacheDir, file), 'utf-8');
      const cached = JSON.parse(content) as ScrapeResult;

      // Skip if already has HTML
      if (hasHtmlContent(cached)) continue;

      // Skip non-faction pages if factionOnly is set
      if (factionOnly && !isFactionPage(cached.url)) continue;

      markdownOnly.push(cached);
    } catch {
      // Skip invalid cache files
    }
  }

  return markdownOnly;
}

async function main(): Promise<void> {
  const options = parseArgs();

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const cacheDir = process.env.CACHE_DIR || './.scrape-cache';

  console.log('=== Refresh Cache with HTML ===\n');
  console.log(`Cache directory: ${cacheDir}`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN (no API calls)' : 'LIVE'}`);
  if (options.factionOnly) {
    console.log('Filter: Faction pages only');
  }
  console.log('');

  // Analyze current cache
  const allFiles = readdirSync(cacheDir).filter(f => f.endsWith('.json'));
  let withHtml = 0;
  let markdownOnly = 0;

  for (const file of allFiles) {
    try {
      const content = readFileSync(join(cacheDir, file), 'utf-8');
      const cached = JSON.parse(content) as ScrapeResult;
      if (hasHtmlContent(cached)) {
        withHtml++;
      } else {
        markdownOnly++;
      }
    } catch {
      // Skip invalid
    }
  }

  const stats: RefreshStats = {
    totalCacheFiles: allFiles.length,
    withHtml,
    markdownOnly,
    refreshed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  console.log(`Total cache files: ${stats.totalCacheFiles}`);
  console.log(`  With HTML: ${stats.withHtml}`);
  console.log(`  Markdown only: ${stats.markdownOnly}`);
  console.log('');

  // Load pages that need refreshing
  const toRefresh = await loadMarkdownOnlyCache(cacheDir, options.factionOnly);

  if (toRefresh.length === 0) {
    console.log('No pages need refreshing - all cache files have HTML content.');
    process.exit(0);
  }

  console.log(`Pages to refresh: ${toRefresh.length}`);
  if (options.verbose) {
    for (const cached of toRefresh) {
      console.log(`  - ${cached.url}`);
    }
  }
  console.log('');

  if (options.dryRun) {
    console.log('[DRY RUN] Would refresh the following pages:');
    for (const cached of toRefresh) {
      const type = isFactionPage(cached.url) ? 'faction' : 'unit';
      console.log(`  [${type}] ${cached.url}`);
    }
    console.log(`\nTotal: ${toRefresh.length} pages would be refreshed.`);
    console.log('Remove --dry-run to make API calls and update cache.');
    process.exit(0);
  }

  // Initialize Firecrawl client
  const client = new FirecrawlClient();

  console.log('Starting refresh (this will make Firecrawl API calls)...\n');

  for (const cached of toRefresh) {
    const type = isFactionPage(cached.url) ? 'faction' : 'unit';
    process.stdout.write(`[${type}] ${cached.url}... `);

    try {
      const result = await client.scrape(cached.url, {
        useCache: true,
        forceRefresh: true, // Force re-scrape
        // HTML is always included now
        extractLinks: true,
      });

      if (hasHtmlContent(result)) {
        stats.refreshed++;
        console.log('refreshed with HTML');
      } else {
        stats.failed++;
        console.log('warning: still no HTML in response');
        stats.errors.push({ url: cached.url, error: 'Firecrawl returned no HTML' });
      }
    } catch (error) {
      stats.failed++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`failed: ${errorMsg}`);
      stats.errors.push({ url: cached.url, error: errorMsg });
    }
  }

  // Print summary
  console.log('\n=== Summary ===');
  console.log(`Refreshed with HTML: ${stats.refreshed}`);
  console.log(`Failed: ${stats.failed}`);

  if (stats.errors.length > 0) {
    console.log('\n=== Errors ===');
    for (const { url, error } of stats.errors) {
      console.log(`  ${url}`);
      console.log(`    ${error}`);
    }
  }

  console.log('\nNext steps:');
  console.log('  1. Run: npm run cli mcp reparse factions');
  console.log('  2. Run: npm run cli mcp reparse all');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
