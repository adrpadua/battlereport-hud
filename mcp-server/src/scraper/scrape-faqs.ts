import 'dotenv/config';
import { FirecrawlClient } from './firecrawl-client.js';
import { WAHAPEDIA_URLS } from './config.js';
import { parseFAQPage, toNewFAQ } from './parsers/faq-parser.js';
import { getDb, closeConnection } from '../db/connection.js';
import * as schema from '../db/schema.js';

/**
 * Scrape FAQs from Wahapedia
 *
 * Usage:
 *   npx tsx src/scraper/scrape-faqs.ts [options]
 *   npx tsx src/scraper/scrape-faqs.ts --force    # Bypass cache
 *   npx tsx src/scraper/scrape-faqs.ts --dry-run  # Preview without DB changes
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: npx tsx src/scraper/scrape-faqs.ts [options]');
    console.log('');
    console.log('Options:');
    console.log('  --force    Bypass cache and re-fetch from Wahapedia (uses API credits)');
    console.log('  --dry-run  Preview FAQs without saving to database');
    console.log('  --help     Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  npx tsx src/scraper/scrape-faqs.ts              # Use cache, save to DB');
    console.log('  npx tsx src/scraper/scrape-faqs.ts --dry-run    # Preview only');
    console.log('  npx tsx src/scraper/scrape-faqs.ts --force      # Fresh fetch + save');
    process.exit(0);
  }

  const forceRefresh = args.includes('--force');
  const dryRun = args.includes('--dry-run');

  const client = new FirecrawlClient();
  const db = getDb();

  try {
    const faqUrl = WAHAPEDIA_URLS.rules.faqs;
    console.log(`Scraping FAQs from: ${faqUrl}`);
    console.log(`Mode: ${dryRun ? 'DRY RUN (no DB changes)' : 'LIVE (saving to DB)'}`);
    console.log(`Cache: ${forceRefresh ? 'BYPASSED (fresh fetch)' : 'ENABLED'}`);
    console.log('');

    // Scrape the FAQ page
    const result = await client.scrape(faqUrl, {
      includeHtml: true,
      forceRefresh,
    });

    if (!result.html && !result.markdown) {
      console.error('Failed to fetch FAQ page');
      process.exit(1);
    }

    console.log(`Fetched ${result.fromCache ? 'from cache' : 'from Wahapedia'}`);

    // Parse the FAQ data
    const faqs = parseFAQPage(result.html || result.markdown, result.url);

    if (faqs.length === 0) {
      console.warn('No FAQs parsed from page. The page format may have changed.');
      process.exit(1);
    }

    console.log(`Parsed ${faqs.length} FAQs`);
    console.log('');

    // Group by section for display
    const bySection: Record<string, typeof faqs> = {};
    for (const faq of faqs) {
      if (!bySection[faq.section]) {
        bySection[faq.section] = [];
      }
      bySection[faq.section]!.push(faq);
    }

    console.log('FAQs by section:');
    for (const [section, sectionFaqs] of Object.entries(bySection)) {
      console.log(`  ${section}: ${sectionFaqs.length}`);
    }
    console.log('');

    // Show sample FAQs
    console.log('Sample FAQs:');
    const sampleFaqs = faqs.slice(0, 3);
    for (const faq of sampleFaqs) {
      console.log(`  [${faq.section}] Q: ${faq.question.slice(0, 60)}...`);
      console.log(`           A: ${faq.answer.slice(0, 60)}...`);
    }
    if (faqs.length > 3) {
      console.log(`  ... and ${faqs.length - 3} more`);
    }
    console.log('');

    if (dryRun) {
      console.log('DRY RUN complete - no changes made to database');
      return;
    }

    // Log to scrape_log
    await db.insert(schema.scrapeLog).values({
      url: faqUrl,
      scrapeType: 'faqs',
      status: 'pending',
      contentHash: result.contentHash,
      scrapedAt: result.scrapedAt,
    });

    // Upsert FAQs into database
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const parsedFaq of faqs) {
      try {
        const faqData = toNewFAQ(parsedFaq);

        const [existing] = await db
          .select({ id: schema.faqs.id })
          .from(schema.faqs)
          .where(
            // Import eq dynamically to avoid circular import issues
            (await import('drizzle-orm')).eq(schema.faqs.slug, faqData.slug)
          )
          .limit(1);

        if (existing) {
          // Update existing FAQ
          await db
            .update(schema.faqs)
            .set({
              title: faqData.title,
              question: faqData.question,
              answer: faqData.answer,
              effectiveDate: faqData.effectiveDate,
              updatedAt: new Date(),
            })
            .where((await import('drizzle-orm')).eq(schema.faqs.id, existing.id));
          updated++;
        } else {
          // Insert new FAQ
          await db.insert(schema.faqs).values(faqData);
          inserted++;
        }
      } catch (error) {
        console.error(`Error saving FAQ "${parsedFaq.slug}":`, error);
        errors++;
      }
    }

    // Update scrape log with success
    await db
      .update(schema.scrapeLog)
      .set({
        status: 'success',
        processedAt: new Date(),
      })
      .where(
        (await import('drizzle-orm')).and(
          (await import('drizzle-orm')).eq(schema.scrapeLog.url, faqUrl),
          (await import('drizzle-orm')).eq(schema.scrapeLog.scrapeType, 'faqs')
        )
      );

    console.log(`\n✅ FAQs saved to database`);
    console.log(`   Inserted: ${inserted}`);
    console.log(`   Updated: ${updated}`);
    if (errors > 0) {
      console.log(`   Errors: ${errors}`);
    }
  } catch (error) {
    console.error('Error:', error);

    // Log failure
    try {
      await db.insert(schema.scrapeLog).values({
        url: WAHAPEDIA_URLS.rules.faqs,
        scrapeType: 'faqs',
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        scrapedAt: new Date(),
      });
    } catch {
      // Ignore logging errors
    }

    process.exit(1);
  } finally {
    await closeConnection();
  }
}

main();
