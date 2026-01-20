/**
 * Alias-based matcher - highest priority, fastest lookup.
 * Directly looks up terms in a pre-built alias map.
 */

import type { TermMatcher, MatchResult } from './types';

export class AliasMatcher implements TermMatcher {
  readonly name = 'alias';
  readonly priority = 100; // Highest priority

  constructor(private readonly aliases: Map<string, string>) {}

  match(term: string, _candidates: string[]): MatchResult | null {
    const lower = term.toLowerCase().trim();
    const canonical = this.aliases.get(lower);

    if (canonical) {
      return {
        term,
        canonical,
        confidence: 1.0, // Direct alias match is 100% confidence
        matcherUsed: this.name,
      };
    }

    return null;
  }

  /**
   * Create a new AliasMatcher with an updated alias map.
   * Immutable update pattern for thread safety.
   */
  withAliases(additionalAliases: Map<string, string>): AliasMatcher {
    const merged = new Map(this.aliases);
    for (const [key, value] of additionalAliases) {
      merged.set(key.toLowerCase(), value);
    }
    return new AliasMatcher(merged);
  }
}
