/**
 * LLM mapping application phase.
 * Applies LLM-provided term mappings to the preprocessing pipeline.
 */

import type { TermMatch, TextReplacement } from '../types';
import { categorizeTermType } from './term-detection';
import { escapeRegex } from './text-normalization';

/**
 * Apply LLM mappings to text and generate matches/replacements.
 *
 * @param text Original text
 * @param timestamp Timestamp in seconds
 * @param llmMappings LLM-provided colloquial -> official mappings
 * @param unitNames List of official unit names
 * @returns Object with matches, replacements, and mention updates
 */
export function applyLlmMappings(
  text: string,
  timestamp: number,
  llmMappings: Record<string, string>,
  unitNames: string[]
): {
  matches: TermMatch[];
  replacements: TextReplacement[];
  mentionUpdates: Array<{
    type: 'stratagem' | 'unit' | 'objective' | 'faction' | 'detachment' | 'enhancement';
    canonical: string;
    timestamp: number;
  }>;
} {
  const matches: TermMatch[] = [];
  const replacements: TextReplacement[] = [];
  const mentionUpdates: Array<{
    type: 'stratagem' | 'unit' | 'objective' | 'faction' | 'detachment' | 'enhancement';
    canonical: string;
    timestamp: number;
  }> = [];

  for (const [colloquial, official] of Object.entries(llmMappings)) {
    const escapedColloquial = escapeRegex(colloquial);
    const regex = new RegExp(`\\b${escapedColloquial}\\b`, 'gi');

    for (const match of text.matchAll(regex)) {
      const term = match[0];
      if (!term) continue;

      // Categorize the term
      const { type, canonical } = categorizeTermType(official, unitNames);

      // Skip unknown terms
      if (type === 'unknown') {
        continue;
      }

      matches.push({
        term,
        normalizedTerm: canonical,
        type,
        timestamp,
        segmentText: text,
      });

      replacements.push({
        original: term,
        official: canonical,
        type,
      });

      mentionUpdates.push({
        type,
        canonical,
        timestamp,
      });
    }
  }

  return { matches, replacements, mentionUpdates };
}

/**
 * Merge LLM mappings into an alias map.
 * LLM mappings take priority over existing aliases.
 */
export function mergeLlmMappingsIntoAliases(
  aliases: Map<string, string>,
  llmMappings: Record<string, string>
): Map<string, string> {
  const merged = new Map(aliases);
  for (const [colloquial, official] of Object.entries(llmMappings)) {
    merged.set(colloquial.toLowerCase(), official);
  }
  return merged;
}
