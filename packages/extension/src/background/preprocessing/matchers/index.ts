/**
 * Matcher factory and chain of responsibility implementation.
 * Exports all matchers and provides utilities for building matcher chains.
 */

import type { TermMatcher, MatchResult } from './types';
import type { PhoneticIndex } from '@/utils/phonetic-matcher';
import { MATCHING_THRESHOLDS } from '@/data/constants';
import { AliasMatcher } from './alias-matcher';
import { ExactMatcher } from './exact-matcher';
import { FuzzyMatcher } from './fuzzy-matcher';
import { PhoneticMatcher } from './phonetic-matcher';

// Re-export types and matchers
export type { TermMatcher, MatchResult };
export { AliasMatcher, ExactMatcher, FuzzyMatcher, PhoneticMatcher };

/**
 * Options for building a matcher chain.
 */
export interface MatcherChainOptions {
  /** Alias map for direct lookups */
  aliases?: Map<string, string>;
  /** Phonetic index for phonetic matching */
  phoneticIndex?: PhoneticIndex | null;
  /** Minimum similarity for fuzzy matching */
  fuzzyThreshold?: number;
  /** Minimum confidence for phonetic matching */
  phoneticThreshold?: number;
  /** Whether to include fallback phonetic matcher */
  includePhoneticFallback?: boolean;
}

/**
 * Build a standard matcher chain with all matchers.
 * Order: alias -> exact -> phonetic -> fuzzy -> phonetic fallback
 */
export function buildMatcherChain(options: MatcherChainOptions = {}): TermMatcher[] {
  const {
    aliases = new Map(),
    phoneticIndex = null,
    fuzzyThreshold = MATCHING_THRESHOLDS.FUZZY_HIGH_CONFIDENCE,
    phoneticThreshold = MATCHING_THRESHOLDS.PHONETIC_HIGH_CONFIDENCE,
    includePhoneticFallback = true,
  } = options;

  const matchers: TermMatcher[] = [
    new AliasMatcher(aliases),
    new ExactMatcher(),
  ];

  // Add phonetic matcher if index is available
  if (phoneticIndex) {
    matchers.push(new PhoneticMatcher(phoneticIndex, phoneticThreshold, 70));
  }

  // Always add fuzzy matcher
  matchers.push(new FuzzyMatcher(fuzzyThreshold));

  // Add fallback phonetic matcher with lower threshold
  if (phoneticIndex && includePhoneticFallback) {
    matchers.push(
      new PhoneticMatcher(
        phoneticIndex,
        MATCHING_THRESHOLDS.PHONETIC_LOW_CONFIDENCE,
        40
      )
    );
  }

  return matchers;
}

/**
 * Find the best match using a chain of matchers.
 * Matchers are tried in priority order (highest first).
 *
 * @param term The term to match
 * @param candidates List of canonical candidate names
 * @param matchers Array of matchers to try
 * @param minConfidence Minimum confidence for a match to be accepted
 * @returns MatchResult if found, null otherwise
 */
export function findBestMatchWithChain(
  term: string,
  candidates: string[],
  matchers: TermMatcher[],
  minConfidence: number = MATCHING_THRESHOLDS.FUZZY_LOW_CONFIDENCE
): MatchResult | null {
  // Sort by priority (highest first)
  const sortedMatchers = [...matchers].sort((a, b) => b.priority - a.priority);

  for (const matcher of sortedMatchers) {
    const result = matcher.match(term, candidates);
    if (result && result.confidence >= minConfidence) {
      return result;
    }
  }

  return null;
}

/**
 * Simple function that uses the default matcher chain.
 * Convenience wrapper for common use cases.
 */
export function findBestMatch(
  term: string,
  candidates: string[],
  aliases: Map<string, string>,
  minSimilarity: number = MATCHING_THRESHOLDS.FUZZY_MEDIUM_CONFIDENCE,
  phoneticIndex?: PhoneticIndex | null
): string | null {
  const matchers = buildMatcherChain({
    aliases,
    phoneticIndex: phoneticIndex ?? null,
    fuzzyThreshold: minSimilarity,
  });

  const result = findBestMatchWithChain(term, candidates, matchers, minSimilarity);
  return result?.canonical ?? null;
}
