/**
 * MCP API Response Types
 * Types for the HTTP API responses from the MCP server
 */

export interface McpUnitStats {
  movement: string | null;
  toughness: number | null;
  save: string | null;
  invulnerableSave: string | null;
  wounds: number | null;
  leadership: number | null;
  objectiveControl: number | null;
}

export interface McpWeapon {
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

export interface McpAbility {
  name: string;
  type: string; // 'core' | 'faction' | 'unit' | 'wargear'
  description: string;
}

export interface McpUnitResponse {
  unit: {
    name: string;
    faction: string;
    stats: McpUnitStats;
    pointsCost: number | null;
    composition: string | null;
    wargearOptions: string | null;
    leaderInfo: string | null;
    ledBy: string | null;
    transportCapacity: string | null;
    isEpicHero: boolean | null;
    isBattleline: boolean | null;
  };
  weapons: McpWeapon[];
  abilities: McpAbility[];
  keywords: string[];
}

export interface McpUnitSearchResult {
  name: string;
  faction: string;
  movement: string | null;
  toughness: number | null;
  save: string | null;
  wounds: number | null;
  leadership: number | null;
  objectiveControl: number | null;
  pointsCost: number | null;
}

export interface McpUnitSearchResponse {
  count: number;
  units: McpUnitSearchResult[];
}

export interface McpStratagem {
  name: string;
  cpCost: string;
  phase: string;
  when: string | null;
  target: string | null;
  effect: string;
  restrictions: string | null;
  detachment: string | null;
  faction: string | null;
}

export interface McpStratagemResponse {
  stratagem: McpStratagem;
}

export interface McpStratagemSearchResponse {
  faction: string;
  count: number;
  stratagems: Omit<McpStratagem, 'faction' | 'restrictions'>[];
}

export interface McpEnhancement {
  name: string;
  pointsCost: number;
  description: string;
  restrictions: string | null;
  detachment: string | null;
}

export interface McpEnhancementResponse {
  faction: string;
  count: number;
  enhancements: McpEnhancement[];
}

export interface McpHealthResponse {
  status: 'ok';
  timestamp: string;
}

export interface McpErrorResponse {
  error: string;
}

/**
 * Enhanced entity data combining BSData with MCP data
 */
export interface EnhancedUnitData {
  weapons: McpWeapon[];
  abilities: McpAbility[];
  mcpFetched: boolean;
}

export interface EnhancedStratagemData {
  cpCost: string;
  phase: string;
  when: string | null;
  target: string | null;
  effect: string;
  detachment: string | null;
  mcpFetched: boolean;
}
