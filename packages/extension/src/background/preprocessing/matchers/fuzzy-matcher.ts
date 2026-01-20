/**
 * Fuzzy string matcher using Sorensen-Dice coefficient.
 * Handles typos and similar strings.
 */

import type { TermMatcher, MatchResult } from './types';
import { MATCHING_THRESHOLDS } from '@/data/constants';

/**
 * Calculate similarity score between two strings (0-1).
 * Uses a combination of character overlap and Sorensen-Dice coefficient on bigrams.
 */
export function calculateSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bLower = b.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (aLower === bLower) return 1;
  if (aLower.length === 0 || bLower.length === 0) return 0;

  // Check if one contains the other
  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    const minLen = Math.min(aLower.length, bLower.length);
    const maxLen = Math.max(aLower.length, bLower.length);
    return minLen / maxLen;
  }

  // Character-based similarity (Sorensen-Dice coefficient on bigrams)
  const aBigrams = new Set<string>();
  const bBigrams = new Set<string>();

  for (let i = 0; i < aLower.length - 1; i++) {
    aBigrams.add(aLower.slice(i, i + 2));
  }
  for (let i = 0; i < bLower.length - 1; i++) {
    bBigrams.add(bLower.slice(i, i + 2));
  }

  let intersection = 0;
  for (const bigram of aBigrams) {
    if (bBigrams.has(bigram)) intersection++;
  }

  return (2 * intersection) / (aBigrams.size + bBigrams.size);
}

export class FuzzyMatcher implements TermMatcher {
  readonly name = 'fuzzy';
  readonly priority = 60;
  private readonly minSimilarity: number;

  constructor(minSimilarity: number = MATCHING_THRESHOLDS.FUZZY_MEDIUM_CONFIDENCE) {
    this.minSimilarity = minSimilarity;
  }

  match(term: string, candidates: string[]): MatchResult | null {
    const lower = term.toLowerCase().trim();

    // First check contains match
    const containsMatch = candidates.find(
      (candidate) =>
        candidate.toLowerCase().includes(lower) ||
        lower.includes(candidate.toLowerCase())
    );

    if (containsMatch) {
      const score = calculateSimilarity(term, containsMatch);
      if (score >= this.minSimilarity) {
        return {
          term,
          canonical: containsMatch,
          confidence: score,
          matcherUsed: this.name,
        };
      }
    }

    // Fuzzy match using similarity score
    let bestMatch: string | null = null;
    let bestScore = this.minSimilarity;

    for (const candidate of candidates) {
      const score = calculateSimilarity(term, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    if (bestMatch) {
      return {
        term,
        canonical: bestMatch,
        confidence: bestScore,
        matcherUsed: this.name,
      };
    }

    return null;
  }

  /**
   * Create a new FuzzyMatcher with a different threshold.
   */
  withThreshold(minSimilarity: number): FuzzyMatcher {
    return new FuzzyMatcher(minSimilarity);
  }
}
