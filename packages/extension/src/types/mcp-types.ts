/**
 * MCP API Response Types
 *
 * Re-exports types from the shared api-types module for backwards compatibility.
 * Extension-specific types that are not from the API are defined here.
 */

// Re-export from shared types with Mcp prefix for backwards compatibility
export type {
  UnitStatsResponse as McpUnitStats,
  WeaponResponse as McpWeapon,
  AbilityResponse as McpAbility,
  UnitResponse as McpUnitResponse,
  UnitSearchResult as McpUnitSearchResult,
  UnitSearchResponse as McpUnitSearchResponse,
  StratagemResponse as McpStratagem,
  StratagemDetailResponse as McpStratagemResponse,
  StratagemSearchResponse as McpStratagemSearchResponse,
  EnhancementResponse as McpEnhancement,
  EnhancementSearchResponse as McpEnhancementResponse,
  HealthResponse as McpHealthResponse,
  ErrorResponse as McpErrorResponse,
  ObjectivesResponse as McpObjectivesResponse,
  ValidateTermsResponse as McpValidateTermsResponse,
  ValidateTermResult as McpValidateTermResult,
  FuzzySearchResponse as McpFuzzySearchResponse,
  ResolveTermResponse as McpResolveTermResponse,
} from '@mcp/types';

/**
 * Extension-specific types (not from API)
 */

import type { WeaponResponse, AbilityResponse } from '@mcp/types';

export interface EnhancedUnitData {
  weapons: WeaponResponse[];
  abilities: AbilityResponse[];
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
