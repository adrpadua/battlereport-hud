/**
 * Rule Text Parser
 *
 * Utilities for parsing Warhammer 40k detachment rule text from Wahapedia.
 * Handles markdown artifacts, keyword extraction, and fluff removal.
 */

// Battle size suffixes that may appear in detachment names
export const BATTLE_SIZE_SUFFIXES = ['(Combat Patrol)', '(Incursion)', '(Strike Force)', '(Onslaught)'];

/**
 * Strip battle size suffix from detachment name for API queries.
 * e.g., "Invasion Fleet (Strike Force)" -> "Invasion Fleet"
 */
export function stripBattleSizeSuffix(name: string): string {
  let result = name;
  for (const suffix of BATTLE_SIZE_SUFFIXES) {
    if (result.endsWith(suffix)) {
      result = result.slice(0, -suffix.length).trim();
      break;
    }
  }
  return result;
}

// Patterns that indicate a paragraph contains game rules (not fluff/lore)
export const RULES_PATTERNS = [
  /\bAt the start of (your|the|each)\b/i,
  /\bEach time (a|an|this)\b/i,
  /\bIn your (Command|Movement|Shooting|Charge|Fight) phase\b/i,
  /\bunits? (from your army|with this ability)\b/i,
  /\bmodels? (from your army|with this ability|in (this|that) unit)\b/i,
  /\b(battle round|Command phase|Movement phase|Shooting phase|Charge phase|Fight phase)\b/i,
  /\b(eligible to charge|eligible to shoot|can be selected)\b/i,
  /\b(Advance|Fall Back|Normal Move|Charge|Shoot|Fight)\b.*\b(roll|re-roll)\b/i,
  /\b(Hit roll|Wound roll|saving throw|invulnerable save)\b/i,
  /\b(add \d|subtract \d|re-roll|modifier)\b/i,
  /\bselect (one|up to)\b/i,
  /\b[A-Z]{2,}[A-Z\s]+\b.*\b(units?|models?|ability)\b/, // FACTION KEYWORD patterns
];

/**
 * Check if a paragraph contains game rules (vs fluff/lore).
 */
export function isRulesParagraph(paragraph: string): boolean {
  return RULES_PATTERNS.some(pattern => pattern.test(paragraph));
}

/**
 * Remove fluff/lore paragraphs, keeping only game rules.
 * Finds the first paragraph with rules content and returns from there.
 */
export function stripFluffParagraphs(text: string): string {
  const paragraphs = text.split(/\n\n+/);

  // Find the first paragraph that contains rules
  const firstRulesIndex = paragraphs.findIndex(p => isRulesParagraph(p));

  if (firstRulesIndex === -1) {
    // No rules paragraphs found, return original
    return text;
  }

  // Return from the first rules paragraph onwards
  return paragraphs.slice(firstRulesIndex).join('\n\n');
}

// Known concatenated keyword mappings
export const KEYWORD_MAPPINGS: Record<string, string> = {
  SUSTAINEDHITS: 'SUSTAINED HITS',
  LETHALHITS: 'LETHAL HITS',
  DEVASTATINGWOUNDS: 'DEVASTATING WOUNDS',
  RAPIDFIRE: 'RAPID FIRE',
  IGNORESCOVER: 'IGNORES COVER',
  INDIRECTFIRE: 'INDIRECT FIRE',
  ONESHOT: 'ONE SHOT',
  FEELNOPAIN: 'FEEL NO PAIN',
  DEADLYDEMISE: 'DEADLY DEMISE',
  DEEPSTRIKE: 'DEEP STRIKE',
  FIGHTSFIRST: 'FIGHTS FIRST',
  LONEOPERATIVE: 'LONE OPERATIVE',
  FIRINGDECK: 'FIRING DECK',
  TWINLINKED: 'TWIN-LINKED',
  EXTRAATTACKS: 'EXTRA ATTACKS',
  ANTIVEHICLE: 'ANTI-VEHICLE',
  ANTIINFANTRY: 'ANTI-INFANTRY',
  ANTIMONSTER: 'ANTI-MONSTER',
  ANTITITAN: 'ANTI-TITAN',
  ANTIFLY: 'ANTI-FLY',
};

/**
 * Normalize concatenated keyword names.
 * e.g., "SUSTAINEDHITS1" -> "SUSTAINED HITS 1"
 */
export function normalizeKeywordName(keyword: string): string {
  // Extract the base keyword and any trailing number/modifier
  const match = keyword.match(/^([A-Z]+)(\d+.*)?$/);
  if (!match) return keyword;

  const base = match[1];
  const suffix = match[2] || '';

  const normalized = KEYWORD_MAPPINGS[base] || base;
  return suffix ? `${normalized} ${suffix}` : normalized;
}

export type RuleSegment =
  | { type: 'text'; content: string }
  | { type: 'keyword'; keyword: string };

/**
 * Parse rule text into segments of plain text and keywords.
 *
 * Handles:
 * - Markdown links [text](url) -> plain text
 * - Markdown images ![alt](url) -> removed
 * - Markdown bold **text** -> plain text
 * - Escaped keyword brackets \[KEYWORD\] -> keyword segment
 * - Regular keyword brackets [KEYWORD] -> keyword segment
 */
export function parseRuleText(text: string): RuleSegment[] {
  let processed = text;
  // Remove image markdown
  processed = processed.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
  // Convert markdown links [text](url) to plain text (url can be empty)
  processed = processed.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Convert markdown bold to plain text
  processed = processed.replace(/\*\*([^*]+)\*\*/g, '$1');
  // Remove table markdown formatting (header separators and table rows)
  processed = processed.replace(/^\|[-:\s|]+\|$/gm, '');
  processed = processed.replace(/^\s*\|.*\|\s*$/gm, '');
  // Clean up excessive newlines
  processed = processed.replace(/\n{3,}/g, '\n\n');

  // Now parse for keyword brackets: \[KEYWORD\] or [KEYWORD]
  // Pattern matches: optional backslash, [, UPPERCASE+DIGITS, optional backslash, ]
  const keywordPattern = /\\?\[([A-Z][A-Z0-9]*)\\?\]/g;
  const segments: RuleSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = keywordPattern.exec(processed)) !== null) {
    // Add text before the keyword
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: processed.slice(lastIndex, match.index) });
    }
    // Add the keyword
    const normalized = normalizeKeywordName(match[1]);
    segments.push({ type: 'keyword', keyword: normalized });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < processed.length) {
    segments.push({ type: 'text', content: processed.slice(lastIndex) });
  }

  return segments;
}

/**
 * Extract just the text content from parsed segments (for testing/display).
 */
export function getPlainText(segments: RuleSegment[]): string {
  return segments.map(s => s.type === 'text' ? s.content : `[${s.keyword}]`).join('');
}

/**
 * Extract just the keywords from parsed segments.
 */
export function extractKeywords(segments: RuleSegment[]): string[] {
  return segments.filter(s => s.type === 'keyword').map(s => (s as { type: 'keyword'; keyword: string }).keyword);
}
