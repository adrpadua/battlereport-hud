#!/usr/bin/env npx tsx
/**
 * Comprehensive integrity check comparing Wahapedia cached data to database
 *
 * Usage:
 *   npx tsx scripts/integrity-check.ts              # Run check
 *   npx tsx scripts/integrity-check.ts --notify     # Run check and send Discord notification
 *   npx tsx scripts/integrity-check.ts --json       # Output results as JSON
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { getDb, closeConnection } from '../src/db/connection.js';
import * as schema from '../src/db/schema.js';
import { sql, eq, isNull, count } from 'drizzle-orm';
import { parseDetachments, parseStratagemsByDetachment, parseEnhancementsByDetachment } from '../src/scraper/parsers/faction-parser.js';
import { FACTION_SLUGS, WAHAPEDIA_URLS } from '../src/scraper/config.js';
import { Alerter, type AlertLevel } from '../src/utils/alerting.js';

// Parse command line args
const args = process.argv.slice(2);
const shouldNotify = args.includes('--notify');
const jsonOutput = args.includes('--json');

const alerter = new Alerter({
  discordWebhookUrl: shouldNotify ? process.env.DISCORD_WEBHOOK_URL : undefined,
  jsonOutput,
  silent: jsonOutput,
});

interface IntegrityIssue {
  type: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  details?: any;
}

const issues: IntegrityIssue[] = [];

function addIssue(type: IntegrityIssue['type'], category: string, message: string, details?: any) {
  issues.push({ type, category, message, details });

  // Also add to alerter
  const alertLevel: AlertLevel = type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info';
  alerter.add(alertLevel, category, message, details ? { details: Array.isArray(details) ? details.slice(0, 5) : details } : undefined);
}

async function main() {
  const db = getDb();
  const cacheDir = '.scrape-cache';

  console.log('🔍 Running Wahapedia to Database Integrity Check\n');
  console.log('='.repeat(70));

  // 1. Check all factions exist in database
  console.log('\n📋 Checking Factions...');
  const dbFactions = await db.select().from(schema.factions);
  const dbFactionSlugs = new Set(dbFactions.map(f => f.slug));

  for (const slug of FACTION_SLUGS) {
    if (!dbFactionSlugs.has(slug)) {
      addIssue('error', 'Missing Faction', `Faction "${slug}" not found in database`);
    }
  }
  console.log(`  ✓ ${dbFactions.length} factions in database`);

  // 2. Check for orphaned records
  console.log('\n🔗 Checking for Orphaned Records...');

  // Detachments without faction
  const orphanedDetachments = await db
    .select({ id: schema.detachments.id, name: schema.detachments.name })
    .from(schema.detachments)
    .leftJoin(schema.factions, eq(schema.detachments.factionId, schema.factions.id))
    .where(isNull(schema.factions.id));

  if (orphanedDetachments.length > 0) {
    addIssue('error', 'Orphaned Detachments', `${orphanedDetachments.length} detachments without faction`, orphanedDetachments);
  }

  // Stratagems without faction
  const orphanedStratagems = await db
    .select({ id: schema.stratagems.id, name: schema.stratagems.name })
    .from(schema.stratagems)
    .leftJoin(schema.factions, eq(schema.stratagems.factionId, schema.factions.id))
    .where(isNull(schema.factions.id));

  if (orphanedStratagems.length > 0) {
    addIssue('error', 'Orphaned Stratagems', `${orphanedStratagems.length} stratagems without faction`, orphanedStratagems);
  }

  // Enhancements without detachment
  const orphanedEnhancements = await db
    .select({ id: schema.enhancements.id, name: schema.enhancements.name })
    .from(schema.enhancements)
    .leftJoin(schema.detachments, eq(schema.enhancements.detachmentId, schema.detachments.id))
    .where(isNull(schema.detachments.id));

  if (orphanedEnhancements.length > 0) {
    addIssue('error', 'Orphaned Enhancements', `${orphanedEnhancements.length} enhancements without detachment`, orphanedEnhancements);
  }

  console.log(`  ✓ Orphaned detachments: ${orphanedDetachments.length}`);
  console.log(`  ✓ Orphaned stratagems: ${orphanedStratagems.length}`);
  console.log(`  ✓ Orphaned enhancements: ${orphanedEnhancements.length}`);

  // 3. Check for duplicate slugs within factions
  console.log('\n🔄 Checking for Duplicates...');

  const duplicateDetachments = await db.execute(sql`
    SELECT faction_id, slug, COUNT(*) as cnt
    FROM detachments
    GROUP BY faction_id, slug
    HAVING COUNT(*) > 1
  `);

  if (duplicateDetachments.rows.length > 0) {
    addIssue('warning', 'Duplicate Detachments', `${duplicateDetachments.rows.length} duplicate detachment slugs`, duplicateDetachments.rows);
  }

  const duplicateStratagems = await db.execute(sql`
    SELECT faction_id, slug, COUNT(*) as cnt
    FROM stratagems
    GROUP BY faction_id, slug
    HAVING COUNT(*) > 1
  `);

  if (duplicateStratagems.rows.length > 0) {
    addIssue('warning', 'Duplicate Stratagems', `${duplicateStratagems.rows.length} duplicate stratagem slugs`, duplicateStratagems.rows);
  }

  console.log(`  ✓ Duplicate detachment slugs: ${duplicateDetachments.rows.length}`);
  console.log(`  ✓ Duplicate stratagem slugs: ${duplicateStratagems.rows.length}`);

  // 4. Check detachments have stratagems and enhancements
  console.log('\n📊 Checking Detachment Completeness...');

  const detachmentsWithoutStratagems = await db.execute(sql`
    SELECT d.id, d.name, f.name as faction_name
    FROM detachments d
    JOIN factions f ON d.faction_id = f.id
    LEFT JOIN stratagems s ON s.detachment_id = d.id
    WHERE s.id IS NULL
  `);

  const detachmentsWithoutEnhancements = await db.execute(sql`
    SELECT d.id, d.name, f.name as faction_name
    FROM detachments d
    JOIN factions f ON d.faction_id = f.id
    LEFT JOIN enhancements e ON e.detachment_id = d.id
    WHERE e.id IS NULL
  `);

  if (detachmentsWithoutStratagems.rows.length > 0) {
    addIssue('warning', 'Incomplete Detachments', `${detachmentsWithoutStratagems.rows.length} detachments without stratagems`,
      (detachmentsWithoutStratagems.rows as any[]).slice(0, 10).map((r: any) => `${r.faction_name}: ${r.name}`));
  }

  if (detachmentsWithoutEnhancements.rows.length > 0) {
    addIssue('warning', 'Incomplete Detachments', `${detachmentsWithoutEnhancements.rows.length} detachments without enhancements`,
      (detachmentsWithoutEnhancements.rows as any[]).slice(0, 10).map((r: any) => `${r.faction_name}: ${r.name}`));
  }

  console.log(`  ✓ Detachments without stratagems: ${detachmentsWithoutStratagems.rows.length}`);
  console.log(`  ✓ Detachments without enhancements: ${detachmentsWithoutEnhancements.rows.length}`);

  // 5. Compare cached Wahapedia data to database counts
  console.log('\n📈 Comparing Wahapedia Cache to Database...');

  const cacheFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json'));
  const factionComparisons: any[] = [];

  for (const faction of dbFactions) {
    if (faction.slug === 'unaligned-forces') continue;

    // Find cached faction page
    const factionUrl = WAHAPEDIA_URLS.factionBase(faction.slug);
    let cachedData = null;

    for (const file of cacheFiles) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(cacheDir, file), 'utf8'));
        if (data.url === factionUrl || data.url === factionUrl.slice(0, -1)) {
          cachedData = data;
          break;
        }
      } catch (e) {
        // Skip invalid files
      }
    }

    if (!cachedData) {
      addIssue('info', 'Missing Cache', `No cached data for faction: ${faction.name}`);
      continue;
    }

    // Parse cached data
    const html = cachedData.html || cachedData.markdown || '';
    const cachedDetachments = parseDetachments(html, cachedData.url);
    const cachedStratagemsByDet = parseStratagemsByDetachment(html, cachedData.url);
    const cachedEnhancementsByDet = parseEnhancementsByDetachment(html, cachedData.url);

    let cachedStratagemCount = 0;
    let cachedEnhancementCount = 0;
    for (const strats of cachedStratagemsByDet.values()) cachedStratagemCount += strats.length;
    for (const enhs of cachedEnhancementsByDet.values()) cachedEnhancementCount += enhs.length;

    // Get database counts for this faction
    const [dbDetCount] = await db
      .select({ count: count() })
      .from(schema.detachments)
      .where(eq(schema.detachments.factionId, faction.id));

    const [dbStratCount] = await db
      .select({ count: count() })
      .from(schema.stratagems)
      .where(eq(schema.stratagems.factionId, faction.id));

    const dbEnhCountResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM enhancements e
      JOIN detachments d ON e.detachment_id = d.id
      WHERE d.faction_id = ${faction.id}
    `);

    const comparison = {
      faction: faction.name,
      slug: faction.slug,
      cache: {
        detachments: cachedDetachments.length,
        stratagems: cachedStratagemCount,
        enhancements: cachedEnhancementCount,
      },
      database: {
        detachments: Number(dbDetCount?.count || 0),
        stratagems: Number(dbStratCount?.count || 0),
        enhancements: Number((dbEnhCountResult.rows[0] as any)?.count || 0),
      },
    };

    factionComparisons.push(comparison);

    // Check for significant discrepancies
    if (comparison.database.detachments < comparison.cache.detachments) {
      addIssue('warning', 'Detachment Mismatch',
        `${faction.name}: DB has ${comparison.database.detachments} detachments, cache has ${comparison.cache.detachments}`);
    }
  }

  // 6. Print faction comparison table
  console.log('\n📊 Faction Data Comparison (Cache vs Database):');
  console.log('-'.repeat(90));
  console.log(
    'Faction'.padEnd(25),
    'Det(C/D)'.padEnd(12),
    'Strat(C/D)'.padEnd(12),
    'Enh(C/D)'.padEnd(12),
    'Status'
  );
  console.log('-'.repeat(90));

  for (const comp of factionComparisons.sort((a, b) => a.faction.localeCompare(b.faction))) {
    const detMatch = comp.database.detachments >= comp.cache.detachments;
    const stratMatch = comp.database.stratagems >= comp.cache.stratagems;
    const enhMatch = comp.database.enhancements >= comp.cache.enhancements;

    const status = detMatch && stratMatch && enhMatch ? '✓' :
      (!detMatch ? '⚠ Det' : '') + (!stratMatch ? '⚠ Strat' : '') + (!enhMatch ? '⚠ Enh' : '');

    console.log(
      comp.faction.slice(0, 24).padEnd(25),
      `${comp.cache.detachments}/${comp.database.detachments}`.padEnd(12),
      `${comp.cache.stratagems}/${comp.database.stratagems}`.padEnd(12),
      `${comp.cache.enhancements}/${comp.database.enhancements}`.padEnd(12),
      status
    );
  }

  // 7. Check units have keywords
  console.log('\n🏷️ Checking Unit Keywords...');

  const unitsWithoutKeywords = await db.execute(sql`
    SELECT u.id, u.name, f.name as faction_name
    FROM units u
    JOIN factions f ON u.faction_id = f.id
    LEFT JOIN unit_keywords uk ON uk.unit_id = u.id
    WHERE uk.id IS NULL
    LIMIT 20
  `);

  if (unitsWithoutKeywords.rows.length > 0) {
    addIssue('warning', 'Missing Keywords', `${unitsWithoutKeywords.rows.length}+ units without keywords`,
      (unitsWithoutKeywords.rows as any[]).map((r: any) => `${r.faction_name}: ${r.name}`));
  }

  console.log(`  ✓ Units without keywords: ${unitsWithoutKeywords.rows.length}+`);

  // 8. Check for empty required fields
  console.log('\n📝 Checking Required Fields...');

  const emptyDetachmentRules = await db
    .select({ id: schema.detachments.id, name: schema.detachments.name })
    .from(schema.detachments)
    .where(isNull(schema.detachments.detachmentRule));

  const emptyStratagemEffects = await db
    .select({ id: schema.stratagems.id, name: schema.stratagems.name })
    .from(schema.stratagems)
    .where(isNull(schema.stratagems.effect));

  console.log(`  ✓ Detachments without rules: ${emptyDetachmentRules.length}`);
  console.log(`  ✓ Stratagems without effects: ${emptyStratagemEffects.length}`);

  if (emptyDetachmentRules.length > 0) {
    addIssue('warning', 'Empty Fields', `${emptyDetachmentRules.length} detachments without rules`,
      emptyDetachmentRules.slice(0, 5).map(d => d.name));
  }

  // 9. Summary
  console.log('\n' + '='.repeat(70));
  console.log('📋 INTEGRITY CHECK SUMMARY');
  console.log('='.repeat(70));

  const errors = issues.filter(i => i.type === 'error');
  const warnings = issues.filter(i => i.type === 'warning');
  const infos = issues.filter(i => i.type === 'info');

  console.log(`\n❌ Errors: ${errors.length}`);
  for (const issue of errors) {
    console.log(`   - [${issue.category}] ${issue.message}`);
  }

  console.log(`\n⚠️  Warnings: ${warnings.length}`);
  for (const issue of warnings) {
    console.log(`   - [${issue.category}] ${issue.message}`);
    if (issue.details && Array.isArray(issue.details) && issue.details.length <= 10) {
      for (const detail of issue.details) {
        console.log(`     • ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
      }
    }
  }

  console.log(`\nℹ️  Info: ${infos.length}`);
  for (const issue of infos.slice(0, 5)) {
    console.log(`   - [${issue.category}] ${issue.message}`);
  }
  if (infos.length > 5) {
    console.log(`   ... and ${infos.length - 5} more`);
  }

  // Final status
  console.log('\n' + '='.repeat(70));
  if (errors.length === 0 && warnings.length < 10) {
    console.log('✅ Database integrity check PASSED');
  } else if (errors.length === 0) {
    console.log('⚠️  Database integrity check PASSED with warnings');
  } else {
    console.log('❌ Database integrity check FAILED');
  }

  await closeConnection();

  // Send notifications if requested
  if (shouldNotify && alerter.hasErrors()) {
    await alerter.sendToDiscord();
  }

  // Exit with appropriate code for CI
  const exitCode = errors.length > 0 ? 1 : 0;
  process.exit(exitCode);
}

main().catch(error => {
  console.error('Fatal error:', error);
  alerter.critical('Fatal Error', error.message);
  process.exit(1);
});
