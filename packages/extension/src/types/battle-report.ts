import type { UnitStats } from './bsdata';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface Player {
  name: string;
  faction: string;
  subfaction?: string;  // e.g., "Blood Angels" for Space Marines, "Ulthwé" for Aeldari
  detachment: string;
  confidence: ConfidenceLevel;
}

export interface UnitSuggestion {
  name: string;
  confidence: number; // 0-1 fuzzy match score
  stats?: UnitStats;
  keywords?: string[];
  pointsCost?: number;
}

export interface Unit {
  name: string;
  playerIndex: number; // 0 or 1
  confidence: ConfidenceLevel;
  pointsCost?: number;
  // BSData enrichment fields
  stats?: UnitStats;
  keywords?: string[];
  isValidated?: boolean;
  // Suggestion for non-validated units
  suggestedMatch?: UnitSuggestion;
  videoTimestamp?: number; // seconds in video when first mentioned
  mentionCount?: number; // how many times mentioned throughout video
}

export interface Stratagem {
  name: string;
  playerIndex?: number;
  confidence: ConfidenceLevel;
  videoTimestamp?: number; // seconds in video when used
}

export interface Enhancement {
  name: string;
  playerIndex?: number;
  pointsCost?: number;
  detachment?: string;
  confidence: ConfidenceLevel;
  videoTimestamp?: number; // seconds in video when mentioned
}

export interface BattleReport {
  players: [Player, Player] | [Player];
  units: Unit[];
  stratagems: Stratagem[];
  enhancements?: Enhancement[];
  mission?: string;
  pointsLimit?: number;
  extractedAt: number; // timestamp
}

export interface BattleReportState {
  data: BattleReport | null;
  loading: boolean;
  error: string | null;
  videoId: string | null;
}
