import { Command } from 'commander';
import { WAHAPEDIA_URLS, FACTION_SLUGS } from '../../scraper/config.js';
import { getDb, closeConnection } from '../../db/connection.js';
import * as schema from '../../db/schema.js';
import { eq } from 'drizzle-orm';

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

    process.stdout.write(`\r  Validated ${results.length}/${urls.length} URLs...`);
  }

  console.log('');
  return results;
}

type ScrapeTarget = 'core' | 'factions' | 'units' | 'all';

async function runValidation(options: { target?: ScrapeTarget; faction?: string }): Promise<void> {
  const db = getDb();
  const { target = 'all', faction: singleFaction } = options;

  try {
    console.log('=== URL Validation ===\n');

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

    // Units
    if (target === 'units' || target === 'all') {
      for (const { id: factionId, slug: factionSlug } of factionsToProcess) {
        const indexedUnits = factionId > 0
          ? await db
              .select({ name: schema.unitIndex.name, slug: schema.unitIndex.slug })
              .from(schema.unitIndex)
              .where(eq(schema.unitIndex.factionId, factionId))
          : [];

        if (indexedUnits.length > 0) {
          for (const { slug } of indexedUnits) {
            urls.push({
              category: `Unit: ${factionSlug}`,
              url: WAHAPEDIA_URLS.unitDatasheet(factionSlug, slug)
            });
          }
        } else {
          urls.push({ category: `Datasheets Index: ${factionSlug}`, url: WAHAPEDIA_URLS.datasheets(factionSlug) });
        }
      }
    }

    const realUrls = urls.filter(u => u.url && !u.url.startsWith('<'));

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
  } finally {
    await closeConnection();
  }
}

export const validateCommand = new Command('validate')
  .description('Validate Wahapedia URLs')
  .option('-t, --target <target>', 'Validation target: core, factions, units, all', 'all')
  .option('-f, --faction <slug>', 'Validate only a specific faction')
  .action(async (options) => {
    await runValidation(options);
  });
