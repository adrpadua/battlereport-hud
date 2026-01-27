#!/usr/bin/env npx tsx
/**
 * Diagnose why detachments are missing stratagems/enhancements
 */

import 'dotenv/config';
import { getDb, closeConnection } from '../src/db/connection.js';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();

  // Get Leagues of Votann as an example
  const factionResult = await db.execute(sql`SELECT id, name FROM factions WHERE slug = 'leagues-of-votann'`);
  const faction = factionResult.rows[0] as { id: string; name: string };
  console.log('Faction:', faction.name);

  // Get all detachments for this faction
  console.log('\n=== DETACHMENTS ===');
  const detachments = await db.execute(sql`
    SELECT d.id, d.name, d.slug,
      (SELECT COUNT(*) FROM stratagems s WHERE s.detachment_id = d.id) as strat_count,
      (SELECT COUNT(*) FROM enhancements e WHERE e.detachment_id = d.id) as enh_count
    FROM detachments d
    WHERE d.faction_id = ${faction.id}
    ORDER BY d.name
  `);
  for (const d of detachments.rows as any[]) {
    const marker = d.strat_count === '0' ? '❌' : '✓';
    console.log(`  ${marker} ${d.name} (stratagems: ${d.strat_count}, enhancements: ${d.enh_count})`);
  }

  // Get all stratagems for this faction and their detachment assignment
  console.log('\n=== STRATAGEMS (grouped by detachment) ===');
  const stratagems = await db.execute(sql`
    SELECT s.name, s.detachment_id, d.name as det_name
    FROM stratagems s
    LEFT JOIN detachments d ON s.detachment_id = d.id
    WHERE s.faction_id = ${faction.id}
    ORDER BY COALESCE(d.name, 'ZZZZZ'), s.name
  `);

  let currentDet = '';
  for (const s of stratagems.rows as any[]) {
    const detName = s.det_name || 'NO DETACHMENT (faction-level)';
    if (detName !== currentDet) {
      console.log(`\n  [${detName}]`);
      currentDet = detName;
    }
    console.log(`    - ${s.name}`);
  }

  // Now let's check what detachment names the parser found vs what's in the DB
  console.log('\n\n=== CHECKING DRUKHARI (another example) ===');

  const drukhariFaction = await db.execute(sql`SELECT id, name FROM factions WHERE slug = 'drukhari'`);
  const drukhariId = (drukhariFaction.rows[0] as any).id;

  console.log('\nDrukhari Detachments:');
  const drukhariDets = await db.execute(sql`
    SELECT d.id, d.name, d.slug,
      (SELECT COUNT(*) FROM stratagems s WHERE s.detachment_id = d.id) as strat_count,
      (SELECT COUNT(*) FROM enhancements e WHERE e.detachment_id = d.id) as enh_count
    FROM detachments d
    WHERE d.faction_id = ${drukhariId}
    ORDER BY d.name
  `);
  for (const d of drukhariDets.rows as any[]) {
    const marker = d.strat_count === '0' ? '❌' : '✓';
    console.log(`  ${marker} ${d.name} (stratagems: ${d.strat_count}, enhancements: ${d.enh_count})`);
  }

  // Check if there are stratagems without detachment_id
  console.log('\n=== STRATAGEMS WITHOUT DETACHMENT_ID ===');
  const unlinkedStrats = await db.execute(sql`
    SELECT s.name, f.name as faction_name
    FROM stratagems s
    JOIN factions f ON s.faction_id = f.id
    WHERE s.detachment_id IS NULL
    ORDER BY f.name, s.name
    LIMIT 30
  `);

  let currentFaction = '';
  for (const s of unlinkedStrats.rows as any[]) {
    if (s.faction_name !== currentFaction) {
      console.log(`\n  [${s.faction_name}]`);
      currentFaction = s.faction_name;
    }
    console.log(`    - ${s.name}`);
  }

  await closeConnection();
}

main().catch(console.error);
