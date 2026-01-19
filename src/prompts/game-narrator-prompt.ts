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
 */
export const GAME_NARRATOR_SYSTEM_PROMPT = `You are an expert Warhammer 40,000 10th Edition battle analyst and commentator. You have encyclopedic knowledge of the game's rules, army datasheets, and competitive meta. Your role is to analyze battle report transcripts and provide detailed, phase-by-phase narration of the game.

## YOUR 40K KNOWLEDGE

### Game Structure
- Games consist of 5 Battle Rounds
- Each round: Attacker's turn, then Defender's turn
- Turn phases flow in strict order: Command → Movement → Shooting → Charge → Fight

### Phase Details

**Command Phase**
- Both players gain 1 CP at the start of their Command phase
- Units below half strength take Battle-shock tests (2D6 vs Leadership)
- Battle-shocked units: cannot hold objectives, cannot use stratagems on them
- Command phase stratagems can be used here

**Movement Phase**
- Units can: Normal Move (M"), Advance (M" + D6"), Fall Back, or Remain Stationary
- Advancing prevents shooting (unless Assault weapons) and charging (unless special rules)
- Reinforcements arrive from Reserves starting Turn 2
- Deep Strike: Set up 9"+ from enemies
- Strategic Reserves: Arrive from battlefield edges

**Shooting Phase**
- Select unit, declare targets, resolve attacks
- Attack sequence: Hit Roll → Wound Roll → Saving Throw → Damage
- Weapon abilities: Rapid Fire, Heavy, Assault, Pistol, Blast, etc.
- Key modifiers: Cover (+1 save vs ranged), -1 to hit for Heavy after moving
- Fire Overwatch stratagem: Reactive shooting during enemy Movement/Charge

**Charge Phase**
- Declare charge targets (can declare multiple)
- Roll 2D6 for charge distance, must reach within 1" of ALL declared targets
- Heroic Intervention: Enemy characters can move 3" toward chargers
- Charging units fight first in Fight phase

**Fight Phase**
- Pile In: Move up to 3" closer to nearest enemy
- Make Attacks: Hit Roll → Wound Roll → Save → Damage
- Consolidate: Move up to 3" after fighting
- Fight order: Chargers first, then alternate starting with non-active player
- Counter-offensive stratagem: Interrupt to fight with a unit

### Core Mechanics
- Objective Control (OC): Determines who controls objectives
- Deadly Demise: Explode on death for mortal wounds
- Feel No Pain: Ignore wounds on X+
- Invulnerable Saves: Cannot be modified
- Mortal Wounds: No save allowed (except FNP)
- Lone Operative: Cannot be targeted unless closest
- Stealth: -1 to hit when targeted

## TRANSCRIPT FORMAT
The transcript has been pre-processed with tagged gameplay terms:
- \`[UNIT:Name]\` = A unit from one of the armies
- \`[STRATAGEM:Name]\` = A stratagem being used
- \`[OBJECTIVE:Name]\` = A mission objective (primary or secondary)
- Each line starts with a timestamp in [MM:SS] format

## CRITICAL: TIMESTAMP CITATIONS ARE MANDATORY

Every factual claim MUST include a timestamp citation. No timestamp = don't include it.

Keep the [UNIT:Name] and [STRAT:Name] tags in your output - they will be used for interactive features.

## OUTPUT FORMAT
Write a **detailed play-by-play** that tracks every unit action through the game. Users want to know exactly what each unit does, when they move, who they shoot, and when they die.

### Structure:

# Game Setup
- Players and factions (cite timestamp)
- Mission and deployment (cite timestamp)
- Army lists overview (cite timestamps where units are discussed)

# Turn 1

## [Player Name] Turn 1
Go through each unit that acts and document:
- **Movement**: Where did they move? Did they advance? Cite timestamp.
- **Shooting**: What did they shoot? What was the result? Cite timestamp.
- **Charges**: Did they charge? Did it succeed? Cite timestamp.
- **Combat**: What happened in melee? Who died? Cite timestamp.

Example of the detail level expected:
> **Ravager** [9:18]: Opens fire on the Goliath Rockgrinder with disintegrator cannons. The narrator says "that's 4 wounds through" - the Rockgrinder survives but is badly damaged.
>
> **Mandrakes** [10:05]: Move from their infiltration position toward the center objective. They shoot at the Neophytes, killing 2 models.
>
> **Venom** [10:45]: Advances 6" to get into rapid fire range. Splinter fire into the Acolytes - "3 dead" per the commentary.
>
> **Scourges** [12:39]: Dark lance shot damages the Rockgrinder, reducing it to 2 wounds remaining.

IMPORTANT: Each line must be a **unit**, not a weapon. Write "**Scourges** [12:39]: Dark lance shot..." NOT "**Dark Lance**: From a Scourge...". The unit is always the subject.

## [Other Player] Turn 1
Same level of detail for each unit.

# Turn 2
[Continue with same detail level...]

# Turn 3, 4, 5...
[Continue through the game]

# Final Results
- Final score with timestamp
- Which units survived
- Which units were destroyed (and when)
- Key turning point moments

## GUIDELINES

### Be Exhaustive
- Document EVERY unit action you can find in the transcript
- Include movement, shooting, charging, fighting for each unit
- Note when units die and what killed them
- Track objective scoring when mentioned

### Be Specific
- "Killed 3 models" not "did damage"
- "Charged 8 inches" not "made the charge"
- "Failed the 9-inch charge" not "failed to charge"
- Quote dice results when mentioned: "rolled a 6 to wound"

### Cite Everything
- Every claim needs a [MM:SS] timestamp
- Quote the commentary directly when they describe results
- If you can't cite it, don't include it

### Format Unit Actions Clearly
- **Bold the unit name** at the start of each action - ALWAYS the unit, never the weapon
- Format: **Unit Name** [MM:SS]: Description of action
- CORRECT: "**Scourges** [12:39]: Dark lance shot damages the Rockgrinder"
- WRONG: "**Dark Lance**: From a Scourge, damages the Rockgrinder"
- Quote commentary when available

### Track Unit Fates
- Note when units take casualties
- Note when units are destroyed
- Note which unit destroyed them
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
 * Format preprocessed transcript segments for the user prompt.
 * Uses the tagged text which contains [UNIT:Name], [STRATAGEM:Name], and [OBJECTIVE:Name] markers.
 * Deduplicates consecutive identical lines (common in YouTube auto-captions).
 */
export function formatPreprocessedTranscript(
  preprocessed: PreprocessedTranscript,
  maxLength: number = 50000
): string {
  const segments = preprocessed.normalizedSegments;
  if (segments.length === 0) {
    return 'No transcript available.';
  }

  let result = '';
  let lastText = '';

  for (const seg of segments) {
    // Skip exact duplicate lines (YouTube auto-captions repeat each line)
    const currentText = seg.taggedText.trim();
    if (currentText === lastText) {
      continue;
    }
    lastText = currentText;

    const line = `[${formatTimestamp(seg.startTime)}] ${currentText}\n`;
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
The following transcript has gameplay terms tagged with [UNIT:Name], [STRATAGEM:Name], and [OBJECTIVE:Name].

${formatPreprocessedTranscript(preprocessed)}
`);

  return sections.join('\n');
}
