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
  strength: string;
  ap: string;
  damage: string;
  abilities?: string | null;
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

export interface AllyGroup {
  name: string;
  flagId: string;
  units: string[]; // Unit names that require this ally flag
}

export interface DetachmentUnits {
  [detachmentName: string]: string[]; // Detachment name -> list of available unit names
}

export interface FactionData {
  id: string;
  name: string;
  units: UnitData[];
  coreUnits?: string[]; // Units always available regardless of detachment
  allyGroups?: AllyGroup[]; // Groups of allied units with their enabling flags
  detachmentUnits?: DetachmentUnits; // Pre-computed unit lists per detachment
}

export interface FactionIndex {
  factions: {
    id: string;
    name: string;
    aliases: string[];
    unitCount: number;
  }[];
}
