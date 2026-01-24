import 'dotenv/config';
import { getDb, closeConnection } from '../db/connection.js';
import { sql } from 'drizzle-orm';

const db = getDb();

async function cleanup() {
  console.log('=== CLEANUP BAD DATA ===\n');

  // Step 1: Delete ALL enhancements first (foreign key constraint)
  console.log('Deleting all enhancements (will re-parse)...');
  const deletedEnhancements = await db.execute(sql`DELETE FROM enhancements`);
  console.log(`Deleted ${deletedEnhancements.rowCount} enhancements`);

  // Step 2: Delete detachments with markdown artifacts or bad names
  console.log('\nDeleting bad detachments...');
  const badDetachments = await db.execute(sql`
    DELETE FROM detachments
    WHERE name LIKE '%!%[%'
       OR name LIKE '%http%'
       OR name LIKE '%#%Not Found%'
       OR name LIKE '%Rules Adaptations%'
    RETURNING id, name
  `);
  console.log(`Deleted ${badDetachments.rowCount} bad detachments`);
  if (badDetachments.rows.length > 0) {
    console.table(badDetachments.rows);
  }

  // Step 3: Show remaining detachments count
  const detachmentCount = await db.execute(sql`SELECT COUNT(*) as count FROM detachments`);
  console.log(`\nRemaining detachments: ${detachmentCount.rows[0]?.count}`);

  await closeConnection();
  console.log('\nDone! Now run: npm run cli wahapedia parse factions');
}

cleanup().catch(console.error);
