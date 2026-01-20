import type { BattleReport, Unit, ConfidenceLevel, UnitSuggestion } from '@/types/battle-report';
import type { FactionData, UnitStats } from '@/types/bsdata';
import type { FeedbackItem, UserMapping } from '@battlereport/shared/types';
import { loadFactionByName } from '@/utils/faction-loader';
import { getBestMatch, validateUnitWithFeedback } from '@/utils/unit-validator';

export interface EnrichedUnit extends Unit {
  stats?: UnitStats;
  keywords?: string[];
  isValidated?: boolean;
  suggestedMatch?: UnitSuggestion;
}

export interface ProcessedBattleReport extends Omit<BattleReport, 'units'> {
  units: EnrichedUnit[];
  feedbackItems: FeedbackItem[];
}

/**
 * Options for processing a battle report with feedback capture.
 */
export interface ProcessOptions {
  videoId: string;
  userMappings?: UserMapping[];
  transcriptContext?: string;
}

/**
 * Boost confidence level based on validation.
 */
function boostConfidence(
  original: ConfidenceLevel,
  validationConfidence: number
): ConfidenceLevel {
  if (validationConfidence >= 0.9) {
    return 'high';
  }
  if (validationConfidence >= 0.7) {
    return original === 'low' ? 'medium' : original;
  }
  return original;
}

/**
 * Lower confidence for unvalidated units.
 */
function lowerConfidence(original: ConfidenceLevel): ConfidenceLevel {
  if (original === 'high') return 'medium';
  if (original === 'medium') return 'low';
  return 'low';
}

/**
 * Find a user mapping for a given alias.
 */
function findUserMapping(
  alias: string,
  entityType: 'unit' | 'stratagem' | 'faction' | 'detachment',
  factionId: string | undefined,
  userMappings: UserMapping[]
): UserMapping | undefined {
  const normalizedAlias = alias.toLowerCase().trim();

  // First try faction-specific match
  if (factionId) {
    const factionMatch = userMappings.find(
      (m) =>
        m.alias.toLowerCase() === normalizedAlias &&
        m.entityType === entityType &&
        m.factionId === factionId
    );
    if (factionMatch) return factionMatch;
  }

  // Fall back to generic match (no faction)
  return userMappings.find(
    (m) =>
      m.alias.toLowerCase() === normalizedAlias &&
      m.entityType === entityType &&
      !m.factionId
  );
}

/**
 * Process and validate a battle report against BSData.
 * - Applies user mappings first (learned aliases)
 * - Validates unit names using fuzzy matching
 * - Corrects spelling where confident
 * - Enriches units with stats and keywords
 * - Adjusts confidence levels based on validation
 * - Captures feedback items for unknown/low-confidence tokens
 */
export async function processBattleReport(
  report: BattleReport,
  options?: ProcessOptions
): Promise<ProcessedBattleReport> {
  const userMappings = options?.userMappings ?? [];
  const videoId = options?.videoId ?? '';
  const transcriptContext = options?.transcriptContext ?? '';

  // Load factions for both players
  const factions = new Map<number, FactionData | null>();

  await Promise.all(
    report.players.map(async (player, index) => {
      const faction = await loadFactionByName(player.faction);
      factions.set(index, faction);
    })
  );

  // Collect feedback items
  const feedbackItems: FeedbackItem[] = [];

  // Process each unit
  const enrichedUnits: EnrichedUnit[] = report.units.map((unit) => {
    const playerFaction = factions.get(unit.playerIndex);

    // If no faction data, return unit as-is with lower confidence
    if (!playerFaction) {
      return {
        ...unit,
        isValidated: false,
        confidence: lowerConfidence(unit.confidence),
      };
    }

    // Check user mappings first (apply learned aliases)
    const mapping = findUserMapping(unit.name, 'unit', playerFaction.id, userMappings);
    let unitNameToValidate = unit.name;

    if (mapping) {
      // User has a mapping for this alias - use the canonical name
      unitNameToValidate = mapping.canonicalName;
    }

    // Validate unit against faction with feedback capture
    const { validation, feedbackItem } = validateUnitWithFeedback(
      unitNameToValidate,
      playerFaction,
      {
        videoId,
        transcriptContext,
        videoTimestamp: unit.videoTimestamp,
        playerIndex: unit.playerIndex,
      }
    );

    // Collect feedback for unvalidated units (but not if we already had a mapping)
    if (feedbackItem && !mapping) {
      // Update the original token to the actual input (before mapping was applied)
      feedbackItem.originalToken = unit.name;
      feedbackItems.push(feedbackItem);
    }

    if (validation.isValidated && validation.matchedUnit) {
      // Unit validated - enrich with data
      return {
        ...unit,
        name: validation.matchedName,
        confidence: boostConfidence(unit.confidence, validation.confidence),
        pointsCost: unit.pointsCost ?? validation.matchedUnit.pointsCost ?? undefined,
        stats: validation.matchedUnit.stats ?? undefined,
        keywords: validation.matchedUnit.keywords,
        isValidated: true,
      };
    }

    // Unit not validated - get best match as suggestion
    const bestMatch = getBestMatch(unit.name, playerFaction);

    const enrichedUnit: EnrichedUnit = {
      ...unit,
      isValidated: false,
      // Don't lower confidence if it was already low
      confidence: unit.confidence === 'low' ? 'low' : lowerConfidence(unit.confidence),
    };

    // Add suggestion if there's a reasonable match
    if (bestMatch && bestMatch.confidence >= 0.3) {
      enrichedUnit.suggestedMatch = {
        name: bestMatch.matchedName,
        confidence: bestMatch.confidence,
        stats: bestMatch.matchedUnit?.stats ?? undefined,
        keywords: bestMatch.matchedUnit?.keywords,
        pointsCost: bestMatch.matchedUnit?.pointsCost ?? undefined,
      };
    }

    return enrichedUnit;
  });

  return {
    ...report,
    units: enrichedUnits,
    feedbackItems,
  };
}

/**
 * Get faction unit names for AI prompt injection.
 */
export async function getFactionContextForPrompt(
  factionName: string
): Promise<string[]> {
  const faction = await loadFactionByName(factionName);
  if (!faction) {
    return [];
  }
  return faction.units.map((u) => u.name);
}

/**
 * Detect faction from text (title, description, etc.).
 * Returns faction name if confident, null otherwise.
 */
export function detectFactionFromText(text: string): string | null {
  const lowerText = text.toLowerCase();

  // Common faction keywords
  const factionPatterns: [RegExp, string][] = [
    [/\bspace\s*marines?\b|\bspace\s*marine\b|\bsm\b|\bastartes\b/i, 'Space Marines'],
    [/\bnecrons?\b|\bcrons?\b/i, 'Necrons'],
    [/\borks?\b|\bgreenskins?\b/i, 'Orks'],
    [/\btyranids?\b|\bnids?\b|\bbugs?\b/i, 'Tyranids'],
    [/\baeldari\b|\beldar\b|\bcraftworld/i, 'Aeldari'],
    [/\bdrukhari\b|\bdark\s*eldar/i, 'Drukhari'],
    [/\bt'?au\b|\btau\s*empire/i, "T'au Empire"],
    [/\bchaos\s*space\s*marines?\b|\bcsm\b|\bheretic\s*astartes/i, 'Chaos Space Marines'],
    [/\bdeath\s*guard\b|\bdg\b/i, 'Death Guard'],
    [/\bthousand\s*sons?\b|\btsons?\b/i, 'Thousand Sons'],
    [/\bworld\s*eaters?\b/i, 'World Eaters'],
    [/\bemperor'?s?\s*children/i, "Emperor's Children"],
    [/\bchaos\s*daemons?\b|\bdaemons?\b|\bdemons?\b/i, 'Chaos Daemons'],
    [/\bimperial\s*knights?\b/i, 'Imperial Knights'],
    [/\bchaos\s*knights?\b/i, 'Chaos Knights'],
    [/\bastra\s*militarum\b|\bimperial\s*guard\b|\bguard\b/i, 'Astra Militarum'],
    [/\badeptus\s*custodes\b|\bcustodes\b/i, 'Adeptus Custodes'],
    [/\badepta\s*sororitas\b|\bsisters?\s*(of\s*battle)?\b|\bsob\b/i, 'Adepta Sororitas'],
    [/\badeptus\s*mechanicus\b|\badmech\b|\bad\s*mech\b/i, 'Adeptus Mechanicus'],
    [/\bgrey\s*knights?\b/i, 'Grey Knights'],
    [/\bblood\s*angels?\b/i, 'Blood Angels'],
    [/\bdark\s*angels?\b/i, 'Dark Angels'],
    [/\bblack\s*templars?\b/i, 'Black Templars'],
    [/\bspace\s*wolves?\b|\bwolves?\b/i, 'Space Wolves'],
    [/\bdeathwatch\b/i, 'Deathwatch'],
    [/\bultramarines?\b/i, 'Ultramarines'],
    [/\bgenestealer\s*cults?\b|\bgsc\b/i, 'Genestealer Cults'],
    [/\bleagues?\s*(of\s*)?votann\b|\bvotann\b|\bsquats?\b/i, 'Leagues of Votann'],
    [/\bagents?\s*(of\s*the\s*)?imperium\b|\binquisition\b/i, 'Agents of the Imperium'],
  ];

  for (const [pattern, factionName] of factionPatterns) {
    if (pattern.test(lowerText)) {
      return factionName;
    }
  }

  return null;
}
