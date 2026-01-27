#!/usr/bin/env npx tsx
/**
 * Script to scrape a Space Marine chapter from Wahapedia.
 * Usage: npx tsx src/scraper/scrape-chapter.ts <chapter-slug>
 * Example: npx tsx src/scraper/scrape-chapter.ts space-wolves
 */

import 'dotenv/config';
import { FirecrawlClient } from './firecrawl-client.js';
import { scrapeChapter } from './run-scraper.js';
import { getDb, closeConnection } from '../db/connection.js';
import { SPACE_MARINE_CHAPTER_SLUGS } from './config.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: npx tsx src/scraper/scrape-chapter.ts <chapter-slug>');
    console.log('\nValid chapter slugs:');
    SPACE_MARINE_CHAPTER_SLUGS.forEach(slug => console.log(`  - ${slug}`));
    process.exit(1);
  }

  const chapterSlug = args[0];

  if (!SPACE_MARINE_CHAPTER_SLUGS.includes(chapterSlug as any)) {
    console.error(`Unknown chapter: ${chapterSlug}`);
    console.log('\nValid chapter slugs:');
    SPACE_MARINE_CHAPTER_SLUGS.forEach(slug => console.log(`  - ${slug}`));
    process.exit(1);
  }

  const client = new FirecrawlClient();
  const db = getDb();

  try {
    await scrapeChapter(client, db, chapterSlug);
    console.log('\nStats:', client.getStats());
  } catch (error) {
    console.error('Scraping failed:', error);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

main();
