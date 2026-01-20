import { Command } from 'commander';
import { runTurbo } from '../utils/runner.js';

export const turboCommand = new Command('turbo')
  .description('Turbo shortcut commands');

// Build all
turboCommand
  .command('build')
  .description('Build all packages')
  .action(async () => {
    await runTurbo('build');
  });

// Typecheck all
turboCommand
  .command('typecheck')
  .description('Typecheck all packages')
  .action(async () => {
    await runTurbo('typecheck');
  });
