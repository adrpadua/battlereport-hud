import { Command } from 'commander';
import { runTurbo } from '../utils/runner.js';

export const buildCommand = new Command('build')
  .description('Build operations');

buildCommand
  .command('all')
  .description('Build all packages')
  .action(async () => {
    await runTurbo('build');
  });

buildCommand
  .command('typecheck')
  .description('Typecheck all packages')
  .action(async () => {
    await runTurbo('typecheck');
  });
