import 'dotenv/config';
import { WAHAPEDIA_URLS, FACTION_SLUGS } from './config.js';
import { FirecrawlClient } from './firecrawl-client.js';
import { getDb, closeConnection } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';

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
  const db = getDb();

  try {
    // Show index status from database
    if (args.includes('--index')) {
      const indexed = await db
        .select({
          slug: schema.factions.slug,
          name: schema.factions.name,
          unitCount: sql<number>`count(${schema.unitIndex.id})::int`,
          pendingCount: sql<number>`count(case when ${schema.unitIndex.scrapeStatus} = 'pending' then 1 end)::int`,
          successCount: sql<number>`count(case when ${schema.unitIndex.scrapeStatus} = 'success' then 1 end)::int`,
          failedCount: sql<number>`count(case when ${schema.unitIndex.scrapeStatus} = 'failed' then 1 end)::int`,
        })
        .from(schema.factions)
        .leftJoin(schema.unitIndex, eq(schema.factions.id, schema.unitIndex.factionId))
        .groupBy(schema.factions.id)
        .orderBy(schema.factions.name);

      if (indexed.length === 0) {
        console.log('No factions found in database.');
      } else {
        console.log('=== Unit Index Status ===\n');
        for (const { slug, name, unitCount, pendingCount, successCount, failedCount } of indexed) {
          if (unitCount === 0) {
            console.log(`  ${name} (${slug}): no units indexed`);
          } else {
            console.log(`  ${name} (${slug}): ${unitCount} units (${successCount} scraped, ${pendingCount} pending, ${failedCount} failed)`);
          }
        }
      }
      return;
    }

    const factionIndex = args.indexOf('--faction');
    const singleFaction = factionIndex >= 0 ? args[factionIndex + 1] : null;

    // Build index by fetching datasheets index
    if (args.includes('--build-index')) {
      // Get factions to index (either single or all from FACTION_SLUGS)
      let factionsToIndex: { id: number; slug: string; name: string }[];

      if (singleFaction) {
        factionsToIndex = await db
          .select({ id: schema.factions.id, slug: schema.factions.slug, name: schema.factions.name })
          .from(schema.factions)
          .where(eq(schema.factions.slug, singleFaction));

        if (factionsToIndex.length === 0) {
          console.error(`Faction "${singleFaction}" not found in database. Run faction scrape first.`);
          return;
        }
      } else {
        factionsToIndex = await db
          .select({ id: schema.factions.id, slug: schema.factions.slug, name: schema.factions.name })
          .from(schema.factions);
      }

      const client = new FirecrawlClient();

      console.log('=== Building Unit Index ===\n');

      for (const faction of factionsToIndex) {
        // Check if already indexed
        const existingCount = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.unitIndex)
          .where(eq(schema.unitIndex.factionId, faction.id));

        if (existingCount[0]!.count > 0 && !args.includes('--force')) {
          console.log(`  ${faction.slug}: already indexed (${existingCount[0]!.count} units)`);
          continue;
        }

        console.log(`  ${faction.slug}: fetching datasheets index...`);
        try {
          const indexUrl = WAHAPEDIA_URLS.datasheets(faction.slug);
          const result = await client.scrape(indexUrl);
          const units = extractUnitLinksFromTOC(result.markdown);

          // Insert into database
          for (const { name, slug } of units) {
            const wahapediaUrl = WAHAPEDIA_URLS.unitDatasheet(faction.slug, slug);
            await db
              .insert(schema.unitIndex)
              .values({
                factionId: faction.id,
                slug,
                name,
                wahapediaUrl,
                scrapeStatus: 'pending',
              })
              .onConflictDoNothing();
          }

          console.log(`  ${faction.slug}: indexed ${units.length} units`);
        } catch (error) {
          console.error(`  ${faction.slug}: failed - ${error instanceof Error ? error.message : error}`);
        }
      }

      console.log('\nDone. Run with --index to see indexed factions.');
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

    // Get factions from database or use FACTION_SLUGS as fallback
    let factionsToProcess: { id: number; slug: string }[];
    if (singleFaction) {
      const factionRows = await db
        .select({ id: schema.factions.id, slug: schema.factions.slug })
        .from(schema.factions)
        .where(eq(schema.factions.slug, singleFaction));
      factionsToProcess = factionRows.length > 0 ? factionRows : [{ id: 0, slug: singleFaction }];
    } else {
      const factionRows = await db
        .select({ id: schema.factions.id, slug: schema.factions.slug })
        .from(schema.factions);
      factionsToProcess = factionRows.length > 0 ? factionRows : FACTION_SLUGS.map(s => ({ id: 0, slug: s }));
    }

    if (target === 'factions' || target === 'all' || (singleFaction && target !== 'units')) {
      for (const { slug: factionSlug } of factionsToProcess) {
        urls.push({ category: `Faction: ${factionSlug}`, url: WAHAPEDIA_URLS.factionBase(factionSlug) });
      }
    }

    // Units (datasheets index + individual unit pages)
    if (target === 'units' || target === 'all') {
      for (const { id: factionId, slug: factionSlug } of factionsToProcess) {
        // Check if we have indexed unit slugs in database
        const indexedUnits = factionId > 0
          ? await db
              .select({ name: schema.unitIndex.name, slug: schema.unitIndex.slug })
              .from(schema.unitIndex)
              .where(eq(schema.unitIndex.factionId, factionId))
          : [];

        if (indexedUnits.length > 0) {
          urls.push({ category: `Unit Pages: ${factionSlug} (${indexedUnits.length} indexed)`, url: '' });
          for (const { slug } of indexedUnits) {
            urls.push({
              category: `Unit Pages: ${factionSlug} (${indexedUnits.length} indexed)`,
              url: WAHAPEDIA_URLS.unitDatasheet(factionSlug, slug)
            });
          }
        } else {
          // No index - would need to fetch index first
          const indexUrl = WAHAPEDIA_URLS.datasheets(factionSlug);
          urls.push({ category: `Datasheets Index: ${factionSlug} (no index)`, url: indexUrl });
          urls.push({
            category: `Unit Pages: ${factionSlug} (no index)`,
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
  } finally {
    await closeConnection();
  }
}

main().catch(console.error);
