import type { BattleReport, Unit, Stratagem, ConfidenceLevel, UnitSuggestion } from '@/types/battle-report';
import type { FactionData, UnitStats } from '@/types/bsdata';
import type { FeedbackItem, UserMapping } from '@battlereport/shared/types';
import { loadFactionByName } from '@/utils/faction-loader';
import { getBestMatch, validateUnitWithFeedback } from '@/utils/unit-validator';
import {
  validateStratagem,
  getBestStratagemMatch,
  preloadStratagemsForFactions,
  type StratagemSuggestion,
} from '@/utils/stratagem-validator';
import {
  FALLBACK_SECONDARY_OBJECTIVES,
  FALLBACK_PRIMARY_OBJECTIVES,
} from '@/data/constants';

// Build a set of objective names (lowercase) to filter out from stratagems
const OBJECTIVE_NAMES_SET = new Set([
  ...FALLBACK_SECONDARY_OBJECTIVES.map((o) => o.toLowerCase()),
  ...FALLBACK_PRIMARY_OBJECTIVES.map((o) => o.toLowerCase()),
]);

/**
 * Check if a name is a secondary/primary objective (not a stratagem).
 */
function isObjective(name: string): boolean {
  return OBJECTIVE_NAMES_SET.has(name.toLowerCase().trim());
}

/**
 * Clean up entity names that may have annotations from AI output.
 * Removes all trailing parenthetical content like:
 * - Type annotations: "(unit)", "(stratagem)", "(enhancement)"
 * - Descriptive suffixes: "(6 model unit)", "(unit 1)", "(deep strike)"
 * - Model counts: "(15)", "(10)"
 * - Context notes: "(proxied as Raveners)", "(mentioned as an idea)"
 */
export function cleanEntityName(name: string): string {
  // Strip all trailing parenthetical content
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export interface EnrichedUnit extends Unit {
  stats?: UnitStats;
  keywords?: string[];
  isValidated?: boolean;
  suggestedMatch?: UnitSuggestion;
}

export interface EnrichedStratagem extends Stratagem {
  cpCost?: string;
  phase?: string;
  effect?: string;
  detachment?: string;
  isValidated?: boolean;
  suggestedMatch?: StratagemSuggestion;
}

export interface ProcessedBattleReport extends Omit<BattleReport, 'units' | 'stratagems'> {
  units: EnrichedUnit[];
  stratagems: EnrichedStratagem[];
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

    // Clean up any type annotations the AI may have included (e.g., "(unit)")
    const cleanedName = cleanEntityName(unit.name);
    const cleanedUnit = { ...unit, name: cleanedName };

    // If no faction data, return unit as-is with lower confidence
    if (!playerFaction) {
      return {
        ...cleanedUnit,
        isValidated: false,
        confidence: lowerConfidence(cleanedUnit.confidence),
      };
    }

    // Check user mappings first (apply learned aliases)
    const mapping = findUserMapping(cleanedName, 'unit', playerFaction.id, userMappings);
    let unitNameToValidate = cleanedName;

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
        videoTimestamp: cleanedUnit.videoTimestamp,
        playerIndex: cleanedUnit.playerIndex,
      }
    );

    // Collect feedback for unvalidated units (but not if we already had a mapping)
    if (feedbackItem && !mapping) {
      // Update the original token to the actual input (before mapping was applied)
      feedbackItem.originalToken = cleanedName;
      feedbackItems.push(feedbackItem);
    }

    if (validation.isValidated && validation.matchedUnit) {
      // Unit validated - enrich with data
      return {
        ...cleanedUnit,
        name: validation.matchedName,
        confidence: boostConfidence(cleanedUnit.confidence, validation.confidence),
        pointsCost: cleanedUnit.pointsCost ?? validation.matchedUnit.pointsCost ?? undefined,
        stats: validation.matchedUnit.stats ?? undefined,
        keywords: validation.matchedUnit.keywords,
        isValidated: true,
      };
    }

    // Unit not validated - get best match as suggestion
    const bestMatch = getBestMatch(cleanedName, playerFaction);

    const enrichedUnit: EnrichedUnit = {
      ...cleanedUnit,
      isValidated: false,
      // Don't lower confidence if it was already low
      confidence: cleanedUnit.confidence === 'low' ? 'low' : lowerConfidence(cleanedUnit.confidence),
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

  // Preload stratagems for both factions
  const factionNames = report.players.map((p) => p.faction).filter(Boolean);
  await preloadStratagemsForFactions(factionNames);

  // Filter out secondary/primary objectives that were incorrectly extracted as stratagems
  const actualStratagems = report.stratagems.filter((stratagem) => {
    const cleanedName = cleanEntityName(stratagem.name);
    if (isObjective(cleanedName)) {
      console.log(`Filtering out objective "${cleanedName}" from stratagems list`);
      return false;
    }
    return true;
  });

  // Process each stratagem
  const enrichedStratagems: EnrichedStratagem[] = await Promise.all(
    actualStratagems.map(async (stratagem) => {
      // Clean up any type annotations the AI may have included
      const cleanedName = cleanEntityName(stratagem.name);
      const cleanedStratagem = { ...stratagem, name: cleanedName };

      // Determine which faction to validate against
      // Use the player's faction if assigned, otherwise try both factions
      let factionToValidate: string | null = null;
      if (cleanedStratagem.playerIndex !== undefined) {
        const player = report.players[cleanedStratagem.playerIndex];
        if (player) {
          factionToValidate = player.faction;
        }
      }

      // If no faction assigned, try the first player's faction as a default
      if (!factionToValidate && report.players.length > 0) {
        factionToValidate = report.players[0].faction;
      }

      if (!factionToValidate) {
        // No faction to validate against
        return {
          ...cleanedStratagem,
          isValidated: false,
          confidence: lowerConfidence(cleanedStratagem.confidence),
        };
      }

      // Check user mappings first (apply learned aliases)
      const playerFaction = factions.get(cleanedStratagem.playerIndex ?? 0);
      const mapping = findUserMapping(
        cleanedName,
        'stratagem',
        playerFaction?.id,
        userMappings
      );
      let stratagemNameToValidate = cleanedName;

      if (mapping) {
        // User has a mapping for this alias - use the canonical name
        stratagemNameToValidate = mapping.canonicalName;
      }

      // Validate stratagem against faction
      const validation = await validateStratagem(stratagemNameToValidate, factionToValidate);

      if (validation.isValidated && validation.matchedStratagem) {
        // Stratagem validated - enrich with data
        return {
          ...cleanedStratagem,
          name: validation.matchedName,
          confidence: boostConfidence(cleanedStratagem.confidence, validation.confidence),
          cpCost: validation.matchedStratagem.cpCost,
          phase: validation.matchedStratagem.phase,
          effect: validation.matchedStratagem.effect,
          detachment: validation.matchedStratagem.detachment ?? undefined,
          isValidated: true,
        };
      }

      // Stratagem not validated - get best match as suggestion
      const bestMatch = await getBestStratagemMatch(cleanedName, factionToValidate);

      const enrichedStratagem: EnrichedStratagem = {
        ...cleanedStratagem,
        isValidated: false,
        // Don't lower confidence if it was already low
        confidence: cleanedStratagem.confidence === 'low' ? 'low' : lowerConfidence(cleanedStratagem.confidence),
      };

      // Add suggestion if there's a reasonable match
      if (bestMatch && bestMatch.confidence >= 0.3 && bestMatch.matchedStratagem) {
        enrichedStratagem.suggestedMatch = {
          name: bestMatch.matchedName,
          confidence: bestMatch.confidence,
          cpCost: bestMatch.matchedStratagem.cpCost,
          phase: bestMatch.matchedStratagem.phase,
        };
      }

      return enrichedStratagem;
    })
  );

  return {
    ...report,
    units: enrichedUnits,
    stratagems: enrichedStratagems,
    feedbackItems,
  };
}

/**
 * Get faction unit names for AI prompt injection.
 * If detachment is provided, returns only units available for that detachment.
 * Otherwise returns all units (for backwards compatibility).
 */
export async function getFactionContextForPrompt(
  factionName: string,
  detachment?: string
): Promise<string[]> {
  const faction = await loadFactionByName(factionName);
  if (!faction) {
    return [];
  }

  // If detachment specified and we have detachment-specific data, use filtered list
  if (detachment && faction.detachmentUnits && faction.detachmentUnits[detachment]) {
    return faction.detachmentUnits[detachment];
  }

  // If detachment specified but not found, fall back to core units if available
  if (detachment && faction.coreUnits) {
    return faction.coreUnits;
  }

  // Default: return all unit names
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
