import type { TranscriptSegment } from '@/types/youtube';
import type { Stratagem, Unit } from '@/types/battle-report';

export interface TermMatch {
  term: string;
  normalizedTerm: string;
  type: 'stratagem' | 'unit' | 'game_term';
  timestamp: number; // seconds
  segmentText: string; // original text for context
}

export interface PreprocessedTranscript {
  matches: TermMatch[];
  stratagemMentions: Map<string, number[]>; // normalized name -> timestamps
  unitMentions: Map<string, number[]>;
}

// Core stratagems available to all armies (10th edition)
const CORE_STRATAGEMS = [
  'Fire Overwatch',
  'Go to Ground',
  'Smokescreen',
  'Rapid Ingress',
  'Heroic Intervention',
  'Counter-offensive',
  'Insane Bravery',
  'Grenade',
  'Tank Shock',
  'Command Re-roll',
  'Epic Challenge',
];

// Common faction stratagems (expanded list)
const FACTION_STRATAGEMS = [
  // Space Marines
  'Armour of Contempt',
  'Only in Death Does Duty End',
  'Honour the Chapter',
  'Fury of the First',
  'Adaptive Strategy',
  'Storm of Fire',
  'Oath of Moment',
  // Aeldari
  'Fire and Fade',
  'Lightning-Fast Reactions',
  'Forewarned',
  'Phantasm',
  'Matchless Agility',
  'Feigned Retreat',
  'Cloudstrike',
  'Webway Strike',
  'Linked Fire',
  'Battle Focus',
  'Strands of Fate',
  'Strike Swiftly', // Added from screenshot
  'Focus Fire', // Added from screenshot
  // Necrons
  'Awakened by Murder',
  'Disruption Fields',
  'Solar Pulse',
  'Techno-Oracular Targeting',
  'Protocol of the Hungry Void',
  'Protocol of the Vengeful Stars',
  'Protocol of the Conquering Tyrant',
  // Chaos Space Marines
  'Dark Pact',
  'Let the Galaxy Burn',
  'Profane Zeal',
  'Veterans of the Long War',
  // Death Guard
  'Disgustingly Resilient',
  'Putrid Detonation',
  'Trench Fighters',
  // Tyranids
  'Synaptic Channelling',
  'Rapid Regeneration',
  'Death Frenzy',
  'Endless Swarm',
  'Hyper-Adaptation',
  // Orks
  "Orks is Never Beaten",
  'Careen',
  'Get Stuck In',
  "Unbridled Carnage",
  // T'au
  'For the Greater Good',
  'Photon Grenades',
  'Point-Blank Volley',
  'Breach and Clear',
  // Custodes
  'Arcane Genetic Alchemy',
  'Slayers of Tyrants',
  "Emperor's Auspice",
  'Tanglefoot Grenade',
  // Sisters
  'Divine Intervention',
  'Martyrdom',
  'Spirit of the Martyr',
  // Guard
  'Take Cover',
  'Fields of Fire',
  'Reinforcements',
  'Suppressive Fire',
  // Knights
  'Rotate Ion Shields',
  'Machine Spirit Resurgent',
  // Leagues of Votann
  'Ancestral Sentence',
  'Void Armour',
  // Generic terms that indicate stratagem use
  'uses a stratagem',
  'plays a stratagem',
  'activates',
  'pops',
  'CP',
  'command points',
];

const ALL_STRATAGEMS = [...CORE_STRATAGEMS, ...FACTION_STRATAGEMS];

// Map colloquial/shortened names to canonical names
const STRATAGEM_ALIASES = new Map<string, string>([
  ['overwatch', 'fire overwatch'],
  ['re-roll', 'command re-roll'],
  ['reroll', 'command re-roll'],
]);

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalize a term for comparison (lowercase, trim, collapse whitespace).
 */
function normalizeTerm(term: string): string {
  return term.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Build a regex pattern from a list of terms.
 * Handles word boundaries appropriately.
 * If aliases are provided, includes alias terms in the pattern.
 */
function buildTermPattern(terms: string[], aliases?: Map<string, string>): RegExp {
  const allTerms = [...terms];
  if (aliases) {
    allTerms.push(...aliases.keys());
  }

  const escapedTerms = allTerms
    .filter((t) => t.length >= 2) // Skip very short terms
    .map(escapeRegex)
    .sort((a, b) => b.length - a.length); // Longer terms first for greedy matching

  if (escapedTerms.length === 0) {
    return /(?!)/; // Never matches
  }

  return new RegExp(`\\b(${escapedTerms.join('|')})\\b`, 'gi');
}

/**
 * Resolve a term to its canonical name using the alias map.
 */
function toCanonicalName(term: string, aliases: Map<string, string>): string {
  const normalized = normalizeTerm(term);
  return aliases.get(normalized) ?? normalized;
}

/**
 * Pre-process transcript to find mentions of stratagems and units.
 */
export function preprocessTranscript(
  transcript: TranscriptSegment[],
  unitNames: string[] = []
): PreprocessedTranscript {
  const matches: TermMatch[] = [];
  const stratagemMentions = new Map<string, number[]>();
  const unitMentions = new Map<string, number[]>();

  // Build patterns (include aliases for stratagems)
  const stratagemPattern = buildTermPattern(ALL_STRATAGEMS, STRATAGEM_ALIASES);
  const unitPattern = unitNames.length > 0 ? buildTermPattern(unitNames) : null;

  for (const seg of transcript) {
    const timestamp = Math.floor(seg.startTime);
    const text = seg.text;

    // Find stratagem mentions
    for (const match of text.matchAll(stratagemPattern)) {
      const term = match[1];
      if (!term) continue; // Skip if no capture group

      const normalized = normalizeTerm(term);

      // Skip generic terms unless they're near stratagem keywords
      if (['cp', 'command points', 'activates', 'pops'].includes(normalized)) {
        // Only count if "stratagem" is also in the segment
        if (!text.toLowerCase().includes('stratagem')) {
          continue;
        }
      }

      // Resolve alias to canonical name for storage
      const canonical = toCanonicalName(term, STRATAGEM_ALIASES);

      if (!stratagemMentions.has(canonical)) {
        stratagemMentions.set(canonical, []);
      }
      stratagemMentions.get(canonical)!.push(timestamp);

      matches.push({
        term,
        normalizedTerm: canonical,
        type: 'stratagem',
        timestamp,
        segmentText: text,
      });
    }

    // Find unit mentions
    if (unitPattern) {
      for (const match of text.matchAll(unitPattern)) {
        const term = match[1];
        if (!term) continue; // Skip if no capture group

        const normalized = normalizeTerm(term);

        if (!unitMentions.has(normalized)) {
          unitMentions.set(normalized, []);
        }
        unitMentions.get(normalized)!.push(timestamp);

        matches.push({
          term,
          normalizedTerm: normalized,
          type: 'unit',
          timestamp,
          segmentText: text,
        });
      }
    }
  }

  return { matches, stratagemMentions, unitMentions };
}

/**
 * Find the best matching timestamp for a stratagem name.
 */
function findStratagemTimestamp(
  stratagemName: string,
  mentions: Map<string, number[]>
): number | undefined {
  const normalized = normalizeTerm(stratagemName);

  // Exact match
  if (mentions.has(normalized)) {
    return mentions.get(normalized)![0]; // First mention
  }

  // Partial match - check if any mention contains or is contained by our name
  for (const [mentionedName, timestamps] of mentions) {
    if (mentionedName.includes(normalized) || normalized.includes(mentionedName)) {
      return timestamps[0];
    }

    // Word overlap check (at least 2 words must match)
    const nameWords = normalized.split(' ').filter((w) => w.length > 2);
    const mentionWords = mentionedName.split(' ').filter((w) => w.length > 2);
    const overlap = nameWords.filter((w) => mentionWords.includes(w));
    if (overlap.length >= 1 && overlap.length >= Math.min(nameWords.length, mentionWords.length) / 2) {
      return timestamps[0];
    }
  }

  return undefined;
}

/**
 * Enrich stratagems with timestamps from preprocessed transcript.
 */
export function enrichStratagemTimestamps(
  stratagems: Stratagem[],
  preprocessed: PreprocessedTranscript
): Stratagem[] {
  return stratagems.map((s) => {
    // Skip if already has a timestamp
    if (s.videoTimestamp !== undefined) {
      return s;
    }

    const timestamp = findStratagemTimestamp(s.name, preprocessed.stratagemMentions);

    if (timestamp !== undefined) {
      return {
        ...s,
        videoTimestamp: timestamp,
      };
    }

    return s;
  });
}

/**
 * Get all detected stratagems from preprocessing (for validation/debugging).
 */
export function getDetectedStratagems(preprocessed: PreprocessedTranscript): string[] {
  return [...preprocessed.stratagemMentions.keys()];
}

/**
 * Find the best matching timestamp for a unit name.
 */
function findUnitTimestamp(
  unitName: string,
  mentions: Map<string, number[]>
): number | undefined {
  const normalized = normalizeTerm(unitName);

  // Exact match
  if (mentions.has(normalized)) {
    return mentions.get(normalized)![0]; // First mention
  }

  // Partial match - check if any mention contains or is contained by our name
  for (const [mentionedName, timestamps] of mentions) {
    if (mentionedName.includes(normalized) || normalized.includes(mentionedName)) {
      return timestamps[0];
    }

    // Word overlap check (at least 1 significant word must match)
    const nameWords = normalized.split(' ').filter((w) => w.length > 2);
    const mentionWords = mentionedName.split(' ').filter((w) => w.length > 2);
    const overlap = nameWords.filter((w) => mentionWords.includes(w));
    if (overlap.length >= 1 && overlap.length >= Math.min(nameWords.length, mentionWords.length) / 2) {
      return timestamps[0];
    }
  }

  return undefined;
}

/**
 * Enrich units with timestamps from preprocessed transcript.
 */
export function enrichUnitTimestamps(
  units: Unit[],
  preprocessed: PreprocessedTranscript
): Unit[] {
  return units.map((u) => {
    // Skip if already has a timestamp
    if (u.videoTimestamp !== undefined) {
      return u;
    }

    const timestamp = findUnitTimestamp(u.name, preprocessed.unitMentions);

    if (timestamp !== undefined) {
      return {
        ...u,
        videoTimestamp: timestamp,
      };
    }

    return u;
  });
}
