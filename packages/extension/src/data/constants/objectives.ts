/**
 * Objective data constants for Warhammer 40K.
 * Includes secondary objectives, primary missions, gambits, and aliases.
 * These are fallback values used when the API is unavailable.
 */

// Fallback Secondary Objectives (used if API unavailable)
export const FALLBACK_SECONDARY_OBJECTIVES = [
  // Kill-based
  'Assassination',
  'Bring It Down',
  'No Prisoners',
  'Marked for Death',
  'Cull the Horde',
  // Positional/Action
  'Behind Enemy Lines',
  'Engage on All Fronts',
  'Area Denial',
  "Secure No Man's Land",
  'Deploy Teleport Homers',
  'Investigate Signals',
  'Cleanse',
  'Recover Assets',
  // Tactical
  'Storm Hostile Objective',
  'Defend Stronghold',
  'Overwhelming Force',
  'Display of Might',
  'Sabotage',
  'Tempting Target',
  // Fixed secondaries
  'Extend Battle Lines',
  'Grind Them Down',
  'Surgical Strikes',
  'Search and Destroy',
] as const;

// Fallback Primary Objectives / Mission Names (used if API unavailable)
export const FALLBACK_PRIMARY_OBJECTIVES = [
  'Hidden Supplies',
  'Take and Hold',
  'The Ritual',
  'Terraform',
  'Purge the Foe',
  'Scorched Earth',
  'Unexploded Ordnance',
  'Supply Drop',
  'Linchpin',
  'Burden of Trust',
  'Syphoned Power',
  'Establish Control',
  'Uneven Ground',
  'Denied Resources',
  'Hold Out',
] as const;

// Fallback colloquial objective name aliases
export const FALLBACK_OBJECTIVE_ALIASES = new Map<string, string>([
  ['storm hostile', 'Storm Hostile Objective'],
  ['secure no man', "Secure No Man's Land"],
  ['no mans land', "Secure No Man's Land"],
  ['teleport homers', 'Deploy Teleport Homers'],
  ['extend lines', 'Extend Battle Lines'],
  // Terraform variants
  ['terraforming points', 'Terraform'],
  ['terraforming', 'Terraform'],
  ['terraform points', 'Terraform'],
  ['terra forming', 'Terraform'],
]);

export type SecondaryObjective = typeof FALLBACK_SECONDARY_OBJECTIVES[number];
export type PrimaryObjective = typeof FALLBACK_PRIMARY_OBJECTIVES[number];
