/**
 * Types for the unit detail modal that displays Wahapedia-style datasheets.
 */

export interface UnitDetailStats {
  movement: string | null;
  toughness: number | null;
  save: string | null;
  invulnerableSave: string | null;
  wounds: number | null;
  leadership: number | null;
  objectiveControl: number | null;
}

export interface UnitDetailWeapon {
  name: string;
  type: 'ranged' | 'melee';
  range: string | null;
  attacks: string | null;
  skill: string | null;
  strength: string | null;
  ap: string | null;
  damage: string | null;
  abilities: string | null;
}

export interface UnitDetailAbility {
  name: string;
  type: 'core' | 'faction' | 'unit' | 'wargear';
  description: string | null;
}

export interface UnitDetailUnit {
  name: string;
  faction: string;
  stats: UnitDetailStats;
  pointsCost: number | null;
  composition: string | null;
  wargearOptions: string | null;
  leaderInfo: string | null;
  ledBy: string | null;
  isEpicHero: boolean | null;
  isBattleline: boolean | null;
}

export interface UnitDetailResponse {
  unit: UnitDetailUnit;
  weapons: UnitDetailWeapon[];
  abilities: UnitDetailAbility[];
  keywords: string[];
}
