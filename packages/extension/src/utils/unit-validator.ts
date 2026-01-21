import Fuse, { IFuseOptions } from 'fuse.js';
import type { FactionData, UnitData } from '@/types/bsdata';
import type { FeedbackItem } from '@battlereport/shared/types';
import {
  getPhoneticIndexForFaction,
  findPhoneticMatches,
  clearPhoneticCache,
} from './phonetic-matcher';

export interface ValidatedUnit {
  originalName: string;
  matchedName: string;
  matchedUnit: UnitData | null;
  confidence: number; // 0-1 score
  isValidated: boolean;
}

// Fuse.js options tuned for unit name matching
const FUSE_OPTIONS: IFuseOptions<UnitData> = {
  keys: [
    { name: 'name', weight: 0.7 },
    { name: 'canonicalName', weight: 0.3 },
  ],
  threshold: 0.4, // Higher = more lenient matching
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 3,
};

// Cache Fuse instances per faction
const fuseCache = new Map<string, Fuse<UnitData>>();

/**
 * Get or create a Fuse instance for a faction.
 */
function getFuseForFaction(faction: FactionData): Fuse<UnitData> {
  if (fuseCache.has(faction.id)) {
    return fuseCache.get(faction.id)!;
  }

  const fuse = new Fuse(faction.units, FUSE_OPTIONS);
  fuseCache.set(faction.id, fuse);
  return fuse;
}

/**
 * Validate a single unit name against a faction's unit list.
 * Returns the best match with confidence score.
 *
 * Uses a multi-stage matching approach:
 * 1. Fuse.js fuzzy matching (best for typos)
 * 2. Phonetic matching fallback (best for mishearings)
 */
export function validateUnit(
  unitName: string,
  faction: FactionData
): ValidatedUnit {
  const fuse = getFuseForFaction(faction);

  // Search for matches using Fuse.js
  const results = fuse.search(unitName);

  // If Fuse found a high-confidence match, use it
  if (results.length > 0 && results[0]!.score !== undefined) {
    const bestMatch = results[0]!;
    // Fuse score is 0 (perfect) to 1 (worst), invert for confidence
    const fuseConfidence = 1 - bestMatch.score!;

    // High confidence Fuse match - use it directly
    if (fuseConfidence >= 0.6) {
      return {
        originalName: unitName,
        matchedName: bestMatch.item.name,
        matchedUnit: bestMatch.item,
        confidence: fuseConfidence,
        isValidated: true,
      };
    }
  }

  // Fuse confidence is low - try phonetic matching
  const unitNames = faction.units.map(u => u.name);
  const phoneticIndex = getPhoneticIndexForFaction(faction.id, unitNames);
  const phoneticMatches = findPhoneticMatches(unitName, phoneticIndex, 3, 0.4);

  const bestPhoneticMatch = phoneticMatches[0];
  if (bestPhoneticMatch) {
    // Find the actual UnitData for the phonetic match
    const matchedUnit = faction.units.find(
      u => u.name.toLowerCase() === bestPhoneticMatch.term.toLowerCase()
    );

    if (matchedUnit) {
      // If we also had a Fuse result, combine the confidences
      const fuseMatch = results.length > 0 ? results[0] : null;
      const fuseConfidence = fuseMatch?.score !== undefined ? 1 - fuseMatch.score : 0;

      // Boost confidence if phonetic and Fuse agree on the same term
      let finalConfidence = bestPhoneticMatch.confidence;
      if (fuseMatch && fuseMatch.item.name.toLowerCase() === bestPhoneticMatch.term.toLowerCase()) {
        // Both methods agree - boost confidence
        finalConfidence = Math.max(finalConfidence, fuseConfidence, 0.7);
      }

      // Validate if phonetic confidence is high enough
      const isValidated = finalConfidence >= 0.5;

      return {
        originalName: unitName,
        matchedName: isValidated ? matchedUnit.name : unitName,
        matchedUnit: isValidated ? matchedUnit : null,
        confidence: finalConfidence,
        isValidated,
      };
    }
  }

  // Neither Fuse nor phonetic found a good match
  // Return the best Fuse result if we have one, otherwise no match
  if (results.length > 0 && results[0]!.score !== undefined) {
    const bestMatch = results[0]!;
    const confidence = 1 - bestMatch.score!;
    return {
      originalName: unitName,
      matchedName: unitName,
      matchedUnit: null,
      confidence,
      isValidated: false,
    };
  }

  return {
    originalName: unitName,
    matchedName: unitName,
    matchedUnit: null,
    confidence: 0,
    isValidated: false,
  };
}

/**
 * Validate multiple unit names against a faction.
 */
export function validateUnits(
  unitNames: string[],
  faction: FactionData
): ValidatedUnit[] {
  return unitNames.map((name) => validateUnit(name, faction));
}

/**
 * Validate units against multiple factions.
 * Tries each faction and returns the best match.
 */
export function validateUnitAcrossFactions(
  unitName: string,
  factions: FactionData[]
): ValidatedUnit {
  let bestResult: ValidatedUnit | null = null;

  for (const faction of factions) {
    const result = validateUnit(unitName, faction);
    if (!bestResult || result.confidence > bestResult.confidence) {
      bestResult = result;
    }
  }

  return (
    bestResult ?? {
      originalName: unitName,
      matchedName: unitName,
      matchedUnit: null,
      confidence: 0,
      isValidated: false,
    }
  );
}

/**
 * Get the best match for a unit name, regardless of validation threshold.
 * Useful for showing suggestions to the user.
 * Combines Fuse.js and phonetic matching for better coverage.
 */
export function getBestMatch(
  unitName: string,
  faction: FactionData
): ValidatedUnit | null {
  const fuse = getFuseForFaction(faction);
  const results = fuse.search(unitName);

  // Try Fuse match first
  let bestFuseMatch: ValidatedUnit | null = null;
  if (results.length > 0 && results[0]!.score !== undefined) {
    const match = results[0]!;
    bestFuseMatch = {
      originalName: unitName,
      matchedName: match.item.name,
      matchedUnit: match.item,
      confidence: 1 - match.score!,
      isValidated: (1 - match.score!) >= 0.6,
    };
  }

  // Try phonetic match
  const unitNames = faction.units.map(u => u.name);
  const phoneticIndex = getPhoneticIndexForFaction(faction.id, unitNames);
  const phoneticMatches = findPhoneticMatches(unitName, phoneticIndex, 1, 0.3);

  let bestPhoneticMatch: ValidatedUnit | null = null;
  const phoneticMatch = phoneticMatches[0];
  if (phoneticMatch) {
    const matchedUnit = faction.units.find(
      u => u.name.toLowerCase() === phoneticMatch.term.toLowerCase()
    );
    if (matchedUnit) {
      bestPhoneticMatch = {
        originalName: unitName,
        matchedName: matchedUnit.name,
        matchedUnit: matchedUnit,
        confidence: phoneticMatch.confidence,
        isValidated: phoneticMatch.confidence >= 0.5,
      };
    }
  }

  // Return the better of the two matches
  if (bestFuseMatch && bestPhoneticMatch) {
    return bestFuseMatch.confidence >= bestPhoneticMatch.confidence
      ? bestFuseMatch
      : bestPhoneticMatch;
  }

  return bestFuseMatch || bestPhoneticMatch || null;
}

/**
 * Clear the Fuse and phonetic caches.
 */
export function clearValidatorCache(): void {
  fuseCache.clear();
  clearPhoneticCache();
}

/**
 * Get suggestions for a unit name (for autocomplete).
 */
export function getSuggestions(
  partialName: string,
  faction: FactionData,
  limit = 5
): UnitData[] {
  const fuse = getFuseForFaction(faction);
  const results = fuse.search(partialName, { limit });
  return results.map((r) => r.item);
}

/**
 * Configuration for feedback-enabled validation.
 */
export interface ValidateFeedbackOptions {
  videoId: string;
  transcriptContext: string;
  videoTimestamp?: number;
  playerIndex?: number;
  /** Confidence threshold below which to generate feedback. Default: 0.6 */
  feedbackThreshold?: number;
}

/**
 * Result from validateUnitWithFeedback.
 */
export interface ValidationWithFeedbackResult {
  validation: ValidatedUnit;
  feedbackItem?: FeedbackItem;
}

/**
 * Validate a unit name and generate a feedback item if confidence is low.
 * Returns both the validation result and an optional feedback item for user review.
 * Includes both Fuse.js and phonetic suggestions for comprehensive coverage.
 */
export function validateUnitWithFeedback(
  unitName: string,
  faction: FactionData,
  options: ValidateFeedbackOptions
): ValidationWithFeedbackResult {
  const validation = validateUnit(unitName, faction);
  const feedbackThreshold = options.feedbackThreshold ?? 0.6;

  // Generate feedback if confidence is below threshold or not validated
  if (validation.confidence < feedbackThreshold || !validation.isValidated) {
    const fuse = getFuseForFaction(faction);
    const fuseResults = fuse.search(unitName, { limit: 5 });

    // Get phonetic suggestions
    const unitNames = faction.units.map(u => u.name);
    const phoneticIndex = getPhoneticIndexForFaction(faction.id, unitNames);
    const phoneticMatches = findPhoneticMatches(unitName, phoneticIndex, 5, 0.3);

    // Build suggestions array combining Fuse and phonetic matches
    const suggestionMap = new Map<string, number>();

    // Add Fuse suggestions
    for (const result of fuseResults) {
      const confidence = 1 - (result.score ?? 1);
      const existing = suggestionMap.get(result.item.name);
      if (!existing || confidence > existing) {
        suggestionMap.set(result.item.name, confidence);
      }
    }

    // Add phonetic suggestions (may boost or add new suggestions)
    for (const match of phoneticMatches) {
      const existing = suggestionMap.get(match.term);
      if (!existing || match.confidence > existing) {
        suggestionMap.set(match.term, match.confidence);
      }
    }

    // Convert to sorted array
    const suggestions = Array.from(suggestionMap.entries())
      .map(([name, confidence]) => ({ name, confidence }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    const feedbackItem: FeedbackItem = {
      id: `feedback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      videoId: options.videoId,
      originalToken: unitName,
      entityType: 'unit',
      playerIndex: options.playerIndex,
      transcriptContext: options.transcriptContext,
      videoTimestamp: options.videoTimestamp,
      confidenceScore: validation.confidence,
      suggestions,
      status: 'pending',
      factionId: faction.id,
    };

    return { validation, feedbackItem };
  }

  return { validation };
}
