import 'dotenv/config';
import FirecrawlApp from '@mendable/firecrawl-js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const CACHE_DIR = process.env.CACHE_DIR || './.crawl-cache';

async function main() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error('FIRECRAWL_API_KEY is required');
  }

  const firecrawl = new FirecrawlApp({ apiKey });

  // Ensure cache directory exists
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }

  console.log('🔥 Starting Wahapedia crawl...\n');

  // Crawl the factions section
  const crawlResult = await firecrawl.crawlUrl('https://wahapedia.ru/wh40k10ed/factions/', {
    limit: 100, // Reduced for faster crawl
    scrapeOptions: {
      formats: ['markdown'],
    },
    includePaths: ['/wh40k10ed/factions/', '/wh40k10ed/the-rules/'],
  }, 5); // pollInterval as 3rd param

  if ('error' in crawlResult) {
    throw new Error(`Crawl failed: ${crawlResult.error || 'Unknown error'}`);
  }

  console.log(`\n✅ Crawled ${crawlResult.data?.length || 0} pages\n`);

  // Save each page to cache
  const pages = crawlResult.data || [];
  for (const page of pages) {
    const url = page.metadata?.sourceURL || page.metadata?.url || 'unknown';
    const slug = url
      .replace('https://wahapedia.ru/wh40k10ed/', '')
      .replace(/\//g, '_')
      .replace(/[^a-z0-9_-]/gi, '') || 'index';

    const cachePath = join(CACHE_DIR, `${slug}.json`);
    writeFileSync(cachePath, JSON.stringify({
      url,
      markdown: page.markdown,
      metadata: page.metadata,
      scrapedAt: new Date().toISOString(),
    }, null, 2));

    console.log(`📄 Saved: ${slug}`);
  }

  console.log(`\n🎉 Crawl complete! Files saved to ${CACHE_DIR}`);

  // Summary by type
  const byType: Record<string, number> = {};
  for (const page of pages) {
    const url = page.metadata?.sourceURL || '';
    let type = 'other';
    if (url.includes('/datasheets')) type = 'datasheets';
    else if (url.includes('/detachments')) type = 'detachments';
    else if (url.includes('/stratagems')) type = 'stratagems';
    else if (url.includes('/army-rules')) type = 'army-rules';
    else if (url.includes('/the-rules')) type = 'rules';
    else if (url.includes('/factions/')) type = 'faction-index';

    byType[type] = (byType[type] || 0) + 1;
  }

  console.log('\n📊 Summary:');
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${type}: ${count} pages`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
