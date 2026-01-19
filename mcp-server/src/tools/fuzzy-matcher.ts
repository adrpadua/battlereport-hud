/**
 * Fuzzy matching utilities for LLM terminology validation.
 * Uses Sorensen-Dice coefficient for similarity scoring.
 */

// Built-in aliases for common colloquial terms
export const BUILTIN_ALIASES: Record<string, string> = {
  // Units - Space Marines
  'termies': 'Terminator Squad',
  'terminators': 'Terminator Squad',
  'intercessors': 'Intercessor Squad',
  'assault intercessors': 'Assault Intercessor Squad',
  'assault terminators': 'Assault Terminator Squad',
  'scouts': 'Scout Squad',
  'hellblasters': 'Hellblaster Squad',
  'devastators': 'Devastator Squad',
  'tacticals': 'Tactical Squad',
  'assault marines': 'Assault Squad',
  'vanguard vets': 'Vanguard Veteran Squad',
  'sternguard': 'Sternguard Veteran Squad',
  'aggressors': 'Aggressor Squad',
  'eradicators': 'Eradicator Squad',
  'eliminators': 'Eliminator Squad',
  'incursors': 'Incursor Squad',
  'infiltrators': 'Infiltrator Squad',
  'reivers': 'Reiver Squad',
  'suppressors': 'Suppressor Squad',
  'inceptors': 'Inceptor Squad',
  'bladeguard': 'Bladeguard Veteran Squad',
  'las preds': 'Predator Destructor',
  'las pred': 'Predator Destructor',

  // Units - Drukhari
  'cabalite warriors': 'Kabalite Warriors',
  'cabalite': 'Kabalite Warriors',
  'cabalites': 'Kabalite Warriors',
  'drazar': 'Drazhar',
  'mandrekes': 'Mandrakes',
  'kronos': 'Cronos',
  'lady malice': 'Lady Malys',
  'reaver jet bikes': 'Reavers',
  'reaver jetbikes': 'Reavers',
  'lilith hesperax': 'Lelith Hesperax',
  'lilith': 'Lelith Hesperax',
  'lelith': 'Lelith Hesperax',

  // Units - GSC
  'genestealers': 'Purestrain Genestealers',
  'genesteelers': 'Purestrain Genestealers',
  'genest steelers': 'Purestrain Genestealers',
  'ridgerunners': 'Achilles Ridgerunners',
  'ridge runners': 'Achilles Ridgerunners',
  'rockgrinder': 'Goliath Rockgrinder',
  'rock grinder': 'Goliath Rockgrinder',
  'kellerorph': 'Kelermorph',
  'calamorph': 'Kelermorph',
  'sabotur': 'Reductus Saboteur',
  'saboteur': 'Reductus Saboteur',
  'reducted sabotur': 'Reductus Saboteur',
  'aberrants': 'Aberrants',
  'aber': 'Aberrants',

  // Factions
  'eldar': 'Aeldari',
  'craftworlds': 'Aeldari',
  'craftworld': 'Aeldari',
  'dark eldar': 'Drukhari',
  'sisters of battle': 'Adepta Sororitas',
  'sisters': 'Adepta Sororitas',
  'admech': 'Adeptus Mechanicus',
  'ad mech': 'Adeptus Mechanicus',
  'custodes': 'Adeptus Custodes',
  'imperial guard': 'Astra Militarum',
  'guard': 'Astra Militarum',
  'tau': "T'au Empire",
  'tau empire': "T'au Empire",
  'gsc': 'Genestealer Cults',
  'genestealer cult': 'Genestealer Cults',
  'csm': 'Chaos Space Marines',
  'dg': 'Death Guard',
  'tsons': 'Thousand Sons',
  'nids': 'Tyranids',
  'crons': 'Necrons',
  'votann': 'Leagues of Votann',

  // Stratagems
  'overwatch': 'Fire Overwatch',
  're-roll': 'Command Re-roll',
  'reroll': 'Command Re-roll',
  'cp reroll': 'Command Re-roll',

  // Detachments
  'cartel': 'Kabalite Cartel',
  'cabalite cartel': 'Kabalite Cartel',
  'gladius': 'Gladius Task Force',
  'montka': "Mont'ka",

  // Common misspellings / phonetic variations
  'kalidus': 'Callidus Assassin',
  'kalidus assassin': 'Callidus Assassin',
  'calidus': 'Callidus Assassin',
  'calidus assassin': 'Callidus Assassin',
  'castellan crow': 'Castellan Crowe',
  'castellan crowe': 'Castellan Crowe',
  'crowe': 'Castellan Crowe',
  'interceptor squad': 'Interceptor Squad',  // Not a misspelling, but common confusion
  'inceptor squad': 'Inceptor Squad',  // Space Marines - different unit
  'reaver jetbike': 'Reavers',
  'reaver jet bike': 'Reavers',
  'scourge with dark lances': 'Scourges',
  'scourges with dark lances': 'Scourges',
  'scourge with splinter cannons': 'Scourges',
  'scourges with splinter cannons': 'Scourges',
  'wyches': 'Wyches',
  'wych': 'Wyches',
  'wytches': 'Wyches',
  'witches': 'Wyches',

  // Agents of the Imperium
  'vindicare': 'Vindicare Assassin',
  'culexus': 'Culexus Assassin',
  'eversor': 'Eversor Assassin',
  'callidus': 'Callidus Assassin',
};

// Categories supported by the validation tools
export type Category = 'units' | 'stratagems' | 'abilities' | 'factions' | 'detachments' | 'enhancements' | 'keywords' | 'weapons';

/**
 * Normalize a string for comparison.
 * Lowercases, removes special characters, and collapses whitespace.
 */
export function normalizeString(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Calculate similarity score between two strings (0-1).
 * Uses Sorensen-Dice coefficient on character bigrams.
 */
export function calculateSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bLower = b.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (aLower === bLower) return 1;
  if (aLower.length === 0 || bLower.length === 0) return 0;

  // Check if one contains the other - give containment bonus
  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    const minLen = Math.min(aLower.length, bLower.length);
    const maxLen = Math.max(aLower.length, bLower.length);
    return minLen / maxLen;
  }

  // Character-based similarity (Sorensen-Dice coefficient on bigrams)
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

/**
 * Match result with confidence score.
 */
export interface FuzzyMatch {
  name: string;
  category: Category;
  faction?: string;
  confidence: number;
}

/**
 * Find best matches for a term against a list of candidates.
 */
export function findBestMatches(
  term: string,
  candidates: Array<{ name: string; category: Category; faction?: string }>,
  options: {
    minConfidence?: number;
    limit?: number;
    checkAliases?: boolean;
  } = {}
): FuzzyMatch[] {
  const { minConfidence = 0.6, limit = 5, checkAliases = true } = options;

  const normalizedTerm = normalizeString(term);

  // First check built-in aliases
  if (checkAliases) {
    const aliasMatch = BUILTIN_ALIASES[normalizedTerm];
    if (aliasMatch) {
      // Find the aliased name in candidates
      const candidate = candidates.find(
        c => normalizeString(c.name) === normalizeString(aliasMatch)
      );
      if (candidate) {
        return [{
          name: candidate.name,
          category: candidate.category,
          faction: candidate.faction,
          confidence: 1.0, // Alias matches are considered exact
        }];
      }
    }
  }

  // Calculate similarity for all candidates
  const scored = candidates
    .map(candidate => ({
      ...candidate,
      confidence: calculateSimilarity(term, candidate.name),
    }))
    .filter(match => match.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);

  return scored;
}

/**
 * Check if a term matches a specific name using aliases and fuzzy matching.
 */
export function isMatch(
  term: string,
  name: string,
  minConfidence: number = 0.7
): boolean {
  const normalizedTerm = normalizeString(term);
  const normalizedName = normalizeString(name);

  // Exact match
  if (normalizedTerm === normalizedName) return true;

  // Alias match
  const aliasTarget = BUILTIN_ALIASES[normalizedTerm];
  if (aliasTarget && normalizeString(aliasTarget) === normalizedName) {
    return true;
  }

  // Fuzzy match
  return calculateSimilarity(term, name) >= minConfidence;
}

/**
 * Resolve a term to its canonical name using aliases.
 */
export function resolveAlias(term: string): string | null {
  const normalizedTerm = normalizeString(term);
  return BUILTIN_ALIASES[normalizedTerm] || null;
}
