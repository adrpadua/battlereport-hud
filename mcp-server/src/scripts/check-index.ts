import 'dotenv/config';
import { getDb, closeConnection } from '../db/connection.js';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();

  const result = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM unit_index
    WHERE wahapedia_url LIKE '%/space-marines/%'
  `);

  console.log('Space Marines in unit_index:', result.rows[0]);

  // Show a few examples
  const examples = await db.execute(sql`
    SELECT name, wahapedia_url
    FROM unit_index
    WHERE wahapedia_url LIKE '%/space-marines/%'
    LIMIT 5
  `);

  console.log('\nExamples:');
  for (const row of examples.rows as any[]) {
    console.log(`  ${row.name}: ${row.wahapedia_url}`);
  }

  await closeConnection();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
