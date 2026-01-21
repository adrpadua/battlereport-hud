/**
 * Game Narrator Prompt
 *
 * Provides a system prompt and helper functions for an AI agent that acts as a
 * Warhammer 40,000 expert, providing detailed play-by-play game analysis from
 * preprocessed battle report transcripts.
 */

import type { PreprocessedTranscript } from '../background/transcript-preprocessor';

/**
 * System prompt for the 40K game narrator.
 * Contains embedded rules knowledge and output format instructions.
 * Optimized for prompt caching - keep this static and don't interpolate values.
 */
export const GAME_NARRATOR_SYSTEM_PROMPT = `You are a Warhammer 40,000 10th Edition game recorder. Extract factual game events from transcripts into a structured phase-by-phase log.

## INPUT FORMAT
Transcript has tags: [UNIT:Name], [STRATAGEM:Name], [OBJECTIVE:Name], [FACTION:Name], [DETACHMENT:Name]
Each line has [MM:SS] timestamp. Keep tags in output.

## OUTPUT FORMAT

# Game Setup [timestamp]
- Player 1: [Name] - [FACTION:X] ([DETACHMENT:Y])
- Player 2: [Name] - [FACTION:X] ([DETACHMENT:Y])
- Mission: [name]
- First turn: [Player Name]

# Turn X - [Player Name]

## Command Phase [timestamp]
- CP gained: 1
- Battle-shock: [units that failed, if any]
- Stratagems: [STRATAGEM:Name] on [UNIT:Name]

## Movement Phase [timestamp]
- [UNIT:Name]: [action] (Normal move / Advance / Fall back / Stationary / Arrived from reserves)
- [UNIT:Name]: [action]

## Shooting Phase [timestamp]
- [UNIT:Name] → [UNIT:Target]: [result] (X wounds / X models killed / destroyed)
- [UNIT:Name] → [UNIT:Target]: [result]

## Charge Phase [timestamp]
- [UNIT:Name] → [UNIT:Target]: [success/failed] ([distance] if mentioned)

## Fight Phase [timestamp]
- [UNIT:Name] → [UNIT:Target]: [result] (X wounds / X models killed / destroyed)

## Scoring [timestamp]
- [Player]: +X VP ([OBJECTIVE:Name])
- Score: [Player 1] X - X [Player 2]

# Final Results [timestamp]
- Final Score: [Player 1] X - X [Player 2]
- Destroyed: [list units destroyed and by what]

## RULES
1. Every line needs a [MM:SS] timestamp. No timestamp = omit.
2. Only include events explicitly mentioned in transcript.
3. Units must belong to their declared faction. Mark unknowns as [UNIT:unknown].
4. Use consistent unit names throughout (official datasheet names).
5. Report facts only: "3 models killed" not "devastating damage".
6. Omit phases with no events mentioned.
7. No commentary, questions, or suggestions. Facts only.
`;

/**
 * Format a timestamp in seconds to MM:SS format.
 */
export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format stratagem mentions timeline for the user prompt.
 */
export function formatStratagemTimeline(
  mentions: Map<string, number[]>
): string {
  if (mentions.size === 0) {
    return 'No stratagems detected in transcript.';
  }

  const lines: string[] = [];
  for (const [name, timestamps] of mentions) {
    const formattedTimes = timestamps.map(formatTimestamp).join(', ');
    lines.push(`- ${name}: [${formattedTimes}]`);
  }

  return lines.join('\n');
}

/**
 * Format unit mentions timeline for the user prompt.
 */
export function formatUnitTimeline(
  mentions: Map<string, number[]>
): string {
  if (mentions.size === 0) {
    return 'No units detected in transcript.';
  }

  const lines: string[] = [];
  // Sort by first mention time
  const sorted = [...mentions.entries()].sort(
    (a, b) => (a[1][0] ?? 0) - (b[1][0] ?? 0)
  );

  for (const [name, timestamps] of sorted) {
    const formattedTimes = timestamps.slice(0, 5).map(formatTimestamp).join(', ');
    const suffix = timestamps.length > 5 ? ` ... (${timestamps.length} total mentions)` : '';
    lines.push(`- ${name}: [${formattedTimes}]${suffix}`);
  }

  return lines.join('\n');
}

/**
 * Format objective mentions timeline for the user prompt.
 */
export function formatObjectiveTimeline(
  mentions: Map<string, number[]>
): string {
  if (mentions.size === 0) {
    return 'No objectives detected in transcript.';
  }

  const lines: string[] = [];
  // Sort by first mention time
  const sorted = [...mentions.entries()].sort(
    (a, b) => (a[1][0] ?? 0) - (b[1][0] ?? 0)
  );

  for (const [name, timestamps] of sorted) {
    const formattedTimes = timestamps.slice(0, 5).map(formatTimestamp).join(', ');
    const suffix = timestamps.length > 5 ? ` ... (${timestamps.length} total mentions)` : '';
    lines.push(`- ${name}: [${formattedTimes}]${suffix}`);
  }

  return lines.join('\n');
}

/**
 * Format faction mentions timeline for the user prompt.
 */
export function formatFactionTimeline(
  mentions: Map<string, number[]>
): string {
  if (mentions.size === 0) {
    return 'No factions detected in transcript.';
  }

  const lines: string[] = [];
  const sorted = [...mentions.entries()].sort(
    (a, b) => (a[1][0] ?? 0) - (b[1][0] ?? 0)
  );

  for (const [name, timestamps] of sorted) {
    const formattedTimes = timestamps.slice(0, 5).map(formatTimestamp).join(', ');
    const suffix = timestamps.length > 5 ? ` ... (${timestamps.length} total mentions)` : '';
    lines.push(`- ${name}: [${formattedTimes}]${suffix}`);
  }

  return lines.join('\n');
}

/**
 * Format detachment mentions timeline for the user prompt.
 */
export function formatDetachmentTimeline(
  mentions: Map<string, number[]>
): string {
  if (mentions.size === 0) {
    return 'No detachments detected in transcript.';
  }

  const lines: string[] = [];
  const sorted = [...mentions.entries()].sort(
    (a, b) => (a[1][0] ?? 0) - (b[1][0] ?? 0)
  );

  for (const [name, timestamps] of sorted) {
    const formattedTimes = timestamps.slice(0, 5).map(formatTimestamp).join(', ');
    const suffix = timestamps.length > 5 ? ` ... (${timestamps.length} total mentions)` : '';
    lines.push(`- ${name}: [${formattedTimes}]${suffix}`);
  }

  return lines.join('\n');
}

/**
 * Format preprocessed transcript segments for the user prompt.
 * Uses the tagged text which contains [UNIT:Name], [STRATAGEM:Name], [OBJECTIVE:Name], etc. markers.
 * Note: Deduplication is now done during preprocessing.
 */
export function formatPreprocessedTranscript(
  preprocessed: PreprocessedTranscript,
  maxLength: number = 150000
): string {
  const segments = preprocessed.normalizedSegments;
  if (segments.length === 0) {
    return 'No transcript available.';
  }

  let result = '';

  for (const seg of segments) {
    const line = `[${formatTimestamp(seg.startTime)}] ${seg.taggedText.trim()}\n`;
    if (result.length + line.length > maxLength) {
      result += `\n[Transcript truncated at ${formatTimestamp(seg.startTime)}]`;
      break;
    }
    result += line;
  }

  return result;
}

/**
 * Interface for faction data passed to the narrator.
 */
export interface FactionData {
  name: string;
  units: string[];
  detachment?: string;
}

/**
 * Build the user prompt for the game narrator.
 *
 * @param videoData - Video metadata (title, videoId)
 * @param preprocessed - Preprocessed transcript with tagged terms
 * @param factionData - Optional faction data for both players
 */
export function buildNarratorUserPrompt(
  videoData: { title: string; videoId: string },
  preprocessed: PreprocessedTranscript,
  factionData?: { faction1?: FactionData; faction2?: FactionData }
): string {
  const sections: string[] = [];

  // Video metadata
  sections.push(`## VIDEO INFORMATION
**Title:** ${videoData.title}
**Video ID:** ${videoData.videoId}
`);

  // Faction data if available
  if (factionData?.faction1 || factionData?.faction2) {
    sections.push(`## DETECTED FACTIONS`);

    if (factionData.faction1) {
      const unitList = factionData.faction1.units.slice(0, 20).join(', ');
      const suffix = factionData.faction1.units.length > 20
        ? ` ... (${factionData.faction1.units.length} total)`
        : '';
      sections.push(`
**Player 1 - ${factionData.faction1.name}**${factionData.faction1.detachment ? ` (${factionData.faction1.detachment})` : ''}
Units: ${unitList}${suffix}
`);
    }

    if (factionData.faction2) {
      const unitList = factionData.faction2.units.slice(0, 20).join(', ');
      const suffix = factionData.faction2.units.length > 20
        ? ` ... (${factionData.faction2.units.length} total)`
        : '';
      sections.push(`
**Player 2 - ${factionData.faction2.name}**${factionData.faction2.detachment ? ` (${factionData.faction2.detachment})` : ''}
Units: ${unitList}${suffix}
`);
    }
  }

  // Faction timeline
  sections.push(`## FACTION MENTIONS TIMELINE
${formatFactionTimeline(preprocessed.factionMentions)}
`);

  // Detachment timeline
  sections.push(`## DETACHMENT MENTIONS TIMELINE
${formatDetachmentTimeline(preprocessed.detachmentMentions)}
`);

  // Stratagem timeline
  sections.push(`## STRATAGEM USAGE TIMELINE
${formatStratagemTimeline(preprocessed.stratagemMentions)}
`);

  // Objective timeline
  sections.push(`## OBJECTIVE MENTIONS TIMELINE
${formatObjectiveTimeline(preprocessed.objectiveMentions)}
`);

  // Unit mentions timeline
  sections.push(`## UNIT MENTIONS TIMELINE
${formatUnitTimeline(preprocessed.unitMentions)}
`);

  // Preprocessed transcript
  sections.push(`## PREPROCESSED TRANSCRIPT
The following transcript has gameplay terms tagged.

${formatPreprocessedTranscript(preprocessed)}
`);

  return sections.join('\n');
}
