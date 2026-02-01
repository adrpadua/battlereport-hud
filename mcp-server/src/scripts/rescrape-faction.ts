import 'dotenv/config';
import { FirecrawlClient } from '../scraper/firecrawl-client.js';
import { parseDatasheets } from '../scraper/parsers/unit-parser.js';
import { getDb, closeConnection } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';

const factionSlug = process.argv[2] || 'death-guard';

async function main() {
  console.log(`Re-scraping abilities for: ${factionSlug}`);

  const client = new FirecrawlClient();
  const db = getDb();

  // Get faction
  const [faction] = await db.select().from(schema.factions).where(eq(schema.factions.slug, factionSlug));
  if (!faction) {
    console.error(`Faction "${factionSlug}" not found`);
    return;
  }

  // Get units with their correct URLs from unit_index (join on name since slugs have different casing)
  const units = await db.select({
    id: schema.units.id,
    name: schema.units.name,
    slug: schema.units.slug,
    wahapediaUrl: schema.unitIndex.wahapediaUrl,
  })
  .from(schema.units)
  .innerJoin(schema.unitIndex, eq(schema.units.name, schema.unitIndex.name))
  .where(eq(schema.units.factionId, faction.id));

  console.log(`Found ${units.length} units to process`);

  let processed = 0;
  for (const unit of units) {
    const unitUrl = unit.wahapediaUrl || `https://wahapedia.ru/wh40k10ed/factions/${factionSlug}/${unit.slug}`;

    try {
      const result = await client.scrape(unitUrl);
      const parsed = parseDatasheets(result.html || result.markdown, result.url);

      if (parsed.length === 0) continue;

      const { abilities } = parsed[0]!;

      // Add abilities for this unit
      for (const ability of abilities) {
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
          // Ability already exists, find it and link
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

      processed++;
      if (processed % 10 === 0) {
        console.log(`  Processed ${processed}/${units.length} units`);
      }
    } catch (e) {
      console.error(`  Error processing ${unit.name}:`, e);
    }
  }

  console.log(`Done! Processed ${processed} units`);
  console.log('Stats:', client.getStats());
  await closeConnection();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
