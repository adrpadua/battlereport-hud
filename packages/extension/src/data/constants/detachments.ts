/**
 * Detachment data constants for Warhammer 40K.
 * Includes army detachments by faction and common aliases.
 */

// Army Detachments by faction
export const DETACHMENTS = [
  // Drukhari
  'Realspace Raiders',
  'Skysplinter Assault',
  'Spectacle of Spite',
  'Covenite Coterie',
  'Kabalite Cartel',
  "Reaper's Wager",
  // Genestealer Cults
  'Host of Ascension',
  'Xenocreed Congregation',
  'Biosanctic Broodsurge',
  'Outlander Claw',
  'Brood Brother Auxilia',
  'Final Day',
  // Space Marines
  'Gladius Task Force',
  'Anvil Siege Force',
  'Ironstorm Spearhead',
  'Firestorm Assault Force',
  'Vanguard Spearhead',
  'First Company Task Force',
  '1st Company Task Force',
  'Stormlance Task Force',
  // Aeldari
  'Battle Host',
  'Windrider Host',
  'Starhost',
  // Necrons
  'Awakened Dynasty',
  'Annihilation Legion',
  'Canoptek Court',
  'Hypercrypt Legion',
  'Obeisance Phalanx',
  // Tyranids
  'Invasion Fleet',
  'Crusher Stampede',
  'Synaptic Nexus',
  'Assimilation Swarm',
  'Vanguard Onslaught',
  'Unending Swarm',
  // Orks
  'Waaagh! Tribe',
  'War Horde',
  'Bully Boyz',
  'Kult of Speed',
  'Dread Mob',
  'Green Tide',
  // T'au
  'Kauyon',
  "Mont'ka",
  'Retaliation Cadre',
  // Chaos Space Marines
  'Slaves to Darkness',
  'Veterans of the Long War',
  'Pactbound Zealots',
  'Deceptors',
  'Dread Talons',
  'Soulforged Warpack',
  // Death Guard
  'Plague Company',
  'Creeping Death',
  // World Eaters
  'Berzerker Warband',
  // Thousand Sons
  'Cult of Magic',
  // Custodes
  'Shield Host',
  'Auric Champions',
  // Sisters
  'Hallowed Martyrs',
  'Bringers of Flame',
  'Penitent Host',
  // Imperial Knights
  'Noble Lance',
  // Chaos Knights
  'Traitoris Lance',
  // Guard
  'Combined Regiment',
  'Armoured Spearhead',
  // Ad Mech
  'Rad-Zone Corps',
  'Data-Psalm Conclave',
  'Explorator Maniple',
  'Cohort Cybernetica',
  'Skitarii Hunter Cohort',
] as const;

// Use proper capitalization matching official naming
export const DETACHMENT_ALIASES = new Map<string, string>([
  ['cartel', 'Kabalite Cartel'],
  ['cabalite cartel', 'Kabalite Cartel'],
  ['gladius', 'Gladius Task Force'],
  ['kauyon', 'Kauyon'],
  ['montka', "Mont'ka"],
  // Drukhari
  ['sky-splinter', 'Skysplinter Assault'],
  ['sky splinter', 'Skysplinter Assault'],
  ['sky-splinter assault', 'Skysplinter Assault'],
  ['sky splinter assault', 'Skysplinter Assault'],
  // Grey Knights
  ['warp bane', 'Teleport Strike Force'],
  ['warp bane task force', 'Teleport Strike Force'],
]);

export type Detachment = typeof DETACHMENTS[number];
