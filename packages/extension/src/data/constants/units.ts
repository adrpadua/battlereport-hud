/**
 * Unit-related constants for Warhammer 40K.
 * Includes unit aliases, character type patterns, and blocklist for game mechanics.
 */

// Map colloquial/shortened unit names to canonical names
// Use proper capitalization matching BSData conventions
export const UNIT_ALIASES = new Map<string, string>([
  // Space Marines
  ['intercessors', 'Intercessor Squad'],
  ['assault intercessors', 'Assault Intercessor Squad'],
  ['terminators', 'Terminator Squad'],
  ['assault terminators', 'Assault Terminator Squad'],
  ['scouts', 'Scout Squad'],
  ['hellblasters', 'Hellblaster Squad'],
  ['devastators', 'Devastator Squad'],
  ['tacticals', 'Tactical Squad'],
  ['assault marines', 'Assault Squad'],
  ['vanguard vets', 'Vanguard Veteran Squad'],
  ['sternguard', 'Sternguard Veteran Squad'],
  ['aggressors', 'Aggressor Squad'],
  ['eradicators', 'Eradicator Squad'],
  ['eliminators', 'Eliminator Squad'],
  ['incursors', 'Incursor Squad'],
  ['infiltrators', 'Infiltrator Squad'],
  ['reivers', 'Reiver Squad'],
  ['suppressors', 'Suppressor Squad'],
  ['inceptors', 'Inceptor Squad'],
  ['bladeguard', 'Bladeguard Veteran Squad'],
  // Common abbreviations
  ['las preds', 'Predator Destructor'],
  ['las pred', 'Predator Destructor'],
  // Drukhari common misspellings
  ['cabalite warriors', 'Kabalite Warriors'],
  ['cabalite', 'Kabalite Warriors'],
  ['cabalites', 'Kabalite Warriors'],
  ['drazhar', 'Drazhar'],
  ['drazar', 'Drazhar'],
  ['mandrekes', 'Mandrakes'],
  ['cronos', 'Cronos'],
  ['kronos', 'Cronos'],
  ['lady malice', 'Lady Malys'],
  ['malice', 'Lady Malys'],
  ['malys', 'Lady Malys'],
  ['reaver jet bikes', 'Reavers'],
  ['reaver jetbikes', 'Reavers'],
  ['lilith hesperax', 'Lelith Hesperax'],
  ['witch cults', 'Wyches'],
  ['witches', 'Wyches'],
  ['wych cult', 'Wyches'],
  ['lilith', 'Lelith Hesperax'],
  ['lelith', 'Lelith Hesperax'],
  // GSC common misspellings
  ['genestealers', 'Purestrain Genestealers'],
  ['genesteelers', 'Purestrain Genestealers'],
  ['genest steelers', 'Purestrain Genestealers'],
  ['ridgerunners', 'Achilles Ridgerunners'],
  ['ridge runners', 'Achilles Ridgerunners'],
  ['rockgrinder', 'Goliath Rockgrinder'],
  ['rock grinder', 'Goliath Rockgrinder'],
  ['kelermorph', 'Kelermorph'],
  ['kellerorph', 'Kelermorph'],
  ['calamorph', 'Kelermorph'],
  ['sabotur', 'Reductus Saboteur'],
  ['saboteur', 'Reductus Saboteur'],
  ['reducted sabotur', 'Reductus Saboteur'],
  ['hand flamer acolytes', 'Acolyte Hybrids with Hand Flamers'],
  ['rocksaw acolytes', 'Hybrid Metamorphs'],
  // Common unit shorthand
  // Note: 'flamers' removed - it's a weapon type, not a unit
  // Actual unit is 'Acolyte Hybrids with Hand Flamers'
  ['aberrants', 'Aberrants'],
  ['aber', 'Aberrants'],
]);

// Patterns for stripping player names from character unit types
// e.g., "Archon Skari" -> "Archon", "Captain Bob" -> "Captain"
export const CHARACTER_TYPE_PATTERNS = [
  /^(archon)\s+\w+$/i,
  /^(succubus)\s+\w+$/i,
  /^(haemonculus)\s+\w+$/i,
  /^(librarian)\s+\w+$/i,
  /^(captain)\s+\w+$/i,
  /^(chaplain)\s+\w+$/i,
  /^(techmarine)\s+\w+$/i,
  /^(lieutenant)\s+\w+$/i,
  /^(apothecary)\s+\w+$/i,
  /^(magos)\s+\w+$/i,
  /^(primus)\s+\w+$/i,
  /^(patriarch)\s+\w+$/i,
  /^(overlord)\s+\w+$/i,
  /^(cryptek)\s+\w+$/i,
  /^(farseer)\s+\w+$/i,
  /^(autarch)\s+\w+$/i,
  /^(warlock)\s+\w+$/i,
] as const;

// Pattern for units with weapon loadouts: "Scourge with Dark Lances" -> "Scourges"
export const UNIT_WITH_WEAPON_PATTERN = /^(\w+(?:\s+\w+)?)\s+with\s+.+$/i;

// Words that are too generic to use as unit aliases
export const GENERIC_WORDS = new Set([
  'the', 'with', 'and', 'unit', 'squad', 'team', 'band', 'pack',
  'hand', 'heavy', 'light', 'support', 'assault', 'battle', 'war',
  'command', 'strike', 'storm', 'fire', 'death', 'blood', 'iron',
  'dark', 'chaos', 'imperial', 'space', 'scout', 'veteran', 'elite',
]);

// Game mechanics that should NEVER be tagged as units/abilities
// These are core rules concepts, not taggable game entities
export const GAME_MECHANICS_BLOCKLIST = new Set([
  // Weapon abilities
  'devastating wounds', 'sustained hits', 'lethal hits', 'anti-infantry',
  'anti-vehicle', 'anti-monster', 'hazardous', 'torrent', 'blast', 'melta',
  'precision', 'ignores cover', 'indirect fire', 'twin-linked', 'rapid fire',
  'assault', 'heavy', 'pistol', 'lance',
  // Core mechanics
  'battleshock', 'battle-shock', 'command point', 'command points', 'cp',
  'feel no pain', 'fnp', 'invulnerable save', 'invuln', 'invulnerable',
  'mortal wounds', 'mortal wound', 'mortals', 'deadly demise',
  'lone operative', 'deep strike', 'deep striking', 'reserves',
  'fall back', 'falling back', 'pile in', 'pile-in', 'consolidate',
  'advance', 'advancing', 'charge', 'charging', 'fight first', 'fights first',
  'fight last', 'fights last', 'objective control', 'oc',
  // Faction rules / army-wide abilities
  'power from pain', 'pain tokens', 'pain token', 'wraithlike retreat',
  'sustained assault', 'strands of fate', 'oath of moment',
  // Common weapon names (not units)
  'dark lance', 'dark lances', 'splinter rifle', 'splinter cannon',
  'shuriken catapult', 'shuriken cannon', 'meltagun', 'melta gun',
  'bolt rifle', 'bolter', 'boltgun', 'plasma gun', 'plasma rifle',
  'lascannon', 'las cannon', 'heavy bolter', 'autocannon', 'missile launcher',
  'power sword', 'power fist', 'thunder hammer', 'lightning claw',
  'chainsword', 'chain sword', 'huskblade', 'agoniser', 'agonizer',
  'splinter pistol', 'blast pistol', 'shredder', 'blaster', 'heat lance',
  'disintegrator cannon', 'phantasm grenade launcher',
]);
