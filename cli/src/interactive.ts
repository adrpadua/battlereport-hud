import { select, input, confirm } from '@inquirer/prompts';
import { runScript, runTurboDev, runTurbo, runMcpCli, runMcpScript, runMcpServer, runMcpScraper } from './utils/runner.js';
import { confirmApiUsage } from './utils/confirm.js';

type MenuAction = 'wahapedia' | 'bsdata' | 'db' | 'codegen' | 'search' | 'video' | 'serve' | 'build' | 'exit';

async function wahapediaMenu(): Promise<void> {
  const action = await select({
    message: 'Wahapedia Operations',
    choices: [
      { name: 'Sync from Wahapedia (uses Firecrawl credits)', value: 'sync' },
      { name: 'Parse cached data (no API calls)', value: 'parse' },
      { name: 'Cache management', value: 'cache' },
      { name: '<- Back', value: 'back' },
    ],
  });

  if (action === 'back') return;

  if (action === 'sync') {
    const syncAction = await select({
      message: 'Sync from Wahapedia',
      choices: [
        { name: 'Sync core rules', value: 'rules' },
        { name: 'Sync specific faction', value: 'faction' },
        { name: 'Sync all factions', value: 'factions' },
        { name: 'Sync units for faction', value: 'units' },
        { name: 'Sync specific unit', value: 'unit' },
        { name: '<- Back', value: 'back' },
      ],
    });
    if (syncAction === 'back') return;

    if (syncAction === 'rules') {
      const confirmed = await confirmApiUsage({}, {
        service: 'Firecrawl',
        action: 'fetch core rules from Wahapedia',
        estimate: '~5 API calls',
      });
      if (confirmed) await runMcpCli('scrape', ['core-rules']);
    } else if (syncAction === 'faction') {
      const factionId = await input({
        message: 'Enter faction slug (e.g., tyranids, space-marines):',
        validate: (v) => v.trim().length > 0 || 'Please enter a faction slug',
      });
      const confirmed = await confirmApiUsage({}, {
        service: 'Firecrawl',
        action: `fetch faction "${factionId}" from Wahapedia`,
        estimate: '~10-20 API calls',
      });
      if (confirmed) await runMcpCli('scrape', ['faction', factionId]);
    } else if (syncAction === 'factions') {
      const confirmed = await confirmApiUsage({}, {
        service: 'Firecrawl',
        action: 'fetch all factions from Wahapedia',
        estimate: '~200+ API calls (all factions)',
      });
      if (confirmed) await runMcpCli('scrape', ['all-factions']);
    } else if (syncAction === 'units') {
      const factionId = await input({
        message: 'Enter faction slug:',
        validate: (v) => v.trim().length > 0 || 'Please enter a faction slug',
      });
      const confirmed = await confirmApiUsage({}, {
        service: 'Firecrawl',
        action: `fetch units for "${factionId}" from Wahapedia`,
        estimate: '~30-100 API calls depending on faction size',
      });
      if (confirmed) await runMcpCli('scrape', ['units', factionId]);
    } else if (syncAction === 'unit') {
      const faction = await input({
        message: 'Enter faction slug (e.g., space-marines):',
        validate: (v) => v.trim().length > 0 || 'Please enter a faction slug',
      });
      const unit = await input({
        message: 'Enter unit slug (e.g., Intercessor-Squad):',
        validate: (v) => v.trim().length > 0 || 'Please enter a unit slug',
      });
      const confirmed = await confirmApiUsage({}, {
        service: 'Firecrawl',
        action: `fetch unit "${unit}" from "${faction}"`,
        estimate: '~1 API call',
      });
      if (confirmed) await runMcpScraper('scrape-unit.ts', [faction, unit, '--force']);
    }
  } else if (action === 'parse') {
    const parseAction = await select({
      message: 'Parse Cached Data',
      choices: [
        { name: 'Parse ALL data (factions + units)', value: 'all' },
        { name: 'Parse factions only (army rules, detachments, stratagems)', value: 'factions' },
        { name: 'Parse units only (datasheets)', value: 'units' },
        { name: '<- Back', value: 'back' },
      ],
    });
    if (parseAction === 'back') return;

    const dryRun = await confirm({
      message: 'Dry run (preview without saving)?',
      default: true,
    });
    const verbose = await confirm({
      message: 'Verbose output?',
      default: false,
    });

    const args: string[] = [];
    if (dryRun) args.push('--dry-run');
    if (verbose) args.push('--verbose');

    if (parseAction === 'all') {
      console.log('\n=== Re-parsing all cached data ===\n');
      console.log('Step 1: Re-parsing faction data...\n');
      await runMcpScript('reparse-factions.ts', args);
      console.log('\n\nStep 2: Re-parsing unit datasheets...\n');
      await runMcpScript('reparse-all.ts', args);
      console.log('\n=== All data re-parsed ===');
    } else if (parseAction === 'factions') {
      await runMcpScript('reparse-factions.ts', args);
    } else if (parseAction === 'units') {
      await runMcpScript('reparse-all.ts', args);
    }
  } else if (action === 'cache') {
    const cacheAction = await select({
      message: 'Cache Management',
      choices: [
        { name: 'Show cache statistics', value: 'stats' },
        { name: 'Analyze HTML vs Markdown coverage', value: 'analyze' },
        { name: 'Refresh Markdown-only pages', value: 'refresh' },
        { name: '<- Back', value: 'back' },
      ],
    });
    if (cacheAction === 'back') return;

    if (cacheAction === 'stats') {
      await runMcpCli('cache', ['stats']);
    } else if (cacheAction === 'analyze') {
      await runMcpCli('cache', ['analyze']);
    } else if (cacheAction === 'refresh') {
      const dryRun = await confirm({
        message: 'Dry run (preview only)?',
        default: true,
      });
      if (!dryRun) {
        const confirmed = await confirmApiUsage({}, {
          service: 'Firecrawl',
          action: 're-fetch cached pages to get HTML content',
          estimate: 'varies based on cache state',
        });
        if (!confirmed) return;
      }
      const args = dryRun ? ['--dry-run'] : [];
      await runMcpScript('refresh-cache-with-html.ts', args);
    }
  }
}

async function bsdataMenu(): Promise<void> {
  const action = await select({
    message: 'BSData Operations',
    choices: [
      { name: 'Fetch from GitHub', value: 'fetch' },
      { name: 'Parse XML files', value: 'parse' },
      { name: 'Import into database', value: 'import' },
      { name: 'Run full pipeline (fetch + parse + import)', value: 'all' },
      { name: '<- Back', value: 'back' },
    ],
  });

  if (action === 'back') return;

  if (action === 'fetch') {
    await runScript('bsdata-fetcher.ts');
  } else if (action === 'parse') {
    await runScript('bsdata-parser.ts');
  } else if (action === 'import') {
    await runMcpCli('ingest', ['bsdata']);
  } else if (action === 'all') {
    console.log('\n=== BSData Full Pipeline ===\n');
    console.log('Step 1: Fetching BSData from GitHub...');
    await runScript('bsdata-fetcher.ts');
    console.log('\nStep 2: Parsing BSData XML files...');
    await runScript('bsdata-parser.ts');
    console.log('\nStep 3: Importing into database...');
    await runMcpCli('ingest', ['bsdata']);
    console.log('\n=== BSData Pipeline Complete ===\n');
  }
}

async function dbMenu(): Promise<void> {
  const action = await select({
    message: 'Database Operations',
    choices: [
      { name: 'Run migrations', value: 'migrate' },
      { name: 'Seed database', value: 'seed' },
      { name: 'Export database', value: 'export' },
      { name: 'Cleanup duplicates', value: 'cleanup' },
      { name: 'Clear data', value: 'clear' },
      { name: 'Show information', value: 'show' },
      { name: 'Query unit', value: 'query' },
      { name: 'Validate data', value: 'validate' },
      { name: '<- Back', value: 'back' },
    ],
  });

  if (action === 'back') return;

  if (action === 'migrate') {
    await runMcpCli('db', ['migrate']);
  } else if (action === 'seed') {
    await runMcpCli('db', ['seed']);
  } else if (action === 'export') {
    await runMcpScript('export-database.ts');
  } else if (action === 'cleanup') {
    const dryRun = await confirm({
      message: 'Dry run (preview only)?',
      default: true,
    });
    const args = ['cleanup-duplicates'];
    if (dryRun) args.push('--dry-run');
    await runMcpCli('db', args);
  } else if (action === 'clear') {
    const clearAction = await select({
      message: 'Clear Data',
      choices: [
        { name: 'Clear abilities', value: 'abilities' },
        { name: 'Clear extraction cache', value: 'cache' },
        { name: '<- Back', value: 'back' },
      ],
    });
    if (clearAction === 'back') return;

    if (clearAction === 'abilities') {
      await runMcpScript('clear-abilities.ts');
    } else if (clearAction === 'cache') {
      const videoId = await input({
        message: 'Video ID (leave empty for all):',
      });
      const args = ['clear-cache'];
      if (videoId.trim()) args.push(videoId.trim());
      await runMcpCli('db', args);
    }
  } else if (action === 'show') {
    const showAction = await select({
      message: 'Show Information',
      choices: [
        { name: 'Faction unit counts', value: 'faction-counts' },
        { name: 'Debug unit data', value: 'unit' },
        { name: '<- Back', value: 'back' },
      ],
    });
    if (showAction === 'back') return;

    if (showAction === 'faction-counts') {
      await runMcpScript('faction-counts.ts');
    } else if (showAction === 'unit') {
      const name = await input({
        message: 'Enter unit name:',
        validate: (v) => v.trim().length > 0 || 'Please enter a unit name',
      });
      await runMcpCli('db', ['debug-unit', name]);
    }
  } else if (action === 'query') {
    const unitName = await input({
      message: 'Enter unit name to query:',
      validate: (v) => v.trim().length > 0 || 'Please enter a unit name',
    });
    await runMcpScript('query-unit.ts', [unitName]);
  } else if (action === 'validate') {
    await runMcpCli('validate');
  }
}

async function codegenMenu(): Promise<void> {
  const action = await select({
    message: 'Code Generation',
    choices: [
      { name: 'Generate faction constants', value: 'factions' },
      { name: 'Generate stratagem constants', value: 'stratagems' },
      { name: 'Generate detachment constants', value: 'detachments' },
      { name: 'Generate unit aliases (uses OpenAI credits)', value: 'aliases' },
      { name: 'Run all (excludes aliases)', value: 'all' },
      { name: '<- Back', value: 'back' },
    ],
  });

  if (action === 'back') return;

  if (action === 'factions') {
    await runScript('generate-faction-data.ts');
  } else if (action === 'stratagems') {
    await runScript('generate-stratagem-data.ts');
  } else if (action === 'detachments') {
    await runMcpScript('generate-detachment-data.ts');
  } else if (action === 'aliases') {
    const faction = await input({
      message: 'Faction slug (leave empty for all):',
    });
    const dryRun = await confirm({
      message: 'Dry run (preview without saving)?',
      default: true,
    });

    if (!dryRun) {
      const confirmed = await confirmApiUsage({}, {
        service: 'OpenAI',
        action: faction.trim()
          ? `generate aliases for "${faction.trim()}" units`
          : 'generate aliases for all units',
        estimate: faction.trim()
          ? '~1-5 API calls'
          : '~50+ API calls (all factions)',
      });
      if (!confirmed) return;
    }

    const args: string[] = [];
    if (faction.trim()) args.push(faction.trim());
    if (dryRun) args.push('--dry-run');
    await runScript('generate-unit-aliases.ts', args);
  } else if (action === 'all') {
    console.log('\n=== Running All Code Generation ===\n');
    console.log('Note: "aliases" is excluded because it uses OpenAI credits.\n');

    console.log('Step 1: Generating faction data...');
    await runScript('generate-faction-data.ts');

    console.log('\nStep 2: Generating stratagem data...');
    await runScript('generate-stratagem-data.ts');

    console.log('\nStep 3: Generating detachment data...');
    await runMcpScript('generate-detachment-data.ts');

    console.log('\n=== All Code Generation Complete ===\n');
  }
}

async function searchMenu(): Promise<void> {
  const action = await select({
    message: 'Search Index Operations',
    choices: [
      { name: 'Build search index', value: 'build' },
      { name: 'Check index status', value: 'check' },
      { name: 'Validate search results', value: 'validate' },
      { name: '<- Back', value: 'back' },
    ],
  });

  if (action === 'back') return;

  if (action === 'build') {
    await runMcpCli('index', ['build']);
  } else if (action === 'check') {
    await runMcpScript('check-index.ts');
  } else if (action === 'validate') {
    await runMcpCli('validate');
  }
}

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
      { name: 'Run preprocessor tests', value: 'test-preprocessor' },
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
  } else if (action === 'test-preprocessor') {
    await runScript('test-transcript-preprocessor.ts');
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

async function serveMenu(): Promise<void> {
  const action = await select({
    message: 'Development Servers',
    choices: [
      { name: 'Start HTTP API server', value: 'api' },
      { name: 'Start web app', value: 'web' },
      { name: 'Start browser extension', value: 'extension' },
      { name: 'Start documentation site', value: 'docs' },
      { name: 'Start all servers', value: 'all' },
      { name: '<- Back', value: 'back' },
    ],
  });

  if (action === 'back') return;

  if (action === 'api') {
    console.log('\n=== Starting HTTP API Server ===\n');
    console.log('Endpoints available at http://localhost:40401');
    console.log('Press Ctrl+C to stop.\n');
    await runMcpServer();
  } else if (action === 'all') {
    await runTurboDev();
  } else {
    const filters: Record<string, string> = {
      web: '@battlereport/web',
      extension: '@battlereport/extension',
      docs: '@battlereport/docs',
    };
    await runTurboDev(filters[action]);
  }
}

async function buildMenu(): Promise<void> {
  const action = await select({
    message: 'Build Operations',
    choices: [
      { name: 'Build all packages', value: 'all' },
      { name: 'Typecheck all packages', value: 'typecheck' },
      { name: '<- Back', value: 'back' },
    ],
  });

  if (action === 'back') return;

  if (action === 'all') {
    await runTurbo('build');
  } else if (action === 'typecheck') {
    await runTurbo('typecheck');
  }
}

async function mainMenu(): Promise<boolean> {
  console.log('');
  const action = await select<MenuAction>({
    message: 'BattleReport HUD - What would you like to do?',
    choices: [
      { name: 'Wahapedia (sync/parse game data)', value: 'wahapedia' },
      { name: 'BSData (fetch/parse XML)', value: 'bsdata' },
      { name: 'Database (migrations, queries)', value: 'db' },
      { name: 'Code Generation (TypeScript constants)', value: 'codegen' },
      { name: 'Search Index (build, check)', value: 'search' },
      { name: 'Video Processing', value: 'video' },
      { name: 'Development Servers', value: 'serve' },
      { name: 'Build Operations', value: 'build' },
      { name: 'Exit', value: 'exit' },
    ],
  });

  if (action === 'exit') {
    return false;
  }

  try {
    if (action === 'wahapedia') {
      await wahapediaMenu();
    } else if (action === 'bsdata') {
      await bsdataMenu();
    } else if (action === 'db') {
      await dbMenu();
    } else if (action === 'codegen') {
      await codegenMenu();
    } else if (action === 'search') {
      await searchMenu();
    } else if (action === 'video') {
      await videoMenu();
    } else if (action === 'serve') {
      await serveMenu();
    } else if (action === 'build') {
      await buildMenu();
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
