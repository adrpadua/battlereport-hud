import { select, confirm, checkbox, input } from '@inquirer/prompts';
import { getDb, closeConnection } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { sql, eq, inArray } from 'drizzle-orm';
import { FACTION_SLUGS } from '../scraper/config.js';
import { findBestMatches, BUILTIN_ALIASES, type Category } from '../tools/fuzzy-matcher.js';
import { loadCandidates, fetchNamesForCategory } from '../tools/validation-tools.js';

// Import action functions from command modules
import { FirecrawlClient } from '../scraper/firecrawl-client.js';
import { WAHAPEDIA_URLS } from '../scraper/config.js';
import { parseCoreRules } from '../scraper/parsers/core-rules-parser.js';
import { parseFactionPage, parseDetachments, parseStratagems, parseEnhancements } from '../scraper/parsers/faction-parser.js';
import { parseDatasheets } from '../scraper/parsers/unit-parser.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getPool } from '../db/connection.js';

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

type ScrapeFilter = 'all' | 'pending' | 'failed' | 'skip-unchanged';

async function scrapeUnits(factionSlugs: string[], filter: ScrapeFilter = 'all'): Promise<void> {
  console.log('\n=== Scraping Units ===\n');
  if (filter !== 'all') {
    console.log(`Filter: ${filter}\n`);
  }

  const client = new FirecrawlClient();
  const db = getDb();

  const factions = await db.select()
    .from(schema.factions)
    .where(factionSlugs.length > 0
      ? inArray(schema.factions.slug, factionSlugs)
      : sql`1=1`);

  for (const faction of factions) {
    let unitLinks = await db.select()
      .from(schema.unitIndex)
      .where(eq(schema.unitIndex.factionId, faction.id));

    if (unitLinks.length === 0) {
      console.log(`${faction.name}: no units indexed, skipping`);
      continue;
    }

    // Apply filter
    const totalUnits = unitLinks.length;
    if (filter === 'pending') {
      unitLinks = unitLinks.filter(u => u.scrapeStatus === 'pending');
    } else if (filter === 'failed') {
      unitLinks = unitLinks.filter(u => u.scrapeStatus === 'failed');
    }

    if (unitLinks.length === 0) {
      console.log(`${faction.name}: no units match filter (${totalUnits} total)`);
      continue;
    }

    console.log(`\n${faction.name}: scraping ${unitLinks.length}${filter !== 'all' ? ` ${filter}` : ''} units${filter !== 'all' ? ` (${totalUnits} total)` : ''}`);
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const unitLink of unitLinks) {
      try {
        const unitUrl = WAHAPEDIA_URLS.unitDatasheet(faction.slug, unitLink.slug);
        process.stdout.write(`  ${unitLink.name}... `);
        const unitResult = await client.scrape(unitUrl);

        // Skip processing if content unchanged and already successfully scraped
        if (filter === 'skip-unchanged' && unitResult.fromCache && unitLink.scrapeStatus === 'success') {
          console.log('skipped (unchanged)');
          skippedCount++;
          continue;
        }

        const units = parseDatasheets(unitResult.html || unitResult.markdown, unitResult.url);
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

    console.log(`  Completed: ${successCount}/${unitLinks.length} (${failedCount} failed${skippedCount > 0 ? `, ${skippedCount} skipped` : ''})`);
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

async function selectScrapeFilter(): Promise<ScrapeFilter> {
  const filter = await select({
    message: 'Which units to scrape?',
    choices: [
      { name: 'All units', value: 'all' },
      { name: 'Only pending (not yet scraped)', value: 'pending' },
      { name: 'Only failed (retry errors)', value: 'failed' },
      { name: 'Skip unchanged (use cache, skip processing if already successful)', value: 'skip-unchanged' },
    ],
  });
  return filter as ScrapeFilter;
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
      const filter = await selectScrapeFilter();
      await scrapeUnits(factions, filter);
    }
  } else if (action === 'all') {
    const filter = await selectScrapeFilter();
    const confirmed = await confirm({ message: 'This will scrape everything. Continue?', default: true });
    if (confirmed) {
      await scrapeCoreRules();
      await scrapeFactions(FACTION_SLUGS as unknown as string[]);
      await buildUnitIndex([], false);
      await scrapeUnits([], filter);
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

async function validateTermsInteractive(): Promise<void> {
  const db = getDb();

  const termsInput = await input({
    message: 'Enter terms to validate (comma-separated):',
    validate: (value) => value.trim().length > 0 || 'Please enter at least one term',
  });

  const terms = termsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);

  const factionsInput = await input({
    message: 'Enter faction hints (comma-separated, or leave empty):',
  });

  const factions = factionsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);

  console.log('\n=== Validating Terms ===\n');

  const categories: Category[] = ['units', 'stratagems', 'abilities', 'factions', 'enhancements', 'keywords'];
  const candidates = await loadCandidates(db, categories, factions);

  for (const term of terms) {
    const matches = findBestMatches(term, candidates, {
      minConfidence: 0.5,
      limit: 3,
      checkAliases: true,
    });

    const best = matches[0];
    if (best) {
      console.log(`  "${term}" → ${best.name} (${best.category}, ${Math.round(best.confidence * 100)}%)`);
      if (matches.length > 1) {
        console.log(`      alternates: ${matches.slice(1).map(m => `${m.name} (${Math.round(m.confidence * 100)}%)`).join(', ')}`);
      }
    } else {
      console.log(`  "${term}" → no match found`);
    }
  }
  console.log('');
}

async function fuzzySearchInteractive(): Promise<void> {
  const db = getDb();

  const query = await input({
    message: 'Enter search query:',
    validate: (value) => value.trim().length >= 2 || 'Query must be at least 2 characters',
  });

  const categoryChoices = await checkbox({
    message: 'Select categories to search:',
    choices: [
      { name: 'Units', value: 'units', checked: true },
      { name: 'Stratagems', value: 'stratagems', checked: true },
      { name: 'Abilities', value: 'abilities', checked: true },
      { name: 'Factions', value: 'factions', checked: true },
      { name: 'Detachments', value: 'detachments', checked: true },
      { name: 'Enhancements', value: 'enhancements', checked: true },
      { name: 'Keywords', value: 'keywords', checked: true },
    ],
  });

  const categories = categoryChoices as Category[];

  console.log('\n=== Search Results ===\n');

  const candidates = await loadCandidates(db, categories, []);
  const matches = findBestMatches(query, candidates, {
    minConfidence: 0.3,
    limit: 10,
    checkAliases: true,
  });

  if (matches.length === 0) {
    console.log('  No matches found.\n');
    return;
  }

  for (const match of matches) {
    const factionStr = match.faction ? ` (${match.faction})` : '';
    console.log(`  ${Math.round(match.confidence * 100).toString().padStart(3)}%  ${match.name}${factionStr} [${match.category}]`);
  }
  console.log('');
}

async function listValidNamesInteractive(): Promise<void> {
  const db = getDb();

  const category = await select({
    message: 'Select category:',
    choices: [
      { name: 'Units', value: 'units' },
      { name: 'Stratagems', value: 'stratagems' },
      { name: 'Abilities', value: 'abilities' },
      { name: 'Factions', value: 'factions' },
      { name: 'Detachments', value: 'detachments' },
      { name: 'Enhancements', value: 'enhancements' },
      { name: 'Keywords', value: 'keywords' },
    ],
  });

  const factionInput = await input({
    message: 'Filter by faction (leave empty for all):',
  });

  const faction = factionInput.trim() || undefined;

  console.log(`\n=== Valid ${category} Names ===\n`);

  const names = await fetchNamesForCategory(db, category, faction);

  if (names.length === 0) {
    console.log('  No names found.\n');
    return;
  }

  // Display in columns
  const maxLen = Math.max(...names.map(n => n.length));
  const cols = Math.floor(80 / (maxLen + 4)) || 1;

  for (let i = 0; i < names.length; i += cols) {
    const row = names.slice(i, i + cols);
    console.log('  ' + row.map(n => n.padEnd(maxLen + 2)).join(''));
  }

  console.log(`\n  Total: ${names.length} names\n`);
}

async function showAliasesInteractive(): Promise<void> {
  console.log('\n=== Built-in Aliases ===\n');

  const categories = {
    'Units': [] as [string, string][],
    'Factions': [] as [string, string][],
    'Stratagems': [] as [string, string][],
    'Detachments': [] as [string, string][],
  };

  for (const [alias, target] of Object.entries(BUILTIN_ALIASES)) {
    if (target.includes('Squad') || target.includes('Veteran') || target.includes('Warriors') ||
        target.includes('Terminators') || target.includes('Predator') || target.includes('Reavers')) {
      categories['Units'].push([alias, target]);
    } else if (target.includes('Overwatch') || target.includes('Re-roll')) {
      categories['Stratagems'].push([alias, target]);
    } else if (target.includes('Cartel') || target.includes('Task Force') || target.includes("Mont'ka")) {
      categories['Detachments'].push([alias, target]);
    } else {
      categories['Factions'].push([alias, target]);
    }
  }

  for (const [cat, aliases] of Object.entries(categories)) {
    if (aliases.length > 0) {
      console.log(`  ${cat}:`);
      for (const [alias, target] of aliases) {
        console.log(`    "${alias}" → ${target}`);
      }
      console.log('');
    }
  }
}

async function validationMenu(): Promise<void> {
  const action = await select({
    message: 'Validation tools:',
    choices: [
      { name: '✓ Validate Terms', value: 'validate' },
      { name: '🔍 Fuzzy Search', value: 'search' },
      { name: '📋 List Valid Names', value: 'list' },
      { name: '📝 Show Built-in Aliases', value: 'aliases' },
      { name: '← Back', value: 'back' },
    ],
  });

  if (action === 'back') return;

  if (action === 'validate') {
    await validateTermsInteractive();
  } else if (action === 'search') {
    await fuzzySearchInteractive();
  } else if (action === 'list') {
    await listValidNamesInteractive();
  } else if (action === 'aliases') {
    await showAliasesInteractive();
  }
}

async function mainMenu(): Promise<boolean> {
  console.log('\n');
  const action = await select({
    message: 'WH40K MCP Server - What would you like to do?',
    choices: [
      { name: '📊 Show Status', value: 'status' },
      { name: '✓ Validate Terms', value: 'validate' },
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
  } else if (action === 'validate') {
    await validationMenu();
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
