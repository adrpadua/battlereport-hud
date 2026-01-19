import type { TranscriptSegment } from '@/types/youtube';
import type { Stratagem, Unit } from '@/types/battle-report';

export interface TermMatch {
  term: string;
  normalizedTerm: string;
  type: 'stratagem' | 'unit' | 'objective' | 'faction' | 'detachment';
  timestamp: number; // seconds
  segmentText: string; // original text for context
}

export interface NormalizedSegment extends TranscriptSegment {
  normalizedText: string; // Text with colloquial terms replaced by official names
  taggedText: string; // Text with gameplay terms tagged: [UNIT:Name] or [STRAT:Name]
}

export interface PreprocessedTranscript {
  matches: TermMatch[];
  stratagemMentions: Map<string, number[]>; // normalized name -> timestamps
  unitMentions: Map<string, number[]>;
  objectiveMentions: Map<string, number[]>; // objective name -> timestamps
  factionMentions: Map<string, number[]>; // faction name -> timestamps
  detachmentMentions: Map<string, number[]>; // detachment name -> timestamps
  normalizedSegments: NormalizedSegment[]; // Segments with corrected/tagged terms (deduped)
  colloquialToOfficial: Map<string, string>; // Mapping of corrections made
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

// Common faction stratagems (extended list)
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
  'Strike Swiftly',
  'Focus Fire',
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
  'Unbridled Carnage',
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
];

// Terms that indicate stratagem use but aren't stratagem names themselves
// These are only matched when "stratagem" also appears in the text
const STRATAGEM_CONTEXT_KEYWORDS = ['activates', 'pops', 'CP', 'command points'];

const ALL_STRATAGEMS = [...CORE_STRATAGEMS, ...FACTION_STRATAGEMS];

// Map colloquial/shortened names to canonical names
const STRATAGEM_ALIASES = new Map<string, string>([
  ['overwatch', 'fire overwatch'],
  ['re-roll', 'command re-roll'],
  ['reroll', 'command re-roll'],
]);

// Secondary Objectives (Chapter Approved 2025-26 and Leviathan)
const SECONDARY_OBJECTIVES = [
  // Kill-based
  'Assassination',
  'Bring It Down',
  'No Prisoners',
  'Marked for Death',
  'Cull the Horde',
  // Positional/Action
  'Behind Enemy Lines',
  'Engage on All Fronts',
  'Area Denial',
  'Secure No Man\'s Land',
  'Deploy Teleport Homers',
  'Investigate Signals',
  'Cleanse',
  'Recover Assets',
  // Tactical
  'Storm Hostile Objective',
  'Defend Stronghold',
  'Overwhelming Force',
  'Display of Might',
  'Sabotage',
  'Tempting Target',
  // Fixed secondaries
  'Extend Battle Lines',
  'Grind Them Down',
  'Surgical Strikes',
  'Search and Destroy',
];

// Primary Objectives / Mission Names (Chapter Approved 2025-26)
const PRIMARY_OBJECTIVES = [
  'Hidden Supplies',
  'Take and Hold',
  'The Ritual',
  'Terraform',
  'Purge the Foe',
  'Scorched Earth',
  'Unexploded Ordnance',
  'Supply Drop',
  'Linchpin',
  'Burden of Trust',
  'Syphoned Power',
  'Establish Control',
  'Uneven Ground',
  'Denied Resources',
  'Hold Out',
];

const ALL_OBJECTIVES = [...SECONDARY_OBJECTIVES, ...PRIMARY_OBJECTIVES];

// Map colloquial objective names to canonical names
const OBJECTIVE_ALIASES = new Map<string, string>([
  ['storm hostile', 'storm hostile objective'],
  ['secure no man', 'secure no man\'s land'],
  ['no mans land', 'secure no man\'s land'],
  ['teleport homers', 'deploy teleport homers'],
  ['extend lines', 'extend battle lines'],
]);

// All 40K Factions
const FACTIONS = [
  'Adepta Sororitas',
  'Adeptus Custodes',
  'Adeptus Mechanicus',
  'Aeldari',
  'Agents of the Imperium',
  'Astra Militarum',
  'Black Templars',
  'Blood Angels',
  'Chaos Daemons',
  'Chaos Knights',
  'Chaos Space Marines',
  'Dark Angels',
  'Death Guard',
  'Deathwatch',
  'Drukhari',
  'Genestealer Cults',
  'Grey Knights',
  'Imperial Knights',
  'Leagues of Votann',
  'Necrons',
  'Orks',
  'Space Marines',
  'Space Wolves',
  'T\'au Empire',
  'Thousand Sons',
  'Tyranids',
  'World Eaters',
];

const FACTION_ALIASES = new Map<string, string>([
  ['eldar', 'aeldari'],
  ['craftworlds', 'aeldari'],
  ['craftworld', 'aeldari'],
  ['dark eldar', 'drukhari'],
  ['sisters of battle', 'adepta sororitas'],
  ['sisters', 'adepta sororitas'],
  ['admech', 'adeptus mechanicus'],
  ['ad mech', 'adeptus mechanicus'],
  ['custodes', 'adeptus custodes'],
  ['imperial guard', 'astra militarum'],
  ['guard', 'astra militarum'],
  ['tau', 't\'au empire'],
  ['tau empire', 't\'au empire'],
  ['gsc', 'genestealer cults'],
  ['genestealers', 'genestealer cults'],
  ['genestealer cult', 'genestealer cults'],
  ['csm', 'chaos space marines'],
  ['death guard', 'death guard'],
  ['dg', 'death guard'],
  ['tsons', 'thousand sons'],
  ['nids', 'tyranids'],
  ['votann', 'leagues of votann'],
]);

// Army Detachments by faction
const DETACHMENTS = [
  // Drukhari
  'Realspace Raiders',
  'Skysplinter Assault',
  'Spectacle of Spite',
  'Covenite Coterie',
  'Kabalite Cartel',
  'Reaper\'s Wager',
  // Genestealer Cults
  'Host of Ascension',
  'Xenocreed Congregation',
  'Biosanctic Broodsurge',
  'Outlander Claw',
  'Brood Brother Auxilia',
  'Final Day',
  // Space Marines
  'Gladius Task Force',
  'Anvil Siege Force',
  'Ironstorm Spearhead',
  'Firestorm Assault Force',
  'Vanguard Spearhead',
  'First Company Task Force',
  '1st Company Task Force',
  'Stormlance Task Force',
  // Aeldari
  'Battle Host',
  'Windrider Host',
  'Starhost',
  // Necrons
  'Awakened Dynasty',
  'Annihilation Legion',
  'Canoptek Court',
  'Hypercrypt Legion',
  'Obeisance Phalanx',
  // Tyranids
  'Invasion Fleet',
  'Crusher Stampede',
  'Synaptic Nexus',
  'Assimilation Swarm',
  'Vanguard Onslaught',
  'Unending Swarm',
  // Orks
  'Waaagh! Tribe',
  'War Horde',
  'Bully Boyz',
  'Kult of Speed',
  'Dread Mob',
  'Green Tide',
  // T\'au
  'Kauyon',
  'Mont\'ka',
  'Retaliation Cadre',
  // Chaos Space Marines
  'Slaves to Darkness',
  'Veterans of the Long War',
  'Pactbound Zealots',
  'Deceptors',
  'Dread Talons',
  'Soulforged Warpack',
  // Death Guard
  'Plague Company',
  'Creeping Death',
  // World Eaters
  'Berzerker Warband',
  // Thousand Sons
  'Cult of Magic',
  // Custodes
  'Shield Host',
  'Auric Champions',
  // Sisters
  'Hallowed Martyrs',
  'Bringers of Flame',
  'Penitent Host',
  // Imperial Knights
  'Noble Lance',
  // Chaos Knights
  'Traitoris Lance',
  // Guard
  'Combined Regiment',
  'Armoured Spearhead',
  // Ad Mech
  'Rad-Zone Corps',
  'Data-Psalm Conclave',
  'Explorator Maniple',
  'Cohort Cybernetica',
  'Skitarii Hunter Cohort',
];

const DETACHMENT_ALIASES = new Map<string, string>([
  ['cartel', 'kabalite cartel'],
  ['cabalite cartel', 'kabalite cartel'],
  ['gladius', 'gladius task force'],
  ['kauyon', 'kauyon'],
  ['montka', 'mont\'ka'],
]);

// Map colloquial/shortened unit names to canonical names
const UNIT_ALIASES = new Map<string, string>([
  ['intercessors', 'intercessor squad'],
  ['assault intercessors', 'assault intercessor squad'],
  ['terminators', 'terminator squad'],
  ['assault terminators', 'assault terminator squad'],
  ['scouts', 'scout squad'],
  ['hellblasters', 'hellblaster squad'],
  ['devastators', 'devastator squad'],
  ['tacticals', 'tactical squad'],
  ['assault marines', 'assault squad'],
  ['vanguard vets', 'vanguard veteran squad'],
  ['sternguard', 'sternguard veteran squad'],
  ['aggressors', 'aggressor squad'],
  ['eradicators', 'eradicator squad'],
  ['eliminators', 'eliminator squad'],
  ['incursors', 'incursor squad'],
  ['infiltrators', 'infiltrator squad'],
  ['reivers', 'reiver squad'],
  ['suppressors', 'suppressor squad'],
  ['inceptors', 'inceptor squad'],
  ['bladeguard', 'bladeguard veteran squad'],
  // Common abbreviations
  ['las preds', 'predator destructor'],
  ['las pred', 'predator destructor'],
  // Drukhari common misspellings
  ['cabalite warriors', 'kabalite warriors'],
  ['cabalite', 'kabalite warriors'],
  ['mandrekes', 'mandrakes'],
  ['cronos', 'cronos'],
  ['kronos', 'cronos'],
  ['lady malice', 'lady malys'],
  ['reaver jet bikes', 'reavers'],
  ['reaver jetbikes', 'reavers'],
  // GSC common misspellings
  ['genestealers', 'purestrain genestealers'],
  ['genesteelers', 'purestrain genestealers'],
  ['genest steelers', 'purestrain genestealers'],
  ['ridgerunners', 'achilles ridgerunners'],
  ['ridge runners', 'achilles ridgerunners'],
  ['rockgrinder', 'goliath rockgrinder'],
  ['rock grinder', 'goliath rockgrinder'],
  ['kelermorph', 'kelermorph'],
  ['kellerorph', 'kelermorph'],
  ['calamorph', 'kelermorph'],
  ['sabotur', 'reductus saboteur'],
  ['saboteur', 'reductus saboteur'],
  ['reducted sabotur', 'reductus saboteur'],
  ['hand flamer acolytes', 'acolyte hybrids with hand flamers'],
  ['rocksaw acolytes', 'hybrid metamorphs'],
  // Common unit shorthand
  ['flamers', 'flamers'],
  ['aberrants', 'aberrants'],
  ['aber', 'aberrants'],
]);

/**
 * Calculate similarity score between two strings (0-1).
 * Uses a combination of character overlap and word matching.
 */
function calculateSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bLower = b.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (aLower === bLower) return 1;
  if (aLower.length === 0 || bLower.length === 0) return 0;

  // Check if one contains the other
  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    const minLen = Math.min(aLower.length, bLower.length);
    const maxLen = Math.max(aLower.length, bLower.length);
    return minLen / maxLen;
  }

  // Character-based similarity (Sørensen–Dice coefficient on bigrams)
  const aBigrams = new Set<string>();
  const bBigrams = new Set<string>();

  for (let i = 0; i < aLower.length - 1; i++) {
    aBigrams.add(aLower.slice(i, i + 2));
  }
  for (let i = 0; i < bLower.length - 1; i++) {
    bBigrams.add(bLower.slice(i, i + 2));
  }

  let intersection = 0;
  for (const bigram of aBigrams) {
    if (bBigrams.has(bigram)) intersection++;
  }

  return (2 * intersection) / (aBigrams.size + bBigrams.size);
}

// Words that are too generic to use as unit aliases
const GENERIC_WORDS = new Set([
  'the', 'with', 'and', 'unit', 'squad', 'team', 'band', 'pack',
  'hand', 'heavy', 'light', 'support', 'assault', 'battle', 'war',
  'command', 'strike', 'storm', 'fire', 'death', 'blood', 'iron',
  'dark', 'chaos', 'imperial', 'space', 'scout', 'veteran', 'elite',
]);

/**
 * Build fuzzy aliases from official unit names.
 * Creates mappings for common variations and misspellings.
 */
export function buildFuzzyUnitAliases(officialNames: string[]): Map<string, string> {
  const aliases = new Map<string, string>(UNIT_ALIASES);

  for (const name of officialNames) {
    const lower = name.toLowerCase();

    // Add the name itself (for case normalization)
    aliases.set(lower, name);

    // Add singular/plural variations (only for longer names to avoid false positives)
    if (lower.endsWith('s') && lower.length > 6) {
      aliases.set(lower.slice(0, -1), name); // Remove 's'
    } else if (!lower.endsWith('s') && lower.length > 5) {
      aliases.set(lower + 's', name); // Add 's'
    }

    // Add without common suffixes like "squad", "unit", etc.
    // Only if the remaining part is distinctive enough
    const withoutSuffix = lower
      .replace(/\s*(squad|unit|team|band|pack|\[legends\])$/i, '')
      .trim();
    if (withoutSuffix !== lower && withoutSuffix.length > 5 && !GENERIC_WORDS.has(withoutSuffix)) {
      aliases.set(withoutSuffix, name);
    }

    // Don't add first word as alias - too many false positives
    // The explicit UNIT_ALIASES map handles specific cases
  }

  return aliases;
}

/**
 * Find the best matching official name for a colloquial term.
 * Returns null if no good match found.
 */
export function findBestMatch(
  term: string,
  officialNames: string[],
  aliases: Map<string, string>,
  minSimilarity: number = 0.7
): string | null {
  const lower = term.toLowerCase().trim();

  // Check direct alias match first
  if (aliases.has(lower)) {
    return aliases.get(lower)!;
  }

  // Check for exact match in official names (case-insensitive)
  const exactMatch = officialNames.find(
    (n) => n.toLowerCase() === lower
  );
  if (exactMatch) return exactMatch;

  // Check for contains match
  const containsMatch = officialNames.find(
    (n) => n.toLowerCase().includes(lower) || lower.includes(n.toLowerCase())
  );
  if (containsMatch && calculateSimilarity(term, containsMatch) >= minSimilarity) {
    return containsMatch;
  }

  // Fuzzy match using similarity score
  let bestMatch: string | null = null;
  let bestScore = minSimilarity;

  for (const name of officialNames) {
    const score = calculateSimilarity(term, name);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = name;
    }
  }

  return bestMatch;
}

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
 * Generic function to find the best matching timestamp for a name in mentions.
 * Used for both stratagems and units.
 */
function findTimestamp(
  name: string,
  mentions: Map<string, number[]>,
  minWordOverlap: number = 1
): number | undefined {
  const normalized = normalizeTerm(name);

  // Exact match
  if (mentions.has(normalized)) {
    return mentions.get(normalized)![0]; // First mention
  }

  // Partial match - check if any mention contains or is contained by our name
  for (const [mentionedName, timestamps] of mentions) {
    if (mentionedName.includes(normalized) || normalized.includes(mentionedName)) {
      return timestamps[0];
    }

    // Word overlap check
    const nameWords = normalized.split(' ').filter((w) => w.length > 2);
    const mentionWords = mentionedName.split(' ').filter((w) => w.length > 2);
    const overlap = nameWords.filter((w) => mentionWords.includes(w));
    if (
      overlap.length >= minWordOverlap &&
      overlap.length >= Math.min(nameWords.length, mentionWords.length) / 2
    ) {
      return timestamps[0];
    }
  }

  return undefined;
}

/**
 * Find the best matching timestamp for a stratagem name.
 */
function findStratagemTimestamp(
  stratagemName: string,
  mentions: Map<string, number[]>
): number | undefined {
  return findTimestamp(stratagemName, mentions, 1);
}

/**
 * Find the best matching timestamp for a unit name.
 */
function findUnitTimestamp(
  unitName: string,
  mentions: Map<string, number[]>
): number | undefined {
  return findTimestamp(unitName, mentions, 1);
}

/**
 * Pre-process transcript using LLM-provided term mappings combined with pattern matching.
 * LLM mappings take priority, then pattern matching fills in gaps.
 */
export function preprocessTranscriptWithLlmMappings(
  transcript: TranscriptSegment[],
  unitNames: string[] = [],
  llmMappings: Record<string, string> = {}
): PreprocessedTranscript {
  const matches: TermMatch[] = [];
  const stratagemMentions = new Map<string, number[]>();
  const unitMentions = new Map<string, number[]>();
  const normalizedSegments: NormalizedSegment[] = [];
  const colloquialToOfficial = new Map<string, string>();

  // Merge LLM mappings into colloquialToOfficial
  for (const [colloquial, official] of Object.entries(llmMappings)) {
    colloquialToOfficial.set(colloquial.toLowerCase(), official);
  }

  // Build fuzzy aliases from official unit names
  const unitAliases = buildFuzzyUnitAliases(unitNames);

  // Merge LLM mappings into aliases (LLM takes priority)
  for (const [colloquial, official] of Object.entries(llmMappings)) {
    unitAliases.set(colloquial.toLowerCase(), official);
  }

  // Build patterns (include LLM mappings, aliases for stratagems and units)
  const stratagemPattern = buildTermPattern(ALL_STRATAGEMS, STRATAGEM_ALIASES);
  const allSearchTerms = [...unitNames, ...Object.keys(llmMappings)];
  const unitPattern = allSearchTerms.length > 0 ? buildTermPattern(allSearchTerms, unitAliases) : null;

  for (const seg of transcript) {
    const timestamp = Math.floor(seg.startTime);
    let text = seg.text;
    let normalizedText = text;
    let taggedText = text;

    // Track replacements for this segment to avoid double-processing
    const replacements: Array<{ original: string; official: string; type: 'unit' | 'stratagem' | 'objective' }> = [];

    // First, apply LLM mappings directly
    for (const [colloquial, official] of Object.entries(llmMappings)) {
      const escapedColloquial = colloquial.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedColloquial}\\b`, 'gi');

      for (const match of text.matchAll(regex)) {
        const term = match[0];
        if (!term) continue;

        // Determine if this is a stratagem or unit based on the official name
        const isStratagem = ALL_STRATAGEMS.some(s => s.toLowerCase() === official.toLowerCase());
        const type: 'unit' | 'stratagem' = isStratagem ? 'stratagem' : 'unit';

        const mentionMap = isStratagem ? stratagemMentions : unitMentions;
        const canonical = official.toLowerCase();

        if (!mentionMap.has(canonical)) {
          mentionMap.set(canonical, []);
        }
        const timestamps = mentionMap.get(canonical)!;
        if (!timestamps.includes(timestamp)) {
          timestamps.push(timestamp);
        }

        matches.push({
          term,
          normalizedTerm: official,
          type,
          timestamp,
          segmentText: text,
        });

        replacements.push({ original: term, official, type });
      }
    }

    // Find stratagem mentions (pattern-based)
    for (const match of text.matchAll(stratagemPattern)) {
      const term = match[1];
      if (!term) continue;

      const normalized = normalizeTerm(term);

      // Skip if already processed by LLM mappings
      if (replacements.some(r => r.original.toLowerCase() === term.toLowerCase())) {
        continue;
      }

      // Skip generic context terms unless they're near "stratagem" keywords
      if (STRATAGEM_CONTEXT_KEYWORDS.map(normalizeTerm).includes(normalized)) {
        if (!text.toLowerCase().includes('stratagem')) {
          continue;
        }
      }

      const canonical = toCanonicalName(term, STRATAGEM_ALIASES);

      if (term.toLowerCase() !== canonical.toLowerCase()) {
        colloquialToOfficial.set(term.toLowerCase(), canonical);
      }

      if (!stratagemMentions.has(canonical)) {
        stratagemMentions.set(canonical, []);
      }

      const timestamps = stratagemMentions.get(canonical)!;
      if (!timestamps.includes(timestamp)) {
        timestamps.push(timestamp);
      }

      matches.push({
        term,
        normalizedTerm: canonical,
        type: 'stratagem',
        timestamp,
        segmentText: text,
      });

      replacements.push({ original: term, official: canonical, type: 'stratagem' });
    }

    // Find unit mentions (pattern-based)
    if (unitPattern) {
      for (const match of text.matchAll(unitPattern)) {
        const term = match[1];
        if (!term) continue;

        // Skip if already processed by LLM mappings
        if (replacements.some(r => r.original.toLowerCase() === term.toLowerCase())) {
          continue;
        }

        let canonical = toCanonicalName(term, unitAliases);

        if (canonical === normalizeTerm(term)) {
          const fuzzyMatch = findBestMatch(term, unitNames, unitAliases, 0.75);
          if (fuzzyMatch) {
            canonical = fuzzyMatch.toLowerCase();
          }
        }

        if (term.toLowerCase() !== canonical) {
          colloquialToOfficial.set(term.toLowerCase(), canonical);
        }

        if (!unitMentions.has(canonical)) {
          unitMentions.set(canonical, []);
        }

        const timestamps = unitMentions.get(canonical)!;
        if (!timestamps.includes(timestamp)) {
          timestamps.push(timestamp);
        }

        matches.push({
          term,
          normalizedTerm: canonical,
          type: 'unit',
          timestamp,
          segmentText: text,
        });

        replacements.push({ original: term, official: canonical, type: 'unit' });
      }
    }

    // Apply replacements to create normalized and tagged text
    replacements.sort((a, b) => b.original.length - a.original.length);

    for (const { original, official, type } of replacements) {
      const regex = new RegExp(`\\b${escapeRegex(original)}\\b`, 'gi');

      normalizedText = normalizedText.replace(regex, (match) => {
        const firstChar = match[0];
        const isUpperCase = firstChar ? firstChar === firstChar.toUpperCase() : false;
        return isUpperCase
          ? official.charAt(0).toUpperCase() + official.slice(1)
          : official.toLowerCase();
      });

      const tag = type === 'unit' ? 'UNIT' : type === 'stratagem' ? 'STRATAGEM' : 'OBJECTIVE';
      taggedText = taggedText.replace(regex, `[${tag}:${official}]`);
    }

    normalizedSegments.push({
      ...seg,
      normalizedText,
      taggedText,
    });
  }

  // Note: preprocessTranscriptWithLlmMappings doesn't detect objectives/factions/detachments yet - use preprocessTranscript for that
  const objectiveMentions = new Map<string, number[]>();
  const factionMentions = new Map<string, number[]>();
  const detachmentMentions = new Map<string, number[]>();
  return { matches, stratagemMentions, unitMentions, objectiveMentions, factionMentions, detachmentMentions, normalizedSegments, colloquialToOfficial };
}

/**
 * Pre-process transcript to find mentions of stratagems, units, objectives, factions, and detachments.
 * Also normalizes and tags the transcript text with official names.
 * Deduplicates consecutive identical transcript lines (common in YouTube auto-captions).
 */
export function preprocessTranscript(
  transcript: TranscriptSegment[],
  unitNames: string[] = []
): PreprocessedTranscript {
  const matches: TermMatch[] = [];
  const stratagemMentions = new Map<string, number[]>();
  const unitMentions = new Map<string, number[]>();
  const objectiveMentions = new Map<string, number[]>();
  const factionMentions = new Map<string, number[]>();
  const detachmentMentions = new Map<string, number[]>();
  const normalizedSegments: NormalizedSegment[] = [];
  const colloquialToOfficial = new Map<string, string>();

  // Deduplicate consecutive identical lines (YouTube auto-captions repeat lines)
  const dedupedTranscript: TranscriptSegment[] = [];
  let lastText = '';
  for (const seg of transcript) {
    if (seg.text.trim() !== lastText) {
      dedupedTranscript.push(seg);
      lastText = seg.text.trim();
    }
  }

  // Build fuzzy aliases from official unit names
  const unitAliases = buildFuzzyUnitAliases(unitNames);

  // Build patterns (include aliases for stratagems, units, objectives, factions, detachments)
  const stratagemPattern = buildTermPattern(ALL_STRATAGEMS, STRATAGEM_ALIASES);
  const unitPattern = unitNames.length > 0 ? buildTermPattern(unitNames, unitAliases) : null;
  const objectivePattern = buildTermPattern(ALL_OBJECTIVES, OBJECTIVE_ALIASES);
  const factionPattern = buildTermPattern(FACTIONS, FACTION_ALIASES);
  const detachmentPattern = buildTermPattern(DETACHMENTS, DETACHMENT_ALIASES);

  for (const seg of dedupedTranscript) {
    const timestamp = Math.floor(seg.startTime);
    let text = seg.text;
    let normalizedText = text;
    let taggedText = text;

    // Track replacements for this segment to avoid double-processing
    const replacements: Array<{ original: string; official: string; type: 'unit' | 'stratagem' | 'objective' | 'faction' | 'detachment' }> = [];

    // Find stratagem mentions
    for (const match of text.matchAll(stratagemPattern)) {
      const term = match[1];
      if (!term) continue; // Skip if no capture group

      const normalized = normalizeTerm(term);

      // Skip generic context terms unless they're near "stratagem" keywords
      if (STRATAGEM_CONTEXT_KEYWORDS.map(normalizeTerm).includes(normalized)) {
        // Only count if "stratagem" is also in the segment
        if (!text.toLowerCase().includes('stratagem')) {
          continue;
        }
      }

      // Resolve alias to canonical name for storage
      const canonical = toCanonicalName(term, STRATAGEM_ALIASES);

      // Track colloquial -> official mapping
      if (term.toLowerCase() !== canonical.toLowerCase()) {
        colloquialToOfficial.set(term.toLowerCase(), canonical);
      }

      if (!stratagemMentions.has(canonical)) {
        stratagemMentions.set(canonical, []);
      }

      // Deduplicate timestamps
      const timestamps = stratagemMentions.get(canonical)!;
      if (!timestamps.includes(timestamp)) {
        timestamps.push(timestamp);
      }

      matches.push({
        term,
        normalizedTerm: canonical,
        type: 'stratagem',
        timestamp,
        segmentText: text,
      });

      replacements.push({ original: term, official: canonical, type: 'stratagem' });
    }

    // Find unit mentions
    if (unitPattern) {
      for (const match of text.matchAll(unitPattern)) {
        const term = match[1];
        if (!term) continue; // Skip if no capture group

        // Try to find the best official match
        let canonical = toCanonicalName(term, unitAliases);

        // If no alias match, try fuzzy matching against official names
        if (canonical === normalizeTerm(term)) {
          const fuzzyMatch = findBestMatch(term, unitNames, unitAliases, 0.75);
          if (fuzzyMatch) {
            canonical = fuzzyMatch.toLowerCase();
          }
        }

        // Track colloquial -> official mapping
        if (term.toLowerCase() !== canonical) {
          colloquialToOfficial.set(term.toLowerCase(), canonical);
        }

        if (!unitMentions.has(canonical)) {
          unitMentions.set(canonical, []);
        }

        // Deduplicate timestamps
        const timestamps = unitMentions.get(canonical)!;
        if (!timestamps.includes(timestamp)) {
          timestamps.push(timestamp);
        }

        matches.push({
          term,
          normalizedTerm: canonical,
          type: 'unit',
          timestamp,
          segmentText: text,
        });

        replacements.push({ original: term, official: canonical, type: 'unit' });
      }
    }

    // Find objective mentions
    for (const match of text.matchAll(objectivePattern)) {
      const term = match[1];
      if (!term) continue;

      // Resolve alias to canonical name
      const canonical = toCanonicalName(term, OBJECTIVE_ALIASES);

      // Track colloquial -> official mapping
      if (term.toLowerCase() !== canonical.toLowerCase()) {
        colloquialToOfficial.set(term.toLowerCase(), canonical);
      }

      if (!objectiveMentions.has(canonical)) {
        objectiveMentions.set(canonical, []);
      }

      // Deduplicate timestamps
      const timestamps = objectiveMentions.get(canonical)!;
      if (!timestamps.includes(timestamp)) {
        timestamps.push(timestamp);
      }

      matches.push({
        term,
        normalizedTerm: canonical,
        type: 'objective',
        timestamp,
        segmentText: text,
      });

      replacements.push({ original: term, official: canonical, type: 'objective' });
    }

    // Find faction mentions
    for (const match of text.matchAll(factionPattern)) {
      const term = match[1];
      if (!term) continue;

      const canonical = toCanonicalName(term, FACTION_ALIASES);

      if (term.toLowerCase() !== canonical.toLowerCase()) {
        colloquialToOfficial.set(term.toLowerCase(), canonical);
      }

      if (!factionMentions.has(canonical)) {
        factionMentions.set(canonical, []);
      }

      const timestamps = factionMentions.get(canonical)!;
      if (!timestamps.includes(timestamp)) {
        timestamps.push(timestamp);
      }

      matches.push({
        term,
        normalizedTerm: canonical,
        type: 'faction',
        timestamp,
        segmentText: text,
      });

      replacements.push({ original: term, official: canonical, type: 'faction' });
    }

    // Find detachment mentions
    for (const match of text.matchAll(detachmentPattern)) {
      const term = match[1];
      if (!term) continue;

      const canonical = toCanonicalName(term, DETACHMENT_ALIASES);

      if (term.toLowerCase() !== canonical.toLowerCase()) {
        colloquialToOfficial.set(term.toLowerCase(), canonical);
      }

      if (!detachmentMentions.has(canonical)) {
        detachmentMentions.set(canonical, []);
      }

      const timestamps = detachmentMentions.get(canonical)!;
      if (!timestamps.includes(timestamp)) {
        timestamps.push(timestamp);
      }

      matches.push({
        term,
        normalizedTerm: canonical,
        type: 'detachment',
        timestamp,
        segmentText: text,
      });

      replacements.push({ original: term, official: canonical, type: 'detachment' });
    }

    // Apply replacements to create normalized and tagged text
    // Sort by length (longest first) to avoid partial replacements
    replacements.sort((a, b) => b.original.length - a.original.length);

    for (const { original, official, type } of replacements) {
      // Create case-insensitive regex for replacement
      const regex = new RegExp(`\\b${escapeRegex(original)}\\b`, 'gi');

      // Normalize: replace colloquial with official (preserve first letter case)
      normalizedText = normalizedText.replace(regex, (match) => {
        const firstChar = match[0];
        const isUpperCase = firstChar ? firstChar === firstChar.toUpperCase() : false;
        return isUpperCase
          ? official.charAt(0).toUpperCase() + official.slice(1)
          : official.toLowerCase();
      });

      // Tag: wrap with type marker
      const tagMap: Record<string, string> = {
        unit: 'UNIT',
        stratagem: 'STRATAGEM',
        objective: 'OBJECTIVE',
        faction: 'FACTION',
        detachment: 'DETACHMENT',
      };
      const tag = tagMap[type];
      taggedText = taggedText.replace(regex, `[${tag}:${official}]`);
    }

    normalizedSegments.push({
      ...seg,
      normalizedText,
      taggedText,
    });
  }

  return { matches, stratagemMentions, unitMentions, objectiveMentions, factionMentions, detachmentMentions, normalizedSegments, colloquialToOfficial };
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
