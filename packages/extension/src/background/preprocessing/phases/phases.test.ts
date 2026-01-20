/**
 * Tests for preprocessing phases.
 *
 * Run with: npx tsx packages/extension/src/background/preprocessing/phases/phases.test.ts
 */

import { deduplicateSegments } from './deduplication';
import {
  escapeRegex,
  normalizeTerm,
  applyNormalization,
  applyTagging,
  buildTermPattern,
  toCanonicalName,
} from './text-normalization';
import { categorizeTermType, normalizeUnitName, buildFuzzyUnitAliasesSync } from './term-detection';
import { extractNgrams } from './phonetic-scanning';
import { applyLlmMappings, mergeLlmMappingsIntoAliases } from './llm-mapping';
import type { TranscriptSegment } from '@/types/youtube';
import type { TextReplacement } from '../types';

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
    toHaveLength(expected: number) {
      if (!Array.isArray(actual) || actual.length !== expected) {
        throw new Error(`Expected array of length ${expected}, got ${Array.isArray(actual) ? actual.length : 'non-array'}`);
      }
    },
    toContain(expected: string) {
      if (typeof actual !== 'string' || !actual.includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== 'number' || actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    not: {
      toBeNull() {
        if (actual === null) {
          throw new Error(`Expected non-null value, got null`);
        }
      },
      toContain(expected: string) {
        if (typeof actual === 'string' && actual.includes(expected)) {
          throw new Error(`Expected "${actual}" not to contain "${expected}"`);
        }
      },
    },
  };
}

// Test data
const SAMPLE_UNITS = ['Kabalite Warriors', 'Wyches', 'Archon', 'Incubi'];

// Run tests
describe('deduplicateSegments', () => {
  it('should remove consecutive duplicate lines', () => {
    const segments: TranscriptSegment[] = [
      { text: 'Hello world', startTime: 0, duration: 1 },
      { text: 'Hello world', startTime: 1, duration: 1 },
      { text: 'Different text', startTime: 2, duration: 1 },
    ];

    const result = deduplicateSegments(segments);

    expect(result).toHaveLength(2);
    expect(result[0]!.text).toBe('Hello world');
    expect(result[1]!.text).toBe('Different text');
  });

  it('should keep non-consecutive duplicates', () => {
    const segments: TranscriptSegment[] = [
      { text: 'Hello', startTime: 0, duration: 1 },
      { text: 'World', startTime: 1, duration: 1 },
      { text: 'Hello', startTime: 2, duration: 1 },
    ];

    const result = deduplicateSegments(segments);

    expect(result).toHaveLength(3);
  });

  it('should handle empty input', () => {
    const result = deduplicateSegments([]);

    expect(result).toHaveLength(0);
  });

  it('should trim whitespace when comparing', () => {
    const segments: TranscriptSegment[] = [
      { text: '  Hello  ', startTime: 0, duration: 1 },
      { text: 'Hello', startTime: 1, duration: 1 },
    ];

    const result = deduplicateSegments(segments);

    expect(result).toHaveLength(1);
  });
});

describe('escapeRegex', () => {
  it('should escape special regex characters', () => {
    expect(escapeRegex('test.*+?')).toBe('test\\.\\*\\+\\?');
  });

  it('should leave normal text unchanged', () => {
    expect(escapeRegex('hello world')).toBe('hello world');
  });
});

describe('normalizeTerm', () => {
  it('should lowercase and trim', () => {
    expect(normalizeTerm('  HELLO World  ')).toBe('hello world');
  });

  it('should collapse multiple spaces', () => {
    expect(normalizeTerm('hello    world')).toBe('hello world');
  });
});

describe('applyNormalization', () => {
  it('should replace colloquial terms with official names', () => {
    const replacements: TextReplacement[] = [
      { original: 'witches', official: 'Wyches', type: 'unit' },
    ];

    const result = applyNormalization('The witches attacked', replacements);

    // "witches" starts lowercase, so replacement is lowercase
    expect(result).toBe('The wyches attacked');
  });

  it('should preserve first letter case when uppercase', () => {
    const replacements: TextReplacement[] = [
      { original: 'Witches', official: 'Wyches', type: 'unit' },
    ];

    const result = applyNormalization('Witches are dangerous', replacements);

    expect(result).toContain('Wyches');
  });

  it('should handle multiple replacements', () => {
    const replacements: TextReplacement[] = [
      { original: 'witches', official: 'Wyches', type: 'unit' },
      { original: 'overwatch', official: 'Fire Overwatch', type: 'stratagem' },
    ];

    const result = applyNormalization('The witches used overwatch', replacements);

    // Both start lowercase in original text
    expect(result).toContain('wyches');
    expect(result).toContain('fire overwatch');
  });
});

describe('applyTagging', () => {
  it('should wrap terms with type markers', () => {
    const replacements: TextReplacement[] = [
      { original: 'Wyches', official: 'Wyches', type: 'unit' },
    ];

    const result = applyTagging('The Wyches attacked', replacements);

    expect(result).toBe('The [UNIT:Wyches] attacked');
  });

  it('should use correct tag for each type', () => {
    const replacements: TextReplacement[] = [
      { original: 'Overwatch', official: 'Fire Overwatch', type: 'stratagem' },
    ];

    const result = applyTagging('Using Overwatch', replacements);

    expect(result).toContain('[STRATAGEM:Fire Overwatch]');
  });
});

describe('buildTermPattern', () => {
  it('should create pattern matching all terms', () => {
    const pattern = buildTermPattern(['Fire Overwatch', 'Rapid Ingress']);
    const text = 'He used Fire Overwatch';

    expect(pattern.test(text)).toBe(true);
  });

  it('should include alias keys', () => {
    const aliases = new Map([['overwatch', 'Fire Overwatch']]);
    const pattern = buildTermPattern(['Fire Overwatch'], aliases);

    expect(pattern.test('used overwatch')).toBe(true);
  });

  it('should skip very short terms', () => {
    const pattern = buildTermPattern(['a', 'Go']);

    expect(pattern.test('a b c')).toBe(false);
  });
});

describe('toCanonicalName', () => {
  it('should resolve aliases', () => {
    const aliases = new Map([['witches', 'Wyches']]);
    const result = toCanonicalName('witches', aliases);

    expect(result).toBe('Wyches');
  });

  it('should return normalized term if no alias', () => {
    const aliases = new Map<string, string>();
    const result = toCanonicalName('Unknown Term', aliases);

    expect(result).toBe('unknown term');
  });
});

describe('categorizeTermType', () => {
  it('should categorize factions', () => {
    const result = categorizeTermType('Drukhari');

    expect(result.type).toBe('faction');
    expect(result.canonical).toBe('Drukhari');
  });

  it('should categorize faction aliases', () => {
    const result = categorizeTermType('dark eldar');

    expect(result.type).toBe('faction');
    expect(result.canonical).toBe('Drukhari');
  });

  it('should categorize stratagems', () => {
    const result = categorizeTermType('Fire Overwatch');

    expect(result.type).toBe('stratagem');
  });

  it('should block game mechanics', () => {
    const result = categorizeTermType('devastating wounds');

    expect(result.type).toBe('unknown');
  });

  it('should categorize units from provided list', () => {
    const result = categorizeTermType('Kabalite Warriors', SAMPLE_UNITS);

    expect(result.type).toBe('unit');
    expect(result.canonical).toBe('Kabalite Warriors');
  });
});

describe('normalizeUnitName', () => {
  it('should strip player names from character types', () => {
    const result = normalizeUnitName('Archon Skari', ['Archon', 'Succubus']);

    expect(result).toBe('Archon');
  });

  it('should handle "unit with weapon" pattern', () => {
    const result = normalizeUnitName('Scourge with Dark Lances', ['Scourges']);

    expect(result).toBe('Scourges');
  });

  it('should return null for unknown patterns', () => {
    const result = normalizeUnitName('Unknown Thing', ['Archon']);

    expect(result).toBeNull();
  });
});

describe('buildFuzzyUnitAliasesSync', () => {
  it('should include hardcoded aliases', () => {
    const aliases = buildFuzzyUnitAliasesSync([]);

    expect(aliases.has('witches')).toBe(true);
    expect(aliases.get('witches')).toBe('Wyches');
  });

  it('should add dynamic aliases from official names', () => {
    const aliases = buildFuzzyUnitAliasesSync(['Kabalite Warriors']);

    // Should add the name itself
    expect(aliases.has('kabalite warriors')).toBe(true);
    // Should add version without "squad" suffix
    expect(aliases.has('kabalite warrior')).toBe(true);
  });
});

describe('extractNgrams', () => {
  it('should extract 1, 2, and 3-grams', () => {
    const ngrams = extractNgrams('one two three');

    // 1-grams: one, two, three (3)
    // 2-grams: one two, two three (2)
    // 3-grams: one two three (1)
    expect(ngrams.length).toBe(6);
  });

  it('should track positions correctly', () => {
    const ngrams = extractNgrams('hello world');
    const helloNgram = ngrams.find(n => n.phrase === 'hello');

    expect(helloNgram).toBeTruthy();
    expect(helloNgram!.startIndex).toBe(0);
    expect(helloNgram!.endIndex).toBe(5);
  });
});

describe('applyLlmMappings', () => {
  it('should apply LLM mappings and categorize', () => {
    const result = applyLlmMappings(
      'The witches attacked',
      100,
      { witches: 'Wyches' },
      SAMPLE_UNITS
    );

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.replacements.length).toBeGreaterThan(0);
    expect(result.mentionUpdates.length).toBeGreaterThan(0);
  });

  it('should skip unknown terms', () => {
    const result = applyLlmMappings(
      'The unknown attacked',
      100,
      { unknown: 'devastating wounds' }, // Blocklisted term
      SAMPLE_UNITS
    );

    expect(result.matches).toHaveLength(0);
  });
});

describe('mergeLlmMappingsIntoAliases', () => {
  it('should merge LLM mappings into alias map', () => {
    const original = new Map([['a', 'A']]);
    const merged = mergeLlmMappingsIntoAliases(original, { b: 'B' });

    expect(merged.get('a')).toBe('A');
    expect(merged.get('b')).toBe('B');
  });

  it('should lowercase LLM mapping keys', () => {
    const original = new Map<string, string>();
    const merged = mergeLlmMappingsIntoAliases(original, { 'UPPER': 'Value' });

    expect(merged.get('upper')).toBe('Value');
  });
});

// Print summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Test Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
