import 'dotenv/config';
import { WAHAPEDIA_URLS, FACTION_SLUGS } from './config.js';
import { getCachedUnits, listCachedFactions, cacheUnits } from './unit-cache.js';
import { FirecrawlClient } from './firecrawl-client.js';

interface ValidationResult {
  url: string;
  status: number | 'error';
  ok: boolean;
  error?: string;
}

async function validateUrl(url: string): Promise<ValidationResult> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return {
      url,
      status: response.status,
      ok: response.ok,
    };
  } catch (error) {
    return {
      url,
      status: 'error',
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function validateUrls(urls: string[], concurrency = 5): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(validateUrl));
    results.push(...batchResults);

    // Progress indicator
    process.stdout.write(`\r  Validated ${results.length}/${urls.length} URLs...`);
  }

  console.log(''); // New line after progress
  return results;
}

type ScrapeTarget = 'core' | 'factions' | 'units' | 'all';

/**
 * Extract unit links from the datasheets TOC
 */
function extractUnitLinksFromTOC(markdown: string): { name: string; slug: string }[] {
  const units: { name: string; slug: string }[] = [];
  const seen = new Set<string>();

  const linkRegex = /\[([^\]]+)\]\([^)]*\/factions\/[^/]+\/datasheets#([^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(markdown)) !== null) {
    const name = match[1]?.trim();
    const anchorSlug = match[2]?.trim();

    if (!name || !anchorSlug || seen.has(anchorSlug)) continue;
    seen.add(anchorSlug);

    const slug = decodeURIComponent(anchorSlug).replace(/\s+/g, '-');
    units.push({ name, slug });
  }

  return units;
}

async function main() {
  const args = process.argv.slice(2);

  // Show cache status
  if (args.includes('--cache')) {
    const cached = listCachedFactions();
    if (cached.length === 0) {
      console.log('No cached unit lists found.');
    } else {
      console.log('=== Cached Unit Lists ===\n');
      for (const { slug, unitCount, scrapedAt } of cached) {
        console.log(`  ${slug}: ${unitCount} units (cached ${scrapedAt})`);
      }
    }
    return;
  }

  const factionIndex = args.indexOf('--faction');
  const singleFaction = factionIndex >= 0 ? args[factionIndex + 1] : null;

  // Build cache by fetching datasheets index
  if (args.includes('--build-cache')) {
    const factionsToCache = singleFaction ? [singleFaction] : FACTION_SLUGS;
    const client = new FirecrawlClient();

    console.log('=== Building Unit Cache ===\n');

    for (const factionSlug of factionsToCache) {
      const existing = getCachedUnits(factionSlug);
      if (existing) {
        console.log(`  ${factionSlug}: already cached (${existing.length} units)`);
        continue;
      }

      console.log(`  ${factionSlug}: fetching datasheets index...`);
      try {
        const indexUrl = WAHAPEDIA_URLS.datasheets(factionSlug);
        const result = await client.scrape(indexUrl);
        const units = extractUnitLinksFromTOC(result.markdown);
        cacheUnits(factionSlug, units);
        console.log(`  ${factionSlug}: cached ${units.length} units`);
      } catch (error) {
        console.error(`  ${factionSlug}: failed - ${error instanceof Error ? error.message : error}`);
      }
    }

    console.log('\nDone. Run with --cache to see cached factions.');
    return;
  }

  const targetIndex = args.indexOf('--target');
  const target: ScrapeTarget = (targetIndex >= 0 ? args[targetIndex + 1] : 'all') as ScrapeTarget;

  console.log('=== Dry Run: URLs that would be scraped ===\n');

  const urls: { category: string; url: string }[] = [];

  // Core rules
  if ((target === 'core' || target === 'all') && !singleFaction) {
    urls.push({ category: 'Core Rules', url: WAHAPEDIA_URLS.rules.core });
  }

  // Factions
  const factionsToProcess = singleFaction ? [singleFaction] : FACTION_SLUGS;

  if (target === 'factions' || target === 'all' || (singleFaction && target !== 'units')) {
    for (const factionSlug of factionsToProcess) {
      urls.push({ category: `Faction: ${factionSlug}`, url: WAHAPEDIA_URLS.factionBase(factionSlug) });
    }
  }

  // Units (datasheets index + individual unit pages)
  if (target === 'units' || target === 'all') {
    for (const factionSlug of factionsToProcess) {
      // Check if we have cached unit slugs
      const cachedUnits = getCachedUnits(factionSlug);

      if (cachedUnits) {
        urls.push({ category: `Unit Pages: ${factionSlug} (${cachedUnits.length} cached)`, url: '' });
        for (const { name, slug } of cachedUnits) {
          urls.push({
            category: `Unit Pages: ${factionSlug} (${cachedUnits.length} cached)`,
            url: WAHAPEDIA_URLS.unitDatasheet(factionSlug, slug)
          });
        }
      } else {
        // No cache - would need to fetch index first
        const indexUrl = WAHAPEDIA_URLS.datasheets(factionSlug);
        urls.push({ category: `Datasheets Index: ${factionSlug} (no cache)`, url: indexUrl });
        urls.push({
          category: `Unit Pages: ${factionSlug} (no cache)`,
          url: `<discovered from index>`
        });
      }
    }
  }

  // Filter to only real URLs (not placeholders)
  const realUrls = urls.filter(u => u.url && !u.url.startsWith('<'));

  // Validate URLs if requested
  if (args.includes('--validate')) {
    console.log(`Validating ${realUrls.length} URLs...\n`);

    const urlsToValidate = realUrls.map(u => u.url);
    const results = await validateUrls(urlsToValidate);

    const failed = results.filter(r => !r.ok);
    const passed = results.filter(r => r.ok);

    if (failed.length > 0) {
      console.log('\n=== Failed URLs ===\n');
      for (const { url, status, error } of failed) {
        if (error) {
          console.log(`  [ERROR] ${url}`);
          console.log(`          ${error}`);
        } else {
          console.log(`  [${status}] ${url}`);
        }
      }
    }

    console.log(`\n=== Validation Summary ===`);
    console.log(`Passed: ${passed.length}`);
    console.log(`Failed: ${failed.length}`);
    console.log(`Total:  ${results.length}`);

    if (failed.length > 0) {
      process.exit(1);
    }
    return;
  }

  // Print URLs grouped by category
  let currentCategory = '';
  for (const { category, url } of urls) {
    if (category !== currentCategory) {
      console.log(`\n[${category}]`);
      currentCategory = category;
    }
    if (url) {
      console.log(`  ${url}`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total URLs to scrape: ${realUrls.length}`);
  console.log(`Factions: ${factionsToProcess.length}`);
  console.log(`Target: ${target}`);
  if (singleFaction) {
    console.log(`Single faction mode: ${singleFaction}`);
  }
}

main().catch(console.error);
