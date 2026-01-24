import 'dotenv/config';
import { getDb, closeConnection } from '../db/connection.js';
import { unitIndex, factions } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const db = getDb();

// Units that don't exist on Wahapedia (redirect to datasheets page)
const unitsToRemove = [
  { faction: 'aeldari', slug: 'D-cannon-Platform' },
  { faction: 'imperial-agents', slug: 'UR-025' },
  { faction: 'adeptus-mechanicus', slug: 'X-101' },
  { faction: 't-au-empire', slug: 'AX-1-0-Tiger-Shark' },
];

async function removeUnits() {
  console.log('Removing invalid units from unit_index...\n');

  for (const unit of unitsToRemove) {
    // Get faction ID
    const faction = await db.select().from(factions).where(eq(factions.slug, unit.faction)).limit(1);
    if (!faction.length) {
      console.log(`Faction ${unit.faction} not found`);
      continue;
    }

    const result = await db.delete(unitIndex)
      .where(and(
        eq(unitIndex.slug, unit.slug),
        eq(unitIndex.factionId, faction[0].id)
      ))
      .returning();
    console.log(`Removed ${unit.faction}/${unit.slug}: ${result.length} row(s)`);
  }

  console.log('\nDone!');
  await closeConnection();
}

removeUnits().catch(console.error);
