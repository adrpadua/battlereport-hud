/**
 * Tests for phonetic-matcher.ts
 *
 * Run with: npx tsx packages/extension/src/utils/phonetic-matcher.test.ts
 *
 * These tests verify the phonetic matching functionality for catching
 * YouTube auto-caption mishearings of Warhammer 40K terms.
 */

import {
  buildPhoneticIndex,
  findPhoneticMatches,
  arePhoneticallySimilar,
  findBestPhoneticMatch,
  getPhoneticCode,
  clearPhoneticCache,
} from './phonetic-matcher';

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
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value, got ${JSON.stringify(actual)}`);
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
    toContain(expected: string) {
      if (typeof actual !== 'string' || !actual.includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      }
    },
    toHaveLength(expected: number) {
      if (!Array.isArray(actual) || actual.length !== expected) {
        throw new Error(`Expected array of length ${expected}, got ${Array.isArray(actual) ? actual.length : 'non-array'}`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
      }
    },
    not: {
      toBe(expected: T) {
        if (actual === expected) {
          throw new Error(`Expected ${JSON.stringify(actual)} not to be ${JSON.stringify(expected)}`);
        }
      },
      toBeNull() {
        if (actual === null) {
          throw new Error(`Expected non-null value, got null`);
        }
      },
    },
  };
}

// Sample W40K unit names for testing
const SAMPLE_UNITS = [
  'Necrons',
  'Immortals',
  'Lychguard',
  'Cryptek',
  'Overlord',
  'Drukhari',
  'Kabalite Warriors',
  'Incubi',
  'Wyches',
  'Wracks',
  'Archon',
  'Succubus',
  'Lelith Hesperax',
  'Aeldari',
  'Farseer',
  'Autarch',
  'Wraithguard',
  'Wave Serpent',
  'Space Marines',
  'Intercessors',
  'Terminators',
];

// Run tests
describe('buildPhoneticIndex', () => {
  it('should create an index with phonetic codes for all terms', () => {
    const index = buildPhoneticIndex(SAMPLE_UNITS);

    expect(index.allTerms).toHaveLength(SAMPLE_UNITS.length);
    expect(index.metaphone.size).toBeGreaterThan(0);
    expect(index.soundex.size).toBeGreaterThan(0);
    expect(index.doubleMetaphonePrimary.size).toBeGreaterThan(0);
  });

  it('should group terms with the same phonetic code', () => {
    const index = buildPhoneticIndex(['Necrons', 'Drukhari', 'Space Marines']);

    // Each term should be indexed
    expect(index.allTerms).toHaveLength(3);
  });

  it('should handle empty input', () => {
    const index = buildPhoneticIndex([]);

    expect(index.allTerms).toHaveLength(0);
    expect(index.metaphone.size).toBe(0);
  });
});

describe('findPhoneticMatches', () => {
  const index = buildPhoneticIndex(SAMPLE_UNITS);

  it('should find "Necrons" from "neck runs" (common YouTube mishearing)', () => {
    const matches = findPhoneticMatches('neck runs', index, 5, 0.3);

    expect(matches.length).toBeGreaterThan(0);
    // Should have Necrons as a match (via phonetic override)
    const necronMatch = matches.find(m => m.term === 'Necrons');
    expect(necronMatch).toBeTruthy();
  });

  it('should find "Drukhari" from "drew car ee" (common YouTube mishearing)', () => {
    const matches = findPhoneticMatches('drew car ee', index, 5, 0.3);

    expect(matches.length).toBeGreaterThan(0);
    // Should have Drukhari as a match (via phonetic override)
    const drakhariMatch = matches.find(m => m.term === 'Drukhari');
    expect(drakhariMatch).toBeTruthy();
  });

  it('should match exact terms with high confidence', () => {
    const matches = findPhoneticMatches('Necrons', index, 5, 0.3);

    expect(matches.length).toBeGreaterThan(0);
    const firstMatch = matches[0];
    expect(firstMatch).toBeTruthy();
    expect(firstMatch!.term).toBe('Necrons');
    expect(firstMatch!.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('should respect maxResults limit', () => {
    // Use a more generic term that matches multiple units phonetically
    const matches = findPhoneticMatches('warriors', index, 2, 0.1);

    // Should be limited to maxResults or fewer
    expect(matches.length <= 2).toBe(true);
  });

  it('should filter by minConfidence', () => {
    const lowConfMatches = findPhoneticMatches('xyz', index, 5, 0.9);

    expect(lowConfMatches).toHaveLength(0);
  });
});

describe('arePhoneticallySimilar', () => {
  it('should return true for similar sounding words', () => {
    expect(arePhoneticallySimilar('Necrons', 'Nekkrons', 0.4)).toBe(true);
    expect(arePhoneticallySimilar('Space', 'Spayce', 0.4)).toBe(true);
  });

  it('should return false for dissimilar words', () => {
    expect(arePhoneticallySimilar('Necrons', 'Aeldari', 0.8)).toBe(false);
    expect(arePhoneticallySimilar('Space', 'Marines', 0.8)).toBe(false);
  });

  it('should handle empty strings', () => {
    expect(arePhoneticallySimilar('', '', 0.5)).toBe(false);
    expect(arePhoneticallySimilar('test', '', 0.5)).toBe(false);
  });
});

describe('findBestPhoneticMatch', () => {
  it('should find the best match from candidates', () => {
    const candidates = ['Necrons', 'Aeldari', 'Drukhari'];
    const result = findBestPhoneticMatch('Nekrons', candidates, 0.3);

    expect(result).not.toBeNull();
    expect(result!.term).toBe('Necrons');
  });

  it('should use phonetic overrides when available', () => {
    const candidates = ['Necrons', 'Aeldari', 'Drukhari'];
    const result = findBestPhoneticMatch('neck runs', candidates, 0.3);

    expect(result).not.toBeNull();
    expect(result!.term).toBe('Necrons');
    expect(result!.confidence).toBeGreaterThanOrEqual(0.9); // Override confidence
  });

  it('should return null when no match meets threshold', () => {
    const candidates = ['Necrons', 'Aeldari', 'Drukhari'];
    const result = findBestPhoneticMatch('completely unrelated', candidates, 0.9);

    expect(result).toBeNull();
  });
});

describe('getPhoneticCode', () => {
  it('should return phonetic codes for a term', () => {
    const codes = getPhoneticCode('Necrons');

    expect(codes.metaphone).toBeTruthy();
    expect(codes.soundex).toBeTruthy();
    expect(codes.doubleMetaphone[0]).toBeTruthy();
  });

  it('should handle multi-word terms', () => {
    const codes = getPhoneticCode('Space Marines');

    expect(codes.metaphone).toContain(' ');
    expect(codes.soundex).toContain(' ');
  });

  it('should handle empty input', () => {
    const codes = getPhoneticCode('');

    expect(codes.metaphone).toBe('');
    expect(codes.soundex).toBe('');
    expect(codes.doubleMetaphone[0]).toBe('');
  });
});

describe('Phonetic Override Tests', () => {
  const index = buildPhoneticIndex(SAMPLE_UNITS);

  it('should match "witches" to "Wyches"', () => {
    const matches = findPhoneticMatches('witches', index, 5, 0.3);
    const wychesMatch = matches.find(m => m.term === 'Wyches');
    expect(wychesMatch).toBeTruthy();
  });

  it('should match "in cube eye" to "Incubi"', () => {
    const matches = findPhoneticMatches('in cube eye', index, 5, 0.3);
    const incubiMatch = matches.find(m => m.term === 'Incubi');
    expect(incubiMatch).toBeTruthy();
  });

  it('should match "lilith hesperax" to "Lelith Hesperax"', () => {
    const matches = findPhoneticMatches('lilith hesperax', index, 5, 0.3);
    const lelithMatch = matches.find(m => m.term === 'Lelith Hesperax');
    expect(lelithMatch).toBeTruthy();
  });

  it('should match "elder eye" to "Aeldari"', () => {
    const matches = findPhoneticMatches('elder eye', index, 5, 0.3);
    const aeldariMatch = matches.find(m => m.term === 'Aeldari');
    expect(aeldariMatch).toBeTruthy();
  });

  it('should match "far seer" to "Farseer"', () => {
    const matches = findPhoneticMatches('far seer', index, 5, 0.3);
    const farseerMatch = matches.find(m => m.term === 'Farseer');
    expect(farseerMatch).toBeTruthy();
  });

  it('should match "rax" to "Wracks" (YouTube mishearing)', () => {
    const matches = findPhoneticMatches('rax', index, 5, 0.3);
    const wracksMatch = matches.find(m => m.term === 'Wracks');
    expect(wracksMatch).toBeTruthy();
  });
});

describe('Cache functionality', () => {
  it('should clear cache without errors', () => {
    // Build some indices to populate cache
    buildPhoneticIndex(['Test1', 'Test2']);

    // Clear should not throw - just call it and verify no exception
    clearPhoneticCache();
    // If we got here, the test passes
    expect(true).toBe(true);
  });
});

// Print summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Test Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
