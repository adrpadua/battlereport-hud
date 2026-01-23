import { Command } from 'commander';
import { runMcpServer, runTurboDev } from '../utils/runner.js';

export const serveCommand = new Command('serve')
  .description('Start development servers');

serveCommand
  .command('api')
  .description('Start the HTTP API server (REST endpoints at http://localhost:40401)')
  .action(async () => {
    console.log('\n=== Starting HTTP API Server ===\n');
    console.log('Endpoints will be available at http://localhost:40401');
    console.log('  - GET /api/units');
    console.log('  - GET /api/stratagems');
    console.log('  - GET /api/enhancements');
    console.log('  - GET /api/objectives');
    console.log('  - GET /api/health');
    console.log('\nPress Ctrl+C to stop.\n');
    await runMcpServer();
  });

serveCommand
  .command('web')
  .description('Start web app development server')
  .action(async () => {
    await runTurboDev('@battlereport/web');
  });

serveCommand
  .command('extension')
  .description('Start browser extension development server')
  .action(async () => {
    await runTurboDev('@battlereport/extension');
  });

serveCommand
  .command('docs')
  .description('Start documentation site development server')
  .action(async () => {
    await runTurboDev('@battlereport/docs');
  });

serveCommand
  .command('all')
  .description('Start all development servers (web, extension, api, docs)')
  .action(async () => {
    await runTurboDev();
  });
