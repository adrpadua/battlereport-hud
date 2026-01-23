import { Command } from 'commander';
import { runMcpCli, runMcpScript, runMcpServer, runMcpScraper } from '../utils/runner.js';

export const mcpCommand = new Command('mcp')
  .description('MCP server commands (database, scraping, indexing)');

// === MCP CLI Commands (proxied from wh40k CLI) ===

// Scrape command group
const scrapeCmd = mcpCommand
  .command('scrape')
  .description('Scrape game data from Wahapedia and BSData');

scrapeCmd
  .command('core-rules')
  .description('Scrape core rules from Wahapedia')
  .action(async () => {
    await runMcpCli('scrape', ['core-rules']);
  });

scrapeCmd
  .command('faction <factionId>')
  .description('Scrape a specific faction')
  .action(async (factionId: string) => {
    await runMcpCli('scrape', ['faction', factionId]);
  });

scrapeCmd
  .command('all-factions')
  .description('Scrape all factions')
  .action(async () => {
    await runMcpCli('scrape', ['all-factions']);
  });

scrapeCmd
  .command('units <factionId>')
  .description('Scrape units for a faction')
  .action(async (factionId: string) => {
    await runMcpCli('scrape', ['units', factionId]);
  });

scrapeCmd
  .command('mission-pack <packId>')
  .description('Scrape a mission pack')
  .action(async (packId: string) => {
    await runMcpCli('scrape', ['mission-pack', packId]);
  });

scrapeCmd
  .command('unit <factionSlug> <unitSlug>')
  .description('Scrape a specific unit (e.g., space-marines Intercessor-Squad)')
  .option('--force', 'Force re-fetch from Wahapedia (uses API credits)')
  .option('--reparse', 'Re-parse cached data and update database (no API credits)')
  .action(async (factionSlug: string, unitSlug: string, options: { force?: boolean; reparse?: boolean }) => {
    const args = [factionSlug, unitSlug];
    if (options.force) args.push('--force');
    if (options.reparse) args.push('--reparse');
    await runMcpScraper('scrape-unit.ts', args);
  });

// Database command group
const dbCmd = mcpCommand
  .command('db')
  .description('Database management commands');

dbCmd
  .command('migrate')
  .description('Run database migrations')
  .action(async () => {
    await runMcpCli('db', ['migrate']);
  });

dbCmd
  .command('seed')
  .description('Seed the database with initial data')
  .action(async () => {
    await runMcpCli('db', ['seed']);
  });

dbCmd
  .command('export')
  .description('Export database to file')
  .action(async () => {
    await runMcpScript('export-database.ts');
  });

dbCmd
  .command('cleanup-duplicates')
  .description('Clean up duplicate entries in the database')
  .option('--dry-run', 'Show what would be deleted without actually deleting')
  .action(async (options: { dryRun?: boolean }) => {
    const args = ['cleanup-duplicates'];
    if (options.dryRun) args.push('--dry-run');
    await runMcpCli('db', args);
  });

dbCmd
  .command('clear-abilities')
  .description('Clear abilities from the database')
  .action(async () => {
    await runMcpScript('clear-abilities.ts');
  });

dbCmd
  .command('faction-counts')
  .description('Show faction unit counts')
  .action(async () => {
    await runMcpScript('faction-counts.ts');
  });

dbCmd
  .command('debug-unit <name>')
  .description('Debug unit data including duplicate weapons/abilities')
  .action(async (name: string) => {
    await runMcpCli('db', ['debug-unit', name]);
  });

dbCmd
  .command('clear-cache [videoId]')
  .description('Clear extraction cache for a video or all videos')
  .action(async (videoId?: string) => {
    const args = ['clear-cache'];
    if (videoId) args.push(videoId);
    await runMcpCli('db', args);
  });

// Ingest command group
const ingestCmd = mcpCommand
  .command('ingest')
  .description('Ingest data into the database');

ingestCmd
  .command('bsdata')
  .description('Ingest BSData files')
  .action(async () => {
    await runMcpCli('ingest', ['bsdata']);
  });

ingestCmd
  .command('scraped')
  .description('Ingest scraped data')
  .action(async () => {
    await runMcpCli('ingest', ['scraped']);
  });

// Index command group
const indexCmd = mcpCommand
  .command('index')
  .description('Search index management');

indexCmd
  .command('build')
  .description('Build the search index')
  .action(async () => {
    await runMcpCli('index', ['build']);
  });

indexCmd
  .command('check')
  .description('Check the search index status')
  .action(async () => {
    await runMcpScript('check-index.ts');
  });

// Validate command
mcpCommand
  .command('validate')
  .description('Validate ingested data')
  .action(async () => {
    await runMcpCli('validate');
  });

// Query commands
const queryCmd = mcpCommand
  .command('query')
  .description('Query the database');

queryCmd
  .command('unit <unitName>')
  .description('Query a specific unit')
  .action(async (unitName: string) => {
    await runMcpScript('query-unit.ts', [unitName]);
  });

// Server command
mcpCommand
  .command('server')
  .description('Start the MCP HTTP API server')
  .action(async () => {
    console.log('Starting MCP HTTP server...');
    await runMcpServer();
  });

// Rescrape commands
const rescrapeCmd = mcpCommand
  .command('rescrape')
  .description('Rescrape specific data');

rescrapeCmd
  .command('faction <factionId>')
  .description('Rescrape a specific faction')
  .action(async (factionId: string) => {
    await runMcpScript('rescrape-faction.ts', [factionId]);
  });

rescrapeCmd
  .command('space-marines')
  .description('Rescrape Space Marines faction')
  .action(async () => {
    await runMcpScript('scrape-space-marines.ts');
  });

rescrapeCmd
  .command('tau')
  .description('Rescrape Tau faction')
  .action(async () => {
    await runMcpScript('scrape-tau.ts');
  });

// Reparse command group
const reparseCmd = mcpCommand
  .command('reparse')
  .description('Re-parse cached data without making API calls');

reparseCmd
  .command('all')
  .description('Re-parse all cached unit datasheets and update the database')
  .option('--dry-run', 'Preview changes without updating the database')
  .option('--faction <factionId>', 'Only reparse units from a specific faction')
  .option('--verbose, -v', 'Show detailed output for each unit')
  .action(async (options: { dryRun?: boolean; faction?: string; verbose?: boolean }) => {
    const args: string[] = [];
    if (options.dryRun) args.push('--dry-run');
    if (options.faction) args.push('--faction', options.faction);
    if (options.verbose) args.push('--verbose');
    await runMcpScript('reparse-all.ts', args);
  });

reparseCmd
  .command('factions')
  .description('Re-parse cached faction pages (army rules, detachments, stratagems, enhancements)')
  .option('--dry-run', 'Preview changes without updating the database')
  .option('--faction <factionId>', 'Only reparse a specific faction')
  .option('--verbose, -v', 'Show detailed output')
  .action(async (options: { dryRun?: boolean; faction?: string; verbose?: boolean }) => {
    const args: string[] = [];
    if (options.dryRun) args.push('--dry-run');
    if (options.faction) args.push('--faction', options.faction);
    if (options.verbose) args.push('--verbose');
    await runMcpScript('reparse-factions.ts', args);
  });
