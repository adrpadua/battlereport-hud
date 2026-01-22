/**
 * Enhanced Preprocessing Pipeline
 *
 * Consolidates the multi-phase extraction process into a single pipeline that
 * outputs HUD-ready data. This replaces the previous flow:
 *   Transcript → Preprocessing → AI Service → BattleReport
 *
 * With a unified approach:
 *   Transcript → Enhanced Pipeline → EnhancedExtractionResult → HUD
 *
 * The AI model now focuses on player assignment rather than entity discovery,
 * reducing token usage and improving accuracy.
 */

import OpenAI from 'openai';
import { z } from 'zod';

import type { TranscriptSegment, Chapter } from '@/types/youtube';
import type {
  EnhancedExtractionResult,
  EnhancedPipelineOptions,
  ExtractedPlayer,
  ExtractedUnit,
  ExtractedStratagem,
  ExtractedEnhancement,
  PreprocessingArtifacts,
  AIAssignmentRequest,
  AIAssignmentResponse,
} from '@/types/enhanced-extraction';
import type { BattleReport, ConfidenceLevel } from '@/types/battle-report';
import type { FactionData } from '@/types/bsdata';

import { preprocessTranscript } from './pipeline';
import type { PreprocessedTranscript } from './types';
import { preprocessWithLlm } from '../llm-preprocess-service';
import { getCachedPreprocess, setCachedPreprocess } from '../cache-manager';
import { loadFactionByName, getFactionUnitNames } from '@/utils/faction-loader';
import { findFactionByName } from '@/data/generated';
import { getBestMatch, validateUnit } from '@/utils/unit-validator';

// Zod schema for AI assignment response validation (transforms null to default)
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

// Keywords indicating army list chapters
const ARMY_LIST_CHAPTER_KEYWORDS = ['army', 'list', 'lists', 'forces', 'armies', 'roster'];

// Keywords indicating army list discussion
const ARMY_LIST_KEYWORDS = [
  'army list', 'my list', 'the list', 'list for', 'the lists',
  'running with', "i'm playing", 'playing with', "i'm running",
  'points of', '2000 points', '2,000 points', '1000 points', '1,000 points',
  'strike force', 'incursion'
];

/**
 * System prompt for AI assignment (focusing on player identification and entity assignment).
 * Detection has already been done by preprocessing.
 */
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

/**
 * Find chapters that likely contain army list discussion.
 */
function findArmyListChapters(chapters: Chapter[]): Chapter[] {
  return chapters.filter(ch =>
    ARMY_LIST_CHAPTER_KEYWORDS.some(kw => ch.title.toLowerCase().includes(kw))
  );
}

/**
 * Get transcript segments from army list sections.
 */
function getArmyListSegments(
  transcript: TranscriptSegment[],
  chapters: Chapter[]
): TranscriptSegment[] {
  const armyChapters = findArmyListChapters(chapters);

  if (armyChapters.length > 0) {
    return armyChapters.flatMap(ch => {
      const nextChapter = chapters[chapters.indexOf(ch) + 1];
      const endTime = nextChapter?.startTime ?? ch.startTime + 300;
      return transcript.filter(seg => seg.startTime >= ch.startTime && seg.startTime < endTime);
    });
  }

  // Fallback: find army list sections by keywords
  const result: TranscriptSegment[] = [];
  let inArmySection = false;
  let sectionEndTime = 0;

  for (const seg of transcript) {
    const lower = seg.text.toLowerCase();
    const startsSection = ARMY_LIST_KEYWORDS.some(kw => lower.includes(kw));

    if (startsSection && !inArmySection) {
      inArmySection = true;
      sectionEndTime = seg.startTime + 180;
    }

    if (inArmySection) {
      result.push(seg);
      if (seg.startTime > sectionEndTime || lower.includes('deploy') || lower.includes('first turn')) {
        inArmySection = false;
      }
    }
  }

  return result;
}

/**
 * Build transcript excerpts for AI context (intro + army lists).
 */
function buildTranscriptExcerpts(
  transcript: TranscriptSegment[],
  chapters: Chapter[]
): string {
  // Get intro (first 5 min)
  const introSegments = transcript.filter(seg => seg.startTime < 300);

  // Get army list segments
  const armyListSegments = getArmyListSegments(transcript, chapters);

  // Combine and dedupe
  const seen = new Set<number>();
  const allSegments = [...introSegments, ...armyListSegments]
    .filter(seg => {
      const key = Math.floor(seg.startTime);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.startTime - b.startTime);

  // Format with timestamps
  const text = allSegments
    .map(seg => `[${Math.floor(seg.startTime)}s] ${seg.text}`)
    .join(' ');

  // Limit to 8000 chars for AI context
  return text.slice(0, 8000);
}

/**
 * Build the AI assignment request from preprocessing results.
 */
function buildAssignmentRequest(
  options: EnhancedPipelineOptions,
  preprocessed: PreprocessedTranscript
): AIAssignmentRequest {
  const detectedUnits = [...preprocessed.unitMentions.entries()].map(([name, timestamps]) => ({
    name,
    timestamps,
    mentionCount: timestamps.length,
  }));

  const detectedStratagems = [...preprocessed.stratagemMentions.entries()].map(([name, timestamps]) => ({
    name,
    timestamps,
    mentionCount: timestamps.length,
  }));

  const detectedEnhancements = [...preprocessed.enhancementMentions.entries()].map(([name, timestamps]) => ({
    name,
    timestamps,
    mentionCount: timestamps.length,
  }));

  return {
    videoTitle: options.title,
    videoChannel: options.channel,
    videoDescription: options.description,
    pinnedComment: options.pinnedComment,
    chapters: options.chapters.map(ch => ({ startTime: ch.startTime, title: ch.title })),
    detectedUnits,
    detectedStratagems,
    detectedEnhancements,
    factions: options.selectedFactions,
    transcriptExcerpts: buildTranscriptExcerpts(options.transcript, options.chapters),
  };
}

/**
 * Build the user prompt for AI assignment.
 */
function buildAssignmentPrompt(request: AIAssignmentRequest): string {
  let prompt = `Analyze this Warhammer 40,000 battle report and assign the detected entities to players.

VIDEO: ${request.videoTitle}
CHANNEL: ${request.videoChannel}

FACTIONS: ${request.factions.join(' vs ')}

`;

  if (request.chapters.length > 0) {
    prompt += `CHAPTERS:\n`;
    for (const ch of request.chapters.slice(0, 10)) {
      const mins = Math.floor(ch.startTime / 60);
      const secs = ch.startTime % 60;
      prompt += `${mins}:${secs.toString().padStart(2, '0')} - ${ch.title}\n`;
    }
    prompt += '\n';
  }

  if (request.pinnedComment) {
    prompt += `PINNED COMMENT:\n${request.pinnedComment.slice(0, 1000)}\n\n`;
  }

  // Add detected entities
  prompt += `DETECTED UNITS (${request.detectedUnits.length}):\n`;
  for (const unit of request.detectedUnits.slice(0, 50)) {
    prompt += `- ${unit.name} (mentioned ${unit.mentionCount}x at ${unit.timestamps[0]}s)\n`;
  }
  if (request.detectedUnits.length > 50) {
    prompt += `... and ${request.detectedUnits.length - 50} more\n`;
  }

  prompt += `\nDETECTED STRATAGEMS (${request.detectedStratagems.length}):\n`;
  for (const strat of request.detectedStratagems.slice(0, 30)) {
    prompt += `- ${strat.name} (used ${strat.mentionCount}x)\n`;
  }

  if (request.detectedEnhancements.length > 0) {
    prompt += `\nDETECTED ENHANCEMENTS (${request.detectedEnhancements.length}):\n`;
    for (const enh of request.detectedEnhancements.slice(0, 20)) {
      prompt += `- ${enh.name}\n`;
    }
  }

  prompt += `\nTRANSCRIPT EXCERPTS:\n${request.transcriptExcerpts}`;

  return prompt;
}

/**
 * Call the AI model for player assignment.
 */
async function callAssignmentAI(
  openai: OpenAI,
  request: AIAssignmentRequest
): Promise<AIAssignmentResponse> {
  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    max_completion_tokens: 3000,
    messages: [
      { role: 'system', content: ASSIGNMENT_SYSTEM_PROMPT },
      { role: 'user', content: buildAssignmentPrompt(request) },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI');
  }

  const parsed = JSON.parse(content);
  return AIAssignmentResponseSchema.parse(parsed);
}

/**
 * Enrich units with BSData validation and stats.
 */
async function enrichUnitsWithBSData(
  units: Array<{ name: string; playerIndex: number; confidence: ConfidenceLevel; timestamps: number[] }>,
  factions: Map<number, FactionData | null>
): Promise<ExtractedUnit[]> {
  return units.map(unit => {
    const faction = factions.get(unit.playerIndex);
    const enrichedUnit: ExtractedUnit = {
      name: unit.name,
      canonicalName: unit.name,
      playerIndex: unit.playerIndex,
      confidence: unit.confidence,
      videoTimestamps: unit.timestamps,
      mentionCount: unit.timestamps.length,
      isValidated: false,
    };

    if (!faction) {
      return enrichedUnit;
    }

    // Try to validate against faction
    const validation = validateUnit(unit.name, faction);
    if (validation.isValidated && validation.matchedUnit) {
      return {
        ...enrichedUnit,
        name: validation.matchedName,
        canonicalName: validation.matchedName,
        stats: validation.matchedUnit.stats ?? undefined,
        keywords: validation.matchedUnit.keywords,
        pointsCost: validation.matchedUnit.pointsCost ?? undefined,
        isValidated: true,
        confidence: unit.confidence === 'low' ? 'medium' : 'high',
      };
    }

    // Get best match as suggestion
    const bestMatch = getBestMatch(unit.name, faction);
    if (bestMatch && bestMatch.confidence >= 0.3) {
      enrichedUnit.suggestedMatch = {
        name: bestMatch.matchedName,
        confidence: bestMatch.confidence,
      };
    }

    return enrichedUnit;
  });
}

/**
 * Main enhanced preprocessing pipeline.
 *
 * Consolidates:
 * - Phase 1: Pattern detection (existing pipeline.ts)
 * - Phase 2: LLM term correction (existing llm-preprocess-service.ts)
 * - Phase 3: AI player assignment (refactored from ai-service.ts)
 * - Phase 4: BSData enrichment (existing report-processor.ts)
 */
export async function enhancedPreprocess(
  options: EnhancedPipelineOptions
): Promise<EnhancedExtractionResult> {
  const startTime = Date.now();

  // Load faction data
  const factionDataMap = new Map<number, FactionData | null>();
  const unitNamesMap = new Map<string, string[]>();

  await Promise.all(
    options.selectedFactions.map(async (factionName, index) => {
      const faction = await loadFactionByName(factionName);
      factionDataMap.set(index, faction);
      const unitNames = await getFactionUnitNames(factionName);
      unitNamesMap.set(factionName, unitNames);
    })
  );

  const allUnitNames = [...unitNamesMap.values()].flat();
  const factionIds = options.selectedFactions
    .map(name => findFactionByName(name)?.id)
    .filter((id): id is string => !!id);

  // Phase 1 & 2: Preprocessing (pattern detection + optional LLM term correction)
  let preprocessed: PreprocessedTranscript;
  let llmMappings: Record<string, string> = {};

  if (!options.skipLlmPreprocessing) {
    // Try to get cached LLM mappings
    const cachedLlm = options.cachedLlmMappings
      ? { termMappings: options.cachedLlmMappings }
      : await getCachedPreprocess(options.videoId);

    if (cachedLlm) {
      llmMappings = cachedLlm.termMappings;
      console.log('Using cached LLM preprocess mappings');
    } else {
      try {
        console.log('Running LLM preprocessing...');
        const llmResult = await preprocessWithLlm(
          options.transcript,
          options.selectedFactions,
          options.apiKey
        );
        llmMappings = llmResult.termMappings;
        await setCachedPreprocess(options.videoId, llmResult);
        console.log(`LLM preprocessing found ${Object.keys(llmMappings).length} term mappings`);
      } catch (error) {
        console.warn('LLM preprocessing failed, continuing with pattern matching only:', error);
      }
    }
  }

  // Run pattern-based preprocessing with LLM mappings
  preprocessed = await preprocessTranscript(options.transcript, {
    mode: 'full',
    unitNames: allUnitNames,
    factionIds,
    llmMappings,
    detectObjectives: true,
    detectFactions: true,
    detectDetachments: true,
  });

  // Phase 3: AI player assignment
  const openai = new OpenAI({ apiKey: options.apiKey });
  const assignmentRequest = buildAssignmentRequest(options, preprocessed);
  const aiResponse = await callAssignmentAI(openai, assignmentRequest);

  // Build unit assignment map
  const unitAssignmentMap = new Map<string, { playerIndex: number; confidence: ConfidenceLevel }>();
  for (const assignment of aiResponse.unitAssignments) {
    unitAssignmentMap.set(assignment.name.toLowerCase(), {
      playerIndex: assignment.playerIndex,
      confidence: assignment.confidence,
    });
  }

  // Combine preprocessing detections with AI assignments
  const unitsWithAssignments = [...preprocessed.unitMentions.entries()].map(([name, timestamps]) => {
    const assignment = unitAssignmentMap.get(name.toLowerCase());
    return {
      name,
      playerIndex: assignment?.playerIndex ?? 0,
      confidence: assignment?.confidence ?? ('low' as ConfidenceLevel),
      timestamps,
    };
  });

  // Phase 4: BSData enrichment
  const enrichedUnits = await enrichUnitsWithBSData(unitsWithAssignments, factionDataMap);

  // Build stratagems
  const stratagemAssignmentMap = new Map<string, { playerIndex?: number; confidence: ConfidenceLevel }>();
  for (const assignment of aiResponse.stratagemAssignments) {
    stratagemAssignmentMap.set(assignment.name.toLowerCase(), {
      playerIndex: assignment.playerIndex ?? undefined,
      confidence: assignment.confidence,
    });
  }

  const stratagems: ExtractedStratagem[] = [...preprocessed.stratagemMentions.entries()].map(([name, timestamps]) => {
    const assignment = stratagemAssignmentMap.get(name.toLowerCase());
    return {
      name,
      canonicalName: name,
      playerIndex: assignment?.playerIndex,
      confidence: assignment?.confidence ?? 'medium',
      videoTimestamps: timestamps,
      mentionCount: timestamps.length,
    };
  });

  // Build enhancements
  const enhancementAssignmentMap = new Map<string, { playerIndex?: number; pointsCost?: number; confidence: ConfidenceLevel }>();
  for (const assignment of aiResponse.enhancementAssignments) {
    enhancementAssignmentMap.set(assignment.name.toLowerCase(), {
      playerIndex: assignment.playerIndex ?? undefined,
      pointsCost: assignment.pointsCost ?? undefined,
      confidence: assignment.confidence,
    });
  }

  const enhancements: ExtractedEnhancement[] = [...preprocessed.enhancementMentions.entries()].map(([name, timestamps]) => {
    const assignment = enhancementAssignmentMap.get(name.toLowerCase());
    return {
      name,
      canonicalName: name,
      playerIndex: assignment?.playerIndex,
      pointsCost: assignment?.pointsCost,
      confidence: assignment?.confidence ?? 'medium',
      videoTimestamps: timestamps,
      mentionCount: timestamps.length,
    };
  });

  // Build players with faction IDs
  const players: ExtractedPlayer[] = aiResponse.players.map((p) => ({
    name: p.name,
    faction: p.faction,
    factionId: findFactionByName(p.faction)?.id,
    detachment: p.detachment ?? undefined,
    confidence: p.confidence,
  }));

  // Build preprocessing artifacts
  const preprocessingData: PreprocessingArtifacts = {
    termMatches: preprocessed.matches,
    colloquialMappings: preprocessed.colloquialToOfficial,
    llmMappings,
    normalizedSegments: preprocessed.normalizedSegments,
    factionMentions: preprocessed.factionMentions,
    detachmentMentions: preprocessed.detachmentMentions,
    objectiveMentions: preprocessed.objectiveMentions,
  };

  const processingTimeMs = Date.now() - startTime;

  return {
    players: players.length === 2 ? [players[0]!, players[1]!] : [players[0]!],
    units: enrichedUnits,
    stratagems,
    enhancements,
    mission: aiResponse.mission ?? undefined,
    pointsLimit: aiResponse.pointsLimit ?? undefined,
    preprocessingData,
    extractedAt: Date.now(),
    processingTimeMs,
    videoId: options.videoId,
  };
}

/**
 * Convert EnhancedExtractionResult to BattleReport for backward compatibility.
 * Allows gradual migration - HUD can consume either format.
 */
export function toHudBattleReport(result: EnhancedExtractionResult): BattleReport {
  return {
    players: result.players.map(p => ({
      name: p.name,
      faction: p.faction,
      detachment: p.detachment,
      confidence: p.confidence,
    })) as BattleReport['players'],
    units: result.units.map(u => ({
      name: u.name,
      playerIndex: u.playerIndex,
      confidence: u.confidence,
      pointsCost: u.pointsCost,
      stats: u.stats,
      keywords: u.keywords,
      isValidated: u.isValidated,
      suggestedMatch: u.suggestedMatch ? {
        name: u.suggestedMatch.name,
        confidence: u.suggestedMatch.confidence,
      } : undefined,
      videoTimestamp: u.videoTimestamps[0],
    })),
    stratagems: result.stratagems.map(s => ({
      name: s.name,
      playerIndex: s.playerIndex,
      confidence: s.confidence,
      videoTimestamp: s.videoTimestamps[0],
    })),
    enhancements: result.enhancements.length > 0
      ? result.enhancements.map(e => ({
          name: e.name,
          playerIndex: e.playerIndex,
          pointsCost: e.pointsCost,
          detachment: e.detachment,
          confidence: e.confidence,
          videoTimestamp: e.videoTimestamps[0],
        }))
      : undefined,
    mission: result.mission,
    pointsLimit: result.pointsLimit,
    extractedAt: result.extractedAt,
  };
}
