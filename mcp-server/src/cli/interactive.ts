import { select, confirm, checkbox } from '@inquirer/prompts';
import { getDb, closeConnection } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { sql, eq, inArray } from 'drizzle-orm';
import { FACTION_SLUGS } from '../scraper/config.js';

// Import action functions from command modules
import { FirecrawlClient } from '../scraper/firecrawl-client.js';
import { WAHAPEDIA_URLS } from '../scraper/config.js';
import { parseCoreRules } from '../scraper/parsers/core-rules-parser.js';
import { parseFactionPage, parseDetachments, parseStratagems, parseEnhancements } from '../scraper/parsers/faction-parser.js';
import { parseDatasheets } from '../scraper/parsers/unit-parser.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getPool } from '../db/connection.js';

type MenuAction = 'back' | 'exit' | (() => Promise<void>);

async function showStatus(): Promise<void> {
  const db = getDb();

  console.log('\n=== Database Status ===\n');

  const tables = [
    { name: 'factions', table: schema.factions },
    { name: 'units', table: schema.units },
    { name: 'detachments', table: schema.detachments },
    { name: 'stratagems', table: schema.stratagems },
    { name: 'core_rules', table: schema.coreRules },
  ];

  for (const { name, table } of tables) {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(table);
    console.log(`  ${name}: ${result[0]?.count ?? 0} rows`);
  }

  // Show index status
  const indexed = await db
    .select({
      name: schema.factions.name,
      unitCount: sql<number>`count(${schema.unitIndex.id})::int`,
      pendingCount: sql<number>`count(case when ${schema.unitIndex.scrapeStatus} = 'pending' then 1 end)::int`,
      successCount: sql<number>`count(case when ${schema.unitIndex.scrapeStatus} = 'success' then 1 end)::int`,
    })
    .from(schema.factions)
    .leftJoin(schema.unitIndex, eq(schema.factions.id, schema.unitIndex.factionId))
    .groupBy(schema.factions.id)
    .orderBy(schema.factions.name);

  const indexedFactions = indexed.filter(f => f.unitCount > 0);
  const totalUnits = indexed.reduce((acc, f) => acc + f.unitCount, 0);
  const scrapedUnits = indexed.reduce((acc, f) => acc + f.successCount, 0);

  console.log(`\n=== Unit Index ===\n`);
  console.log(`  Indexed factions: ${indexedFactions.length}/${indexed.length}`);
  console.log(`  Total units indexed: ${totalUnits}`);
  console.log(`  Units scraped: ${scrapedUnits}`);
  console.log('');
}

async function selectFactions(): Promise<string[]> {
  const db = getDb();

  // Get factions from DB
  const dbFactions = await db.select({ slug: schema.factions.slug, name: schema.factions.name })
    .from(schema.factions)
    .orderBy(schema.factions.name);

  if (dbFactions.length === 0) {
    console.log('\nNo factions in database. Using default faction list.\n');
    return FACTION_SLUGS as unknown as string[];
  }

  // Clean faction names (remove junk after the actual name)
  const cleanName = (name: string) => {
    // Remove everything after common patterns like "[ No filter" or "\["
    return name.replace(/\s*\[.*$/, '').replace(/\s*\\.*$/, '').trim();
  };

  const selected = await checkbox({
    message: 'Select factions (↑↓ navigate, SPACE to select, ENTER to confirm):',
    choices: [
      { name: '★ All factions', value: '__all__' },
      ...dbFactions.map(f => ({ name: cleanName(f.name), value: f.slug })),
    ],
    pageSize: 15,
    required: true,
    validate: (items) => {
      if (items.length === 0) {
        return 'Please select at least one faction (press SPACE to select)';
      }
      return true;
    },
  });

  if (selected.includes('__all__')) {
    return dbFactions.map(f => f.slug);
  }

  return selected;
}

async function scrapeCoreRules(): Promise<void> {
  console.log('\n=== Scraping Core Rules ===\n');

  const client = new FirecrawlClient();
  const db = getDb();

  const result = await client.scrape(WAHAPEDIA_URLS.rules.core);
  const rules = parseCoreRules(result.markdown, result.url);

  console.log(`Parsed ${rules.length} core rule sections`);

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

  console.log(`Saved ${rules.length} core rules to database\n`);
  console.log('Stats:', client.getStats());
}

async function scrapeFactions(factionSlugs: string[]): Promise<void> {
  console.log('\n=== Scraping Factions ===\n');

  const client = new FirecrawlClient();
  const db = getDb();

  for (const factionSlug of factionSlugs) {
    console.log(`Processing: ${factionSlug}`);

    try {
      const factionUrl = WAHAPEDIA_URLS.factionBase(factionSlug);
      const factionResult = await client.scrape(factionUrl);

      const h1Match = factionResult.markdown.match(/^#\s+(.+)$/m);
      const rawName = h1Match?.[1]?.trim() || factionSlug;
      // Clean the name - remove filter UI junk like "\[ Chapter: No filter..."
      const factionName = rawName
        .replace(/\s*\\?\[.*$/, '')
        .replace(/\s{2,}.*$/, '')
        .trim() || rawName.substring(0, 100);
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
          await db.insert(schema.enhancements).values({ ...enhancement, detachmentId }).onConflictDoNothing();
        }
      }

      const stratagems = parseStratagems(factionResult.markdown, factionResult.url);
      console.log(`  Found ${stratagems.length} stratagems`);

      for (const stratagem of stratagems) {
        await db.insert(schema.stratagems).values({ ...stratagem, factionId }).onConflictDoNothing();
      }
    } catch (error) {
      console.error(`  Failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log('\nFaction scraping complete!');
  console.log('Stats:', client.getStats());
}

async function buildUnitIndex(factionSlugs: string[], force: boolean): Promise<void> {
  console.log('\n=== Building Unit Index ===\n');

  const client = new FirecrawlClient();
  const db = getDb();

  const factions = await db.select()
    .from(schema.factions)
    .where(factionSlugs.length > 0
      ? inArray(schema.factions.slug, factionSlugs)
      : sql`1=1`);

  for (const faction of factions) {
    const existingCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.unitIndex)
      .where(eq(schema.unitIndex.factionId, faction.id));

    if (existingCount[0]!.count > 0 && !force) {
      console.log(`${faction.slug}: already indexed (${existingCount[0]!.count} units)`);
      continue;
    }

    console.log(`${faction.slug}: fetching datasheets index...`);
    try {
      const indexUrl = WAHAPEDIA_URLS.datasheets(faction.slug);
      const result = await client.scrape(indexUrl);

      const units: { name: string; slug: string }[] = [];
      const seen = new Set<string>();
      const linkRegex = /\[([^\]]+)\]\([^)]*\/factions\/[^/]+\/datasheets#([^)]+)\)/g;
      let match;

      while ((match = linkRegex.exec(result.markdown)) !== null) {
        const name = match[1]?.trim();
        const anchorSlug = match[2]?.trim();
        if (!name || !anchorSlug || seen.has(anchorSlug)) continue;
        seen.add(anchorSlug);
        const slug = decodeURIComponent(anchorSlug).replace(/\s+/g, '-');
        units.push({ name, slug });
      }

      for (const { name, slug } of units) {
        const wahapediaUrl = WAHAPEDIA_URLS.unitDatasheet(faction.slug, slug);
        await db.insert(schema.unitIndex).values({
          factionId: faction.id,
          slug,
          name,
          wahapediaUrl,
          scrapeStatus: 'pending',
        }).onConflictDoNothing();
      }

      console.log(`${faction.slug}: indexed ${units.length} units`);
    } catch (error) {
      console.error(`${faction.slug}: failed - ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log('\nIndex building complete!');
}

async function scrapeUnits(factionSlugs: string[]): Promise<void> {
  console.log('\n=== Scraping Units ===\n');

  const client = new FirecrawlClient();
  const db = getDb();

  const factions = await db.select()
    .from(schema.factions)
    .where(factionSlugs.length > 0
      ? inArray(schema.factions.slug, factionSlugs)
      : sql`1=1`);

  for (const faction of factions) {
    const unitLinks = await db.select()
      .from(schema.unitIndex)
      .where(eq(schema.unitIndex.factionId, faction.id));

    if (unitLinks.length === 0) {
      console.log(`${faction.name}: no units indexed, skipping`);
      continue;
    }

    console.log(`\n${faction.name}: scraping ${unitLinks.length} units`);
    let successCount = 0;
    let failedCount = 0;

    for (const unitLink of unitLinks) {
      try {
        const unitUrl = WAHAPEDIA_URLS.unitDatasheet(faction.slug, unitLink.slug);
        process.stdout.write(`  ${unitLink.name}... `);
        const unitResult = await client.scrape(unitUrl);

        const units = parseDatasheets(unitResult.markdown, unitResult.url);
        if (units.length === 0) {
          console.log('no data');
          await db.update(schema.unitIndex)
            .set({ scrapeStatus: 'failed', lastScrapedAt: new Date() })
            .where(eq(schema.unitIndex.id, unitLink.id));
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
          const [insertedWeapon] = await db.insert(schema.weapons).values(weapon).onConflictDoNothing().returning();
          if (insertedWeapon) {
            await db.insert(schema.unitWeapons).values({ unitId, weaponId: insertedWeapon.id }).onConflictDoNothing();
          }
        }

        for (const ability of abilities) {
          const [insertedAbility] = await db.insert(schema.abilities).values({ ...ability, factionId: faction.id }).onConflictDoNothing().returning();
          if (insertedAbility) {
            await db.insert(schema.unitAbilities).values({ unitId, abilityId: insertedAbility.id }).onConflictDoNothing();
          }
        }

        await db.update(schema.unitIndex)
          .set({ scrapeStatus: 'success', lastScrapedAt: new Date() })
          .where(eq(schema.unitIndex.id, unitLink.id));

        console.log('done');
        successCount++;
      } catch (error) {
        console.log(`failed: ${error instanceof Error ? error.message : error}`);
        await db.update(schema.unitIndex)
          .set({ scrapeStatus: 'failed', lastScrapedAt: new Date() })
          .where(eq(schema.unitIndex.id, unitLink.id));
        failedCount++;
      }
    }

    console.log(`  Completed: ${successCount}/${unitLinks.length} (${failedCount} failed)`);
  }

  console.log('\nUnit scraping complete!');
  console.log('Stats:', client.getStats());
}

async function runMigration(): Promise<void> {
  console.log('\nRunning database migration...');
  const pool = getPool();
  const db = drizzle(pool);

  // Create enums
  await db.execute(sql`DO $$ BEGIN CREATE TYPE data_source AS ENUM ('wahapedia', 'bsdata', 'manual'); EXCEPTION WHEN duplicate_object THEN null; END $$;`);
  await db.execute(sql`DO $$ BEGIN CREATE TYPE phase AS ENUM ('command', 'movement', 'shooting', 'charge', 'fight', 'any'); EXCEPTION WHEN duplicate_object THEN null; END $$;`);
  await db.execute(sql`DO $$ BEGIN CREATE TYPE weapon_type AS ENUM ('ranged', 'melee'); EXCEPTION WHEN duplicate_object THEN null; END $$;`);
  await db.execute(sql`DO $$ BEGIN CREATE TYPE scrape_status AS ENUM ('pending', 'success', 'failed'); EXCEPTION WHEN duplicate_object THEN null; END $$;`);

  console.log('Migration complete!\n');
}

async function scrapeMenu(): Promise<void> {
  const action = await select({
    message: 'What would you like to scrape?',
    choices: [
      { name: 'Core Rules', value: 'core' },
      { name: 'Factions (army rules, detachments, stratagems)', value: 'factions' },
      { name: 'Build Unit Index', value: 'index' },
      { name: 'Units (datasheets)', value: 'units' },
      { name: 'Full Scrape (core + factions + index + units)', value: 'all' },
      { name: '← Back', value: 'back' },
    ],
  });

  if (action === 'back') return;

  if (action === 'core') {
    await scrapeCoreRules();
  } else if (action === 'factions') {
    const factions = await selectFactions();
    if (factions.length > 0) {
      await scrapeFactions(factions);
    }
  } else if (action === 'index') {
    const factions = await selectFactions();
    const force = await confirm({ message: 'Force rebuild existing indexes?', default: false });
    await buildUnitIndex(factions, force);
  } else if (action === 'units') {
    const factions = await selectFactions();
    if (factions.length > 0) {
      await scrapeUnits(factions);
    }
  } else if (action === 'all') {
    const confirmed = await confirm({ message: 'This will scrape everything. Continue?', default: true });
    if (confirmed) {
      await scrapeCoreRules();
      await scrapeFactions(FACTION_SLUGS as unknown as string[]);
      await buildUnitIndex([], false);
      await scrapeUnits([]);
    }
  }
}

async function databaseMenu(): Promise<void> {
  const action = await select({
    message: 'Database operations:',
    choices: [
      { name: 'Show Status', value: 'status' },
      { name: 'Run Migrations', value: 'migrate' },
      { name: '← Back', value: 'back' },
    ],
  });

  if (action === 'back') return;

  if (action === 'status') {
    await showStatus();
  } else if (action === 'migrate') {
    await runMigration();
  }
}

async function mainMenu(): Promise<boolean> {
  console.log('\n');
  const action = await select({
    message: 'WH40K MCP Server - What would you like to do?',
    choices: [
      { name: '📊 Show Status', value: 'status' },
      { name: '🔍 Scrape Data', value: 'scrape' },
      { name: '🗄️  Database', value: 'database' },
      { name: '❌ Exit', value: 'exit' },
    ],
  });

  if (action === 'exit') {
    return false;
  }

  if (action === 'status') {
    await showStatus();
  } else if (action === 'scrape') {
    await scrapeMenu();
  } else if (action === 'database') {
    await databaseMenu();
  }

  return true;
}

export async function runInteractive(): Promise<void> {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║     WH40K Rules MCP Server CLI         ║');
  console.log('║         Interactive Mode               ║');
  console.log('╚════════════════════════════════════════╝');

  try {
    let running = true;
    while (running) {
      running = await mainMenu();
    }
  } finally {
    await closeConnection();
  }

  console.log('\nGoodbye!\n');
}
