import OpenAI from 'openai';
import { BattleReportExtractionSchema, type BattleReportExtraction } from '@/types/ai-response';
import type { BattleReport, Enhancement } from '@/types/battle-report';
import type { VideoData, Chapter, TranscriptSegment } from '@/types/youtube';
import type { LlmPreprocessResult } from '@/types/llm-preprocess';
import { getFactionContextForPrompt, processBattleReport } from './report-processor';
import {
  preprocessTranscript,
  preprocessTranscriptWithLlmMappings,
  enrichStratagemTimestamps,
  enrichUnitTimestamps,
  enrichUnitMentionCounts,
  enrichEnhancementTimestamps,
  type PreprocessedTranscript,
  type NormalizedSegment,
} from './transcript-preprocessor';
import { getCachedPreprocess, setCachedPreprocess } from './cache-manager';
import { preprocessWithLlm } from './llm-preprocess-service';
import { inferFactionsFromText } from '@/utils/faction-loader';

// Chunking configuration for large transcripts
const MAX_TRANSCRIPT_CHARS_PER_CHUNK = 8000; // Smaller than LLM preprocessing (12K) to leave room for metadata
const CHUNK_OVERLAP_CHARS = 500; // Overlap for context continuity
const MAX_SINGLE_REQUEST_CHARS = 10000; // Skip chunking for short transcripts
const MAX_CONCURRENT_CHUNKS = 3; // Limit concurrent API requests
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

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

/**
 * Split transcript text into chunks for large videos.
 * Attempts to split at sentence boundaries for better context.
 */
function chunkTranscriptText(transcriptText: string): string[] {
  if (transcriptText.length <= MAX_SINGLE_REQUEST_CHARS) {
    return [transcriptText];
  }

  const chunks: string[] = [];
  let currentPosition = 0;

  while (currentPosition < transcriptText.length) {
    let endPosition = currentPosition + MAX_TRANSCRIPT_CHARS_PER_CHUNK;

    if (endPosition >= transcriptText.length) {
      // Last chunk - take the rest
      chunks.push(transcriptText.slice(currentPosition).trim());
      break;
    }

    // Try to find a sentence boundary (. ! ?) near the end
    let bestBreakPoint = endPosition;
    const searchStart = Math.max(currentPosition, endPosition - 500);

    // Look for sentence endings within the last 500 chars of the chunk
    for (let i = endPosition; i > searchStart; i--) {
      const char = transcriptText[i];
      if (char === '.' || char === '!' || char === '?') {
        // Found a sentence boundary
        bestBreakPoint = i + 1;
        break;
      }
    }

    // If no sentence boundary found, try to break at a space
    if (bestBreakPoint === endPosition) {
      for (let i = endPosition; i > searchStart; i--) {
        if (transcriptText[i] === ' ') {
          bestBreakPoint = i;
          break;
        }
      }
    }

    chunks.push(transcriptText.slice(currentPosition, bestBreakPoint).trim());

    // Start next chunk with overlap for context continuity
    const overlapStart = Math.max(currentPosition, bestBreakPoint - CHUNK_OVERLAP_CHARS);
    currentPosition = overlapStart < bestBreakPoint ? bestBreakPoint - CHUNK_OVERLAP_CHARS : bestBreakPoint;

    // Make sure we make progress
    if (currentPosition <= 0 || chunks[chunks.length - 1] === '') {
      currentPosition = bestBreakPoint;
    }
  }

  return chunks.filter(chunk => chunk.length > 0);
}

/**
 * Sleep helper for retry delays.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

IMPORTANT: For all "name" fields, output ONLY the canonical unit/stratagem/enhancement name with NO parenthetical content. Examples of what NOT to include:
- Type annotations: "(unit)", "(stratagem)", "(enhancement)"
- Model counts: "(15)", "(6 model unit)", "(10 models)"
- Unit numbering: "(unit 1)", "(unit 2)"
- Context notes: "(deep strike)", "(proxied as X)", "(mentioned as an idea)"
- Loadouts: "(mortar)", "(mining laser)"
Just output the base name like "Intercessor Squad" or "Zoanthropes", not "Zoanthropes (6 model unit)".

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
- IMPORTANT: Detachment is REQUIRED for each player. Use EXACT names from the CANONICAL DETACHMENT NAMES section when available. If not explicitly stated, infer from stratagems used or unit composition. Use "Unknown" only as last resort.
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

interface ChunkOptions {
  transcriptChunk: string;
  chunkIndex: number;
  totalChunks: number;
}

function buildUserPrompt(
  videoData: VideoData,
  preprocessed?: PreprocessedTranscript,
  factionUnitNames?: Map<string, string[]>,
  factionDetachmentNames?: Map<string, string[]>,
  chunkOptions?: ChunkOptions
): string {
  let prompt = `Analyze this Warhammer 40,000 battle report video and extract the army lists and game information.

VIDEO TITLE: ${videoData.title}

CHANNEL: ${videoData.channel}

DESCRIPTION:
${videoData.description}
`;

  // Add chunk metadata if processing in chunks
  if (chunkOptions) {
    prompt += `\n\n[PROCESSING CHUNK ${chunkOptions.chunkIndex + 1} OF ${chunkOptions.totalChunks}]
Note: This is a partial transcript. Extract all units, stratagems, and enhancements you can identify from this section.
Army lists and player info are typically in the first chunk. Later chunks may contain additional unit mentions during gameplay.`;
  }

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

  // Use chunk transcript if provided, otherwise build from video data
  if (chunkOptions) {
    prompt += `\n\nTRANSCRIPT (with tagged gameplay terms):\n${chunkOptions.transcriptChunk}`;
  } else {
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

/**
 * Process a single transcript chunk with the OpenAI API.
 * Includes retry logic for rate limits and server errors.
 */
async function processTranscriptChunk(
  openai: OpenAI,
  videoData: VideoData,
  transcriptChunk: string,
  chunkIndex: number,
  totalChunks: number,
  preprocessed: PreprocessedTranscript,
  factionUnitNames: Map<string, string[]>
): Promise<BattleReportExtraction> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-5-mini',
        max_completion_tokens: 4000,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: buildUserPrompt(videoData, preprocessed, factionUnitNames, undefined, {
              transcriptChunk,
              chunkIndex,
              totalChunks,
            }),
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from AI');
      }

      const parsed = JSON.parse(content);
      return BattleReportExtractionSchema.parse(parsed);
    } catch (error) {
      lastError = error as Error;

      // Handle OpenAI-specific errors with retry logic
      if (error instanceof OpenAI.RateLimitError) {
        const retryAfter = error.headers?.['retry-after'];
        const delayMs = retryAfter
          ? Number(retryAfter) * 1000
          : BASE_RETRY_DELAY_MS * Math.pow(2, attempt);

        console.warn(`Rate limited on chunk ${chunkIndex + 1}, retrying after ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delayMs);
        continue;
      }

      if (error instanceof OpenAI.APIError) {
        // Handle 413 Payload Too Large specifically
        if (error.status === 413) {
          console.error(`Chunk ${chunkIndex + 1} still too large (413), cannot process`);
          throw error;
        }

        // Retry on server errors (5xx)
        if (error.status && error.status >= 500) {
          const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
          console.warn(`Server error on chunk ${chunkIndex + 1}, retrying after ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await sleep(delayMs);
          continue;
        }

        // Don't retry on other client errors
        throw error;
      }

      if (error instanceof OpenAI.APIConnectionError) {
        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`Connection error on chunk ${chunkIndex + 1}, retrying after ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delayMs);
        continue;
      }

      // For other errors (like Zod validation), don't retry
      throw error;
    }
  }

  throw lastError ?? new Error(`Failed to process chunk ${chunkIndex + 1} after all retries`);
}

/**
 * Process chunks with limited concurrency.
 */
async function processChunksWithConcurrency(
  openai: OpenAI,
  videoData: VideoData,
  chunks: string[],
  preprocessed: PreprocessedTranscript,
  factionUnitNames: Map<string, string[]>
): Promise<BattleReportExtraction[]> {
  const results: BattleReportExtraction[] = new Array(chunks.length);
  let currentIdx = 0;

  async function processNext(): Promise<void> {
    while (currentIdx < chunks.length) {
      const idx = currentIdx++;
      const chunk = chunks[idx];
      if (!chunk) continue;
      try {
        results[idx] = await processTranscriptChunk(
          openai,
          videoData,
          chunk,
          idx,
          chunks.length,
          preprocessed,
          factionUnitNames
        );
        console.log(`Processed chunk ${idx + 1}/${chunks.length}`);
      } catch (error) {
        console.error(`Failed to process chunk ${idx + 1}:`, error);
        // Return empty extraction for failed chunks
        results[idx] = {
          players: [],
          units: [],
          stratagems: [],
          enhancements: [],
          mission: null,
          pointsLimit: null,
        };
      }
    }
  }

  // Start concurrent workers
  const workers = Array(Math.min(MAX_CONCURRENT_CHUNKS, chunks.length))
    .fill(null)
    .map(() => processNext());

  await Promise.all(workers);
  return results;
}

/**
 * Merge multiple extraction results from chunked processing.
 * - Players: Take from first chunk (army lists typically in intro)
 * - Units: Dedupe by name+playerIndex, keep highest confidence
 * - Stratagems: Dedupe by name, keep earliest timestamp
 * - Enhancements: Dedupe by name+playerIndex
 * - Mission/Points: Take first non-null value
 */
function mergeExtractionResults(results: BattleReportExtraction[]): BattleReportExtraction {
  if (results.length === 0) {
    return {
      players: [],
      units: [],
      stratagems: [],
      enhancements: [],
      mission: null,
      pointsLimit: null,
    };
  }

  if (results.length === 1) {
    return results[0]!;
  }

  // Take players from first chunk (army list is typically at the start)
  const players = results[0]!.players;

  // Dedupe units by name+playerIndex, keeping highest confidence
  const confidenceOrder = { high: 3, medium: 2, low: 1 };
  const unitMap = new Map<string, BattleReportExtraction['units'][0]>();
  for (const result of results) {
    for (const unit of result.units) {
      const key = `${unit.name.toLowerCase()}-${unit.playerIndex}`;
      const existing = unitMap.get(key);
      if (!existing || confidenceOrder[unit.confidence] > confidenceOrder[existing.confidence]) {
        unitMap.set(key, unit);
      }
    }
  }

  // Dedupe stratagems by name, keeping earliest timestamp
  const stratagemMap = new Map<string, BattleReportExtraction['stratagems'][0]>();
  for (const result of results) {
    for (const strat of result.stratagems) {
      const key = strat.name.toLowerCase();
      const existing = stratagemMap.get(key);
      if (!existing) {
        stratagemMap.set(key, strat);
      } else if (
        strat.videoTimestamp !== null &&
        strat.videoTimestamp !== undefined &&
        (existing.videoTimestamp === null ||
          existing.videoTimestamp === undefined ||
          strat.videoTimestamp < existing.videoTimestamp)
      ) {
        stratagemMap.set(key, strat);
      }
    }
  }

  // Dedupe enhancements by name+playerIndex
  const enhancementMap = new Map<string, NonNullable<BattleReportExtraction['enhancements']>[0]>();
  for (const result of results) {
    for (const enh of result.enhancements ?? []) {
      const key = `${enh.name.toLowerCase()}-${enh.playerIndex ?? 'unknown'}`;
      const existing = enhancementMap.get(key);
      if (!existing || confidenceOrder[enh.confidence] > confidenceOrder[existing.confidence]) {
        enhancementMap.set(key, enh);
      }
    }
  }

  // Take first non-null mission and pointsLimit
  let mission: string | null = null;
  let pointsLimit: number | null = null;
  for (const result of results) {
    if (mission === null && result.mission) {
      mission = result.mission;
    }
    if (pointsLimit === null && result.pointsLimit) {
      pointsLimit = result.pointsLimit;
    }
    if (mission !== null && pointsLimit !== null) break;
  }

  return {
    players,
    units: [...unitMap.values()],
    stratagems: [...stratagemMap.values()],
    enhancements: enhancementMap.size > 0 ? [...enhancementMap.values()] : undefined,
    mission,
    pointsLimit,
  };
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

  // Build full transcript section to check if chunking is needed
  const transcriptText = buildTranscriptSection(videoData, preprocessed);

  let validated: BattleReportExtraction;

  // Determine if we need chunking based on transcript length
  if (transcriptText.length > MAX_SINGLE_REQUEST_CHARS) {
    // Split transcript into chunks and process each
    const chunks = chunkTranscriptText(transcriptText);
    console.log(`Large transcript detected (${transcriptText.length} chars), splitting into ${chunks.length} chunks`);

    try {
      const chunkResults = await processChunksWithConcurrency(
        openai,
        videoData,
        chunks,
        preprocessed,
        factionUnitNames
      );

      // Merge results from all chunks
      validated = mergeExtractionResults(chunkResults);
      console.log(`Merged ${chunkResults.length} chunk results: ${validated.units.length} units, ${validated.stratagems.length} stratagems`);
    } catch (error) {
      // Handle 413 error by trying with smaller chunks
      if (error instanceof OpenAI.APIError && error.status === 413) {
        console.warn('Payload still too large, retrying with smaller chunks');
        // Reduce chunk size by half and retry
        const smallerChunks = chunkTranscriptText(transcriptText.slice(0, transcriptText.length / 2));
        const chunkResults = await processChunksWithConcurrency(
          openai,
          videoData,
          smallerChunks,
          preprocessed,
          factionUnitNames
        );
        validated = mergeExtractionResults(chunkResults);
      } else {
        throw error;
      }
    }
  } else {
    // Single request path for shorter transcripts
    console.log(`Short transcript (${transcriptText.length} chars), using single request`);

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-5-mini',
        max_completion_tokens: 4000,
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
      validated = BattleReportExtractionSchema.parse(parsed);
    } catch (error) {
      // Handle 413 error by falling back to chunking
      if (error instanceof OpenAI.APIError && error.status === 413) {
        console.warn('Single request too large (413), falling back to chunking');
        const chunks = chunkTranscriptText(transcriptText);
        const chunkResults = await processChunksWithConcurrency(
          openai,
          videoData,
          chunks,
          preprocessed,
          factionUnitNames
        );
        validated = mergeExtractionResults(chunkResults);
      } else {
        throw error;
      }
    }
  }

  // Convert to BattleReport format (convert null to undefined)
  const extractedStratagems = validated.stratagems.map((s) => ({
    name: s.name,
    playerIndex: s.playerIndex ?? undefined,
    confidence: s.confidence,
    videoTimestamp: s.videoTimestamp ?? undefined,
  }));

  // Enrich stratagems with timestamps from transcript preprocessing
  const enrichedStratagems = enrichStratagemTimestamps(extractedStratagems, preprocessed);

  // Convert validated units and enrich with timestamps and mention counts
  const extractedUnits = validated.units.map((u) => ({
    name: u.name,
    playerIndex: u.playerIndex,
    confidence: u.confidence,
    pointsCost: u.pointsCost ?? undefined,
  }));
  const unitsWithTimestamps = enrichUnitTimestamps(extractedUnits, preprocessed);
  const enrichedUnits = enrichUnitMentionCounts(unitsWithTimestamps, preprocessed);

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
