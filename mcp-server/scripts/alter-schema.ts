import 'dotenv/config';
import { getDb, closeConnection } from '../src/db/connection.js';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();

  console.log('Widening all varchar columns to avoid truncation...');

  // Units table
  await db.execute(sql`ALTER TABLE units ALTER COLUMN base_size TYPE varchar(255)`);
  await db.execute(sql`ALTER TABLE units ALTER COLUMN movement TYPE varchar(100)`);

  // Weapons table - widen all stat columns
  await db.execute(sql`ALTER TABLE weapons ALTER COLUMN range TYPE varchar(100)`);
  await db.execute(sql`ALTER TABLE weapons ALTER COLUMN attacks TYPE varchar(100)`);
  await db.execute(sql`ALTER TABLE weapons ALTER COLUMN damage TYPE varchar(100)`);
  await db.execute(sql`ALTER TABLE weapons ALTER COLUMN skill TYPE varchar(100)`);
  await db.execute(sql`ALTER TABLE weapons ALTER COLUMN strength TYPE varchar(100)`);
  await db.execute(sql`ALTER TABLE weapons ALTER COLUMN armor_penetration TYPE varchar(100)`);

  // Abilities table
  await db.execute(sql`ALTER TABLE abilities ALTER COLUMN ability_type TYPE varchar(255)`);

  // Factions table
  await db.execute(sql`ALTER TABLE factions ALTER COLUMN short_name TYPE varchar(255)`);

  console.log('Done');
  await closeConnection();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
