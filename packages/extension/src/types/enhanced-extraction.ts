/**
 * Unified output types for the enhanced preprocessing pipeline.
 * These types represent the final output that the HUD can directly consume.
 */

import type { ConfidenceLevel } from './battle-report';
import type { UnitStats } from './bsdata';
import type { TermMatch, NormalizedSegment } from '@/background/preprocessing/types';

/**
 * Extracted player information with faction and detachment.
 */
export interface ExtractedPlayer {
  name: string;
  faction: string;
  factionId?: string; // Normalized faction ID (e.g., 'space-marines')
  detachment?: string;
  confidence: ConfidenceLevel;
}

/**
 * Extracted unit with all timestamps and BSData enrichment.
 */
export interface ExtractedUnit {
  name: string;
  canonicalName: string; // Official name from BSData
  playerIndex: number; // 0 or 1
  confidence: ConfidenceLevel;
  pointsCost?: number;
  videoTimestamps: number[]; // All mentions in video (seconds)
  mentionCount: number;
  // BSData enrichment
  stats?: UnitStats;
  keywords?: string[];
  isValidated: boolean;
  // Suggestion for unvalidated units
  suggestedMatch?: {
    name: string;
    confidence: number;
  };
}

/**
 * Extracted stratagem with usage context.
 */
export interface ExtractedStratagem {
  name: string;
  canonicalName: string;
  playerIndex?: number;
  confidence: ConfidenceLevel;
  videoTimestamps: number[]; // When used in the game
  mentionCount: number;
  cpCost?: number;
  phase?: string; // e.g., 'Command', 'Movement', 'Shooting'
}

/**
 * Extracted enhancement (relic, wargear upgrade).
 */
export interface ExtractedEnhancement {
  name: string;
  canonicalName: string;
  playerIndex?: number;
  pointsCost?: number;
  detachment?: string;
  confidence: ConfidenceLevel;
  videoTimestamps: number[];
  mentionCount: number;
}

/**
 * Preprocessing artifacts for debugging and analysis.
 */
export interface PreprocessingArtifacts {
  /** All term matches found during preprocessing */
  termMatches: TermMatch[];
  /** Colloquial term -> official name mappings applied */
  colloquialMappings: Map<string, string>;
  /** LLM-provided term corrections */
  llmMappings: Record<string, string>;
  /** Normalized transcript segments with tagged terms */
  normalizedSegments: NormalizedSegment[];
  /** Faction mentions with timestamps */
  factionMentions: Map<string, number[]>;
  /** Detachment mentions with timestamps */
  detachmentMentions: Map<string, number[]>;
  /** Objective mentions with timestamps */
  objectiveMentions: Map<string, number[]>;
}

/**
 * Main output type for the enhanced preprocessing pipeline.
 * This is the HUD-ready data structure that combines preprocessing
 * detection with AI player assignment.
 */
export interface EnhancedExtractionResult {
  // AI-inferred player and assignment data
  players: [ExtractedPlayer, ExtractedPlayer] | [ExtractedPlayer];
  units: ExtractedUnit[];
  stratagems: ExtractedStratagem[];
  enhancements: ExtractedEnhancement[];

  // Game information
  mission?: string;
  pointsLimit?: number;

  // Preprocessing artifacts (for debugging/enrichment)
  preprocessingData: PreprocessingArtifacts;

  // Metadata
  extractedAt: number; // timestamp
  processingTimeMs: number;
  videoId: string;
}

/**
 * Input options for the enhanced pipeline.
 */
export interface EnhancedPipelineOptions {
  /** Video data including transcript, chapters, metadata */
  videoId: string;
  title: string;
  description: string;
  channel: string;
  pinnedComment?: string;
  transcript: import('./youtube').TranscriptSegment[];
  chapters: import('./youtube').Chapter[];

  /** Selected factions (from user selection or auto-detection) */
  selectedFactions: [string, string];

  /** OpenAI API key for LLM preprocessing and assignment */
  apiKey: string;

  /** Optional: Skip LLM preprocessing (use pattern matching only) */
  skipLlmPreprocessing?: boolean;

  /** Optional: Pre-computed LLM mappings (for caching) */
  cachedLlmMappings?: Record<string, string>;
}

/**
 * AI assignment request - what the AI model receives.
 * Focuses on player identification and entity assignment.
 */
export interface AIAssignmentRequest {
  /** Video metadata for context */
  videoTitle: string;
  videoChannel: string;
  videoDescription: string;
  pinnedComment?: string;
  chapters: { startTime: number; title: string }[];

  /** Detected entities from preprocessing */
  detectedUnits: {
    name: string;
    timestamps: number[];
    mentionCount: number;
  }[];
  detectedStratagems: {
    name: string;
    timestamps: number[];
    mentionCount: number;
  }[];
  detectedEnhancements: {
    name: string;
    timestamps: number[];
    mentionCount: number;
  }[];

  /** Faction context */
  factions: [string, string];

  /** Relevant transcript excerpts (army list sections, intro) */
  transcriptExcerpts: string;
}

/**
 * AI assignment response - what the AI model returns.
 */
export interface AIAssignmentResponse {
  players: {
    name: string;
    faction: string;
    detachment?: string | null;
    confidence: ConfidenceLevel;
  }[];

  /** Unit to player assignments */
  unitAssignments: {
    name: string;
    playerIndex: number;
    confidence: ConfidenceLevel;
  }[];

  /** Stratagem to player assignments */
  stratagemAssignments: {
    name: string;
    playerIndex?: number;
    confidence: ConfidenceLevel;
  }[];

  /** Enhancement to player assignments */
  enhancementAssignments: {
    name: string;
    playerIndex?: number;
    pointsCost?: number;
    confidence: ConfidenceLevel;
  }[];

  mission?: string | null;
  pointsLimit?: number | null;
}
