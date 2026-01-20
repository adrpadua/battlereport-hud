/**
 * Re-export all constants from the constants module.
 * Import from '@/data/constants' for cleaner imports.
 */

// Thresholds
export { MATCHING_THRESHOLDS, type MatchingThreshold } from './thresholds';

// Stratagems
export {
  CORE_STRATAGEMS,
  FACTION_STRATAGEMS,
  ALL_STRATAGEMS,
  STRATAGEM_ALIASES,
  STRATAGEM_CONTEXT_KEYWORDS,
  type CoreStratagem,
  type FactionStratagem,
  type Stratagem,
} from './stratagems';

// Factions
export {
  FACTIONS,
  FACTION_ALIASES,
  type Faction,
} from './factions';

// Detachments
export {
  DETACHMENTS,
  DETACHMENT_ALIASES,
  type Detachment,
} from './detachments';

// Objectives
export {
  FALLBACK_SECONDARY_OBJECTIVES,
  FALLBACK_PRIMARY_OBJECTIVES,
  FALLBACK_OBJECTIVE_ALIASES,
  type SecondaryObjective,
  type PrimaryObjective,
} from './objectives';

// Units
export {
  UNIT_ALIASES,
  CHARACTER_TYPE_PATTERNS,
  UNIT_WITH_WEAPON_PATTERN,
  GENERIC_WORDS,
  GAME_MECHANICS_BLOCKLIST,
} from './units';
