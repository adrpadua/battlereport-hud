/**
 * Battle report extraction service using OpenAI.
 *
 * This service handles the AI-powered extraction of battle report data
 * from YouTube video transcripts.
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { eq, ilike, or, and } from 'drizzle-orm';
import type { TranscriptSegment, Chapter } from './youtube-service.js';
import type { Database } from '../db/connection.js';
import * as schema from '../db/schema.js';

// ============================================================================
// Pipeline Stage Artifacts
// ============================================================================

/**
 * Individual stage artifact capturing timing and results.
 */
export interface StageArtifact {
  stage: number;
  name: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  summary: string;
  details?: Record<string, unknown>;
  error?: string;
}

/**
 * Create a new stage artifact with running status.
 */
function createStageArtifact(stage: number, name: string): StageArtifact {
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

// Types
export interface VideoData {
  videoId: string;
  title: string;
  channel: string;
  description: string;
  chapters: Chapter[];
  transcript: TranscriptSegment[];
  pinnedComment: string | null;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface Player {
  name: string;
  faction: string;
  detachment?: string;
  confidence: ConfidenceLevel;
}

export interface UnitStats {
  movement: string;
  toughness: number;
  save: string;
  wounds: number;
  leadership: string;
  objectiveControl: number;
}

export interface Unit {
  name: string;
  playerIndex: number;
  confidence: ConfidenceLevel;
  pointsCost?: number;
  videoTimestamp?: number;
  stats?: UnitStats;
  keywords?: string[];
  isValidated?: boolean;
}

export interface Stratagem {
  name: string;
  playerIndex?: number;
  confidence: ConfidenceLevel;
  videoTimestamp?: number;
}

export interface BattleReport {
  players: [Player, Player] | [Player];
  units: Unit[];
  stratagems: Stratagem[];
  mission?: string;
  pointsLimit?: number;
  extractedAt: number;
}

// Zod schemas for validation
const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low']);

const PlayerSchema = z.object({
  name: z.string(),
  faction: z.string(),
  detachment: z.string().nullable().optional(),
  confidence: ConfidenceLevelSchema,
});

const UnitSchema = z.object({
  name: z.string(),
  playerIndex: z.number().min(0).max(1),
  confidence: ConfidenceLevelSchema,
  pointsCost: z.number().nullable().optional(),
});

const StratagemSchema = z.object({
  name: z.string(),
  playerIndex: z.number().min(0).max(1).nullable().optional(),
  confidence: ConfidenceLevelSchema,
  videoTimestamp: z.number().nullable().optional(),
});

const BattleReportExtractionSchema = z.object({
  players: z.array(PlayerSchema).min(1).max(2),
  units: z.array(UnitSchema),
  stratagems: z.array(StratagemSchema),
  mission: z.string().nullable().optional(),
  pointsLimit: z.number().nullable().optional(),
});

// Faction detection patterns
const FACTION_PATTERNS: [RegExp, string][] = [
  [/\bspace\s*marines?\b|\bastartes\b/i, 'Space Marines'],
  [/\bnecrons?\b/i, 'Necrons'],
  [/\borks?\b/i, 'Orks'],
  [/\btyranids?\b|\bnids?\b/i, 'Tyranids'],
  [/\baeldari\b|\beldar\b|\bcraftworld/i, 'Aeldari'],
  [/\bdrukhari\b|\bdark\s*eldar/i, 'Drukhari'],
  [/\bt'?au\b/i, "T'au Empire"],
  [/\bchaos\s*space\s*marines?\b|\bcsm\b/i, 'Chaos Space Marines'],
  [/\bdeath\s*guard\b/i, 'Death Guard'],
  [/\bthousand\s*sons?\b/i, 'Thousand Sons'],
  [/\bworld\s*eaters?\b/i, 'World Eaters'],
  [/\bchaos\s*daemons?\b|\bdaemons?\b/i, 'Chaos Daemons'],
  [/\bimperial\s*knights?\b/i, 'Imperial Knights'],
  [/\bchaos\s*knights?\b/i, 'Chaos Knights'],
  [/\bastra\s*militarum\b|\bimperial\s*guard\b/i, 'Astra Militarum'],
  [/\badeptus\s*custodes\b|\bcustodes\b/i, 'Adeptus Custodes'],
  [/\badepta\s*sororitas\b|\bsisters\b/i, 'Adepta Sororitas'],
  [/\badeptus\s*mechanicus\b|\badmech\b/i, 'Adeptus Mechanicus'],
  [/\bgrey\s*knights?\b/i, 'Grey Knights'],
  [/\bblood\s*angels?\b/i, 'Blood Angels'],
  [/\bdark\s*angels?\b/i, 'Dark Angels'],
  [/\bblack\s*templars?\b/i, 'Black Templars'],
  [/\bspace\s*wolves?\b/i, 'Space Wolves'],
  [/\bgenestealer\s*cults?\b|\bgsc\b/i, 'Genestealer Cults'],
  [/\bleagues?\s*(of\s*)?votann\b/i, 'Leagues of Votann'],
  [/\bemperor'?s?\s*children\b/i, "Emperor's Children"],
];

// All available factions
export const ALL_FACTIONS = [
  'Adepta Sororitas',
  'Adeptus Custodes',
  'Adeptus Mechanicus',
  'Aeldari',
  'Agents of the Imperium',
  'Astra Militarum',
  'Black Templars',
  'Blood Angels',
  'Chaos Daemons',
  'Chaos Knights',
  'Chaos Space Marines',
  'Dark Angels',
  'Death Guard',
  'Deathwatch',
  'Drukhari',
  "Emperor's Children",
  'Genestealer Cults',
  'Grey Knights',
  'Imperial Knights',
  'Leagues of Votann',
  'Necrons',
  'Orks',
  'Space Marines',
  'Space Wolves',
  "T'au Empire",
  'Thousand Sons',
  'Tyranids',
  'World Eaters',
];

/**
 * Detect faction names from video metadata.
 */
export function detectFactionNamesFromVideo(videoData: VideoData): string[] {
  const searchText = [videoData.title, videoData.description, videoData.pinnedComment ?? ''].join(
    ' '
  );
  const detectedFactions: string[] = [];

  for (const [pattern, factionName] of FACTION_PATTERNS) {
    if (pattern.test(searchText) && !detectedFactions.includes(factionName)) {
      detectedFactions.push(factionName);
    }
  }

  return detectedFactions;
}

/**
 * Format transcript segments with timestamps.
 */
function formatTranscriptSegments(segments: TranscriptSegment[]): string {
  return segments.map((seg) => `[${Math.floor(seg.startTime)}s] ${seg.text}`).join(' ');
}

/**
 * Build transcript section with full transcript.
 * GPT-5 mini has 400k token context window, so we can include everything.
 */
function buildTranscriptSection(videoData: VideoData): string {
  const { transcript } = videoData;

  if (transcript.length === 0) {
    return '';
  }

  // Include full transcript - GPT-5 mini can handle it
  return formatTranscriptSegments(transcript);
}

// Static system prompt for better prompt caching (dynamic content moved to user prompt)
const SYSTEM_PROMPT = `You are an expert at analyzing Warhammer 40,000 battle report videos. Your task is to extract ALL units, characters, and vehicles mentioned in the transcript.

You must respond with a valid JSON object containing the extracted battle report data.

Guidelines:
- Extract player names and their factions accurately
- IMPORTANT: Extract ALL units mentioned throughout the entire transcript, not just the army list section
- Include characters (e.g., Chaplain, Captain, Overlord), infantry squads, vehicles, monsters, and any other units
- Assign each unit to player 0 or player 1 based on context (who owns/controls it)
- Confidence levels:
  - "high": Unit clearly named and associated with a player
  - "medium": Unit mentioned but player association less clear
  - "low": Partial name or uncertain identification

Your JSON response must include: players (array with name, faction, detachment, confidence), units (array with name, playerIndex, confidence, pointsCost), stratagems (array with name, playerIndex, confidence, videoTimestamp), mission (optional string), and pointsLimit (optional number).

- For each stratagem, include the approximate video timestamp (in seconds) when it was mentioned. The transcript includes timestamps in [Xs] format - use these to determine the videoTimestamp value.`;

/**
 * Build user prompt with video data.
 */
function buildUserPrompt(videoData: VideoData, factionUnitNames?: Map<string, string[]>): string {
  let prompt = `Analyze this Warhammer 40,000 battle report video and extract the army lists and game information.

VIDEO TITLE: ${videoData.title}

CHANNEL: ${videoData.channel}

DESCRIPTION:
${videoData.description}
`;

  // Add canonical unit names to user prompt (moved from system prompt for better caching)
  if (factionUnitNames && factionUnitNames.size > 0) {
    prompt += '\n\nCANONICAL UNIT NAMES BY FACTION:';
    prompt += '\nUse EXACT names from these lists when possible. Prefer these official names over abbreviations or nicknames.';

    for (const [faction, units] of factionUnitNames) {
      // Include all unit names - GPT-5 mini has 400k context
      prompt += `\n\n${faction.toUpperCase()}:\n${units.join(', ')}`;
    }
  }

  if (videoData.chapters.length > 0) {
    prompt += `\n\nCHAPTERS:\n`;
    for (const chapter of videoData.chapters) {
      const minutes = Math.floor(chapter.startTime / 60);
      const seconds = chapter.startTime % 60;
      prompt += `${minutes}:${seconds.toString().padStart(2, '0')} - ${chapter.title}\n`;
    }
  }

  if (videoData.pinnedComment) {
    prompt += `\n\nPINNED COMMENT:\n${videoData.pinnedComment}`;
  }

  const transcriptText = buildTranscriptSection(videoData);
  if (transcriptText) {
    // GPT-5 mini has 400k token context - include full transcript
    prompt += `\n\nTRANSCRIPT:\n${transcriptText}`;
  }

  return prompt;
}

/**
 * Extended extraction result with artifacts.
 */
export interface ExtractionResultWithArtifacts {
  report: BattleReport;
  artifacts: StageArtifact[];
}

/**
 * Extraction options with optional artifact callback.
 */
export interface ExtractBattleReportOptions {
  videoData: VideoData;
  factions: [string, string];
  factionUnitNames: Map<string, string[]>;
  apiKey: string;
  onStageComplete?: (artifact: StageArtifact) => void;
}

/**
 * Extract battle report using OpenAI with artifact tracking.
 */
export async function extractBattleReportWithArtifacts(
  options: ExtractBattleReportOptions
): Promise<ExtractionResultWithArtifacts> {
  const { videoData, factionUnitNames, apiKey, onStageComplete } = options;
  const startTime = Date.now();
  const artifacts: StageArtifact[] = [];

  const emitArtifact = (artifact: StageArtifact) => {
    const existingIndex = artifacts.findIndex((a) => a.stage === artifact.stage);
    if (existingIndex >= 0) {
      artifacts[existingIndex] = artifact;
    } else {
      artifacts.push(artifact);
    }
    onStageComplete?.(artifact);
  };

  // Stage 1: Prepare prompt
  let stage1 = createStageArtifact(1, 'prepare-prompt');
  emitArtifact(stage1);

  const unitCount =
    factionUnitNames.size > 0
      ? [...factionUnitNames.values()].reduce((sum, arr) => sum + arr.length, 0)
      : 0;
  const userPrompt = buildUserPrompt(videoData, factionUnitNames);

  stage1 = completeStageArtifact(
    stage1,
    `Prompt prepared with ${unitCount} unit names, ${userPrompt.length} chars`,
    { promptLength: userPrompt.length, unitCount }
  );
  emitArtifact(stage1);

  // Stage 2: Call OpenAI
  let stage2 = createStageArtifact(2, 'ai-extraction');
  emitArtifact(stage2);

  const openai = new OpenAI({
    apiKey,
    timeout: 180000, // 3 minute timeout for reasoning models
  });
  console.log('Calling OpenAI with model: gpt-5-mini');
  console.log('User prompt length:', userPrompt.length, 'chars');
  console.log('Waiting for OpenAI response (may take 1-3 minutes for reasoning models)...');

  // Save prompt to file for debugging
  const fs = await import('fs');
  const path = await import('path');
  const promptPath = path.join(process.cwd(), '..', 'test-data', `prompt-${videoData.videoId}.txt`);
  const fullPrompt = `=== SYSTEM PROMPT ===\n${SYSTEM_PROMPT}\n\n=== USER PROMPT ===\n${userPrompt}`;
  fs.writeFileSync(promptPath, fullPrompt);
  console.log('Saved prompt to:', promptPath);

  let response;
  try {
    response = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      max_completion_tokens: 16000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    });
  } catch (error) {
    console.error('OpenAI API error:', error);
    stage2 = failStageArtifact(stage2, error instanceof Error ? error.message : 'AI call failed');
    emitArtifact(stage2);
    throw error;
  }

  console.log('OpenAI response received, finish_reason:', response.choices[0]?.finish_reason);

  const content = response.choices[0]?.message?.content;
  if (!content) {
    stage2 = failStageArtifact(stage2, 'No response from AI');
    emitArtifact(stage2);
    console.error('OpenAI response:', JSON.stringify(response, null, 2));
    throw new Error('No response from AI');
  }

  stage2 = completeStageArtifact(stage2, `AI response received (${content.length} chars)`, {
    responseLength: content.length,
    finishReason: response.choices[0]?.finish_reason,
  });
  emitArtifact(stage2);

  // Stage 3: Parse and validate response
  let stage3 = createStageArtifact(3, 'parse-response');
  emitArtifact(stage3);

  let validated;
  try {
    const parsed = JSON.parse(content);
    validated = BattleReportExtractionSchema.parse(parsed);
  } catch (error) {
    stage3 = failStageArtifact(stage3, error instanceof Error ? error.message : 'Parse failed');
    emitArtifact(stage3);
    throw error;
  }

  const player1 = validated.players[0]?.name || 'Unknown';
  const player1Faction = validated.players[0]?.faction || 'Unknown';
  const player2 = validated.players[1]?.name || 'Unknown';
  const player2Faction = validated.players[1]?.faction || 'Unknown';

  stage3 = completeStageArtifact(
    stage3,
    `${player1} (${player1Faction}) vs ${player2} (${player2Faction}), ${validated.units.length} units`,
    {
      playerCount: validated.players.length,
      unitCount: validated.units.length,
      stratagemCount: validated.stratagems.length,
    }
  );
  emitArtifact(stage3);

  // Stage 4: Build report
  let stage4 = createStageArtifact(4, 'build-report');
  emitArtifact(stage4);

  const report: BattleReport = {
    players: validated.players.map((p) => ({
      name: p.name,
      faction: p.faction,
      detachment: p.detachment ?? undefined,
      confidence: p.confidence,
    })) as BattleReport['players'],
    units: validated.units.map((u) => ({
      name: u.name,
      playerIndex: u.playerIndex,
      confidence: u.confidence,
      pointsCost: u.pointsCost ?? undefined,
    })),
    stratagems: validated.stratagems.map((s) => ({
      name: s.name,
      playerIndex: s.playerIndex ?? undefined,
      confidence: s.confidence,
      videoTimestamp: s.videoTimestamp ?? undefined,
    })),
    mission: validated.mission ?? undefined,
    pointsLimit: validated.pointsLimit ?? undefined,
    extractedAt: Date.now(),
  };

  const totalMs = Date.now() - startTime;
  stage4 = completeStageArtifact(
    stage4,
    `Report built, total ${(totalMs / 1000).toFixed(1)}s`,
    { processingTimeMs: totalMs }
  );
  emitArtifact(stage4);

  return {
    report,
    artifacts: artifacts.filter((a) => a.status === 'completed' || a.status === 'failed'),
  };
}

/**
 * Extract battle report using OpenAI.
 * @deprecated Use extractBattleReportWithArtifacts for artifact tracking
 */
export async function extractBattleReport(
  videoData: VideoData,
  factions: [string, string],
  factionUnitNames: Map<string, string[]>,
  apiKey: string
): Promise<BattleReport> {
  const result = await extractBattleReportWithArtifacts({
    videoData,
    factions,
    factionUnitNames,
    apiKey,
  });
  return result.report;
}

/**
 * Find a faction by name or slug.
 */
async function findFaction(db: Database, query: string) {
  const [faction] = await db
    .select()
    .from(schema.factions)
    .where(
      or(
        ilike(schema.factions.name, `%${query}%`),
        eq(schema.factions.slug, query.toLowerCase().replace(/\s+/g, '-'))
      )
    )
    .limit(1);

  return faction;
}

/**
 * Normalize a unit name for database lookup.
 * Strips parenthetical content (wargear options, unit sizes, etc.)
 * and cleans up common formatting variations.
 */
function normalizeUnitName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)/g, '') // Remove parenthetical content
    .replace(/\s+/g, ' ')          // Normalize whitespace
    .trim();
}

/**
 * Find a unit by name, optionally scoped to a faction.
 * Tries multiple matching strategies:
 * 1. Normalized name (stripped of parenthetical content)
 * 2. Original name as fallback
 */
async function findUnitByName(db: Database, unitName: string, factionId?: number) {
  const normalizedName = normalizeUnitName(unitName);

  // Try normalized name first (more likely to match)
  for (const searchName of [normalizedName, unitName]) {
    let whereCondition = ilike(schema.units.name, `%${searchName}%`);

    if (factionId) {
      whereCondition = and(
        ilike(schema.units.name, `%${searchName}%`),
        eq(schema.units.factionId, factionId)
      )!;
    }

    const [result] = await db
      .select()
      .from(schema.units)
      .innerJoin(schema.factions, eq(schema.units.factionId, schema.factions.id))
      .where(whereCondition)
      .limit(1);

    if (result?.units) {
      return result.units;
    }
  }

  return null;
}

/**
 * Get keywords for a unit by its ID.
 */
async function getUnitKeywords(db: Database, unitId: number): Promise<string[]> {
  const keywords = await db
    .select({ name: schema.keywords.name })
    .from(schema.unitKeywords)
    .innerJoin(schema.keywords, eq(schema.unitKeywords.keywordId, schema.keywords.id))
    .where(eq(schema.unitKeywords.unitId, unitId));

  return keywords.map((k) => k.name);
}

/**
 * Enriches units with stats and keywords from the database.
 * This matches the processBattleReport behavior from the extension.
 */
export async function enrichUnitsWithStats(
  units: Unit[],
  players: Player[],
  db: Database
): Promise<Unit[]> {
  const enrichedUnits: Unit[] = [];

  // Cache faction lookups to avoid repeated queries
  const factionCache = new Map<string, number | null>();

  for (const unit of units) {
    const player = players[unit.playerIndex];
    const factionName = player?.faction;

    // Look up faction ID (with caching)
    let factionId: number | null = null;
    if (factionName) {
      if (factionCache.has(factionName)) {
        factionId = factionCache.get(factionName) ?? null;
      } else {
        const factionRecord = await findFaction(db, factionName);
        factionId = factionRecord?.id ?? null;
        factionCache.set(factionName, factionId);
      }
    }

    // Query database for unit match
    const dbUnit = await findUnitByName(db, unit.name, factionId ?? undefined);

    if (dbUnit) {
      // Get keywords for the unit
      const keywords = await getUnitKeywords(db, dbUnit.id);

      enrichedUnits.push({
        ...unit,
        stats: {
          movement: dbUnit.movement ?? '-',
          toughness: dbUnit.toughness ?? 0,
          save: dbUnit.save ?? '-',
          wounds: dbUnit.wounds ?? 0,
          leadership: dbUnit.leadership?.toString() ?? '-',
          objectiveControl: dbUnit.objectiveControl ?? 0,
        },
        keywords,
        isValidated: true,
      });
    } else {
      // Keep the unit as-is without enrichment
      enrichedUnits.push(unit);
    }
  }

  return enrichedUnits;
}
