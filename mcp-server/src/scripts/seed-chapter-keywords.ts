import 'dotenv/config';
import { getDb, closeConnection } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { ilike } from 'drizzle-orm';

/**
 * Space Marine chapters with their keywords and description.
 */
const CHAPTERS = [
  { name: 'Blood Angels', keyword: 'BLOOD ANGELS', description: 'Blood Angels chapter keyword - sons of Sanguinius' },
  { name: 'Dark Angels', keyword: 'DARK ANGELS', description: 'Dark Angels chapter keyword - the Unforgiven' },
  { name: 'Space Wolves', keyword: 'SPACE WOLVES', description: 'Space Wolves chapter keyword - sons of Russ' },
  { name: 'Black Templars', keyword: 'BLACK TEMPLARS', description: 'Black Templars chapter keyword - eternal crusaders' },
  { name: 'Deathwatch', keyword: 'DEATHWATCH', description: 'Deathwatch chapter keyword - xenos hunters' },
  { name: 'Ultramarines', keyword: 'ULTRAMARINES', description: 'Ultramarines chapter keyword - sons of Guilliman' },
  { name: 'Imperial Fists', keyword: 'IMPERIAL FISTS', description: 'Imperial Fists chapter keyword - masters of siege warfare' },
  { name: 'White Scars', keyword: 'WHITE SCARS', description: 'White Scars chapter keyword - sons of the Khan' },
  { name: 'Raven Guard', keyword: 'RAVEN GUARD', description: 'Raven Guard chapter keyword - masters of stealth' },
  { name: 'Salamanders', keyword: 'SALAMANDERS', description: 'Salamanders chapter keyword - sons of Vulkan' },
  { name: 'Iron Hands', keyword: 'IRON HANDS', description: 'Iron Hands chapter keyword - the iron-hearted' },
];

async function main() {
  const db = getDb();

  console.log('Seeding Space Marine chapter keywords...\n');

  for (const chapter of CHAPTERS) {
    // Check if keyword already exists
    const existing = await db
      .select()
      .from(schema.keywords)
      .where(ilike(schema.keywords.name, chapter.keyword))
      .limit(1);

    if (existing[0]) {
      console.log(`  ✓ ${chapter.keyword} already exists (id: ${existing[0].id})`);
    } else {
      const [inserted] = await db
        .insert(schema.keywords)
        .values({
          name: chapter.keyword,
          keywordType: 'faction',
          description: chapter.description,
        })
        .returning();

      console.log(`  + Created ${chapter.keyword} (id: ${inserted?.id})`);
    }
  }

  // Also seed ADEPTUS ASTARTES as the parent keyword
  const adeptusAstartes = await db
    .select()
    .from(schema.keywords)
    .where(ilike(schema.keywords.name, 'ADEPTUS ASTARTES'))
    .limit(1);

  if (!adeptusAstartes[0]) {
    const [inserted] = await db
      .insert(schema.keywords)
      .values({
        name: 'ADEPTUS ASTARTES',
        keywordType: 'faction',
        description: 'All Space Marines share this keyword',
      })
      .returning();
    console.log(`  + Created ADEPTUS ASTARTES (id: ${inserted?.id})`);
  } else {
    console.log(`  ✓ ADEPTUS ASTARTES already exists (id: ${adeptusAstartes[0].id})`);
  }

  console.log('\nDone! Chapter keywords are ready.');
  console.log('\nTo populate unit keywords, re-scrape units with:');
  console.log('  npm run cli wahapedia parse units');
  console.log('or scrape a specific unit:');
  console.log('  npm run cli wahapedia sync unit space-marines Commander-Dante');

  await closeConnection();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
