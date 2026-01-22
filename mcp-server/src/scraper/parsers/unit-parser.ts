import type { NewUnit, NewWeapon, NewAbility } from '../../db/schema.js';

/**
 * Common concatenated patterns from Firecrawl markdown conversion.
 * Maps concatenated text to properly spaced text.
 */
const CONCATENATION_FIXES: Record<string, string> = {
  // Weapon abilities that get concatenated
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
  // Faction abilities
  'shadowinthewarp': 'Shadow in the Warp',
  'synapseshadow': 'Synapse, Shadow',
  // Common game terms
  'mortalwounds': 'mortal wounds',
  'mortalwound': 'mortal wound',
  'invulnerablesave': 'invulnerable save',
  'feelno pain': 'Feel No Pain',
  'feelnopain': 'Feel No Pain',
  'battleshock': 'Battle-shock',
  'battleshocktest': 'Battle-shock test',
  'battle-shocktest': 'Battle-shock test',
  'commandpoints': 'Command Points',
  'hitroll': 'Hit roll',
  'woundroll': 'Wound roll',
  'fightsfirst': 'Fights First',
  'deepstrike': 'Deep Strike',
  'loneoperative': 'Lone Operative',
  'deadlydemise': 'Deadly Demise',
  'firingdeck': 'Firing Deck',
  // Keywords
  'greatdevourer': 'Great Devourer',
};

/**
 * Normalize text by fixing common concatenation issues from Firecrawl.
 */
function normalizeText(text: string): string {
  let result = text;

  // Apply known concatenation fixes (case-insensitive)
  for (const [concat, fixed] of Object.entries(CONCATENATION_FIXES)) {
    const regex = new RegExp(concat, 'gi');
    result = result.replace(regex, fixed);
  }

  // Fix camelCase concatenation in ability names: "ShadowintheWarp" -> "Shadow in the Warp"
  // Insert space before capital letters that follow lowercase
  result = result.replace(/([a-z])([A-Z])/g, '$1 $2');

  // Fix "inthe" -> "in the", "ofthe" -> "of the" patterns
  result = result.replace(/\b(in)(the)\b/gi, '$1 $2');
  result = result.replace(/\b(of)(the)\b/gi, '$1 $2');
  result = result.replace(/\b(to)(the)\b/gi, '$1 $2');
  result = result.replace(/\b(from)(the)\b/gi, '$1 $2');

  return result;
}

interface ParsedUnit {
  unit: Omit<NewUnit, 'factionId'>;
  weapons: NewWeapon[];
  abilities: Omit<NewAbility, 'factionId'>[];
}

interface UnitStats {
  movement?: string;
  toughness?: number;
  save?: string;
  wounds?: number;
  leadership?: number;
  objectiveControl?: number;
  invulnerableSave?: string;
}

/**
 * Parse datasheets page to extract all units for a faction
 */
export function parseDatasheets(markdown: string, sourceUrl: string): ParsedUnit[] {
  const units: ParsedUnit[] = [];

  // Try to parse as individual unit page first (# Faction – Unit Name format)
  const individualUnit = parseIndividualUnitPage(markdown, sourceUrl);
  if (individualUnit) {
    return [individualUnit];
  }

  // Fall back to multi-unit page format (## headers)
  const sections = markdown.split(/^## /m).filter(Boolean);

  for (const section of sections) {
    const parsed = parseUnitSection(section, sourceUrl);
    if (parsed) {
      units.push(parsed);
    }
  }

  return units;
}

/**
 * Parse an individual unit page (format: # Faction – Unit Name)
 */
function parseIndividualUnitPage(markdown: string, sourceUrl: string): ParsedUnit | null {
  // Look for the main unit header: # Faction – Unit Name   [filters...]
  const headerMatch = markdown.match(/^# [^–]+–\s*([^\[\\]+)/m);
  if (!headerMatch) return null;

  const rawName = headerMatch[1]?.trim().replace(/\s+$/, '');
  if (!rawName || rawName.length < 3) return null;

  // Find the unit stats section - look for the stat block pattern
  // Stats appear as: M 5" T 5 Sv 3+ W 4 Ld 7+ OC 1
  const statsMatch = markdown.match(/M\s+(\d+"?)\s+T\s+(\d+)\s+Sv\s+(\d+\+?)\s+W\s+(\d+)\s+Ld\s+(\d+\+?)\s+OC\s+(\d+)/);

  const stats: UnitStats = {};
  if (statsMatch) {
    stats.movement = statsMatch[1];
    stats.toughness = parseInt(statsMatch[2]!, 10);
    stats.save = statsMatch[3];
    stats.wounds = parseInt(statsMatch[4]!, 10);
    stats.leadership = parseInt(statsMatch[5]!, 10);
    stats.objectiveControl = parseInt(statsMatch[6]!, 10);
  }

  // Extract invulnerable save if present
  // Format can be: "4+ invulnerable save" or "INVULNERABLE SAVE\n\n4+"
  let invulnMatch = markdown.match(/(\d+\+)\s*invulnerable save/i);
  if (!invulnMatch) {
    // Try format: "INVULNERABLE SAVE\n\n4+"
    invulnMatch = markdown.match(/INVULNERABLE SAVE\s*\n+\s*(\d+\+)/i);
  }
  if (invulnMatch) {
    stats.invulnerableSave = invulnMatch[1];
  }

  // Extract points cost from the composition table: | 1 model | 65 |
  const pointsMatch = markdown.match(/\|\s*\d+\s*model[s]?\s*\|\s*(\d+)\s*\|/i);
  const pointsCost = pointsMatch ? parseInt(pointsMatch[1]!, 10) : undefined;

  // Extract unit composition - stop at LEADER, KEYWORDS, FACTION KEYWORDS, STRATAGEMS, or other sections
  const compositionMatch = markdown.match(
    /UNIT COMPOSITION[\s\S]*?\n([\s\S]*?)(?=\n\s*(?:LEADER|KEYWORDS:|FACTION KEYWORDS:|STRATAGEMS|DETACHMENT|## )|$)/i
  );
  let unitComposition: string | null = null;
  if (compositionMatch?.[1]) {
    // Clean up the composition text - remove markdown formatting and limit length
    unitComposition = compositionMatch[1]
      .replace(/\*\*/g, '')
      .replace(/!\[.*?\]\(.*?\)/g, '') // Remove image markdown
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
      .replace(/\|\s*[-]+\s*\|/g, '') // Remove table separator rows (| --- |)
      .replace(/\|[^|]*\|[^|]*\|/g, '') // Remove table cells (| content | content |)
      .replace(/\s*\|\s*/g, ' ') // Remove remaining pipes
      .replace(/---\s*\d+(\s+\d+)*/g, '') // Remove "--- 100 200" point cost artifacts
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .slice(0, 1000); // Reasonable limit for unit composition

    // If it still looks like garbage (contains stratagem-like content), truncate further
    if (unitComposition.includes('1CP') || unitComposition.includes('2CP')) {
      const cpIndex = unitComposition.search(/\d+CP/);
      if (cpIndex > 0) {
        unitComposition = unitComposition.slice(0, cpIndex).trim();
      }
    }
  }

  // Extract LEADER info (for models that can attach to other units)
  const leaderMatch = markdown.match(
    /LEADER[\s\S]*?This model can be attached to the following units?:\s*([\s\S]*?)(?=\n\s*(?:KEYWORDS:|FACTION KEYWORDS:|STRATAGEMS|DETACHMENT|## )|$)/i
  );
  let leaderInfo: string | null = null;
  if (leaderMatch?.[1]) {
    // Extract the list of units this model can lead
    const unitsList = leaderMatch[1]
      .replace(/\*\*/g, '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .split(/[-•]/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.includes('KEYWORDS'))
      .join('\n• ');

    if (unitsList) {
      leaderInfo = `This model can be attached to:\n• ${unitsList}`;
    }
  }

  // Detect unit types from keywords
  const keywordsSection = markdown.match(/KEYWORDS:\s*([^\n]+)/i)?.[1] || '';
  const isEpicHero = /epic\s*hero/i.test(keywordsSection) || /epic\s*hero/i.test(markdown);
  const isBattleline = /battleline/i.test(markdown);
  const isDedicatedTransport = /dedicated\s*transport/i.test(markdown);
  const _legends = /legends?/i.test(markdown.slice(0, 2000)); // Only check early in doc (reserved for future use)
  void _legends;

  // Extract weapons
  const weapons = extractWeapons(markdown, sourceUrl);

  // Extract abilities
  const abilities = extractAbilities(markdown, sourceUrl);

  // Extract base size (handles "32mm" and "170mm oval" formats)
  const baseSizeMatch = markdown.match(/\(⌀(\d+mm(?:\s+oval)?)\)/);
  const baseSize = baseSizeMatch?.[1] || null;

  const unit: Omit<NewUnit, 'factionId'> = {
    slug: slugify(rawName).slice(0, 255),
    name: rawName.slice(0, 255),
    movement: stats.movement ?? null,
    toughness: stats.toughness ?? null,
    save: stats.save ?? null,
    invulnerableSave: stats.invulnerableSave ?? null,
    wounds: stats.wounds ?? null,
    leadership: stats.leadership ?? null,
    objectiveControl: stats.objectiveControl ?? null,
    pointsCost: pointsCost ?? null,
    baseSize,
    unitComposition,
    wargearOptions: null,
    leaderInfo,
    ledBy: null,
    transportCapacity: null,
    isEpicHero,
    isBattleline,
    isDedicatedTransport,
    legends: false, // Individual pages are current, not legends
    sourceUrl,
    dataSource: 'wahapedia' as const,
  };

  return { unit, weapons, abilities };
}

/**
 * Parse a single unit section from the datasheets
 */
function parseUnitSection(section: string, sourceUrl: string): ParsedUnit | null {
  const lines = section.split('\n');
  const name = lines[0]?.trim();

  if (!name || isHeaderSection(name)) {
    return null;
  }

  const content = lines.slice(1).join('\n');

  // Extract stats
  const stats = extractUnitStats(content);

  // Require at least some unit stats to be present - otherwise this isn't a valid unit
  const hasStats = stats.toughness !== undefined || stats.wounds !== undefined || stats.save !== undefined;
  if (!hasStats) {
    return null;
  }

  // Extract points cost
  const pointsMatch = content.match(/(\d+)\s*(?:pts?|points)/i);
  const pointsCost = pointsMatch ? parseInt(pointsMatch[1]!, 10) : undefined;

  // Extract composition
  const compositionMatch = content.match(
    /(?:Unit Composition|Composition)[:\s]*([\s\S]*?)(?=\n(?:Wargear|Weapons|Abilities|Leader|###)|$)/i
  );
  const unitComposition = compositionMatch?.[1]?.trim() || null;

  // Extract wargear options
  const wargearMatch = content.match(
    /(?:Wargear Options?)[:\s]*([\s\S]*?)(?=\n(?:Abilities|Leader|###)|$)/i
  );
  const wargearOptions = wargearMatch?.[1]?.trim() || null;

  // Extract leader info
  const leaderMatch = content.match(
    /(?:Leader)[:\s]*([\s\S]*?)(?=\n(?:Abilities|###)|$)/i
  );
  const leaderInfo = leaderMatch?.[1]?.trim() || null;

  // Extract led by info
  const ledByMatch = content.match(
    /(?:Led By|Can be led by)[:\s]*([\s\S]*?)(?=\n(?:###)|$)/i
  );
  const ledBy = ledByMatch?.[1]?.trim() || null;

  // Extract transport capacity
  const transportMatch = content.match(
    /(?:Transport Capacity)[:\s]*([\s\S]*?)(?=\n(?:Abilities|###)|$)/i
  );
  const transportCapacity = transportMatch?.[1]?.trim() || null;

  // Detect unit types
  const isEpicHero = /epic hero/i.test(content) || /\*epic hero\*/i.test(content);
  const isBattleline = /battleline/i.test(content);
  const isDedicatedTransport = /dedicated transport/i.test(content);
  const legends = /legends?/i.test(content);

  // Extract weapons
  const weapons = extractWeapons(content, sourceUrl);

  // Extract abilities
  const abilities = extractAbilities(content, sourceUrl);

  const unit: Omit<NewUnit, 'factionId'> = {
    slug: slugify(name).slice(0, 255),
    name: name.slice(0, 255),
    movement: stats.movement ?? null,
    toughness: stats.toughness ?? null,
    save: stats.save ?? null,
    invulnerableSave: stats.invulnerableSave ?? null,
    wounds: stats.wounds ?? null,
    leadership: stats.leadership ?? null,
    objectiveControl: stats.objectiveControl ?? null,
    pointsCost: pointsCost ?? null,
    unitComposition,
    wargearOptions,
    leaderInfo,
    ledBy,
    transportCapacity,
    isEpicHero,
    isBattleline,
    isDedicatedTransport,
    legends,
    sourceUrl,
    dataSource: 'wahapedia' as const,
  };

  return { unit, weapons, abilities };
}

/**
 * Extract unit stats from content
 */
function extractUnitStats(content: string): UnitStats {
  const stats: UnitStats = {};

  // Look for stat line in table format: | M | T | SV | W | LD | OC |
  const tableMatch = content.match(
    /\|\s*(\d+"?)\s*\|\s*(\d+)\s*\|\s*(\d+\+?)\s*\|\s*(\d+)\s*\|\s*(\d+\+?)\s*\|\s*(\d+)\s*\|/
  );

  if (tableMatch) {
    stats.movement = tableMatch[1];
    stats.toughness = parseInt(tableMatch[2]!, 10);
    stats.save = tableMatch[3];
    stats.wounds = parseInt(tableMatch[4]!, 10);
    stats.leadership = parseInt(tableMatch[5]!, 10);
    stats.objectiveControl = parseInt(tableMatch[6]!, 10);
    return stats;
  }

  // Try individual stat extraction
  const movementMatch = content.match(/(?:M|Movement)[:\s]*(\d+")/i);
  if (movementMatch) stats.movement = movementMatch[1];

  const toughnessMatch = content.match(/(?:T|Toughness)[:\s]*(\d+)/i);
  if (toughnessMatch) stats.toughness = parseInt(toughnessMatch[1]!, 10);

  const saveMatch = content.match(/(?:SV|Save)[:\s]*(\d+\+)/i);
  if (saveMatch) stats.save = saveMatch[1];

  const woundsMatch = content.match(/(?:W|Wounds)[:\s]*(\d+)/i);
  if (woundsMatch) stats.wounds = parseInt(woundsMatch[1]!, 10);

  const leadershipMatch = content.match(/(?:LD|Leadership)[:\s]*(\d+\+?)/i);
  if (leadershipMatch) stats.leadership = parseInt(leadershipMatch[1]!, 10);

  const ocMatch = content.match(/(?:OC|Objective Control)[:\s]*(\d+)/i);
  if (ocMatch) stats.objectiveControl = parseInt(ocMatch[1]!, 10);

  // Invulnerable save
  const invulnMatch = content.match(/(?:Invulnerable Save|Invuln)[:\s]*(\d+\+)/i);
  if (invulnMatch) stats.invulnerableSave = invulnMatch[1];

  return stats;
}

/**
 * Extract weapons from unit content
 */
function extractWeapons(content: string, sourceUrl: string): NewWeapon[] {
  const weapons: NewWeapon[] = [];

  // Look for ranged weapons table
  const rangedSection = content.match(
    /(?:Ranged Weapons?|RANGED WEAPONS?)[\s\S]*?\n([\s\S]*?)(?=(?:Melee|MELEE|Abilities|###)|$)/i
  );

  if (rangedSection?.[1]) {
    const parsed = parseWeaponTable(rangedSection[1], 'ranged', sourceUrl);
    weapons.push(...parsed);
  }

  // Look for melee weapons table - match from MELEE WEAPONS to ABILITIES or end
  // The table is continuous with ranged, so we look for the MELEE row and everything after
  const meleeSection = content.match(
    /MELEE WEAPONS[\s\S]*?\n([\s\S]*?)(?=(?:\n\s*(?:ABILITIES|###|\*\*))|$)/i
  );

  if (meleeSection?.[1]) {
    const parsed = parseWeaponTable(meleeSection[1], 'melee', sourceUrl);
    weapons.push(...parsed);
  }

  return weapons;
}

/**
 * Known weapon ability keywords that might be concatenated into weapon names
 */
export const WEAPON_ABILITY_KEYWORDS = [
  'anti-',
  'assault',
  'blast',
  'devastating wounds',
  'devastatingwounds',
  'extra attacks',
  'hazardous',
  'heavy',
  'ignores cover',
  'ignorescover',
  'indirect fire',
  'indirectfire',
  'lance',
  'lethal hits',
  'lethalhits',
  'melta',
  'one shot',
  'oneshot',
  'pistol',
  'precision',
  'psychic',
  'rapid fire',
  'rapidfire',
  'sustained hits',
  'sustainedhits',
  'torrent',
  'twin-linked',
  'twinlinked',
];

/**
 * Extract weapon abilities that were concatenated into the weapon name.
 * Also handles common patterns like "blastpsychic" -> "[BLAST], [PSYCHIC]"
 */
export function cleanWeaponName(rawName: string): { name: string; abilities: string | null } {
  let name = rawName;
  const foundAbilities: string[] = [];

  // First, apply normalizeText to handle known concatenation patterns
  // This converts "blastpsychic" -> "[BLAST], [PSYCHIC]"
  name = normalizeText(name);

  // Extract bracketed abilities that were created by normalizeText
  const bracketedPattern = /\[([A-Z][A-Z\s-]+)\]/g;
  let bracketMatch;
  while ((bracketMatch = bracketedPattern.exec(name)) !== null) {
    foundAbilities.push(bracketMatch[0]); // Keep the brackets
  }
  // Remove the bracketed abilities from the name
  name = name.replace(bracketedPattern, '').trim();
  // Clean up any trailing commas or spaces
  name = name.replace(/,\s*$/, '').replace(/\s+/g, ' ').trim();

  // Check for remaining concatenated ability keywords (case-insensitive)
  // Only extract abilities that are clearly concatenated (no space before them)
  // or appear at the very end of the name
  const lowerName = name.toLowerCase();

  for (const keyword of WEAPON_ABILITY_KEYWORDS) {
    // Look for the keyword without spaces (e.g., "devastatingwounds" or "indirectfire")
    const noSpaceKeyword = keyword.replace(/\s+/g, '');
    const idx = lowerName.indexOf(noSpaceKeyword);

    if (idx > 0) {
      // Check if this is truly concatenated (no space before it)
      const charBefore = name[idx - 1];
      const isConcatenated = charBefore !== ' ' && charBefore !== '-' && charBefore !== '–';

      if (!isConcatenated) {
        // Has a space before it - might be part of the weapon name, skip
        continue;
      }

      // Found concatenated ability - extract it
      const before = name.slice(0, idx).trim();
      const after = name.slice(idx + noSpaceKeyword.length);

      // Format the ability properly (e.g., "devastating wounds" -> "[DEVASTATING WOUNDS]")
      const formattedAbility = `[${keyword.toUpperCase()}]`;
      foundAbilities.push(formattedAbility);

      // Update name to the part before the ability
      name = before;

      // Check if there's more after - recursively extract abilities
      if (after.length > 0) {
        const { name: afterName, abilities: afterAbilities } = cleanWeaponName(after);
        if (afterAbilities) {
          // afterAbilities is already comma-separated, split and add
          foundAbilities.push(...afterAbilities.split(', ').filter(Boolean));
        }
        // If afterName is not empty and looks like a name part, append it
        if (afterName && afterName.length > 1 && !/^[a-z]/.test(afterName)) {
          name = `${name} ${afterName}`.trim();
        }
      }
      break; // Only handle one ability per pass (recursive handles the rest)
    }
  }

  // Deduplicate abilities
  const uniqueAbilities = [...new Set(foundAbilities)];

  return {
    name: name.trim(),
    abilities: uniqueAbilities.length > 0 ? uniqueAbilities.join(', ') : null,
  };
}

/**
 * Parse a weapons table
 */
function parseWeaponTable(
  tableContent: string,
  weaponType: 'ranged' | 'melee',
  sourceUrl: string
): NewWeapon[] {
  const weapons: NewWeapon[] = [];

  // Process line by line to avoid matching across lines
  const lines = tableContent.split('\n');

  for (const line of lines) {
    // Look for weapon data rows: |  | Name | Range/Melee | A | BS/WS | S | AP | D |
    // Must have exactly 8 cells (including empty first cell)
    const cells = line.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);

    // Need at least 8 cells: empty, name, range, attacks, skill, strength, ap, damage
    if (cells.length < 8) continue;

    // First cell should be empty (or just whitespace)
    if (cells[0] !== '') continue;

    const rawName = cells[1];
    const range = cells[2];
    const attacks = cells[3];
    const skill = cells[4];
    const strength = cells[5];
    const ap = cells[6];
    const damage = cells[7];

    // Skip header rows (RANGED WEAPONS, MELEE WEAPONS) and separator rows
    if (!rawName) continue;
    const lowerName = rawName.toLowerCase();
    if (lowerName === 'ranged weapons' || lowerName === 'melee weapons' || rawName.includes('---')) {
      continue;
    }

    // Skip rows without actual stats (just weapon name rows)
    if (!range || !attacks) continue;

    // Clean up weapon name and extract any concatenated abilities
    const { name, abilities } = cleanWeaponName(rawName);

    weapons.push({
      slug: slugify(name).slice(0, 255),
      name: name.slice(0, 255),
      weaponType,
      range: range || null,
      attacks: attacks || null,
      skill: skill || null,
      strength: strength || null,
      armorPenetration: ap || null,
      damage: damage || null,
      abilities,
      abilitiesJson: null,
      sourceUrl,
      dataSource: 'wahapedia' as const,
    });
  }

  return weapons;
}

/**
 * Patterns that indicate we've left the unit abilities section
 * and entered core rules, stratagems, or reference material
 */
const ABILITIES_STOP_MARKERS = [
  'STRATAGEMS',
  'UNIT COMPOSITION',
  'KEYWORDS:',           // Note: "KEYWORDS:" alone, not "FACTION KEYWORDS:"
  'FACTION KEYWORDS:',   // Separate faction keywords section
  'Army List',
  'Core Rules',
  'Datasheets collated',
  'DETACHMENT RULE',
  'ENHANCEMENTS',
  '## ',  // New major section
];

/**
 * Ability names/patterns to skip - these are not unit abilities
 */
const SKIP_ABILITY_PATTERNS = [
  /^WHEN:?$/i,
  /^TARGET:?$/i,
  /^EFFECT:?$/i,
  /^RESTRICTIONS:?$/i,
  /^Example:?$/i,
  /^D6 RESULT/i,
  /^NUMBER OF D6/i,
  /^FATE DICE/i,
  /^Characters$/i,
  /^Battleline$/i,
  /^Dedicated Transports$/i,
  /^Fortifications$/i,
  /^Other$/i,
  /keyword is used/i,
  /Army List/i,
  /Datasheets/i,
  /^\d+$/,  // Just a number
  /^\+$/,   // Just a plus sign
  /^and others\.\.\.$/i,
];

/**
 * Check if an ability name should be skipped
 */
function shouldSkipAbility(name: string, description: string): boolean {
  // Skip if name matches any skip pattern
  for (const pattern of SKIP_ABILITY_PATTERNS) {
    if (pattern.test(name)) return true;
  }

  // Skip if name is too short or too long
  if (name.length < 3 || name.length > 100) return true;

  // Skip if description looks like a URL list or reference section
  if (description.includes('](https://wahapedia.ru') && description.split('](').length > 3) {
    return true;
  }

  // Skip if description is just table formatting
  if (/^\|[\s|]*$/.test(description) || /^\s*\|\s*\d+\s*\|/.test(description)) {
    return true;
  }

  return false;
}

/**
 * Extract abilities from unit content
 */
function extractAbilities(
  content: string,
  sourceUrl: string
): Omit<NewAbility, 'factionId'>[] {
  const abilities: Omit<NewAbility, 'factionId'>[] = [];

  // Look for abilities section with better boundaries
  const abilitiesSection = content.match(
    /(?:### Abilities|\*\*ABILITIES\*\*|ABILITIES)[\s\S]*?\n([\s\S]*?)(?=###|STRATAGEMS|DETACHMENT RULE|ENHANCEMENTS|Army List|Datasheets collated|$)/i
  );

  if (!abilitiesSection?.[1]) {
    return abilities;
  }

  let abilitiesContent = abilitiesSection[1];

  // Find where the actual unit abilities end by looking for stop markers
  for (const marker of ABILITIES_STOP_MARKERS) {
    const markerIndex = abilitiesContent.indexOf(marker);
    if (markerIndex > 0) {
      abilitiesContent = abilitiesContent.slice(0, markerIndex);
    }
  }

  // Limit content length to prevent runaway parsing (unit abilities are typically < 3000 chars)
  abilitiesContent = abilitiesContent.slice(0, 3000);

  // First, extract CORE and FACTION labeled abilities (format: CORE: **AbilityName**)
  const labeledAbilityPattern = /^(CORE|FACTION):\s*\*\*([^*]+)\*\*/gm;
  let labelMatch;
  while ((labelMatch = labeledAbilityPattern.exec(abilitiesContent)) !== null) {
    const abilityType = labelMatch[1]!.toLowerCase() as 'core' | 'faction';
    const rawName = labelMatch[2]?.trim();
    // Normalize the ability name to fix concatenation issues
    const name = rawName ? normalizeText(rawName) : '';
    if (name && name.length >= 3) {
      abilities.push({
        slug: slugify(name).slice(0, 255),
        name: name.slice(0, 255),
        abilityType,
        description: `${abilityType.toUpperCase()} ability`, // Minimal description for labeled abilities
        sourceUrl,
        dataSource: 'wahapedia' as const,
      });
    }
  }

  // Then extract regular abilities with descriptions: **Ability Name:** Description
  const abilityPattern = /^\*\*([^*:]+):\*\*\s*([\s\S]*?)(?=\n\*\*[^*]+\*\*|\n\n|$)/gm;
  let match;

  while ((match = abilityPattern.exec(abilitiesContent)) !== null) {
    const rawName = match[1]?.trim();
    let rawDescription = match[2]?.trim();

    if (!rawName || !rawDescription) continue;

    // Normalize name and description to fix concatenation issues
    const name = normalizeText(rawName);
    let description = normalizeText(rawDescription);

    // Clean up description - remove trailing table junk
    description = description
      .replace(/\n\s*\|[\s\S]*$/, '')  // Remove trailing table rows
      .replace(/\n\s*-{3,}[\s\S]*$/, '')  // Remove trailing separators
      .trim();

    // Skip non-unit abilities
    if (shouldSkipAbility(name, description)) continue;

    // Skip if description is too short after cleanup
    if (description.length < 10) continue;

    abilities.push({
      slug: slugify(name).slice(0, 255),
      name: name.slice(0, 255),
      abilityType: 'unit',
      description,
      sourceUrl,
      dataSource: 'wahapedia' as const,
    });
  }

  return abilities;
}

function isHeaderSection(name: string): boolean {
  const lower = name.toLowerCase();

  // Skip garbage/malformed names
  if (name.startsWith('|') || name.length < 3) {
    return true;
  }

  // Skip section headers that aren't unit names
  return (
    lower.includes('datasheet') ||
    lower.includes('index') ||
    lower.includes('contents') ||
    lower.includes('navigation') ||
    lower === 'characters' ||
    lower === 'battleline' ||
    lower === 'other datasheets' ||
    lower === 'dedicated transports' ||
    lower === 'fortifications'
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export { ParsedUnit, UnitStats };
