import 'dotenv/config';
import { FirecrawlClient } from './firecrawl-client.js';
import { WAHAPEDIA_URLS, FACTION_SLUGS, SPACE_MARINE_CHAPTER_SLUGS } from './config.js';
import { parseCoreRules } from './parsers/core-rules-parser.js';
import { parseFactionPage, parseDetachments, parseStratagemsByDetachment, parseEnhancementsByDetachment } from './parsers/faction-parser.js';
import { parseDatasheets } from './parsers/unit-parser.js';
import { extractUnitLinksFromTOC } from './parsers/toc-parser.js';
import { saveUnitKeywords } from './save-keywords.js';
import { getDb, closeConnection } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';

type ScrapeTarget = 'core' | 'factions' | 'units' | 'all';

async function main() {
  const args = process.argv.slice(2);
  const targetIndex = args.indexOf('--target');
  const target: ScrapeTarget = (targetIndex >= 0 ? args[targetIndex + 1] : 'all') as ScrapeTarget;

  // Optional: scrape only a specific faction
  const factionIndex = args.indexOf('--faction');
  const singleFaction = factionIndex >= 0 ? args[factionIndex + 1] : null;

  // Optional: refresh unit index (re-discover units from datasheets page)
  const refreshIndex = args.includes('--refresh-index');

  if (singleFaction) {
    console.log(`Starting Wahapedia scraper for faction: ${singleFaction}`);
  } else {
    console.log(`Starting Wahapedia scraper with target: ${target}`);
  }

  const client = new FirecrawlClient();
  const db = getDb();

  try {
    // Skip core rules when scraping a single faction
    if ((target === 'core' || target === 'all') && !singleFaction) {
      await scrapeCoreRules(client, db);
    }

    // Scrape faction page (skip if --target units with --faction)
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

async function scrapeCoreRules(client: FirecrawlClient, db: ReturnType<typeof getDb>) {
  console.log('\n=== Scraping Core Rules ===');

  const result = await client.scrape(WAHAPEDIA_URLS.rules.core);
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

async function scrapeFactions(client: FirecrawlClient, db: ReturnType<typeof getDb>, singleFaction: string | null = null) {
  console.log('\n=== Scraping Factions ===');

  // Process single faction or all known factions from FACTION_SLUGS
  const factionsToProcess = singleFaction ? [singleFaction] : FACTION_SLUGS;

  for (const factionSlug of factionsToProcess) {
    console.log(`\n--- Processing faction: ${factionSlug} ---`);

    try {
      // Scrape faction main page
      const factionUrl = WAHAPEDIA_URLS.factionBase(factionSlug);
      const factionResult = await client.scrape(factionUrl);

      // Use HTML for parsing since parsers use CSS selectors, fall back to markdown if not available
      const factionHtml = factionResult.html || factionResult.markdown;

      // Extract faction name from markdown (uses regex, not CSS selectors)
      const factionName = extractFactionName(factionResult.markdown) || factionSlug;

      const faction = parseFactionPage(factionHtml, factionSlug, factionName, factionResult.url);

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

      // Parse detachments from main faction page
      const detachments = parseDetachments(factionHtml, factionResult.url);
      console.log(`  Found ${detachments.length} detachments`);

      // Parse enhancements and stratagems grouped by detachment anchor name
      const enhancementsByDetachment = parseEnhancementsByDetachment(factionHtml, factionResult.url);
      const stratagemsByDetachment = parseStratagemsByDetachment(factionHtml, factionResult.url);

      let stratagemCount = 0;
      let enhancementCount = 0;

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

        // Find enhancements for this detachment (try exact match and anchor-name-style match)
        const detachmentAnchorName = detachment.name.replace(/\s+/g, '-');
        const enhancements = enhancementsByDetachment.get(detachment.name)
          || enhancementsByDetachment.get(detachmentAnchorName)
          || [];

        console.log(`    Found ${enhancements.length} enhancements for ${detachment.name}`);
        enhancementCount += enhancements.length;
        for (const enhancement of enhancements) {
          await db
            .insert(schema.enhancements)
            .values({ ...enhancement, detachmentId })
            .onConflictDoUpdate({
              target: [schema.enhancements.slug, schema.enhancements.detachmentId],
              set: {
                name: enhancement.name,
                pointsCost: enhancement.pointsCost,
                description: enhancement.description,
                restrictions: enhancement.restrictions,
                sourceUrl: enhancement.sourceUrl,
                updatedAt: new Date(),
              },
            });
        }

        // Find stratagems for this detachment
        const stratagems = stratagemsByDetachment.get(detachment.name)
          || stratagemsByDetachment.get(detachmentAnchorName)
          || [];

        console.log(`    Found ${stratagems.length} stratagems for ${detachment.name}`);
        stratagemCount += stratagems.length;
        for (const stratagem of stratagems) {
          await db
            .insert(schema.stratagems)
            .values({ ...stratagem, factionId, detachmentId })
            .onConflictDoUpdate({
              target: [schema.stratagems.slug, schema.stratagems.factionId],
              set: {
                detachmentId,
                name: stratagem.name,
                cpCost: stratagem.cpCost,
                phase: stratagem.phase,
                when: stratagem.when,
                target: stratagem.target,
                effect: stratagem.effect,
                restrictions: stratagem.restrictions,
                sourceUrl: stratagem.sourceUrl,
                updatedAt: new Date(),
              },
            });
        }
      }

      console.log(`  Total: ${enhancementCount} enhancements, ${stratagemCount} stratagems`);
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

/**
 * Scrape a Space Marine chapter subpage for chapter-specific detachments, stratagems, and enhancements.
 * Chapter content is stored under the parent "Space Marines" faction but with chapter-specific detachment names.
 */
export async function scrapeChapter(client: FirecrawlClient, db: ReturnType<typeof getDb>, chapterSlug: string) {
  console.log(`\n=== Scraping Space Marine Chapter: ${chapterSlug} ===`);

  // Verify the chapter slug is valid
  if (!SPACE_MARINE_CHAPTER_SLUGS.includes(chapterSlug as any)) {
    console.error(`Unknown chapter slug: ${chapterSlug}`);
    console.log('Valid chapters:', SPACE_MARINE_CHAPTER_SLUGS.join(', '));
    return;
  }

  // Get the parent Space Marines faction from database
  const [spaceMarine] = await db
    .select()
    .from(schema.factions)
    .where(eq(schema.factions.slug, 'space-marines'));

  if (!spaceMarine) {
    console.error('Space Marines faction not found. Run faction scrape first.');
    return;
  }

  const factionId = spaceMarine.id;

  try {
    // Scrape chapter subpage
    const chapterUrl = WAHAPEDIA_URLS.chapterPage(chapterSlug);
    console.log(`Fetching: ${chapterUrl}`);
    const chapterResult = await client.scrape(chapterUrl);

    const chapterHtml = chapterResult.html || chapterResult.markdown;

    // Parse detachments from chapter page
    const detachments = parseDetachments(chapterHtml, chapterResult.url);
    console.log(`  Found ${detachments.length} detachments`);

    // Parse enhancements and stratagems grouped by detachment
    const enhancementsByDetachment = parseEnhancementsByDetachment(chapterHtml, chapterResult.url);
    const stratagemsByDetachment = parseStratagemsByDetachment(chapterHtml, chapterResult.url);

    let stratagemCount = 0;
    let enhancementCount = 0;

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

      // Find enhancements for this detachment
      // Map keys use anchor name format (e.g., "Champions of Fenris" with spaces)
      // Try detachment.name first (same as scrapeFactions), then anchor-name format with hyphens
      const detachmentAnchorName = detachment.name.replace(/\s+/g, '-');
      const matchingEnhancements = enhancementsByDetachment.get(detachment.name) ||
        enhancementsByDetachment.get(detachmentAnchorName) ||
        [];

      for (const enhancement of matchingEnhancements) {
        enhancementCount++;
        await db
          .insert(schema.enhancements)
          .values({ ...enhancement, detachmentId })
          .onConflictDoUpdate({
            target: [schema.enhancements.slug, schema.enhancements.detachmentId],
            set: {
              name: enhancement.name,
              pointsCost: enhancement.pointsCost,
              description: enhancement.description,
              restrictions: enhancement.restrictions,
              sourceUrl: enhancement.sourceUrl,
              updatedAt: new Date(),
            },
          });
      }

      // Find stratagems for this detachment
      // Use same matching strategy as enhancements - name with spaces first, then anchor format
      const matchingStratagems = stratagemsByDetachment.get(detachment.name) ||
        stratagemsByDetachment.get(detachmentAnchorName) ||
        [];

      for (const stratagem of matchingStratagems) {
        stratagemCount++;
        await db
          .insert(schema.stratagems)
          .values({ ...stratagem, factionId, detachmentId })
          .onConflictDoUpdate({
            target: [schema.stratagems.slug, schema.stratagems.factionId],
            set: {
              detachmentId,
              name: stratagem.name,
              cpCost: stratagem.cpCost,
              phase: stratagem.phase,
              when: stratagem.when,
              target: stratagem.target,
              effect: stratagem.effect,
              restrictions: stratagem.restrictions,
              sourceUrl: stratagem.sourceUrl,
              updatedAt: new Date(),
            },
          });
      }
    }

    console.log(`  Total: ${enhancementCount} enhancements, ${stratagemCount} stratagems`);

    // Log chapter scrape
    await db.insert(schema.scrapeLog).values({
      url: chapterResult.url,
      scrapeType: 'chapter',
      status: 'success',
      contentHash: chapterResult.contentHash,
    });

    console.log(`\nChapter ${chapterSlug} scraping completed!`);
  } catch (error) {
    console.error(`Failed to scrape chapter ${chapterSlug}:`, error);

    await db.insert(schema.scrapeLog).values({
      url: WAHAPEDIA_URLS.chapterPage(chapterSlug),
      scrapeType: 'chapter',
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function scrapeUnits(client: FirecrawlClient, db: ReturnType<typeof getDb>, singleFaction: string | null = null, refreshIndex: boolean = false) {
  console.log('\n=== Scraping Units ===');

  // Get factions from database (filtered if single faction specified)
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

      // Check database for existing unit index
      const existingUnits = await db
        .select()
        .from(schema.unitIndex)
        .where(eq(schema.unitIndex.factionId, faction.id));

      let unitLinks: { name: string; slug: string }[];

      if (existingUnits.length > 0 && !refreshIndex) {
        console.log(`  Using indexed unit list (${existingUnits.length} units)`);
        unitLinks = existingUnits.map(u => ({ name: u.name, slug: u.slug }));
      } else {
        // Scrape datasheets index to discover units (use longer timeout for large pages)
        console.log(`  Fetching datasheets index${refreshIndex ? ' (refresh requested)' : ''}...`);
        const indexResult = await client.scrape(indexUrl, { timeout: 60000 });

        // Extract unit slugs from TOC links (use HTML to avoid Firecrawl markdown truncation)
        unitLinks = extractUnitLinksFromTOC(indexResult.html);
        console.log(`  Found ${unitLinks.length} unit links in TOC`);

        // Insert/update units in unit_index table
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

        // Log index scrape
        await db.insert(schema.scrapeLog).values({
          url: indexUrl,
          scrapeType: 'unit_index',
          status: 'success',
          contentHash: indexResult.contentHash,
        });
      }

      let successCount = 0;
      let failedCount = 0;

      // Scrape each individual unit page
      for (const { name, slug } of unitLinks) {
        try {
          const unitUrl = WAHAPEDIA_URLS.unitDatasheet(faction.slug, slug);
          console.log(`    Scraping: ${name}`);
          const unitResult = await client.scrape(unitUrl);

          // Use HTML parsing for better data quality (markdown has concatenation issues)
          const units = parseDatasheets(unitResult.html || unitResult.markdown, unitResult.url);
          if (units.length === 0) {
            console.log(`      No unit data parsed, skipping`);
            // Update unit_index status to failed
            await db
              .update(schema.unitIndex)
              .set({ scrapeStatus: 'failed', lastScrapedAt: new Date() })
              .where(eq(schema.unitIndex.slug, slug));
            failedCount++;
            continue;
          }

          // Use the first parsed unit (should only be one per page)
          const { unit, weapons, abilities, keywords } = units[0]!;

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

          // Insert keywords (e.g., INFANTRY, BLOOD ANGELS, IMPERIUM)
          if (keywords.length > 0) {
            await saveUnitKeywords(db, unitId, keywords);
          }

          // Update unit_index status to success
          await db
            .update(schema.unitIndex)
            .set({ scrapeStatus: 'success', lastScrapedAt: new Date() })
            .where(eq(schema.unitIndex.slug, slug));

          successCount++;
        } catch (unitError) {
          console.error(`      Failed to scrape unit ${name}:`, unitError instanceof Error ? unitError.message : unitError);

          // Update unit_index status to failed
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

function extractFactionName(markdown: string): string | null {
  // Try to find faction name from h1 header
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  if (h1Match?.[1]) {
    let name = h1Match[1].trim();

    // Clean up common scraping artifacts from Wahapedia
    // Remove filter UI elements like "[ No filter" or "\\[ No filter"
    name = name.replace(/\s*\[?\s*No filter.*$/i, '');
    name = name.replace(/\s*\\\[?\s*No filter.*$/i, '');

    // Remove any remaining brackets and content after them
    name = name.replace(/\s*[\[\(\\].*$/, '');

    // Trim and return
    return name.trim() || null;
  }
  return null;
}

// Only run main() when executed directly, not when imported as a module
// This prevents concurrent scrapes when scrape-chapter.ts imports scrapeChapter
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
