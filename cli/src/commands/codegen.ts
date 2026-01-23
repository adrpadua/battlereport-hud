import { Command } from 'commander';
import { runScript, runMcpScript } from '../utils/runner.js';
import { confirmApiUsage } from '../utils/confirm.js';

export const codegenCommand = new Command('codegen')
  .description('Generate TypeScript constants from database');

codegenCommand
  .command('factions')
  .description('Generate faction data from BSData')
  .action(async () => {
    await runScript('generate-faction-data.ts');
  });

codegenCommand
  .command('stratagems')
  .description('Generate stratagem constants from database')
  .action(async () => {
    await runScript('generate-stratagem-data.ts');
  });

codegenCommand
  .command('detachments')
  .description('Generate detachment constants from database')
  .action(async () => {
    await runMcpScript('generate-detachment-data.ts');
  });

codegenCommand
  .command('aliases [faction]')
  .description('Generate unit aliases via LLM (uses OpenAI credits)')
  .option('--dry-run', 'Preview without saving')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (faction: string | undefined, options: { dryRun?: boolean; yes?: boolean }) => {
    // Dry run doesn't cost API credits
    if (!options.dryRun) {
      const confirmed = await confirmApiUsage(options, {
        service: 'OpenAI',
        action: faction
          ? `generate aliases for "${faction}" units`
          : 'generate aliases for all units',
        estimate: faction
          ? '~1-5 API calls'
          : '~50+ API calls (all factions)',
      });
      if (!confirmed) {
        console.log('Cancelled.');
        return;
      }
    }

    const args: string[] = [];
    if (faction) args.push(faction);
    if (options.dryRun) args.push('--dry-run');
    await runScript('generate-unit-aliases.ts', args);
  });

codegenCommand
  .command('all')
  .description('Run all codegen (excludes aliases - run separately)')
  .action(async () => {
    console.log('\n=== Running All Code Generation ===\n');
    console.log('Note: "aliases" is excluded from "all" because it uses OpenAI credits.');
    console.log('Run "cli codegen aliases" separately if needed.\n');

    console.log('Step 1: Generating faction data...');
    await runScript('generate-faction-data.ts');

    console.log('\nStep 2: Generating stratagem data...');
    await runScript('generate-stratagem-data.ts');

    console.log('\nStep 3: Generating detachment data...');
    await runMcpScript('generate-detachment-data.ts');

    console.log('\n=== All Code Generation Complete ===\n');
  });
