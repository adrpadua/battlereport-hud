import 'dotenv/config';
import { getDb, closeConnection } from '../src/db/connection.js';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();

  // Check for Legends units
  console.log('=== Checking for Legends Units ===');
  const legendsUnits = await db.execute(sql`
    SELECT name, slug FROM units
    WHERE LOWER(name) LIKE '%legend%'
       OR LOWER(slug) LIKE '%legend%'
       OR legends = true
    LIMIT 10
  `);
  console.log('Found ' + legendsUnits.rows.length + ' units with "legend" in name/slug or legends=true');
  if (legendsUnits.rows.length > 0) {
    console.table(legendsUnits.rows);
  }

  // Check for Boarding Actions content
  console.log('\n=== Checking for Boarding Actions ===');
  const boardingStratagems = await db.execute(sql`
    SELECT name, slug FROM stratagems
    WHERE LOWER(name) LIKE '%boarding%'
       OR LOWER(slug) LIKE '%boarding%'
    LIMIT 10
  `);
  console.log('Found ' + boardingStratagems.rows.length + ' stratagems with "boarding" in name');

  const boardingDetachments = await db.execute(sql`
    SELECT name, slug FROM detachments
    WHERE LOWER(name) LIKE '%boarding%'
       OR LOWER(slug) LIKE '%boarding%'
    LIMIT 10
  `);
  console.log('Found ' + boardingDetachments.rows.length + ' detachments with "boarding" in name');

  // Check some known Legends units that should NOT be in DB
  console.log('\n=== Checking Known Legends Units (should NOT exist) ===');
  const knownLegends = ['Malanthrope', 'Dimachaeron', 'Barbed Hierodule', 'Harridan'];
  for (const name of knownLegends) {
    const result = await db.execute(sql.raw(
      "SELECT name FROM units WHERE LOWER(name) LIKE '%" + name.toLowerCase() + "%'"
    ));
    const status = result.rows.length > 0 ? '❌ FOUND (should not exist)' : '✓ Not found';
    console.log('  ' + name + ': ' + status);
  }

  // Check boarding stratagem details
  console.log('\n=== Boarding Stratagem Details ===');
  const boardingDetails = await db.execute(sql`
    SELECT s.name, s.slug, f.name as faction
    FROM stratagems s
    JOIN factions f ON s.faction_id = f.id
    WHERE LOWER(s.name) LIKE '%boarding%'
  `);
  if (boardingDetails.rows.length > 0) {
    console.table(boardingDetails.rows);
  }

  // Check unit count
  console.log('\n=== Unit Counts ===');
  const unitCount = await db.execute(sql`SELECT COUNT(*) as cnt FROM units`);
  console.log('Total units:', (unitCount.rows[0] as any).cnt);

  // Sample of actual units to verify we have real data
  console.log('\n=== Sample Units (should exist) ===');
  const sampleUnits = await db.execute(sql`
    SELECT u.name, f.name as faction
    FROM units u
    JOIN factions f ON u.faction_id = f.id
    LIMIT 10
  `);
  console.table(sampleUnits.rows);

  await closeConnection();
}

main().catch(console.error);
