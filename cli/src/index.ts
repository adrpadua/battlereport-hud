#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { videoCommand } from './commands/video.js';
import { generateCommand } from './commands/generate.js';
import { devCommand } from './commands/dev.js';
import { turboCommand } from './commands/turbo.js';
import { mcpCommand } from './commands/mcp.js';
import { serverCommand } from './commands/server.js';
import { runInteractive } from './interactive.js';

const program = new Command();

program
  .name('battlereport')
  .description('BattleReport HUD CLI - Video processing, data generation, and development tools')
  .version('1.0.0');

program.addCommand(videoCommand);
program.addCommand(generateCommand);
program.addCommand(devCommand);
program.addCommand(turboCommand);
program.addCommand(mcpCommand);
program.addCommand(serverCommand);

// If no arguments provided, run interactive mode
if (process.argv.length <= 2) {
  runInteractive().catch(console.error);
} else {
  program.parse();
}
