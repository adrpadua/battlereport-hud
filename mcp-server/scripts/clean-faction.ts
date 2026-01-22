import { getDb, closeConnection } from '../src/db/connection.js';
import { sql } from 'drizzle-orm';

const factionSlug = process.argv[2] || 'tyranids';
const db = getDb();

async function cleanFaction() {
  console.log(`Cleaning faction: ${factionSlug}`);

  // Get faction ID
  const result = await db.execute(sql`SELECT id FROM factions WHERE slug = ${factionSlug}`);
  console.log('Query result:', JSON.stringify(result, null, 2));
  const rows = result.rows || result;
  if (!rows || rows.length === 0) {
    console.log('Faction not found');
    process.exit(1);
  }
  const factionId = rows[0].id as number;
  console.log('Faction ID:', factionId);

  // Delete unit_weapons for faction units
  await db.execute(sql`
    DELETE FROM unit_weapons
    WHERE unit_id IN (SELECT id FROM units WHERE faction_id = ${factionId})
  `);
  console.log('Deleted unit_weapons');

  // Delete unit_abilities for faction units
  await db.execute(sql`
    DELETE FROM unit_abilities
    WHERE unit_id IN (SELECT id FROM units WHERE faction_id = ${factionId})
  `);
  console.log('Deleted unit_abilities');

  // Delete orphaned weapons (not linked to any unit)
  await db.execute(sql`
    DELETE FROM weapons
    WHERE id NOT IN (SELECT DISTINCT weapon_id FROM unit_weapons)
  `);
  console.log('Deleted orphaned weapons');

  // Delete orphaned abilities (not linked to any unit)
  await db.execute(sql`
    DELETE FROM abilities
    WHERE id NOT IN (SELECT DISTINCT ability_id FROM unit_abilities)
  `);
  console.log('Deleted orphaned abilities');

  console.log('Done');
  await closeConnection();
  process.exit(0);
}

cleanFaction().catch(e => { console.error(e); process.exit(1); });
