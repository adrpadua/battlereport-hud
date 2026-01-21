/**
 * Enhancement-related constants for detection context.
 *
 * NOTE: Enhancement names are loaded dynamically from the MCP server.
 * This file only contains context keywords that indicate enhancement discussion.
 */

/**
 * Context keywords that indicate an enhancement is being discussed.
 * These help identify when transcript text is referring to enhancements.
 */
export const ENHANCEMENT_CONTEXT_KEYWORDS = [
  'enhancement',
  'enhancements',
  'upgraded',
  'upgrade',
  'relic',
  'relics',
  'wargear',
  'gear',
  'equipped',
  'equipped with',
  'taking',
  'takes',
  'brings',
  'bring',
  'has',
  'with the',
] as const;

export type EnhancementContextKeyword = (typeof ENHANCEMENT_CONTEXT_KEYWORDS)[number];

/**
 * Common enhancement type indicators.
 * These patterns often precede enhancement names.
 */
export const ENHANCEMENT_TYPE_PATTERNS = [
  /\benhancement\s+(\w+)/i,
  /\brelic\s+(\w+)/i,
  /\bwith\s+the\s+(\w+)/i,
  /\btaking\s+(\w+)/i,
  /\bequipped\s+with\s+(\w+)/i,
] as const;
