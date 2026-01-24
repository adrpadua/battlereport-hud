import 'dotenv/config';
import { getDb, closeConnection } from '../db/connection.js';
import { sql } from 'drizzle-orm';

const db = getDb();

async function cleanupGarbageUnits() {
  console.log('=== CLEANING GARBAGE UNITS ===\n');

  // First, show what we'll delete
  console.log('Garbage units to delete:');
  const garbage = await db.execute(sql`
    SELECT f.slug as faction, u.name
    FROM units u
    JOIN factions f ON u.faction_id = f.id
    WHERE u.name LIKE '%Not Found%'
       OR u.name LIKE '%Verifying Browser%'
       OR u.name LIKE '%|     |%'
       OR u.name IN ('Characters', 'Battleline\\', 'Dedicated Transports\\', 'Other\\')
       OR u.name LIKE '%# Not Found%'
    ORDER BY f.slug, u.name
  `);
  console.table(garbage.rows);

  // Get IDs of garbage units
  const garbageIds = await db.execute(sql`
    SELECT id FROM units
    WHERE name LIKE '%Not Found%'
       OR name LIKE '%Verifying Browser%'
       OR name LIKE '%|     |%'
       OR name IN ('Characters', 'Battleline\\', 'Dedicated Transports\\', 'Other\\')
       OR name LIKE '%# Not Found%'
  `);

  const ids = garbageIds.rows.map(r => (r as { id: number }).id);
  console.log(`\nFound ${ids.length} garbage units to delete`);

  if (ids.length > 0) {
    // Delete related records first (foreign key constraints)
    console.log('\nDeleting related unit_weapons...');
    const deletedWeapons = await db.execute(sql`
      DELETE FROM unit_weapons WHERE unit_id IN (
        SELECT id FROM units
        WHERE name LIKE '%Not Found%'
           OR name LIKE '%Verifying Browser%'
           OR name LIKE '%|     |%'
           OR name IN ('Characters', 'Battleline\\', 'Dedicated Transports\\', 'Other\\')
           OR name LIKE '%# Not Found%'
      )
    `);
    console.log(`Deleted ${deletedWeapons.rowCount} unit_weapons`);

    console.log('Deleting related unit_abilities...');
    const deletedAbilities = await db.execute(sql`
      DELETE FROM unit_abilities WHERE unit_id IN (
        SELECT id FROM units
        WHERE name LIKE '%Not Found%'
           OR name LIKE '%Verifying Browser%'
           OR name LIKE '%|     |%'
           OR name IN ('Characters', 'Battleline\\', 'Dedicated Transports\\', 'Other\\')
           OR name LIKE '%# Not Found%'
      )
    `);
    console.log(`Deleted ${deletedAbilities.rowCount} unit_abilities`);

    console.log('Deleting garbage units...');
    const deletedUnits = await db.execute(sql`
      DELETE FROM units
      WHERE name LIKE '%Not Found%'
         OR name LIKE '%Verifying Browser%'
         OR name LIKE '%|     |%'
         OR name IN ('Characters', 'Battleline\\', 'Dedicated Transports\\', 'Other\\')
         OR name LIKE '%# Not Found%'
    `);
    console.log(`Deleted ${deletedUnits.rowCount} units`);

    // Clean up units with embedded markdown noise
    console.log('Cleaning units with embedded markdown...');
    const markdownNoise = await db.execute(sql`
      DELETE FROM units
      WHERE name LIKE '%This datasheet does not meet%'
         OR LENGTH(name) > 100
      RETURNING id, name
    `);
    console.log(`Deleted ${markdownNoise.rowCount} units with markdown noise`);

    // Also remove from unit_index
    console.log('Cleaning unit_index...');
    const deletedIndex = await db.execute(sql`
      DELETE FROM unit_index
      WHERE name LIKE '%Not Found%'
         OR name LIKE '%Verifying Browser%'
         OR name LIKE '%|     |%'
         OR name IN ('Characters', 'Battleline\\', 'Dedicated Transports\\', 'Other\\')
         OR name LIKE '%# Not Found%'
    `);
    console.log(`Deleted ${deletedIndex.rowCount} from unit_index`);
  }

  // Final count
  const finalCount = await db.execute(sql`SELECT COUNT(*) as count FROM units`);
  console.log(`\nFinal unit count: ${finalCount.rows[0]?.count}`);

  await closeConnection();
}

cleanupGarbageUnits().catch(console.error);
