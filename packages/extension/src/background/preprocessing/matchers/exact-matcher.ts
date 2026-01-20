/**
 * Exact match matcher - case-insensitive exact string matching.
 */

import type { TermMatcher, MatchResult } from './types';

export class ExactMatcher implements TermMatcher {
  readonly name = 'exact';
  readonly priority = 90; // Second highest priority

  match(term: string, candidates: string[]): MatchResult | null {
    const lower = term.toLowerCase().trim();

    const exactMatch = candidates.find(
      (candidate) => candidate.toLowerCase() === lower
    );

    if (exactMatch) {
      return {
        term,
        canonical: exactMatch,
        confidence: 1.0,
        matcherUsed: this.name,
      };
    }

    return null;
  }
}
