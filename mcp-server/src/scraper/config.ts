// Wahapedia URL patterns and configuration

export const WAHAPEDIA_BASE_URL = 'https://wahapedia.ru/wh40k10ed';

export const WAHAPEDIA_URLS = {
  // Core rules
  coreRules: `${WAHAPEDIA_BASE_URL}/the-rules/core-rules/`,

  // Rule categories
  rules: {
    core: `${WAHAPEDIA_BASE_URL}/the-rules/core-rules/`,
    missions: `${WAHAPEDIA_BASE_URL}/the-rules/matched-play/`,
    crusade: `${WAHAPEDIA_BASE_URL}/the-rules/crusade-rules/`,
    terrain: `${WAHAPEDIA_BASE_URL}/the-rules/terrain/`,
  },

  // Faction index
  factionIndex: `${WAHAPEDIA_BASE_URL}/factions/`,

  // Dynamic faction URLs - pattern: /wh40k10ed/factions/{faction-slug}/
  factionBase: (slug: string) => `${WAHAPEDIA_BASE_URL}/factions/${slug}/`,

  // Datasheets (units) - pattern: /wh40k10ed/factions/{faction-slug}/datasheets
  datasheets: (factionSlug: string) => `${WAHAPEDIA_BASE_URL}/factions/${factionSlug}/datasheets`,

  // Detachments - pattern: /wh40k10ed/factions/{faction-slug}/detachments
  detachments: (factionSlug: string) => `${WAHAPEDIA_BASE_URL}/factions/${factionSlug}/detachments`,

  // Army rules
  armyRules: (factionSlug: string) => `${WAHAPEDIA_BASE_URL}/factions/${factionSlug}/army-rules`,

  // Stratagems
  stratagems: (factionSlug: string) => `${WAHAPEDIA_BASE_URL}/factions/${factionSlug}/stratagems`,

  // FAQ/Errata
  faq: `${WAHAPEDIA_BASE_URL}/faq/`,
};

// Known factions with their Wahapedia slugs
export const FACTION_SLUGS = [
  // Imperium
  'adeptus-astartes',
  'blood-angels',
  'dark-angels',
  'deathwatch',
  'space-wolves',
  'black-templars',
  'grey-knights',
  'adeptus-custodes',
  'adepta-sororitas',
  'adeptus-mechanicus',
  'astra-militarum',
  'imperial-knights',
  'imperial-agents',

  // Chaos
  'chaos-space-marines',
  'death-guard',
  'thousand-sons',
  'world-eaters',
  'chaos-daemons',
  'chaos-knights',

  // Xenos
  'aeldari',
  'drukhari',
  'harlequins',
  'ynnari',
  'necrons',
  'orks',
  'tau-empire',
  'tyranids',
  'genestealer-cults',
  'leagues-of-votann',
] as const;

export type FactionSlug = typeof FACTION_SLUGS[number];

// Scraper configuration
export interface ScraperConfig {
  firecrawlApiKey: string;
  cacheDir: string;
  rateLimit: number; // requests per minute
  retryAttempts: number;
  retryDelay: number; // ms
}

export function getScraperConfig(): ScraperConfig {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error('FIRECRAWL_API_KEY environment variable is required');
  }

  return {
    firecrawlApiKey: apiKey,
    cacheDir: process.env.CACHE_DIR || './.scrape-cache',
    rateLimit: parseInt(process.env.SCRAPE_RATE_LIMIT || '10', 10),
    retryAttempts: 3,
    retryDelay: 2000,
  };
}

// Content type detection based on URL patterns
export function detectContentType(url: string): string {
  if (url.includes('/core-rules')) return 'core_rules';
  if (url.includes('/matched-play')) return 'missions';
  if (url.includes('/crusade')) return 'crusade';
  if (url.includes('/terrain')) return 'terrain';
  if (url.includes('/datasheets')) return 'units';
  if (url.includes('/detachments')) return 'detachments';
  if (url.includes('/army-rules')) return 'army_rules';
  if (url.includes('/stratagems')) return 'stratagems';
  if (url.includes('/faq')) return 'faq';
  if (url.includes('/factions/')) return 'faction';
  return 'unknown';
}
