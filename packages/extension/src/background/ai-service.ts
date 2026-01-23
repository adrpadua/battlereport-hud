import OpenAI from 'openai';
import { BattleReportExtractionSchema } from '@/types/ai-response';
import type { BattleReport, Enhancement } from '@/types/battle-report';
import type { VideoData, Chapter, TranscriptSegment } from '@/types/youtube';
import type { LlmPreprocessResult } from '@/types/llm-preprocess';
import { getFactionContextForPrompt, processBattleReport } from './report-processor';
import {
  preprocessTranscript,
  preprocessTranscriptWithLlmMappings,
  enrichStratagemTimestamps,
  enrichUnitTimestamps,
  enrichEnhancementTimestamps,
  type PreprocessedTranscript,
  type NormalizedSegment,
} from './transcript-preprocessor';
import { getCachedPreprocess, setCachedPreprocess } from './cache-manager';
import { preprocessWithLlm } from './llm-preprocess-service';
import { inferFactionsFromText } from '@/utils/faction-loader';

// Keywords indicating army list chapters in video chapters
const ARMY_LIST_CHAPTER_KEYWORDS = [
  'army', 'list', 'lists', 'forces', 'armies', 'roster'
];

// Keywords indicating army list discussion in transcript
// Be specific to avoid false positives during gameplay
const ARMY_LIST_KEYWORDS = [
  'army list', 'my list', 'the list', 'list for', 'the lists',
  'running with', "i'm playing", 'playing with', "i'm running",
  'points of', '2000 points', '2,000 points', '1000 points', '1,000 points',
  'strike force', 'incursion'
];

/**
 * Find chapters that likely contain army list discussion.
 */
function findArmyListChapters(chapters: Chapter[]): Chapter[] {
  return chapters.filter(ch =>
    ARMY_LIST_CHAPTER_KEYWORDS.some(kw =>
      ch.title.toLowerCase().includes(kw)
    )
  );
}

/**
 * Get the end time for a chapter (start of next chapter or default duration).
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
    const startsSection = ARMY_LIST_KEYWORDS.some(kw => lower.includes(kw));

    if (startsSection && !inArmySection) {
      inArmySection = true;
      sectionEndTime = seg.startTime + 180; // 3 min window
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
 * Sample gameplay segments at regular intervals to catch unit mentions.
 */
function sampleGameplaySegments(
  transcript: TranscriptSegment[],
  afterTime: number
): TranscriptSegment[] {
  const samples: TranscriptSegment[] = [];
  // Sample at various time marks
  const sampleTimes = [300, 600, 900, 1200, 1500, 1800, 2400, 3000, 3600]; // 5min to 60min

  for (const time of sampleTimes) {
    if (time <= afterTime) continue;
    const window = transcript.filter(
      seg => seg.startTime >= time && seg.startTime < time + 120 // 2 min windows
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
  return segments.filter(seg => {
    const key = Math.floor(seg.startTime);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.startTime - b.startTime);
}

/**
 * Format transcript segments with timestamps.
 * Uses taggedText if available (from preprocessing), otherwise falls back to raw text.
 */
function formatTranscriptSegments(segments: Array<TranscriptSegment | NormalizedSegment>): string {
  return segments
    .map(seg => {
      // Use tagged text if available (normalized segments)
      const text = 'taggedText' in seg ? seg.taggedText : seg.text;
      return `[${Math.floor(seg.startTime)}s] ${text}`;
    })
    .join(' ');
}

/**
 * Build transcript section using chapter-aware and keyword-based detection.
 * Uses preprocessed segments with tagged/normalized text when available.
 */
function buildTranscriptSection(
  videoData: VideoData,
  preprocessed?: PreprocessedTranscript
): string {
  // Use normalized segments if available, otherwise fall back to raw transcript
  const transcript = preprocessed?.normalizedSegments ?? videoData.transcript;
  const { chapters } = videoData;

  if (transcript.length === 0) {
    return '';
  }

  // Strategy 1: Use chapters if available
  if (chapters.length > 0) {
    const armyChapters = findArmyListChapters(chapters);

    if (armyChapters.length > 0) {
      // Get full transcript for army list chapters
      const armyListSegments = armyChapters.flatMap(ch => {
        const endTime = getChapterEndTime(ch, chapters);
        return transcript.filter(
          seg => seg.startTime >= ch.startTime && seg.startTime < endTime
        );
      });

      // Also include first 5 min intro + samples from rest
      const introSegments = transcript.filter(seg => seg.startTime < 300);
      const sampledSegments = sampleGameplaySegments(transcript, 300);

      // Dedupe and combine
      const allSegments = dedupeSegments([
        ...introSegments,
        ...armyListSegments,
        ...sampledSegments
      ]);

      return formatTranscriptSegments(allSegments);
    }
  }

  // Strategy 2: Fallback - first 5 min + keyword-based army list + samples
  const introSegments = transcript.filter(seg => seg.startTime < 300);
  const armyListByKeyword = findArmyListByKeywords(transcript);
  const sampledSegments = sampleGameplaySegments(transcript, 300);

  return formatTranscriptSegments(
    dedupeSegments([...introSegments, ...armyListByKeyword, ...sampledSegments])
  );
}

// Static system prompt for better prompt caching (dynamic content moved to user prompt)
const SYSTEM_PROMPT = `You are an expert at analyzing Warhammer 40,000 battle report videos. Your task is to extract ALL units, characters, vehicles, and enhancements mentioned in the transcript.

You must respond with a valid JSON object matching this schema:

{
  "players": [
    {
      "name": "Player name or identifier",
      "faction": "e.g., Space Marines, Necrons, Aeldari",
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
  "enhancements": [
    {
      "name": "Exact enhancement name only, e.g., Artificer Armour",
      "playerIndex": 0 | 1 | null,
      "confidence": "high" | "medium" | "low",
      "pointsCost": "number or null",
      "videoTimestamp": "number (seconds) or null"
    }
  ],
  "mission": "string or null",
  "pointsLimit": "number or null"
}

IMPORTANT: For all "name" fields, output ONLY the exact unit/stratagem/enhancement name. Do NOT include type annotations like "(unit)", "(stratagem)", or "(enhancement)" in the name.

TRANSCRIPT FORMAT:
- The transcript has been pre-processed with tagged gameplay terms
- Units are tagged as [UNIT:Official Name] - use the official name from the tag
- Stratagems are tagged as [STRAT:Official Name] - use the official name from the tag
- Enhancements are tagged as [ENHANCEMENT:Official Name] - use the official name from the tag
- These tags indicate terms that have been matched to official Warhammer 40k terminology
- Always prefer the tagged official name over colloquial variations

Guidelines:
- Extract player names and their factions accurately
- IMPORTANT: When multiple copies of the same unit are in an army list (e.g., "2x Intercessor Squad", "three units of Hormagaunts"), create SEPARATE entries in the units array for each copy. Do NOT combine them into one entry. Each datasheet instance should be its own array element.
- IMPORTANT: Detachment is REQUIRED for each player. Common detachments include:
  - Space Marines: Gladius Task Force, Ironstorm Spearhead, Firestorm Assault Force, Vanguard Spearhead, etc.
  - Aeldari: Battle Host, etc.
  - Necrons: Awakened Dynasty, Canoptek Court, Hypercrypt Legion, etc.
  - If not explicitly stated, infer from stratagems used or unit composition. Use "Unknown" only as last resort.
- IMPORTANT: Extract ALL units mentioned throughout the entire transcript, not just the army list section
- Look for [UNIT:...] tags for pre-identified units with official names
- Look for [STRAT:...] tags for pre-identified stratagems
- Look for [ENHANCEMENT:...] tags for pre-identified enhancements (relics, wargear upgrades)
- Also look for untagged unit names during deployment, movement, shooting, charging, and combat phases
- Include characters (e.g., Chaplain, Captain, Overlord), infantry squads, vehicles, monsters, and any other units
- Enhancements are upgrades like "Artificer Armour", "The Honour Vehement", relics, and wargear options
- Assign each unit/enhancement to player 0 or player 1 based on context (who owns/controls it)
- Confidence levels:
  - "high": Unit/enhancement clearly named (especially if tagged) and associated with a player
  - "medium": Unit/enhancement mentioned but player association less clear
  - "low": Partial name or uncertain identification
- For stratagems and enhancements, include the approximate video timestamp (in seconds) when mentioned. The transcript includes timestamps in [Xs] format.`;

function buildUserPrompt(
  videoData: VideoData,
  preprocessed?: PreprocessedTranscript,
  factionUnitNames?: Map<string, string[]>
): string {
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

  // Include correction mappings if any were made during preprocessing
  if (preprocessed?.colloquialToOfficial && preprocessed.colloquialToOfficial.size > 0) {
    prompt += `\n\nTERM CORRECTIONS APPLIED:`;
    const corrections = [...preprocessed.colloquialToOfficial.entries()].slice(0, 20);
    for (const [colloquial, official] of corrections) {
      prompt += `\n- "${colloquial}" → "${official}"`;
    }
    if (preprocessed.colloquialToOfficial.size > 20) {
      prompt += `\n... and ${preprocessed.colloquialToOfficial.size - 20} more corrections`;
    }
  }

  // Build transcript section using chapter-aware and keyword-based detection
  // Pass preprocessed data to use tagged/normalized segments
  const transcriptText = buildTranscriptSection(videoData, preprocessed);
  if (transcriptText) {
    // Limit to ~12000 chars to stay within token limits
    const limitedTranscript = transcriptText.slice(0, 12000);
    prompt += `\n\nTRANSCRIPT (with tagged gameplay terms):\n${limitedTranscript}`;

    if (transcriptText.length > 12000) {
      prompt += `\n\n[Transcript truncated - extract all units you can identify from the text above]`;
    }
  }

  return prompt;
}

/**
 * Get list of detected faction names from video metadata.
 * Used for the faction selection UI.
 * Uses the centralized faction inference that reads from the faction index.
 */
export function detectFactionNamesFromVideo(videoData: VideoData): string[] {
  const searchText = [videoData.title, videoData.description, videoData.pinnedComment ?? ''].join(' ');
  // Use centralized inference - allow more factions for UI display
  return inferFactionsFromText(searchText, 10);
}

/**
 * Detect factions from video metadata for prompt enhancement.
 * Returns a map of detected faction names to their unit names.
 * Uses the centralized faction inference that reads from the faction index.
 *
 * @param videoData - Video metadata containing title, description, etc.
 * @param detachments - Optional map of faction name to detachment name for filtered unit lists
 */
export async function detectFactionsFromVideo(
  videoData: VideoData,
  detachments?: Map<string, string>
): Promise<Map<string, string[]>> {
  const factionUnitNames = new Map<string, string[]>();

  // Combine text for faction detection
  const searchText = [videoData.title, videoData.description, videoData.pinnedComment ?? ''].join(' ');

  // Use centralized faction inference
  const detectedFactions = inferFactionsFromText(searchText, 10);

  // Load unit names for detected factions
  for (const faction of detectedFactions) {
    const detachment = detachments?.get(faction);
    const unitNames = await getFactionContextForPrompt(faction, detachment);
    if (unitNames.length > 0) {
      factionUnitNames.set(faction, unitNames);
    }
  }

  return factionUnitNames;
}

export async function extractBattleReport(
  videoData: VideoData,
  apiKey: string
): Promise<BattleReport> {
  const openai = new OpenAI({ apiKey });

  // Detect factions and get unit names for prompt enhancement
  const factionUnitNames = await detectFactionsFromVideo(videoData);
  const allUnitNames = [...factionUnitNames.values()].flat();
  const factionNames = [...factionUnitNames.keys()];

  // Try LLM preprocessing with caching
  let preprocessed: PreprocessedTranscript;
  try {
    const cachedLlm = await getCachedPreprocess(videoData.videoId);
    let llmResult: LlmPreprocessResult | null = cachedLlm;

    if (!llmResult) {
      console.log('Running LLM preprocessing for video:', videoData.videoId);
      llmResult = await preprocessWithLlm(videoData.transcript, factionNames, apiKey);
      await setCachedPreprocess(videoData.videoId, llmResult);
      console.log('LLM preprocessing cached for video:', videoData.videoId);
    } else {
      console.log('Using cached LLM preprocess for video:', videoData.videoId);
    }

    // Use LLM mappings with pattern-based preprocessing
    preprocessed = preprocessTranscriptWithLlmMappings(
      videoData.transcript,
      allUnitNames,
      llmResult.termMappings
    );
  } catch (error) {
    console.warn('LLM preprocessing failed, falling back to pattern matching:', error);
    preprocessed = preprocessTranscript(videoData.transcript, allUnitNames);
  }

  // Use static system prompt for better prompt caching
  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    max_completion_tokens: 4000, // Limit output tokens for cost control
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(videoData, preprocessed, factionUnitNames) },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI');
  }

  const parsed = JSON.parse(content);
  const validated = BattleReportExtractionSchema.parse(parsed);

  // Convert to BattleReport format (convert null to undefined)
  const extractedStratagems = validated.stratagems.map((s) => ({
    name: s.name,
    playerIndex: s.playerIndex ?? undefined,
    confidence: s.confidence,
    videoTimestamp: s.videoTimestamp ?? undefined,
  }));

  // Enrich stratagems with timestamps from transcript preprocessing
  const enrichedStratagems = enrichStratagemTimestamps(extractedStratagems, preprocessed);

  // Convert validated units and enrich with timestamps
  const extractedUnits = validated.units.map((u) => ({
    name: u.name,
    playerIndex: u.playerIndex,
    confidence: u.confidence,
    pointsCost: u.pointsCost ?? undefined,
  }));
  const enrichedUnits = enrichUnitTimestamps(extractedUnits, preprocessed);

  // Convert validated enhancements and enrich with timestamps
  const extractedEnhancements: Enhancement[] = (validated.enhancements ?? []).map((e) => ({
    name: e.name,
    playerIndex: e.playerIndex ?? undefined,
    pointsCost: e.pointsCost ?? undefined,
    confidence: e.confidence,
    videoTimestamp: e.videoTimestamp ?? undefined,
  }));
  const enrichedEnhancements = enrichEnhancementTimestamps(extractedEnhancements, preprocessed);

  const rawReport: BattleReport = {
    players: validated.players.map((p) => ({
      name: p.name,
      faction: p.faction,
      detachment: p.detachment ?? undefined,
      confidence: p.confidence,
    })) as BattleReport['players'],
    units: enrichedUnits,
    stratagems: enrichedStratagems,
    enhancements: enrichedEnhancements.length > 0 ? enrichedEnhancements : undefined,
    mission: validated.mission ?? undefined,
    pointsLimit: validated.pointsLimit ?? undefined,
    extractedAt: Date.now(),
  };

  // Process and validate units against BSData
  const processedReport = await processBattleReport(rawReport);

  return processedReport;
}

// Legacy functions removed - use extractGame() from preprocessing module instead.
// See packages/extension/src/background/preprocessing/pipeline.ts for the unified pipeline.
