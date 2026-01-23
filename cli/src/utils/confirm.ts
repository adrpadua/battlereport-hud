import { confirm } from '@inquirer/prompts';

/**
 * Confirm an action that will consume paid API credits.
 * Skips the prompt if --yes or -y flag is passed.
 */
export async function confirmApiUsage(
  options: { yes?: boolean },
  config: {
    service: string;
    action: string;
    estimate?: string;
  }
): Promise<boolean> {
  // If --yes flag is passed, skip confirmation
  if (options.yes) {
    return true;
  }

  console.log('');
  console.log(`⚠️  This will use ${config.service} API credits to ${config.action}.`);
  if (config.estimate) {
    console.log(`   Estimated: ${config.estimate}`);
  }
  console.log('');

  return confirm({
    message: 'Continue?',
    default: false,
  });
}
