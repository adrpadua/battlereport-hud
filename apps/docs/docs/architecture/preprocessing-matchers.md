---
sidebar_position: 4
---

# Preprocessing Matchers

The preprocessing system uses a chain of matchers to identify Warhammer 40K terms in YouTube transcripts. Each matcher specializes in a different type of correction.

## The Problem

YouTube's auto-generated captions frequently mishear Warhammer terminology:

| YouTube Caption | Actual Term | Error Type |
|-----------------|-------------|------------|
| "intercesses" | Intercessors | Phonetic |
| "terminators" | Terminator Squad | Partial match |
| "melter" | Melta | Phonetic |
| "to ran its" | Tyranids | Severe mishearing |
| "neckron" | Necron | Typo/phonetic |
| "custodies" | Custodes | Phonetic |

## Matcher Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                     Input: Transcript Term                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Priority 100: ALIAS MATCHER                                 │
│  Direct lookup: "termies" → "Terminator Squad"              │
│  Confidence: 1.0                                             │
└─────────────────────────────────────────────────────────────┘
                              │ (no match)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Priority 90: EXACT MATCHER                                  │
│  Case-insensitive: "Intercessor Squad" = "intercessor squad"│
│  Confidence: 1.0                                             │
└─────────────────────────────────────────────────────────────┘
                              │ (no match)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Priority 70: PHONETIC MATCHER (High Threshold)             │
│  Double Metaphone: "Melter" ≈ "Melta"                       │
│  Confidence: 0.7+                                            │
└─────────────────────────────────────────────────────────────┘
                              │ (no match)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Priority 60: FUZZY MATCHER                                  │
│  Sørensen-Dice: "Intercesor" ≈ "Intercessor" (0.85)         │
│  Confidence: varies                                          │
└─────────────────────────────────────────────────────────────┘
                              │ (no match)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Priority 40: PHONETIC MATCHER (Low Threshold)              │
│  Fallback for edge cases                                     │
│  Confidence: 0.4+                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Output: MatchResult or null                  │
└─────────────────────────────────────────────────────────────┘
```

## Matcher Interface

All matchers implement this interface:

```typescript
interface Matcher {
  name: string;
  priority: number;
  match(term: string, candidates: string[]): MatchResult | null;
}

interface MatchResult {
  term: string;           // Original input
  canonical: string;      // Official name
  confidence: number;     // 0.0 - 1.0
  matcherUsed: string;    // Which matcher found it
}
```

## 1. Alias Matcher

**File:** `packages/extension/src/background/preprocessing/matchers/alias-matcher.ts`

### Purpose

Maps colloquial terms directly to official names. Highest priority because these mappings are curated and definitive.

### How It Works

```typescript
class AliasMatcher implements Matcher {
  private aliases: Map<string, string>;

  match(term: string, _candidates: string[]): MatchResult | null {
    const lower = term.toLowerCase().trim();
    const canonical = this.aliases.get(lower);

    if (canonical) {
      return {
        term,
        canonical,
        confidence: 1.0,
        matcherUsed: 'alias'
      };
    }
    return null;
  }
}
```

### Example Aliases

```typescript
const aliases = new Map([
  // Colloquial names
  ["termies", "Terminator Squad"],
  ["intercessors", "Intercessor Squad"],
  ["devs", "Devastator Squad"],
  ["tac squad", "Tactical Squad"],

  // Common mishearings
  ["custodies", "Custodian Guard"],
  ["death company", "Death Company Marines"],

  // Abbreviations
  ["gk", "Grey Knights"],
  ["dk", "Death Guard"],
]);
```

### Alias Sources

1. **Generated aliases** - LLM-generated from unit names
2. **Manual aliases** - Hand-curated common terms
3. **LLM mappings** - Video-specific corrections from preprocessing

## 2. Exact Matcher

**File:** `packages/extension/src/background/preprocessing/matchers/exact-matcher.ts`

### Purpose

Case-insensitive exact matching against known unit names. Second priority because exact matches are reliable.

### How It Works

```typescript
class ExactMatcher implements Matcher {
  match(term: string, candidates: string[]): MatchResult | null {
    const lower = term.toLowerCase().trim();

    const exactMatch = candidates.find(
      c => c.toLowerCase() === lower
    );

    if (exactMatch) {
      return {
        term,
        canonical: exactMatch,
        confidence: 1.0,
        matcherUsed: 'exact'
      };
    }
    return null;
  }
}
```

### When It Matches

- "Intercessor Squad" → "Intercessor Squad" ✓
- "intercessor squad" → "Intercessor Squad" ✓
- "INTERCESSOR SQUAD" → "Intercessor Squad" ✓
- "Intercessors" → null ✗ (not exact)

## 3. Phonetic Matcher

**File:** `packages/extension/src/background/preprocessing/matchers/phonetic-matcher.ts`

### Purpose

Catches pronunciation-based errors using the Double Metaphone algorithm. Essential for YouTube's speech-to-text errors.

### How Double Metaphone Works

The algorithm encodes words by their pronunciation:

```typescript
import { doubleMetaphone } from 'double-metaphone';

doubleMetaphone('Melta');   // ['MLT', '']
doubleMetaphone('Melter');  // ['MLTR', '']
doubleMetaphone('Necron');  // ['NKRN', '']
doubleMetaphone('Neckron'); // ['NKRN', '']  // Same!
```

### Building the Phonetic Index

```typescript
interface PhoneticEntry {
  original: string;
  primary: string;   // Primary phonetic code
  secondary: string; // Alternative code
}

function buildPhoneticIndex(terms: string[]): PhoneticEntry[] {
  return terms.map(term => {
    const [primary, secondary] = doubleMetaphone(term);
    return { original: term, primary, secondary };
  });
}
```

### Matching Algorithm

```typescript
function findPhoneticMatches(
  term: string,
  index: PhoneticEntry[],
  maxResults: number,
  minConfidence: number
): PhoneticMatch[] {
  const [termPrimary, termSecondary] = doubleMetaphone(term);

  return index
    .map(entry => {
      // Check primary-to-primary match
      const primaryMatch = termPrimary === entry.primary;

      // Check secondary codes
      const secondaryMatch =
        termSecondary === entry.primary ||
        termPrimary === entry.secondary;

      // Calculate confidence
      let confidence = 0;
      if (primaryMatch) confidence = 0.9;
      else if (secondaryMatch) confidence = 0.7;

      return { ...entry, confidence };
    })
    .filter(m => m.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxResults);
}
```

### Examples

| Input | Phonetic Code | Matches | Confidence |
|-------|---------------|---------|------------|
| "Melter" | MLTR | Melta (MLT) | 0.85 |
| "Neckron" | NKRN | Necron (NKRN) | 0.9 |
| "Custodies" | KSTTS | Custodes (KSTTS) | 0.9 |
| "Tyrranids" | TRNTS | Tyranids (TRNTS) | 0.9 |

## 4. Fuzzy Matcher

**File:** `packages/extension/src/background/preprocessing/matchers/fuzzy-matcher.ts`

### Purpose

Handles typos and spelling variations using Sørensen-Dice coefficient on character bigrams.

### Bigram Generation

```typescript
function getBigrams(str: string): Set<string> {
  const bigrams = new Set<string>();
  const normalized = str.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (let i = 0; i < normalized.length - 1; i++) {
    bigrams.add(normalized.slice(i, i + 2));
  }
  return bigrams;
}

// "test" → {"te", "es", "st"}
// "Intercessor" → {"in", "nt", "te", "er", "rc", "ce", "es", "ss", "so", "or"}
```

### Sørensen-Dice Coefficient

```typescript
function calculateSimilarity(a: string, b: string): number {
  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);

  // Count intersection
  let intersection = 0;
  for (const bigram of bigramsA) {
    if (bigramsB.has(bigram)) intersection++;
  }

  // Dice coefficient: 2 * |intersection| / (|A| + |B|)
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}
```

### Matching Logic

```typescript
class FuzzyMatcher implements Matcher {
  private minSimilarity = 0.4;

  match(term: string, candidates: string[]): MatchResult | null {
    // First, try contains match (faster)
    const containsMatch = candidates.find(c =>
      c.toLowerCase().includes(term.toLowerCase()) ||
      term.toLowerCase().includes(c.toLowerCase())
    );

    if (containsMatch) {
      return {
        term,
        canonical: containsMatch,
        confidence: 0.8,
        matcherUsed: 'fuzzy-contains'
      };
    }

    // Then, calculate similarity for all candidates
    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const score = calculateSimilarity(term, candidate);
      if (score > bestScore && score >= this.minSimilarity) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    if (bestMatch) {
      return {
        term,
        canonical: bestMatch,
        confidence: bestScore,
        matcherUsed: 'fuzzy'
      };
    }
    return null;
  }
}
```

### Examples

| Input | Best Match | Similarity | Result |
|-------|------------|------------|--------|
| "Intercesor" | Intercessor | 0.85 | ✓ Match |
| "Necrom Warriors" | Necron Warriors | 0.82 | ✓ Match |
| "Blodguard" | Bladeguard | 0.71 | ✓ Match |
| "random word" | - | 0.12 | ✗ Below threshold |

## Combining Results

### Priority Resolution

When multiple matchers could match, the highest priority wins:

```typescript
function runMatcherChain(
  term: string,
  candidates: string[],
  matchers: Matcher[]
): MatchResult | null {
  // Sort by priority (highest first)
  const sorted = matchers.sort((a, b) => b.priority - a.priority);

  for (const matcher of sorted) {
    const result = matcher.match(term, candidates);
    if (result) {
      return result;  // First match wins
    }
  }
  return null;
}
```

### Confidence Aggregation

If the same term matches in both Fuse.js validation and phonetic matching:

```typescript
function combineConfidence(
  fuseConfidence: number,
  phoneticConfidence: number
): number {
  // If both agree, boost confidence
  if (fuseConfidence > 0.5 && phoneticConfidence > 0.5) {
    return Math.min(1.0, (fuseConfidence + phoneticConfidence) / 1.5);
  }
  // Otherwise, use the higher one
  return Math.max(fuseConfidence, phoneticConfidence);
}
```

## Adding Custom Aliases

### Via LLM Generation

```bash
# Generate aliases for a faction
npm run cli generate aliases space-marines
```

This uses an LLM to suggest colloquial terms for each unit.

### Manual Aliases

Edit `packages/extension/src/data/constants/aliases.ts`:

```typescript
export const MANUAL_ALIASES: Record<string, string> = {
  "termies": "Terminator Squad",
  "smash captain": "Captain with Jump Pack",
  // Add more...
};
```

## Performance Considerations

### Caching

- Phonetic index built once per faction, reused
- Alias maps loaded at startup
- Fuse.js indexes cached per session

### Optimization

1. **Exact matcher first** - O(n) lookup, very fast
2. **Alias lookup** - O(1) hash map lookup
3. **Phonetic** - O(n) but early termination
4. **Fuzzy** - O(n×m) most expensive, runs last

### Typical Processing Time

| Stage | Time (1000 segments) |
|-------|---------------------|
| Alias lookup | ~5ms |
| Exact matching | ~10ms |
| Phonetic matching | ~50ms |
| Fuzzy matching | ~200ms |
| **Total** | ~265ms |
