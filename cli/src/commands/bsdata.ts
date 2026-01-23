import { Command } from 'commander';
import { runScript, runMcpCli } from '../utils/runner.js';

export const bsdataCommand = new Command('bsdata')
  .description('BSData XML operations (fetch from GitHub, parse, import to database)');

bsdataCommand
  .command('fetch')
  .description('Download BSData XML files from GitHub')
  .action(async () => {
    await runScript('bsdata-fetcher.ts');
  });

bsdataCommand
  .command('parse')
  .description('Parse BSData XML files into usable format')
  .action(async () => {
    await runScript('bsdata-parser.ts');
  });

bsdataCommand
  .command('import')
  .description('Import parsed BSData files into the database')
  .action(async () => {
    await runMcpCli('ingest', ['bsdata']);
  });

bsdataCommand
  .command('all')
  .description('Run full BSData pipeline: fetch → parse → import')
  .action(async () => {
    console.log('\n=== BSData Full Pipeline ===\n');

    console.log('Step 1: Fetching BSData from GitHub...');
    await runScript('bsdata-fetcher.ts');

    console.log('\nStep 2: Parsing BSData XML files...');
    await runScript('bsdata-parser.ts');

    console.log('\nStep 3: Importing into database...');
    await runMcpCli('ingest', ['bsdata']);

    console.log('\n=== BSData Pipeline Complete ===\n');
  });
