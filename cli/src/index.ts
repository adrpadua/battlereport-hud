#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { videoCommand } from './commands/video.js';
import { wahapediaCommand } from './commands/wahapedia.js';
import { bsdataCommand } from './commands/bsdata.js';
import { dbCommand } from './commands/db.js';
import { codegenCommand } from './commands/codegen.js';
import { searchCommand } from './commands/search.js';
import { serveCommand } from './commands/serve.js';
import { buildCommand } from './commands/build.js';
import { runInteractive } from './interactive.js';

const program = new Command();

program
  .name('battlereport')
  .description('BattleReport HUD CLI - Video processing, data generation, and development tools')
  .version('1.0.0');

// Data source operations
program.addCommand(wahapediaCommand);
program.addCommand(bsdataCommand);

// Database operations
program.addCommand(dbCommand);

// Code generation
program.addCommand(codegenCommand);

// Search index
program.addCommand(searchCommand);

// Video processing (unchanged)
program.addCommand(videoCommand);

// Server operations
program.addCommand(serveCommand);

// Build operations
program.addCommand(buildCommand);

// Global unhandled rejection handler
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

// If no arguments provided, run interactive mode
if (process.argv.length <= 2) {
  runInteractive().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  program.parseAsync().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
