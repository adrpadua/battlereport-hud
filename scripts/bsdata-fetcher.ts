import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';

const BSDATA_REPO = 'BSData/wh40k-10e';
const BSDATA_BRANCH = 'main';
const CACHE_DIR = join(process.cwd(), '.bsdata-cache');

interface GitHubFile {
  name: string;
  path: string;
  download_url: string;
}

interface CacheMetadata {
  fetchedAt: number;
  commit: string;
}

export async function fetchCatalogueList(): Promise<GitHubFile[]> {
  const apiUrl = `https://api.github.com/repos/${BSDATA_REPO}/contents?ref=${BSDATA_BRANCH}`;

  const response = await fetch(apiUrl, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'battlereport-hud-build',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch repository contents: ${response.status} ${response.statusText}`);
  }

  const files: GitHubFile[] = await response.json();
  return files.filter(f => f.name.endsWith('.cat'));
}

export async function fetchCatalogue(file: GitHubFile): Promise<string> {
  const cachePath = join(CACHE_DIR, file.name);

  // Check cache first
  if (existsSync(cachePath)) {
    console.log(`  Using cached: ${file.name}`);
    return readFileSync(cachePath, 'utf-8');
  }

  console.log(`  Fetching: ${file.name}`);

  const response = await fetch(file.download_url, {
    headers: {
      'User-Agent': 'battlereport-hud-build',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${file.name}: ${response.status}`);
  }

  const content = await response.text();

  // Cache the file
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
  writeFileSync(cachePath, content, 'utf-8');

  return content;
}

export interface CatalogueEntry {
  factionId: string;
  filename: string;
  content: string;
}

export async function fetchAllCatalogues(): Promise<CatalogueEntry[]> {
  console.log('Fetching BSData catalogue list...');
  const files = await fetchCatalogueList();
  console.log(`Found ${files.length} catalogue files`);

  const catalogues: CatalogueEntry[] = [];

  // Ensure cache directory exists
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }

  // Fetch catalogues in batches to avoid rate limiting
  const BATCH_SIZE = 5;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (file) => {
        try {
          const content = await fetchCatalogue(file);
          // Extract faction ID from filename (e.g., "Imperium - Space Marines.cat" -> "space-marines")
          const factionId = extractFactionId(file.name);
          return { factionId, filename: file.name, content };
        } catch (error) {
          console.warn(`Warning: Failed to fetch ${file.name}:`, error);
          return null;
        }
      })
    );

    for (const result of results) {
      if (result) {
        catalogues.push(result);
      }
    }

    // Small delay between batches to be nice to GitHub
    if (i + BATCH_SIZE < files.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return catalogues;
}

function extractFactionId(filename: string): string {
  // Remove .cat extension and convert to kebab-case ID
  const name = filename.replace('.cat', '');

  // Special handling for Library files - keep full name
  if (name.includes('Library')) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // Handle special prefixes like "Imperium - ", "Chaos - ", etc.
  const parts = name.split(' - ');
  const factionName = parts.length > 1 ? parts[parts.length - 1] : name;

  return factionName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function clearCache(): void {
  if (existsSync(CACHE_DIR)) {
    const files = require('fs').readdirSync(CACHE_DIR);
    for (const file of files) {
      require('fs').unlinkSync(join(CACHE_DIR, file));
    }
    require('fs').rmdirSync(CACHE_DIR);
    console.log('Cache cleared');
  }
}
