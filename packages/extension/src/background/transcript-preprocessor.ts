/**
 * Transcript Preprocessor - Thin wrapper for backwards compatibility.
 *
 * This module re-exports the new preprocessing pipeline while maintaining
 * the original API for existing callers. The actual implementation has been
 * refactored into modular components under ./preprocessing/.
 *
 * Migration guide:
 * - For new code, import directly from '@/background/preprocessing'
 * - Existing imports from this file will continue to work
 */

import type { TranscriptSegment } from '@/types/youtube';
import type { Stratagem, Unit } from '@/types/battle-report';

// Re-export types from the new module structure
export type {
  TermType,
  TermMatch,
  NormalizedSegment,
  PreprocessedTranscript,
  PhoneticScanResult,
} from './preprocessing';

// Import from the new pipeline
import {
  preprocessTranscript as pipelinePreprocess,
  preprocessTranscriptSync,
  scanForPhoneticMatches as pipelineScanPhonetic,
  findBestMatch as pipelineFindBestMatch,
  categorizeTermType as pipelineCategorizeTermType,
  normalizeUnitName as pipelineNormalizeUnitName,
  buildFuzzyUnitAliasesSync,
  getObjectivesCache,
  setDynamicObjectives,
  normalizeTerm,
} from './preprocessing';

import type { PreprocessedTranscript } from './preprocessing';
import type { PhoneticIndex } from '@/utils/phonetic-matcher';
import { buildPhoneticIndex } from '@/utils/phonetic-matcher';
import { getMultiFactionAliases } from '@/data/generated/aliases';

/**
 * Scan text for phonetic matches.
 * @deprecated Use `scanForPhoneticMatches` from '@/background/preprocessing' instead
 */
export const scanForPhoneticMatches = pipelineScanPhonetic;

/**
 * Fetch objectives from MCP server API.
 */
export async function fetchObjectivesFromApi() {
  return getObjectivesCache().get();
}

/**
 * Initialize objectives from MCP server API.
 */
export async function initializeObjectivesFromApi(): Promise<boolean> {
  const apiData = await fetchObjectivesFromApi();
  if (!apiData) {
    console.log('Using fallback hardcoded objectives');
    return false;
  }

  // Update dynamic objectives
  const aliases = new Map<string, string>();
  for (const [alias, canonical] of Object.entries(apiData.aliases)) {
    aliases.set(alias.toLowerCase(), canonical);
  }

  setDynamicObjectives(
    apiData.secondaryObjectives,
    apiData.primaryMissions,
    apiData.gambits,
    aliases
  );

  console.log(`Loaded ${apiData.primaryMissions.length} primary missions, ${apiData.secondaryObjectives.length} secondary objectives from API`);
  return true;
}

/**
 * Find the best matching official name for a colloquial term.
 */
export function findBestMatch(
  term: string,
  officialNames: string[],
  aliases: Map<string, string>,
  minSimilarity: number = 0.7,
  phoneticIndex?: PhoneticIndex
): string | null {
  return pipelineFindBestMatch(term, officialNames, aliases, minSimilarity, phoneticIndex);
}

/**
 * Categorize a term by type.
 */
export function categorizeTermType(
  term: string,
  unitNames: string[] = []
): { type: import('./preprocessing').TermType; canonical: string } {
  return pipelineCategorizeTermType(term, unitNames);
}

/**
 * Normalize a unit name.
 */
export function normalizeUnitName(term: string, unitNames: string[]): string | null {
  return pipelineNormalizeUnitName(term, unitNames);
}

/**
 * Build fuzzy aliases from official unit names.
 * Synchronous version.
 */
export { buildFuzzyUnitAliasesSync };

/**
 * Build fuzzy aliases from official unit names.
 * Async version that loads generated aliases.
 */
export async function buildFuzzyUnitAliases(
  officialNames: string[],
  factionIds: string[] = []
): Promise<Map<string, string>> {
  const aliases = buildFuzzyUnitAliasesSync(officialNames);

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
 * Pre-process transcript using LLM-provided term mappings combined with pattern matching.
 * @deprecated Use `preprocessTranscript` with mode: 'llm' instead
 */
export function preprocessTranscriptWithLlmMappings(
  transcript: TranscriptSegment[],
  unitNames: string[] = [],
  llmMappings: Record<string, string> = {}
): PreprocessedTranscript {
  // Use synchronous pipeline since this was originally sync
  return preprocessTranscriptWithLlmMappingsImpl(transcript, unitNames, llmMappings);
}

// Internal sync implementation
function preprocessTranscriptWithLlmMappingsImpl(
  transcript: TranscriptSegment[],
  unitNames: string[],
  llmMappings: Record<string, string>
): PreprocessedTranscript {
  // Import required functions
  const { deduplicateSegments } = require('./preprocessing/phases/deduplication');
  const { applyLlmMappings, mergeLlmMappingsIntoAliases } = require('./preprocessing/phases/llm-mapping');
  const { detectTermsInText } = require('./preprocessing/phases/term-detection');
  const { applyNormalization, applyTagging } = require('./preprocessing/phases/text-normalization');
  const { scanForPhoneticMatches: scanPhonetic, processPhoneticResults } = require('./preprocessing/phases/phonetic-scanning');

  const segments = deduplicateSegments(transcript);
  let aliases = buildFuzzyUnitAliasesSync(unitNames);
  aliases = mergeLlmMappingsIntoAliases(aliases, llmMappings);
  const phoneticIndex = unitNames.length > 0 ? buildPhoneticIndex(unitNames) : null;

  const matches: import('./preprocessing').TermMatch[] = [];
  const stratagemMentions = new Map<string, number[]>();
  const unitMentions = new Map<string, number[]>();
  const objectiveMentions = new Map<string, number[]>();
  const factionMentions = new Map<string, number[]>();
  const detachmentMentions = new Map<string, number[]>();
  const normalizedSegments: import('./preprocessing').NormalizedSegment[] = [];
  const colloquialToOfficial = new Map<string, string>();

  for (const [colloquial, official] of Object.entries(llmMappings)) {
    colloquialToOfficial.set(colloquial.toLowerCase(), official);
  }

  const addMention = (map: Map<string, number[]>, key: string, ts: number) => {
    if (!map.has(key)) map.set(key, []);
    const arr = map.get(key)!;
    if (!arr.includes(ts)) arr.push(ts);
  };

  for (const seg of segments) {
    const timestamp = Math.floor(seg.startTime);
    const text = seg.text;
    const replacements: import('./preprocessing').TextReplacement[] = [];

    // LLM mappings
    if (Object.keys(llmMappings).length > 0) {
      const llmResult = applyLlmMappings(text, timestamp, llmMappings, unitNames);
      matches.push(...llmResult.matches);
      replacements.push(...llmResult.replacements);
      for (const u of llmResult.mentionUpdates) {
        const map = u.type === 'stratagem' ? stratagemMentions : unitMentions;
        addMention(map, u.canonical, u.timestamp);
      }
    }

    // Pattern detection (stratagems and units only for llm mode)
    const detection = detectTermsInText(text, timestamp, {
      unitNames,
      unitAliases: aliases,
      phoneticIndex,
      detectObjectives: false,
      detectFactions: false,
      detectDetachments: false,
    });

    const existingOriginals = new Set(replacements.map(r => r.original.toLowerCase()));
    for (const m of detection.matches) {
      if (!existingOriginals.has(m.term.toLowerCase())) {
        matches.push(m);
      }
    }
    for (const r of detection.replacements) {
      if (!existingOriginals.has(r.original.toLowerCase())) {
        replacements.push(r);
      }
    }
    for (const [k, v] of detection.mentionsByType.stratagems) {
      for (const ts of v) addMention(stratagemMentions, k, ts);
    }
    for (const [k, v] of detection.mentionsByType.units) {
      for (const ts of v) addMention(unitMentions, k, ts);
    }
    for (const [k, v] of detection.colloquialToOfficial) {
      colloquialToOfficial.set(k, v);
    }

    // Phonetic scanning
    if (phoneticIndex) {
      const phoneticResults = scanPhonetic(text, phoneticIndex, 0.5);
      const phoneticReplacements = processPhoneticResults(text, phoneticResults, replacements, unitNames);
      for (const pr of phoneticReplacements) {
        colloquialToOfficial.set(pr.original.toLowerCase(), pr.official);
        const { type, canonical } = pipelineCategorizeTermType(pr.official, unitNames);
        if (type !== 'unknown') {
          const map = type === 'stratagem' ? stratagemMentions : unitMentions;
          addMention(map, canonical, timestamp);
          matches.push({
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

    const normalizedText = applyNormalization(text, replacements);
    const taggedText = applyTagging(text, replacements);
    normalizedSegments.push({ ...seg, normalizedText, taggedText });
  }

  return {
    matches,
    stratagemMentions,
    unitMentions,
    objectiveMentions,
    factionMentions,
    detachmentMentions,
    normalizedSegments,
    colloquialToOfficial,
  };
}

/**
 * Pre-process transcript with generated aliases.
 * @deprecated Use `preprocessTranscript` with mode: 'full' instead
 */
export async function preprocessTranscriptWithGeneratedAliases(
  transcript: TranscriptSegment[],
  unitNames: string[] = [],
  factionIds: string[] = [],
  llmMappings: Record<string, string> = {}
): Promise<PreprocessedTranscript> {
  return pipelinePreprocess(transcript, {
    mode: 'full',
    unitNames,
    factionIds,
    llmMappings,
    detectObjectives: false,
    detectFactions: false,
    detectDetachments: false,
  });
}

/**
 * Pre-process transcript to find mentions of game terms.
 * This is the main preprocessing function for basic use cases.
 */
export function preprocessTranscript(
  transcript: TranscriptSegment[],
  unitNames: string[] = []
): PreprocessedTranscript {
  return preprocessTranscriptSync(transcript, unitNames);
}

/**
 * Generic function to find the best matching timestamp for a name in mentions.
 */
function findTimestamp(
  name: string,
  mentions: Map<string, number[]>,
  minWordOverlap: number = 1
): number | undefined {
  const normalized = normalizeTerm(name);

  if (mentions.has(normalized)) {
    return mentions.get(normalized)![0];
  }

  for (const [mentionedName, timestamps] of mentions) {
    if (mentionedName.includes(normalized) || normalized.includes(mentionedName)) {
      return timestamps[0];
    }

    const nameWords = normalized.split(' ').filter(w => w.length > 2);
    const mentionWords = mentionedName.split(' ').filter(w => w.length > 2);
    const overlap = nameWords.filter(w => mentionWords.includes(w));
    if (overlap.length >= minWordOverlap && overlap.length >= Math.min(nameWords.length, mentionWords.length) / 2) {
      return timestamps[0];
    }
  }

  return undefined;
}

/**
 * Find the best matching timestamp for a stratagem name.
 */
function findStratagemTimestamp(name: string, mentions: Map<string, number[]>): number | undefined {
  return findTimestamp(name, mentions, 1);
}

/**
 * Find the best matching timestamp for a unit name.
 */
function findUnitTimestamp(name: string, mentions: Map<string, number[]>): number | undefined {
  return findTimestamp(name, mentions, 1);
}

/**
 * Enrich stratagems with timestamps from preprocessed transcript.
 */
export function enrichStratagemTimestamps(
  stratagems: Stratagem[],
  preprocessed: PreprocessedTranscript
): Stratagem[] {
  return stratagems.map(s => {
    if (s.videoTimestamp !== undefined) return s;
    const timestamp = findStratagemTimestamp(s.name, preprocessed.stratagemMentions);
    if (timestamp !== undefined) {
      return { ...s, videoTimestamp: timestamp };
    }
    return s;
  });
}

/**
 * Get all detected stratagems from preprocessing.
 */
export function getDetectedStratagems(preprocessed: PreprocessedTranscript): string[] {
  return [...preprocessed.stratagemMentions.keys()];
}

/**
 * Enrich units with timestamps from preprocessed transcript.
 */
export function enrichUnitTimestamps(
  units: Unit[],
  preprocessed: PreprocessedTranscript
): Unit[] {
  return units.map(u => {
    if (u.videoTimestamp !== undefined) return u;
    const timestamp = findUnitTimestamp(u.name, preprocessed.unitMentions);
    if (timestamp !== undefined) {
      return { ...u, videoTimestamp: timestamp };
    }
    return u;
  });
}
