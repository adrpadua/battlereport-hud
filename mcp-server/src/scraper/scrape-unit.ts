import 'dotenv/config';
import { FirecrawlClient } from './firecrawl-client.js';
import { WAHAPEDIA_URLS } from './config.js';
import { parseDatasheets } from './parsers/unit-parser.js';
import { getDb, closeConnection } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Scrape a single unit by faction and unit slug
 *
 * Usage:
 *   npx tsx src/scraper/scrape-unit.ts <faction-slug> <unit-slug>
 *   npx tsx src/scraper/scrape-unit.ts space-marines Intercessor-Squad
 *   npx tsx src/scraper/scrape-unit.ts tyranids Hive-Tyrant
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: npx tsx src/scraper/scrape-unit.ts <faction-slug> <unit-slug> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --force    Bypass cache and re-fetch from Wahapedia (uses API credits)');
    console.log('  --reparse  Re-parse cached data and update database (no API credits)');
    console.log('');
    console.log('Examples:');
    console.log('  npx tsx src/scraper/scrape-unit.ts space-marines Intercessor-Squad');
    console.log('  npx tsx src/scraper/scrape-unit.ts tyranids Hive-Tyrant --reparse');
    console.log('  npx tsx src/scraper/scrape-unit.ts astra-militarum Leman-Russ-Battle-Tank --force');
    console.log('');
    console.log('Note: Unit slug should match Wahapedia URL format (capitalized with hyphens)');
    process.exit(1);
  }

  const factionSlug = args[0]!;
  const unitSlug = args[1]!;
  const forceRefresh = args.includes('--force');
  const reparseOnly = args.includes('--reparse'); // Use cache, but re-parse and update DB

  const client = new FirecrawlClient();
  const db = getDb();

  try {
    // Get faction from database
    const [faction] = await db
      .select()
      .from(schema.factions)
      .where(eq(schema.factions.slug, factionSlug));

    if (!faction) {
      console.error(`Faction "${factionSlug}" not found in database.`);
      console.log('\nAvailable factions:');
      const factions = await db.select({ slug: schema.factions.slug, name: schema.factions.name }).from(schema.factions);
      factions.forEach(f => console.log(`  ${f.slug} - ${f.name}`));
      process.exit(1);
    }

    console.log(`Scraping unit: ${unitSlug} from ${faction.name}`);

    // Build URL
    const unitUrl = WAHAPEDIA_URLS.unitDatasheet(factionSlug, unitSlug);
    console.log(`URL: ${unitUrl}`);

    // Scrape the unit page (use cache if --reparse, bypass cache only if --force)
    const result = await client.scrape(unitUrl, {
      includeHtml: true,
      forceRefresh: forceRefresh && !reparseOnly // --reparse uses cache
    });

    if (!result.html && !result.markdown) {
      console.error('Failed to fetch unit page');
      process.exit(1);
    }

    // Parse the unit data
    const units = parseDatasheets(result.html || result.markdown, result.url);

    if (units.length === 0) {
      console.error('Failed to parse unit data from page');
      process.exit(1);
    }

    const { unit, weapons, abilities } = units[0]!;

    console.log(`\nParsed: ${unit.name}`);
    console.log(`  Movement: ${unit.movement}`);
    console.log(`  Toughness: ${unit.toughness}`);
    console.log(`  Save: ${unit.save}`);
    console.log(`  Invulnerable: ${unit.invulnerableSave || 'None'}`);
    console.log(`  Wounds: ${unit.wounds}`);
    console.log(`  Weapons: ${weapons.length}`);
    console.log(`  Abilities: ${abilities.length}`);

    // Check if unit already exists
    const existingUnit = await db
      .select()
      .from(schema.units)
      .where(and(
        eq(schema.units.slug, unit.slug),
        eq(schema.units.factionId, faction.id)
      ));

    if (existingUnit.length > 0 && !forceRefresh && !reparseOnly) {
      console.log(`\nUnit already exists in database. Use --force to overwrite or --reparse to re-parse cached data.`);
      process.exit(0);
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

    // Clear existing weapon/ability links if updating
    if (existingUnit.length > 0) {
      await db.delete(schema.unitWeapons).where(eq(schema.unitWeapons.unitId, unitId));
      await db.delete(schema.unitAbilities).where(eq(schema.unitAbilities.unitId, unitId));
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
        wahapediaUrl: unitUrl,
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

    console.log(`\n✅ Successfully saved ${unit.name} to database`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

main();
