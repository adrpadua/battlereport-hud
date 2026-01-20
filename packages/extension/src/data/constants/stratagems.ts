/**
 * Stratagem data constants for Warhammer 40K 10th Edition.
 * Includes core stratagems (available to all armies) and faction-specific stratagems.
 */

// Core stratagems available to all armies (10th edition)
export const CORE_STRATAGEMS = [
  'Fire Overwatch',
  'Go to Ground',
  'Smokescreen',
  'Rapid Ingress',
  'Heroic Intervention',
  'Counter-offensive',
  'Insane Bravery',
  'Grenade',
  'Tank Shock',
  'Command Re-roll',
  'Epic Challenge',
] as const;

// Common faction stratagems (extended list)
export const FACTION_STRATAGEMS = [
  // Space Marines
  'Armour of Contempt',
  'Only in Death Does Duty End',
  'Honour the Chapter',
  'Fury of the First',
  'Adaptive Strategy',
  'Storm of Fire',
  'Oath of Moment',
  // Aeldari
  'Fire and Fade',
  'Lightning-Fast Reactions',
  'Forewarned',
  'Phantasm',
  'Matchless Agility',
  'Feigned Retreat',
  'Cloudstrike',
  'Webway Strike',
  'Linked Fire',
  'Battle Focus',
  'Strands of Fate',
  'Strike Swiftly',
  'Focus Fire',
  // Necrons
  'Awakened by Murder',
  'Disruption Fields',
  'Solar Pulse',
  'Techno-Oracular Targeting',
  'Protocol of the Hungry Void',
  'Protocol of the Vengeful Stars',
  'Protocol of the Conquering Tyrant',
  // Chaos Space Marines
  'Dark Pact',
  'Let the Galaxy Burn',
  'Profane Zeal',
  'Veterans of the Long War',
  // Death Guard
  'Disgustingly Resilient',
  'Putrid Detonation',
  'Trench Fighters',
  // Tyranids
  'Synaptic Channelling',
  'Rapid Regeneration',
  'Death Frenzy',
  'Endless Swarm',
  'Hyper-Adaptation',
  // Orks
  "Orks is Never Beaten",
  'Careen',
  'Get Stuck In',
  'Unbridled Carnage',
  // T'au
  'For the Greater Good',
  'Photon Grenades',
  'Point-Blank Volley',
  'Breach and Clear',
  // Custodes
  'Arcane Genetic Alchemy',
  'Slayers of Tyrants',
  "Emperor's Auspice",
  'Tanglefoot Grenade',
  // Sisters
  'Divine Intervention',
  'Martyrdom',
  'Spirit of the Martyr',
  // Guard
  'Take Cover',
  'Fields of Fire',
  'Reinforcements',
  'Suppressive Fire',
  // Knights
  'Rotate Ion Shields',
  'Machine Spirit Resurgent',
  // Leagues of Votann
  'Ancestral Sentence',
  'Void Armour',
] as const;

// Combined list of all stratagems
export const ALL_STRATAGEMS = [...CORE_STRATAGEMS, ...FACTION_STRATAGEMS] as const;

// Map colloquial/shortened names to canonical names
// Use proper capitalization matching official naming
export const STRATAGEM_ALIASES = new Map<string, string>([
  ['overwatch', 'Fire Overwatch'],
  ['re-roll', 'Command Re-roll'],
  ['reroll', 'Command Re-roll'],
]);

// Terms that indicate stratagem use but aren't stratagem names themselves
// These are only matched when "stratagem" also appears in the text
export const STRATAGEM_CONTEXT_KEYWORDS = ['activates', 'pops', 'CP', 'command points'] as const;

export type CoreStratagem = typeof CORE_STRATAGEMS[number];
export type FactionStratagem = typeof FACTION_STRATAGEMS[number];
export type Stratagem = typeof ALL_STRATAGEMS[number];
