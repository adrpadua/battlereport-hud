/**
 * Types for the matcher strategy pattern.
 */

/**
 * Result of a term match attempt
 */
export interface MatchResult {
  term: string;
  canonical: string;
  confidence: number;
  matcherUsed: string;
}

/**
 * Interface for term matchers implementing the strategy pattern.
 * Each matcher has a priority and attempts to match a term against candidates.
 */
export interface TermMatcher {
  /** Unique name for this matcher (for debugging/logging) */
  readonly name: string;
  /** Priority for this matcher (higher = tried first) */
  readonly priority: number;
  /**
   * Attempt to match a term against a list of candidates.
   * @param term The term to match
   * @param candidates List of canonical candidate names
   * @returns MatchResult if a match is found, null otherwise
   */
  match(term: string, candidates: string[]): MatchResult | null;
}
