import { Command } from 'commander';
import { runMcpCli, runMcpScript, runMcpServer } from '../utils/runner.js';

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
  .action(async () => {
    await runMcpScript('cleanup-duplicates.ts');
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
