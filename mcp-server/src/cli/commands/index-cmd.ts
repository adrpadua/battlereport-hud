import { Command } from 'commander';
import { getDb, closeConnection } from '../../db/connection.js';
import { WAHAPEDIA_URLS } from '../../scraper/config.js';
import { FirecrawlClient } from '../../scraper/firecrawl-client.js';
import * as schema from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

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

async function showIndexStatus(): Promise<void> {
  const db = getDb();

  try {
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
  } finally {
    await closeConnection();
  }
}

async function buildIndex(options: { faction?: string; force?: boolean }): Promise<void> {
  const db = getDb();
  const { faction: singleFaction, force } = options;

  try {
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
      const existingCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.unitIndex)
        .where(eq(schema.unitIndex.factionId, faction.id));

      if (existingCount[0]!.count > 0 && !force) {
        console.log(`  ${faction.slug}: already indexed (${existingCount[0]!.count} units)`);
        continue;
      }

      console.log(`  ${faction.slug}: fetching datasheets index...`);
      try {
        const indexUrl = WAHAPEDIA_URLS.datasheets(faction.slug);
        const result = await client.scrape(indexUrl);
        const units = extractUnitLinksFromTOC(result.markdown);

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

    console.log('\nDone. Run `wh40k index` to see indexed factions.');
  } finally {
    await closeConnection();
  }
}

export const indexCommand = new Command('index')
  .description('Show unit index status')
  .action(async () => {
    await showIndexStatus();
  });

indexCommand
  .command('build')
  .description('Build unit index by fetching datasheets')
  .option('-f, --faction <slug>', 'Build index for a specific faction only')
  .option('--force', 'Force rebuild even if index exists')
  .action(async (options) => {
    await buildIndex(options);
  });
