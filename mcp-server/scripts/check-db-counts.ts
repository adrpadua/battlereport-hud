import 'dotenv/config';
import { getDb, closeConnection } from '../src/db/connection.js';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();

  const units = await db.execute(sql`
    SELECT f.name as faction, COUNT(u.id) as unit_count
    FROM factions f
    LEFT JOIN units u ON u.faction_id = f.id
    WHERE f.slug != 'unaligned-forces'
    GROUP BY f.name
    ORDER BY unit_count DESC
  `);

  console.log('Units per faction:');
  console.table(units.rows);

  const totals = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM factions WHERE slug != 'unaligned-forces') as factions,
      (SELECT COUNT(*) FROM detachments) as detachments,
      (SELECT COUNT(*) FROM stratagems) as stratagems,
      (SELECT COUNT(*) FROM enhancements) as enhancements,
      (SELECT COUNT(*) FROM units) as units,
      (SELECT COUNT(*) FROM weapons) as weapons
  `);
  console.log('\nDatabase totals:');
  console.table(totals.rows);

  await closeConnection();
}

main().catch(console.error);
