/**
 * Tests for the preprocessing pipeline.
 *
 * Run with: npx tsx packages/extension/src/background/preprocessing/pipeline.test.ts
 */

import { preprocessTranscript, preprocessTranscriptSync } from './pipeline';
import { ObjectivesCache, getObjectivesCache, resetObjectivesCache } from './cache/objectives-cache';
import type { TranscriptSegment } from '@/types/youtube';

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
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (error) {
      console.log(`  ✗ ${name}`);
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
    toBeGreaterThan(expected: number) {
      if (typeof actual !== 'number' || actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toContain(expected: string) {
      if (typeof actual !== 'string' || !actual.includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
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
const SAMPLE_UNITS = ['Kabalite Warriors', 'Wyches', 'Archon', 'Incubi', 'Mandrakes'];

const SAMPLE_TRANSCRIPT: TranscriptSegment[] = [
  { text: 'The Wyches move forward', startTime: 0, duration: 2 },
  { text: 'He activates Fire Overwatch', startTime: 2, duration: 2 },
  { text: 'The Archon charges in', startTime: 4, duration: 2 },
];

// Run tests
async function runTests() {
  await describe('preprocessTranscriptSync', async () => {
    await it('should process transcript and find matches', () => {
      const result = preprocessTranscriptSync(SAMPLE_TRANSCRIPT, SAMPLE_UNITS);

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.normalizedSegments).toHaveLength(3);
    });

    await it('should detect stratagem mentions', () => {
      const result = preprocessTranscriptSync(SAMPLE_TRANSCRIPT, SAMPLE_UNITS);

      expect(result.stratagemMentions.size).toBeGreaterThan(0);
      expect(result.stratagemMentions.has('Fire Overwatch')).toBe(true);
    });

    await it('should detect unit mentions', () => {
      const result = preprocessTranscriptSync(SAMPLE_TRANSCRIPT, SAMPLE_UNITS);

      expect(result.unitMentions.size).toBeGreaterThan(0);
    });

    await it('should deduplicate consecutive lines', () => {
      const duplicateTranscript: TranscriptSegment[] = [
        { text: 'Hello world', startTime: 0, duration: 1 },
        { text: 'Hello world', startTime: 1, duration: 1 },
        { text: 'Different', startTime: 2, duration: 1 },
      ];

      const result = preprocessTranscriptSync(duplicateTranscript, []);

      expect(result.normalizedSegments).toHaveLength(2);
    });

    await it('should handle empty transcript', () => {
      const result = preprocessTranscriptSync([], SAMPLE_UNITS);

      expect(result.matches).toHaveLength(0);
      expect(result.normalizedSegments).toHaveLength(0);
    });
  });

  await describe('preprocessTranscript (async)', async () => {
    await it('should work in basic mode', async () => {
      const result = await preprocessTranscript(SAMPLE_TRANSCRIPT, {
        mode: 'basic',
        unitNames: SAMPLE_UNITS,
      });

      expect(result.matches.length).toBeGreaterThan(0);
    });

    await it('should work in llm mode with mappings', async () => {
      const result = await preprocessTranscript(SAMPLE_TRANSCRIPT, {
        mode: 'llm',
        unitNames: SAMPLE_UNITS,
        llmMappings: { 'witches': 'Wyches' },
      });

      expect(result.colloquialToOfficial.has('witches')).toBe(true);
    });

    await it('should detect objectives when enabled', async () => {
      const transcriptWithObjective: TranscriptSegment[] = [
        { text: 'He scores Assassination', startTime: 0, duration: 2 },
      ];

      const result = await preprocessTranscript(transcriptWithObjective, {
        mode: 'basic',
        unitNames: [],
        detectObjectives: true,
      });

      expect(result.objectiveMentions.size).toBeGreaterThan(0);
    });

    await it('should detect factions when enabled', async () => {
      const transcriptWithFaction: TranscriptSegment[] = [
        { text: 'The Drukhari army advances', startTime: 0, duration: 2 },
      ];

      const result = await preprocessTranscript(transcriptWithFaction, {
        mode: 'basic',
        unitNames: [],
        detectFactions: true,
      });

      expect(result.factionMentions.size).toBeGreaterThan(0);
    });
  });

  await describe('ObjectivesCache', async () => {
    await it('should start with no cached data', () => {
      const cache = new ObjectivesCache();

      expect(cache.peek()).toBeNull();
      expect(cache.isValid()).toBe(false);
    });

    await it('should cache data after fetch', async () => {
      const cache = new ObjectivesCache();
      const mockData = {
        primaryMissions: ['Test Mission'],
        secondaryObjectives: ['Test Objective'],
        gambits: [],
        aliases: {},
      };

      await cache.get(async () => mockData);

      expect(cache.isValid()).toBe(true);
      expect(cache.peek()).not.toBeNull();
      expect(cache.peek()!.primaryMissions).toHaveLength(1);
    });

    await it('should return cached data on second call', async () => {
      const cache = new ObjectivesCache();
      let callCount = 0;
      const mockFetcher = async () => {
        callCount++;
        return {
          primaryMissions: [`Call ${callCount}`],
          secondaryObjectives: [],
          gambits: [],
          aliases: {},
        };
      };

      await cache.get(mockFetcher);
      await cache.get(mockFetcher);

      expect(callCount).toBe(1); // Should only fetch once
    });

    await it('should invalidate cache', async () => {
      const cache = new ObjectivesCache();
      await cache.get(async () => ({
        primaryMissions: ['Test'],
        secondaryObjectives: [],
        gambits: [],
        aliases: {},
      }));

      cache.invalidate();

      expect(cache.isValid()).toBe(false);
      expect(cache.peek()).toBeNull();
    });

    await it('should respect TTL', async () => {
      const shortTtl = 10; // 10ms
      const cache = new ObjectivesCache(shortTtl);

      await cache.get(async () => ({
        primaryMissions: ['Test'],
        secondaryObjectives: [],
        gambits: [],
        aliases: {},
      }));

      expect(cache.isValid()).toBe(true);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(cache.isValid()).toBe(false);
    });
  });

  await describe('getObjectivesCache singleton', async () => {
    await it('should return same instance', () => {
      resetObjectivesCache();
      const cache1 = getObjectivesCache();
      const cache2 = getObjectivesCache();

      expect(cache1 === cache2).toBe(true);
    });

    await it('should reset cache', () => {
      const cache1 = getObjectivesCache();
      resetObjectivesCache();
      const cache2 = getObjectivesCache();

      expect(cache1 === cache2).toBe(false);
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
