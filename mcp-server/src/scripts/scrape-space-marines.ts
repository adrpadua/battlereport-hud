import 'dotenv/config';
import { FirecrawlClient } from '../scraper/firecrawl-client.js';
import { parseDatasheets } from '../scraper/parsers/unit-parser.js';
import { getDb, closeConnection } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Known Space Marines units (manually compiled since datasheets page times out)
const SPACE_MARINES_UNITS = [
  // Characters
  'Captain', 'Captain-in-Gravis-Armour', 'Captain-in-Phobos-Armour', 'Captain-in-Terminator-Armour',
  'Captain-with-Jump-Pack', 'Captain-On-Bike', 'Primaris-Captain',
  'Chaplain', 'Chaplain-in-Terminator-Armour', 'Chaplain-on-Bike', 'Primaris-Chaplain',
  'Chaplain-with-Jump-Pack', 'Judiciar',
  'Librarian', 'Librarian-in-Phobos-Armour', 'Librarian-in-Terminator-Armour',
  'Primaris-Librarian',
  'Lieutenant', 'Lieutenant-in-Phobos-Armour', 'Lieutenant-in-Reiver-Armour',
  'Lieutenant-with-Combi-weapon', 'Primaris-Lieutenant',
  'Techmarine', 'Primaris-Techmarine',
  'Apothecary', 'Primaris-Apothecary', 'Apothecary-Biologis',
  'Ancient', 'Primaris-Ancient', 'Bladeguard-Ancient',
  'Company-Champion', 'Chapter-Champion',
  'Company-Heroes',
  // Named Characters
  'Marneus-Calgar', 'Chief-Librarian-Tigurius', 'Chaplain-Cassius', 'Roboute-Guilliman',
  'Kor-sarro-Khan', 'Kayvaan-Shrike', 'Pedro-Kantor', 'Darnath-Lysander',
  'Vulkan-He-stan', 'Adrax-Agatone', 'Tu-Shan',
  'Logan-Grimnar', 'Ragnar-Blackmane', 'Njal-Stormcaller', 'Ulrik-the-Slayer',
  'Bjorn-the-Fell-Handed', 'Murderfang',
  'Azrael', 'Ezekiel', 'Asmodai', 'Belial', 'Sammael', 'Lazarus',
  'Gabriel-Seth', 'Lemartes', 'The-Sanguinor', 'Commander-Dante', 'Mephiston',
  'Tor-Garadon',
  // Battleline
  'Intercessor-Squad', 'Assault-Intercessor-Squad', 'Heavy-Intercessor-Squad',
  'Tactical-Squad', 'Scout-Squad', 'Infiltrator-Squad', 'Incursor-Squad',
  // Infantry
  'Bladeguard-Veteran-Squad', 'Sternguard-Veteran-Squad', 'Vanguard-Veteran-Squad',
  'Company-Veterans', 'Veteran-Intercessor-Squad',
  'Terminator-Squad', 'Terminator-Assault-Squad', 'Relic-Terminator-Squad',
  'Aggressor-Squad', 'Eradicator-Squad', 'Hellblaster-Squad', 'Inceptor-Squad',
  'Eliminator-Squad', 'Suppressor-Squad', 'Reiver-Squad',
  'Centurion-Assault-Squad', 'Centurion-Devastator-Squad',
  'Devastator-Squad', 'Desolation-Squad',
  'Assault-Squad', 'Assault-Squad-with-Jump-Packs',
  'Outrider-Squad', 'Invader-ATV',
  'Servitors',
  // Dreadnoughts
  'Redemptor-Dreadnought', 'Brutalis-Dreadnought', 'Ballistus-Dreadnought',
  'Dreadnought', 'Venerable-Dreadnought', 'Ironclad-Dreadnought',
  'Contemptor-Dreadnought', 'Leviathan-Dreadnought',
  // Vehicles
  'Repulsor', 'Repulsor-Executioner', 'Impulsor', 'Gladiator-Lancer',
  'Gladiator-Reaper', 'Gladiator-Valiant',
  'Predator-Destructor', 'Predator-Annihilator', 'Vindicator',
  'Whirlwind', 'Hunter', 'Stalker',
  'Land-Raider', 'Land-Raider-Crusader', 'Land-Raider-Redeemer',
  'Rhino', 'Razorback', 'Drop-Pod',
  // Flyers
  'Stormhawk-Interceptor', 'Stormtalon-Gunship', 'Stormraven-Gunship',
  // Forge World
  'Fire-Raptor-Gunship', 'Storm-Eagle-Gunship', 'Thunderhawk-Gunship',
  'Sicaran-Battle-Tank', 'Sicaran-Venator', 'Sicaran-Punisher',
  'Spartan', 'Kratos', 'Fellblade', 'Falchion', 'Typhon', 'Cerberus',
  'Land-Raider-Proteus', 'Land-Raider-Achilles',
  'Mastodon', 'Sokar-pattern-Stormbird',
  'Deredeo-Dreadnought', 'Relic-Contemptor-Dreadnought',
  'Whirlwind-Scorpius', 'Xiphon-Interceptor', 'Rapier-Carrier',
];

async function main() {
  const client = new FirecrawlClient();
  const db = getDb();

  // Get or create Space Marines faction
  let [faction] = await db.select().from(schema.factions).where(eq(schema.factions.slug, 'space-marines'));

  if (!faction) {
    [faction] = await db.insert(schema.factions).values({
      name: 'Space Marines',
      slug: 'space-marines',
      wahapediaUrl: 'https://wahapedia.ru/wh40k10ed/factions/space-marines/',
    }).returning();
    console.log('Created Space Marines faction');
  }

  console.log(`Scraping ${SPACE_MARINES_UNITS.length} Space Marines units...`);

  let success = 0;
  let failed = 0;

  for (const unitSlug of SPACE_MARINES_UNITS) {
    const url = `https://wahapedia.ru/wh40k10ed/factions/space-marines/${unitSlug}`;

    try {
      const result = await client.scrape(url);

      // Check for 404
      if (result.markdown.includes('Not Found') || result.markdown.includes('404')) {
        console.log(`  [SKIP] ${unitSlug} - not found`);
        failed++;
        continue;
      }

      const parsed = parseDatasheets(result.markdown, url);

      if (parsed.length === 0) {
        console.log(`  [SKIP] ${unitSlug} - no datasheet parsed`);
        failed++;
        continue;
      }

      const unitData = parsed[0]!;

      // Insert unit
      const [unit] = await db
        .insert(schema.units)
        .values({
          ...unitData.unit,
          factionId: faction.id,
        })
        .onConflictDoUpdate({
          target: [schema.units.slug, schema.units.factionId],
          set: { ...unitData.unit, updatedAt: new Date() },
        })
        .returning();

      // Insert weapons
      for (const weapon of unitData.weapons) {
        const [insertedWeapon] = await db
          .insert(schema.weapons)
          .values({ ...weapon, factionId: faction.id })
          .onConflictDoNothing()
          .returning();

        const weaponId = insertedWeapon?.id;
        if (weaponId) {
          await db
            .insert(schema.unitWeapons)
            .values({ unitId: unit.id, weaponId })
            .onConflictDoNothing();
        }
      }

      // Insert abilities
      for (const ability of unitData.abilities) {
        const [insertedAbility] = await db
          .insert(schema.abilities)
          .values({ ...ability, factionId: faction.id })
          .onConflictDoNothing()
          .returning();

        if (insertedAbility) {
          await db
            .insert(schema.unitAbilities)
            .values({ unitId: unit.id, abilityId: insertedAbility.id })
            .onConflictDoNothing();
        } else {
          const [existing] = await db.select()
            .from(schema.abilities)
            .where(eq(schema.abilities.slug, ability.slug))
            .limit(1);
          if (existing) {
            await db
              .insert(schema.unitAbilities)
              .values({ unitId: unit.id, abilityId: existing.id })
              .onConflictDoNothing();
          }
        }
      }

      console.log(`  [OK] ${unitData.unit.name}`);
      success++;
    } catch (error) {
      console.error(`  [ERR] ${unitSlug}:`, error instanceof Error ? error.message : error);
      failed++;
    }
  }

  console.log(`\nDone! Success: ${success}, Failed: ${failed}`);
  console.log('Stats:', client.getStats());
  await closeConnection();
}

main().catch(console.error);
