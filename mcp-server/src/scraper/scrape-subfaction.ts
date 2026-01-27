#!/usr/bin/env npx tsx
/**
 * Script to scrape a faction's subfaction from Wahapedia.
 * Usage: npx tsx src/scraper/scrape-subfaction.ts <faction-slug> <subfaction-slug>
 * Example: npx tsx src/scraper/scrape-subfaction.ts chaos-daemons khorne
 * Example: npx tsx src/scraper/scrape-subfaction.ts aeldari ynnari
 */

import 'dotenv/config';
import { FirecrawlClient } from './firecrawl-client.js';
import { scrapeSubfaction } from './run-scraper.js';
import { getDb, closeConnection } from '../db/connection.js';
import { FACTION_SUBFACTIONS } from './config.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: npx tsx src/scraper/scrape-subfaction.ts <faction-slug> <subfaction-slug>');
    console.log('\nFactions with subfactions:');
    for (const [faction, subfactions] of Object.entries(FACTION_SUBFACTIONS)) {
      console.log(`  ${faction}:`);
      for (const sub of subfactions) {
        console.log(`    - ${sub}`);
      }
    }
    process.exit(1);
  }

  const factionSlug = args[0];
  const subfactionSlug = args[1];

  const validSubfactions = FACTION_SUBFACTIONS[factionSlug];
  if (!validSubfactions) {
    console.error(`Unknown faction or faction without subfactions: ${factionSlug}`);
    console.log('\nFactions with subfactions:', Object.keys(FACTION_SUBFACTIONS).join(', '));
    process.exit(1);
  }

  if (!validSubfactions.includes(subfactionSlug)) {
    console.error(`Unknown subfaction: ${subfactionSlug}`);
    console.log(`\nValid subfactions for ${factionSlug}:`);
    validSubfactions.forEach(slug => console.log(`  - ${slug}`));
    process.exit(1);
  }

  const client = new FirecrawlClient();
  const db = getDb();

  try {
    await scrapeSubfaction(client, db, factionSlug, subfactionSlug);
    console.log('\nStats:', client.getStats());
  } catch (error) {
    console.error('Scraping failed:', error);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

main();
