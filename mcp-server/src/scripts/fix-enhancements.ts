import 'dotenv/config';
import { getDb, closeConnection } from '../db/connection.js';
import { sql } from 'drizzle-orm';

const db = getDb();

async function fixEnhancements() {
  console.log('=== FIXING ENHANCEMENT DUPLICATES ===\n');

  // Step 1: Count current state
  const beforeCount = await db.execute(sql`SELECT COUNT(*) as count FROM enhancements`);
  console.log(`Current enhancement count: ${beforeCount.rows[0]?.count}`);

  // Step 2: Show what we'll keep (distinct by slug + detachment_id)
  const uniqueCount = await db.execute(sql`
    SELECT COUNT(*) as count FROM (
      SELECT DISTINCT ON (slug, detachment_id) id
      FROM enhancements
      ORDER BY slug, detachment_id, id
    ) unique_enhancements
  `);
  console.log(`Unique (slug, detachment_id) combinations: ${uniqueCount.rows[0]?.count}`);

  // Step 3: Delete duplicates, keeping only the first of each (slug, detachment_id)
  console.log('\nDeleting duplicates (keeping first of each slug+detachment_id)...');

  const deleteResult = await db.execute(sql`
    DELETE FROM enhancements
    WHERE id NOT IN (
      SELECT DISTINCT ON (slug, detachment_id) id
      FROM enhancements
      ORDER BY slug, detachment_id, id
    )
  `);
  console.log(`Deleted rows: ${deleteResult.rowCount}`);

  // Step 4: Verify final count
  const afterCount = await db.execute(sql`SELECT COUNT(*) as count FROM enhancements`);
  console.log(`\nFinal enhancement count: ${afterCount.rows[0]?.count}`);

  // Step 5: Show breakdown by faction
  console.log('\n--- Enhancement breakdown by faction ---');
  const breakdown = await db.execute(sql`
    SELECT f.name as faction, COUNT(e.id) as count
    FROM enhancements e
    JOIN detachments d ON e.detachment_id = d.id
    JOIN factions f ON d.faction_id = f.id
    GROUP BY f.name
    ORDER BY f.name
  `);
  console.table(breakdown.rows);

  // Step 6: Add unique constraint if not exists
  console.log('\nAdding unique constraint on (slug, detachment_id)...');
  try {
    await db.execute(sql`
      ALTER TABLE enhancements
      ADD CONSTRAINT enhancements_slug_detachment_unique
      UNIQUE (slug, detachment_id)
    `);
    console.log('Unique constraint added successfully');
  } catch (error) {
    if ((error as { code?: string }).code === '42710') {
      console.log('Unique constraint already exists');
    } else {
      throw error;
    }
  }

  await closeConnection();
}

fixEnhancements().catch(console.error);
