import 'dotenv/config';
import { getDb, closeConnection } from '../db/connection.js';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();

  console.log('=== CLEANING UP DUPLICATES ===\n');

  // 1. Remove duplicate unit_abilities (keep one of each unit_id + ability_id combo)
  console.log('1. Cleaning duplicate unit_abilities...');
  const dupeAbilities = await db.execute(sql`
    DELETE FROM unit_abilities
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM unit_abilities
      GROUP BY unit_id, ability_id
    )
  `);
  console.log(`   Removed ${dupeAbilities.rowCount || 0} duplicate ability links`);

  // 2. Remove duplicate unit_weapons (keep one of each unit_id + weapon_id combo)
  console.log('2. Cleaning duplicate unit_weapons...');
  const dupeWeapons = await db.execute(sql`
    DELETE FROM unit_weapons
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM unit_weapons
      GROUP BY unit_id, weapon_id
    )
  `);
  console.log(`   Removed ${dupeWeapons.rowCount || 0} duplicate weapon links`);

  // 3. Remove orphaned abilities (not linked to any unit)
  console.log('3. Cleaning orphaned abilities...');
  const orphanedAbilities = await db.execute(sql`
    DELETE FROM abilities
    WHERE id NOT IN (
      SELECT DISTINCT ability_id FROM unit_abilities
    )
  `);
  console.log(`   Removed ${orphanedAbilities.rowCount || 0} orphaned abilities`);

  // 4. Show current counts
  console.log('\n=== CURRENT COUNTS ===');
  const counts = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM units) as units,
      (SELECT COUNT(*) FROM weapons) as weapons,
      (SELECT COUNT(*) FROM abilities) as abilities,
      (SELECT COUNT(*) FROM unit_weapons) as unit_weapons,
      (SELECT COUNT(*) FROM unit_abilities) as unit_abilities
  `);
  const row = (counts.rows || counts)[0] as Record<string, number> | undefined;
  if (row) {
    console.log(`   Units: ${row.units}`);
    console.log(`   Weapons: ${row.weapons}`);
    console.log(`   Abilities: ${row.abilities}`);
    console.log(`   Unit-Weapon links: ${row.unit_weapons}`);
    console.log(`   Unit-Ability links: ${row.unit_abilities}`);
  }

  await closeConnection();
}

main().catch(console.error);
