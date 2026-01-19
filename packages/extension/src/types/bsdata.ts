export interface UnitStats {
  movement: string;
  toughness: number;
  save: string;
  wounds: number;
  leadership: string;
  objectiveControl: number;
}

export interface WeaponProfile {
  name: string;
  type: 'ranged' | 'melee';
  range: string;
  attacks: string;
  skill: string;
  strength: number;
  ap: number;
  damage: string;
  keywords?: string[];
}

export interface UnitData {
  name: string;
  canonicalName: string; // Lowercase, normalized
  stats: UnitStats | null;
  weapons: WeaponProfile[];
  abilities: string[];
  keywords: string[];
  pointsCost: number | null;
}

export interface FactionData {
  id: string;
  name: string;
  units: UnitData[];
}

export interface FactionIndex {
  factions: {
    id: string;
    name: string;
    aliases: string[];
    unitCount: number;
  }[];
}
