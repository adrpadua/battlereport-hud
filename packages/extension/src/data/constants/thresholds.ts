/**
 * Centralized matching thresholds used across the preprocessing pipeline.
 * Consolidates magic numbers into named constants for consistency.
 */
export const MATCHING_THRESHOLDS = {
  /** High confidence fuzzy match (0.75) - used for reliable matches */
  FUZZY_HIGH_CONFIDENCE: 0.75,
  /** Medium confidence fuzzy match (0.7) - default minimum for fuzzy matching */
  FUZZY_MEDIUM_CONFIDENCE: 0.7,
  /** Low confidence fuzzy match (0.6) - for broader matching */
  FUZZY_LOW_CONFIDENCE: 0.6,
  /** High confidence phonetic match (0.5) - primary phonetic threshold */
  PHONETIC_HIGH_CONFIDENCE: 0.5,
  /** Low confidence phonetic match (0.4) - fallback phonetic threshold */
  PHONETIC_LOW_CONFIDENCE: 0.4,
  /** Very high confidence for categorization (0.8) */
  CATEGORIZATION_CONFIDENCE: 0.8,
} as const;

export type MatchingThreshold = typeof MATCHING_THRESHOLDS[keyof typeof MATCHING_THRESHOLDS];
