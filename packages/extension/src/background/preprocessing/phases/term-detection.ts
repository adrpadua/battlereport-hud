/**
 * Term detection phase.
 * Pattern-based detection for stratagems, units, objectives, factions, and detachments.
 */

import type { TermType, TermMatch, TextReplacement } from '../types';
import {
  ALL_STRATAGEMS,
  STRATAGEM_ALIASES,
  STRATAGEM_CONTEXT_KEYWORDS,
  FACTIONS,
  FACTION_ALIASES,
  DETACHMENTS,
  DETACHMENT_ALIASES,
  GAME_MECHANICS_BLOCKLIST,
  UNIT_ALIASES,
  CHARACTER_TYPE_PATTERNS,
  UNIT_WITH_WEAPON_PATTERN,
  GENERIC_WORDS,
} from '@/data/constants';
import {
  FALLBACK_SECONDARY_OBJECTIVES,
  FALLBACK_PRIMARY_OBJECTIVES,
  FALLBACK_OBJECTIVE_ALIASES,
} from '@/data/constants/objectives';
import { buildTermPattern, toCanonicalName, buildCasePreservingAliases, normalizeTerm } from './text-normalization';
import { findBestMatch } from '../matchers';
import type { PhoneticIndex } from '@/utils/phonetic-matcher';

// Build case-preserving alias maps
const STRATAGEM_ALIASES_WITH_CASE = buildCasePreservingAliases([...ALL_STRATAGEMS], STRATAGEM_ALIASES);
const FACTION_ALIASES_WITH_CASE = buildCasePreservingAliases([...FACTIONS], FACTION_ALIASES);
const DETACHMENT_ALIASES_WITH_CASE = buildCasePreservingAliases([...DETACHMENTS], DETACHMENT_ALIASES);

// Dynamic objectives storage (can be updated from API)
let dynamicSecondaryObjectives: string[] = [];
let dynamicPrimaryObjectives: string[] = [];
let dynamicGambits: string[] = [];
let dynamicObjectiveAliases = new Map<string, string>();
let cachedObjectiveAliasesWithCase: Map<string, string> | null = null;

/**
 * Update dynamic objectives from API data.
 */
export function setDynamicObjectives(
  secondaries: string[],
  primaries: string[],
  gambits: string[],
  aliases: Map<string, string>
): void {
  dynamicSecondaryObjectives = secondaries;
  dynamicPrimaryObjectives = primaries;
  dynamicGambits = gambits;
  dynamicObjectiveAliases = aliases;
  cachedObjectiveAliasesWithCase = null; // Invalidate cache
}

/**
 * Get all objectives (from API if available, otherwise fallback).
 */
export function getAllObjectives(): string[] {
  if (dynamicSecondaryObjectives.length > 0 || dynamicPrimaryObjectives.length > 0) {
    return [...dynamicSecondaryObjectives, ...dynamicPrimaryObjectives, ...dynamicGambits];
  }
  return [...FALLBACK_SECONDARY_OBJECTIVES, ...FALLBACK_PRIMARY_OBJECTIVES];
}

/**
 * Get objective aliases (from API if available, merged with fallback).
 */
export function getObjectiveAliases(): Map<string, string> {
  if (dynamicObjectiveAliases.size > 0) {
    const merged = new Map(FALLBACK_OBJECTIVE_ALIASES);
    for (const [key, value] of dynamicObjectiveAliases) {
      merged.set(key, value);
    }
    return merged;
  }
  return FALLBACK_OBJECTIVE_ALIASES;
}

/**
 * Get objective aliases with case preservation.
 */
function getObjectiveAliasesWithCase(): Map<string, string> {
  if (!cachedObjectiveAliasesWithCase) {
    cachedObjectiveAliasesWithCase = buildCasePreservingAliases(getAllObjectives(), getObjectiveAliases());
  }
  return cachedObjectiveAliasesWithCase;
}

/**
 * Categorize a term by checking against known lists.
 * Order: blocklist > faction > detachment > stratagem > objective > unit (fallback)
 */
export function categorizeTermType(
  term: string,
  unitNames: string[] = []
): { type: TermType; canonical: string } {
  const normalized = term.toLowerCase();

  // Check blocklist first - these are game mechanics, not taggable entities
  if (GAME_MECHANICS_BLOCKLIST.has(normalized)) {
    return { type: 'unknown', canonical: term };
  }

  // Check factions
  const factionMatch = FACTIONS.find(f => f.toLowerCase() === normalized);
  if (factionMatch) {
    return { type: 'faction', canonical: factionMatch };
  }
  const factionAlias = FACTION_ALIASES.get(normalized);
  if (factionAlias) {
    return { type: 'faction', canonical: factionAlias };
  }

  // Check detachments
  const detachmentMatch = DETACHMENTS.find(d => d.toLowerCase() === normalized);
  if (detachmentMatch) {
    return { type: 'detachment', canonical: detachmentMatch };
  }
  const detachmentAlias = DETACHMENT_ALIASES.get(normalized);
  if (detachmentAlias) {
    return { type: 'detachment', canonical: detachmentAlias };
  }

  // Check stratagems
  const stratagemMatch = ALL_STRATAGEMS.find(s => s.toLowerCase() === normalized);
  if (stratagemMatch) {
    return { type: 'stratagem', canonical: stratagemMatch };
  }
  const stratagemAlias = STRATAGEM_ALIASES.get(normalized);
  if (stratagemAlias) {
    return { type: 'stratagem', canonical: stratagemAlias };
  }

  // Check objectives
  const allObjectives = getAllObjectives();
  const objectiveMatch = allObjectives.find(o => o.toLowerCase() === normalized);
  if (objectiveMatch) {
    return { type: 'objective', canonical: objectiveMatch };
  }
  const objectiveAliases = getObjectiveAliases();
  const objectiveAlias = objectiveAliases.get(normalized);
  if (objectiveAlias) {
    return { type: 'objective', canonical: objectiveAlias };
  }

  // Check unit aliases
  const unitAlias = UNIT_ALIASES.get(normalized);
  if (unitAlias) {
    const aliasInBsData = unitNames.find(u => u.toLowerCase() === unitAlias.toLowerCase());
    if (aliasInBsData) {
      return { type: 'unit', canonical: aliasInBsData };
    }
    return { type: 'unit', canonical: unitAlias };
  }

  // Check against unit names (exact match)
  const unitMatch = unitNames.find(u => u.toLowerCase() === normalized);
  if (unitMatch) {
    return { type: 'unit', canonical: unitMatch };
  }

  // Try fuzzy matching against unit names
  const fuzzyUnitMatch = findBestMatch(term, unitNames, UNIT_ALIASES, 0.8);
  if (fuzzyUnitMatch) {
    return { type: 'unit', canonical: fuzzyUnitMatch };
  }

  // Try normalizing the unit name
  const normalizedUnit = normalizeUnitName(term, unitNames);
  if (normalizedUnit) {
    return { type: 'unit', canonical: normalizedUnit };
  }

  return { type: 'unknown', canonical: term };
}

/**
 * Normalize a unit name by stripping player names and weapon loadouts.
 */
export function normalizeUnitName(term: string, unitNames: string[]): string | null {
  const normalized = term.toLowerCase().trim();

  // Check character type patterns
  for (const pattern of CHARACTER_TYPE_PATTERNS) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      const characterType = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      const canonical = unitNames.find(
        (u) => u.toLowerCase() === characterType.toLowerCase() ||
               u.toLowerCase().startsWith(characterType.toLowerCase())
      );
      return canonical || characterType;
    }
  }

  // Check "unit with weapon" pattern
  const weaponMatch = normalized.match(UNIT_WITH_WEAPON_PATTERN);
  if (weaponMatch && weaponMatch[1]) {
    const baseUnit = weaponMatch[1];
    const variations = [baseUnit, baseUnit + 's', baseUnit.replace(/s$/, '')];

    for (const variant of variations) {
      const canonical = unitNames.find(
        (u) => u.toLowerCase() === variant.toLowerCase()
      );
      if (canonical) {
        return canonical;
      }
    }
  }

  return null;
}

/**
 * Add dynamic aliases for official unit names.
 */
export function addDynamicAliases(aliases: Map<string, string>, officialNames: string[]): void {
  for (const name of officialNames) {
    const lower = name.toLowerCase();

    // Add the name itself (for case normalization)
    aliases.set(lower, name);

    // Add singular/plural variations
    if (lower.endsWith('s') && lower.length > 6) {
      aliases.set(lower.slice(0, -1), name);
    } else if (!lower.endsWith('s') && lower.length > 5) {
      aliases.set(lower + 's', name);
    }

    // Add without common suffixes
    const withoutSuffix = lower
      .replace(/\s*(squad|unit|team|band|pack|\[legends\])$/i, '')
      .trim();
    if (withoutSuffix !== lower && withoutSuffix.length > 5 && !GENERIC_WORDS.has(withoutSuffix)) {
      aliases.set(withoutSuffix, name);
    }
  }
}

/**
 * Build fuzzy aliases synchronously.
 */
export function buildFuzzyUnitAliasesSync(officialNames: string[]): Map<string, string> {
  const aliases = new Map<string, string>(UNIT_ALIASES);
  addDynamicAliases(aliases, officialNames);
  return aliases;
}

/**
 * Result of detecting terms in text.
 */
export interface TermDetectionResult {
  matches: TermMatch[];
  replacements: TextReplacement[];
  mentionsByType: {
    stratagems: Map<string, number[]>;
    units: Map<string, number[]>;
    objectives: Map<string, number[]>;
    factions: Map<string, number[]>;
    detachments: Map<string, number[]>;
  };
  colloquialToOfficial: Map<string, string>;
}

/**
 * Detect all term types in a single text segment.
 */
export function detectTermsInText(
  text: string,
  timestamp: number,
  options: {
    unitNames: string[];
    unitAliases: Map<string, string>;
    phoneticIndex?: PhoneticIndex | null;
    detectObjectives?: boolean;
    detectFactions?: boolean;
    detectDetachments?: boolean;
  }
): TermDetectionResult {
  const matches: TermMatch[] = [];
  const replacements: TextReplacement[] = [];
  const colloquialToOfficial = new Map<string, string>();

  const mentionsByType = {
    stratagems: new Map<string, number[]>(),
    units: new Map<string, number[]>(),
    objectives: new Map<string, number[]>(),
    factions: new Map<string, number[]>(),
    detachments: new Map<string, number[]>(),
  };

  const { unitNames, unitAliases, phoneticIndex, detectObjectives = true, detectFactions = true, detectDetachments = true } = options;

  // Build patterns
  const stratagemPattern = buildTermPattern([...ALL_STRATAGEMS], STRATAGEM_ALIASES);
  const unitPattern = unitNames.length > 0 ? buildTermPattern(unitNames, unitAliases) : null;
  const objectivePattern = detectObjectives ? buildTermPattern(getAllObjectives(), getObjectiveAliases()) : null;
  const factionPattern = detectFactions ? buildTermPattern([...FACTIONS], FACTION_ALIASES) : null;
  const detachmentPattern = detectDetachments ? buildTermPattern([...DETACHMENTS], DETACHMENT_ALIASES) : null;

  // Helper to add mention
  const addMention = (map: Map<string, number[]>, canonical: string, ts: number) => {
    if (!map.has(canonical)) {
      map.set(canonical, []);
    }
    const timestamps = map.get(canonical)!;
    if (!timestamps.includes(ts)) {
      timestamps.push(ts);
    }
  };

  // Helper to add match and replacement
  const addMatch = (term: string, canonical: string, type: TermType) => {
    if (replacements.some(r => r.original.toLowerCase() === term.toLowerCase())) {
      return; // Already processed
    }

    if (term.toLowerCase() !== canonical.toLowerCase()) {
      colloquialToOfficial.set(term.toLowerCase(), canonical);
    }

    matches.push({
      term,
      normalizedTerm: canonical,
      type,
      timestamp,
      segmentText: text,
    });

    replacements.push({ original: term, official: canonical, type });
  };

  // Detect stratagems
  for (const match of text.matchAll(stratagemPattern)) {
    const term = match[1];
    if (!term) continue;

    const normalized = normalizeTerm(term);

    // Skip context keywords unless "stratagem" is in text
    if (STRATAGEM_CONTEXT_KEYWORDS.map(k => k.toLowerCase()).includes(normalized)) {
      if (!text.toLowerCase().includes('stratagem')) {
        continue;
      }
    }

    const canonical = toCanonicalName(term, STRATAGEM_ALIASES_WITH_CASE);
    addMention(mentionsByType.stratagems, canonical, timestamp);
    addMatch(term, canonical, 'stratagem');
  }

  // Detect units
  if (unitPattern) {
    for (const match of text.matchAll(unitPattern)) {
      const term = match[1];
      if (!term) continue;

      let canonical = toCanonicalName(term, unitAliases);

      if (canonical === normalizeTerm(term)) {
        const fuzzyMatch = findBestMatch(term, unitNames, unitAliases, 0.75, phoneticIndex);
        if (fuzzyMatch) {
          canonical = fuzzyMatch;
        }
      }

      addMention(mentionsByType.units, canonical, timestamp);
      addMatch(term, canonical, 'unit');
    }
  }

  // Detect objectives
  if (objectivePattern) {
    for (const match of text.matchAll(objectivePattern)) {
      const term = match[1];
      if (!term) continue;

      const canonical = toCanonicalName(term, getObjectiveAliasesWithCase());
      addMention(mentionsByType.objectives, canonical, timestamp);
      addMatch(term, canonical, 'objective');
    }
  }

  // Detect factions
  if (factionPattern) {
    for (const match of text.matchAll(factionPattern)) {
      const term = match[1];
      if (!term) continue;

      const canonical = toCanonicalName(term, FACTION_ALIASES_WITH_CASE);
      addMention(mentionsByType.factions, canonical, timestamp);
      addMatch(term, canonical, 'faction');
    }
  }

  // Detect detachments
  if (detachmentPattern) {
    for (const match of text.matchAll(detachmentPattern)) {
      const term = match[1];
      if (!term) continue;

      const canonical = toCanonicalName(term, DETACHMENT_ALIASES_WITH_CASE);
      addMention(mentionsByType.detachments, canonical, timestamp);
      addMatch(term, canonical, 'detachment');
    }
  }

  return { matches, replacements, mentionsByType, colloquialToOfficial };
}
