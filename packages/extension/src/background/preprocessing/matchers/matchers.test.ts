/**
 * Tests for matchers module.
 *
 * Run with: npx tsx packages/extension/src/background/preprocessing/matchers/matchers.test.ts
 */

import { AliasMatcher } from './alias-matcher';
import { ExactMatcher } from './exact-matcher';
import { FuzzyMatcher, calculateSimilarity } from './fuzzy-matcher';
import { buildMatcherChain, findBestMatchWithChain, findBestMatch } from './index';

// Test utilities
let passed = 0;
let failed = 0;

function describe(name: string, fn: () => void) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${name}`);
  console.log('='.repeat(50));
  fn();
}

function it(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error instanceof Error ? error.message : error}`);
    failed++;
  }
}

function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: T) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value, got ${JSON.stringify(actual)}`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== 'number' || actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected: number) {
      if (typeof actual !== 'number' || actual < expected) {
        throw new Error(`Expected ${actual} to be greater than or equal to ${expected}`);
      }
    },
    not: {
      toBeNull() {
        if (actual === null) {
          throw new Error(`Expected non-null value, got null`);
        }
      },
    },
  };
}

// Test data
const SAMPLE_UNITS = [
  'Kabalite Warriors',
  'Wyches',
  'Incubi',
  'Archon',
  'Succubus',
  'Mandrakes',
  'Scourges',
  'Reavers',
];

const UNIT_ALIASES = new Map<string, string>([
  ['kabalites', 'Kabalite Warriors'],
  ['cabalite warriors', 'Kabalite Warriors'],
  ['witches', 'Wyches'],
  ['mandrekes', 'Mandrakes'],
]);

// Run tests
describe('AliasMatcher', () => {
  const matcher = new AliasMatcher(UNIT_ALIASES);

  it('should match direct aliases with 100% confidence', () => {
    const result = matcher.match('kabalites', SAMPLE_UNITS);

    expect(result).not.toBeNull();
    expect(result!.canonical).toBe('Kabalite Warriors');
    expect(result!.confidence).toBe(1.0);
    expect(result!.matcherUsed).toBe('alias');
  });

  it('should handle case-insensitive matching', () => {
    const result = matcher.match('KABALITES', SAMPLE_UNITS);

    expect(result).not.toBeNull();
    expect(result!.canonical).toBe('Kabalite Warriors');
  });

  it('should return null for unaliased terms', () => {
    const result = matcher.match('unknown unit', SAMPLE_UNITS);

    expect(result).toBeNull();
  });

  it('should create new matcher with merged aliases', () => {
    const newAliases = new Map([['new alias', 'Archon']]);
    const newMatcher = matcher.withAliases(newAliases);

    const result = newMatcher.match('new alias', SAMPLE_UNITS);
    expect(result).not.toBeNull();
    expect(result!.canonical).toBe('Archon');
  });
});

describe('ExactMatcher', () => {
  const matcher = new ExactMatcher();

  it('should match exact terms case-insensitively', () => {
    const result = matcher.match('kabalite warriors', SAMPLE_UNITS);

    expect(result).not.toBeNull();
    expect(result!.canonical).toBe('Kabalite Warriors');
    expect(result!.confidence).toBe(1.0);
  });

  it('should return null for non-exact matches', () => {
    const result = matcher.match('kabalites', SAMPLE_UNITS);

    expect(result).toBeNull();
  });

  it('should preserve proper casing from candidates', () => {
    const result = matcher.match('WYCHES', SAMPLE_UNITS);

    expect(result).not.toBeNull();
    expect(result!.canonical).toBe('Wyches');
  });
});

describe('FuzzyMatcher', () => {
  const matcher = new FuzzyMatcher(0.6);

  it('should match similar strings above threshold', () => {
    const result = matcher.match('Kabalite Warrior', SAMPLE_UNITS);

    expect(result).not.toBeNull();
    expect(result!.canonical).toBe('Kabalite Warriors');
    expect(result!.confidence).toBeGreaterThan(0.6);
  });

  it('should find substring matches', () => {
    const result = matcher.match('Scourge', SAMPLE_UNITS);

    expect(result).not.toBeNull();
    expect(result!.canonical).toBe('Scourges');
  });

  it('should return null for dissimilar strings', () => {
    const strictMatcher = new FuzzyMatcher(0.9);
    const result = strictMatcher.match('xyz', SAMPLE_UNITS);

    expect(result).toBeNull();
  });
});

describe('calculateSimilarity', () => {
  it('should return 1 for identical strings', () => {
    expect(calculateSimilarity('test', 'test')).toBe(1);
  });

  it('should return 1 for case-different identical strings', () => {
    expect(calculateSimilarity('TEST', 'test')).toBe(1);
  });

  it('should return 0 for empty strings', () => {
    expect(calculateSimilarity('', 'test')).toBe(0);
    expect(calculateSimilarity('test', '')).toBe(0);
  });

  it('should calculate partial similarity for substring matches', () => {
    const score = calculateSimilarity('Scourge', 'Scourges');
    expect(score).toBeGreaterThan(0.8);
  });

  it('should handle completely different strings', () => {
    const score = calculateSimilarity('abc', 'xyz');
    expect(score).toBe(0);
  });
});

describe('buildMatcherChain', () => {
  it('should build a chain with all matchers', () => {
    const chain = buildMatcherChain({
      aliases: UNIT_ALIASES,
    });

    // Should have at least alias, exact, fuzzy
    expect(chain.length).toBeGreaterThanOrEqual(3);
  });

  it('should order matchers by priority', () => {
    const chain = buildMatcherChain({ aliases: UNIT_ALIASES });

    // Verify priorities are descending
    for (let i = 0; i < chain.length - 1; i++) {
      expect(chain[i]!.priority).toBeGreaterThanOrEqual(chain[i + 1]!.priority);
    }
  });
});

describe('findBestMatchWithChain', () => {
  const chain = buildMatcherChain({ aliases: UNIT_ALIASES });

  it('should find alias matches first', () => {
    const result = findBestMatchWithChain('witches', SAMPLE_UNITS, chain, 0.5);

    expect(result).not.toBeNull();
    expect(result!.canonical).toBe('Wyches');
    expect(result!.matcherUsed).toBe('alias');
  });

  it('should fall back to exact match', () => {
    const result = findBestMatchWithChain('Incubi', SAMPLE_UNITS, chain, 0.5);

    expect(result).not.toBeNull();
    expect(result!.canonical).toBe('Incubi');
    expect(result!.matcherUsed).toBe('exact');
  });

  it('should fall back to fuzzy match', () => {
    const result = findBestMatchWithChain('Reaver', SAMPLE_UNITS, chain, 0.5);

    expect(result).not.toBeNull();
    expect(result!.canonical).toBe('Reavers');
    expect(result!.matcherUsed).toBe('fuzzy');
  });
});

describe('findBestMatch (convenience function)', () => {
  it('should find matches using default chain', () => {
    const result = findBestMatch('witches', SAMPLE_UNITS, UNIT_ALIASES, 0.5);

    expect(result).toBe('Wyches');
  });

  it('should return null when no match found', () => {
    const result = findBestMatch('completely unknown', SAMPLE_UNITS, UNIT_ALIASES, 0.9);

    expect(result).toBeNull();
  });
});

// Print summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Test Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
