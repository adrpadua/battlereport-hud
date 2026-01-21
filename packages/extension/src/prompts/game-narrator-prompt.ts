/**
 * Game Narrator Prompt
 *
 * Provides a system prompt and helper functions for an AI agent that acts as a
 * Warhammer 40,000 expert, providing detailed play-by-play game analysis from
 * preprocessed battle report transcripts.
 *
 * Token optimization: Rules are referenced by ID rather than embedded.
 * Full rules content can be loaded on-demand from the MCP server.
 */

import type { PreprocessedTranscript } from '../background/transcript-preprocessor';
import type { RuleContent } from '@mcp/types';
import { getRulesCache } from '../background/preprocessing/cache/rules-cache';

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

## EXTRACTION RULES
1. Every line needs a [MM:SS] timestamp. No timestamp = omit.
2. Only include events explicitly mentioned in transcript.
3. Units must belong to their declared faction. Mark unknowns as [UNIT:unknown].
4. Use consistent unit names throughout (official datasheet names).
5. Report facts only: "3 models killed" not "devastating damage".
6. Omit phases with no events mentioned.
7. No commentary, questions, or suggestions. Facts only.

## GAME STRUCTURE REFERENCE
- 5 Battle Rounds; phases: Command → Movement → Shooting → Charge → Fight
- Command Phase: +1 CP, Battle-shock tests for Below Half Strength units
- Scoring happens at end of each player's turn
`;

/**
 * Compact rules reference IDs for context-aware loading.
 * These can be loaded from the MCP server when needed.
 */
export const RULES_REFERENCE_IDS = {
  phases: {
    command: 'command-phase',
    movement: 'movement-phase',
    shooting: 'shooting-phase',
    charge: 'charge-phase',
    fight: 'fight-phase',
  },
  combat: {
    hitRoll: 'hit-roll',
    woundRoll: 'wound-roll',
    savingThrow: 'saving-throw',
    damageAllocation: 'damage-allocation',
  },
  core: {
    battleShock: 'battle-shock',
    objectiveControl: 'objective-control',
    deepStrike: 'deep-strike',
  },
} as const;

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

// ============================================================================
// Context-Aware Rule Loading (Phase 5)
// ============================================================================

/**
 * Essential rule slugs for compact game mechanics reference.
 * These provide foundational game knowledge without bloating token usage.
 */
export const ESSENTIAL_RULE_SLUGS = [
  // Game Structure
  'the-battle-round',
  'player-turns',

  // Phases (core mechanics only)
  'command-phase',
  'movement-phase',
  'shooting-phase',
  'charge-phase',
  'fight-phase',

  // Combat Sequence
  'hit-roll',
  'wound-roll',
  'allocate-attack',
  'saving-throw',
] as const;

/**
 * Game phases that can be detected in transcripts.
 */
export type GamePhase = 'command' | 'movement' | 'shooting' | 'charge' | 'fight';

/**
 * Keywords that indicate specific game phases in transcript text.
 */
const PHASE_KEYWORDS: Record<GamePhase, string[]> = {
  command: ['command phase', 'command point', 'cp', 'battle-shock', 'battleshock'],
  movement: ['movement phase', 'move', 'advance', 'fall back', 'reserves', 'deep strike'],
  shooting: ['shooting phase', 'shoot', 'shooting', 'overwatch', 'fire'],
  charge: ['charge phase', 'charge', 'charging', 'charge roll'],
  fight: ['fight phase', 'fight', 'melee', 'pile in', 'consolidate'],
};

/**
 * Detect which game phases are mentioned in the transcript.
 */
export function detectPhasesInTranscript(preprocessed: PreprocessedTranscript): Set<GamePhase> {
  const detectedPhases = new Set<GamePhase>();

  // Combine all segment text for phase detection
  const fullText = preprocessed.normalizedSegments
    .map(seg => seg.taggedText.toLowerCase())
    .join(' ');

  for (const [phase, keywords] of Object.entries(PHASE_KEYWORDS) as [GamePhase, string[]][]) {
    for (const keyword of keywords) {
      if (fullText.includes(keyword)) {
        detectedPhases.add(phase);
        break;
      }
    }
  }

  return detectedPhases;
}

/**
 * Load rules for specific phases from the MCP server.
 * Returns formatted markdown content for injection into the user prompt.
 */
export async function loadRulesForPhases(phases: Set<GamePhase>): Promise<string> {
  if (phases.size === 0) {
    return '';
  }

  const rulesCache = getRulesCache();
  const rules: RuleContent[] = [];

  // Map phases to rule slugs
  const slugsToLoad: string[] = [];
  for (const phase of phases) {
    const slug = RULES_REFERENCE_IDS.phases[phase];
    if (slug) {
      slugsToLoad.push(slug);
    }
  }

  // Also load core combat rules if shooting or fight phases detected
  if (phases.has('shooting') || phases.has('fight')) {
    slugsToLoad.push(
      RULES_REFERENCE_IDS.combat.hitRoll,
      RULES_REFERENCE_IDS.combat.woundRoll,
      RULES_REFERENCE_IDS.combat.savingThrow
    );
  }

  // Load rules in parallel
  const loadedRules = await Promise.all(
    slugsToLoad.map(slug => rulesCache.getRule(slug))
  );

  // Filter out nulls and collect valid rules
  for (const rule of loadedRules) {
    if (rule) {
      rules.push(rule);
    }
  }

  if (rules.length === 0) {
    return '';
  }

  // Format as markdown
  const lines = ['## RELEVANT RULES CONTEXT', ''];
  for (const rule of rules) {
    lines.push(`### ${rule.title}`);
    lines.push(rule.content);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Load essential game rules for priming the narrator.
 * Returns a curated set of foundational rules.
 */
export async function loadEssentialRules(): Promise<RuleContent[]> {
  const rulesCache = getRulesCache();
  const rules: RuleContent[] = [];

  // Load all essential rules in parallel
  const loadedRules = await Promise.all(
    ESSENTIAL_RULE_SLUGS.map(slug => rulesCache.getRule(slug))
  );

  // Filter out nulls
  for (const rule of loadedRules) {
    if (rule) {
      rules.push(rule);
    }
  }

  return rules;
}

/**
 * Build a compact game mechanics context for the narrator.
 * Formats rules as a condensed reference optimized for token efficiency.
 * Target: ~400-600 tokens of high-value mechanics.
 */
export async function buildGameMechanicsContext(): Promise<string> {
  const rules = await loadEssentialRules();

  if (rules.length === 0) {
    // Fallback: return static compact reference if server unavailable
    return buildStaticMechanicsReference();
  }

  // Build compact markdown from loaded rules
  const sections: string[] = ['## GAME MECHANICS REFERENCE'];

  // Check which rule types were loaded
  const combatRules = rules.filter(r =>
    ['hit-roll', 'wound-roll', 'allocate-attack', 'saving-throw'].includes(r.slug)
  );

  // Turn structure section
  sections.push('\n### Turn Structure');
  const battleRound = rules.find(r => r.slug === 'the-battle-round');
  const playerTurns = rules.find(r => r.slug === 'player-turns');

  if (battleRound || playerTurns) {
    sections.push('- 5 Battle Rounds; roll-off winner chooses Attacker/Defender');
    sections.push('- Each round: Attacker turn → Defender turn');
    sections.push('- Turn phases: Command → Movement → Shooting → Charge → Fight');
  }

  // Phase quick reference
  sections.push('\n### Phase Quick Reference');

  const commandPhase = rules.find(r => r.slug === 'command-phase');
  if (commandPhase) {
    sections.push('- **Command**: Gain 1CP, test Battle-shock for Below Half-Strength units');
  }

  const movementPhase = rules.find(r => r.slug === 'movement-phase');
  if (movementPhase) {
    sections.push('- **Movement**: Normal (full M"), Advance (+D6"), Fall Back (from Engagement)');
  }

  const shootingPhase = rules.find(r => r.slug === 'shooting-phase');
  if (shootingPhase) {
    sections.push('- **Shooting**: Select targets → Hit roll (BS) → Wound roll → Saves → Damage');
  }

  const chargePhase = rules.find(r => r.slug === 'charge-phase');
  if (chargePhase) {
    sections.push('- **Charge**: 2D6", must reach Engagement Range of declared target(s)');
  }

  const fightPhase = rules.find(r => r.slug === 'fight-phase');
  if (fightPhase) {
    sections.push('- **Fight**: Pile in 3" → Attacks → Consolidate 3"');
  }

  // Combat sequence section (only if combat rules loaded)
  if (combatRules.length > 0) {
    sections.push('\n### Combat Sequence');
    sections.push('1. **Hit Roll**: Roll D6 per attack; compare to BS (shooting) or WS (melee)');
    sections.push('2. **Wound Roll**: Compare Strength vs Toughness (S≥2T: 2+, S>T: 3+, S=T: 4+, S<T: 5+, S≤½T: 6+)');
    sections.push('3. **Allocate Attack**: Defender chooses which model takes each wound');
    sections.push('4. **Saving Throw**: Roll D6 ≥ Save characteristic (AP modifies)');
    sections.push('5. **Damage**: Model loses wounds equal to weapon Damage');
  }

  return sections.join('\n');
}

/**
 * Static fallback mechanics reference when MCP server is unavailable.
 */
function buildStaticMechanicsReference(): string {
  return `## GAME MECHANICS REFERENCE

### Turn Structure
- 5 Battle Rounds; roll-off winner chooses Attacker/Defender
- Each round: Attacker turn → Defender turn
- Turn phases: Command → Movement → Shooting → Charge → Fight

### Phase Quick Reference
- **Command**: Gain 1CP, test Battle-shock for Below Half-Strength units
- **Movement**: Normal (full M"), Advance (+D6"), Fall Back (from Engagement)
- **Shooting**: Select targets → Hit roll (BS) → Wound roll → Saves → Damage
- **Charge**: 2D6", must reach Engagement Range of declared target(s)
- **Fight**: Pile in 3" → Attacks → Consolidate 3"

### Combat Sequence
1. **Hit Roll**: Roll D6 per attack; compare to BS (shooting) or WS (melee)
2. **Wound Roll**: Compare Strength vs Toughness (S≥2T: 2+, S>T: 3+, S=T: 4+, S<T: 5+, S≤½T: 6+)
3. **Allocate Attack**: Defender chooses which model takes each wound
4. **Saving Throw**: Roll D6 ≥ Save characteristic (AP modifies)
5. **Damage**: Model loses wounds equal to weapon Damage`;
}

/**
 * Build a context-aware user prompt that includes relevant rules.
 * This injects rules content into the user prompt (not system prompt)
 * to benefit from prompt caching on the static system prompt.
 */
export async function buildNarratorUserPromptWithContext(
  videoData: { title: string; videoId: string },
  preprocessed: PreprocessedTranscript,
  factionData?: { faction1?: FactionData; faction2?: FactionData },
  options?: { includeRulesContext?: boolean }
): Promise<string> {
  // Start with the base prompt
  let prompt = buildNarratorUserPrompt(videoData, preprocessed, factionData);

  // Optionally inject compact game mechanics context
  if (options?.includeRulesContext) {
    // Use the compact mechanics context (optimized for token efficiency)
    const mechanicsContext = await buildGameMechanicsContext();

    if (mechanicsContext) {
      // Insert rules context before the transcript section
      prompt = prompt.replace(
        '## PREPROCESSED TRANSCRIPT',
        `${mechanicsContext}\n\n## PREPROCESSED TRANSCRIPT`
      );
    }
  }

  return prompt;
}

/**
 * Get a compact rules index for reference.
 * Returns a formatted list of available rule IDs and titles.
 */
export async function getRulesReferenceList(): Promise<string> {
  const rulesCache = getRulesCache();
  const index = await rulesCache.getIndex();

  if (!index) {
    return 'Rules reference unavailable.';
  }

  const lines = ['Available rules by category:'];
  for (const category of index.categories) {
    lines.push(`\n**${category.category}** (${category.count} rules)`);
    for (const rule of category.rules.slice(0, 5)) {
      lines.push(`- [${rule.slug}]: ${rule.title}`);
    }
    if (category.count > 5) {
      lines.push(`  ... and ${category.count - 5} more`);
    }
  }

  return lines.join('\n');
}
