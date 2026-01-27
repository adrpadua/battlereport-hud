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
export function createStageArtifact(stage: number, name: string): StageArtifact {
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
export function completeStageArtifact(
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
  subfaction?: string;  // e.g., "Blood Angels" for Space Marines, "Ulthwé" for Aeldari
  detachment: string;
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
  subfaction: z.string().nullable().optional(),
  detachment: z.string(),
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

/**
 * Clean up entity names that may have annotations from AI output.
 * Removes all trailing parenthetical content like:
 * - Type annotations: "(unit)", "(stratagem)", "(enhancement)"
 * - Descriptive suffixes: "(6 model unit)", "(unit 1)", "(deep strike)"
 * - Model counts: "(15)", "(10)"
 * - Context notes: "(proxied as Raveners)", "(mentioned as an idea)"
 */
export function cleanEntityName(name: string): string {
  // Strip all trailing parenthetical content
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// Static system prompt for better prompt caching (dynamic content moved to user prompt)
const SYSTEM_PROMPT = `You are an expert at analyzing Warhammer 40,000 battle report videos. Your task is to extract ALL units, characters, and vehicles mentioned in the transcript.

You must respond with a valid JSON object matching this schema:

{
  "players": [
    {
      "name": "Player name or identifier",
      "faction": "Parent faction - e.g., Space Marines, Necrons, Aeldari",
      "subfaction": "Chapter/Craftworld/etc. - e.g., Blood Angels, Ultramarines, Ulthwé (null if not applicable)",
      "detachment": "REQUIRED - e.g., Gladius Task Force, Awakened Dynasty",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "units": [
    {
      "name": "Exact unit name only, e.g., Intercessor Squad",
      "playerIndex": 0 | 1,
      "confidence": "high" | "medium" | "low",
      "pointsCost": "number or null",
      "videoTimestamp": "number (seconds) or null"
    }
  ],
  "stratagems": [
    {
      "name": "Exact stratagem name only, e.g., Armour of Contempt",
      "playerIndex": 0 | 1 | null,
      "confidence": "high" | "medium" | "low",
      "videoTimestamp": "number (seconds) or null"
    }
  ],
  "mission": "string or null",
  "pointsLimit": "number or null"
}

IMPORTANT: For all "name" fields, output ONLY the canonical unit/stratagem name with NO parenthetical content. Examples of what NOT to include:
- Type annotations: "(unit)", "(stratagem)"
- Model counts: "(15)", "(6 model unit)", "(10 models)"
- Unit numbering: "(unit 1)", "(unit 2)"
- Context notes: "(deep strike)", "(proxied as X)", "(mentioned as an idea)"
- Loadouts: "(mortar)", "(mining laser)"
Just output the base unit name like "Intercessor Squad" or "Zoanthropes", not "Zoanthropes (6 model unit)".

Guidelines:
- Extract player names and their factions accurately
- SUBFACTION is OPTIONAL - only include if explicitly mentioned or clearly identifiable:
  - Space Marines: subfaction = chapter (Blood Angels, Dark Angels, Space Wolves, Deathwatch, Black Templars, Ultramarines, Imperial Fists, etc.)
  - Aeldari: subfaction = Craftworld (Ulthwé, Biel-Tan, Saim-Hann, Iyanden, etc.)
  - Chaos Daemons: subfaction = Chaos God (Khorne, Nurgle, Tzeentch, Slaanesh) ONLY if running mono-god. Mixed daemon armies have no subfaction.
  - If no subfaction is mentioned or identifiable, leave it as null
- IMPORTANT: When multiple copies of the same unit are in an army list (e.g., "2x Intercessor Squad", "three units of Hormagaunts"), create SEPARATE entries in the units array for each copy. Do NOT combine them into one entry. Each datasheet instance should be its own array element.
- IMPORTANT: Detachment is REQUIRED for each player. Use EXACT names from the CANONICAL DETACHMENT NAMES section when possible. If not explicitly stated, infer from stratagems used or unit composition. Use "Unknown" only as last resort.
- IMPORTANT: Extract ALL units mentioned throughout the entire transcript, not just the army list section
- Include characters (e.g., Chaplain, Captain, Overlord), infantry squads, vehicles, monsters, and any other units
- Assign each unit to player 0 or player 1 based on context (who owns/controls it)
- Confidence levels:
  - "high": Unit clearly named and associated with a player
  - "medium": Unit mentioned but player association less clear
  - "low": Partial name or uncertain identification
- For stratagems, include the approximate video timestamp (in seconds) when mentioned. The transcript includes timestamps in [Xs] format.`;

/**
 * Build user prompt with video data.
 */
function buildUserPrompt(
  videoData: VideoData,
  factionUnitNames?: Map<string, string[]>,
  factionDetachmentNames?: Map<string, string[]>
): string {
  let prompt = `Analyze this Warhammer 40,000 battle report video and extract the army lists and game information.

VIDEO TITLE: ${videoData.title}

CHANNEL: ${videoData.channel}

DESCRIPTION:
${videoData.description}
`;

  // Add canonical detachment names to user prompt
  if (factionDetachmentNames && factionDetachmentNames.size > 0) {
    prompt += '\n\nCANONICAL DETACHMENT NAMES BY FACTION:';
    prompt += '\nUse EXACT names from these lists. Each faction has specific detachments - do not use detachments from other factions.';

    for (const [faction, detachments] of factionDetachmentNames) {
      prompt += `\n\n${faction.toUpperCase()}:\n${detachments.join(', ')}`;
    }
  }

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
  rawAiResponse: string; // Raw JSON string from OpenAI (for caching)
}

/**
 * Extraction options with optional artifact callback.
 */
export interface ExtractBattleReportOptions {
  videoData: VideoData;
  factions: [string, string];
  factionUnitNames: Map<string, string[]>;
  factionDetachmentNames?: Map<string, string[]>;
  apiKey: string;
  onStageComplete?: (artifact: StageArtifact) => void;
  /** If provided, skip OpenAI call and use this cached response */
  cachedAiResponse?: string;
}

/**
 * Extract battle report using OpenAI with artifact tracking.
 */
export async function extractBattleReportWithArtifacts(
  options: ExtractBattleReportOptions
): Promise<ExtractionResultWithArtifacts> {
  const { videoData, factionUnitNames, factionDetachmentNames, apiKey, onStageComplete, cachedAiResponse } = options;
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

  let content: string;

  // Check if we have a cached AI response
  if (cachedAiResponse) {
    // Skip stages 1-2, use cached response
    const now = Date.now();
    const cacheArtifact: StageArtifact = {
      stage: 0,
      name: 'ai-cache-hit',
      status: 'completed',
      startedAt: now,
      completedAt: now,
      durationMs: 0,
      summary: `Using cached AI response (${cachedAiResponse.length} chars)`,
      details: { responseLength: cachedAiResponse.length },
    };
    emitArtifact(cacheArtifact);
    console.log(`Using cached AI response for video ${videoData.videoId}`);
    content = cachedAiResponse;
  } else {
    // Stage 1: Prepare prompt
    let stage1 = createStageArtifact(1, 'prepare-prompt');
    emitArtifact(stage1);

    const unitCount =
      factionUnitNames.size > 0
        ? [...factionUnitNames.values()].reduce((sum, arr) => sum + arr.length, 0)
        : 0;
    const detachmentCount =
      factionDetachmentNames && factionDetachmentNames.size > 0
        ? [...factionDetachmentNames.values()].reduce((sum, arr) => sum + arr.length, 0)
        : 0;
    const userPrompt = buildUserPrompt(videoData, factionUnitNames, factionDetachmentNames);

    stage1 = completeStageArtifact(
      stage1,
      `Prompt prepared with ${unitCount} units, ${detachmentCount} detachments, ${userPrompt.length} chars`,
      { promptLength: userPrompt.length, unitCount, detachmentCount }
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

    const responseContent = response.choices[0]?.message?.content;
    if (!responseContent) {
      stage2 = failStageArtifact(stage2, 'No response from AI');
      emitArtifact(stage2);
      console.error('OpenAI response:', JSON.stringify(response, null, 2));
      throw new Error('No response from AI');
    }

    content = responseContent;

    stage2 = completeStageArtifact(stage2, `AI response received (${content.length} chars)`, {
      responseLength: content.length,
      finishReason: response.choices[0]?.finish_reason,
    });
    emitArtifact(stage2);
  }

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
      subfaction: p.subfaction ?? undefined,
      detachment: p.detachment ?? undefined,
      confidence: p.confidence,
    })) as BattleReport['players'],
    units: validated.units.map((u) => ({
      name: cleanEntityName(u.name),
      playerIndex: u.playerIndex,
      confidence: u.confidence,
      pointsCost: u.pointsCost ?? undefined,
    })),
    stratagems: validated.stratagems.map((s) => ({
      name: cleanEntityName(s.name),
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
    rawAiResponse: content,
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
 * Uses exact matching to avoid partial matches (e.g., "Space Marines" matching "Chaos Space Marines").
 */
async function findFaction(db: Database, query: string) {
  const slug = query.toLowerCase().replace(/\s+/g, '-');

  // First try exact name match (case-insensitive)
  let [faction] = await db
    .select()
    .from(schema.factions)
    .where(ilike(schema.factions.name, query))
    .limit(1);

  if (faction) return faction;

  // Try exact slug match
  [faction] = await db
    .select()
    .from(schema.factions)
    .where(eq(schema.factions.slug, slug))
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
 * Patterns that indicate the AI misclassified a stratagem/ability/rule as a unit.
 * These should be filtered out.
 */
export const MISCLASSIFIED_UNIT_PATTERNS = [
  /\(stratagem/i,
  /\(ability/i,
  /\(rule/i,
  /\(reserve/i,
  /\(detachment/i,
  /\(resource/i,
  /\(reference\)/i,
  /stratagem\s*\/\s*ability/i,
  /ability\s*\/\s*stratagem/i,
  /resurgent points/i,
  /cult ambush.*token/i,
];

/**
 * Check if a unit name looks like a misclassified stratagem/ability/rule
 */
export function isMisclassifiedUnit(name: string): boolean {
  return MISCLASSIFIED_UNIT_PATTERNS.some((pattern) => pattern.test(name));
}

// Space Marine chapters that use the parent "Space Marines" detachments
const SPACE_MARINE_CHAPTERS = [
  'Blood Angels',
  'Dark Angels',
  'Space Wolves',
  'Deathwatch',
  'Black Templars',
  'Ultramarines',
  'Imperial Fists',
  'White Scars',
  'Raven Guard',
  'Salamanders',
  'Iron Hands',
];

/**
 * Normalize faction and subfaction for Space Marines.
 * If AI put chapter name in faction field, move it to subfaction.
 */
function normalizeSpaceMarineFaction(player: Player): Player {
  const factionLower = player.faction.toLowerCase();

  // Check if faction is actually a chapter name
  const isChapterInFaction = SPACE_MARINE_CHAPTERS.some(
    (chapter) => factionLower === chapter.toLowerCase()
  );

  if (isChapterInFaction) {
    // Move chapter from faction to subfaction
    return {
      ...player,
      faction: 'Space Marines',
      subfaction: player.faction,
    };
  }

  return player;
}

/**
 * Scan transcript for known detachment names to fill in "Unknown" detachments.
 * Returns updated players with matched detachments from transcript.
 */
export function matchDetachmentsFromTranscript(
  players: Player[],
  transcript: Array<{ text: string; startTime: number }>,
  factionDetachmentNames: Map<string, string[]>
): Player[] {
  // Check if any player has unknown detachment
  const unknownPlayers = players.filter(
    p => !p.detachment || p.detachment === 'Unknown'
  );

  if (unknownPlayers.length === 0 || factionDetachmentNames.size === 0) {
    return players;
  }

  // Build combined transcript text
  const transcriptText = transcript.map(seg => seg.text).join(' ').toLowerCase();

  // Collect all detachments with faction info
  const allDetachments: { name: string; faction: string; nameLower: string }[] = [];
  for (const [faction, detachments] of factionDetachmentNames) {
    for (const detachment of detachments) {
      allDetachments.push({
        name: detachment,
        faction,
        nameLower: detachment.toLowerCase(),
      });
    }
  }

  // Sort by name length (longer first) to match specific names before partial matches
  allDetachments.sort((a, b) => b.name.length - a.name.length);

  // Find detachments mentioned in transcript
  const foundDetachments: { name: string; faction: string }[] = [];
  for (const det of allDetachments) {
    if (transcriptText.includes(det.nameLower)) {
      foundDetachments.push({ name: det.name, faction: det.faction });
    }
  }

  if (foundDetachments.length === 0) {
    console.log('No detachment names found in transcript during post-processing');
    return players;
  }

  console.log(`Found ${foundDetachments.length} detachment(s) in transcript:`, foundDetachments.map(d => d.name));

  // Match found detachments to players with unknown detachments
  const updatedPlayers = [...players];
  for (let i = 0; i < updatedPlayers.length; i++) {
    const player = updatedPlayers[i];
    if (!player || player.detachment && player.detachment !== 'Unknown') {
      continue;
    }

    // Find a detachment matching this player's faction
    const playerFactionLower = player.faction.toLowerCase();
    const matchingDetachment = foundDetachments.find(d => {
      const detFactionLower = d.faction.toLowerCase();
      return playerFactionLower.includes(detFactionLower) ||
             detFactionLower.includes(playerFactionLower) ||
             // Space Marines chapters share detachments
             (playerFactionLower === 'space marines' || detFactionLower === 'space marines');
    });

    if (matchingDetachment) {
      console.log(`Post-processing: Matched detachment "${matchingDetachment.name}" to player "${player.name}" (${player.faction})`);
      updatedPlayers[i] = { ...player, detachment: matchingDetachment.name };
      // Remove from found list so it doesn't match another player
      const idx = foundDetachments.indexOf(matchingDetachment);
      if (idx !== -1) {
        foundDetachments.splice(idx, 1);
      }
    }
  }

  return updatedPlayers;
}

/**
 * Validates and corrects player detachments against the database.
 * Ensures each player's detachment belongs to their faction.
 * Handles subfactions (e.g., Space Marine chapters use parent faction's detachments).
 */
export async function validateDetachments(
  players: Player[],
  db: Database
): Promise<Player[]> {
  const validatedPlayers: Player[] = [];

  for (let player of players) {
    // Normalize Space Marines faction/subfaction
    player = normalizeSpaceMarineFaction(player);

    // For detachment lookup, use the parent faction
    // (e.g., "Space Marines" for all SM chapters)
    const factionForDetachments = player.faction;

    // Find faction in database
    const faction = await findFaction(db, factionForDetachments);

    if (!faction) {
      // Faction not found, keep player as-is
      validatedPlayers.push(player);
      continue;
    }

    // Get detachments for this faction
    const detachments = await db
      .select({ name: schema.detachments.name })
      .from(schema.detachments)
      .where(eq(schema.detachments.factionId, faction.id));

    const detachmentNames = detachments.map((d) => d.name);

    // Check if the detected detachment is valid for this faction
    const isValidDetachment = detachmentNames.some(
      (name) => name.toLowerCase() === player.detachment.toLowerCase()
    );

    if (isValidDetachment) {
      validatedPlayers.push(player);
    } else {
      // Try fuzzy matching
      const lowerDetachment = player.detachment.toLowerCase();
      const fuzzyMatch = detachmentNames.find((name) =>
        name.toLowerCase().includes(lowerDetachment) ||
        lowerDetachment.includes(name.toLowerCase())
      );

      if (fuzzyMatch) {
        console.log(
          `Corrected detachment for ${player.faction}${player.subfaction ? ` (${player.subfaction})` : ''}: "${player.detachment}" -> "${fuzzyMatch}"`
        );
        validatedPlayers.push({ ...player, detachment: fuzzyMatch });
      } else {
        console.log(
          `Invalid detachment "${player.detachment}" for ${player.faction}. Valid options: ${detachmentNames.join(', ')}`
        );
        validatedPlayers.push({ ...player, detachment: 'Unknown' });
      }
    }
  }

  return validatedPlayers;
}

/**
 * Enriches units with stats and keywords from the database.
 * Filters out units that don't match the database or are misclassified stratagems/abilities.
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
    // Skip units that look like misclassified stratagems/abilities
    if (isMisclassifiedUnit(unit.name)) {
      console.log(`Filtering out misclassified unit: "${unit.name}"`);
      continue;
    }

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
        // Use database points cost, falling back to AI-extracted value
        pointsCost: dbUnit.pointsCost ?? unit.pointsCost,
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
      // Filter out units that don't match the database
      // These are likely misheard names or non-existent units
      console.log(`Filtering out unvalidated unit: "${unit.name}"`);
    }
  }

  return enrichedUnits;
}
