/**
 * Re-export all preprocessing phases.
 */

// Deduplication
export { deduplicateSegments } from './deduplication';

// Text normalization
export {
  escapeRegex,
  normalizeTerm,
  applyNormalization,
  applyTagging,
  buildTermPattern,
  toCanonicalName,
  buildCasePreservingAliases,
} from './text-normalization';

// Term detection
export {
  categorizeTermType,
  normalizeUnitName,
  addDynamicAliases,
  buildFuzzyUnitAliasesSync,
  detectTermsInText,
  setDynamicObjectives,
  getAllObjectives,
  getObjectiveAliases,
  type TermDetectionResult,
} from './term-detection';

// Phonetic scanning
export {
  extractNgrams,
  scanForPhoneticMatches,
  applyPhoneticReplacements,
  processPhoneticResults,
} from './phonetic-scanning';

// LLM mapping
export {
  applyLlmMappings,
  mergeLlmMappingsIntoAliases,
} from './llm-mapping';
