#!/usr/bin/env npx tsx
/**
 * Clean up duplicate detachments (those with numbered suffixes like "Feast of Pain 1")
 */

import 'dotenv/config';
import { getDb, closeConnection } from '../src/db/connection.js';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();

  // Find and delete detachments with numbered suffixes in their slug
  // These are duplicates created by parsing numbered anchor variants
  const duplicates = await db.execute(sql`
    SELECT d.id, d.name, d.slug, f.name as faction_name
    FROM detachments d
    JOIN factions f ON d.faction_id = f.id
    WHERE d.slug SIMILAR TO '%-[0-9]+'
    ORDER BY f.name, d.name
  `);

  console.log(`Found ${duplicates.rows.length} duplicate detachments to delete:\n`);

  for (const d of duplicates.rows as any[]) {
    console.log(`  ${d.faction_name}: ${d.name} (${d.slug})`);
  }

  if (duplicates.rows.length === 0) {
    console.log('No duplicates found.');
    await closeConnection();
    return;
  }

  // Also find and delete invalid detachments like "Army Rule" and "Rules Adaptations"
  const invalidDets = await db.execute(sql`
    SELECT d.id, d.name, d.slug, f.name as faction_name
    FROM detachments d
    JOIN factions f ON d.faction_id = f.id
    WHERE LOWER(d.name) IN ('army rule', 'army rules', 'rules adaptations')
    ORDER BY f.name, d.name
  `);

  console.log(`\nFound ${invalidDets.rows.length} invalid detachments to delete:\n`);
  for (const d of invalidDets.rows as any[]) {
    console.log(`  ${d.faction_name}: ${d.name} (${d.slug})`);
  }

  const allToDelete = [...duplicates.rows, ...invalidDets.rows] as any[];
  const idsToDelete = allToDelete.map((d: any) => d.id);

  if (idsToDelete.length === 0) {
    console.log('\nNothing to delete.');
    await closeConnection();
    return;
  }

  console.log(`\nDeleting ${idsToDelete.length} detachments...`);

  // Build the IN clause manually for proper SQL array handling
  const idList = idsToDelete.join(', ');

  // Delete associated enhancements first (foreign key constraint)
  const enhResult = await db.execute(sql.raw(`
    DELETE FROM enhancements WHERE detachment_id IN (${idList})
  `));
  console.log(`  Deleted enhancements: ${enhResult.rowCount}`);

  // Delete associated stratagems (set detachment_id to null instead of deleting)
  const stratResult = await db.execute(sql.raw(`
    UPDATE stratagems SET detachment_id = NULL WHERE detachment_id IN (${idList})
  `));
  console.log(`  Unlinked stratagems: ${stratResult.rowCount}`);

  // Delete the detachments
  const detResult = await db.execute(sql.raw(`
    DELETE FROM detachments WHERE id IN (${idList})
  `));
  console.log(`  Deleted detachments: ${detResult.rowCount}`);

  console.log('\nCleanup complete!');

  await closeConnection();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
