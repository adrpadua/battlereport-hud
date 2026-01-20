/**
 * Phonetic scanning phase.
 * Catches YouTube speech-to-text mishearings using phonetic matching.
 */

import type { PhoneticScanResult, TextReplacement } from '../types';
import type { PhoneticIndex } from '@/utils/phonetic-matcher';
import { findPhoneticMatches } from '@/utils/phonetic-matcher';
import { MATCHING_THRESHOLDS } from '@/data/constants';
import { categorizeTermType } from './term-detection';

/**
 * Extract word n-grams from text for phonetic matching.
 * Returns 1-gram, 2-gram, and 3-gram sequences.
 */
export function extractNgrams(text: string): Array<{ phrase: string; startIndex: number; endIndex: number }> {
  const words = text.split(/\s+/);
  const ngrams: Array<{ phrase: string; startIndex: number; endIndex: number }> = [];

  let currentIndex = 0;
  const wordPositions: Array<{ word: string; start: number; end: number }> = [];

  // Calculate word positions
  for (const word of words) {
    const start = text.indexOf(word, currentIndex);
    const end = start + word.length;
    wordPositions.push({ word, start, end });
    currentIndex = end;
  }

  // Generate n-grams (1 to 3 words)
  for (let n = 1; n <= 3; n++) {
    for (let i = 0; i <= wordPositions.length - n; i++) {
      const startPos = wordPositions[i];
      const endPos = wordPositions[i + n - 1];
      if (startPos && endPos) {
        const phrase = wordPositions.slice(i, i + n).map(p => p.word).join(' ');
        ngrams.push({
          phrase,
          startIndex: startPos.start,
          endIndex: endPos.end,
        });
      }
    }
  }

  return ngrams;
}

/**
 * Scan text for potential phonetic matches against known terms.
 * This catches YouTube mishearings like "neck runs" -> "Necrons".
 *
 * @param text The text to scan
 * @param phoneticIndex Pre-built phonetic index of known terms
 * @param minConfidence Minimum confidence threshold for matches
 * @returns Array of phonetic matches found in the text
 */
export function scanForPhoneticMatches(
  text: string,
  phoneticIndex: PhoneticIndex,
  minConfidence: number = MATCHING_THRESHOLDS.PHONETIC_HIGH_CONFIDENCE
): PhoneticScanResult[] {
  const results: PhoneticScanResult[] = [];
  const ngrams = extractNgrams(text);

  // Track which character ranges have been matched to avoid overlaps
  const matchedRanges: Array<{ start: number; end: number }> = [];

  // Sort ngrams by length (longer first) to prefer longer matches
  ngrams.sort((a, b) => b.phrase.length - a.phrase.length);

  for (const ngram of ngrams) {
    // Skip if this range overlaps with an existing match
    const overlaps = matchedRanges.some(
      range => !(ngram.endIndex <= range.start || ngram.startIndex >= range.end)
    );
    if (overlaps) continue;

    // Skip very short phrases (likely noise)
    if (ngram.phrase.length < 4) continue;

    // Try to find a phonetic match
    const matches = findPhoneticMatches(ngram.phrase, phoneticIndex, 1, minConfidence);
    const bestMatch = matches[0];

    if (bestMatch && bestMatch.confidence >= minConfidence) {
      // Verify this isn't just matching the exact same term
      if (ngram.phrase.toLowerCase() !== bestMatch.term.toLowerCase()) {
        results.push({
          originalPhrase: ngram.phrase,
          matchedTerm: bestMatch.term,
          confidence: bestMatch.confidence,
          startIndex: ngram.startIndex,
          endIndex: ngram.endIndex,
        });
        matchedRanges.push({ start: ngram.startIndex, end: ngram.endIndex });
      }
    }
  }

  return results;
}

/**
 * Apply phonetic scan results to normalize text.
 * Replaces phonetically matched phrases with their canonical terms.
 */
export function applyPhoneticReplacements(
  text: string,
  phoneticResults: PhoneticScanResult[]
): string {
  // Sort by start index descending to replace from end to start (preserves indices)
  const sorted = [...phoneticResults].sort((a, b) => b.startIndex - a.startIndex);

  let result = text;
  for (const match of sorted) {
    result = result.substring(0, match.startIndex) +
             match.matchedTerm +
             result.substring(match.endIndex);
  }

  return result;
}

/**
 * Process phonetic scan results and convert to replacements.
 * Filters out results that overlap with existing replacements.
 */
export function processPhoneticResults(
  text: string,
  phoneticResults: PhoneticScanResult[],
  existingReplacements: TextReplacement[],
  unitNames: string[]
): TextReplacement[] {
  const newReplacements: TextReplacement[] = [];

  for (const phoneticResult of phoneticResults) {
    // Skip if already matched by pattern-based matching
    const alreadyMatched = existingReplacements.some(
      r => r.original.toLowerCase() === phoneticResult.originalPhrase.toLowerCase()
    );
    if (alreadyMatched) continue;

    // Skip if overlaps with existing replacement
    const overlaps = existingReplacements.some(r => {
      const rLower = r.original.toLowerCase();
      const phraseLower = phoneticResult.originalPhrase.toLowerCase();
      const rIndex = text.toLowerCase().indexOf(rLower);
      const phraseIndex = text.toLowerCase().indexOf(phraseLower);
      return rIndex !== -1 && phraseIndex !== -1 &&
             Math.abs(rIndex - phraseIndex) < Math.max(rLower.length, phraseLower.length);
    });
    if (overlaps) continue;

    // Categorize the matched term
    const { type, canonical } = categorizeTermType(phoneticResult.matchedTerm, unitNames);

    if (type !== 'unknown') {
      newReplacements.push({
        original: phoneticResult.originalPhrase,
        official: canonical,
        type,
      });
    }
  }

  return newReplacements;
}
