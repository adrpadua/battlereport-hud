/**
 * Shared type definitions for the preprocessing pipeline.
 */

import type { TranscriptSegment } from '@/types/youtube';

/**
 * Term types for categorization
 */
export type TermType = 'faction' | 'detachment' | 'stratagem' | 'objective' | 'unit' | 'enhancement' | 'unknown';

/**
 * Result of matching a term to a canonical name
 */
export interface MatchResult {
  term: string;
  canonical: string;
  confidence: number;
  matcherUsed: string;
}

/**
 * A detected term match in the transcript
 */
export interface TermMatch {
  term: string;
  normalizedTerm: string;
  type: TermType;
  timestamp: number; // seconds
  segmentText: string; // original text for context
}

/**
 * A transcript segment with normalized and tagged text
 */
export interface NormalizedSegment extends TranscriptSegment {
  normalizedText: string; // Text with colloquial terms replaced by official names
  taggedText: string; // Text with gameplay terms tagged: [UNIT:Name] or [STRAT:Name]
}

/**
 * Result of scanning text for phonetic matches
 */
export interface PhoneticScanResult {
  originalPhrase: string;
  matchedTerm: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Complete result of preprocessing a transcript
 */
export interface PreprocessedTranscript {
  matches: TermMatch[];
  stratagemMentions: Map<string, number[]>; // normalized name -> timestamps
  unitMentions: Map<string, number[]>;
  objectiveMentions: Map<string, number[]>; // objective name -> timestamps
  factionMentions: Map<string, number[]>; // faction name -> timestamps
  detachmentMentions: Map<string, number[]>; // detachment name -> timestamps
  enhancementMentions: Map<string, number[]>; // enhancement name -> timestamps
  normalizedSegments: NormalizedSegment[]; // Segments with corrected/tagged terms (deduped)
  colloquialToOfficial: Map<string, string>; // Mapping of corrections made
}

/**
 * Configuration options for preprocessing
 */
export interface PreprocessingOptions {
  /** Preprocessing mode: 'basic' (sync), 'llm' (with mappings), 'full' (async with generated aliases) */
  mode: 'basic' | 'llm' | 'full';
  /** List of official unit names from BSData */
  unitNames: string[];
  /** Optional faction IDs for loading generated aliases (full mode only) */
  factionIds?: string[];
  /** Optional LLM-provided term mappings */
  llmMappings?: Record<string, string>;
  /** Whether to detect objectives */
  detectObjectives?: boolean;
  /** Whether to detect factions */
  detectFactions?: boolean;
  /** Whether to detect detachments */
  detectDetachments?: boolean;
}

/**
 * Internal context passed through the preprocessing pipeline
 */
export interface PipelineContext {
  /** The deduped transcript segments */
  segments: TranscriptSegment[];
  /** Combined alias map (unit aliases + LLM mappings) */
  aliases: Map<string, string>;
  /** Phonetic index for unit names (null if no unit names provided) */
  phoneticIndex: import('@/utils/phonetic-matcher').PhoneticIndex | null;
  /** Configuration options */
  options: PreprocessingOptions;
  /** Accumulated results */
  results: {
    matches: TermMatch[];
    stratagemMentions: Map<string, number[]>;
    unitMentions: Map<string, number[]>;
    objectiveMentions: Map<string, number[]>;
    factionMentions: Map<string, number[]>;
    detachmentMentions: Map<string, number[]>;
    enhancementMentions: Map<string, number[]>;
    normalizedSegments: NormalizedSegment[];
    colloquialToOfficial: Map<string, string>;
  };
}

/**
 * A replacement to apply to text
 */
export interface TextReplacement {
  original: string;
  official: string;
  type: TermType;
}

/**
 * Objectives API response type
 */
export interface ObjectivesApiResponse {
  primaryMissions: string[];
  secondaryObjectives: string[];
  gambits: string[];
  aliases: Record<string, string>;
}

// ============================================================================
// GameExtraction - Unified output for all consumers
// ============================================================================

/**
 * Player information from AI extraction.
 */
export interface PlayerInfo {
  name: string;
  faction: string;
  subfaction?: string;  // e.g., "Blood Angels" for Space Marines
  factionId?: string;
  detachment: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Entity mentions with all timestamps and metadata.
 * Used for units, stratagems, and enhancements.
 */
export interface EntityMentions {
  canonicalName: string;
  timestamps: number[];
  mentionCount: number;
  isValidated: boolean;
  source: 'preprocessed' | 'ai-discovered';
  // Optional enrichment data (for units)
  stats?: import('@/types/bsdata').UnitStats;
  weapons?: import('@/types/bsdata').WeaponProfile[];
  keywords?: string[];
  pointsCost?: number;
  suggestedMatch?: {
    name: string;
    confidence: number;
  };
}

/**
 * Entity-to-player assignments from AI.
 * Maps entity canonical name (lowercase) to playerIndex (0 or 1).
 */
export interface EntityAssignments {
  units: Map<string, { playerIndex: number; confidence: 'high' | 'medium' | 'low' }>;
  stratagems: Map<string, { playerIndex?: number; confidence: 'high' | 'medium' | 'low' }>;
  enhancements: Map<string, { playerIndex?: number; pointsCost?: number; confidence: 'high' | 'medium' | 'low' }>;
}

/**
 * Complete game extraction result.
 * Single source of truth for all consumers (HUD, narrator, web app).
 */
export interface GameExtraction {
  // Player identification (from AI)
  players: [PlayerInfo, PlayerInfo] | [PlayerInfo];

  // Entity mentions with ALL timestamps (from preprocessing)
  units: Map<string, EntityMentions>;
  stratagems: Map<string, EntityMentions>;
  enhancements: Map<string, EntityMentions>;

  // Entity-to-player assignments (from AI)
  assignments: EntityAssignments;

  // Tagged transcript segments
  segments: NormalizedSegment[];

  // Additional detections
  factions: Map<string, number[]>;
  detachments: Map<string, number[]>;
  objectives: Map<string, number[]>;

  // Game info (from AI)
  mission?: string;
  pointsLimit?: number;

  // Metadata
  videoId: string;
  extractedAt: number;
  processingTimeMs: number;
}

/**
 * Options for the unified extractGame function.
 */
// ============================================================================
// Pipeline Stage Artifacts - Visibility into extraction progress
// ============================================================================

/**
 * Individual stage artifact capturing timing and results.
 */
export interface StageArtifact {
  stage: number;
  name: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  summary: string;
  details?: Record<string, unknown>;
  error?: string;
}

/**
 * Complete collection of pipeline artifacts.
 */
export interface PipelineArtifacts {
  videoId: string;
  stages: StageArtifact[];
  totalDurationMs?: number;
}

/**
 * Stage names for the extraction pipeline.
 */
export type PipelineStageName =
  | 'load-factions'
  | 'llm-preprocess'
  | 'pattern-preprocess'
  | 'ai-assignment'
  | 'build-result';

export interface ExtractGameOptions {
  videoId: string;
  title: string;
  description: string;
  channel: string;
  pinnedComment?: string;
  transcript: import('@/types/youtube').TranscriptSegment[];
  chapters: import('@/types/youtube').Chapter[];
  factions: [string, string];
  apiKey: string;
  /** Skip LLM preprocessing (pattern matching only) */
  skipLlmPreprocessing?: boolean;
  /** Pre-computed LLM mappings from cache */
  cachedLlmMappings?: Record<string, string>;
  /** Callback invoked when a pipeline stage completes */
  onStageComplete?: (artifact: StageArtifact) => void;
}
