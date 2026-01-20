/**
 * Phonetic matcher wrapper - handles YouTube speech-to-text mishearings.
 * Wraps the phonetic-matcher utility.
 */

import type { TermMatcher, MatchResult } from './types';
import type { PhoneticIndex } from '@/utils/phonetic-matcher';
import { findPhoneticMatches } from '@/utils/phonetic-matcher';
import { MATCHING_THRESHOLDS } from '@/data/constants';

export class PhoneticMatcher implements TermMatcher {
  readonly name = 'phonetic';
  readonly priority: number;
  private readonly minConfidence: number;

  constructor(
    private readonly phoneticIndex: PhoneticIndex | null,
    minConfidence: number = MATCHING_THRESHOLDS.PHONETIC_HIGH_CONFIDENCE,
    priority: number = 70
  ) {
    this.minConfidence = minConfidence;
    this.priority = priority;
  }

  match(term: string, _candidates: string[]): MatchResult | null {
    if (!this.phoneticIndex) {
      return null;
    }

    const matches = findPhoneticMatches(
      term,
      this.phoneticIndex,
      1,
      this.minConfidence
    );

    const bestMatch = matches[0];
    if (bestMatch && bestMatch.confidence >= this.minConfidence) {
      return {
        term,
        canonical: bestMatch.term,
        confidence: bestMatch.confidence,
        matcherUsed: this.name,
      };
    }

    return null;
  }

  /**
   * Create a new PhoneticMatcher with a different threshold.
   */
  withThreshold(minConfidence: number): PhoneticMatcher {
    return new PhoneticMatcher(this.phoneticIndex, minConfidence, this.priority);
  }

  /**
   * Create a lower-priority fallback phonetic matcher with lower threshold.
   */
  asFallback(): PhoneticMatcher {
    return new PhoneticMatcher(
      this.phoneticIndex,
      MATCHING_THRESHOLDS.PHONETIC_LOW_CONFIDENCE,
      40 // Lower priority than fuzzy
    );
  }
}
