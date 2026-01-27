#!/usr/bin/env npx tsx
/**
 * Check for stale Wahapedia data by comparing last update times
 * and optionally checking Wahapedia for changes.
 *
 * Usage:
 *   npx tsx scripts/staleness-check.ts                    # Check all factions
 *   npx tsx scripts/staleness-check.ts space-marines,necrons  # Check specific factions
 *   npx tsx scripts/staleness-check.ts --notify           # Send Discord notification
 */

import 'dotenv/config';
import { getDb, closeConnection } from '../src/db/connection.js';
import { sql } from 'drizzle-orm';
import { Alerter } from '../src/utils/alerting.js';

// Configuration
const STALE_THRESHOLD_DAYS = 30; // Consider data stale after 30 days

interface FactionStaleness {
  slug: string;
  name: string;
  lastUpdated: Date | null;
  daysSinceUpdate: number | null;
  isStale: boolean;
  detachmentCount: number;
  stratagemCount: number;
  unitCount: number;
}

async function main() {
  const db = getDb();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const shouldNotify = args.includes('--notify');
  const nonFlagArgs = args.filter(a => !a.startsWith('--'));
  const factionFilter = nonFlagArgs[0]?.split(',').map(s => s.trim()).filter(Boolean) || [];

  const alerter = new Alerter({
    discordWebhookUrl: shouldNotify ? process.env.DISCORD_WEBHOOK_URL : undefined,
    silent: false,
  });

  console.log('=== Wahapedia Data Staleness Check ===\n');
  console.log(`Threshold: ${STALE_THRESHOLD_DAYS} days`);
  console.log(`Date: ${new Date().toISOString()}`);
  if (factionFilter.length > 0) {
    console.log(`Checking factions: ${factionFilter.join(', ')}`);
  }
  console.log('');

  // Get faction update information
  let query = sql`
    SELECT
      f.slug,
      f.name,
      f.updated_at as last_updated,
      (SELECT COUNT(*) FROM detachments d WHERE d.faction_id = f.id) as detachment_count,
      (SELECT COUNT(*) FROM stratagems s WHERE s.faction_id = f.id) as stratagem_count,
      (SELECT COUNT(*) FROM units u WHERE u.faction_id = f.id) as unit_count
    FROM factions f
    WHERE f.slug != 'unaligned-forces'
  `;

  const result = await db.execute(query);

  const factions: FactionStaleness[] = (result.rows as any[])
    .filter(row => factionFilter.length === 0 || factionFilter.includes(row.slug))
    .map(row => {
      const lastUpdated = row.last_updated ? new Date(row.last_updated) : null;
      const daysSinceUpdate = lastUpdated
        ? Math.floor((Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        slug: row.slug,
        name: row.name,
        lastUpdated,
        daysSinceUpdate,
        isStale: daysSinceUpdate === null || daysSinceUpdate > STALE_THRESHOLD_DAYS,
        detachmentCount: Number(row.detachment_count),
        stratagemCount: Number(row.stratagem_count),
        unitCount: Number(row.unit_count),
      };
    })
    .sort((a, b) => {
      // Sort by staleness (most stale first), then by name
      if (a.isStale !== b.isStale) return a.isStale ? -1 : 1;
      if (a.daysSinceUpdate !== b.daysSinceUpdate) {
        return (b.daysSinceUpdate ?? Infinity) - (a.daysSinceUpdate ?? Infinity);
      }
      return a.name.localeCompare(b.name);
    });

  // Print report
  console.log('='.repeat(90));
  console.log(
    'Faction'.padEnd(25),
    'Last Updated'.padEnd(15),
    'Days'.padEnd(8),
    'Det'.padEnd(6),
    'Strat'.padEnd(7),
    'Units'.padEnd(7),
    'Status'
  );
  console.log('='.repeat(90));

  const staleFactions: FactionStaleness[] = [];
  const freshFactions: FactionStaleness[] = [];

  for (const faction of factions) {
    const lastUpdatedStr = faction.lastUpdated
      ? faction.lastUpdated.toISOString().split('T')[0]
      : 'Never';
    const daysStr = faction.daysSinceUpdate?.toString() ?? 'N/A';
    const status = faction.isStale ? '⚠️  STALE' : '✅ Fresh';

    console.log(
      faction.name.slice(0, 24).padEnd(25),
      lastUpdatedStr.padEnd(15),
      daysStr.padEnd(8),
      faction.detachmentCount.toString().padEnd(6),
      faction.stratagemCount.toString().padEnd(7),
      faction.unitCount.toString().padEnd(7),
      status
    );

    if (faction.isStale) {
      staleFactions.push(faction);
      alerter.warning('Stale Data', `${faction.name} (${faction.slug})`, {
        daysSinceUpdate: faction.daysSinceUpdate ?? 'never',
      });
    } else {
      freshFactions.push(faction);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(90));
  console.log('SUMMARY');
  console.log('='.repeat(90));
  console.log(`Total factions checked: ${factions.length}`);
  console.log(`Fresh factions: ${freshFactions.length}`);
  console.log(`Stale factions: ${staleFactions.length}`);

  if (staleFactions.length > 0) {
    console.log('\n--- Stale Factions ---');
    for (const faction of staleFactions) {
      // Output in a format the CI can parse
      console.log(`STALE: ${faction.name} (${faction.slug}) - ${faction.daysSinceUpdate ?? 'never updated'} days`);
    }
  }

  // Check for incomplete data
  console.log('\n--- Data Completeness ---');
  const incomplete = factions.filter(f =>
    f.detachmentCount === 0 || f.stratagemCount === 0 || f.unitCount === 0
  );

  if (incomplete.length > 0) {
    for (const faction of incomplete) {
      const missing: string[] = [];
      if (faction.detachmentCount === 0) missing.push('detachments');
      if (faction.stratagemCount === 0) missing.push('stratagems');
      if (faction.unitCount === 0) missing.push('units');
      console.log(`INCOMPLETE: ${faction.name} - missing ${missing.join(', ')}`);
      alerter.error('Incomplete Data', `${faction.name} missing ${missing.join(', ')}`, {
        faction: faction.slug,
        missing,
      });
    }
  } else {
    console.log('All factions have detachments, stratagems, and units.');
  }

  // Send notifications if requested
  if (shouldNotify && staleFactions.length > 0) {
    console.log('\nSending Discord notification...');
    await alerter.sendToDiscord();
  }

  // Exit code based on staleness
  const exitCode = staleFactions.length > 0 ? 1 : 0;

  await closeConnection();
  process.exit(exitCode);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
