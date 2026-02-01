import 'dotenv/config';
import { FirecrawlClient } from '../scraper/firecrawl-client.js';
import { parseDatasheets } from '../scraper/parsers/unit-parser.js';
import { getDb, closeConnection } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Known T'au Empire units
const TAU_UNITS = [
  // Characters
  'Commander-Farsight', 'Commander-Shadowsun', 'Darkstrider', 'Ethereal',
  'Aun-Shi', 'Aun-Va', 'Cadre-Fireblade', 'Commander-in-Coldstar-Battlesuit',
  'Commander-in-Crisis-Battlesuit', 'Commander-in-Enforcer-Battlesuit',
  'Kroot-Flesh-Shaper', 'Kroot-Trail-Shaper', 'Kroot-War-Shaper',
  'Longstrike',
  // Battleline
  'Breacher-Team', 'Strike-Team', 'Kroot-Carnivores',
  // Infantry/Battlesuits
  'Crisis-Battlesuits', 'Crisis-Fireknife-Battlesuits', 'Crisis-Starscythe-Battlesuits',
  'Crisis-Sunforge-Battlesuits',
  'Ghostkeel-Battlesuit', 'Riptide-Battlesuit', 'Stormsurge',
  'Stealth-Battlesuits', 'Broadside-Battlesuits',
  'Hazard-Battlesuits',
  // Kroot
  'Kroot-Farstalkers', 'Kroot-Hounds', 'Kroot-Lone-spear', 'Krootox-Rampagers',
  'Krootox-Riders',
  // Other
  'Pathfinder-Team', 'Vespid-Stingwings',
  'Devilfish', 'Hammerhead-Gunship', 'Sky-Ray-Gunship',
  'Piranhas', 'Tetras',
  'Razorshark-Strike-Fighter', 'Sun-Shark-Bomber',
  'Tidewall-Shieldline', 'Tidewall-Droneport', 'Tidewall-Gunrig',
  // Drones/Support
  'Tactical-Drones', 'Drone-Sentry-Turret',
  // Forge World
  'Tiger-Shark', 'Tiger-Shark-AX-1-0', 'Manta',
  'XV9-Hazard-Battlesuits', 'XV107-R-varna-Battlesuit', 'XV109-Y-vahra-Battlesuit',
  'KX139-Ta-unar-Supremacy-Armour',
  'AX39-Sun-Shark-Interceptor', 'DX-6-Remora-Stealth-Drones',
  'TX-42-Piranha', 'TX-7-Hammerhead-Gunship',
  'Barracuda', 'Orca-Dropship',
  'Great-Knarloc', 'Knarloc-Riders',
  // Additional common units
  'Fire-Warriors', 'Pathfinders', 'XV8-Crisis-Battlesuits',
  'XV25-Stealth-Battlesuits', 'XV88-Broadside-Battlesuits',
  'XV95-Ghostkeel-Battlesuit', 'XV104-Riptide-Battlesuit',
  'KV128-Stormsurge',
];

async function main() {
  const client = new FirecrawlClient();
  const db = getDb();

  // Get or create T'au faction
  const factionResults = await db.select().from(schema.factions).where(eq(schema.factions.slug, 't-au-empire'));
  let faction = factionResults[0];

  if (!faction) {
    const insertResult = await db.insert(schema.factions).values({
      name: "T'au Empire",
      slug: 't-au-empire',
    }).returning();
    faction = insertResult[0]!;
    console.log("Created T'au Empire faction");
  }

  console.log(`Scraping ${TAU_UNITS.length} T'au units...`);

  let success = 0;
  let failed = 0;

  for (const unitSlug of TAU_UNITS) {
    const url = `https://wahapedia.ru/wh40k10ed/factions/t-au-empire/${unitSlug}`;

    try {
      const result = await client.scrape(url);

      // Check for 404
      if (result.markdown.includes('Not Found') || result.markdown.includes('404')) {
        console.log(`  [SKIP] ${unitSlug} - not found`);
        failed++;
        continue;
      }

      const parsed = parseDatasheets(result.html || result.markdown, url);

      if (parsed.length === 0) {
        console.log(`  [SKIP] ${unitSlug} - no datasheet parsed`);
        failed++;
        continue;
      }

      const unitData = parsed[0]!;

      // Insert unit
      const unitResult = await db
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
      const unit = unitResult[0]!;

      // Insert weapons
      for (const weapon of unitData.weapons) {
        const weaponResult = await db
          .insert(schema.weapons)
          .values(weapon)
          .onConflictDoNothing()
          .returning();
        const insertedWeapon = weaponResult[0];

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
        const abilityResult = await db
          .insert(schema.abilities)
          .values({ ...ability, factionId: faction.id })
          .onConflictDoNothing()
          .returning();
        const insertedAbility = abilityResult[0];

        if (insertedAbility) {
          await db
            .insert(schema.unitAbilities)
            .values({ unitId: unit.id, abilityId: insertedAbility.id })
            .onConflictDoNothing();
        } else {
          const existingResults = await db.select()
            .from(schema.abilities)
            .where(eq(schema.abilities.slug, ability.slug))
            .limit(1);
          const existing = existingResults[0];
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
