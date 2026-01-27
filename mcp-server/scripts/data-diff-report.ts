#!/usr/bin/env npx tsx
/**
 * Generate data diff reports showing what changed between parses.
 *
 * Usage:
 *   npx tsx scripts/data-diff-report.ts snapshot           # Create a snapshot
 *   npx tsx scripts/data-diff-report.ts diff <before> <after>  # Compare snapshots
 *   npx tsx scripts/data-diff-report.ts list               # List available snapshots
 *   npx tsx scripts/data-diff-report.ts compare-live <snapshot>  # Compare snapshot to live DB
 */

import 'dotenv/config';
import { getDb, closeConnection } from '../src/db/connection.js';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

// Directory for storing snapshots
const SNAPSHOT_DIR = path.join(process.cwd(), '.data-snapshots');

interface FactionSnapshot {
  slug: string;
  name: string;
  detachmentCount: number;
  stratagemCount: number;
  enhancementCount: number;
  unitCount: number;
  detachments: DetachmentSnapshot[];
}

interface DetachmentSnapshot {
  slug: string;
  name: string;
  stratagemCount: number;
  enhancementCount: number;
  stratagems: string[];
  enhancements: string[];
}

interface DataSnapshot {
  timestamp: string;
  version: string;
  factions: FactionSnapshot[];
  totals: {
    factions: number;
    detachments: number;
    stratagems: number;
    enhancements: number;
    units: number;
  };
}

interface DiffResult {
  added: string[];
  removed: string[];
  changed: { item: string; before: string; after: string }[];
}

async function createSnapshot(): Promise<DataSnapshot> {
  const db = getDb();

  // Get all factions with counts
  // Note: enhancements link to detachments, not directly to factions
  const factionsResult = await db.execute(sql`
    SELECT
      f.slug,
      f.name,
      (SELECT COUNT(*) FROM detachments d WHERE d.faction_id = f.id) as detachment_count,
      (SELECT COUNT(*) FROM stratagems s WHERE s.faction_id = f.id) as stratagem_count,
      (SELECT COUNT(*) FROM enhancements e
       JOIN detachments d ON e.detachment_id = d.id
       WHERE d.faction_id = f.id) as enhancement_count,
      (SELECT COUNT(*) FROM units u WHERE u.faction_id = f.id) as unit_count
    FROM factions f
    WHERE f.slug != 'unaligned-forces'
    ORDER BY f.name
  `);

  const factions: FactionSnapshot[] = [];

  for (const row of factionsResult.rows as any[]) {
    // Get detachments for this faction
    const detachmentsResult = await db.execute(sql`
      SELECT
        d.id,
        d.slug,
        d.name,
        (SELECT COUNT(*) FROM stratagems s WHERE s.detachment_id = d.id) as stratagem_count,
        (SELECT COUNT(*) FROM enhancements e WHERE e.detachment_id = d.id) as enhancement_count
      FROM detachments d
      JOIN factions f ON d.faction_id = f.id
      WHERE f.slug = ${row.slug}
      ORDER BY d.name
    `);

    const detachments: DetachmentSnapshot[] = [];

    for (const det of detachmentsResult.rows as any[]) {
      // Get stratagems for this detachment
      const stratagemsResult = await db.execute(sql`
        SELECT name FROM stratagems WHERE detachment_id = ${det.id} ORDER BY name
      `);

      // Get enhancements for this detachment
      const enhancementsResult = await db.execute(sql`
        SELECT name FROM enhancements WHERE detachment_id = ${det.id} ORDER BY name
      `);

      detachments.push({
        slug: det.slug,
        name: det.name,
        stratagemCount: Number(det.stratagem_count),
        enhancementCount: Number(det.enhancement_count),
        stratagems: (stratagemsResult.rows as any[]).map(s => s.name),
        enhancements: (enhancementsResult.rows as any[]).map(e => e.name),
      });
    }

    factions.push({
      slug: row.slug,
      name: row.name,
      detachmentCount: Number(row.detachment_count),
      stratagemCount: Number(row.stratagem_count),
      enhancementCount: Number(row.enhancement_count),
      unitCount: Number(row.unit_count),
      detachments,
    });
  }

  // Get totals
  const totalsResult = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM factions WHERE slug != 'unaligned-forces') as faction_count,
      (SELECT COUNT(*) FROM detachments) as detachment_count,
      (SELECT COUNT(*) FROM stratagems) as stratagem_count,
      (SELECT COUNT(*) FROM enhancements) as enhancement_count,
      (SELECT COUNT(*) FROM units) as unit_count
  `);

  const totals = totalsResult.rows[0] as any;

  return {
    timestamp: new Date().toISOString(),
    version: '1.0',
    factions,
    totals: {
      factions: Number(totals.faction_count),
      detachments: Number(totals.detachment_count),
      stratagems: Number(totals.stratagem_count),
      enhancements: Number(totals.enhancement_count),
      units: Number(totals.unit_count),
    },
  };
}

function saveSnapshot(snapshot: DataSnapshot, name?: string): string {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }

  const fileName = name || `snapshot-${snapshot.timestamp.replace(/[:.]/g, '-')}`;
  const filePath = path.join(SNAPSHOT_DIR, `${fileName}.json`);

  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
  return filePath;
}

function loadSnapshot(nameOrPath: string): DataSnapshot {
  let filePath = nameOrPath;

  if (!fs.existsSync(filePath)) {
    filePath = path.join(SNAPSHOT_DIR, `${nameOrPath}.json`);
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Snapshot not found: ${nameOrPath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function listSnapshots(): string[] {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    return [];
  }

  return fs.readdirSync(SNAPSHOT_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .sort();
}

function compareTotals(before: DataSnapshot, after: DataSnapshot): void {
  console.log('\n=== TOTALS COMPARISON ===\n');

  const fields: (keyof DataSnapshot['totals'])[] = ['factions', 'detachments', 'stratagems', 'enhancements', 'units'];

  console.log('Category'.padEnd(15), 'Before'.padEnd(10), 'After'.padEnd(10), 'Change');
  console.log('-'.repeat(50));

  for (const field of fields) {
    const beforeVal = before.totals[field];
    const afterVal = after.totals[field];
    const change = afterVal - beforeVal;
    const changeStr = change === 0 ? '  -' : (change > 0 ? `+${change}` : `${change}`);
    const indicator = change > 0 ? '📈' : change < 0 ? '📉' : '  ';

    console.log(
      field.padEnd(15),
      beforeVal.toString().padEnd(10),
      afterVal.toString().padEnd(10),
      `${indicator} ${changeStr}`
    );
  }
}

function compareFactions(before: DataSnapshot, after: DataSnapshot): void {
  console.log('\n=== FACTION CHANGES ===\n');

  const beforeMap = new Map(before.factions.map(f => [f.slug, f]));
  const afterMap = new Map(after.factions.map(f => [f.slug, f]));

  // Find added factions
  const added = after.factions.filter(f => !beforeMap.has(f.slug));
  if (added.length > 0) {
    console.log('Added Factions:');
    for (const f of added) {
      console.log(`  + ${f.name} (${f.detachmentCount} det, ${f.stratagemCount} strat, ${f.unitCount} units)`);
    }
    console.log('');
  }

  // Find removed factions
  const removed = before.factions.filter(f => !afterMap.has(f.slug));
  if (removed.length > 0) {
    console.log('Removed Factions:');
    for (const f of removed) {
      console.log(`  - ${f.name}`);
    }
    console.log('');
  }

  // Find changed factions
  let hasChanges = false;
  for (const afterFaction of after.factions) {
    const beforeFaction = beforeMap.get(afterFaction.slug);
    if (!beforeFaction) continue;

    const changes: string[] = [];

    if (beforeFaction.detachmentCount !== afterFaction.detachmentCount) {
      const diff = afterFaction.detachmentCount - beforeFaction.detachmentCount;
      changes.push(`detachments: ${beforeFaction.detachmentCount} → ${afterFaction.detachmentCount} (${diff > 0 ? '+' : ''}${diff})`);
    }
    if (beforeFaction.stratagemCount !== afterFaction.stratagemCount) {
      const diff = afterFaction.stratagemCount - beforeFaction.stratagemCount;
      changes.push(`stratagems: ${beforeFaction.stratagemCount} → ${afterFaction.stratagemCount} (${diff > 0 ? '+' : ''}${diff})`);
    }
    if (beforeFaction.enhancementCount !== afterFaction.enhancementCount) {
      const diff = afterFaction.enhancementCount - beforeFaction.enhancementCount;
      changes.push(`enhancements: ${beforeFaction.enhancementCount} → ${afterFaction.enhancementCount} (${diff > 0 ? '+' : ''}${diff})`);
    }
    if (beforeFaction.unitCount !== afterFaction.unitCount) {
      const diff = afterFaction.unitCount - beforeFaction.unitCount;
      changes.push(`units: ${beforeFaction.unitCount} → ${afterFaction.unitCount} (${diff > 0 ? '+' : ''}${diff})`);
    }

    if (changes.length > 0) {
      if (!hasChanges) {
        console.log('Changed Factions:');
        hasChanges = true;
      }
      console.log(`  ${afterFaction.name}:`);
      for (const change of changes) {
        console.log(`    • ${change}`);
      }
    }
  }

  if (!hasChanges && added.length === 0 && removed.length === 0) {
    console.log('No faction-level changes detected.');
  }
}

function compareDetachments(before: DataSnapshot, after: DataSnapshot): void {
  console.log('\n=== DETACHMENT CHANGES ===\n');

  // Build maps of all detachments keyed by faction-slug/detachment-slug
  const beforeDets = new Map<string, { faction: string; det: DetachmentSnapshot }>();
  const afterDets = new Map<string, { faction: string; det: DetachmentSnapshot }>();

  for (const faction of before.factions) {
    for (const det of faction.detachments) {
      beforeDets.set(`${faction.slug}/${det.slug}`, { faction: faction.name, det });
    }
  }

  for (const faction of after.factions) {
    for (const det of faction.detachments) {
      afterDets.set(`${faction.slug}/${det.slug}`, { faction: faction.name, det });
    }
  }

  // Find added detachments
  const added: { key: string; faction: string; det: DetachmentSnapshot }[] = [];
  for (const [key, value] of afterDets) {
    if (!beforeDets.has(key)) {
      added.push({ key, ...value });
    }
  }

  if (added.length > 0) {
    console.log('Added Detachments:');
    for (const { faction, det } of added) {
      console.log(`  + [${faction}] ${det.name} (${det.stratagemCount} strat, ${det.enhancementCount} enh)`);
    }
    console.log('');
  }

  // Find removed detachments
  const removed: { key: string; faction: string; det: DetachmentSnapshot }[] = [];
  for (const [key, value] of beforeDets) {
    if (!afterDets.has(key)) {
      removed.push({ key, ...value });
    }
  }

  if (removed.length > 0) {
    console.log('Removed Detachments:');
    for (const { faction, det } of removed) {
      console.log(`  - [${faction}] ${det.name}`);
    }
    console.log('');
  }

  // Find changed detachments
  let hasChanges = false;
  for (const [key, afterValue] of afterDets) {
    const beforeValue = beforeDets.get(key);
    if (!beforeValue) continue;

    const beforeDet = beforeValue.det;
    const afterDet = afterValue.det;
    const changes: string[] = [];

    // Compare stratagem counts and lists
    if (beforeDet.stratagemCount !== afterDet.stratagemCount) {
      const diff = afterDet.stratagemCount - beforeDet.stratagemCount;
      changes.push(`stratagems: ${beforeDet.stratagemCount} → ${afterDet.stratagemCount} (${diff > 0 ? '+' : ''}${diff})`);

      // Show specific stratagems added/removed
      const beforeStrats = new Set(beforeDet.stratagems);
      const afterStrats = new Set(afterDet.stratagems);
      const addedStrats = afterDet.stratagems.filter(s => !beforeStrats.has(s));
      const removedStrats = beforeDet.stratagems.filter(s => !afterStrats.has(s));

      for (const s of addedStrats.slice(0, 5)) {
        changes.push(`  + "${s}"`);
      }
      if (addedStrats.length > 5) {
        changes.push(`  ... and ${addedStrats.length - 5} more added`);
      }
      for (const s of removedStrats.slice(0, 5)) {
        changes.push(`  - "${s}"`);
      }
      if (removedStrats.length > 5) {
        changes.push(`  ... and ${removedStrats.length - 5} more removed`);
      }
    }

    // Compare enhancement counts and lists
    if (beforeDet.enhancementCount !== afterDet.enhancementCount) {
      const diff = afterDet.enhancementCount - beforeDet.enhancementCount;
      changes.push(`enhancements: ${beforeDet.enhancementCount} → ${afterDet.enhancementCount} (${diff > 0 ? '+' : ''}${diff})`);

      const beforeEnhs = new Set(beforeDet.enhancements);
      const afterEnhs = new Set(afterDet.enhancements);
      const addedEnhs = afterDet.enhancements.filter(e => !beforeEnhs.has(e));
      const removedEnhs = beforeDet.enhancements.filter(e => !afterEnhs.has(e));

      for (const e of addedEnhs.slice(0, 5)) {
        changes.push(`  + "${e}"`);
      }
      if (addedEnhs.length > 5) {
        changes.push(`  ... and ${addedEnhs.length - 5} more added`);
      }
      for (const e of removedEnhs.slice(0, 5)) {
        changes.push(`  - "${e}"`);
      }
      if (removedEnhs.length > 5) {
        changes.push(`  ... and ${removedEnhs.length - 5} more removed`);
      }
    }

    if (changes.length > 0) {
      if (!hasChanges) {
        console.log('Changed Detachments:');
        hasChanges = true;
      }
      console.log(`  [${afterValue.faction}] ${afterDet.name}:`);
      for (const change of changes) {
        console.log(`    ${change}`);
      }
    }
  }

  if (!hasChanges && added.length === 0 && removed.length === 0) {
    console.log('No detachment-level changes detected.');
  }
}

function generateDiffReport(before: DataSnapshot, after: DataSnapshot): void {
  console.log('='.repeat(70));
  console.log('DATA DIFF REPORT');
  console.log('='.repeat(70));
  console.log(`\nBefore: ${before.timestamp}`);
  console.log(`After:  ${after.timestamp}`);

  compareTotals(before, after);
  compareFactions(before, after);
  compareDetachments(before, after);

  console.log('\n' + '='.repeat(70));
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help') {
    console.log(`
Data Diff Report Tool

Commands:
  snapshot [name]              Create a new snapshot (optionally named)
  diff <before> <after>        Compare two snapshots
  compare-live <snapshot>      Compare a snapshot to live database
  list                         List available snapshots
  help                         Show this help message

Examples:
  npx tsx scripts/data-diff-report.ts snapshot before-reparse
  npx tsx scripts/data-diff-report.ts snapshot after-reparse
  npx tsx scripts/data-diff-report.ts diff before-reparse after-reparse
  npx tsx scripts/data-diff-report.ts compare-live before-reparse
`);
    return;
  }

  try {
    switch (command) {
      case 'snapshot': {
        console.log('Creating snapshot of current database state...');
        const snapshot = await createSnapshot();
        const name = args[1];
        const filePath = saveSnapshot(snapshot, name);
        console.log(`\nSnapshot saved to: ${filePath}`);
        console.log(`\nTotals:`);
        console.log(`  Factions:     ${snapshot.totals.factions}`);
        console.log(`  Detachments:  ${snapshot.totals.detachments}`);
        console.log(`  Stratagems:   ${snapshot.totals.stratagems}`);
        console.log(`  Enhancements: ${snapshot.totals.enhancements}`);
        console.log(`  Units:        ${snapshot.totals.units}`);
        break;
      }

      case 'diff': {
        const beforeName = args[1];
        const afterName = args[2];

        if (!beforeName || !afterName) {
          console.error('Usage: diff <before-snapshot> <after-snapshot>');
          process.exit(1);
        }

        const before = loadSnapshot(beforeName);
        const after = loadSnapshot(afterName);
        generateDiffReport(before, after);
        break;
      }

      case 'compare-live': {
        const snapshotName = args[1];

        if (!snapshotName) {
          console.error('Usage: compare-live <snapshot-name>');
          process.exit(1);
        }

        console.log('Loading snapshot and capturing live database state...');
        const before = loadSnapshot(snapshotName);
        const after = await createSnapshot();
        generateDiffReport(before, after);
        break;
      }

      case 'list': {
        const snapshots = listSnapshots();

        if (snapshots.length === 0) {
          console.log('No snapshots found.');
          console.log(`Snapshot directory: ${SNAPSHOT_DIR}`);
        } else {
          console.log('Available snapshots:\n');
          for (const name of snapshots) {
            const snapshot = loadSnapshot(name);
            console.log(`  ${name}`);
            console.log(`    Created: ${snapshot.timestamp}`);
            console.log(`    Totals: ${snapshot.totals.factions} factions, ${snapshot.totals.detachments} det, ${snapshot.totals.stratagems} strat\n`);
          }
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run with "help" for usage information.');
        process.exit(1);
    }
  } finally {
    await closeConnection();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
