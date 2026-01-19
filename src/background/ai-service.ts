import OpenAI from 'openai';
import { BattleReportExtractionSchema } from '@/types/ai-response';
import type { BattleReport } from '@/types/battle-report';
import type { VideoData } from '@/types/youtube';
import { getFactionContextForPrompt, processBattleReport } from './report-processor';
import { preprocessTranscript, enrichStratagemTimestamps, enrichUnitTimestamps } from './transcript-preprocessor';

const BASE_SYSTEM_PROMPT = `You are an expert at analyzing Warhammer 40,000 battle report videos. Your task is to extract ALL units, characters, and vehicles mentioned in the transcript.

You must respond with a valid JSON object containing the extracted battle report data.

Guidelines:
- Extract player names and their factions accurately
- IMPORTANT: Extract ALL units mentioned throughout the entire transcript, not just the army list section
- Look for unit names mentioned during deployment, movement, shooting, charging, and combat phases
- Include characters (e.g., Chaplain, Captain, Overlord), infantry squads, vehicles, monsters, and any other units
- Common unit indicators: "his/their [unit]", "[unit] moves", "[unit] shoots", "[unit] charges", "the [unit]"
- Assign each unit to player 0 or player 1 based on context (who owns/controls it)
- Note any stratagems used or mentioned
- Confidence levels:
  - "high": Unit clearly named and associated with a player
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

function buildUserPrompt(videoData: VideoData): string {
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

  if (videoData.transcript.length > 0) {
    // Use more of the transcript to capture units mentioned throughout the game
    // Take first 15 minutes (army list intro) + sample from the rest of the video
    // Include timestamps so AI can report when stratagems were mentioned
    const introTranscript = videoData.transcript
      .filter((seg) => seg.startTime < 900) // First 15 minutes
      .map((seg) => `[${Math.floor(seg.startTime)}s] ${seg.text}`)
      .join(' ');

    // Sample from the rest of the video (every 5 minutes) to catch units mentioned during gameplay
    const gameplaySegments: string[] = [];
    const sampleTimes = [900, 1200, 1500, 1800, 2100, 2400, 2700, 3000, 3300, 3600]; // 15min to 60min
    for (const time of sampleTimes) {
      const segment = videoData.transcript
        .filter((seg) => seg.startTime >= time && seg.startTime < time + 180) // 3 min windows
        .map((seg) => `[${Math.floor(seg.startTime)}s] ${seg.text}`)
        .join(' ');
      if (segment) {
        gameplaySegments.push(segment);
      }
    }

    const fullTranscript = [introTranscript, ...gameplaySegments].join('\n\n');
    // Limit to ~12000 chars to stay within token limits while getting more coverage
    const transcriptText = fullTranscript.slice(0, 12000);

    prompt += `\n\nTRANSCRIPT:\n${transcriptText}`;

    if (fullTranscript.length > 12000) {
      prompt += `\n\n[Transcript truncated - extract all units you can identify from the text above]`;
    }
  }

  return prompt;
}

/**
 * Detect factions from video metadata for prompt enhancement.
 */
async function detectFactionsFromVideo(videoData: VideoData): Promise<Map<string, string[]>> {
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

  // Pre-process transcript to detect stratagems and units with timestamps
  const allUnitNames = [...factionUnitNames.values()].flat();
  const preprocessed = preprocessTranscript(videoData.transcript, allUnitNames);

  // Build faction-aware system prompt
  const systemPrompt = buildSystemPrompt(factionUnitNames);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: buildUserPrompt(videoData) },
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
