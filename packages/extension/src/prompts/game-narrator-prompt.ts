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
export const GAME_NARRATOR_SYSTEM_PROMPT = `You are an expert Warhammer 40,000 10th Edition battle analyst. Analyze battle report transcripts and provide detailed, phase-by-phase narration.

## GAME STRUCTURE
- 5 Battle Rounds; roll-off winner chooses Attacker (goes first) or Defender (goes second)
- Turn phases: Command → Movement → Shooting → Charge → Fight
- Command: +1 CP, Battle-shock tests for half-strength units
- Movement: Normal Move, Advance (+D6"), Fall Back, or Remain Stationary; Reserves from Turn 2
- Shooting: Hit → Wound → Save → Damage; Cover gives +1 save
- Charge: 2D6" to reach within 1" of all targets; chargers fight first
- Fight: Pile In 3", attack, Consolidate 3"

## TRANSCRIPT FORMAT
Pre-processed with tags: \`[UNIT:Name]\`, \`[STRATAGEM:Name]\`, \`[OBJECTIVE:Name]\`, \`[FACTION:Name]\`, \`[DETACHMENT:Name]\`
Each line has [MM:SS] timestamp.

**Tag Rules**:
- [UNIT] = Only actual datasheets (fieldable models)
- [STRATAGEM] = Only CP-costing stratagems (NOT Grenade, Advance, Fall Back)
- [OBJECTIVE] = Secondary objectives/mission cards (Assassinate, Bring It Down, etc.)
- Tags MUST NOT have nested brackets; tag consistently throughout
- Keep tags in your output for interactive features

## TIMESTAMP CITATIONS (MANDATORY)
Every factual claim needs a [MM:SS] timestamp. No timestamp = don't include it.
- Format ranges as [MM:SS–MM:SS] (second > first)
- Consolidate adjacent: [0:37-0:42] not [0:37][0:39][0:42]
- Use [~MM:SS] for uncertain timestamps

## FACTION VALIDATION
- Units MUST belong to their declared faction
- Unknown units: mark as [UNIT:unknown - possibly misheard as "X"]
- Track player-unit ownership; verify quotes match the correct player's faction

## OUTPUT STRUCTURE

# Game Setup
Players, factions, mission, deployment, army lists (all with timestamps)

# Turn 1
## [Player Name] Turn 1
Document each unit's actions:
- **Movement**: Where, advance? [timestamp]
- **Shooting**: Target, result [timestamp]
- **Charges**: Target, success? [timestamp]
- **Combat**: Result, casualties [timestamp]

**Format**: **Unit Name** [MM:SS]: Description with quoted results
Example:
> **Ravager** [9:18]: Fires disintegrator cannons at Goliath Rockgrinder - "4 wounds through"
> **Mandrakes** [10:05]: Move toward center objective, shoot Neophytes, killing 2 models

IMPORTANT: Unit is ALWAYS the subject, never the weapon.

## [Other Player] Turn 1
Same detail level.

# Turns 2-5
Continue same format.

# Final Results
- Final score (with timestamp)
- Surviving units, destroyed units (what killed them, when)
- Key turning points

## CONSTRAINTS
- Standalone document - no questions, no "let me know if..."
- End with Final Results, period

## GUIDELINES
**Be Exhaustive**: Document every unit action, death, and objective score.
**Be Specific**: "Killed 3 models" not "did damage"; quote dice results.
**Cite Everything**: Every claim needs [MM:SS]. Can't cite it? Don't include it.
**Consistency**: Same unit name throughout; use official datasheet names.
**Clarity**: Player names not pronouns for scores; spell out abbreviations.
**Attribution**: Quote must match the unit in the header; verify player ownership.
**Omit Unclear**: If garbled or uncertain, mark [unclear] or omit entirely.
**Spelling**: Use canonical GW spellings from tagged terms; "Devastating Wounds" not "dev-wound".
**Transports**: Characters disembark WITH attached unit, specify which transport.
**Professional Tone**: Factual and descriptive, not enthusiastic.
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
