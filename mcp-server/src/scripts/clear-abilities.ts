import 'dotenv/config';
import { getDb, closeConnection } from '../db/connection.js';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();

  console.log('Clearing unit_abilities...');
  const ua = await db.execute(sql`DELETE FROM unit_abilities`);
  console.log(`  Deleted ${ua.rowCount || 0} rows`);

  console.log('Clearing abilities...');
  const a = await db.execute(sql`DELETE FROM abilities`);
  console.log(`  Deleted ${a.rowCount || 0} rows`);

  console.log('Done!');
  await closeConnection();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
