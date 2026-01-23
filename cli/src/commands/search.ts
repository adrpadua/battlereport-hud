import { Command } from 'commander';
import { runMcpCli, runMcpScript } from '../utils/runner.js';

export const searchCommand = new Command('search')
  .description('Search index operations');

searchCommand
  .command('build')
  .description('Build the search index')
  .action(async () => {
    await runMcpCli('index', ['build']);
  });

searchCommand
  .command('check')
  .description('Check the search index status')
  .action(async () => {
    await runMcpScript('check-index.ts');
  });

searchCommand
  .command('validate')
  .description('Validate search results against the database')
  .action(async () => {
    // This runs the general validation which includes search index
    await runMcpCli('validate');
  });
