/**
 * Shared utility functions for Wahapedia parsers.
 *
 * Centralizes common operations like slugification, text normalization,
 * and deduplication that were previously duplicated across parser files.
 */

import {
  CAMEL_CASE_BOUNDARY,
  CONCAT_IN_THE,
  CONCAT_OF_THE,
  CONCAT_TO_THE,
  CONCAT_FROM_THE,
  REPEATED_KEYWORD_PHRASE,
  REPEATED_KEYWORD_WORD,
} from './regex-patterns.js';

// =============================================================================
// SLUGIFY
// =============================================================================

/**
 * Convert text to URL-friendly slug.
 * Converts to lowercase, replaces non-alphanumeric with hyphens, trims hyphens.
 *
 * @example "Hive Tyrant" → "hive-tyrant"
 * @example "Space Marines 2.0" → "space-marines-2-0"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// =============================================================================
// TITLE CASE
// =============================================================================

/**
 * Convert text to title case.
 *
 * @example "ASSAULT INTERCESSORS" → "Assault Intercessors"
 */
export function toTitleCase(text: string): string {
  return text
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// =============================================================================
// TEXT NORMALIZATION
// =============================================================================

/**
 * Map of concatenated text patterns to properly spaced text.
 * Firecrawl's markdown conversion often concatenates Wahapedia's keywords.
 */
const CONCATENATION_FIXES: Record<string, string> = {
  // Weapon ability combinations
  'blastpsychic': '[BLAST], [PSYCHIC]',
  'lethalhitspsychic': '[LETHAL HITS], [PSYCHIC]',
  'sustainedhitspsychic': '[SUSTAINED HITS], [PSYCHIC]',
  'devastatingwoundspsychic': '[DEVASTATING WOUNDS], [PSYCHIC]',
  'psychicblast': '[PSYCHIC], [BLAST]',
  'psychiclethalhits': '[PSYCHIC], [LETHAL HITS]',
  'psychicsustained': '[PSYCHIC], [SUSTAINED HITS]',
  'assaultblast': '[ASSAULT], [BLAST]',
  'heavyblast': '[HEAVY], [BLAST]',
  'rapidfireblast': '[RAPID FIRE], [BLAST]',
  'twinlinkedblast': '[TWIN-LINKED], [BLAST]',
  'meltahazardous': '[MELTA], [HAZARDOUS]',
  'torrentignorescover': '[TORRENT], [IGNORES COVER]',
  'ignorescovertorrent': '[IGNORES COVER], [TORRENT]',
  // Core abilities
  'feelnopain': 'Feel No Pain',
  'feelno pain': 'Feel No Pain',
  'fightsfirst': 'Fights First',
  'deepstrike': 'Deep Strike',
  'loneoperative': 'Lone Operative',
  'deadlydemise': 'Deadly Demise',
  'firingdeck': 'Firing Deck',
  // Faction abilities
  'pactofblood': 'Pact of Blood',
  'oathofmoment': 'Oath of Moment',
  'shadowinthewarp': 'Shadow in the Warp',
  'synapseshadow': 'Synapse, Shadow',
  'greatdevourer': 'Great Devourer',
  'fortheemperor': 'For the Emperor',
  'powerofthemachine': 'Power of the Machine Spirit',
  'codeofhonour': 'Code of Honour',
  'armyofrenown': 'Army of Renown',
  'blessingsofkhorne': 'Blessings of Khorne',
  'bloodforthebloodgod': 'Blood for the Blood God',
  // Game terms
  'mortalwounds': 'mortal wounds',
  'mortalwound': 'mortal wound',
  'invulnerablesave': 'invulnerable save',
  'battleshock': 'Battle-shock',
  'battleshocktest': 'Battle-shock test',
  'battle-shocktest': 'Battle-shock test',
  'commandpoints': 'Command points',
  'hitroll': 'Hit roll',
  'woundroll': 'Wound roll',
};

/**
 * Map of concatenated keywords to properly spaced form.
 * Used for faction names and other keywords.
 */
const KEYWORD_FIXES: Record<string, string> = {
  // Unit keywords
  CULTISTMOB: 'CULTIST MOB',
  DAMNEDCHARACTER: 'DAMNED CHARACTER',
  HERETICASTARTES: 'HERETIC ASTARTES',
  ADEPTUSASTARTES: 'ADEPTUS ASTARTES',
  ADEPTUSCUSTODES: 'ADEPTUS CUSTODES',
  ADEPTUSMECHANICUS: 'ADEPTUS MECHANICUS',
  ASTRAMILIT: 'ASTRA MILITARUM',
  DEATHGUARD: 'DEATH GUARD',
  THOUSANDSONS: 'THOUSAND SONS',
  WORLDEATERS: 'WORLD EATERS',
  GENESTEALERCULTS: 'GENESTEALER CULTS',
  LEAGUESOFVOTANN: 'LEAGUES OF VOTANN',
  IMPERIALAGENTS: 'IMPERIAL AGENTS',
  IMPERIALKNIGHT: 'IMPERIAL KNIGHT',
  CHAOSKNIGHT: 'CHAOS KNIGHT',
  GREYKNIGHTS: 'GREY KNIGHTS',
  BLOODANGELS: 'BLOOD ANGELS',
  DARKANGELS: 'DARK ANGELS',
  SPACEWOLVES: 'SPACE WOLVES',
  BLACKTEMPLARS: 'BLACK TEMPLARS',
  IMPERIALFISTS: 'IMPERIAL FISTS',
  IRONHANDS: 'IRON HANDS',
  WHITESCARS: 'WHITE SCARS',
  RAVENWING: 'RAVENWING',
  DEATHWING: 'DEATHWING',
  EPICHERO: 'EPIC HERO',
  // Weapon abilities
  LETHALHITS: 'LETHAL HITS',
  SUSTAINEDHITS: 'SUSTAINED HITS',
  SUSTAINEDHITS1: 'SUSTAINED HITS 1',
  SUSTAINEDHITS2: 'SUSTAINED HITS 2',
  SUSTAINEDHITSD3: 'SUSTAINED HITS D3',
  DEVASTATINGWOUNDS: 'DEVASTATING WOUNDS',
  INDIRECTFIRE: 'INDIRECT FIRE',
  RAPIDFIRE: 'RAPID FIRE',
  RAPIDFIRE1: 'RAPID FIRE 1',
  RAPIDFIRE2: 'RAPID FIRE 2',
  HEAVYWEAPON: 'HEAVY',
  ANTITANK: 'ANTI-TANK',
  ANTIINFANTRY: 'ANTI-INFANTRY',
  ANTIMONSTER: 'ANTI-MONSTER',
  ANTIVEHICLE: 'ANTI-VEHICLE',
  ANTIFLY: 'ANTI-FLY',
  FEELNOPAIN: 'FEEL NO PAIN',
  INVULNERABLESAVE: 'INVULNERABLE SAVE',
  // Core abilities
  DEEPSTRIKE: 'DEEP STRIKE',
  DEADLYDESCENT: 'DEADLY DESCENT',
  FIGHTSFIRST: 'FIGHTS FIRST',
  LONEOPERATIVE: 'LONE OPERATIVE',
  SCOUTSMOVE: 'SCOUTS MOVE',
  // Other common terms
  ENGAGEMENTRANGE: 'ENGAGEMENT RANGE',
  MORTALWOUNDS: 'MORTAL WOUNDS',
  MORTALWOUND: 'MORTAL WOUND',
  LEADERSHIPTEST: 'LEADERSHIP TEST',
  BATTLESHOCK: 'BATTLE-SHOCK',
  BATTLESHOCKED: 'BATTLE-SHOCKED',
  OBJECTIVECONTROL: 'OBJECTIVE CONTROL',
};

/**
 * Normalize text by fixing common concatenation issues from Firecrawl.
 * Applies CONCATENATION_FIXES map and adds spaces at camelCase boundaries.
 */
export function normalizeText(text: string): string {
  let result = text;

  for (const [concat, fixed] of Object.entries(CONCATENATION_FIXES)) {
    const regex = new RegExp(concat, 'gi');
    result = result.replace(regex, fixed);
  }

  // Add spaces at camelCase boundaries
  result = result.replace(CAMEL_CASE_BOUNDARY, '$1 $2');

  // Fix common word concatenations
  result = result.replace(CONCAT_IN_THE, '$1 $2');
  result = result.replace(CONCAT_OF_THE, '$1 $2');
  result = result.replace(CONCAT_TO_THE, '$1 $2');
  result = result.replace(CONCAT_FROM_THE, '$1 $2');

  return result;
}

/**
 * Normalize concatenated keywords in text by adding proper spacing.
 * Uses KEYWORD_FIXES map for faction names and game terms.
 */
export function normalizeKeywords(text: string): string {
  let result = text;
  for (const [concat, spaced] of Object.entries(KEYWORD_FIXES)) {
    const pattern = new RegExp(`\\b${concat}\\b`, 'gi');
    result = result.replace(pattern, spaced);
  }
  return result;
}

/**
 * Deduplicate repeated uppercase keywords in text.
 * Handles cases where adjacent <span> elements get concatenated without spaces.
 *
 * @example "HERETIC ASTARTESHERETIC ASTARTES..." → "HERETIC ASTARTES"
 * @example "INFANTRYINFANTRYINFANTRY" → "INFANTRY"
 */
export function dedupeKeywords(text: string): string {
  let result = text;

  // Handle multi-word phrases
  result = result.replace(REPEATED_KEYWORD_PHRASE, '$1');

  // Handle single repeated words
  result = result.replace(REPEATED_KEYWORD_WORD, '$1');

  return result;
}

// =============================================================================
// DEDUPLICATION TRACKER
// =============================================================================

/**
 * Utility class for tracking seen items during parsing.
 * Provides consistent deduplication logic across all parsers.
 */
export class DeduplicationTracker {
  private seen = new Set<string>();
  private caseSensitive: boolean;

  constructor(caseSensitive = false) {
    this.caseSensitive = caseSensitive;
  }

  /**
   * Check if a value has been seen before.
   */
  has(value: string): boolean {
    const key = this.caseSensitive ? value : value.toLowerCase();
    return this.seen.has(key);
  }

  /**
   * Mark a value as seen.
   */
  add(value: string): void {
    const key = this.caseSensitive ? value : value.toLowerCase();
    this.seen.add(key);
  }

  /**
   * Check if value exists, and if not, add it.
   * Returns true if the value was new (not seen before).
   */
  addIfNew(value: string): boolean {
    if (this.has(value)) {
      return false;
    }
    this.add(value);
    return true;
  }

  /**
   * Clear all tracked values.
   */
  clear(): void {
    this.seen.clear();
  }

  /**
   * Get count of tracked items.
   */
  get size(): number {
    return this.seen.size;
  }
}

// =============================================================================
// PHASE DETECTION
// =============================================================================

/**
 * Game phases for stratagems and abilities.
 */
type GamePhase = 'command' | 'movement' | 'shooting' | 'charge' | 'fight' | 'any';

/**
 * Detect game phase from text content.
 * Used for stratagems and abilities that specify when they can be used.
 */
export function detectPhase(text: string): GamePhase {
  const lower = text.toLowerCase();

  if (lower.includes('command')) return 'command';
  if (lower.includes('movement')) return 'movement';
  if (lower.includes('shooting')) return 'shooting';
  if (lower.includes('charge')) return 'charge';
  if (lower.includes('fight')) return 'fight';

  return 'any';
}

// =============================================================================
// RULE CATEGORY DETECTION
// =============================================================================

/**
 * Detect rule category from section title.
 * Used by core-rules-parser for categorizing rules.
 */
export function detectRuleCategory(title: string): string {
  const titleLower = title.toLowerCase();

  // Phase detection
  if (titleLower.includes('command phase')) return 'command_phase';
  if (titleLower.includes('movement phase')) return 'movement_phase';
  if (titleLower.includes('shooting phase')) return 'shooting_phase';
  if (titleLower.includes('charge phase')) return 'charge_phase';
  if (titleLower.includes('fight phase')) return 'fight_phase';

  // Combat mechanics
  if (titleLower.includes('attacks') || titleLower.includes('hit roll') || titleLower.includes('wound roll')) {
    return 'combat';
  }
  if (titleLower.includes('morale') || titleLower.includes('battle-shock')) return 'morale';
  if (titleLower.includes('transport')) return 'transports';
  if (titleLower.includes('terrain') || titleLower.includes('cover')) return 'terrain';
  if (titleLower.includes('psychic') || titleLower.includes('psyker')) return 'psychic';
  if (titleLower.includes('stratagem')) return 'stratagems';
  if (titleLower.includes('objective') || titleLower.includes('victory')) return 'objectives';
  if (titleLower.includes('deployment') || titleLower.includes('reserves')) return 'deployment';
  if (titleLower.includes('unit') || titleLower.includes('datasheet')) return 'units';
  if (titleLower.includes('weapon') || titleLower.includes('wargear')) return 'weapons';
  if (titleLower.includes('ability') || titleLower.includes('abilities')) return 'abilities';
  if (titleLower.includes('keyword')) return 'keywords';
  if (titleLower.includes('leader') || titleLower.includes('attached')) return 'leaders';

  return 'general';
}

// =============================================================================
// HTML TO READABLE TEXT
// =============================================================================

/**
 * Convert HTML content to readable plain text with proper formatting.
 * Preserves paragraph structure by adding line breaks where appropriate.
 *
 * @param html - Raw HTML string
 * @returns Formatted plain text with proper line breaks
 */
export function htmlToReadableText(html: string): string {
  // Add double newlines before block elements (headers, paragraphs)
  let text = html
    // Add newlines before headers
    .replace(/<h[1-6][^>]*>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    // Add newlines before/after paragraphs
    .replace(/<p[^>]*>/gi, '\n\n')
    .replace(/<\/p>/gi, '\n')
    // Convert <br> to newlines
    .replace(/<br\s*\/?>/gi, '\n')
    // Add newlines before divs with class containing "BreakInside"
    .replace(/<div[^>]*class="[^"]*BreakInside[^"]*"[^>]*>/gi, '\n\n')
    // Add newlines before tables
    .replace(/<table[^>]*>/gi, '\n\n')
    .replace(/<\/table>/gi, '\n')
    // Add newlines after table rows
    .replace(/<\/tr>/gi, '\n')
    // Add newlines before list items
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '')
    // Remove all other HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    // Normalize whitespace
    .replace(/[ \t]+/g, ' ')
    // Normalize multiple newlines to max 2
    .replace(/\n{3,}/g, '\n\n')
    // Trim lines
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    // Final trim
    .trim();

  return text;
}
