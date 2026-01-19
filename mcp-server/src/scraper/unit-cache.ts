import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '../../.cache');
const CACHE_FILE = join(CACHE_DIR, 'unit-slugs.json');

interface UnitEntry {
  name: string;
  slug: string;
}

interface UnitCache {
  [factionSlug: string]: {
    units: UnitEntry[];
    scrapedAt: string;
  };
}

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function loadCache(): UnitCache {
  try {
    if (existsSync(CACHE_FILE)) {
      return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
    }
  } catch {
    // Cache corrupted, start fresh
  }
  return {};
}

function saveCache(cache: UnitCache): void {
  ensureCacheDir();
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * Get cached unit slugs for a faction
 */
export function getCachedUnits(factionSlug: string): UnitEntry[] | null {
  const cache = loadCache();
  return cache[factionSlug]?.units ?? null;
}

/**
 * Save unit slugs to cache for a faction
 */
export function cacheUnits(factionSlug: string, units: UnitEntry[]): void {
  const cache = loadCache();
  cache[factionSlug] = {
    units,
    scrapedAt: new Date().toISOString(),
  };
  saveCache(cache);
}

/**
 * Clear cache for a specific faction or all factions
 */
export function clearCache(factionSlug?: string): void {
  if (factionSlug) {
    const cache = loadCache();
    delete cache[factionSlug];
    saveCache(cache);
  } else {
    if (existsSync(CACHE_FILE)) {
      writeFileSync(CACHE_FILE, '{}');
    }
  }
}

/**
 * List all cached factions
 */
export function listCachedFactions(): { slug: string; unitCount: number; scrapedAt: string }[] {
  const cache = loadCache();
  return Object.entries(cache).map(([slug, data]) => ({
    slug,
    unitCount: data.units.length,
    scrapedAt: data.scrapedAt,
  }));
}
