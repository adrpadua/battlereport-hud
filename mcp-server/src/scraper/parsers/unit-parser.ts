import type { NewUnit, NewWeapon, NewAbility } from '../../db/schema.js';

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

  // Split by h2 headers to get each unit
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
    slug: slugify(name),
    name,
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

  // Look for melee weapons table
  const meleeSection = content.match(
    /(?:Melee Weapons?|MELEE WEAPONS?)[\s\S]*?\n([\s\S]*?)(?=(?:Abilities|###)|$)/i
  );

  if (meleeSection?.[1]) {
    const parsed = parseWeaponTable(meleeSection[1], 'melee', sourceUrl);
    weapons.push(...parsed);
  }

  return weapons;
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

  // Look for table rows with weapon data
  // Format: | Weapon Name | Range | A | BS/WS | S | AP | D | [Abilities] |
  const rowPattern =
    /\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*(?:\|\s*([^|]*)\s*)?\|/g;

  let match;
  while ((match = rowPattern.exec(tableContent)) !== null) {
    const name = match[1]?.trim();

    // Skip header rows
    if (!name || name.toLowerCase().includes('weapon') || name.includes('---')) {
      continue;
    }

    const range = match[2]?.trim();
    const attacks = match[3]?.trim();
    const skill = match[4]?.trim();
    const strength = match[5]?.trim();
    const ap = match[6]?.trim();
    const damage = match[7]?.trim();
    const abilities = match[8]?.trim();

    weapons.push({
      slug: slugify(name),
      name,
      weaponType,
      range: range ?? null,
      attacks: attacks ?? null,
      skill: skill ?? null,
      strength: strength ?? null,
      armorPenetration: ap ?? null,
      damage: damage ?? null,
      abilities: abilities ?? null,
      abilitiesJson: abilities ? parseWeaponAbilities(abilities) : null,
      sourceUrl,
      dataSource: 'wahapedia' as const,
    });
  }

  return weapons;
}

/**
 * Parse weapon ability keywords into array
 */
function parseWeaponAbilities(abilities: string): string[] {
  // Common weapon abilities
  const knownAbilities = [
    'Anti-',
    'Assault',
    'Blast',
    'Devastating Wounds',
    'Extra Attacks',
    'Hazardous',
    'Heavy',
    'Ignores Cover',
    'Indirect Fire',
    'Lance',
    'Lethal Hits',
    'Melta',
    'One Shot',
    'Pistol',
    'Precision',
    'Psychic',
    'Rapid Fire',
    'Sustained Hits',
    'Torrent',
    'Twin-linked',
  ];

  return abilities
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter(Boolean);
}

/**
 * Extract abilities from unit content
 */
function extractAbilities(
  content: string,
  sourceUrl: string
): Omit<NewAbility, 'factionId'>[] {
  const abilities: Omit<NewAbility, 'factionId'>[] = [];

  // Look for abilities section
  const abilitiesSection = content.match(
    /(?:### Abilities|ABILITIES)[\s\S]*?\n([\s\S]*?)(?=###|$)/i
  );

  if (!abilitiesSection?.[1]) {
    return abilities;
  }

  const abilitiesContent = abilitiesSection[1];

  // Pattern: **Ability Name:** Description
  const abilityPattern = /\*\*([^*]+)\*\*[:\s]*([\s\S]*?)(?=\*\*|$)/g;
  let match;

  while ((match = abilityPattern.exec(abilitiesContent)) !== null) {
    const name = match[1]?.trim();
    const description = match[2]?.trim();

    if (name && description && description.length > 5) {
      abilities.push({
        slug: slugify(name),
        name,
        abilityType: detectAbilityType(name, description),
        description,
        sourceUrl,
        dataSource: 'wahapedia' as const,
      });
    }
  }

  return abilities;
}

function detectAbilityType(name: string, description: string): string {
  const combined = `${name} ${description}`.toLowerCase();

  if (combined.includes('core')) return 'core';
  if (combined.includes('faction')) return 'faction';
  if (combined.includes('wargear')) return 'wargear';

  return 'unit';
}

function isHeaderSection(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes('datasheet') ||
    lower.includes('index') ||
    lower.includes('contents') ||
    lower.includes('navigation')
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export { ParsedUnit, UnitStats };
