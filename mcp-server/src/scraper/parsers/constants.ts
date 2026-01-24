/**
 * Centralized constants for Wahapedia parsers.
 *
 * These limits correspond to database column sizes and parsing boundaries.
 * Centralizing them ensures consistency and makes it easy to adjust limits
 * if database schema changes.
 */

// =============================================================================
// DATABASE FIELD LIMITS
// =============================================================================
// These limits match the VARCHAR sizes in the database schema.
// Exceeding these will cause database insertion errors.

/**
 * Standard slug field limit (VARCHAR(255)).
 * Used for URL-friendly identifiers across all entities.
 */
export const SLUG_MAX_LENGTH = 255;

/**
 * Standard name field limit (VARCHAR(255)).
 * Used for display names of units, weapons, abilities, etc.
 */
export const NAME_MAX_LENGTH = 255;

/**
 * Category/subcategory field limit (VARCHAR(100)).
 * Used for rule categories and faction slugs in some contexts.
 */
export const CATEGORY_MAX_LENGTH = 100;

/**
 * CP cost field limit (VARCHAR(10)).
 * Format is typically "1" or "2", but allows for "1-2" ranges.
 */
export const CP_COST_MAX_LENGTH = 10;

/**
 * URL path field limit (VARCHAR(255)).
 * Used for wahapediaPath and sourceUrl fields.
 */
export const PATH_MAX_LENGTH = 255;

// =============================================================================
// TEXT CONTENT LIMITS
// =============================================================================
// These limits are for longer text fields. They're set based on typical
// content sizes from Wahapedia and database TEXT field practical limits.

/**
 * Short description limit (1000 chars).
 * Used for: unit composition, ability descriptions, lore snippets.
 */
export const SHORT_DESCRIPTION_MAX_LENGTH = 1000;

/**
 * Medium description limit (2000 chars).
 * Used for: detachment rules, stratagem effects, enhancement descriptions.
 */
export const MEDIUM_DESCRIPTION_MAX_LENGTH = 2000;

/**
 * Full rule content limit (5000 chars).
 * Used for: matched play rules, core rules sections.
 */
export const RULE_CONTENT_MAX_LENGTH = 5000;

/**
 * Fallback description limit (500 chars).
 * Used when extracting partial descriptions as fallback.
 */
export const FALLBACK_DESCRIPTION_MAX_LENGTH = 500;

// =============================================================================
// PARSING LIMITS
// =============================================================================
// These limits prevent runaway parsing and memory issues.

/**
 * Maximum number of leader attachment units to extract.
 * Prevents parsing issues when content isn't properly bounded.
 */
export const MAX_LEADER_ATTACHMENTS = 10;

// =============================================================================
// POINTS COST BOUNDS
// =============================================================================
// Valid ranges for point costs in 10th edition.

/**
 * Minimum valid points cost for a unit.
 * Most cheap units (like single characters) start around 50pts,
 * but some wargear/enhancement options can be as low as 20pts.
 */
export const MIN_POINTS_COST = 20;

/**
 * Maximum valid points cost for a single unit entry.
 * The most expensive single units (Knights, large squads) cap around 500pts.
 */
export const MAX_POINTS_COST = 500;

/**
 * Check if a number is a valid points cost.
 */
export function isValidPointsCost(points: number): boolean {
  return points >= MIN_POINTS_COST && points <= MAX_POINTS_COST;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Truncate a string to the specified max length.
 * Returns the original string if it's already within limits.
 */
export function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

/**
 * Truncate slug to standard limit.
 */
export function truncateSlug(text: string): string {
  return truncate(text, SLUG_MAX_LENGTH);
}

/**
 * Truncate name to standard limit.
 */
export function truncateName(text: string): string {
  return truncate(text, NAME_MAX_LENGTH);
}
