/**
 * Text Parser Utilities
 *
 * Functions for parsing and cleaning ability descriptions from Wahapedia data.
 * Handles markdown links, keyword brackets, and concatenated ability names.
 */

/**
 * Strip parenthetical content from unit names for display.
 * Removes suffixes like "(unit 1)", "(15)", "(unit 2, deep strike)", etc.
 *
 * @example
 * stripUnitNameParentheses("Gargoyles (unit 1)") // "Gargoyles"
 * stripUnitNameParentheses("Hormagaunts (15)") // "Hormagaunts"
 * stripUnitNameParentheses("Raveners (unit 2, deep strike)") // "Raveners"
 */
export function stripUnitNameParentheses(name: string): string {
  if (!name) return '';
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export type DescriptionSegment =
  | { type: 'text'; content: string }
  | { type: 'keyword'; content: string; normalized: string }
  | { type: 'unit-keyword'; content: string }
  | { type: 'link'; text: string; url: string };

/**
 * Parse plain text to extract ALL-CAPS unit keywords (like TYRANIDS, INFANTRY).
 * Returns segments with text and unit-keyword types.
 */
function parseUnitKeywordsInText(text: string): DescriptionSegment[] {
  if (!text) return [];

  const segments: DescriptionSegment[] = [];

  // Pattern to match ALL-CAPS words (2+ chars, may include hyphens)
  // Matches: TYRANIDS, INFANTRY, SPACE MARINES (as separate words), BATTLE-SHOCKED
  // Does not match: single letters, numbers, or mixed case
  const unitKeywordPattern = /\b([A-Z][A-Z-]+(?:\s+[A-Z][A-Z-]+)*)\b/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = unitKeywordPattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }

    // Add the unit keyword
    segments.push({ type: 'unit-keyword', content: match[1] });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}

/**
 * Parse ability description text into segments for rendering.
 * Extracts markdown links, keyword brackets, and ALL-CAPS unit keywords.
 *
 * @example
 * parseAbilityDescription("Each time this model makes an attack with [LETHAL HITS]...")
 * // Returns: [
 * //   { type: 'text', content: 'Each time this model makes an attack with ' },
 * //   { type: 'keyword', content: 'LETHAL HITS', normalized: 'LETHAL HITS' },
 * //   { type: 'text', content: '...' }
 * // ]
 *
 * @example
 * parseAbilityDescription("Friendly TYRANIDS units within 6\"...")
 * // Returns: [
 * //   { type: 'text', content: 'Friendly ' },
 * //   { type: 'unit-keyword', content: 'TYRANIDS' },
 * //   { type: 'text', content: ' units within 6\"...' }
 * // ]
 */
export function parseAbilityDescription(text: string): DescriptionSegment[] {
  if (!text) return [];

  const segments: DescriptionSegment[] = [];
  let remaining = text;

  // Combined pattern to match both markdown links and keywords
  const combinedPattern = /\[([^\]]+)\]\(([^)]+)\)|\\?\[([A-Z][A-Z\s\d+-]*)\]\\?/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = combinedPattern.exec(remaining)) !== null) {
    // Add text before the match (parse for unit keywords)
    if (match.index > lastIndex) {
      const textContent = remaining.slice(lastIndex, match.index);
      if (textContent) {
        segments.push(...parseUnitKeywordsInText(textContent));
      }
    }

    if (match[2]) {
      // Markdown link: [text](url)
      segments.push({
        type: 'link',
        text: match[1],
        url: match[2],
      });
    } else if (match[3]) {
      // Keyword bracket: [LETHAL HITS] or \[LETHAL HITS\]
      const normalized = normalizeKeyword(match[3]);
      segments.push({
        type: 'keyword',
        content: match[3],
        normalized,
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text (parse for unit keywords)
  if (lastIndex < remaining.length) {
    segments.push(...parseUnitKeywordsInText(remaining.slice(lastIndex)));
  }

  return segments;
}

/**
 * Clean concatenated ability names by inserting spaces.
 * Handles PascalCase and CamelCase concatenation.
 *
 * @example
 * cleanAbilityName("DeadlyDemiseD6") // "Deadly Demise D6"
 * cleanAbilityName("ShadowintheWarp") // "Shadow in the Warp"
 * cleanAbilityName("CultAmbush") // "Cult Ambush"
 * cleanAbilityName("FeelNoPain5+") // "Feel No Pain 5+"
 */
export function cleanAbilityName(name: string): string {
  if (!name) return '';

  // First, check for common patterns that should be preserved
  // Pattern: "D6", "D3", "5+", "4+", etc.
  let cleaned = name;

  // Insert space before capital letters that follow lowercase letters
  // But preserve sequences like "D6", "D3", etc.
  cleaned = cleaned.replace(/([a-z])([A-Z])/g, '$1 $2');

  // Insert space before digits that follow letters (except D followed by digit)
  cleaned = cleaned.replace(/([a-zA-Z])(\d)/g, (match, letter, digit) => {
    // Don't split D6, D3, etc.
    if (letter === 'D' || letter === 'd') {
      return match;
    }
    return `${letter} ${digit}`;
  });

  // Handle common lowercase words that might be concatenated
  // "inthe" -> "in the", "ofthe" -> "of the"
  cleaned = cleaned.replace(/\b(in)(the)\b/gi, '$1 $2');
  cleaned = cleaned.replace(/\b(of)(the)\b/gi, '$1 $2');
  cleaned = cleaned.replace(/\b(to)(the)\b/gi, '$1 $2');

  // Clean up any double spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Normalize a keyword by removing escape characters and standardizing format.
 *
 * @example
 * normalizeKeyword("LETHALHITS") // "LETHAL HITS"
 * normalizeKeyword("\\[LETHAL HITS\\]") // "LETHAL HITS"
 * normalizeKeyword("ANTI-VEHICLE4+") // "ANTI-VEHICLE 4+"
 */
export function normalizeKeyword(keyword: string): string {
  if (!keyword) return '';

  let normalized = keyword;

  // Remove escape characters and brackets
  normalized = normalized.replace(/\\?\[|\\?\]/g, '');

  // Insert space before digits that follow letters (for values like 4+)
  // But preserve hyphenated terms like ANTI-VEHICLE
  normalized = normalized.replace(/([A-Z])(\d)/g, '$1 $2');

  // Insert space between concatenated uppercase words
  // LETHALHITS -> LETHAL HITS
  normalized = normalized.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

  // Handle all-caps concatenation: SUSTAINEDHITS -> SUSTAINED HITS
  // Look for common weapon ability patterns
  const knownKeywords: Record<string, string> = {
    LETHALHITS: 'LETHAL HITS',
    SUSTAINEDHITS: 'SUSTAINED HITS',
    DEVASTATINGWOUNDS: 'DEVASTATING WOUNDS',
    RAPIDFIRE: 'RAPID FIRE',
    TORRENT: 'TORRENT',
    BLAST: 'BLAST',
    MELTA: 'MELTA',
    HAZARDOUS: 'HAZARDOUS',
    PRECISION: 'PRECISION',
    INDIRECT: 'INDIRECT FIRE',
    INDIRECTFIRE: 'INDIRECT FIRE',
    ONESHOT: 'ONE SHOT',
    ASSAULT: 'ASSAULT',
    HEAVY: 'HEAVY',
    PISTOL: 'PISTOL',
    PSYCHIC: 'PSYCHIC',
    IGNORESCOVER: 'IGNORES COVER',
    ANTIVEHICLE: 'ANTI-VEHICLE',
    ANTIINFANTRY: 'ANTI-INFANTRY',
    ANTIMONSTER: 'ANTI-MONSTER',
    ANTITITAN: 'ANTI-TITAN',
    ANTIFLY: 'ANTI-FLY',
    FIGHTSFIRST: 'FIGHTS FIRST',
    FEELNOPAIN: 'FEEL NO PAIN',
    LONEOPPERATIVE: 'LONE OPERATIVE',
    LONEOPERATIVE: 'LONE OPERATIVE',
    DEEPSTRIKE: 'DEEP STRIKE',
    DEADLYDEMISE: 'DEADLY DEMISE',
    FIRINGDECK: 'FIRING DECK',
  };

  // Check for known keywords (case-insensitive)
  const upperNormalized = normalized.toUpperCase().replace(/\s+/g, '');
  if (knownKeywords[upperNormalized]) {
    return knownKeywords[upperNormalized];
  }

  // Clean up extra spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Parse weapon abilities string into individual abilities.
 * Handles concatenated abilities like "assaultblasthazardousone shot".
 *
 * @example
 * parseWeaponAbilities("Assault, Blast, Hazardous") // ["Assault", "Blast", "Hazardous"]
 * parseWeaponAbilities("assaultblasthazardous") // ["Assault", "Blast", "Hazardous"]
 */
export function parseWeaponAbilities(abilities: string): string[] {
  if (!abilities) return [];

  // First try splitting by comma
  if (abilities.includes(',')) {
    return abilities
      .split(',')
      .map((a) => cleanAbilityName(a.trim()))
      .filter(Boolean);
  }

  // Known weapon ability keywords for matching
  const knownAbilities = [
    'Assault',
    'Heavy',
    'Rapid Fire',
    'Pistol',
    'Blast',
    'Melta',
    'Torrent',
    'Hazardous',
    'Precision',
    'Lethal Hits',
    'Sustained Hits',
    'Devastating Wounds',
    'Ignores Cover',
    'Indirect Fire',
    'One Shot',
    'Psychic',
    'Twin-linked',
    'Lance',
    'Extra Attacks',
    'Anti-Infantry',
    'Anti-Vehicle',
    'Anti-Monster',
    'Anti-Titan',
    'Anti-Fly',
  ];

  // Try to match known abilities in the string
  const result: string[] = [];
  let remaining = abilities.toLowerCase();

  for (const ability of knownAbilities) {
    const lowerAbility = ability.toLowerCase().replace(/[\s-]/g, '');
    if (remaining.includes(lowerAbility)) {
      result.push(ability);
      remaining = remaining.replace(lowerAbility, '');
    }
  }

  // Check for numeric values like "4+", "D6", etc. that might remain
  const valuePattern = /(\d+\+|d\d+)/gi;
  let match;
  while ((match = valuePattern.exec(remaining)) !== null) {
    // These might be part of abilities like "Anti-Vehicle 4+"
    // Usually attached to the previous ability
    const value = match[1].toUpperCase();
    if (result.length > 0) {
      result[result.length - 1] += ` ${value}`;
    }
  }

  // If we found abilities, return them
  if (result.length > 0) {
    return result;
  }

  // Fallback: try to clean the whole string
  return [cleanAbilityName(abilities)].filter(Boolean);
}

/**
 * Remove markdown table artifacts from unit composition text.
 *
 * @example
 * cleanCompositionArtifacts("--- 160") // ""
 * cleanCompositionArtifacts("1x Squad --- 70 140") // "1x Squad"
 */
export function cleanCompositionArtifacts(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // Remove markdown table separators and point values
  // Pattern: "--- 160", "--- 70 140", etc.
  cleaned = cleaned.replace(/\s*---\s*\d+(\s+\d+)*\s*/g, ' ');

  // Remove standalone point values at end of lines
  cleaned = cleaned.replace(/\s+\d{2,3}\s*$/gm, '');

  // Remove orphaned table syntax
  cleaned = cleaned.replace(/\|\s*[-]+\s*\|/g, '');
  cleaned = cleaned.replace(/\|[^|]*\|/g, '');

  // Clean up whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Determine the keyword variant/type for styling.
 */
export function getKeywordVariant(
  keyword: string
): 'weapon' | 'core' | 'faction' | 'unit' {
  const normalized = keyword.toUpperCase();

  // Weapon abilities
  const weaponKeywords = [
    'LETHAL HITS',
    'SUSTAINED HITS',
    'DEVASTATING WOUNDS',
    'RAPID FIRE',
    'ASSAULT',
    'HEAVY',
    'PISTOL',
    'BLAST',
    'MELTA',
    'TORRENT',
    'HAZARDOUS',
    'PRECISION',
    'INDIRECT FIRE',
    'ONE SHOT',
    'PSYCHIC',
    'TWIN-LINKED',
    'LANCE',
    'IGNORES COVER',
    'EXTRA ATTACKS',
    'ANTI-',
  ];

  // Core abilities
  const coreKeywords = [
    'DEADLY DEMISE',
    'DEEP STRIKE',
    'FEEL NO PAIN',
    'FIGHTS FIRST',
    'FIRING DECK',
    'HOVER',
    'INFILTRATORS',
    'LEADER',
    'LONE OPERATIVE',
    'SCOUTS',
    'STEALTH',
  ];

  // Check if it's a weapon ability
  for (const wk of weaponKeywords) {
    if (normalized.startsWith(wk) || normalized.includes(wk)) {
      return 'weapon';
    }
  }

  // Check if it's a core ability
  for (const ck of coreKeywords) {
    if (normalized === ck || normalized.startsWith(ck)) {
      return 'core';
    }
  }

  // Default to unit keyword
  return 'unit';
}
