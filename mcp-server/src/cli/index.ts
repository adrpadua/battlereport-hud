#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { indexCommand } from './commands/index-cmd.js';
import { scrapeCommand } from './commands/scrape.js';
import { dbCommand } from './commands/db.js';
import { ingestCommand } from './commands/ingest.js';
import { validateCommand } from './commands/validate.js';

const program = new Command();

program
  .name('wh40k')
  .description('WH40K Rules MCP Server CLI')
  .version('1.0.0');

program.addCommand(indexCommand);
program.addCommand(scrapeCommand);
program.addCommand(dbCommand);
program.addCommand(ingestCommand);
program.addCommand(validateCommand);

program.parse();
