/**
 * Centralized regex patterns for Wahapedia scrapers.
 *
 * This module contains all regex patterns used across parsers to:
 * - Eliminate duplication across unit-parser, faction-parser, mission-pack-parser, core-rules-parser
 * - Provide documentation for complex patterns
 * - Enable easier testing and maintenance
 */

// =============================================================================
// TITLE & NAME EXTRACTION
// =============================================================================

/**
 * Extract unit/page name from "Faction – Unit Name" or "Faction - Unit Name" format.
 * Used in page titles and h1 headers on Wahapedia.
 *
 * Captures: [1] = unit name (everything after the dash until brackets or another dash)
 *
 * @example "Tyranids – Hive Tyrant" → "Hive Tyrant"
 * @example "Space Marines - Intercessor Squad [Legends]" → "Intercessor Squad "
 */
export const TITLE_UNIT_NAME = /[–-]\s*([^[\–-]+)/;

// =============================================================================
// UNIT STATS EXTRACTION
// =============================================================================

/**
 * Match inline stat block format: M T Sv W Ld OC
 * This format appears in text when stats aren't in a table.
 *
 * Captures: [1]=movement, [2]=toughness, [3]=save, [4]=wounds, [5]=leadership, [6]=OC
 *
 * @example "M 6" T 5 Sv 3+ W 6 Ld 6+ OC 2" → ["6\"", "5", "3+", "6", "6+", "2"]
 */
export const INLINE_STATS = /M\s+(\d+"?)\s+T\s+(\d+)\s+Sv\s+(\d+\+?)\s+W\s+(\d+)\s+Ld\s+(\d+\+?)\s+OC\s+(\d+)/;

// =============================================================================
// INVULNERABLE SAVE EXTRACTION
// =============================================================================

/**
 * Match dedicated "INVULNERABLE SAVE" section header followed by value.
 * This is the most reliable pattern for a unit's actual invuln save.
 *
 * Captures: [1] = save value (e.g., "4+")
 *
 * @example "INVULNERABLE SAVE\n4+" → "4+"
 */
export const INVULN_SECTION_HEADER = /INVULNERABLE SAVE[\s\n]*(\d+\+)/i;

/**
 * Match "has a X+ invulnerable save" pattern in ability text.
 * Less reliable as it may be conditional (e.g., "while within 6\"").
 *
 * Captures: [1] = save value
 *
 * @example "This model has a 4+ invulnerable save" → "4+"
 */
export const INVULN_HAS_PATTERN = /has\s+a?\s*(\d+\+)\s*invulnerable save/i;

/**
 * Generic invuln save value pattern.
 * Captures: [1] = save value
 */
export const INVULN_GENERIC = /(\d+\+)\s*invulnerable save/i;

// =============================================================================
// POINTS COST EXTRACTION
// =============================================================================

/**
 * Match standalone 2-3 digit number (potential points cost).
 * Used when scanning table cells for point values.
 *
 * Captures: [1] = the number
 *
 * @example "65" → "65"
 */
export const STANDALONE_POINTS = /^(\d{2,3})$/;

/**
 * Match points in table format: | X models | 65 |
 *
 * Captures: [1] = points value
 *
 * @example "| 5 models | 90 |" → "90"
 */
export const TABLE_POINTS_FORMAT = /\|\s*\d+\s*model[s]?\s*\|\s*(\d+)\s*\|/i;

// =============================================================================
// UNIT COMPOSITION & LEADER INFO
// =============================================================================

/**
 * Extract leader attachment info.
 * Matches the list of units a leader can attach to.
 *
 * Captures: [1] = list of attachable units
 */
export const LEADER_ATTACHMENT_INFO = /LEADER[\s\S]*?(?:can be attached to the following unit|can attach to)s?:\s*([\s\S]*?)(?=KEYWORDS:|FACTION KEYWORDS:|STRATAGEMS|DETACHMENT|$)/i;

/**
 * Extract keywords section content.
 *
 * Captures: [1] = keywords text
 *
 * @example "KEYWORDS: Infantry, Imperium" → "Infantry, Imperium"
 */
export const KEYWORDS_SECTION = /KEYWORDS:?\s*([^\n]+)/i;

/**
 * Extract base size from text (e.g., "⌀32mm" or "⌀90mm oval").
 *
 * Captures: [1] = base size including "oval" if present
 *
 * @example "(⌀32mm)" → "32mm"
 * @example "(⌀90mm oval)" → "90mm oval"
 */
export const BASE_SIZE = /\(⌀(\d+mm(?:\s+oval)?)\)/;

// =============================================================================
// STRATAGEM PARSING
// =============================================================================

/**
 * Match complete stratagem block in Wahapedia format.
 * Structure: NAME (all caps) → CP cost → Type info → Content
 *
 * Captures: [1]=name, [2]=CP cost, [3]=type info, [4]=content
 *
 * @example:
 * ARMOUR OF CONTEMPT
 *
 * 1CP
 *
 * Gladius Task Force – Battle Tactic Stratagem
 *
 * **WHEN:** ...
 */
export const STRATAGEM_BLOCK = /([A-Z][A-Z\s'''-]+)\n\n?(\d+)CP\n\n?([^\n]+Stratagem)\n([\s\S]*?)(?=\n[A-Z][A-Z\s'''-]{3,}\n\n?\d+CP|## |$)/g;

/**
 * Extract WHEN clause from stratagem content.
 * Captures multi-line content until next bold marker.
 *
 * Captures: [1] = when text (may span multiple lines)
 */
export const STRATAGEM_WHEN = /\*\*WHEN:\*\*\s*([^\n]+(?:\n(?!\*\*)[^\n]+)*)/i;

/**
 * Extract TARGET clause from stratagem content.
 *
 * Captures: [1] = target text
 */
export const STRATAGEM_TARGET = /\*\*TARGET:\*\*\s*([^\n]+(?:\n(?!\*\*)[^\n]+)*)/i;

/**
 * Extract EFFECT clause from stratagem content.
 *
 * Captures: [1] = effect text
 */
export const STRATAGEM_EFFECT = /\*\*EFFECT:\*\*\s*([^\n]+(?:\n(?!\*\*)[^\n]+)*)/i;

// =============================================================================
// ENHANCEMENT PARSING
// =============================================================================

/**
 * Match enhancement table row: | - Name XX pts<br>... |
 *
 * Captures: [1] = cell content after "- "
 */
export const ENHANCEMENT_TABLE_ROW = /\|\s*-\s*([^|]+)\s*\|/g;

/**
 * Extract enhancement name and points cost.
 * Format: "Enhancement Name 25 pts"
 *
 * Captures: [1]=name, [2]=points
 *
 * @example "Adept of the Codex 20pts" → ["Adept of the Codex ", "20"]
 */
export const ENHANCEMENT_NAME_POINTS = /^(.+?)(\d+)\s*pts?$/i;

/**
 * Match restriction text (e.g., "ADEPTUS ASTARTES model only.").
 *
 * Captures: [1] = full restriction text
 */
export const ENHANCEMENT_RESTRICTION = /([A-Z][A-Z\s]*(?:model|models?|INFANTRY|PSYKER)[^.]*only\.?)/i;

// =============================================================================
// MARKDOWN SECTION SPLITTING
// =============================================================================

/**
 * Split content by h2 headers (##).
 * Use with String.split() to get major sections.
 */
export const SPLIT_H2 = /^## /m;

/**
 * Split content by h3 headers (###).
 * Use with String.split() to get subsections.
 */
export const SPLIT_H3 = /^### /m;

// =============================================================================
// ARMY RULES EXTRACTION
// =============================================================================

/**
 * Multiple patterns to match Army Rules section.
 * Wahapedia formats vary, so we try several heading patterns.
 */
export const ARMY_RULES_PATTERNS = [
  /## Army Rules?\s*([\s\S]*?)(?=\n## (?!###)|$)/i,
  /# Army Rules?\s*([\s\S]*?)(?=\n# (?!##)|$)/i,
  /### Army Rules?\s*([\s\S]*?)(?=\n### (?!####)|$)/i,
  /\*\*Army Rules?\*\*\s*([\s\S]*?)(?=\n\*\*[A-Z]|\n## |\n# |$)/i,
];

/**
 * Extract lore/background section.
 */
export const LORE_SECTION = /## (?:Background|Lore|About|Introduction)\s*([\s\S]*?)(?=##|$)/i;

/**
 * Extract intro text (content before first ##).
 */
export const INTRO_TEXT = /^([\s\S]*?)(?=##)/;

// =============================================================================
// FACTION INDEX PARSING
// =============================================================================

/**
 * Match faction links in format: [Faction Name](/wh40k10ed/factions/faction-slug/)
 *
 * Captures: [1]=faction name, [2]=faction slug
 */
export const FACTION_LINK = /\[([^\]]+)\]\(\/wh40k10ed\/factions\/([^/)]+)\/?[^)]*\)/g;

// =============================================================================
// DETACHMENT RULE EXTRACTION
// =============================================================================

/**
 * Extract rule name from ### heading in detachment rule section.
 *
 * Captures: [1] = rule name
 */
export const DETACHMENT_RULE_NAME = /^### ([^\n]+)/m;

/**
 * Extract rule content after ### heading.
 *
 * Captures: [1] = rule content
 */
export const DETACHMENT_RULE_CONTENT = /### [^\n]+\n([\s\S]*?)(?=## |$)/;

// =============================================================================
// WEAPON ABILITY EXTRACTION
// =============================================================================

/**
 * Match bracketed weapon abilities like [BLAST], [PSYCHIC].
 *
 * Captures: [1] = ability name without brackets
 *
 * @example "[BLAST], [PSYCHIC]" → "BLAST", "PSYCHIC" (multiple matches)
 */
export const BRACKETED_ABILITY = /\[([A-Z][A-Z\s-]+)\]/g;

// =============================================================================
// ABILITY PATTERNS
// =============================================================================

/**
 * Match CORE ability list: "CORE: Ability1, Ability2"
 */
export const CORE_ABILITIES_PREFIX = /^CORE:\s*/i;

/**
 * Match FACTION ability list: "FACTION: Ability1, Ability2"
 */
export const FACTION_ABILITIES_PREFIX = /^FACTION:\s*/i;

/**
 * Match labeled ability in markdown: **Name:** Description
 * Used to extract unit abilities with their descriptions.
 *
 * Captures: [1]=ability name, [2]=description
 */
export const LABELED_ABILITY = /^\*\*([^*:]+):\*\*\s*([\s\S]*?)(?=\n\*\*[^*]+\*\*|\n\n|$)/gm;

/**
 * Match CORE/FACTION labeled abilities: CORE: **AbilityName**
 *
 * Captures: [1]="CORE" or "FACTION", [2]=ability name
 */
export const LABELED_CORE_FACTION = /^(CORE|FACTION):\s*\*\*([^*]+)\*\*/gm;

// =============================================================================
// KEYWORD DEDUPLICATION
// =============================================================================

/**
 * Match repeated uppercase multi-word phrases that got concatenated.
 * Handles: "HERETIC ASTARTESHERETIC ASTARTES..." → "HERETIC ASTARTES"
 *
 * Captures: [1] = the original phrase
 */
export const REPEATED_KEYWORD_PHRASE = /\b([A-Z][A-Z'-]+(?:\s+[A-Z][A-Z'-]+)+)(\1)+/g;

/**
 * Match repeated single uppercase words.
 * Handles: "INFANTRYINFANTRYINFANTRY" → "INFANTRY"
 *
 * Captures: [1] = the original word
 */
export const REPEATED_KEYWORD_WORD = /\b([A-Z][A-Z'-]{2,})(\1){2,}/g;

// =============================================================================
// MISSION PACK PARSING
// =============================================================================

/**
 * Match Primary Mission deck section.
 *
 * Captures: [1] = section content
 */
export const PRIMARY_MISSION_DECK = /## Primary Mission deck([\s\S]*?)(?=## (?:Secondary|Asymmetric|Incursion|Strike)|$)/i;

/**
 * Match Secondary Mission deck section.
 *
 * Captures: [1] = section content
 */
export const SECONDARY_MISSION_DECK = /## Secondary Mission deck([\s\S]*?)(?=## (?:Asymmetric|Challenger|Twist|Deployment|Primary)|$)/i;

/**
 * Match Challenger deck section.
 *
 * Captures: [1] = section content
 */
export const CHALLENGER_DECK = /## Challenger deck([\s\S]*?)(?=## (?:Twist|Deployment|Primary|Secondary)|$)/i;

/**
 * Split by Primary Mission markers.
 */
export const SPLIT_PRIMARY_MISSION = /\nPrimary Mission\n/i;

/**
 * Split by Secondary Mission markers.
 */
export const SPLIT_SECONDARY_MISSION = /\nSecondary Mission\n/i;

/**
 * Split by Challenger markers.
 */
export const SPLIT_CHALLENGER = /\nChallenger\n/i;

/**
 * Match VP scoring values (e.g., "5VP").
 *
 * Captures full match including "VP"
 */
export const VP_SCORING = /(\d+)VP/g;

/**
 * Validate mission name (should be mostly uppercase letters).
 * Returns true if name passes validation.
 */
export function isValidMissionName(name: string): boolean {
  if (!name || name.length < 3) return false;
  const lettersOnly = name.replace(/[^A-Za-z\s]/g, '');
  return /^[A-Z\s]+$/.test(lettersOnly);
}

// =============================================================================
// TEXT CLEANUP PATTERNS
// =============================================================================

/**
 * Match camelCase word boundaries for adding spaces.
 * Used to fix "DeadlyDemise" → "Deadly Demise"
 *
 * Captures: [1]=lowercase letter, [2]=uppercase letter
 */
export const CAMEL_CASE_BOUNDARY = /([a-z])([A-Z])/g;

/**
 * Match concatenated common words: "inthe", "ofthe", "tothe", "fromthe"
 */
export const CONCAT_IN_THE = /\b(in)(the)\b/gi;
export const CONCAT_OF_THE = /\b(of)(the)\b/gi;
export const CONCAT_TO_THE = /\b(to)(the)\b/gi;
export const CONCAT_FROM_THE = /\b(from)(the)\b/gi;

/**
 * Remove filter UI text from headers.
 * Handles: "Unit Name [No filter...]"
 */
export const FILTER_UI_TEXT = /\s*\[?\s*No filter.*$/i;

/**
 * Remove pipe-delimited suffixes.
 * Handles: "Unit Name | Extra Info"
 */
export const PIPE_SUFFIX = /\s*\|.*$/;

/**
 * Remove bracket-delimited suffixes.
 * Handles: "Unit Name [Legends]"
 */
export const BRACKET_SUFFIX = /\s*\[.*$/;

/**
 * Remove Wahapedia trailing text from titles.
 */
export const WAHAPEDIA_SUFFIX = /\s*[-–].*wahapedia.*/i;

// =============================================================================
// COMPOSITION CLEANUP
// =============================================================================

/**
 * Match point cost artifacts in composition text.
 * Handles: "300 65" (two numbers separated by space)
 */
export const POINTS_ARTIFACT = /\d{3}\s+\d{3}/g;

/**
 * Match CP cost markers to find section boundaries.
 */
export const CP_COST_MARKER = /\d+CP/;

