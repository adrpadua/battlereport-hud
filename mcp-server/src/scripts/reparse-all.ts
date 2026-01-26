import 'dotenv/config';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parseDatasheets } from '../scraper/parsers/unit-parser.js';
import { getDb, closeConnection } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ScrapeResult } from '../scraper/firecrawl-client.js';
import { saveUnitKeywords } from '../scraper/save-keywords.js';

interface ReparseOptions {
  dryRun: boolean;
  faction?: string;
  verbose: boolean;
}

interface ReparseStats {
  totalCacheFiles: number;
  unitDatasheets: number;
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ url: string; error: string }>;
}

function parseArgs(): ReparseOptions {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    faction: args.find((_, i, arr) => arr[i - 1] === '--faction'),
    verbose: args.includes('--verbose') || args.includes('-v'),
  };
}

function printUsage(): void {
  console.log(`
Usage: npx tsx src/scripts/reparse-all.ts [options]

Re-parse all cached unit datasheets and update the database.
Does NOT make any API calls - only uses existing cached data.

Options:
  --dry-run     Preview changes without updating the database
  --faction     Only reparse units from a specific faction (e.g., --faction tyranids)
  --verbose, -v Show detailed output for each unit

Examples:
  npx tsx src/scripts/reparse-all.ts --dry-run
  npx tsx src/scripts/reparse-all.ts --faction space-marines
  npx tsx src/scripts/reparse-all.ts --faction tyranids --verbose
`);
}

function isUnitDatasheetUrl(url: string): boolean {
  // Unit datasheets have format: /wh40k10ed/factions/{faction}/{unit-name}
  // Exclude faction main pages and datasheet listing pages
  const match = url.match(/\/wh40k10ed\/factions\/([^/]+)\/([^/]+)\/?$/);
  if (!match) return false;

  const [, , unitPart] = match;
  // Exclude known non-unit pages
  const excludedPages = ['datasheets', 'legends', ''];
  return !excludedPages.includes(unitPart?.toLowerCase() || '');
}

function extractFactionFromUrl(url: string): string | null {
  const match = url.match(/\/wh40k10ed\/factions\/([^/]+)\//);
  return match?.[1] || null;
}

async function loadCachedDatasheets(cacheDir: string, factionFilter?: string): Promise<ScrapeResult[]> {
  const files = readdirSync(cacheDir).filter(f => f.endsWith('.json'));
  const datasheets: ScrapeResult[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(cacheDir, file), 'utf-8');
      const cached = JSON.parse(content) as ScrapeResult;

      if (!isUnitDatasheetUrl(cached.url)) continue;

      if (factionFilter) {
        const faction = extractFactionFromUrl(cached.url);
        if (faction !== factionFilter) continue;
      }

      datasheets.push(cached);
    } catch {
      // Skip invalid cache files
    }
  }

  return datasheets;
}

async function reparseUnit(
  db: ReturnType<typeof getDb>,
  cached: ScrapeResult,
  options: ReparseOptions
): Promise<{ success: boolean; action: 'updated' | 'skipped' | 'failed'; error?: string }> {
  const factionSlug = extractFactionFromUrl(cached.url);
  if (!factionSlug) {
    return { success: false, action: 'failed', error: 'Could not extract faction from URL' };
  }

  // Get faction from database
  const [faction] = await db
    .select()
    .from(schema.factions)
    .where(eq(schema.factions.slug, factionSlug));

  if (!faction) {
    return { success: false, action: 'skipped', error: `Faction "${factionSlug}" not in database` };
  }

  // Parse the cached content
  const content = cached.html || cached.markdown;
  if (!content) {
    return { success: false, action: 'failed', error: 'No HTML or markdown content in cache' };
  }

  const units = parseDatasheets(content, cached.url);
  if (units.length === 0) {
    return { success: false, action: 'failed', error: 'Parser returned no units' };
  }

  const { unit, weapons, abilities, keywords } = units[0]!;

  if (options.verbose) {
    console.log(`  Parsed: ${unit.name}`);
    console.log(`    Movement: ${unit.movement}, T: ${unit.toughness}, Sv: ${unit.save}, W: ${unit.wounds}`);
    console.log(`    Weapons: ${weapons.length}, Abilities: ${abilities.length}, Keywords: ${keywords.length}`);
  }

  if (options.dryRun) {
    return { success: true, action: 'updated' };
  }

  // Insert or update unit
  const [insertedUnit] = await db
    .insert(schema.units)
    .values({ ...unit, factionId: faction.id })
    .onConflictDoUpdate({
      target: [schema.units.slug, schema.units.factionId],
      set: {
        name: unit.name,
        movement: unit.movement,
        toughness: unit.toughness,
        save: unit.save,
        invulnerableSave: unit.invulnerableSave,
        wounds: unit.wounds,
        leadership: unit.leadership,
        objectiveControl: unit.objectiveControl,
        pointsCost: unit.pointsCost,
        unitComposition: unit.unitComposition,
        wargearOptions: unit.wargearOptions,
        leaderInfo: unit.leaderInfo,
        ledBy: unit.ledBy,
        transportCapacity: unit.transportCapacity,
        isEpicHero: unit.isEpicHero,
        isBattleline: unit.isBattleline,
        isDedicatedTransport: unit.isDedicatedTransport,
        legends: unit.legends,
        sourceUrl: unit.sourceUrl,
        updatedAt: new Date(),
      },
    })
    .returning();

  const unitId = insertedUnit!.id;

  // Clear existing weapon/ability/keyword links
  await db.delete(schema.unitWeapons).where(eq(schema.unitWeapons.unitId, unitId));
  await db.delete(schema.unitAbilities).where(eq(schema.unitAbilities.unitId, unitId));
  await db.delete(schema.unitKeywords).where(eq(schema.unitKeywords.unitId, unitId));

  // Save keywords
  if (keywords && keywords.length > 0) {
    await saveUnitKeywords(db, unitId, keywords);
  }

  // Insert weapons
  for (const weapon of weapons) {
    const [insertedWeapon] = await db
      .insert(schema.weapons)
      .values(weapon)
      .onConflictDoNothing()
      .returning();

    if (insertedWeapon) {
      await db
        .insert(schema.unitWeapons)
        .values({ unitId, weaponId: insertedWeapon.id })
        .onConflictDoNothing();
    }
  }

  // Insert abilities
  for (const ability of abilities) {
    const [insertedAbility] = await db
      .insert(schema.abilities)
      .values({ ...ability, factionId: faction.id })
      .onConflictDoNothing()
      .returning();

    if (insertedAbility) {
      await db
        .insert(schema.unitAbilities)
        .values({ unitId, abilityId: insertedAbility.id })
        .onConflictDoNothing();
    }
  }

  // Update unit_index
  await db
    .insert(schema.unitIndex)
    .values({
      factionId: faction.id,
      slug: unit.slug,
      name: unit.name,
      wahapediaUrl: cached.url,
      scrapeStatus: 'success',
      lastScrapedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.unitIndex.factionId, schema.unitIndex.slug],
      set: {
        scrapeStatus: 'success',
        lastScrapedAt: new Date(),
      },
    });

  return { success: true, action: 'updated' };
}

async function main(): Promise<void> {
  const options = parseArgs();

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const cacheDir = process.env.CACHE_DIR || './.scrape-cache';

  console.log('=== Reparse All Cached Unit Datasheets ===\n');
  console.log(`Cache directory: ${cacheDir}`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  if (options.faction) {
    console.log(`Faction filter: ${options.faction}`);
  }
  console.log('');

  // Load cached datasheets
  console.log('Loading cached datasheets...');
  const datasheets = await loadCachedDatasheets(cacheDir, options.faction);

  const stats: ReparseStats = {
    totalCacheFiles: readdirSync(cacheDir).filter(f => f.endsWith('.json')).length,
    unitDatasheets: datasheets.length,
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  console.log(`Found ${stats.totalCacheFiles} total cache files`);
  console.log(`Found ${stats.unitDatasheets} unit datasheets to reparse\n`);

  if (datasheets.length === 0) {
    console.log('No unit datasheets found in cache.');
    if (options.faction) {
      console.log(`Try running without --faction filter, or check if faction "${options.faction}" has cached data.`);
    }
    process.exit(0);
  }

  const db = getDb();

  // Group by faction for organized output
  const byFaction = new Map<string, ScrapeResult[]>();
  for (const ds of datasheets) {
    const faction = extractFactionFromUrl(ds.url) || 'unknown';
    if (!byFaction.has(faction)) byFaction.set(faction, []);
    byFaction.get(faction)!.push(ds);
  }

  for (const [factionSlug, factionDatasheets] of byFaction) {
    console.log(`\n--- ${factionSlug} (${factionDatasheets.length} units) ---`);

    for (const cached of factionDatasheets) {
      const unitSlug = cached.url.split('/').pop() || 'unknown';
      process.stdout.write(`  ${unitSlug}... `);

      try {
        const result = await reparseUnit(db, cached, options);
        stats.processed++;

        if (result.action === 'updated') {
          stats.updated++;
          console.log(options.dryRun ? 'would update' : 'updated');
        } else if (result.action === 'skipped') {
          stats.skipped++;
          console.log(`skipped: ${result.error}`);
        } else {
          stats.failed++;
          console.log(`failed: ${result.error}`);
          stats.errors.push({ url: cached.url, error: result.error || 'Unknown error' });
        }
      } catch (error) {
        stats.failed++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`error: ${errorMsg}`);
        stats.errors.push({ url: cached.url, error: errorMsg });
      }
    }
  }

  // Print summary
  console.log('\n=== Summary ===');
  console.log(`Total cache files:   ${stats.totalCacheFiles}`);
  console.log(`Unit datasheets:     ${stats.unitDatasheets}`);
  console.log(`Processed:           ${stats.processed}`);
  console.log(`Updated:             ${stats.updated}${options.dryRun ? ' (would update)' : ''}`);
  console.log(`Skipped:             ${stats.skipped}`);
  console.log(`Failed:              ${stats.failed}`);

  if (stats.errors.length > 0 && options.verbose) {
    console.log('\n=== Errors ===');
    for (const { url, error } of stats.errors) {
      console.log(`  ${url}`);
      console.log(`    ${error}`);
    }
  }

  if (options.dryRun) {
    console.log('\n[DRY RUN] No changes were made. Remove --dry-run to apply changes.');
  }

  await closeConnection();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
