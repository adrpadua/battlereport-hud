import 'dotenv/config';
import { getDb, closeConnection } from '../src/db/connection.js';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();

  // Get all units without keywords
  const unitsWithoutKeywords = await db.execute(sql`
    SELECT u.id, u.name, u.slug, f.name as faction_name, f.slug as faction_slug
    FROM units u
    JOIN factions f ON u.faction_id = f.id
    LEFT JOIN unit_keywords uk ON uk.unit_id = u.id
    WHERE uk.id IS NULL
    ORDER BY f.name, u.name
  `);

  console.log('Units without keywords (' + unitsWithoutKeywords.rows.length + '):\n');
  for (const row of unitsWithoutKeywords.rows as any[]) {
    console.log('  [' + row.faction_name + '] ' + row.name + ' (' + row.slug + ')');
  }

  // Check if any of these units exist in multiple factions
  console.log('\n=== Multi-faction check ===\n');
  const unitNames = (unitsWithoutKeywords.rows as any[]).map(r => r.name);
  const uniqueNames = [...new Set(unitNames)];

  for (const name of uniqueNames) {
    const occurrences = await db.execute(sql.raw(
      "SELECT u.name, u.slug, f.name as faction_name, " +
      "(SELECT COUNT(*) FROM unit_keywords uk WHERE uk.unit_id = u.id) as keyword_count " +
      "FROM units u JOIN factions f ON u.faction_id = f.id " +
      "WHERE u.name = '" + name.replace(/'/g, "''") + "' ORDER BY f.name"
    ));

    if (occurrences.rows.length > 1) {
      console.log(name + ' (exists in ' + occurrences.rows.length + ' factions):');
      for (const occ of occurrences.rows as any[]) {
        console.log('  ' + occ.faction_name + ': ' + occ.keyword_count + ' keywords');
      }
    } else {
      const occ = occurrences.rows[0] as any;
      console.log(name + ' [' + occ.faction_name + ']: ' + occ.keyword_count + ' keywords');
    }
  }

  // Check for "Not Found" units
  console.log('\n=== Units with "Not Found" in name ===\n');
  const notFoundUnits = await db.execute(sql`
    SELECT u.name, u.slug, f.name as faction_name
    FROM units u
    JOIN factions f ON u.faction_id = f.id
    WHERE u.name LIKE '%Not Found%' OR u.slug LIKE '%not-found%'
  `);
  console.log('Found ' + notFoundUnits.rows.length + ' "Not Found" units:');
  for (const row of notFoundUnits.rows as any[]) {
    console.log('  [' + row.faction_name + '] ' + row.name + ' (' + row.slug + ')');
  }

  await closeConnection();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
