// Wahapedia URL patterns and configuration

export const WAHAPEDIA_BASE_URL = 'https://wahapedia.ru/wh40k10ed';

export const WAHAPEDIA_URLS = {
  // Rule categories (include these)
  rules: {
    quickStart: `${WAHAPEDIA_BASE_URL}/the-rules/quick-start-guide/`,
    core: `${WAHAPEDIA_BASE_URL}/the-rules/core-rules/`,
    crusade: `${WAHAPEDIA_BASE_URL}/the-rules/crusade-rules/`,
    commentary: `${WAHAPEDIA_BASE_URL}/the-rules/rules-commentary/`,
    faqs: `${WAHAPEDIA_BASE_URL}/the-rules/faqs/`,
  },

  // Matched Mission Packs (include these)
  missionPacks: {
    leviathan: `${WAHAPEDIA_BASE_URL}/the-rules/leviathan/`,
    pariahNexus: `${WAHAPEDIA_BASE_URL}/the-rules/pariah-nexus-battles/`,
    chapterApproved: `${WAHAPEDIA_BASE_URL}/the-rules/chapter-approved-2025-26/`,
  },

  // IGNORE: Crusade Mission Packs, Boarding Actions, Others

  // Faction main page - contains all content (army rules, detachments, stratagems, enhancements)
  factionBase: (slug: string) => `${WAHAPEDIA_BASE_URL}/factions/${slug}/`,

  // Datasheets listing page for a faction
  datasheets: (factionSlug: string) => `${WAHAPEDIA_BASE_URL}/factions/${factionSlug}/datasheets`,

  // Individual unit datasheets - pattern: /wh40k10ed/factions/{faction-slug}/{unit-name}
  unitDatasheet: (factionSlug: string, unitSlug: string) =>
    `${WAHAPEDIA_BASE_URL}/factions/${factionSlug}/${unitSlug}`,

  // Space Marine chapter subpages - contain chapter-specific detachments, stratagems, enhancements
  chapterPage: (chapterSlug: string) =>
    `${WAHAPEDIA_BASE_URL}/factions/space-marines/${chapterSlug}`,

  // Generic subfaction subpage - for factions with subfaction-specific content
  subfactionPage: (factionSlug: string, subfactionSlug: string) =>
    `${WAHAPEDIA_BASE_URL}/factions/${factionSlug}/${subfactionSlug}`,
};

// Space Marine chapters with their Wahapedia slugs
// These are subpages under /factions/space-marines/{chapter-slug}
export const SPACE_MARINE_CHAPTER_SLUGS = [
  'blood-angels',
  'dark-angels',
  'space-wolves',
  'black-templars',
  'deathwatch',
  'ultramarines',
  'imperial-fists',
  'white-scars',
  'raven-guard',
  'salamanders',
  'iron-hands',
] as const;

export type ChapterSlug = typeof SPACE_MARINE_CHAPTER_SLUGS[number];

// Chaos Daemons god-specific subfactions
// These are subpages under /factions/chaos-daemons/{god-slug}
export const CHAOS_DAEMON_SUBFACTION_SLUGS = [
  'khorne',
  'nurgle',
  'tzeentch',
  'slaanesh',
] as const;

export type ChaosDaemonSubfactionSlug = typeof CHAOS_DAEMON_SUBFACTION_SLUGS[number];

// Aeldari subfactions (Ynnari and Harlequins have separate pages)
// These are subpages under /factions/aeldari/{subfaction-slug}
export const AELDARI_SUBFACTION_SLUGS = [
  'ynnari',
  'harlequins',
] as const;

export type AeldariSubfactionSlug = typeof AELDARI_SUBFACTION_SLUGS[number];

// All factions that have subfaction subpages
export const FACTION_SUBFACTIONS: Record<string, readonly string[]> = {
  'space-marines': SPACE_MARINE_CHAPTER_SLUGS,
  'chaos-daemons': CHAOS_DAEMON_SUBFACTION_SLUGS,
  'aeldari': AELDARI_SUBFACTION_SLUGS,
};

// Known factions with their Wahapedia slugs (updated Jan 2026)
export const FACTION_SLUGS = [
  // Imperium
  'adepta-sororitas',
  'adeptus-custodes',
  'adeptus-mechanicus',
  'astra-militarum',
  'grey-knights',
  'imperial-agents',
  'imperial-knights',
  'space-marines',

  // Chaos
  'chaos-daemons',
  'chaos-knights',
  'chaos-space-marines',
  'death-guard',
  'emperor-s-children',
  'thousand-sons',
  'world-eaters',

  // Xenos
  'aeldari',
  'drukhari',
  'genestealer-cults',
  'leagues-of-votann',
  'necrons',
  'orks',
  't-au-empire',
  'tyranids',

  // Unaligned
  'unaligned-forces',
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
  // Rules
  if (url.includes('/quick-start-guide')) return 'quick_start';
  if (url.includes('/core-rules')) return 'core_rules';
  if (url.includes('/crusade-rules')) return 'crusade_rules';
  if (url.includes('/rules-commentary')) return 'commentary';
  if (url.includes('/faqs')) return 'faqs';

  // Mission Packs
  if (url.includes('/leviathan')) return 'mission_pack';
  if (url.includes('/pariah-nexus-battles')) return 'mission_pack';
  if (url.includes('/chapter-approved')) return 'mission_pack';

  // Faction content (all on main faction page)
  if (url.includes('/factions/')) return 'faction';

  return 'unknown';
}
