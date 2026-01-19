import 'dotenv/config';
import { FirecrawlClient } from './firecrawl-client.js';
import { WAHAPEDIA_URLS, FACTION_SLUGS } from './config.js';
import { parseCoreRules } from './parsers/core-rules-parser.js';
import { parseFactionIndex, parseFactionPage, parseDetachments, parseStratagems, parseEnhancements } from './parsers/faction-parser.js';
import { parseDatasheets } from './parsers/unit-parser.js';
import { getDb, closeConnection } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';

type ScrapeTarget = 'core' | 'factions' | 'units' | 'all';

async function main() {
  const args = process.argv.slice(2);
  const targetIndex = args.indexOf('--target');
  const target: ScrapeTarget = (targetIndex >= 0 ? args[targetIndex + 1] : 'all') as ScrapeTarget;

  console.log(`Starting Wahapedia scraper with target: ${target}`);

  const client = new FirecrawlClient();
  const db = getDb();

  try {
    if (target === 'core' || target === 'all') {
      await scrapeCoreRules(client, db);
    }

    if (target === 'factions' || target === 'all') {
      await scrapeFactions(client, db);
    }

    if (target === 'units' || target === 'all') {
      await scrapeUnits(client, db);
    }

    console.log('\nScraping completed!');
    console.log('Stats:', client.getStats());
  } catch (error) {
    console.error('Scraping failed:', error);
    throw error;
  } finally {
    await closeConnection();
  }
}

async function scrapeCoreRules(client: FirecrawlClient, db: ReturnType<typeof getDb>) {
  console.log('\n=== Scraping Core Rules ===');

  const result = await client.scrape(WAHAPEDIA_URLS.coreRules);
  const rules = parseCoreRules(result.markdown, result.url);

  console.log(`Parsed ${rules.length} core rule sections`);

  // Log scrape
  await db.insert(schema.scrapeLog).values({
    url: result.url,
    scrapeType: 'core_rules',
    status: 'success',
    contentHash: result.contentHash,
  });

  // Upsert rules
  for (const rule of rules) {
    await db
      .insert(schema.coreRules)
      .values(rule)
      .onConflictDoUpdate({
        target: schema.coreRules.slug,
        set: {
          title: rule.title,
          category: rule.category,
          subcategory: rule.subcategory,
          content: rule.content,
          orderIndex: rule.orderIndex,
          updatedAt: new Date(),
        },
      });
  }

  console.log(`Saved ${rules.length} core rules to database`);
}

async function scrapeFactions(client: FirecrawlClient, db: ReturnType<typeof getDb>) {
  console.log('\n=== Scraping Factions ===');

  // First, scrape the faction index
  const indexResult = await client.scrape(WAHAPEDIA_URLS.factionIndex);
  const factionList = parseFactionIndex(indexResult.markdown, indexResult.url);

  console.log(`Found ${factionList.length} factions in index`);

  // Log index scrape
  await db.insert(schema.scrapeLog).values({
    url: indexResult.url,
    scrapeType: 'faction_index',
    status: 'success',
    contentHash: indexResult.contentHash,
  });

  // Process each known faction
  for (const factionSlug of FACTION_SLUGS) {
    console.log(`\n--- Processing faction: ${factionSlug} ---`);

    try {
      // Scrape faction main page
      const factionUrl = WAHAPEDIA_URLS.factionBase(factionSlug);
      const factionResult = await client.scrape(factionUrl);

      // Find faction name from our list or markdown
      const knownFaction = factionList.find((f) => f.slug === factionSlug);
      const factionName = knownFaction?.name || extractFactionName(factionResult.markdown) || factionSlug;

      const faction = parseFactionPage(factionResult.markdown, factionSlug, factionName, factionResult.url);

      // Insert/update faction
      const [insertedFaction] = await db
        .insert(schema.factions)
        .values(faction)
        .onConflictDoUpdate({
          target: schema.factions.slug,
          set: {
            name: faction.name,
            armyRules: faction.armyRules,
            lore: faction.lore,
            wahapediaPath: faction.wahapediaPath,
            sourceUrl: faction.sourceUrl,
            updatedAt: new Date(),
          },
        })
        .returning();

      const factionId = insertedFaction!.id;

      // Log faction scrape
      await db.insert(schema.scrapeLog).values({
        url: factionResult.url,
        scrapeType: 'faction',
        status: 'success',
        contentHash: factionResult.contentHash,
      });

      // Scrape detachments
      await scrapeDetachmentsForFaction(client, db, factionSlug, factionId);

      // Scrape stratagems
      await scrapeStratagemsForFaction(client, db, factionSlug, factionId);
    } catch (error) {
      console.error(`Failed to scrape faction ${factionSlug}:`, error);

      // Log failure
      await db.insert(schema.scrapeLog).values({
        url: WAHAPEDIA_URLS.factionBase(factionSlug),
        scrapeType: 'faction',
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

async function scrapeDetachmentsForFaction(
  client: FirecrawlClient,
  db: ReturnType<typeof getDb>,
  factionSlug: string,
  factionId: number
) {
  try {
    const url = WAHAPEDIA_URLS.detachments(factionSlug);
    const result = await client.scrape(url);

    const detachments = parseDetachments(result.markdown, result.url);
    console.log(`  Found ${detachments.length} detachments`);

    for (const detachment of detachments) {
      const [insertedDetachment] = await db
        .insert(schema.detachments)
        .values({ ...detachment, factionId })
        .onConflictDoUpdate({
          target: [schema.detachments.slug, schema.detachments.factionId],
          set: {
            name: detachment.name,
            detachmentRule: detachment.detachmentRule,
            detachmentRuleName: detachment.detachmentRuleName,
            lore: detachment.lore,
            sourceUrl: detachment.sourceUrl,
            updatedAt: new Date(),
          },
        })
        .returning();

      const detachmentId = insertedDetachment!.id;

      // Parse enhancements from the same content
      const enhancements = parseEnhancements(result.markdown, result.url);
      for (const enhancement of enhancements) {
        await db
          .insert(schema.enhancements)
          .values({ ...enhancement, detachmentId })
          .onConflictDoNothing();
      }
    }

    // Log scrape
    await db.insert(schema.scrapeLog).values({
      url,
      scrapeType: 'detachments',
      status: 'success',
      contentHash: result.contentHash,
    });
  } catch (error) {
    console.error(`  Failed to scrape detachments for ${factionSlug}:`, error);
  }
}

async function scrapeStratagemsForFaction(
  client: FirecrawlClient,
  db: ReturnType<typeof getDb>,
  factionSlug: string,
  factionId: number
) {
  try {
    const url = WAHAPEDIA_URLS.stratagems(factionSlug);
    const result = await client.scrape(url);

    const stratagems = parseStratagems(result.markdown, result.url);
    console.log(`  Found ${stratagems.length} stratagems`);

    for (const stratagem of stratagems) {
      await db
        .insert(schema.stratagems)
        .values({ ...stratagem, factionId })
        .onConflictDoNothing();
    }

    // Log scrape
    await db.insert(schema.scrapeLog).values({
      url,
      scrapeType: 'stratagems',
      status: 'success',
      contentHash: result.contentHash,
    });
  } catch (error) {
    console.error(`  Failed to scrape stratagems for ${factionSlug}:`, error);
  }
}

async function scrapeUnits(client: FirecrawlClient, db: ReturnType<typeof getDb>) {
  console.log('\n=== Scraping Units ===');

  // Get all factions from database
  const factions = await db.select().from(schema.factions);

  for (const faction of factions) {
    console.log(`\n--- Scraping units for: ${faction.name} ---`);

    try {
      const url = WAHAPEDIA_URLS.datasheets(faction.slug);
      const result = await client.scrape(url);

      const units = parseDatasheets(result.markdown, result.url);
      console.log(`  Found ${units.length} units`);

      for (const { unit, weapons, abilities } of units) {
        // Insert unit
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
      }

      // Log scrape
      await db.insert(schema.scrapeLog).values({
        url,
        scrapeType: 'units',
        status: 'success',
        contentHash: result.contentHash,
      });
    } catch (error) {
      console.error(`  Failed to scrape units for ${faction.slug}:`, error);

      await db.insert(schema.scrapeLog).values({
        url: WAHAPEDIA_URLS.datasheets(faction.slug),
        scrapeType: 'units',
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

function extractFactionName(markdown: string): string | null {
  // Try to find faction name from h1 header
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  if (h1Match?.[1]) {
    return h1Match[1].trim();
  }
  return null;
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
