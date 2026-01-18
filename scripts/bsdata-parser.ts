import { XMLParser } from 'fast-xml-parser';
import type { UnitData, UnitStats, WeaponProfile, FactionData } from '../src/types/bsdata';

// Profile type IDs from BSData schema
const PROFILE_TYPE_IDS = {
  unit: 'c547-1836-d8a-ff4f',
  rangedWeapon: 'f77d-b953-8fa4-b762',
  meleeWeapon: '8a40-4aaa-c780-9046',
  abilities: '9cc3-6d83-4dd3-9b64',
};

// Characteristic type IDs for unit stats
const UNIT_STAT_IDS = {
  movement: 'e703-ecb6-5ce7-aec1',
  toughness: 'd29d-cf75-fc2d-34a4',
  save: '450-a17e-9d5e-29da',
  wounds: '750a-a2ec-90d3-21fe',
  leadership: '58d2-b879-49c7-43bc',
  objectiveControl: 'bef7-942a-1a23-59f8',
};

// Characteristic type IDs for weapon stats
const WEAPON_STAT_IDS = {
  range: '9896-9419-16a1-92fc',
  attacks: '3bb-c35f-f54-fb08',
  ballisticSkill: '94d-8a98-cf90-183e',
  weaponSkill: '5e97-60a-c54-6285',
  strength: '2229-f494-25db-c5d3',
  ap: '9ead-8a10-520-de15',
  damage: 'a354-c1c8-a745-f9e3',
  keywords: '7f1b-8591-2fcf-d01c',
};

// Cost type ID for points
const POINTS_COST_ID = '51b2-306e-1021-d207';

interface ParsedCharacteristic {
  '@_name': string;
  '@_typeId': string;
  '#text'?: string;
}

interface ParsedProfile {
  '@_name': string;
  '@_typeId': string;
  '@_typeName': string;
  '@_hidden'?: string;
  '@_id': string;
  characteristics?: {
    characteristic: ParsedCharacteristic | ParsedCharacteristic[];
  };
}

interface ParsedCost {
  '@_name': string;
  '@_typeId': string;
  '@_value': string;
}

interface ParsedCategoryLink {
  '@_name': string;
  '@_targetId': string;
  '@_primary'?: string;
}

interface ParsedSelectionEntry {
  '@_type': string;
  '@_name': string;
  '@_id': string;
  '@_hidden'?: string;
  '@_import'?: string;
  costs?: { cost: ParsedCost | ParsedCost[] };
  profiles?: { profile: ParsedProfile | ParsedProfile[] };
  categoryLinks?: { categoryLink: ParsedCategoryLink | ParsedCategoryLink[] };
  selectionEntries?: { selectionEntry: ParsedSelectionEntry | ParsedSelectionEntry[] };
  selectionEntryGroups?: { selectionEntryGroup: ParsedSelectionEntryGroup | ParsedSelectionEntryGroup[] };
  infoLinks?: unknown;
  modifiers?: unknown;
  constraints?: unknown;
  entryLinks?: unknown;
}

interface ParsedSelectionEntryGroup {
  '@_name': string;
  '@_id': string;
  selectionEntries?: { selectionEntry: ParsedSelectionEntry | ParsedSelectionEntry[] };
  selectionEntryGroups?: { selectionEntryGroup: ParsedSelectionEntryGroup | ParsedSelectionEntryGroup[] };
  constraints?: unknown;
  modifiers?: unknown;
}

interface ParsedCatalogue {
  catalogue: {
    '@_id': string;
    '@_name': string;
    '@_revision': string;
    selectionEntries?: { selectionEntry: ParsedSelectionEntry | ParsedSelectionEntry[] };
    sharedSelectionEntries?: { selectionEntry: ParsedSelectionEntry | ParsedSelectionEntry[] };
    sharedSelectionEntryGroups?: { selectionEntryGroup: ParsedSelectionEntryGroup | ParsedSelectionEntryGroup[] };
    categoryEntries?: unknown;
    entryLinks?: unknown;
    infoLinks?: unknown;
  };
}

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getCharacteristic(
  characteristics: ParsedCharacteristic[],
  typeId: string
): string | undefined {
  const char = characteristics.find((c) => c['@_typeId'] === typeId);
  return char?.['#text'];
}

function parseUnitStats(profile: ParsedProfile): UnitStats | null {
  const characteristics = ensureArray(profile.characteristics?.characteristic);
  if (characteristics.length === 0) return null;

  const movement = getCharacteristic(characteristics, UNIT_STAT_IDS.movement);
  const toughness = getCharacteristic(characteristics, UNIT_STAT_IDS.toughness);
  const save = getCharacteristic(characteristics, UNIT_STAT_IDS.save);
  const wounds = getCharacteristic(characteristics, UNIT_STAT_IDS.wounds);
  const leadership = getCharacteristic(characteristics, UNIT_STAT_IDS.leadership);
  const oc = getCharacteristic(characteristics, UNIT_STAT_IDS.objectiveControl);

  if (!toughness || !save || !wounds) return null;

  return {
    movement: movement ?? '-',
    toughness: parseInt(toughness, 10) || 0,
    save: save,
    wounds: parseInt(wounds, 10) || 0,
    leadership: leadership ?? '-',
    objectiveControl: parseInt(oc ?? '0', 10),
  };
}

function parseWeaponProfile(profile: ParsedProfile): WeaponProfile | null {
  const characteristics = ensureArray(profile.characteristics?.characteristic);
  if (characteristics.length === 0) return null;

  const isRanged = profile['@_typeId'] === PROFILE_TYPE_IDS.rangedWeapon;
  const isMelee = profile['@_typeId'] === PROFILE_TYPE_IDS.meleeWeapon;

  if (!isRanged && !isMelee) return null;

  const range = getCharacteristic(characteristics, WEAPON_STAT_IDS.range);
  const attacks = getCharacteristic(characteristics, WEAPON_STAT_IDS.attacks);
  const skill = isRanged
    ? getCharacteristic(characteristics, WEAPON_STAT_IDS.ballisticSkill)
    : getCharacteristic(characteristics, WEAPON_STAT_IDS.weaponSkill);
  const strength = getCharacteristic(characteristics, WEAPON_STAT_IDS.strength);
  const ap = getCharacteristic(characteristics, WEAPON_STAT_IDS.ap);
  const damage = getCharacteristic(characteristics, WEAPON_STAT_IDS.damage);
  const keywordsStr = getCharacteristic(characteristics, WEAPON_STAT_IDS.keywords);

  if (!strength) return null;

  return {
    name: profile['@_name'],
    type: isRanged ? 'ranged' : 'melee',
    range: String(range ?? 'Melee'),
    attacks: String(attacks ?? '-'),
    skill: String(skill ?? '-'),
    strength: parseInt(String(strength), 10) || 0,
    ap: parseInt(String(ap ?? '0'), 10),
    damage: String(damage ?? '-'),
    keywords: keywordsStr ? String(keywordsStr).split(',').map((k) => k.trim()).filter(Boolean) : undefined,
  };
}

function extractAbilities(profiles: ParsedProfile[]): string[] {
  const abilities: string[] = [];
  for (const profile of profiles) {
    if (profile['@_typeId'] === PROFILE_TYPE_IDS.abilities) {
      abilities.push(profile['@_name']);
    }
  }
  return abilities;
}

function extractKeywords(categoryLinks: ParsedCategoryLink[]): string[] {
  return categoryLinks
    .map((link) => link['@_name'])
    .filter((name) => !name.startsWith('Faction:') && name !== 'Configuration');
}

function extractPointsCost(costs: ParsedCost[]): number | null {
  const pointsCost = costs.find((c) => c['@_typeId'] === POINTS_COST_ID);
  return pointsCost ? parseInt(pointsCost['@_value'], 10) : null;
}

function collectWeaponsFromEntry(entry: ParsedSelectionEntry, weapons: WeaponProfile[]): void {
  // Check profiles in this entry
  const profiles = ensureArray(entry.profiles?.profile);
  for (const profile of profiles) {
    const weapon = parseWeaponProfile(profile);
    if (weapon && !weapons.some((w) => w.name === weapon.name)) {
      weapons.push(weapon);
    }
  }

  // Recursively check nested selection entries
  const nestedEntries = ensureArray(entry.selectionEntries?.selectionEntry);
  for (const nested of nestedEntries) {
    collectWeaponsFromEntry(nested, weapons);
  }

  // Check selection entry groups
  const groups = ensureArray(entry.selectionEntryGroups?.selectionEntryGroup);
  for (const group of groups) {
    const groupEntries = ensureArray(group.selectionEntries?.selectionEntry);
    for (const groupEntry of groupEntries) {
      collectWeaponsFromEntry(groupEntry, weapons);
    }
  }
}

function parseUnitEntry(entry: ParsedSelectionEntry): UnitData | null {
  // Only process unit type entries
  if (entry['@_type'] !== 'unit') return null;
  if (entry['@_hidden'] === 'true') return null;

  const name = entry['@_name'];
  const canonicalName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Collect all profiles (unit stats, abilities, weapons)
  const allProfiles: ParsedProfile[] = [];
  const allWeapons: WeaponProfile[] = [];

  // Get profiles from main entry
  const mainProfiles = ensureArray(entry.profiles?.profile);
  allProfiles.push(...mainProfiles);

  // Collect weapons from all nested entries
  collectWeaponsFromEntry(entry, allWeapons);

  // Also check profiles in top-level
  for (const profile of mainProfiles) {
    const weapon = parseWeaponProfile(profile);
    if (weapon && !allWeapons.some((w) => w.name === weapon.name)) {
      allWeapons.push(weapon);
    }
  }

  // Find unit stats profile
  const unitProfile = allProfiles.find((p) => p['@_typeId'] === PROFILE_TYPE_IDS.unit);
  const stats = unitProfile ? parseUnitStats(unitProfile) : null;

  // Extract abilities
  const abilities = extractAbilities(allProfiles);

  // Extract keywords from category links
  const categoryLinks = ensureArray(entry.categoryLinks?.categoryLink);
  const keywords = extractKeywords(categoryLinks);

  // Get points cost
  const costs = ensureArray(entry.costs?.cost);
  const pointsCost = extractPointsCost(costs);

  return {
    name,
    canonicalName,
    stats,
    weapons: allWeapons,
    abilities,
    keywords,
    pointsCost,
  };
}

export function parseCatalogue(xmlContent: string, factionId: string, originalFilename?: string): FactionData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseAttributeValue: false,
  });

  const parsed = parser.parse(xmlContent) as ParsedCatalogue;
  const catalogue = parsed.catalogue;

  // Derive faction name from filename or catalogue name
  let factionName = catalogue['@_name']
    .replace(/^(Imperium|Chaos|Xenos|Aeldari) - /, '')
    .replace(/ - .*$/, '');

  // Use filename to get specific chapter/faction names
  if (originalFilename) {
    const filenameMap: Record<string, string> = {
      'Imperium - Black Templars.cat': 'Black Templars',
      'Imperium - Blood Angels.cat': 'Blood Angels',
      'Imperium - Dark Angels.cat': 'Dark Angels',
      'Imperium - Deathwatch.cat': 'Deathwatch',
      'Imperium - Space Wolves.cat': 'Space Wolves',
      'Imperium - Ultramarines.cat': 'Ultramarines',
      'Imperium - Imperial Fists.cat': 'Imperial Fists',
      'Imperium - Iron Hands.cat': 'Iron Hands',
      'Imperium - Raven Guard.cat': 'Raven Guard',
      'Imperium - Salamanders.cat': 'Salamanders',
      'Imperium - White Scars.cat': 'White Scars',
      'Imperium - Space Marines.cat': 'Space Marines',
      'Aeldari - Craftworlds.cat': 'Craftworld Aeldari',
      'Aeldari - Drukhari.cat': 'Drukhari',
      'Aeldari - Ynnari.cat': 'Ynnari',
      'Aeldari - Aeldari Library.cat': 'Aeldari',
      'Chaos - Chaos Daemons.cat': 'Chaos Daemons',
      'Chaos - Chaos Knights.cat': 'Chaos Knights',
      'Tyranids.cat': 'Tyranids',
      'Library - Tyranids.cat': 'Tyranids Library',
    };
    if (filenameMap[originalFilename]) {
      factionName = filenameMap[originalFilename];
    }
  }

  const units: UnitData[] = [];

  // Parse selection entries
  const selectionEntries = ensureArray(catalogue.selectionEntries?.selectionEntry);
  for (const entry of selectionEntries) {
    const unit = parseUnitEntry(entry);
    if (unit) {
      units.push(unit);
    }
  }

  // Also check shared selection entries
  const sharedEntries = ensureArray(catalogue.sharedSelectionEntries?.selectionEntry);
  for (const entry of sharedEntries) {
    const unit = parseUnitEntry(entry);
    if (unit && !units.some((u) => u.name === unit.name)) {
      units.push(unit);
    }
  }

  return {
    id: factionId,
    name: factionName,
    units,
  };
}

export function extractFactionAliases(factionName: string, factionId?: string): string[] {
  const aliases: string[] = [factionName.toLowerCase()];

  // Add common abbreviations and alternate names
  const aliasMap: Record<string, string[]> = {
    'Space Marines': ['space marines', 'sm', 'astartes', 'adeptus astartes'],
    'Adeptus Astartes': ['space marines', 'sm', 'astartes'],
    'Necrons': ['necrons', 'crons'],
    'Orks': ['orks', 'orcs'],
    'Aeldari': ['aeldari', 'eldar', 'craftworlds', 'craftworld'],
    'Craftworld Aeldari': ['craftworld aeldari', 'craftworlds', 'eldar', 'aeldari'],
    'Drukhari': ['drukhari', 'dark eldar', 'de'],
    'Ynnari': ['ynnari'],
    'T\'au Empire': ['tau', 't\'au', 'tau empire'],
    'Tyranids': ['tyranids', 'nids', 'bugs'],
    'Chaos Space Marines': ['chaos space marines', 'csm', 'chaos marines', 'heretic astartes'],
    'Death Guard': ['death guard', 'dg'],
    'Thousand Sons': ['thousand sons', 'tsons', '1ksons'],
    'World Eaters': ['world eaters', 'we', 'khorne'],
    'Emperor\'s Children': ['emperor\'s children', 'ec', 'slaanesh marines'],
    'Chaos Daemons': ['chaos daemons', 'daemons', 'demons'],
    'Imperial Knights': ['imperial knights', 'knights', 'ik'],
    'Chaos Knights': ['chaos knights', 'ck'],
    'Astra Militarum': ['astra militarum', 'guard', 'imperial guard', 'ig', 'am'],
    'Adeptus Custodes': ['adeptus custodes', 'custodes', 'golden boys'],
    'Adepta Sororitas': ['adepta sororitas', 'sisters', 'sisters of battle', 'sob'],
    'Adeptus Mechanicus': ['adeptus mechanicus', 'admech', 'ad mech', 'mechanicus'],
    'Grey Knights': ['grey knights', 'gk'],
    'Blood Angels': ['blood angels', 'ba'],
    'Dark Angels': ['dark angels', 'da'],
    'Black Templars': ['black templars', 'bt'],
    'Space Wolves': ['space wolves', 'sw', 'wolves'],
    'Deathwatch': ['deathwatch', 'dw'],
    'Ultramarines': ['ultramarines', 'ultras', 'smurfs'],
    'Imperial Fists': ['imperial fists', 'if', 'fists'],
    'Iron Hands': ['iron hands', 'ih'],
    'Raven Guard': ['raven guard', 'rg'],
    'Salamanders': ['salamanders', 'sallies'],
    'White Scars': ['white scars', 'ws', 'scars'],
    'Genestealer Cults': ['genestealer cults', 'gsc', 'genestealers'],
    'Leagues of Votann': ['leagues of votann', 'votann', 'squats'],
    'Agents of the Imperium': ['agents of the imperium', 'agents', 'inquisition'],
  };

  const matchedAliases = aliasMap[factionName];
  if (matchedAliases) {
    aliases.push(...matchedAliases.filter((a) => !aliases.includes(a)));
  }

  // Add faction ID based aliases
  if (factionId) {
    const idAlias = factionId.replace(/-/g, ' ');
    if (!aliases.includes(idAlias)) {
      aliases.push(idAlias);
    }
  }

  return aliases;
}
