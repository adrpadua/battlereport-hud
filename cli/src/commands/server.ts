import { Command } from 'commander';
import { runMcpServer, runTurboDev } from '../utils/runner.js';

export const serverCommand = new Command('server')
  .description('Server management commands');

// Start MCP HTTP API server
serverCommand
  .command('api')
  .description('Start the MCP HTTP API server (REST endpoints)')
  .action(async () => {
    console.log('\n=== Starting MCP HTTP API Server ===\n');
    console.log('Endpoints will be available at http://localhost:40401');
    console.log('  - GET /api/units');
    console.log('  - GET /api/stratagems');
    console.log('  - GET /api/enhancements');
    console.log('  - GET /api/objectives');
    console.log('  - GET /api/health');
    console.log('\nPress Ctrl+C to stop.\n');
    await runMcpServer();
  });

// Start all dev servers
serverCommand
  .command('dev')
  .description('Start all development servers (web, extension, mcp, docs)')
  .action(async () => {
    await runTurboDev();
  });

// Alias for dev:web
serverCommand
  .command('web')
  .description('Start web app development server')
  .action(async () => {
    await runTurboDev('@battlereport/web');
  });

// Alias for dev:extension
serverCommand
  .command('extension')
  .description('Start browser extension development server')
  .action(async () => {
    await runTurboDev('@battlereport/extension');
  });

// Alias for dev:docs
serverCommand
  .command('docs')
  .description('Start documentation site development server')
  .action(async () => {
    await runTurboDev('@battlereport/docs');
  });
