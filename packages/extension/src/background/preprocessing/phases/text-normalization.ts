/**
 * Text normalization phase.
 * Applies replacements and tagging to transcript text.
 */

import type { TermType, TextReplacement } from '../types';

/**
 * Escape special regex characters in a string.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalize a term for comparison (lowercase, trim, collapse whitespace).
 */
export function normalizeTerm(term: string): string {
  return term.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Map of term types to their tag names for tagged text output.
 */
const TAG_MAP: Record<TermType, string> = {
  faction: 'FACTION',
  detachment: 'DETACHMENT',
  stratagem: 'STRATAGEM',
  objective: 'OBJECTIVE',
  unit: 'UNIT',
  unknown: 'UNIT', // Fallback (shouldn't happen)
};

/**
 * Apply text replacements to normalize colloquial terms to official names.
 * Preserves the case of the first letter.
 *
 * @param text Original text
 * @param replacements Replacements to apply
 * @returns Normalized text with official names
 */
export function applyNormalization(text: string, replacements: TextReplacement[]): string {
  let result = text;

  // Sort by length (longest first) to avoid partial replacements
  const sorted = [...replacements].sort((a, b) => b.original.length - a.original.length);

  // Deduplicate by original term (case-insensitive)
  const seen = new Set<string>();
  const unique = sorted.filter(({ original }) => {
    const lower = original.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });

  for (const { original, official } of unique) {
    const regex = new RegExp(`\\b${escapeRegex(original)}\\b`, 'gi');

    result = result.replace(regex, (match) => {
      const firstChar = match[0];
      const isUpperCase = firstChar ? firstChar === firstChar.toUpperCase() : false;
      return isUpperCase
        ? official.charAt(0).toUpperCase() + official.slice(1)
        : official.toLowerCase();
    });
  }

  return result;
}

/**
 * Apply tagging to text, wrapping recognized terms with type markers.
 * Format: [TYPE:OfficialName]
 *
 * @param text Original text
 * @param replacements Replacements to apply
 * @returns Tagged text
 */
export function applyTagging(text: string, replacements: TextReplacement[]): string {
  let result = text;

  // Sort by length (longest first) to avoid partial replacements
  const sorted = [...replacements].sort((a, b) => b.original.length - a.original.length);

  // Deduplicate by original term (case-insensitive)
  const seen = new Set<string>();
  const unique = sorted.filter(({ original }) => {
    const lower = original.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });

  for (const { original, official, type } of unique) {
    const regex = new RegExp(`\\b${escapeRegex(original)}\\b`, 'gi');
    const tag = TAG_MAP[type];

    result = result.replace(regex, (match, offset) => {
      // Check if this match is inside an existing tag by looking for unclosed '['
      const before = result.substring(0, offset);
      const lastOpenBracket = before.lastIndexOf('[');
      const lastCloseBracket = before.lastIndexOf(']');

      // If there's an unclosed bracket before this match, we're inside a tag - skip
      if (lastOpenBracket > lastCloseBracket) {
        return match; // Keep original, don't tag
      }

      return `[${tag}:${official}]`;
    });
  }

  return result;
}

/**
 * Build a regex pattern from a list of terms.
 * Handles word boundaries appropriately.
 *
 * @param terms Terms to match
 * @param aliases Optional alias map to include
 * @returns RegExp for matching any of the terms
 */
export function buildTermPattern(terms: string[], aliases?: Map<string, string>): RegExp {
  const allTerms = [...terms];
  if (aliases) {
    allTerms.push(...aliases.keys());
  }

  const escapedTerms = allTerms
    .filter((t) => t.length >= 2) // Skip very short terms
    .map(escapeRegex)
    .sort((a, b) => b.length - a.length); // Longer terms first for greedy matching

  if (escapedTerms.length === 0) {
    return /(?!)/; // Never matches
  }

  return new RegExp(`\\b(${escapedTerms.join('|')})\\b`, 'gi');
}

/**
 * Resolve a term to its canonical name using an alias map.
 */
export function toCanonicalName(term: string, aliases: Map<string, string>): string {
  const normalized = normalizeTerm(term);
  return aliases.get(normalized) ?? normalized;
}

/**
 * Build a case-preserving alias map from an array of properly-cased terms.
 * Maps lowercase versions to their proper-cased originals.
 */
export function buildCasePreservingAliases(
  terms: string[],
  existingAliases: Map<string, string>
): Map<string, string> {
  const aliases = new Map<string, string>(existingAliases);
  for (const term of terms) {
    aliases.set(term.toLowerCase(), term);
  }
  return aliases;
}
