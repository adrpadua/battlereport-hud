import OpenAI from 'openai';
import { BattleReportExtractionSchema } from '@/types/ai-response';
import type { BattleReport } from '@/types/battle-report';
import type { VideoData, Chapter, TranscriptSegment } from '@/types/youtube';
import type { LlmPreprocessResult } from '@/types/llm-preprocess';
import { getFactionContextForPrompt, processBattleReport } from './report-processor';
import {
  preprocessTranscript,
  preprocessTranscriptWithLlmMappings,
  enrichStratagemTimestamps,
  enrichUnitTimestamps,
  type PreprocessedTranscript,
  type NormalizedSegment,
} from './transcript-preprocessor';
import { getCachedPreprocess, setCachedPreprocess } from './cache-manager';
import { preprocessWithLlm } from './llm-preprocess-service';

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

const BASE_SYSTEM_PROMPT = `You are an expert at analyzing Warhammer 40,000 battle report videos. Your task is to extract ALL units, characters, and vehicles mentioned in the transcript.

You must respond with a valid JSON object containing the extracted battle report data.

TRANSCRIPT FORMAT:
- The transcript has been pre-processed with tagged gameplay terms
- Units are tagged as [UNIT:Official Name] - use the official name from the tag
- Stratagems are tagged as [STRAT:Official Name] - use the official name from the tag
- These tags indicate terms that have been matched to official Warhammer 40k terminology
- Always prefer the tagged official name over colloquial variations

Guidelines:
- Extract player names and their factions accurately
- IMPORTANT: Extract ALL units mentioned throughout the entire transcript, not just the army list section
- Look for [UNIT:...] tags for pre-identified units with official names
- Look for [STRAT:...] tags for pre-identified stratagems
- Also look for untagged unit names during deployment, movement, shooting, charging, and combat phases
- Include characters (e.g., Chaplain, Captain, Overlord), infantry squads, vehicles, monsters, and any other units
- Assign each unit to player 0 or player 1 based on context (who owns/controls it)
- Confidence levels:
  - "high": Unit clearly named (especially if tagged) and associated with a player
  - "medium": Unit mentioned but player association less clear
  - "low": Partial name or uncertain identification

Your JSON response must include: players (array with name, faction, detachment, confidence), units (array with name, playerIndex, confidence, pointsCost), stratagems (array with name, playerIndex, confidence, videoTimestamp), mission (optional string), and pointsLimit (optional number).

- For each stratagem, include the approximate video timestamp (in seconds) when it was mentioned. The transcript includes timestamps in [Xs] format - use these to determine the videoTimestamp value.`;

/**
 * Build system prompt with faction-specific unit names.
 */
function buildSystemPrompt(factionUnitNames: Map<string, string[]>): string {
  let prompt = BASE_SYSTEM_PROMPT;

  if (factionUnitNames.size > 0) {
    prompt += '\n\nCANONICAL UNIT NAMES BY FACTION:';
    prompt += '\nUse EXACT names from these lists when possible. Prefer these official names over abbreviations or nicknames.';

    for (const [faction, units] of factionUnitNames) {
      // Limit units to avoid token overflow
      const limitedUnits = units.slice(0, 100);
      prompt += `\n\n${faction.toUpperCase()}:\n${limitedUnits.join(', ')}`;
      if (units.length > 100) {
        prompt += ` ... and ${units.length - 100} more`;
      }
    }
  }

  return prompt;
}

function buildUserPrompt(videoData: VideoData, preprocessed?: PreprocessedTranscript): string {
  let prompt = `Analyze this Warhammer 40,000 battle report video and extract the army lists and game information.

VIDEO TITLE: ${videoData.title}

CHANNEL: ${videoData.channel}

DESCRIPTION:
${videoData.description}
`;

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
 */
export function detectFactionNamesFromVideo(videoData: VideoData): string[] {
  const searchText = [videoData.title, videoData.description, videoData.pinnedComment ?? ''].join(' ');
  const detectedFactions: string[] = [];

  const factionPatterns: [RegExp, string][] = [
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

  for (const [pattern, factionName] of factionPatterns) {
    if (pattern.test(searchText) && !detectedFactions.includes(factionName)) {
      detectedFactions.push(factionName);
    }
  }

  return detectedFactions;
}

/**
 * Detect factions from video metadata for prompt enhancement.
 * Returns a map of detected faction names to their unit names.
 */
export async function detectFactionsFromVideo(videoData: VideoData): Promise<Map<string, string[]>> {
  const factionUnitNames = new Map<string, string[]>();

  // Combine text for faction detection
  const searchText = [videoData.title, videoData.description, videoData.pinnedComment ?? ''].join(' ');

  // Detect factions mentioned in metadata
  const detectedFactions = new Set<string>();

  // Common faction detection patterns
  const factionPatterns: [RegExp, string][] = [
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
  ];

  for (const [pattern, factionName] of factionPatterns) {
    if (pattern.test(searchText)) {
      detectedFactions.add(factionName);
    }
  }

  // Load unit names for detected factions
  for (const faction of detectedFactions) {
    const unitNames = await getFactionContextForPrompt(faction);
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

  // Build faction-aware system prompt
  const systemPrompt = buildSystemPrompt(factionUnitNames);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: buildUserPrompt(videoData, preprocessed) },
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

  const rawReport: BattleReport = {
    players: validated.players.map((p) => ({
      name: p.name,
      faction: p.faction,
      detachment: p.detachment ?? undefined,
      confidence: p.confidence,
    })) as BattleReport['players'],
    units: enrichedUnits,
    stratagems: enrichedStratagems,
    mission: validated.mission ?? undefined,
    pointsLimit: validated.pointsLimit ?? undefined,
    extractedAt: Date.now(),
  };

  // Process and validate units against BSData
  const processedReport = await processBattleReport(rawReport);

  return processedReport;
}

/**
 * Extract battle report with user-selected factions.
 * Used for phased extraction where user confirms/selects factions.
 */
export async function extractWithFactions(
  videoData: VideoData,
  factions: [string, string],
  apiKey: string
): Promise<BattleReport> {
  const openai = new OpenAI({ apiKey });

  // Load unit names for selected factions
  const factionUnitNames = new Map<string, string[]>();
  for (const faction of factions) {
    const unitNames = await getFactionContextForPrompt(faction);
    if (unitNames.length > 0) {
      factionUnitNames.set(faction, unitNames);
    }
  }

  const allUnitNames = [...factionUnitNames.values()].flat();

  // Try LLM preprocessing with caching
  let preprocessed: PreprocessedTranscript;
  try {
    const cachedLlm = await getCachedPreprocess(videoData.videoId);
    let llmResult: LlmPreprocessResult | null = cachedLlm;

    if (!llmResult) {
      console.log('Running LLM preprocessing for video:', videoData.videoId);
      llmResult = await preprocessWithLlm(videoData.transcript, factions, apiKey);
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

  // Build faction-aware system prompt
  const systemPrompt = buildSystemPrompt(factionUnitNames);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: buildUserPrompt(videoData, preprocessed) },
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

  const rawReport: BattleReport = {
    players: validated.players.map((p) => ({
      name: p.name,
      faction: p.faction,
      detachment: p.detachment ?? undefined,
      confidence: p.confidence,
    })) as BattleReport['players'],
    units: enrichedUnits,
    stratagems: enrichedStratagems,
    mission: validated.mission ?? undefined,
    pointsLimit: validated.pointsLimit ?? undefined,
    extractedAt: Date.now(),
  };

  // Process and validate units against BSData
  const processedReport = await processBattleReport(rawReport);

  return processedReport;
}
