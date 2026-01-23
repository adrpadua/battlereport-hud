import { Command } from 'commander';
import { runMcpCli, runMcpScript, runMcpScraper } from '../utils/runner.js';
import { confirmApiUsage } from '../utils/confirm.js';

export const wahapediaCommand = new Command('wahapedia')
  .description('Wahapedia data operations (sync from web, parse cached data, cache management)');

// === SYNC Commands (Fetch from API → database) ===
const syncCmd = wahapediaCommand
  .command('sync')
  .description('Fetch from Wahapedia API → database (uses Firecrawl credits)');

syncCmd
  .command('rules')
  .description('Sync core rules from Wahapedia')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (options: { yes?: boolean }) => {
    const confirmed = await confirmApiUsage(options, {
      service: 'Firecrawl',
      action: 'fetch core rules from Wahapedia',
      estimate: '~5 API calls',
    });
    if (!confirmed) {
      console.log('Cancelled.');
      return;
    }
    await runMcpCli('scrape', ['core']);
  });

syncCmd
  .command('faction <slug>')
  .description('Sync a specific faction from Wahapedia')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (slug: string, options: { yes?: boolean }) => {
    const confirmed = await confirmApiUsage(options, {
      service: 'Firecrawl',
      action: `fetch faction "${slug}" from Wahapedia`,
      estimate: '~10-20 API calls',
    });
    if (!confirmed) {
      console.log('Cancelled.');
      return;
    }
    await runMcpCli('scrape', ['factions', '-f', slug]);
  });

syncCmd
  .command('factions')
  .description('Sync all factions from Wahapedia')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (options: { yes?: boolean }) => {
    const confirmed = await confirmApiUsage(options, {
      service: 'Firecrawl',
      action: 'fetch all factions from Wahapedia',
      estimate: '~200+ API calls (all factions)',
    });
    if (!confirmed) {
      console.log('Cancelled.');
      return;
    }
    await runMcpCli('scrape', ['factions']);
  });

syncCmd
  .command('units <faction>')
  .description('Sync units for a faction from Wahapedia')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (faction: string, options: { yes?: boolean }) => {
    const confirmed = await confirmApiUsage(options, {
      service: 'Firecrawl',
      action: `fetch units for "${faction}" from Wahapedia`,
      estimate: '~30-100 API calls depending on faction size',
    });
    if (!confirmed) {
      console.log('Cancelled.');
      return;
    }
    await runMcpCli('scrape', ['units', '-f', faction]);
  });

syncCmd
  .command('unit <faction> <unit>')
  .description('Sync a specific unit from Wahapedia (e.g., space-marines Intercessor-Squad)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (faction: string, unit: string, options: { yes?: boolean }) => {
    const confirmed = await confirmApiUsage(options, {
      service: 'Firecrawl',
      action: `fetch unit "${unit}" from "${faction}"`,
      estimate: '~1 API call',
    });
    if (!confirmed) {
      console.log('Cancelled.');
      return;
    }
    await runMcpScraper('scrape-unit.ts', [faction, unit, '--force']);
  });

syncCmd
  .command('mission-pack <packId>')
  .description('Sync a mission pack from Wahapedia')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (packId: string, options: { yes?: boolean }) => {
    const confirmed = await confirmApiUsage(options, {
      service: 'Firecrawl',
      action: `fetch mission pack "${packId}" from Wahapedia`,
      estimate: '~5-10 API calls',
    });
    if (!confirmed) {
      console.log('Cancelled.');
      return;
    }
    await runMcpCli('scrape', ['missions', '-m', packId]);
  });

// === PARSE Commands (Re-process cached data → database) ===
const parseCmd = wahapediaCommand
  .command('parse')
  .description('Re-parse cached Wahapedia data → database (no API credits)');

parseCmd
  .command('all')
  .description('Re-parse ALL cached data (factions + unit datasheets)')
  .option('--dry-run', 'Preview changes without updating the database')
  .option('--faction <factionId>', 'Only reparse a specific faction')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options: { dryRun?: boolean; faction?: string; verbose?: boolean }) => {
    const args: string[] = [];
    if (options.dryRun) args.push('--dry-run');
    if (options.faction) args.push('--faction', options.faction);
    if (options.verbose) args.push('--verbose');

    console.log('=== Re-parsing all cached data ===\n');

    console.log('Step 1: Re-parsing faction data (army rules, detachments, stratagems, enhancements)...\n');
    await runMcpScript('reparse-factions.ts', args);

    console.log('\n\nStep 2: Re-parsing unit datasheets...\n');
    await runMcpScript('reparse-all.ts', args);

    console.log('\n=== All data re-parsed ===');
  });

parseCmd
  .command('factions')
  .description('Re-parse cached faction pages (army rules, detachments, stratagems, enhancements)')
  .option('--dry-run', 'Preview changes without updating the database')
  .option('--faction <factionId>', 'Only reparse a specific faction')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options: { dryRun?: boolean; faction?: string; verbose?: boolean }) => {
    const args: string[] = [];
    if (options.dryRun) args.push('--dry-run');
    if (options.faction) args.push('--faction', options.faction);
    if (options.verbose) args.push('--verbose');
    await runMcpScript('reparse-factions.ts', args);
  });

parseCmd
  .command('units')
  .description('Re-parse cached unit datasheets only')
  .option('--dry-run', 'Preview changes without updating the database')
  .option('--faction <factionId>', 'Only reparse units from a specific faction')
  .option('-v, --verbose', 'Show detailed output for each unit')
  .action(async (options: { dryRun?: boolean; faction?: string; verbose?: boolean }) => {
    const args: string[] = [];
    if (options.dryRun) args.push('--dry-run');
    if (options.faction) args.push('--faction', options.faction);
    if (options.verbose) args.push('--verbose');
    await runMcpScript('reparse-all.ts', args);
  });

// === CACHE Commands (Cache management) ===
const cacheCmd = wahapediaCommand
  .command('cache')
  .description('Firecrawl cache management');

cacheCmd
  .command('stats')
  .description('Show cache statistics')
  .action(async () => {
    await runMcpCli('cache', ['stats']);
  });

cacheCmd
  .command('analyze')
  .description('Analyze which cached pages have HTML vs markdown only')
  .action(async () => {
    await runMcpCli('cache', ['analyze']);
  });

cacheCmd
  .command('refresh')
  .description('Re-scrape pages that were cached as Markdown-only to get HTML content')
  .option('--dry-run', 'Preview which pages would be refreshed (no API calls)')
  .option('--factions-only', 'Only refresh faction main pages')
  .option('-v, --verbose', 'Show detailed output')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (options: { dryRun?: boolean; factionsOnly?: boolean; verbose?: boolean; yes?: boolean }) => {
    // Dry run doesn't need confirmation
    if (!options.dryRun) {
      const confirmed = await confirmApiUsage(options, {
        service: 'Firecrawl',
        action: 're-fetch cached pages to get HTML content',
        estimate: 'varies based on cache state',
      });
      if (!confirmed) {
        console.log('Cancelled.');
        return;
      }
    }

    const args: string[] = [];
    if (options.dryRun) args.push('--dry-run');
    if (options.factionsOnly) args.push('--factions-only');
    if (options.verbose) args.push('--verbose');
    await runMcpScript('refresh-cache-with-html.ts', args);
  });
