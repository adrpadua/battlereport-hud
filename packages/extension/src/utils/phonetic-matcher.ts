import natural from 'natural';
import { PHONETIC_OVERRIDES } from '@/data/phonetic-overrides';

// Type definitions for natural's phonetic classes
const Metaphone = natural.Metaphone;
const SoundEx = natural.SoundEx;
const DoubleMetaphone = natural.DoubleMetaphone;

// Create singleton instances
const metaphone = new Metaphone();
const soundEx = new SoundEx();
const doubleMetaphone = new DoubleMetaphone();

export interface PhoneticMatch {
  term: string;
  confidence: number;
}

export interface PhoneticIndex {
  /** Map from phonetic code (Metaphone) to array of original terms */
  metaphone: Map<string, string[]>;
  /** Map from phonetic code (SoundEx) to array of original terms */
  soundex: Map<string, string[]>;
  /** Map from phonetic code (DoubleMetaphone primary) to array of original terms */
  doubleMetaphonePrimary: Map<string, string[]>;
  /** Map from phonetic code (DoubleMetaphone secondary) to array of original terms */
  doubleMetaphoneSecondary: Map<string, string[]>;
  /** All original terms for fallback searches */
  allTerms: string[];
}

// Cache phonetic indices per faction
const phoneticIndexCache = new Map<string, PhoneticIndex>();

/**
 * Generate phonetic codes for a single word.
 * Returns multiple codes for better coverage.
 */
function getPhoneticCodes(word: string): {
  metaphone: string;
  soundex: string;
  doubleMetaphone: [string, string];
} {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!cleaned) {
    return {
      metaphone: '',
      soundex: '',
      doubleMetaphone: ['', ''],
    };
  }

  const metaphoneCode = metaphone.process(cleaned) || '';
  const soundexCode = soundEx.process(cleaned) || '';
  const dmCodes = doubleMetaphone.process(cleaned) || ['', ''];

  return {
    metaphone: metaphoneCode,
    soundex: soundexCode,
    doubleMetaphone: [dmCodes[0] || '', dmCodes[1] || ''],
  };
}

/**
 * Generate phonetic codes for a multi-word term.
 * Combines codes from individual words.
 */
function getMultiWordPhoneticCodes(term: string): {
  metaphone: string;
  soundex: string;
  doubleMetaphone: [string, string];
} {
  const words = term.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) {
    return {
      metaphone: '',
      soundex: '',
      doubleMetaphone: ['', ''],
    };
  }

  const codes = words.map(getPhoneticCodes);
  return {
    metaphone: codes.map(c => c.metaphone).join(' '),
    soundex: codes.map(c => c.soundex).join(' '),
    doubleMetaphone: [
      codes.map(c => c.doubleMetaphone[0]).join(' '),
      codes.map(c => c.doubleMetaphone[1]).join(' '),
    ],
  };
}

/**
 * Build a phonetic index from a list of terms.
 * Pre-computes phonetic codes for efficient lookup.
 */
export function buildPhoneticIndex(terms: string[]): PhoneticIndex {
  const index: PhoneticIndex = {
    metaphone: new Map(),
    soundex: new Map(),
    doubleMetaphonePrimary: new Map(),
    doubleMetaphoneSecondary: new Map(),
    allTerms: [...terms],
  };

  for (const term of terms) {
    const codes = getMultiWordPhoneticCodes(term);

    // Add to metaphone index
    if (codes.metaphone) {
      const existing = index.metaphone.get(codes.metaphone) || [];
      existing.push(term);
      index.metaphone.set(codes.metaphone, existing);
    }

    // Add to soundex index
    if (codes.soundex) {
      const existing = index.soundex.get(codes.soundex) || [];
      existing.push(term);
      index.soundex.set(codes.soundex, existing);
    }

    // Add to double metaphone indices
    if (codes.doubleMetaphone[0]) {
      const existing = index.doubleMetaphonePrimary.get(codes.doubleMetaphone[0]) || [];
      existing.push(term);
      index.doubleMetaphonePrimary.set(codes.doubleMetaphone[0], existing);
    }

    if (codes.doubleMetaphone[1] && codes.doubleMetaphone[1] !== codes.doubleMetaphone[0]) {
      const existing = index.doubleMetaphoneSecondary.get(codes.doubleMetaphone[1]) || [];
      existing.push(term);
      index.doubleMetaphoneSecondary.set(codes.doubleMetaphone[1], existing);
    }
  }

  return index;
}

/**
 * Get or create a phonetic index for a faction.
 * Caches indices for performance.
 */
export function getPhoneticIndexForFaction(
  factionId: string,
  unitNames: string[]
): PhoneticIndex {
  const cacheKey = factionId;
  if (phoneticIndexCache.has(cacheKey)) {
    return phoneticIndexCache.get(cacheKey)!;
  }

  const index = buildPhoneticIndex(unitNames);
  phoneticIndexCache.set(cacheKey, index);
  return index;
}

/**
 * Clear the phonetic index cache.
 */
export function clearPhoneticCache(): void {
  phoneticIndexCache.clear();
}

/**
 * Check if a term has a manual phonetic override.
 * Returns the canonical term if found.
 */
function checkPhoneticOverride(input: string): string | null {
  const normalized = input.toLowerCase().trim();

  for (const [canonical, variations] of Object.entries(PHONETIC_OVERRIDES)) {
    for (const variation of variations) {
      if (variation.toLowerCase() === normalized) {
        return canonical;
      }
    }
  }

  return null;
}

/**
 * Calculate phonetic similarity between two terms.
 * Returns a score from 0 to 1.
 */
function calculatePhoneticSimilarity(input: string, candidate: string): number {
  const inputCodes = getMultiWordPhoneticCodes(input);
  const candidateCodes = getMultiWordPhoneticCodes(candidate);

  let score = 0;
  let checks = 0;

  // Double Metaphone primary match (strongest signal)
  if (inputCodes.doubleMetaphone[0] && candidateCodes.doubleMetaphone[0]) {
    checks++;
    if (inputCodes.doubleMetaphone[0] === candidateCodes.doubleMetaphone[0]) {
      score += 1.0;
    } else if (
      inputCodes.doubleMetaphone[0].startsWith(candidateCodes.doubleMetaphone[0]) ||
      candidateCodes.doubleMetaphone[0].startsWith(inputCodes.doubleMetaphone[0])
    ) {
      score += 0.7;
    }
  }

  // Double Metaphone secondary match
  if (inputCodes.doubleMetaphone[1] && candidateCodes.doubleMetaphone[1]) {
    checks++;
    if (inputCodes.doubleMetaphone[1] === candidateCodes.doubleMetaphone[1]) {
      score += 0.8;
    } else if (
      inputCodes.doubleMetaphone[1].startsWith(candidateCodes.doubleMetaphone[1]) ||
      candidateCodes.doubleMetaphone[1].startsWith(inputCodes.doubleMetaphone[1])
    ) {
      score += 0.5;
    }
  }

  // Cross-match: input primary with candidate secondary
  if (inputCodes.doubleMetaphone[0] && candidateCodes.doubleMetaphone[1]) {
    checks++;
    if (inputCodes.doubleMetaphone[0] === candidateCodes.doubleMetaphone[1]) {
      score += 0.6;
    }
  }

  // Cross-match: input secondary with candidate primary
  if (inputCodes.doubleMetaphone[1] && candidateCodes.doubleMetaphone[0]) {
    checks++;
    if (inputCodes.doubleMetaphone[1] === candidateCodes.doubleMetaphone[0]) {
      score += 0.6;
    }
  }

  // Metaphone match
  if (inputCodes.metaphone && candidateCodes.metaphone) {
    checks++;
    if (inputCodes.metaphone === candidateCodes.metaphone) {
      score += 0.7;
    }
  }

  // SoundEx match (less precise, lower weight)
  if (inputCodes.soundex && candidateCodes.soundex) {
    checks++;
    if (inputCodes.soundex === candidateCodes.soundex) {
      score += 0.4;
    }
  }

  // Normalize score
  return checks > 0 ? Math.min(1, score / checks) : 0;
}

/**
 * Find phonetically similar terms from an index.
 * Uses multiple phonetic algorithms for better coverage.
 */
export function findPhoneticMatches(
  input: string,
  phoneticIndex: PhoneticIndex,
  maxResults: number = 5,
  minConfidence: number = 0.4
): PhoneticMatch[] {
  // First, check manual phonetic overrides
  const override = checkPhoneticOverride(input);
  if (override) {
    // Verify the override term exists in our index
    if (phoneticIndex.allTerms.some(t => t.toLowerCase() === override.toLowerCase())) {
      return [{ term: override, confidence: 0.95 }];
    }
  }

  const inputCodes = getMultiWordPhoneticCodes(input);
  const candidates = new Map<string, number>(); // term -> score

  // Look up matches in each phonetic index
  const addCandidates = (terms: string[] | undefined, baseScore: number) => {
    if (!terms) return;
    for (const term of terms) {
      const existing = candidates.get(term) || 0;
      candidates.set(term, Math.max(existing, baseScore));
    }
  };

  // Double Metaphone primary (strongest)
  if (inputCodes.doubleMetaphone[0]) {
    addCandidates(phoneticIndex.doubleMetaphonePrimary.get(inputCodes.doubleMetaphone[0]), 0.9);
  }

  // Double Metaphone secondary
  if (inputCodes.doubleMetaphone[1]) {
    addCandidates(phoneticIndex.doubleMetaphoneSecondary.get(inputCodes.doubleMetaphone[1]), 0.7);
  }

  // Metaphone
  if (inputCodes.metaphone) {
    addCandidates(phoneticIndex.metaphone.get(inputCodes.metaphone), 0.6);
  }

  // SoundEx (broadest, lowest confidence)
  if (inputCodes.soundex) {
    addCandidates(phoneticIndex.soundex.get(inputCodes.soundex), 0.4);
  }

  // Calculate actual phonetic similarity for candidates
  const matches: PhoneticMatch[] = [];
  for (const [term, baseScore] of candidates) {
    const similarity = calculatePhoneticSimilarity(input, term);
    // Combine base score from index lookup with actual similarity
    const confidence = (baseScore + similarity) / 2;

    if (confidence >= minConfidence) {
      matches.push({ term, confidence });
    }
  }

  // Sort by confidence descending
  matches.sort((a, b) => b.confidence - a.confidence);

  return matches.slice(0, maxResults);
}

/**
 * Check if two terms are phonetically similar.
 * Useful for quick yes/no checks.
 */
export function arePhoneticallySimilar(
  term1: string,
  term2: string,
  threshold: number = 0.5
): boolean {
  const similarity = calculatePhoneticSimilarity(term1, term2);
  return similarity >= threshold;
}

/**
 * Compare a term against a list of candidates and return the best phonetic match.
 * Used when you don't have a pre-built index.
 */
export function findBestPhoneticMatch(
  input: string,
  candidates: string[],
  minConfidence: number = 0.5
): PhoneticMatch | null {
  // Check overrides first
  const override = checkPhoneticOverride(input);
  if (override && candidates.some(c => c.toLowerCase() === override.toLowerCase())) {
    return { term: override, confidence: 0.95 };
  }

  let bestMatch: PhoneticMatch | null = null;

  for (const candidate of candidates) {
    const similarity = calculatePhoneticSimilarity(input, candidate);
    if (similarity >= minConfidence && (!bestMatch || similarity > bestMatch.confidence)) {
      bestMatch = { term: candidate, confidence: similarity };
    }
  }

  return bestMatch;
}

/**
 * Get the phonetic code for a term (for debugging/inspection).
 */
export function getPhoneticCode(term: string): {
  metaphone: string;
  soundex: string;
  doubleMetaphone: [string, string];
} {
  return getMultiWordPhoneticCodes(term);
}
