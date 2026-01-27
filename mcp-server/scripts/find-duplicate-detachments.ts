#!/usr/bin/env npx tsx
/**
 * Find duplicate detachments in the database
 */

import 'dotenv/config';
import { getDb, closeConnection } from '../src/db/connection.js';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();

  // List all detachments for specific factions known to have duplicates
  const factions = ['leagues-of-votann', 'drukhari', 'chaos-daemons', 'necrons', 'aeldari'];

  for (const factionSlug of factions) {
    const result = await db.execute(sql`
      SELECT d.name, d.slug,
        (SELECT COUNT(*) FROM stratagems s WHERE s.detachment_id = d.id) as strat_count,
        (SELECT COUNT(*) FROM enhancements e WHERE e.detachment_id = d.id) as enh_count
      FROM detachments d
      JOIN factions f ON d.faction_id = f.id
      WHERE f.slug = ${factionSlug}
      ORDER BY d.name
    `);

    console.log(`\n=== ${factionSlug} (${result.rows.length} detachments) ===`);
    for (const d of result.rows as any[]) {
      const marker = d.strat_count === '0' && d.enh_count === '0' ? '❌' : '✓';
      console.log(`  ${marker} ${d.name} (slug: ${d.slug}) [${d.strat_count}S, ${d.enh_count}E]`);
    }
  }

  // Find detachments that look like duplicates (similar names)
  console.log('\n\n=== Finding potential duplicates ===');
  const allDets = await db.execute(sql`
    SELECT d.name, d.slug, f.name as faction_name
    FROM detachments d
    JOIN factions f ON d.faction_id = f.id
    ORDER BY f.name, d.name
  `);

  // Group by slug prefix (first part before any number)
  const bySlugPrefix = new Map<string, any[]>();
  for (const d of allDets.rows as any[]) {
    const slug = d.slug as string;
    // Check if slug ends with a number (like "eternal-resentment-1")
    const match = slug.match(/^(.+)-(\d+)$/);
    if (match) {
      const baseSlug = match[1];
      const key = `${d.faction_name}:${baseSlug}`;
      if (!bySlugPrefix.has(key)) bySlugPrefix.set(key, []);
      bySlugPrefix.get(key)!.push(d);
    }
  }

  console.log('\nDetachments with numbered slug suffixes:');
  for (const [key, dets] of bySlugPrefix) {
    console.log(`\n  ${key}:`);
    for (const d of dets) {
      console.log(`    - ${d.name} (${d.slug})`);
    }
  }

  await closeConnection();
}

main().catch(console.error);
