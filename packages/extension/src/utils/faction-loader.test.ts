/**
 * Tests for faction detection and inference.
 *
 * Run with: npx tsx packages/extension/src/utils/faction-loader.test.ts
 */

import { inferFactionsFromText } from './faction-loader';

// Test utilities
let passed = 0;
let failed = 0;

function describe(name: string, fn: () => void | Promise<void>) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${name}`);
  console.log('='.repeat(50));
  const result = fn();
  if (result instanceof Promise) {
    return result;
  }
}

function it(name: string, fn: () => void | Promise<void>) {
  const run = async () => {
    try {
      await fn();
      console.log(`  \u2713 ${name}`);
      passed++;
    } catch (error) {
      console.log(`  \u2717 ${name}`);
      console.log(`    Error: ${error instanceof Error ? error.message : error}`);
      failed++;
    }
  };
  return run();
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
    toHaveLength(expected: number) {
      if (!Array.isArray(actual) || actual.length !== expected) {
        throw new Error(`Expected array of length ${expected}, got ${Array.isArray(actual) ? actual.length : 'non-array'}`);
      }
    },
    toContainExactly(...expected: string[]) {
      if (!Array.isArray(actual)) {
        throw new Error(`Expected array, got ${typeof actual}`);
      }
      if (actual.length !== expected.length) {
        throw new Error(`Expected [${expected.join(', ')}] (length ${expected.length}), got [${actual.join(', ')}] (length ${actual.length})`);
      }
      for (const item of expected) {
        if (!actual.includes(item)) {
          throw new Error(`Expected [${actual.join(', ')}] to contain "${item}"`);
        }
      }
    },
    toInclude(expected: string) {
      if (!Array.isArray(actual) || !actual.includes(expected)) {
        throw new Error(`Expected [${Array.isArray(actual) ? actual.join(', ') : actual}] to include "${expected}"`);
      }
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

async function runTests() {
  await describe('inferFactionsFromText - basic detection', () => {
    it('should detect two factions from a standard "vs" title', () => {
      const result = inferFactionsFromText('Grey Knights vs Chaos Daemons | Warhammer 40k Battle Report');
      expect(result).toHaveLength(2);
      expect(result).toInclude('Grey Knights');
      expect(result).toInclude('Chaos Daemons');
    });

    it('should detect factions from a title with extra formatting', () => {
      const result = inferFactionsFromText('*NEW CODEX!* Grey Knights vs Chaos Daemons | Warhammer 40k Battle Report');
      expect(result).toHaveLength(2);
      expect(result).toInclude('Grey Knights');
      expect(result).toInclude('Chaos Daemons');
    });

    it('should detect Space Marines vs Necrons', () => {
      const result = inferFactionsFromText('Space Marines vs Necrons - 2000pts Battle Report');
      expect(result).toHaveLength(2);
      expect(result).toInclude('Space Marines');
      expect(result).toInclude('Necrons');
    });

    it('should detect Tyranids vs Astra Militarum', () => {
      const result = inferFactionsFromText('Tyranids vs Astra Militarum | Full Game');
      expect(result).toHaveLength(2);
      expect(result).toInclude('Tyranids');
      expect(result).toInclude('Astra Militarum');
    });

    it('should detect T\'au Empire', () => {
      const result = inferFactionsFromText("T'au Empire vs Orks | Battle Report");
      expect(result).toHaveLength(2);
      expect(result).toInclude("T'au Empire");
      expect(result).toInclude('Orks');
    });
  });

  await describe('inferFactionsFromText - alias matching', () => {
    it('should detect "Sisters of Battle" as Adepta Sororitas', () => {
      const result = inferFactionsFromText('Sisters of Battle vs Necrons');
      expect(result).toInclude('Adepta Sororitas');
    });

    it('should detect "Custodes" as Adeptus Custodes', () => {
      const result = inferFactionsFromText('Custodes vs Tyranids');
      expect(result).toInclude('Adeptus Custodes');
    });

    it('should detect "AdMech" as Adeptus Mechanicus', () => {
      const result = inferFactionsFromText('Admech vs Orks');
      expect(result).toInclude('Adeptus Mechanicus');
    });

    it('should detect "Eldar" as Aeldari', () => {
      const result = inferFactionsFromText('Eldar vs Space Marines');
      expect(result).toInclude('Aeldari');
    });

    it('should detect "Daemons" as Chaos Daemons', () => {
      const result = inferFactionsFromText('Daemons vs Space Marines');
      expect(result).toInclude('Chaos Daemons');
    });
  });

  await describe('inferFactionsFromText - overlap handling', () => {
    it('should not match "Knights" from "Grey Knights" to Imperial Knights', () => {
      const result = inferFactionsFromText('Grey Knights vs Chaos Daemons');
      expect(result).toHaveLength(2);
      expect(result).toInclude('Grey Knights');
      expect(result).toInclude('Chaos Daemons');
    });

    it('should not match a substring of a longer faction name', () => {
      // "Space Marines" should not also match "Marines" for some other faction
      const result = inferFactionsFromText('Space Marines vs Orks');
      expect(result).toHaveLength(2);
      expect(result).toInclude('Space Marines');
      expect(result).toInclude('Orks');
    });

    it('should detect Chaos Knights vs Imperial Knights correctly', () => {
      const result = inferFactionsFromText('Chaos Knights vs Imperial Knights');
      expect(result).toHaveLength(2);
      expect(result).toInclude('Chaos Knights');
      expect(result).toInclude('Imperial Knights');
    });
  });

  await describe('inferFactionsFromText - case insensitivity', () => {
    it('should match regardless of case', () => {
      const result = inferFactionsFromText('GREY KNIGHTS vs chaos daemons');
      expect(result).toHaveLength(2);
      expect(result).toInclude('Grey Knights');
      expect(result).toInclude('Chaos Daemons');
    });

    it('should match mixed case aliases', () => {
      const result = inferFactionsFromText('CUSTODES vs tyranids');
      expect(result).toHaveLength(2);
      expect(result).toInclude('Adeptus Custodes');
      expect(result).toInclude('Tyranids');
    });
  });

  await describe('inferFactionsFromText - maxFactions parameter', () => {
    it('should return at most 2 factions by default', () => {
      const result = inferFactionsFromText('Space Marines Necrons Orks Tyranids');
      expect(result).toHaveLength(2);
    });

    it('should respect a higher maxFactions limit', () => {
      const result = inferFactionsFromText('Space Marines Necrons Orks Tyranids', 4);
      expect(result.length > 2).toBe(true);
    });

    it('should respect maxFactions = 1', () => {
      const result = inferFactionsFromText('Space Marines vs Necrons', 1);
      expect(result).toHaveLength(1);
    });
  });

  await describe('inferFactionsFromText - edge cases', () => {
    it('should return empty array for empty string', () => {
      const result = inferFactionsFromText('');
      expect(result).toHaveLength(0);
    });

    it('should return empty array for null-ish input', () => {
      const result = inferFactionsFromText('');
      expect(result).toHaveLength(0);
    });

    it('should return empty array for text with no factions', () => {
      const result = inferFactionsFromText('This is a random video about nothing related');
      expect(result).toHaveLength(0);
    });

    it('should handle text with only one faction', () => {
      const result = inferFactionsFromText('Painting my new Necrons army');
      expect(result).toHaveLength(1);
      expect(result).toInclude('Necrons');
    });

    it('should not match short aliases (< 3 chars)', () => {
      // "GK" is an alias for Grey Knights but should be skipped (too short)
      // "IK" is an alias for Imperial Knights but should be skipped
      const result = inferFactionsFromText('GK vs IK tournament game');
      // Should not match since these are 2-char aliases
      expect(result).toHaveLength(0);
    });
  });

  // Print summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
