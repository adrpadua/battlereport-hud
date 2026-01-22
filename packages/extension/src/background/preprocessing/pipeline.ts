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
    enhancementMentions: new Map<string, number[]>(),
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
    enhancementMentions: new Map<string, number[]>(),
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

// ============================================================================
// Unified Game Extraction Pipeline
// ============================================================================

import OpenAI from 'openai';
import { z } from 'zod';
import type { Chapter } from '@/types/youtube';
import type { FactionData } from '@/types/bsdata';
import type {
  GameExtraction,
  ExtractGameOptions,
  EntityMentions,
  PlayerInfo,
  StageArtifact,
  PipelineStageName,
} from './types';
import { preprocessWithLlm } from '../llm-preprocess-service';
import { getCachedPreprocess, setCachedPreprocess } from '../cache-manager';
import { loadFactionByName, getFactionUnitNames } from '@/utils/faction-loader';
import { findFactionByName } from '@/data/generated';
import { validateUnit, getBestMatch } from '@/utils/unit-validator';

// ============================================================================
// Pipeline Artifact Helpers
// ============================================================================

/**
 * Create a new stage artifact with running status.
 */
function createStageArtifact(stage: number, name: PipelineStageName): StageArtifact {
  return {
    stage,
    name,
    status: 'running',
    startedAt: Date.now(),
    summary: '',
  };
}

/**
 * Mark a stage as completed with summary and optional details.
 */
function completeStageArtifact(
  artifact: StageArtifact,
  summary: string,
  details?: Record<string, unknown>
): StageArtifact {
  const completedAt = Date.now();
  return {
    ...artifact,
    status: 'completed',
    completedAt,
    durationMs: completedAt - artifact.startedAt,
    summary,
    details,
  };
}

/**
 * Mark a stage as failed with error message.
 */
function failStageArtifact(artifact: StageArtifact, error: string): StageArtifact {
  const completedAt = Date.now();
  return {
    ...artifact,
    status: 'failed',
    completedAt,
    durationMs: completedAt - artifact.startedAt,
    summary: `Failed: ${error}`,
    error,
  };
}

// Zod schema for AI assignment response
const AIAssignmentResponseSchema = z.object({
  players: z.array(z.object({
    name: z.string(),
    faction: z.string(),
    detachment: z.string().nullable().optional().transform(v => v ?? 'Unknown'),
    confidence: z.enum(['high', 'medium', 'low']),
  })).min(1).max(2),
  unitAssignments: z.array(z.object({
    name: z.string(),
    playerIndex: z.number().min(0).max(1),
    confidence: z.enum(['high', 'medium', 'low']),
  })),
  stratagemAssignments: z.array(z.object({
    name: z.string(),
    playerIndex: z.number().min(0).max(1).nullable().optional().transform(v => v ?? undefined),
    confidence: z.enum(['high', 'medium', 'low']),
  })),
  enhancementAssignments: z.array(z.object({
    name: z.string(),
    playerIndex: z.number().min(0).max(1).nullable().optional().transform(v => v ?? undefined),
    pointsCost: z.number().nullable().optional().transform(v => v ?? undefined),
    confidence: z.enum(['high', 'medium', 'low']),
  })),
  mission: z.string().nullable().optional().transform(v => v ?? undefined),
  pointsLimit: z.number().nullable().optional().transform(v => v ?? undefined),
});

type AIAssignmentResponse = z.infer<typeof AIAssignmentResponseSchema>;

const ASSIGNMENT_SYSTEM_PROMPT = `You are an expert at analyzing Warhammer 40,000 battle report videos. Your task is to:
1. Identify the players and their factions
2. Assign pre-detected units, stratagems, and enhancements to the correct player

IMPORTANT: Units, stratagems, and enhancements have ALREADY been detected from the transcript.
Your job is to assign them to players, NOT to discover new ones.

Guidelines:
- Identify player names from how they're addressed in the video
- Match player names to their factions based on context
- Assign each detected unit to player 0 or player 1 based on:
  - Direct statements ("my Intercessors", "John's Necron Warriors")
  - Faction alignment (Space Marine units go to the Space Marine player)
  - Context from army list sections
- Confidence levels:
  - "high": Clear player association from context or faction match
  - "medium": Likely assignment based on faction, but not explicit
  - "low": Uncertain assignment, made by process of elimination

Respond with a JSON object containing:
- players: Array of {name, faction, detachment?, confidence}
- unitAssignments: Array of {name, playerIndex, confidence}
- stratagemAssignments: Array of {name, playerIndex?, confidence}
- enhancementAssignments: Array of {name, playerIndex?, pointsCost?, confidence}
- mission: Optional mission name
- pointsLimit: Optional points limit`;

// Keywords for finding army list sections
const ARMY_LIST_CHAPTER_KEYWORDS = ['army', 'list', 'lists', 'forces', 'armies', 'roster'];
const ARMY_LIST_KEYWORDS = [
  'army list', 'my list', 'the list', 'list for', 'the lists',
  'running with', "i'm playing", 'playing with', "i'm running",
  'points of', '2000 points', '2,000 points', '1000 points', '1,000 points',
  'strike force', 'incursion'
];

function findArmyListChapters(chapters: Chapter[]): Chapter[] {
  return chapters.filter(ch =>
    ARMY_LIST_CHAPTER_KEYWORDS.some(kw => ch.title.toLowerCase().includes(kw))
  );
}

function buildTranscriptExcerpts(
  transcript: TranscriptSegment[],
  chapters: Chapter[]
): string {
  const introSegments = transcript.filter(seg => seg.startTime < 300);
  const armyChapters = findArmyListChapters(chapters);

  let armyListSegments: TranscriptSegment[] = [];
  if (armyChapters.length > 0) {
    armyListSegments = armyChapters.flatMap(ch => {
      const nextChapter = chapters[chapters.indexOf(ch) + 1];
      const endTime = nextChapter?.startTime ?? ch.startTime + 300;
      return transcript.filter(seg => seg.startTime >= ch.startTime && seg.startTime < endTime);
    });
  } else {
    // Fallback: keyword-based detection
    let inArmySection = false;
    let sectionEndTime = 0;
    for (const seg of transcript) {
      const lower = seg.text.toLowerCase();
      if (ARMY_LIST_KEYWORDS.some(kw => lower.includes(kw)) && !inArmySection) {
        inArmySection = true;
        sectionEndTime = seg.startTime + 180;
      }
      if (inArmySection) {
        armyListSegments.push(seg);
        if (seg.startTime > sectionEndTime || lower.includes('deploy') || lower.includes('first turn')) {
          inArmySection = false;
        }
      }
    }
  }

  // Dedupe and combine
  const seen = new Set<number>();
  const allSegments = [...introSegments, ...armyListSegments]
    .filter(seg => {
      const key = Math.floor(seg.startTime);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.startTime - b.startTime);

  const text = allSegments
    .map(seg => `[${Math.floor(seg.startTime)}s] ${seg.text}`)
    .join(' ');

  return text.slice(0, 8000);
}

function buildAssignmentPrompt(
  options: ExtractGameOptions,
  preprocessed: PreprocessedTranscript
): string {
  const detectedUnits = [...preprocessed.unitMentions.entries()].map(([name, ts]) => ({
    name,
    timestamps: ts,
    mentionCount: ts.length,
  }));

  const detectedStratagems = [...preprocessed.stratagemMentions.entries()].map(([name, ts]) => ({
    name,
    timestamps: ts,
    mentionCount: ts.length,
  }));

  const detectedEnhancements = [...preprocessed.enhancementMentions.entries()].map(([name, ts]) => ({
    name,
    timestamps: ts,
    mentionCount: ts.length,
  }));

  let prompt = `Analyze this Warhammer 40,000 battle report and assign the detected entities to players.

VIDEO: ${options.title}
CHANNEL: ${options.channel}

FACTIONS: ${options.factions.join(' vs ')}

`;

  if (options.chapters.length > 0) {
    prompt += `CHAPTERS:\n`;
    for (const ch of options.chapters.slice(0, 10)) {
      const mins = Math.floor(ch.startTime / 60);
      const secs = ch.startTime % 60;
      prompt += `${mins}:${secs.toString().padStart(2, '0')} - ${ch.title}\n`;
    }
    prompt += '\n';
  }

  if (options.pinnedComment) {
    prompt += `PINNED COMMENT:\n${options.pinnedComment.slice(0, 1000)}\n\n`;
  }

  prompt += `DETECTED UNITS (${detectedUnits.length}):\n`;
  for (const unit of detectedUnits.slice(0, 50)) {
    prompt += `- ${unit.name} (mentioned ${unit.mentionCount}x at ${unit.timestamps[0]}s)\n`;
  }
  if (detectedUnits.length > 50) {
    prompt += `... and ${detectedUnits.length - 50} more\n`;
  }

  prompt += `\nDETECTED STRATAGEMS (${detectedStratagems.length}):\n`;
  for (const strat of detectedStratagems.slice(0, 30)) {
    prompt += `- ${strat.name} (used ${strat.mentionCount}x)\n`;
  }

  if (detectedEnhancements.length > 0) {
    prompt += `\nDETECTED ENHANCEMENTS (${detectedEnhancements.length}):\n`;
    for (const enh of detectedEnhancements.slice(0, 20)) {
      prompt += `- ${enh.name}\n`;
    }
  }

  const excerpts = buildTranscriptExcerpts(options.transcript, options.chapters);
  prompt += `\nTRANSCRIPT EXCERPTS:\n${excerpts}`;

  return prompt;
}

async function callAssignmentAI(
  openai: OpenAI,
  options: ExtractGameOptions,
  preprocessed: PreprocessedTranscript
): Promise<AIAssignmentResponse> {
  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    max_completion_tokens: 3000,
    messages: [
      { role: 'system', content: ASSIGNMENT_SYSTEM_PROMPT },
      { role: 'user', content: buildAssignmentPrompt(options, preprocessed) },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI');
  }

  return AIAssignmentResponseSchema.parse(JSON.parse(content));
}

function buildEntityMentionsMap(
  mentions: Map<string, number[]>,
  assignments: Map<string, { playerIndex?: number; confidence: 'high' | 'medium' | 'low' }>,
  factionDataMap: Map<number, FactionData | null>,
  isUnit: boolean = false
): Map<string, EntityMentions> {
  const result = new Map<string, EntityMentions>();

  for (const [name, timestamps] of mentions) {
    const assignment = assignments.get(name.toLowerCase());
    const playerIndex = assignment?.playerIndex ?? 0;

    const entityMention: EntityMentions = {
      canonicalName: name,
      timestamps,
      mentionCount: timestamps.length,
      isValidated: false,
      source: 'preprocessed',
    };

    // For units, try to validate against faction BSData
    if (isUnit) {
      const faction = factionDataMap.get(playerIndex);
      if (faction) {
        const validation = validateUnit(name, faction);
        if (validation.isValidated && validation.matchedUnit) {
          entityMention.canonicalName = validation.matchedName;
          entityMention.isValidated = true;
          entityMention.stats = validation.matchedUnit.stats ?? undefined;
          entityMention.keywords = validation.matchedUnit.keywords;
          entityMention.pointsCost = validation.matchedUnit.pointsCost ?? undefined;
        } else {
          const bestMatch = getBestMatch(name, faction);
          if (bestMatch && bestMatch.confidence >= 0.3) {
            entityMention.suggestedMatch = {
              name: bestMatch.matchedName,
              confidence: bestMatch.confidence,
            };
          }
        }
      }
    }

    result.set(name, entityMention);
  }

  return result;
}

/**
 * Extended game extraction result that includes pipeline artifacts.
 */
export interface ExtractGameResult {
  extraction: GameExtraction;
  artifacts: StageArtifact[];
}

/**
 * Unified game extraction pipeline.
 *
 * This is the single entry point for extracting game data from a battle report video.
 * It outputs a `GameExtraction` that can be consumed by HUD, narrator, and other apps.
 *
 * Pipeline stages:
 * 1. Load faction data
 * 2. Run LLM preprocessing (optional, for term correction)
 * 3. Run pattern-based preprocessing
 * 4. Call AI for player identification and entity assignment
 * 5. Merge into unified GameExtraction structure
 *
 * @param options - Extraction options including video data and callbacks
 * @returns The game extraction result with artifacts
 */
export async function extractGame(options: ExtractGameOptions): Promise<GameExtraction> {
  const startTime = Date.now();
  const artifacts: StageArtifact[] = [];
  const onStageComplete = options.onStageComplete;

  // Helper to emit and store artifacts
  const emitArtifact = (artifact: StageArtifact) => {
    artifacts.push(artifact);
    onStageComplete?.(artifact);
  };

  // =========================================================================
  // Stage 1: Load faction data
  // =========================================================================
  let stage1 = createStageArtifact(1, 'load-factions');
  emitArtifact(stage1);

  const factionDataMap = new Map<number, FactionData | null>();
  const unitNamesMap = new Map<string, string[]>();

  try {
    await Promise.all(
      options.factions.map(async (factionName, index) => {
        const faction = await loadFactionByName(factionName);
        factionDataMap.set(index, faction);
        const unitNames = await getFactionUnitNames(factionName);
        unitNamesMap.set(factionName, unitNames);
      })
    );

    const unitCounts: Record<string, number> = {};
    for (const [faction, units] of unitNamesMap) {
      unitCounts[faction] = units.length;
    }

    stage1 = completeStageArtifact(
      stage1,
      `Loaded ${Object.values(unitCounts).join(' + ')} units from ${options.factions.join(', ')}`,
      { unitCounts, factionIds: options.factions }
    );
    emitArtifact(stage1);
  } catch (error) {
    stage1 = failStageArtifact(stage1, error instanceof Error ? error.message : 'Unknown error');
    emitArtifact(stage1);
    throw error;
  }

  const allUnitNames = [...unitNamesMap.values()].flat();
  const factionIds = options.factions
    .map(name => findFactionByName(name)?.id)
    .filter((id): id is string => !!id);

  // =========================================================================
  // Stage 2: LLM preprocessing (optional)
  // =========================================================================
  let stage2 = createStageArtifact(2, 'llm-preprocess');
  emitArtifact(stage2);

  let llmMappings: Record<string, string> = {};
  let llmCached = false;

  if (options.skipLlmPreprocessing) {
    stage2 = completeStageArtifact(stage2, 'Skipped (pattern matching only)', { skipped: true });
    emitArtifact(stage2);
  } else {
    try {
      const cachedLlm = options.cachedLlmMappings
        ? { termMappings: options.cachedLlmMappings }
        : await getCachedPreprocess(options.videoId);

      if (cachedLlm) {
        llmMappings = cachedLlm.termMappings;
        llmCached = true;
      } else {
        const llmResult = await preprocessWithLlm(
          options.transcript,
          options.factions,
          options.apiKey
        );
        llmMappings = llmResult.termMappings;
        await setCachedPreprocess(options.videoId, llmResult);
      }

      const mappingCount = Object.keys(llmMappings).length;
      const sampleMappings = Object.entries(llmMappings).slice(0, 5).map(([k, v]) => `"${k}" → "${v}"`);

      stage2 = completeStageArtifact(
        stage2,
        `${mappingCount} term corrections (cached: ${llmCached})`,
        {
          mappingCount,
          cached: llmCached,
          sampleMappings,
          allMappings: llmMappings,
        }
      );
      emitArtifact(stage2);
    } catch (error) {
      // LLM preprocessing failure is non-fatal
      console.warn('LLM preprocessing failed, continuing with pattern matching only:', error);
      stage2 = completeStageArtifact(
        stage2,
        `Skipped (LLM failed: ${error instanceof Error ? error.message : 'Unknown error'})`,
        { skipped: true, error: error instanceof Error ? error.message : 'Unknown error' }
      );
      emitArtifact(stage2);
    }
  }

  // =========================================================================
  // Stage 3: Pattern-based preprocessing
  // =========================================================================
  let stage3 = createStageArtifact(3, 'pattern-preprocess');
  emitArtifact(stage3);

  let preprocessed: PreprocessedTranscript;
  try {
    preprocessed = await preprocessTranscript(options.transcript, {
      mode: 'full',
      unitNames: allUnitNames,
      factionIds,
      llmMappings,
      detectObjectives: true,
      detectFactions: true,
      detectDetachments: true,
    });

    const unitCount = preprocessed.unitMentions.size;
    const stratagemCount = preprocessed.stratagemMentions.size;
    const enhancementCount = preprocessed.enhancementMentions.size;
    const matchCount = preprocessed.matches.length;
    const segmentCount = preprocessed.normalizedSegments.length;

    stage3 = completeStageArtifact(
      stage3,
      `${unitCount} units, ${stratagemCount} stratagems, ${enhancementCount} enhancements detected`,
      {
        unitCount,
        stratagemCount,
        enhancementCount,
        matchCount,
        segmentCount,
        corrections: preprocessed.colloquialToOfficial.size,
      }
    );
    emitArtifact(stage3);
  } catch (error) {
    stage3 = failStageArtifact(stage3, error instanceof Error ? error.message : 'Unknown error');
    emitArtifact(stage3);
    throw error;
  }

  // =========================================================================
  // Stage 4: AI player assignment
  // =========================================================================
  let stage4 = createStageArtifact(4, 'ai-assignment');
  emitArtifact(stage4);

  let aiResponse: AIAssignmentResponse;
  try {
    const openai = new OpenAI({
      apiKey: options.apiKey,
      timeout: 180000, // 3 minute timeout for reasoning models
    });
    aiResponse = await callAssignmentAI(openai, options, preprocessed);

    const player1 = aiResponse.players[0]?.name || 'Unknown';
    const player1Faction = aiResponse.players[0]?.faction || 'Unknown';
    const player2 = aiResponse.players[1]?.name || 'Unknown';
    const player2Faction = aiResponse.players[1]?.faction || 'Unknown';
    const assignmentCount = aiResponse.unitAssignments.length;

    const confidenceCounts = {
      high: aiResponse.unitAssignments.filter(a => a.confidence === 'high').length,
      medium: aiResponse.unitAssignments.filter(a => a.confidence === 'medium').length,
      low: aiResponse.unitAssignments.filter(a => a.confidence === 'low').length,
    };

    stage4 = completeStageArtifact(
      stage4,
      `${player1} (${player1Faction}) vs ${player2} (${player2Faction}), ${assignmentCount} assignments`,
      {
        players: aiResponse.players,
        unitAssignmentCount: assignmentCount,
        stratagemAssignmentCount: aiResponse.stratagemAssignments.length,
        enhancementAssignmentCount: aiResponse.enhancementAssignments.length,
        confidenceCounts,
        mission: aiResponse.mission,
        pointsLimit: aiResponse.pointsLimit,
      }
    );
    emitArtifact(stage4);
  } catch (error) {
    stage4 = failStageArtifact(stage4, error instanceof Error ? error.message : 'Unknown error');
    emitArtifact(stage4);
    throw error;
  }

  // Build assignment maps
  const unitAssignments = new Map<string, { playerIndex: number; confidence: 'high' | 'medium' | 'low' }>();
  for (const a of aiResponse.unitAssignments) {
    unitAssignments.set(a.name.toLowerCase(), { playerIndex: a.playerIndex, confidence: a.confidence });
  }

  const stratagemAssignments = new Map<string, { playerIndex?: number; confidence: 'high' | 'medium' | 'low' }>();
  for (const a of aiResponse.stratagemAssignments) {
    stratagemAssignments.set(a.name.toLowerCase(), { playerIndex: a.playerIndex, confidence: a.confidence });
  }

  const enhancementAssignments = new Map<string, { playerIndex?: number; pointsCost?: number; confidence: 'high' | 'medium' | 'low' }>();
  for (const a of aiResponse.enhancementAssignments) {
    enhancementAssignments.set(a.name.toLowerCase(), {
      playerIndex: a.playerIndex,
      pointsCost: a.pointsCost,
      confidence: a.confidence,
    });
  }

  // =========================================================================
  // Stage 5: Build GameExtraction result
  // =========================================================================
  let stage5 = createStageArtifact(5, 'build-result');
  emitArtifact(stage5);

  try {
    const players: PlayerInfo[] = aiResponse.players.map(p => ({
      name: p.name,
      faction: p.faction,
      factionId: findFactionByName(p.faction)?.id,
      detachment: p.detachment,
      confidence: p.confidence,
    }));

    const units = buildEntityMentionsMap(
      preprocessed.unitMentions,
      unitAssignments as Map<string, { playerIndex?: number; confidence: 'high' | 'medium' | 'low' }>,
      factionDataMap,
      true
    );

    const stratagems = buildEntityMentionsMap(
      preprocessed.stratagemMentions,
      stratagemAssignments,
      factionDataMap
    );

    const enhancements = buildEntityMentionsMap(
      preprocessed.enhancementMentions,
      enhancementAssignments,
      factionDataMap
    );

    // Count validated units
    let validatedCount = 0;
    for (const [, entity] of units) {
      if (entity.isValidated) validatedCount++;
    }

    const processingTimeMs = Date.now() - startTime;

    stage5 = completeStageArtifact(
      stage5,
      `${validatedCount}/${units.size} units validated, total ${(processingTimeMs / 1000).toFixed(1)}s`,
      {
        validatedUnits: validatedCount,
        totalUnits: units.size,
        totalStratagems: stratagems.size,
        totalEnhancements: enhancements.size,
        processingTimeMs,
      }
    );
    emitArtifact(stage5);

    return {
      players: players.length === 2 ? [players[0]!, players[1]!] : [players[0]!],
      units,
      stratagems,
      enhancements,
      assignments: {
        units: unitAssignments,
        stratagems: stratagemAssignments,
        enhancements: enhancementAssignments,
      },
      segments: preprocessed.normalizedSegments,
      factions: preprocessed.factionMentions,
      detachments: preprocessed.detachmentMentions,
      objectives: preprocessed.objectiveMentions,
      mission: aiResponse.mission,
      pointsLimit: aiResponse.pointsLimit,
      videoId: options.videoId,
      extractedAt: Date.now(),
      processingTimeMs,
    };
  } catch (error) {
    stage5 = failStageArtifact(stage5, error instanceof Error ? error.message : 'Unknown error');
    emitArtifact(stage5);
    throw error;
  }
}
