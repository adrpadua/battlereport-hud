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
 * Extract keywords section content (unit keywords like INFANTRY, CHARACTER, etc.).
 *
 * Captures: [1] = keywords text
 *
 * @example "KEYWORDS: Infantry, Imperium" → "Infantry, Imperium"
 */
export const KEYWORDS_SECTION = /KEYWORDS:?\s*([^\n]+)/i;

/**
 * Extract faction keywords section content (faction/chapter keywords like ADEPTUS ASTARTES, BLOOD ANGELS).
 *
 * Captures: [1] = faction keywords text
 *
 * @example "FACTION KEYWORDS: Adeptus Astartes, Blood Angels" → "Adeptus Astartes, Blood Angels"
 */
export const FACTION_KEYWORDS_SECTION = /FACTION\s+KEYWORDS:?\s*([^\n]+)/i;

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
