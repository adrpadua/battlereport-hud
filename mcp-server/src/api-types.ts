/**
 * Shared API Response Types
 *
 * These types define the shape of HTTP API responses from the MCP server.
 * They serve as a single source of truth for both the server and any clients (e.g., the extension).
 */

// ============================================================================
// Unit Types
// ============================================================================

export interface UnitStatsResponse {
  movement: string | null;
  toughness: number | null;
  save: string | null;
  invulnerableSave: string | null;
  wounds: number | null;
  leadership: number | null;
  objectiveControl: number | null;
}

export interface WeaponResponse {
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

export interface AbilityResponse {
  name: string;
  type: string;
  description: string | null;
}

export interface UnitResponse {
  unit: {
    name: string;
    faction: string;
    stats: UnitStatsResponse;
    pointsCost: number | null;
    composition: string | null;
    wargearOptions: string | null;
    leaderInfo: string | null;
    ledBy: string | null;
    transportCapacity: string | null;
    isEpicHero: boolean | null;
    isBattleline: boolean | null;
  };
  weapons: WeaponResponse[];
  abilities: AbilityResponse[];
  keywords: string[];
}

export interface UnitSearchResult {
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

export interface UnitSearchResponse {
  count: number;
  units: UnitSearchResult[];
}

// ============================================================================
// Stratagem Types
// ============================================================================

export interface StratagemResponse {
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

export interface StratagemDetailResponse {
  stratagem: StratagemResponse;
}

export interface StratagemListItem {
  name: string;
  cpCost: string;
  phase: string;
  when: string | null;
  target: string | null;
  effect: string;
  detachment: string | null;
}

export interface StratagemSearchResponse {
  faction: string;
  count: number;
  stratagems: StratagemListItem[];
}

// ============================================================================
// Enhancement Types
// ============================================================================

export interface EnhancementResponse {
  name: string;
  pointsCost: number;
  description: string;
  restrictions: string | null;
  detachment: string | null;
}

export interface EnhancementDetailItem extends EnhancementResponse {
  faction: string;
}

export interface EnhancementDetailResponse {
  enhancement: EnhancementDetailItem;
}

export interface EnhancementSearchResponse {
  faction: string;
  count: number;
  enhancements: EnhancementResponse[];
}

// ============================================================================
// Validation Types
// ============================================================================

export type ValidationCategory =
  | 'units'
  | 'stratagems'
  | 'abilities'
  | 'factions'
  | 'detachments'
  | 'enhancements'
  | 'keywords'
  | 'weapons';

export interface ValidateTermResult {
  input: string;
  match: string | null;
  category: ValidationCategory | null;
  faction: string | null;
  confidence: number;
  alternates: Array<{ name: string; confidence: number }>;
}

export interface ValidateTermsResponse {
  results: ValidateTermResult[];
  processed: number;
  matched: number;
}

export interface ListValidNamesResponse {
  category: string;
  faction: string | null;
  names: string[];
  count: number;
  aliases?: Record<string, string>;
}

export interface FuzzySearchMatch {
  name: string;
  category: ValidationCategory;
  faction: string | null;
  confidence: number;
}

export interface FuzzySearchResponse {
  query: string;
  matches: FuzzySearchMatch[];
}

export interface ResolveTermCandidate {
  name: string;
  faction: string | null;
  category: ValidationCategory;
  relevance: number;
}

export interface ResolveTermResponse {
  term: string;
  ambiguous: boolean;
  candidates: ResolveTermCandidate[];
  recommendation: string | null;
}

// ============================================================================
// Objectives Types
// ============================================================================

export interface ObjectivesResponse {
  primaryMissions: string[];
  secondaryObjectives: string[];
  gambits: string[];
  aliases: Record<string, string>;
}

export interface MissionResponse {
  mission: {
    id: number;
    name: string;
    slug: string;
    missionType: string;
    description: string | null;
    primaryObjective: string | null;
    rules: string | null;
    missionPackId: number | null;
  };
}

export interface SecondaryObjectiveResponse {
  objective: {
    id: number;
    name: string;
    slug: string;
    category: string;
    description: string | null;
    scoringMethod: string | null;
    missionPackId: number | null;
  };
}

// ============================================================================
// Rules Types
// ============================================================================

/**
 * Compact rule reference for index (minimal token usage)
 */
export interface RuleReference {
  slug: string;
  title: string;
  category: string;
  subcategory: string | null;
}

/**
 * Full rule content
 */
export interface RuleContent extends RuleReference {
  content: string;
  orderIndex: number | null;
}

/**
 * Category with count and rules
 */
export interface RuleCategorySummary {
  category: string;
  count: number;
  rules: RuleReference[];
}

/**
 * Response for GET /api/rules/index
 */
export interface RulesIndexResponse {
  totalRules: number;
  categoryCount: number;
  categories: RuleCategorySummary[];
}

/**
 * Response for GET /api/rules/:slug
 */
export interface RuleDetailResponse {
  rule: RuleContent;
}

/**
 * Response for GET /api/rules/category/:category
 */
export interface RulesCategoryResponse {
  category: string;
  count: number;
  rules: RuleContent[];
}

/**
 * Response for GET /api/rules/game-terms
 */
export interface GameTermsResponse {
  terms: string[];
  count: number;
  categories: string[];
}

/**
 * Response for GET /api/rules/phases
 */
export interface RulesPhasesResponse {
  totalRules: number;
  categories: Record<string, RuleContent[]>;
}

// ============================================================================
// Common Types
// ============================================================================

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export interface ErrorResponse {
  error: string;
}
