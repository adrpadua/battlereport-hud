import 'dotenv/config';
import { getDb, closeConnection } from '../db/connection.js';
import { sql } from 'drizzle-orm';

const db = getDb();

async function checkIntegrity() {
  console.log('=== DATA INTEGRITY REPORT ===\n');

  // 1. Faction summary
  console.log('--- FACTION SUMMARY ---');
  const factionCounts = await db.execute(sql`
    SELECT f.name,
           COUNT(DISTINCT u.id) as units,
           COUNT(DISTINCT d.id) as detachments,
           COUNT(DISTINCT s.id) as stratagems
    FROM factions f
    LEFT JOIN units u ON u.faction_id = f.id
    LEFT JOIN detachments d ON d.faction_id = f.id
    LEFT JOIN stratagems s ON s.faction_id = f.id
    GROUP BY f.id, f.name
    ORDER BY f.name
  `);
  console.table(factionCounts.rows);

  // 2. Totals
  console.log('\n--- TOTALS ---');
  const totals = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM factions) as factions,
      (SELECT COUNT(*) FROM units) as units,
      (SELECT COUNT(*) FROM weapons) as weapons,
      (SELECT COUNT(*) FROM abilities) as abilities,
      (SELECT COUNT(*) FROM stratagems) as stratagems,
      (SELECT COUNT(*) FROM detachments) as detachments,
      (SELECT COUNT(*) FROM enhancements) as enhancements,
      (SELECT COUNT(*) FROM keywords) as keywords
  `);
  console.table(totals.rows);

  // 3. Unit index vs units comparison
  console.log('\n--- UNIT INDEX VS UNITS TABLE ---');
  const indexVsUnits = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM unit_index WHERE scrape_status = 'success') as indexed_success,
      (SELECT COUNT(*) FROM unit_index WHERE scrape_status = 'pending') as indexed_pending,
      (SELECT COUNT(*) FROM unit_index WHERE scrape_status = 'failed') as indexed_failed,
      (SELECT COUNT(*) FROM units) as total_units
  `);
  console.table(indexVsUnits.rows);

  // 4. Units without weapons
  console.log('\n--- UNITS WITHOUT WEAPONS ---');
  const noWeapons = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM units u
    LEFT JOIN unit_weapons uw ON uw.unit_id = u.id
    WHERE uw.id IS NULL
  `);
  console.log(`Units without weapons: ${noWeapons.rows[0]?.count || 0}`);

  // 5. Units without abilities
  console.log('\n--- UNITS WITHOUT ABILITIES ---');
  const noAbilities = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM units u
    LEFT JOIN unit_abilities ua ON ua.unit_id = u.id
    WHERE ua.id IS NULL
  `);
  console.log(`Units without abilities: ${noAbilities.rows[0]?.count || 0}`);

  // 6. Orphan check
  console.log('\n--- ORPHAN CHECK ---');
  const orphans = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM unit_weapons uw WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.id = uw.unit_id)) as orphan_unit_weapons,
      (SELECT COUNT(*) FROM unit_abilities ua WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.id = ua.unit_id)) as orphan_unit_abilities,
      (SELECT COUNT(*) FROM stratagems s WHERE s.faction_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM factions f WHERE f.id = s.faction_id)) as orphan_stratagems
  `);
  console.table(orphans.rows);

  // 7. Duplicate check
  console.log('\n--- DUPLICATE CHECK ---');
  const duplicates = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM (SELECT slug, faction_id FROM units GROUP BY slug, faction_id HAVING COUNT(*) > 1) dup) as duplicate_units,
      (SELECT COUNT(*) FROM (SELECT name FROM weapons GROUP BY name HAVING COUNT(*) > 1) dup) as duplicate_weapons,
      (SELECT COUNT(*) FROM (SELECT slug, faction_id FROM stratagems WHERE faction_id IS NOT NULL GROUP BY slug, faction_id HAVING COUNT(*) > 1) dup) as duplicate_stratagems
  `);
  console.table(duplicates.rows);

  // 8. List units without weapons
  console.log('\n--- UNITS WITHOUT WEAPONS (first 20) ---');
  const noWeaponsList = await db.execute(sql`
    SELECT f.slug as faction, u.name
    FROM units u
    JOIN factions f ON u.faction_id = f.id
    LEFT JOIN unit_weapons uw ON uw.unit_id = u.id
    WHERE uw.id IS NULL
    ORDER BY f.slug, u.name
    LIMIT 20
  `);
  console.table(noWeaponsList.rows);

  // 9. List units without abilities
  console.log('\n--- UNITS WITHOUT ABILITIES ---');
  const noAbilitiesList = await db.execute(sql`
    SELECT f.slug as faction, u.name
    FROM units u
    JOIN factions f ON u.faction_id = f.id
    LEFT JOIN unit_abilities ua ON ua.unit_id = u.id
    WHERE ua.id IS NULL
    ORDER BY f.slug, u.name
  `);
  console.table(noAbilitiesList.rows);

  // 10. Enhancement count breakdown (suspicious high count)
  console.log('\n--- ENHANCEMENT BREAKDOWN ---');
  const enhBreakdown = await db.execute(sql`
    SELECT f.name as faction, d.name as detachment, COUNT(e.id) as enhancements
    FROM enhancements e
    JOIN detachments d ON e.detachment_id = d.id
    JOIN factions f ON d.faction_id = f.id
    GROUP BY f.name, d.name
    ORDER BY COUNT(e.id) DESC
    LIMIT 15
  `);
  console.table(enhBreakdown.rows);

  await closeConnection();
}

checkIntegrity().catch(console.error);
