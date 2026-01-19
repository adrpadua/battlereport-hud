import 'dotenv/config';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run(script: string, args: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${script} ${args.join(' ')}`);
    console.log('='.repeat(60));

    const proc = spawn('npx', ['tsx', script, ...args], {
      cwd: join(__dirname, '../..'),
      stdio: 'inherit',
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script ${script} exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const skipMigrate = args.includes('--skip-migrate');
  const skipWahapedia = args.includes('--skip-wahapedia');
  const skipBsdata = args.includes('--skip-bsdata');

  console.log('Starting full data ingestion pipeline...\n');

  try {
    // Step 1: Run migrations
    if (!skipMigrate) {
      await run('src/db/migrate.ts');
    }

    // Step 2: Scrape Wahapedia
    if (!skipWahapedia) {
      await run('src/scraper/run-scraper.ts', ['--target', 'all']);
    }

    // Step 3: Ingest BSData
    if (!skipBsdata) {
      await run('src/ingestion/ingest-bsdata.ts');
    }

    console.log('\n' + '='.repeat(60));
    console.log('Full ingestion completed successfully!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\nIngestion failed:', error);
    process.exit(1);
  }
}

main();
