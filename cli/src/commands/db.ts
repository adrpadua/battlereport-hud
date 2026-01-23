import { Command } from 'commander';
import { runMcpCli, runMcpScript } from '../utils/runner.js';

export const dbCommand = new Command('db')
  .description('Database administration (migrations, cleanup, queries)');

dbCommand
  .command('migrate')
  .description('Run database migrations')
  .action(async () => {
    await runMcpCli('db', ['migrate']);
  });

dbCommand
  .command('seed')
  .description('Seed the database with initial data')
  .action(async () => {
    await runMcpCli('db', ['seed']);
  });

dbCommand
  .command('export')
  .description('Export database to file')
  .action(async () => {
    await runMcpScript('export-database.ts');
  });

// === CLEANUP Commands ===
const cleanupCmd = dbCommand
  .command('cleanup')
  .description('Database cleanup operations');

cleanupCmd
  .command('duplicates')
  .description('Clean up duplicate entries in the database')
  .option('--dry-run', 'Show what would be deleted without actually deleting')
  .action(async (options: { dryRun?: boolean }) => {
    const args = ['cleanup-duplicates'];
    if (options.dryRun) args.push('--dry-run');
    await runMcpCli('db', args);
  });

// === CLEAR Commands ===
const clearCmd = dbCommand
  .command('clear')
  .description('Clear specific data from the database');

clearCmd
  .command('abilities')
  .description('Clear abilities from the database')
  .action(async () => {
    await runMcpScript('clear-abilities.ts');
  });

clearCmd
  .command('cache [videoId]')
  .description('Clear extraction cache for a video or all videos')
  .action(async (videoId?: string) => {
    const args = ['clear-cache'];
    if (videoId) args.push(videoId);
    await runMcpCli('db', args);
  });

// === SHOW Commands ===
const showCmd = dbCommand
  .command('show')
  .description('Show database information');

showCmd
  .command('faction-counts')
  .description('Show unit counts per faction')
  .action(async () => {
    await runMcpScript('faction-counts.ts');
  });

showCmd
  .command('unit <name>')
  .description('Debug unit data including duplicate weapons/abilities')
  .action(async (name: string) => {
    await runMcpCli('db', ['debug-unit', name]);
  });

// === QUERY Command ===
dbCommand
  .command('query <unitName>')
  .description('Query a specific unit from the database')
  .action(async (unitName: string) => {
    await runMcpScript('query-unit.ts', [unitName]);
  });

// === VALIDATE Command ===
dbCommand
  .command('validate')
  .description('Validate ingested data')
  .action(async () => {
    await runMcpCli('validate');
  });
