/**
 * Preprocessing pipeline public API.
 * All exports from the preprocessing module should go through here.
 */

// Main pipeline functions
export {
  preprocessTranscript,
  preprocessTranscriptSync,
  extractGame,
} from './pipeline';

// Consumer adapters
export {
  toBattleReport,
  toNarratorInput,
  getEntityTimeline,
  getExtractionStats,
  type NarratorInput,
} from './adapters';

// Legacy: Enhanced pipeline (deprecated, use extractGame + toBattleReport instead)
export {
  enhancedPreprocess,
  toHudBattleReport,
} from './enhanced-pipeline';

// Types
export type {
  TermType,
  TermMatch,
  NormalizedSegment,
  PreprocessedTranscript,
  PreprocessingOptions,
  PhoneticScanResult,
  TextReplacement,
  ObjectivesApiResponse,
  MatchResult,
  PipelineContext,
  // GameExtraction types
  GameExtraction,
  ExtractGameOptions,
  EntityMentions,
  EntityAssignments,
  PlayerInfo,
} from './types';

// Cache
export {
  ObjectivesCache,
  getObjectivesCache,
  resetObjectivesCache,
} from './cache/objectives-cache';

// Matchers
export {
  findBestMatch,
  findBestMatchWithChain,
  buildMatcherChain,
  AliasMatcher,
  ExactMatcher,
  FuzzyMatcher,
  PhoneticMatcher,
  type TermMatcher,
  type MatcherChainOptions,
} from './matchers';

// Phases (for advanced use cases)
export {
  deduplicateSegments,
  categorizeTermType,
  normalizeUnitName,
  buildFuzzyUnitAliasesSync,
  detectTermsInText,
  setDynamicObjectives,
  getAllObjectives,
  getObjectiveAliases,
  scanForPhoneticMatches,
  applyPhoneticReplacements,
  extractNgrams,
  applyLlmMappings,
  mergeLlmMappingsIntoAliases,
  buildTermPattern,
  toCanonicalName,
  buildCasePreservingAliases,
  escapeRegex,
  normalizeTerm,
} from './phases';

// Re-export similarity calculation for external use
export { calculateSimilarity } from './matchers/fuzzy-matcher';
