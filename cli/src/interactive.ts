import { select, input, confirm } from '@inquirer/prompts';
import { runScript, runTurboDev, runTurbo } from './utils/runner.js';

type MenuAction = 'video' | 'generate' | 'dev' | 'turbo' | 'exit';

async function videoMenu(): Promise<void> {
  const action = await select({
    message: 'Video Processing',
    choices: [
      { name: 'Extract transcript from YouTube', value: 'extract' },
      { name: 'Show transcript section', value: 'show' },
      { name: 'Test preprocessing', value: 'preprocess' },
      { name: 'Compare LLM vs pattern preprocessing', value: 'llm-preprocess' },
      { name: 'Generate narration', value: 'narrate' },
      { name: 'Test chapter detection', value: 'chapters' },
      { name: 'Run E2E pipeline', value: 'pipeline' },
      { name: '<- Back', value: 'back' },
    ],
  });

  if (action === 'back') return;

  if (action === 'extract') {
    const url = await input({
      message: 'Enter YouTube URL or video ID:',
      validate: (value) => value.trim().length > 0 || 'Please enter a URL or video ID',
    });
    await runScript('transcript-extractor.ts', [url]);
  } else if (action === 'show') {
    const videoId = await input({
      message: 'Enter video ID:',
      validate: (value) => value.trim().length > 0 || 'Please enter a video ID',
    });
    const startMin = await input({
      message: 'Start minute:',
      default: '1',
    });
    const endMin = await input({
      message: 'End minute:',
      default: '15',
    });
    await runScript('show-transcript-section.ts', [videoId, startMin, endMin]);
  } else if (action === 'preprocess') {
    const videoId = await input({
      message: 'Enter video ID:',
      validate: (value) => value.trim().length > 0 || 'Please enter a video ID',
    });
    const faction1 = await input({
      message: 'First faction ID (optional):',
    });
    const faction2 = await input({
      message: 'Second faction ID (optional):',
    });
    const args = [videoId];
    if (faction1.trim()) args.push(faction1.trim());
    if (faction2.trim()) args.push(faction2.trim());
    await runScript('test-video-preprocessing.ts', args);
  } else if (action === 'llm-preprocess') {
    const videoId = await input({
      message: 'Enter video ID:',
      validate: (value) => value.trim().length > 0 || 'Please enter a video ID',
    });
    await runScript('test-llm-preprocessing.ts', [videoId]);
  } else if (action === 'narrate') {
    const videoId = await input({
      message: 'Enter video ID:',
      validate: (value) => value.trim().length > 0 || 'Please enter a video ID',
    });
    const callAi = await confirm({
      message: 'Call AI to generate actual narration?',
      default: false,
    });
    const args = [videoId];
    if (callAi) args.push('--call-ai');
    await runScript('test-game-narrator.ts', args);
  } else if (action === 'chapters') {
    const videoId = await input({
      message: 'Enter video ID:',
      validate: (value) => value.trim().length > 0 || 'Please enter a video ID',
    });
    await runScript('test-chapter-detection.ts', [videoId]);
  } else if (action === 'pipeline') {
    const url = await input({
      message: 'Enter YouTube URL:',
      validate: (value) => value.trim().length > 0 || 'Please enter a URL',
    });
    const narrate = await confirm({
      message: 'Generate narration at the end?',
      default: false,
    });

    console.log('\n=== BattleReport Video Pipeline ===\n');

    console.log('Step 1: Extracting transcript...');
    await runScript('transcript-extractor.ts', [url]);

    console.log('\nStep 2: Running preprocessing...');
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    const videoId = videoIdMatch?.[1] || url;
    await runScript('test-video-preprocessing.ts', [videoId]);

    if (narrate) {
      console.log('\nStep 3: Generating narration...');
      await runScript('test-game-narrator.ts', [videoId, '--call-ai']);
    }

    console.log('\n=== Pipeline Complete ===\n');
  }
}

async function generateMenu(): Promise<void> {
  const action = await select({
    message: 'Data Generation',
    choices: [
      { name: 'Generate faction data from BSData', value: 'factions' },
      { name: 'Generate stratagem data from database', value: 'stratagems' },
      { name: 'Generate unit aliases via LLM', value: 'aliases' },
      { name: 'Run all data generation', value: 'all' },
      { name: '<- Back', value: 'back' },
    ],
  });

  if (action === 'back') return;

  if (action === 'factions') {
    await runScript('generate-faction-data.ts');
  } else if (action === 'stratagems') {
    await runScript('generate-stratagem-data.ts');
  } else if (action === 'aliases') {
    const faction = await input({
      message: 'Faction ID (leave empty for all):',
    });
    const dryRun = await confirm({
      message: 'Dry run (preview without saving)?',
      default: false,
    });
    const args: string[] = [];
    if (faction.trim()) args.push(faction.trim());
    if (dryRun) args.push('--dry-run');
    await runScript('generate-unit-aliases.ts', args);
  } else if (action === 'all') {
    console.log('\n=== Running All Data Generation ===\n');

    console.log('Step 1: Generating faction data...');
    await runScript('generate-faction-data.ts');

    console.log('\nStep 2: Generating stratagem data...');
    await runScript('generate-stratagem-data.ts');

    console.log('\n=== All Data Generation Complete ===\n');
  }
}

async function devMenu(): Promise<void> {
  const action = await select({
    message: 'Development Servers',
    choices: [
      { name: 'Web app', value: 'web' },
      { name: 'Browser extension', value: 'extension' },
      { name: 'MCP server', value: 'mcp' },
      { name: 'Documentation site', value: 'docs' },
      { name: 'All servers', value: 'all' },
      { name: '<- Back', value: 'back' },
    ],
  });

  if (action === 'back') return;

  const filters: Record<string, string | undefined> = {
    web: '@battlereport/web',
    extension: '@battlereport/extension',
    mcp: 'wh40k-rules-mcp',
    docs: '@battlereport/docs',
    all: undefined,
  };

  await runTurboDev(filters[action]);
}

async function turboMenu(): Promise<void> {
  const action = await select({
    message: 'Turbo Commands',
    choices: [
      { name: 'Build all packages', value: 'build' },
      { name: 'Typecheck all packages', value: 'typecheck' },
      { name: '<- Back', value: 'back' },
    ],
  });

  if (action === 'back') return;

  await runTurbo(action);
}

async function mainMenu(): Promise<boolean> {
  console.log('');
  const action = await select<MenuAction>({
    message: 'BattleReport HUD - What would you like to do?',
    choices: [
      { name: 'Video Processing', value: 'video' },
      { name: 'Data Generation', value: 'generate' },
      { name: 'Development Servers', value: 'dev' },
      { name: 'Turbo Commands', value: 'turbo' },
      { name: 'Exit', value: 'exit' },
    ],
  });

  if (action === 'exit') {
    return false;
  }

  try {
    if (action === 'video') {
      await videoMenu();
    } else if (action === 'generate') {
      await generateMenu();
    } else if (action === 'dev') {
      await devMenu();
    } else if (action === 'turbo') {
      await turboMenu();
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('User force closed')) {
      // User pressed Ctrl+C, treat as exit
      return false;
    }
    console.error('Error:', error instanceof Error ? error.message : error);
  }

  return true;
}

export async function runInteractive(): Promise<void> {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║       BattleReport HUD CLI             ║');
  console.log('║         Interactive Mode               ║');
  console.log('╚════════════════════════════════════════╝');

  let running = true;
  while (running) {
    running = await mainMenu();
  }

  console.log('\nGoodbye!\n');
}
