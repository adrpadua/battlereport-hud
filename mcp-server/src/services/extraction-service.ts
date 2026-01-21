/**
 * Battle report extraction service using OpenAI.
 *
 * This service handles the AI-powered extraction of battle report data
 * from YouTube video transcripts.
 */

import OpenAI from 'openai';
import { z } from 'zod';
import type { TranscriptSegment, Chapter } from './youtube-service.js';

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

export interface Unit {
  name: string;
  playerIndex: number;
  confidence: ConfidenceLevel;
  pointsCost?: number;
  videoTimestamp?: number;
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

// Keywords indicating army list chapters
const ARMY_LIST_CHAPTER_KEYWORDS = ['army', 'list', 'lists', 'forces', 'armies', 'roster'];

// Keywords indicating army list discussion
const ARMY_LIST_KEYWORDS = [
  'army list',
  'my list',
  'the list',
  'list for',
  'the lists',
  'running with',
  "i'm playing",
  'playing with',
  "i'm running",
  'points of',
  '2000 points',
  '2,000 points',
  '1000 points',
  '1,000 points',
  'strike force',
  'incursion',
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
 * Find chapters that likely contain army list discussion.
 */
function findArmyListChapters(chapters: Chapter[]): Chapter[] {
  return chapters.filter((ch) =>
    ARMY_LIST_CHAPTER_KEYWORDS.some((kw) => ch.title.toLowerCase().includes(kw))
  );
}

/**
 * Get the end time for a chapter.
 */
function getChapterEndTime(chapter: Chapter, chapters: Chapter[]): number {
  const idx = chapters.indexOf(chapter);
  const nextChapter = chapters[idx + 1];
  return nextChapter?.startTime ?? chapter.startTime + 300; // default 5 min
}

/**
 * Find transcript segments that discuss army lists based on keywords.
 */
function findArmyListByKeywords(transcript: TranscriptSegment[]): TranscriptSegment[] {
  const result: TranscriptSegment[] = [];
  let inArmySection = false;
  let sectionEndTime = 0;

  for (const seg of transcript) {
    const lower = seg.text.toLowerCase();
    const startsSection = ARMY_LIST_KEYWORDS.some((kw) => lower.includes(kw));

    if (startsSection && !inArmySection) {
      inArmySection = true;
      sectionEndTime = seg.startTime + 180; // 3 min window
    }

    if (inArmySection) {
      result.push(seg);
      if (
        seg.startTime > sectionEndTime ||
        lower.includes('deploy') ||
        lower.includes('first turn')
      ) {
        inArmySection = false;
      }
    }
  }

  return result;
}

/**
 * Sample gameplay segments at regular intervals.
 */
function sampleGameplaySegments(
  transcript: TranscriptSegment[],
  afterTime: number
): TranscriptSegment[] {
  const samples: TranscriptSegment[] = [];
  const sampleTimes = [300, 600, 900, 1200, 1500, 1800, 2400, 3000, 3600];

  for (const time of sampleTimes) {
    if (time <= afterTime) continue;
    const window = transcript.filter(
      (seg) => seg.startTime >= time && seg.startTime < time + 120
    );
    samples.push(...window);
  }

  return samples;
}

/**
 * Remove duplicate segments and sort by time.
 */
function dedupeSegments<T extends { startTime: number }>(segments: T[]): T[] {
  const seen = new Set<number>();
  return segments
    .filter((seg) => {
      const key = Math.floor(seg.startTime);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.startTime - b.startTime);
}

/**
 * Format transcript segments with timestamps.
 */
function formatTranscriptSegments(segments: TranscriptSegment[]): string {
  return segments.map((seg) => `[${Math.floor(seg.startTime)}s] ${seg.text}`).join(' ');
}

/**
 * Build transcript section using chapter-aware and keyword-based detection.
 */
function buildTranscriptSection(videoData: VideoData): string {
  const { transcript, chapters } = videoData;

  if (transcript.length === 0) {
    return '';
  }

  // Strategy 1: Use chapters if available
  if (chapters.length > 0) {
    const armyChapters = findArmyListChapters(chapters);

    if (armyChapters.length > 0) {
      const armyListSegments = armyChapters.flatMap((ch) => {
        const endTime = getChapterEndTime(ch, chapters);
        return transcript.filter(
          (seg) => seg.startTime >= ch.startTime && seg.startTime < endTime
        );
      });

      const introSegments = transcript.filter((seg) => seg.startTime < 300);
      const sampledSegments = sampleGameplaySegments(transcript, 300);

      const allSegments = dedupeSegments([
        ...introSegments,
        ...armyListSegments,
        ...sampledSegments,
      ]);

      return formatTranscriptSegments(allSegments);
    }
  }

  // Strategy 2: Fallback
  const introSegments = transcript.filter((seg) => seg.startTime < 300);
  const armyListByKeyword = findArmyListByKeywords(transcript);
  const sampledSegments = sampleGameplaySegments(transcript, 300);

  return formatTranscriptSegments(
    dedupeSegments([...introSegments, ...armyListByKeyword, ...sampledSegments])
  );
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
      // Limit to 50 most common units (reduced from 100)
      const limitedUnits = units.slice(0, 50);
      prompt += `\n\n${faction.toUpperCase()}:\n${limitedUnits.join(', ')}`;
      if (units.length > 50) {
        prompt += ` ... and ${units.length - 50} more`;
      }
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
    // Limit to ~12000 chars to stay within token limits
    const limitedTranscript = transcriptText.slice(0, 12000);
    prompt += `\n\nTRANSCRIPT:\n${limitedTranscript}`;

    if (transcriptText.length > 12000) {
      prompt += `\n\n[Transcript truncated - extract all units you can identify from the text above]`;
    }
  }

  return prompt;
}

/**
 * Extract battle report using OpenAI.
 */
export async function extractBattleReport(
  videoData: VideoData,
  _factions: [string, string],
  factionUnitNames: Map<string, string[]>,
  apiKey: string
): Promise<BattleReport> {
  const openai = new OpenAI({ apiKey });

  // Use static system prompt for better prompt caching
  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    max_completion_tokens: 4000, // Limit output tokens for cost control
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(videoData, factionUnitNames) },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI');
  }

  const parsed = JSON.parse(content);
  const validated = BattleReportExtractionSchema.parse(parsed);

  // Convert to BattleReport format
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

  return report;
}
