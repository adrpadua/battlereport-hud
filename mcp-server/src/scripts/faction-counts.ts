import 'dotenv/config';
import { getDb, closeConnection } from '../db/connection.js';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT f.name, f.slug, COUNT(u.id) as unit_count
    FROM factions f
    LEFT JOIN units u ON f.id = u.faction_id
    GROUP BY f.id, f.name, f.slug
    ORDER BY unit_count DESC, f.name
  `);

  console.log('=== FACTION UNIT COUNTS ===\n');
  let scraped = 0;
  let pending = 0;
  const rows = result.rows || result;
  for (const row of rows) {
    const count = Number(row.unit_count);
    const status = count > 0 ? '✅' : '⏳';
    if (count > 0) scraped++; else pending++;
    console.log(`${status} ${row.name}: ${count} units`);
  }
  console.log(`\nScraped: ${scraped} | Pending: ${pending}`);

  await closeConnection();
}
main();
