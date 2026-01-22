import 'dotenv/config';
import { getDb, closeConnection } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';

const SOURCE_URL = 'https://wahapedia.ru/wh40k10ed/the-rules/chapter-approved-2025-26/';

/**
 * Terrain layout definitions for Chapter Approved 2025-26
 * Images are hosted on Wahapedia
 */
const TERRAIN_LAYOUTS = [
  {
    slug: 'chapter-approved-2025-26-layout-1',
    name: 'Layout 1',
    season: 'chapter_approved_2025_26',
    imageUrl: 'https://wahapedia.ru/wh40k10ed/img/maps/TerrainLayout/CA_TerrainLayout1.png',
  },
  {
    slug: 'chapter-approved-2025-26-layout-2',
    name: 'Layout 2',
    season: 'chapter_approved_2025_26',
    imageUrl: 'https://wahapedia.ru/wh40k10ed/img/maps/TerrainLayout/CA_TerrainLayout2.png',
  },
  {
    slug: 'chapter-approved-2025-26-layout-3',
    name: 'Layout 3',
    season: 'chapter_approved_2025_26',
    imageUrl: 'https://wahapedia.ru/wh40k10ed/img/maps/TerrainLayout/CA_TerrainLayout3.png',
  },
  {
    slug: 'chapter-approved-2025-26-layout-4',
    name: 'Layout 4',
    season: 'chapter_approved_2025_26',
    imageUrl: 'https://wahapedia.ru/wh40k10ed/img/maps/TerrainLayout/CA_TerrainLayout4.png',
  },
  {
    slug: 'chapter-approved-2025-26-layout-5',
    name: 'Layout 5',
    season: 'chapter_approved_2025_26',
    imageUrl: 'https://wahapedia.ru/wh40k10ed/img/maps/TerrainLayout/CA_TerrainLayout5.png',
  },
  {
    slug: 'chapter-approved-2025-26-layout-6',
    name: 'Layout 6',
    season: 'chapter_approved_2025_26',
    imageUrl: 'https://wahapedia.ru/wh40k10ed/img/maps/TerrainLayout/CA_TerrainLayout6.png',
  },
  {
    slug: 'chapter-approved-2025-26-layout-7',
    name: 'Layout 7',
    season: 'chapter_approved_2025_26',
    imageUrl: 'https://wahapedia.ru/wh40k10ed/img/maps/TerrainLayout/CA_TerrainLayout7.png',
  },
  {
    slug: 'chapter-approved-2025-26-layout-8',
    name: 'Layout 8',
    season: 'chapter_approved_2025_26',
    imageUrl: 'https://wahapedia.ru/wh40k10ed/img/maps/TerrainLayout/CA_TerrainLayout8.png',
  },
];

async function fetchImageAsBase64(url: string): Promise<string> {
  console.log(`  Fetching: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BattleReportHUD/1.0)',
      'Accept': 'image/*',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const contentType = response.headers.get('content-type') || 'image/png';

  // Return as data URL for easy rendering
  return `data:${contentType};base64,${base64}`;
}

async function seedTerrainLayouts() {
  console.log('Seeding terrain layouts from Chapter Approved 2025-26...\n');

  const db = getDb();

  try {
    let inserted = 0;
    let updated = 0;
    let failed = 0;

    for (const layout of TERRAIN_LAYOUTS) {
      try {
        // Fetch and convert image to base64
        const imageBase64 = await fetchImageAsBase64(layout.imageUrl);
        const imageSizeKB = Math.round((imageBase64.length * 3) / 4 / 1024);
        console.log(`  Image size: ~${imageSizeKB} KB`);

        // Check if layout already exists
        const existing = await db
          .select()
          .from(schema.terrainLayouts)
          .where(eq(schema.terrainLayouts.slug, layout.slug))
          .limit(1);

        if (existing.length > 0) {
          // Update existing
          await db
            .update(schema.terrainLayouts)
            .set({
              name: layout.name,
              season: layout.season,
              imageBase64,
              sourceUrl: SOURCE_URL,
              dataSource: 'wahapedia',
              updatedAt: new Date(),
            })
            .where(eq(schema.terrainLayouts.slug, layout.slug));
          updated++;
          console.log(`  Updated: ${layout.name}\n`);
        } else {
          // Insert new
          await db.insert(schema.terrainLayouts).values({
            slug: layout.slug,
            name: layout.name,
            season: layout.season,
            imageBase64,
            battlefieldWidth: 60,
            battlefieldHeight: 44,
            sourceUrl: SOURCE_URL,
            dataSource: 'wahapedia',
          });
          inserted++;
          console.log(`  Inserted: ${layout.name}\n`);
        }

        // Small delay to be polite to Wahapedia
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`  Failed to process ${layout.name}:`, error);
        failed++;
      }
    }

    console.log(`\nSeeding complete: ${inserted} inserted, ${updated} updated, ${failed} failed`);
  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  } finally {
    await closeConnection();
  }
}

seedTerrainLayouts().catch(console.error);
