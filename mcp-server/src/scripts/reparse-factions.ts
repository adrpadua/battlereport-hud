import 'dotenv/config';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import * as cheerio from 'cheerio';
import {
  parseFactionPage,
  parseDetachments,
  parseStratagemsByDetachment,
  parseEnhancementsByDetachment,
  slugify,
} from '../scraper/parsers/faction-parser.js';
import { getDb, closeConnection } from '../db/connection.js';
import * as schema from '../db/schema.js';
import type { ScrapeResult } from '../scraper/firecrawl-client.js';

interface ReparseOptions {
  dryRun: boolean;
  faction?: string;
  verbose: boolean;
}

interface ReparseStats {
  totalCacheFiles: number;
  factionPages: number;
  factionsProcessed: number;
  detachmentsFound: number;
  stratagems: number;
  enhancements: number;
  failed: number;
  errors: Array<{ faction: string; error: string }>;
}

function parseArgs(): ReparseOptions {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    faction: args.find((_, i, arr) => arr[i - 1] === '--faction'),
    verbose: args.includes('--verbose') || args.includes('-v'),
  };
}

function printUsage(): void {
  console.log(`
Usage: npx tsx src/scripts/reparse-factions.ts [options]

Re-parse all cached faction pages and update army rules, detachments,
stratagems, and enhancements in the database.
Does NOT make any API calls - only uses existing cached data.

Options:
  --dry-run     Preview changes without updating the database
  --faction     Only reparse a specific faction (e.g., --faction tyranids)
  --verbose, -v Show detailed output

Examples:
  npx tsx src/scripts/reparse-factions.ts --dry-run
  npx tsx src/scripts/reparse-factions.ts --faction space-marines
  npx tsx src/scripts/reparse-factions.ts --verbose
`);
}

function isFactionPageUrl(url: string): boolean {
  // Faction pages have format: /wh40k10ed/factions/{faction-slug}/
  // They end with the faction slug followed by optional trailing slash
  // Exclude datasheets pages and unit pages
  const match = url.match(/\/wh40k10ed\/factions\/([^/]+)\/?$/);
  if (!match) return false;

  const slug = match[1];
  // Exclude known non-faction pages
  const excludedPages = ['datasheets', 'legends', ''];
  return !excludedPages.includes(slug?.toLowerCase() || '');
}

function extractFactionSlugFromUrl(url: string): string | null {
  const match = url.match(/\/wh40k10ed\/factions\/([^/]+)\/?$/);
  return match?.[1] || null;
}

function extractFactionName(content: string): string | null {
  // Check if content is HTML (contains common HTML tags)
  const isHtml = /<(?:html|head|body|div|span|h1|h2|p)\b/i.test(content);

  if (isHtml) {
    // Parse HTML to extract faction name from h1
    const $ = cheerio.load(content);
    const h1Text = $('h1').first().text().trim();
    if (h1Text) {
      // Clean up common scraping artifacts
      let name = h1Text
        .replace(/\s*\[?\s*No filter.*$/i, '')
        .replace(/\s*[\[\(\\].*$/, '')
        .trim();
      return name || null;
    }
  } else {
    // Fallback to markdown pattern matching
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match?.[1]) {
      let name = h1Match[1].trim();
      // Clean up common scraping artifacts
      name = name.replace(/\s*\[?\s*No filter.*$/i, '');
      name = name.replace(/\s*\\\[?\s*No filter.*$/i, '');
      name = name.replace(/\s*[\[\(\\].*$/, '');
      return name.trim() || null;
    }
  }
  return null;
}

async function loadCachedFactionPages(cacheDir: string, factionFilter?: string): Promise<ScrapeResult[]> {
  const files = readdirSync(cacheDir).filter(f => f.endsWith('.json'));
  const factionPages: ScrapeResult[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(cacheDir, file), 'utf-8');
      const cached = JSON.parse(content) as ScrapeResult;

      if (!isFactionPageUrl(cached.url)) continue;

      if (factionFilter) {
        const factionSlug = extractFactionSlugFromUrl(cached.url);
        if (factionSlug !== factionFilter) continue;
      }

      factionPages.push(cached);
    } catch {
      // Skip invalid cache files
    }
  }

  return factionPages;
}

async function reparseFaction(
  db: ReturnType<typeof getDb>,
  cached: ScrapeResult,
  options: ReparseOptions,
  stats: ReparseStats
): Promise<{ success: boolean; error?: string }> {
  const factionSlug = extractFactionSlugFromUrl(cached.url);
  if (!factionSlug) {
    return { success: false, error: 'Could not extract faction slug from URL' };
  }

  // Prefer HTML over markdown - parsers use Cheerio for HTML structure
  const html = cached.html || cached.markdown;
  if (!html) {
    return { success: false, error: 'No HTML or markdown content in cache' };
  }

  const factionName = extractFactionName(html) || factionSlug;

  // Parse faction data using HTML
  const faction = parseFactionPage(html, factionSlug, factionName, cached.url);
  const detachments = parseDetachments(html, cached.url);
  const stratagemsByDetachment = parseStratagemsByDetachment(html, cached.url);
  const enhancementsByDetachment = parseEnhancementsByDetachment(html, cached.url);

  // Count totals for stats
  let totalStratagems = 0;
  let totalEnhancements = 0;
  for (const strats of stratagemsByDetachment.values()) totalStratagems += strats.length;
  for (const enhs of enhancementsByDetachment.values()) totalEnhancements += enhs.length;

  if (options.verbose) {
    console.log(`  Faction: ${faction.name}`);
    console.log(`    Army Rules: ${faction.armyRules ? `${faction.armyRules.length} chars` : 'none'}`);
    console.log(`    Detachments: ${detachments.length}`);
    console.log(`    Stratagems: ${totalStratagems} (across ${stratagemsByDetachment.size} detachments)`);
    console.log(`    Enhancements: ${totalEnhancements} (across ${enhancementsByDetachment.size} detachments)`);
  }

  stats.detachmentsFound += detachments.length;
  stats.stratagems += totalStratagems;
  stats.enhancements += totalEnhancements;

  if (options.dryRun) {
    // Show detachment mapping in verbose mode (use slug-normalized lookup)
    if (options.verbose) {
      // Build slug-normalized lookup for dry-run display
      const stratagemsBySlug = new Map<string, typeof stratagemsByDetachment extends Map<string, infer V> ? V : never>();
      for (const [name, strats] of stratagemsByDetachment) {
        stratagemsBySlug.set(slugify(name), strats);
      }
      const enhancementsBySlug = new Map<string, typeof enhancementsByDetachment extends Map<string, infer V> ? V : never>();
      for (const [name, enhs] of enhancementsByDetachment) {
        enhancementsBySlug.set(slugify(name), enhs);
      }

      for (const detachment of detachments) {
        const detSlug = slugify(detachment.name);
        const strats = stratagemsBySlug.get(detSlug) || [];
        const enhs = enhancementsBySlug.get(detSlug) || [];
        console.log(`      ${detachment.name}: ${strats.length} stratagems, ${enhs.length} enhancements`);
      }
    }
    return { success: true };
  }

  // Insert/update faction
  const [insertedFaction] = await db
    .insert(schema.factions)
    .values(faction)
    .onConflictDoUpdate({
      target: schema.factions.slug,
      set: {
        name: faction.name,
        armyRules: faction.armyRules,
        lore: faction.lore,
        wahapediaPath: faction.wahapediaPath,
        sourceUrl: faction.sourceUrl,
        updatedAt: new Date(),
      },
    })
    .returning();

  const factionId = insertedFaction!.id;

  // Build slug-normalized lookup maps for stratagems and enhancements
  // This handles special characters in detachment names (e.g., "Needgaârd Oathband")
  const stratagemsBySlug = new Map<string, typeof stratagemsByDetachment extends Map<string, infer V> ? V : never>();
  for (const [name, strats] of stratagemsByDetachment) {
    stratagemsBySlug.set(slugify(name), strats);
  }
  const enhancementsBySlug = new Map<string, typeof enhancementsByDetachment extends Map<string, infer V> ? V : never>();
  for (const [name, enhs] of enhancementsByDetachment) {
    enhancementsBySlug.set(slugify(name), enhs);
  }

  // Build a map of detachment slug -> id for tracking matched detachments
  const detachmentIdBySlug = new Map<string, string>();

  // Process detachments
  for (const detachment of detachments) {
    const [insertedDetachment] = await db
      .insert(schema.detachments)
      .values({ ...detachment, factionId })
      .onConflictDoUpdate({
        target: [schema.detachments.slug, schema.detachments.factionId],
        set: {
          name: detachment.name,
          detachmentRule: detachment.detachmentRule,
          detachmentRuleName: detachment.detachmentRuleName,
          lore: detachment.lore,
          sourceUrl: detachment.sourceUrl,
          updatedAt: new Date(),
        },
      })
      .returning();

    const detachmentId = insertedDetachment!.id;
    const detachmentSlug = slugify(detachment.name);
    detachmentIdBySlug.set(detachmentSlug, detachmentId);

    // Insert enhancements for this detachment (use slug-normalized lookup)
    const enhancements = enhancementsBySlug.get(detachmentSlug) || [];
    if (options.verbose && enhancements.length > 0) {
      console.log(`      ${detachment.name}: ${enhancements.length} enhancements`);
    }
    for (const enhancement of enhancements) {
      await db
        .insert(schema.enhancements)
        .values({ ...enhancement, detachmentId })
        .onConflictDoNothing();
    }

    // Insert stratagems for this detachment (use slug-normalized lookup)
    const stratagems = stratagemsBySlug.get(detachmentSlug) || [];
    if (options.verbose && stratagems.length > 0) {
      console.log(`      ${detachment.name}: ${stratagems.length} stratagems`);
    }
    for (const stratagem of stratagems) {
      await db
        .insert(schema.stratagems)
        .values({ ...stratagem, factionId, detachmentId })
        .onConflictDoUpdate({
          target: [schema.stratagems.slug, schema.stratagems.factionId],
          set: {
            name: stratagem.name,
            detachmentId,
            cpCost: stratagem.cpCost,
            phase: stratagem.phase,
            when: stratagem.when,
            target: stratagem.target,
            effect: stratagem.effect,
            restrictions: stratagem.restrictions,
            sourceUrl: stratagem.sourceUrl,
            updatedAt: new Date(),
          },
        });
    }
  }

  // Handle stratagems that weren't matched to any detachment (faction-level stratagems)
  const unmatchedSlugs = [...stratagemsBySlug.keys()].filter(
    slug => !detachmentIdBySlug.has(slug)
  );
  for (const slug of unmatchedSlugs) {
    const stratagems = stratagemsBySlug.get(slug) || [];
    if (options.verbose && stratagems.length > 0) {
      console.log(`      [Unmatched: ${slug}]: ${stratagems.length} stratagems (faction-level)`);
    }
    for (const stratagem of stratagems) {
      await db
        .insert(schema.stratagems)
        .values({ ...stratagem, factionId, detachmentId: null })
        .onConflictDoUpdate({
          target: [schema.stratagems.slug, schema.stratagems.factionId],
          set: {
            name: stratagem.name,
            cpCost: stratagem.cpCost,
            phase: stratagem.phase,
            when: stratagem.when,
            target: stratagem.target,
            effect: stratagem.effect,
            restrictions: stratagem.restrictions,
            sourceUrl: stratagem.sourceUrl,
            updatedAt: new Date(),
          },
        });
    }
  }

  return { success: true };
}

async function main(): Promise<void> {
  const options = parseArgs();

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const cacheDir = process.env.CACHE_DIR || './.scrape-cache';

  console.log('=== Reparse All Cached Faction Pages ===\n');
  console.log(`Cache directory: ${cacheDir}`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  if (options.faction) {
    console.log(`Faction filter: ${options.faction}`);
  }
  console.log('');

  // Load cached faction pages
  console.log('Loading cached faction pages...');
  const factionPages = await loadCachedFactionPages(cacheDir, options.faction);

  const stats: ReparseStats = {
    totalCacheFiles: readdirSync(cacheDir).filter(f => f.endsWith('.json')).length,
    factionPages: factionPages.length,
    factionsProcessed: 0,
    detachmentsFound: 0,
    stratagems: 0,
    enhancements: 0,
    failed: 0,
    errors: [],
  };

  console.log(`Found ${stats.totalCacheFiles} total cache files`);
  console.log(`Found ${stats.factionPages} faction pages to reparse\n`);

  if (factionPages.length === 0) {
    console.log('No faction pages found in cache.');
    if (options.faction) {
      console.log(`Try running without --faction filter, or check if faction "${options.faction}" has cached data.`);
    }
    process.exit(0);
  }

  const db = getDb();

  for (const cached of factionPages) {
    const factionSlug = extractFactionSlugFromUrl(cached.url) || 'unknown';
    console.log(`\n--- ${factionSlug} ---`);

    try {
      const result = await reparseFaction(db, cached, options, stats);

      if (result.success) {
        stats.factionsProcessed++;
        console.log(`  ${options.dryRun ? 'would update' : 'updated'}`);
      } else {
        stats.failed++;
        console.log(`  failed: ${result.error}`);
        stats.errors.push({ faction: factionSlug, error: result.error || 'Unknown error' });
      }
    } catch (error) {
      stats.failed++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  error: ${errorMsg}`);
      stats.errors.push({ faction: factionSlug, error: errorMsg });
    }
  }

  // Print summary
  console.log('\n=== Summary ===');
  console.log(`Total cache files:    ${stats.totalCacheFiles}`);
  console.log(`Faction pages:        ${stats.factionPages}`);
  console.log(`Factions processed:   ${stats.factionsProcessed}${options.dryRun ? ' (would update)' : ''}`);
  console.log(`Detachments found:    ${stats.detachmentsFound}`);
  console.log(`Stratagems found:     ${stats.stratagems}`);
  console.log(`Enhancements found:   ${stats.enhancements}`);
  console.log(`Failed:               ${stats.failed}`);

  if (stats.errors.length > 0) {
    console.log('\n=== Errors ===');
    for (const { faction, error } of stats.errors) {
      console.log(`  ${faction}: ${error}`);
    }
  }

  if (options.dryRun) {
    console.log('\n[DRY RUN] No changes were made. Remove --dry-run to apply changes.');
  }

  await closeConnection();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
