import { Command } from 'commander';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { getScraperConfig } from '../../scraper/config.js';

interface CacheAnalysis {
  withHtml: { url: string; path: string }[];
  markdownOnly: { url: string; path: string }[];
}

export function analyzeCacheFormats(cacheDir?: string): CacheAnalysis {
  const config = getScraperConfig();
  const dir = cacheDir || config.cacheDir;

  if (!existsSync(dir)) {
    throw new Error(`Cache directory not found: ${dir}`);
  }

  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const withHtml: { url: string; path: string }[] = [];
  const markdownOnly: { url: string; path: string }[] = [];

  for (const file of files) {
    try {
      const filePath = join(dir, file);
      const data = JSON.parse(readFileSync(filePath, 'utf-8'));
      const urlPath = new URL(data.url).pathname;

      if (data.html) {
        withHtml.push({ url: urlPath, path: filePath });
      } else {
        markdownOnly.push({ url: urlPath, path: filePath });
      }
    } catch {
      // Skip invalid cache files
    }
  }

  return { withHtml, markdownOnly };
}

export async function showCacheAnalysis(): Promise<void> {
  console.log('\n=== Firecrawl Cache Analysis ===\n');

  try {
    const { withHtml, markdownOnly } = analyzeCacheFormats();

    console.log(`WITH HTML (${withHtml.length}):`);
    if (withHtml.length === 0) {
      console.log('  (none)');
    } else {
      // Group by content type
      const unitPages = withHtml.filter(p => !p.url.endsWith('/') && !p.url.includes('/datasheets'));
      const otherPages = withHtml.filter(p => p.url.endsWith('/') || p.url.includes('/datasheets'));

      if (unitPages.length > 0) {
        console.log(`  Unit datasheets: ${unitPages.length}`);
        unitPages.slice(0, 10).forEach(p => console.log(`    ${p.url}`));
        if (unitPages.length > 10) {
          console.log(`    ... and ${unitPages.length - 10} more`);
        }
      }
      if (otherPages.length > 0) {
        console.log(`  Other pages: ${otherPages.length}`);
        otherPages.forEach(p => console.log(`    ${p.url}`));
      }
    }

    console.log(`\nMARKDOWN ONLY (${markdownOnly.length}):`);
    if (markdownOnly.length === 0) {
      console.log('  (none)');
    } else {
      // Group by content type
      const factionPages = markdownOnly.filter(p => p.url.endsWith('/') && !p.url.includes('/datasheets'));
      const indexPages = markdownOnly.filter(p => p.url.includes('/datasheets'));
      const unitPages = markdownOnly.filter(p => !p.url.endsWith('/') && !p.url.includes('/datasheets'));

      if (factionPages.length > 0) {
        console.log(`  Faction pages: ${factionPages.length}`);
        factionPages.slice(0, 10).forEach(p => console.log(`    ${p.url}`));
        if (factionPages.length > 10) {
          console.log(`    ... and ${factionPages.length - 10} more`);
        }
      }
      if (indexPages.length > 0) {
        console.log(`  Datasheet indexes: ${indexPages.length}`);
        indexPages.slice(0, 10).forEach(p => console.log(`    ${p.url}`));
        if (indexPages.length > 10) {
          console.log(`    ... and ${indexPages.length - 10} more`);
        }
      }
      if (unitPages.length > 0) {
        console.log(`  Unit pages (no HTML): ${unitPages.length}`);
        unitPages.slice(0, 10).forEach(p => console.log(`    ${p.url}`));
        if (unitPages.length > 10) {
          console.log(`    ... and ${unitPages.length - 10} more`);
        }
      }
    }

    console.log(`\nTotal cached pages: ${withHtml.length + markdownOnly.length}`);
    console.log('');
  } catch (error) {
    console.error('Failed to analyze cache:', error instanceof Error ? error.message : error);
  }
}

export async function showCacheStats(): Promise<void> {
  console.log('\n=== Cache Statistics ===\n');

  try {
    const config = getScraperConfig();
    const dir = config.cacheDir;

    if (!existsSync(dir)) {
      console.log('Cache directory not found');
      return;
    }

    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    let totalSize = 0;
    let oldestDate: Date | null = null;
    let newestDate: Date | null = null;

    for (const file of files) {
      try {
        const filePath = join(dir, file);
        const data = JSON.parse(readFileSync(filePath, 'utf-8'));
        const scrapedAt = new Date(data.scrapedAt);

        // Estimate size from content
        const size = (data.markdown?.length || 0) + (data.html?.length || 0);
        totalSize += size;

        if (!oldestDate || scrapedAt < oldestDate) oldestDate = scrapedAt;
        if (!newestDate || scrapedAt > newestDate) newestDate = scrapedAt;
      } catch {
        // Skip invalid files
      }
    }

    console.log(`  Cache directory: ${dir}`);
    console.log(`  Total files: ${files.length}`);
    console.log(`  Total content size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    if (oldestDate) console.log(`  Oldest entry: ${oldestDate.toISOString()}`);
    if (newestDate) console.log(`  Newest entry: ${newestDate.toISOString()}`);
    console.log('');
  } catch (error) {
    console.error('Failed to get cache stats:', error instanceof Error ? error.message : error);
  }
}

export const cacheCommand = new Command('cache')
  .description('Firecrawl cache operations');

cacheCommand
  .command('analyze')
  .description('Analyze which cached pages have HTML vs markdown only')
  .action(async () => {
    await showCacheAnalysis();
  });

cacheCommand
  .command('stats')
  .description('Show cache statistics')
  .action(async () => {
    await showCacheStats();
  });
