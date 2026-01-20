import { Command } from 'commander';
import { runTurboDev } from '../utils/runner.js';

export const devCommand = new Command('dev')
  .description('Development server commands');

// Run web dev server
devCommand
  .command('web')
  .description('Start the web app development server')
  .action(async () => {
    await runTurboDev('@battlereport/web');
  });

// Run extension dev server
devCommand
  .command('extension')
  .description('Start the extension development server')
  .action(async () => {
    await runTurboDev('@battlereport/extension');
  });

// Run MCP server dev
devCommand
  .command('mcp')
  .description('Start the MCP server development mode')
  .action(async () => {
    await runTurboDev('wh40k-rules-mcp');
  });

// Run docs dev server
devCommand
  .command('docs')
  .description('Start the documentation site development server')
  .action(async () => {
    await runTurboDev('@battlereport/docs');
  });

// Run all dev servers
devCommand
  .command('all')
  .description('Start all development servers')
  .action(async () => {
    // No filter means run all
    await runTurboDev();
  });
