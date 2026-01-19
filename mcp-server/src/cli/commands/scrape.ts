import { Command } from 'commander';
import { FirecrawlClient } from '../../scraper/firecrawl-client.js';
import { WAHAPEDIA_URLS, FACTION_SLUGS } from '../../scraper/config.js';
import { parseCoreRules } from '../../scraper/parsers/core-rules-parser.js';
import { parseFactionPage, parseDetachments, parseStratagems, parseEnhancements } from '../../scraper/parsers/faction-parser.js';
import { parseDatasheets } from '../../scraper/parsers/unit-parser.js';
import { getDb, closeConnection } from '../../db/connection.js';
import * as schema from '../../db/schema.js';
import { eq } from 'drizzle-orm';

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

function extractFactionName(markdown: string): string | null {
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  if (h1Match?.[1]) {
    return h1Match[1].trim();
  }
  return null;
}

async function scrapeCoreRules(client: FirecrawlClient, db: ReturnType<typeof getDb>): Promise<void> {
  console.log('\n=== Scraping Core Rules ===');

  const result = await client.scrape(WAHAPEDIA_URLS.rules.core);
  const rules = parseCoreRules(result.markdown, result.url);

  console.log(`Parsed ${rules.length} core rule sections`);

  await db.insert(schema.scrapeLog).values({
    url: result.url,
    scrapeType: 'core_rules',
    status: 'success',
    contentHash: result.contentHash,
  });

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

async function scrapeFactions(client: FirecrawlClient, db: ReturnType<typeof getDb>, singleFaction: string | null = null): Promise<void> {
  console.log('\n=== Scraping Factions ===');

  const factionsToProcess = singleFaction ? [singleFaction] : FACTION_SLUGS;

  for (const factionSlug of factionsToProcess) {
    console.log(`\n--- Processing faction: ${factionSlug} ---`);

    try {
      const factionUrl = WAHAPEDIA_URLS.factionBase(factionSlug);
      const factionResult = await client.scrape(factionUrl);

      const factionName = extractFactionName(factionResult.markdown) || factionSlug;
      const faction = parseFactionPage(factionResult.markdown, factionSlug, factionName, factionResult.url);

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

      await db.insert(schema.scrapeLog).values({
        url: factionResult.url,
        scrapeType: 'faction',
        status: 'success',
        contentHash: factionResult.contentHash,
      });

      const detachments = parseDetachments(factionResult.markdown, factionResult.url);
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

        const enhancements = parseEnhancements(factionResult.markdown, factionResult.url);
        for (const enhancement of enhancements) {
          await db
            .insert(schema.enhancements)
            .values({ ...enhancement, detachmentId })
            .onConflictDoNothing();
        }
      }

      const stratagems = parseStratagems(factionResult.markdown, factionResult.url);
      console.log(`  Found ${stratagems.length} stratagems`);

      for (const stratagem of stratagems) {
        await db
          .insert(schema.stratagems)
          .values({ ...stratagem, factionId })
          .onConflictDoNothing();
      }
    } catch (error) {
      console.error(`Failed to scrape faction ${factionSlug}:`, error);

      await db.insert(schema.scrapeLog).values({
        url: WAHAPEDIA_URLS.factionBase(factionSlug),
        scrapeType: 'faction',
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

async function scrapeUnits(client: FirecrawlClient, db: ReturnType<typeof getDb>, singleFaction: string | null = null, refreshIndex: boolean = false): Promise<void> {
  console.log('\n=== Scraping Units ===');

  let factions;
  if (singleFaction) {
    factions = await db.select().from(schema.factions).where(eq(schema.factions.slug, singleFaction));
    if (factions.length === 0) {
      console.error(`Faction "${singleFaction}" not found in database. Run faction scrape first.`);
      return;
    }
  } else {
    factions = await db.select().from(schema.factions);
  }

  for (const faction of factions) {
    console.log(`\n--- Scraping units for: ${faction.name} ---`);

    try {
      const indexUrl = WAHAPEDIA_URLS.datasheets(faction.slug);

      const existingUnits = await db
        .select()
        .from(schema.unitIndex)
        .where(eq(schema.unitIndex.factionId, faction.id));

      let unitLinks: { name: string; slug: string }[];

      if (existingUnits.length > 0 && !refreshIndex) {
        console.log(`  Using indexed unit list (${existingUnits.length} units)`);
        unitLinks = existingUnits.map(u => ({ name: u.name, slug: u.slug }));
      } else {
        console.log(`  Fetching datasheets index${refreshIndex ? ' (refresh requested)' : ''}...`);
        const indexResult = await client.scrape(indexUrl);

        unitLinks = extractUnitLinksFromTOC(indexResult.markdown);
        console.log(`  Found ${unitLinks.length} unit links in TOC`);

        for (const { name, slug } of unitLinks) {
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
        console.log(`  Indexed ${unitLinks.length} units in database`);

        await db.insert(schema.scrapeLog).values({
          url: indexUrl,
          scrapeType: 'unit_index',
          status: 'success',
          contentHash: indexResult.contentHash,
        });
      }

      let successCount = 0;
      let failedCount = 0;

      for (const { name, slug } of unitLinks) {
        try {
          const unitUrl = WAHAPEDIA_URLS.unitDatasheet(faction.slug, slug);
          console.log(`    Scraping: ${name}`);
          const unitResult = await client.scrape(unitUrl);

          const units = parseDatasheets(unitResult.markdown, unitResult.url);
          if (units.length === 0) {
            console.log(`      No unit data parsed, skipping`);
            await db
              .update(schema.unitIndex)
              .set({ scrapeStatus: 'failed', lastScrapedAt: new Date() })
              .where(eq(schema.unitIndex.slug, slug));
            failedCount++;
            continue;
          }

          const { unit, weapons, abilities } = units[0]!;

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

          await db
            .update(schema.unitIndex)
            .set({ scrapeStatus: 'success', lastScrapedAt: new Date() })
            .where(eq(schema.unitIndex.slug, slug));

          successCount++;
        } catch (unitError) {
          console.error(`      Failed to scrape unit ${name}:`, unitError instanceof Error ? unitError.message : unitError);

          await db
            .update(schema.unitIndex)
            .set({ scrapeStatus: 'failed', lastScrapedAt: new Date() })
            .where(eq(schema.unitIndex.slug, slug));

          failedCount++;
        }
      }

      console.log(`  Successfully scraped ${successCount}/${unitLinks.length} units (${failedCount} failed)`);
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

async function runScrape(options: { target?: ScrapeTarget; faction?: string; refreshIndex?: boolean }): Promise<void> {
  const { target = 'all', faction: singleFaction, refreshIndex = false } = options;

  if (singleFaction) {
    console.log(`Starting Wahapedia scraper for faction: ${singleFaction}`);
  } else {
    console.log(`Starting Wahapedia scraper with target: ${target}`);
  }

  const client = new FirecrawlClient();
  const db = getDb();

  try {
    if ((target === 'core' || target === 'all') && !singleFaction) {
      await scrapeCoreRules(client, db);
    }

    if (target === 'factions' || target === 'all' || (singleFaction && target !== 'units')) {
      await scrapeFactions(client, db, singleFaction);
    }

    if (target === 'units' || target === 'all') {
      await scrapeUnits(client, db, singleFaction, refreshIndex);
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

export const scrapeCommand = new Command('scrape')
  .description('Scrape Wahapedia data')
  .option('-t, --target <target>', 'Scrape target: core, factions, units, all', 'all')
  .option('-f, --faction <slug>', 'Scrape only a specific faction')
  .option('--refresh-index', 'Refresh unit index before scraping')
  .action(async (options) => {
    await runScrape(options);
  });

scrapeCommand
  .command('core')
  .description('Scrape core rules only')
  .action(async () => {
    await runScrape({ target: 'core' });
  });

scrapeCommand
  .command('factions')
  .description('Scrape factions only')
  .option('-f, --faction <slug>', 'Scrape only a specific faction')
  .action(async (options) => {
    await runScrape({ target: 'factions', faction: options.faction });
  });

scrapeCommand
  .command('units')
  .description('Scrape units only')
  .option('-f, --faction <slug>', 'Scrape only a specific faction')
  .option('--refresh-index', 'Refresh unit index before scraping')
  .action(async (options) => {
    await runScrape({ target: 'units', faction: options.faction, refreshIndex: options.refreshIndex });
  });
