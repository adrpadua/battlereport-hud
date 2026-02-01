import 'dotenv/config';
import { getDb, closeConnection } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { ilike, eq } from 'drizzle-orm';

async function main() {
  const searchTerm = process.argv[2] || 'kabalite';
  const db = getDb();

  // Find units matching the search term
  const units = await db.select({
    id: schema.units.id,
    name: schema.units.name,
    slug: schema.units.slug,
    faction: schema.factions.name,
    movement: schema.units.movement,
    toughness: schema.units.toughness,
    save: schema.units.save,
    wounds: schema.units.wounds,
    leadership: schema.units.leadership,
    oc: schema.units.objectiveControl,
    points: schema.units.pointsCost,
    isBattleline: schema.units.isBattleline,
  })
  .from(schema.units)
  .innerJoin(schema.factions, eq(schema.units.factionId, schema.factions.id))
  .where(ilike(schema.units.name, `%${searchTerm}%`));

  console.log(`=== UNITS MATCHING "${searchTerm}" ===`);
  console.log(`Found: ${units.length} units\n`);

  for (const unit of units) {
    console.log(`${unit.name} (${unit.faction})`);
    console.log(`  M: ${unit.movement} | T: ${unit.toughness} | Sv: ${unit.save} | W: ${unit.wounds}`);
    console.log(`  Ld: ${unit.leadership} | OC: ${unit.oc} | Pts: ${unit.points}`);
    console.log(`  Battleline: ${unit.isBattleline}`);

    // Get weapons
    const weapons = await db.select({
      name: schema.weapons.name,
      type: schema.weapons.weaponType,
    })
    .from(schema.unitWeapons)
    .innerJoin(schema.weapons, eq(schema.unitWeapons.weaponId, schema.weapons.id))
    .where(eq(schema.unitWeapons.unitId, unit.id));

    if (weapons.length > 0) {
      console.log(`  Weapons: ${weapons.map(w => w.name).join(', ')}`);
    }

    // Get abilities
    const abilities = await db.select({
      name: schema.abilities.name,
      type: schema.abilities.abilityType,
    })
    .from(schema.unitAbilities)
    .innerJoin(schema.abilities, eq(schema.unitAbilities.abilityId, schema.abilities.id))
    .where(eq(schema.unitAbilities.unitId, unit.id));

    if (abilities.length > 0) {
      console.log(`  Abilities (${abilities.length}): ${abilities.slice(0, 5).map(a => a.name).join(', ')}${abilities.length > 5 ? '...' : ''}`);
    }

    console.log('');
  }

  await closeConnection();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
