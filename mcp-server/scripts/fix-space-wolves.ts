/**
 * Fix the broken Space Wolves faction entry in the database.
 * The entry has slug "space-wolves" but name "Not Found", which interferes
 * with the subfaction lookup for Space Wolves (which should route to Space Marines).
 */

import 'dotenv/config';
import { getDb } from '../src/db/connection.js';
import { eq } from 'drizzle-orm';
import { factions } from '../src/db/schema.js';

async function main() {
  const db = getDb();

  // Find the broken faction
  const brokenFaction = await db.select().from(factions).where(eq(factions.slug, 'space-wolves')).limit(1);
  console.log('Found faction with slug "space-wolves":', brokenFaction);

  if (brokenFaction.length > 0 && brokenFaction[0]!.name === 'Not Found') {
    // Delete it
    await db.delete(factions).where(eq(factions.slug, 'space-wolves'));
    console.log('Deleted broken Space Wolves faction entry');

    // Verify deletion
    const verify = await db.select().from(factions).where(eq(factions.slug, 'space-wolves')).limit(1);
    console.log('Verification - should be empty:', verify);
  } else if (brokenFaction.length > 0) {
    console.log('Faction exists but name is not "Not Found", skipping');
  } else {
    console.log('No broken entry to delete');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
