#!/usr/bin/env npx tsx
/**
 * Clean up junk unit entries created from scraping artifacts:
 * - "Not Found" pages (Wahapedia 404s)
 * - Cloudflare bot check pages
 * - Mangled HTML content parsed as unit names
 * - Faction pages incorrectly parsed as units
 */

import 'dotenv/config';
import { getDb, closeConnection } from '../src/db/connection.js';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();

  // Find junk units
  const junkUnits = await db.execute(sql`
    SELECT u.id, u.name, u.slug, f.name as faction_name
    FROM units u
    JOIN factions f ON u.faction_id = f.id
    WHERE
      u.name = 'Not Found'
      OR u.slug = 'not-found'
      OR u.name LIKE '%Verifying Browser%'
      OR u.name LIKE '%Boarding Actions%'
      OR u.name IN (SELECT name FROM factions)
    ORDER BY f.name, u.name
  `);

  console.log('Found ' + junkUnits.rows.length + ' junk units to remove:\n');
  for (const row of junkUnits.rows as any[]) {
    console.log('  [' + row.faction_name + '] ' + row.name + ' (' + row.slug + ')');
  }

  if (junkUnits.rows.length === 0) {
    console.log('No junk units found.');
    await closeConnection();
    return;
  }

  const ids = (junkUnits.rows as any[]).map(r => r.id);
  const idList = ids.join(', ');

  console.log('\nDeleting associated data...');

  // Delete unit_keywords
  const kwResult = await db.execute(sql.raw(
    'DELETE FROM unit_keywords WHERE unit_id IN (' + idList + ')'
  ));
  console.log('  Deleted unit_keywords: ' + kwResult.rowCount);

  // Delete unit_abilities
  const abResult = await db.execute(sql.raw(
    'DELETE FROM unit_abilities WHERE unit_id IN (' + idList + ')'
  ));
  console.log('  Deleted unit_abilities: ' + abResult.rowCount);

  // Delete unit_weapons junction records
  const uwResult = await db.execute(sql.raw(
    'DELETE FROM unit_weapons WHERE unit_id IN (' + idList + ')'
  ));
  console.log('  Deleted unit_weapons: ' + uwResult.rowCount);

  // Delete the units
  const unitResult = await db.execute(sql.raw(
    'DELETE FROM units WHERE id IN (' + idList + ')'
  ));
  console.log('  Deleted units: ' + unitResult.rowCount);

  console.log('\nCleanup complete!');

  await closeConnection();
}

main().catch(console.error);
