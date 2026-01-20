import { Command } from 'commander';
import { runScript } from '../utils/runner.js';

export const generateCommand = new Command('generate')
  .description('Data generation commands');

// Generate faction data from BSData
generateCommand
  .command('factions')
  .description('Generate faction data from BSData')
  .action(async () => {
    await runScript('generate-faction-data.ts');
  });

// Generate stratagem data from database
generateCommand
  .command('stratagems')
  .description('Generate stratagem data from database')
  .action(async () => {
    await runScript('generate-stratagem-data.ts');
  });

// Generate unit aliases via LLM
generateCommand
  .command('aliases')
  .description('Generate unit aliases via LLM')
  .argument('[faction]', 'Specific faction to generate aliases for')
  .option('--dry-run', 'Preview without saving')
  .action(async (faction?: string, options?: { dryRun?: boolean }) => {
    const args: string[] = [];
    if (faction) args.push(faction);
    if (options?.dryRun) args.push('--dry-run');
    await runScript('generate-unit-aliases.ts', args);
  });

// Fetch BSData
generateCommand
  .command('bsdata-fetch')
  .description('Fetch raw BSData files from GitHub')
  .action(async () => {
    await runScript('bsdata-fetcher.ts');
  });

// Parse BSData
generateCommand
  .command('bsdata-parse')
  .description('Parse BSData files into usable format')
  .action(async () => {
    await runScript('bsdata-parser.ts');
  });

// Generate all data
generateCommand
  .command('all')
  .description('Run all data generation scripts')
  .action(async () => {
    console.log('\n=== Running All Data Generation ===\n');

    console.log('Step 1: Generating faction data...');
    await runScript('generate-faction-data.ts');

    console.log('\nStep 2: Generating stratagem data...');
    await runScript('generate-stratagem-data.ts');

    console.log('\n=== All Data Generation Complete ===\n');
  });
