/**
 * Main preprocessing pipeline orchestrator.
 * Consolidates the 3 preprocessing modes into a single configurable function.
 */

import type { TranscriptSegment } from '@/types/youtube';
import type { PreprocessingOptions, PreprocessedTranscript, NormalizedSegment, TextReplacement, TermMatch } from './types';
import { buildPhoneticIndex, type PhoneticIndex } from '@/utils/phonetic-matcher';
import { getMultiFactionAliases } from '@/data/generated/aliases';
import { MATCHING_THRESHOLDS } from '@/data/constants';

// Import phases
import { deduplicateSegments } from './phases/deduplication';
import {
  buildFuzzyUnitAliasesSync,
  detectTermsInText,
  categorizeTermType,
} from './phases/term-detection';
import {
  applyNormalization,
  applyTagging,
} from './phases/text-normalization';
import {
  scanForPhoneticMatches,
  processPhoneticResults,
} from './phases/phonetic-scanning';
import {
  applyLlmMappings,
  mergeLlmMappingsIntoAliases,
} from './phases/llm-mapping';

/**
 * Build fuzzy aliases asynchronously with generated aliases.
 */
async function buildFuzzyUnitAliasesAsync(
  officialNames: string[],
  factionIds: string[]
): Promise<Map<string, string>> {
  // Start with sync version
  const aliases = buildFuzzyUnitAliasesSync(officialNames);

  // Load pre-generated LLM aliases for specified factions
  if (factionIds.length > 0) {
    try {
      const generatedAliases = await getMultiFactionAliases(factionIds);
      for (const [alias, canonical] of generatedAliases) {
        aliases.set(alias, canonical);
      }
    } catch (error) {
      console.warn('Failed to load generated aliases:', error);
    }
  }

  return aliases;
}

/**
 * Process a single segment through the pipeline.
 */
function processSegment(
  seg: TranscriptSegment,
  context: {
    unitNames: string[];
    aliases: Map<string, string>;
    phoneticIndex: PhoneticIndex | null;
    llmMappings: Record<string, string>;
    detectObjectives: boolean;
    detectFactions: boolean;
    detectDetachments: boolean;
    results: {
      matches: TermMatch[];
      stratagemMentions: Map<string, number[]>;
      unitMentions: Map<string, number[]>;
      objectiveMentions: Map<string, number[]>;
      factionMentions: Map<string, number[]>;
      detachmentMentions: Map<string, number[]>;
      colloquialToOfficial: Map<string, string>;
    };
  }
): NormalizedSegment {
  const timestamp = Math.floor(seg.startTime);
  const text = seg.text;
  const replacements: TextReplacement[] = [];

  const {
    unitNames,
    aliases,
    phoneticIndex,
    llmMappings,
    detectObjectives,
    detectFactions,
    detectDetachments,
    results,
  } = context;

  // Helper to add mention
  const addMention = (map: Map<string, number[]>, canonical: string, ts: number) => {
    if (!map.has(canonical)) {
      map.set(canonical, []);
    }
    const timestamps = map.get(canonical)!;
    if (!timestamps.includes(ts)) {
      timestamps.push(ts);
    }
  };

  // Phase 1: Apply LLM mappings first (they take priority)
  if (Object.keys(llmMappings).length > 0) {
    const llmResult = applyLlmMappings(text, timestamp, llmMappings, unitNames);

    results.matches.push(...llmResult.matches);
    replacements.push(...llmResult.replacements);

    for (const update of llmResult.mentionUpdates) {
      const map = update.type === 'stratagem' ? results.stratagemMentions
        : update.type === 'objective' ? results.objectiveMentions
        : update.type === 'faction' ? results.factionMentions
        : update.type === 'detachment' ? results.detachmentMentions
        : results.unitMentions;
      addMention(map, update.canonical, update.timestamp);
    }

    // Track colloquial -> official mappings
    for (const r of llmResult.replacements) {
      if (r.original.toLowerCase() !== r.official.toLowerCase()) {
        results.colloquialToOfficial.set(r.original.toLowerCase(), r.official);
      }
    }
  }

  // Phase 2: Pattern-based term detection
  const detectionResult = detectTermsInText(text, timestamp, {
    unitNames,
    unitAliases: aliases,
    phoneticIndex,
    detectObjectives,
    detectFactions,
    detectDetachments,
  });

  // Filter out duplicates (already processed by LLM)
  const existingOriginals = new Set(replacements.map(r => r.original.toLowerCase()));
  const newMatches = detectionResult.matches.filter(
    m => !existingOriginals.has(m.term.toLowerCase())
  );
  const newReplacements = detectionResult.replacements.filter(
    r => !existingOriginals.has(r.original.toLowerCase())
  );

  results.matches.push(...newMatches);
  replacements.push(...newReplacements);

  // Merge mention maps
  for (const [key, values] of detectionResult.mentionsByType.stratagems) {
    for (const v of values) addMention(results.stratagemMentions, key, v);
  }
  for (const [key, values] of detectionResult.mentionsByType.units) {
    for (const v of values) addMention(results.unitMentions, key, v);
  }
  for (const [key, values] of detectionResult.mentionsByType.objectives) {
    for (const v of values) addMention(results.objectiveMentions, key, v);
  }
  for (const [key, values] of detectionResult.mentionsByType.factions) {
    for (const v of values) addMention(results.factionMentions, key, v);
  }
  for (const [key, values] of detectionResult.mentionsByType.detachments) {
    for (const v of values) addMention(results.detachmentMentions, key, v);
  }

  // Merge colloquial -> official
  for (const [k, v] of detectionResult.colloquialToOfficial) {
    results.colloquialToOfficial.set(k, v);
  }

  // Phase 3: Phonetic scanning (catches YouTube mishearings)
  if (phoneticIndex) {
    const phoneticResults = scanForPhoneticMatches(
      text,
      phoneticIndex,
      MATCHING_THRESHOLDS.PHONETIC_HIGH_CONFIDENCE
    );

    const phoneticReplacements = processPhoneticResults(
      text,
      phoneticResults,
      replacements,
      unitNames
    );

    for (const pr of phoneticReplacements) {
      results.colloquialToOfficial.set(pr.original.toLowerCase(), pr.official);

      const { type, canonical } = categorizeTermType(pr.official, unitNames);
      if (type !== 'unknown') {
        const map = type === 'stratagem' ? results.stratagemMentions
          : type === 'objective' ? results.objectiveMentions
          : type === 'faction' ? results.factionMentions
          : type === 'detachment' ? results.detachmentMentions
          : results.unitMentions;
        addMention(map, canonical, timestamp);

        results.matches.push({
          term: pr.original,
          normalizedTerm: canonical,
          type,
          timestamp,
          segmentText: text,
        });

        replacements.push(pr);
      }
    }
  }

  // Phase 4: Apply text transformations
  const normalizedText = applyNormalization(text, replacements);
  const taggedText = applyTagging(text, replacements);

  return {
    ...seg,
    normalizedText,
    taggedText,
  };
}

/**
 * Unified preprocessing function that handles all modes.
 *
 * Modes:
 * - 'basic': Synchronous, pattern-based detection only
 * - 'llm': Synchronous, adds LLM mappings to pattern detection
 * - 'full': Asynchronous, loads generated aliases + LLM mappings
 *
 * @param transcript Raw transcript segments
 * @param options Preprocessing configuration
 * @returns Preprocessed transcript with matches and normalized segments
 */
export async function preprocessTranscript(
  transcript: TranscriptSegment[],
  options: PreprocessingOptions
): Promise<PreprocessedTranscript> {
  const {
    mode,
    unitNames,
    factionIds = [],
    llmMappings = {},
    detectObjectives = true,
    detectFactions = true,
    detectDetachments = true,
  } = options;

  // Step 1: Deduplicate segments
  const segments = deduplicateSegments(transcript);

  // Step 2: Build aliases based on mode
  let aliases: Map<string, string>;
  if (mode === 'full' && factionIds.length > 0) {
    aliases = await buildFuzzyUnitAliasesAsync(unitNames, factionIds);
  } else {
    aliases = buildFuzzyUnitAliasesSync(unitNames);
  }

  // Merge LLM mappings into aliases
  if (Object.keys(llmMappings).length > 0) {
    aliases = mergeLlmMappingsIntoAliases(aliases, llmMappings);
  }

  // Step 3: Build phonetic index
  const phoneticIndex = unitNames.length > 0 ? buildPhoneticIndex(unitNames) : null;

  // Step 4: Initialize results
  const results = {
    matches: [] as TermMatch[],
    stratagemMentions: new Map<string, number[]>(),
    unitMentions: new Map<string, number[]>(),
    objectiveMentions: new Map<string, number[]>(),
    factionMentions: new Map<string, number[]>(),
    detachmentMentions: new Map<string, number[]>(),
    colloquialToOfficial: new Map<string, string>(),
  };

  // Merge LLM mappings into colloquialToOfficial for tracking
  for (const [colloquial, official] of Object.entries(llmMappings)) {
    results.colloquialToOfficial.set(colloquial.toLowerCase(), official);
  }

  // Step 5: Process each segment
  const normalizedSegments: NormalizedSegment[] = segments.map(seg =>
    processSegment(seg, {
      unitNames,
      aliases,
      phoneticIndex,
      llmMappings: mode === 'basic' ? {} : llmMappings,
      detectObjectives,
      detectFactions,
      detectDetachments,
      results,
    })
  );

  return {
    ...results,
    normalizedSegments,
  };
}

/**
 * Synchronous version for backwards compatibility.
 * Uses 'basic' mode internally.
 */
export function preprocessTranscriptSync(
  transcript: TranscriptSegment[],
  unitNames: string[] = []
): PreprocessedTranscript {
  // Can't use async, so inline the logic
  const segments = deduplicateSegments(transcript);
  const aliases = buildFuzzyUnitAliasesSync(unitNames);
  const phoneticIndex = unitNames.length > 0 ? buildPhoneticIndex(unitNames) : null;

  const results = {
    matches: [] as TermMatch[],
    stratagemMentions: new Map<string, number[]>(),
    unitMentions: new Map<string, number[]>(),
    objectiveMentions: new Map<string, number[]>(),
    factionMentions: new Map<string, number[]>(),
    detachmentMentions: new Map<string, number[]>(),
    colloquialToOfficial: new Map<string, string>(),
  };

  const normalizedSegments: NormalizedSegment[] = segments.map(seg =>
    processSegment(seg, {
      unitNames,
      aliases,
      phoneticIndex,
      llmMappings: {},
      detectObjectives: true,
      detectFactions: true,
      detectDetachments: true,
      results,
    })
  );

  return {
    ...results,
    normalizedSegments,
  };
}
