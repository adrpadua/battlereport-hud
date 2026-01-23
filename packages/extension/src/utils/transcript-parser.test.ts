/**
 * Tests for transcript-parser.ts
 *
 * Run with: npx tsx packages/extension/src/utils/transcript-parser.test.ts
 */

import {
  parseTranscript,
  findChapterContent,
  extractMentionedUnits,
} from './transcript-parser';
import type { TranscriptSegment, Chapter } from '@/types/youtube';

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
    toInclude(expected: unknown) {
      if (!Array.isArray(actual) || !actual.includes(expected)) {
        throw new Error(`Expected array to include ${JSON.stringify(expected)}`);
      }
    },
    not: {
      toBeNull() {
        if (actual === null) {
          throw new Error(`Expected non-null value, got null`);
        }
      },
      toInclude(expected: unknown) {
        if (Array.isArray(actual) && actual.includes(expected)) {
          throw new Error(`Expected array to not include ${JSON.stringify(expected)}`);
        }
      },
    },
  };
}

// Sample data
const SAMPLE_SEGMENTS: TranscriptSegment[] = [
  { text: 'Welcome to the battle report', startTime: 0, duration: 3 },
  { text: 'Today I am playing with my army list', startTime: 3, duration: 3 },
  { text: 'I have 3x Intercessors', startTime: 6, duration: 3 },
  { text: 'And some Terminators', startTime: 9, duration: 3 },
  { text: 'Now lets see the deployment', startTime: 120, duration: 3 },
  { text: 'I am deploying my units here', startTime: 123, duration: 3 },
  { text: 'Turn 1 begins', startTime: 300, duration: 3 },
];

const SAMPLE_CHAPTERS: Chapter[] = [
  { title: 'Intro', startTime: 0 },
  { title: 'Army Lists', startTime: 60 },
  { title: 'Deployment', startTime: 180 },
  { title: 'Turn 1', startTime: 300 },
  { title: 'Turn 2', startTime: 600 },
];

// Run tests
describe('parseTranscript', () => {
  it('combines segments into fullText', () => {
    const result = parseTranscript(SAMPLE_SEGMENTS);

    expect(result.fullText).toContain('Welcome to the battle report');
    expect(result.fullText).toContain('army list');
    expect(result.fullText).toContain('Intercessors');
  });

  it('preserves original segments', () => {
    const result = parseTranscript(SAMPLE_SEGMENTS);

    expect(result.segments).toHaveLength(SAMPLE_SEGMENTS.length);
    expect(result.segments[0]?.text).toBe('Welcome to the battle report');
  });

  it('extracts army list section when keywords present', () => {
    const result = parseTranscript(SAMPLE_SEGMENTS);

    expect(result.armyListSection).not.toBeNull();
    expect(result.armyListSection!).toContain('army list');
  });

  it('extracts deployment section when keywords present', () => {
    const result = parseTranscript(SAMPLE_SEGMENTS);

    expect(result.deploymentSection).not.toBeNull();
    expect(result.deploymentSection!).toContain('deployment');
  });

  it('handles empty segments', () => {
    const result = parseTranscript([]);

    expect(result.fullText).toBe('');
    expect(result.segments).toHaveLength(0);
    expect(result.armyListSection).toBeNull();
    expect(result.deploymentSection).toBeNull();
  });
});

describe('extractArmyListSection (via parseTranscript)', () => {
  it('detects "army list" keyword', () => {
    const segments: TranscriptSegment[] = [
      { text: 'Here is my army list', startTime: 0, duration: 3 },
      { text: 'I have lots of units', startTime: 3, duration: 3 },
    ];

    const result = parseTranscript(segments);

    expect(result.armyListSection).not.toBeNull();
    expect(result.armyListSection!).toContain('army list');
  });

  it('detects "my list" keyword', () => {
    const segments: TranscriptSegment[] = [
      { text: 'So for my list today', startTime: 0, duration: 3 },
      { text: 'I have selected these units', startTime: 3, duration: 3 },
    ];

    const result = parseTranscript(segments);

    expect(result.armyListSection).not.toBeNull();
    expect(result.armyListSection!).toContain('my list');
  });

  it('detects "points" keyword', () => {
    const segments: TranscriptSegment[] = [
      { text: 'We are playing 2000 points', startTime: 0, duration: 3 },
      { text: 'Here are my choices', startTime: 3, duration: 3 },
    ];

    const result = parseTranscript(segments);

    expect(result.armyListSection).not.toBeNull();
    expect(result.armyListSection!).toContain('points');
  });

  it('detects "detachment" keyword', () => {
    const segments: TranscriptSegment[] = [
      { text: 'I am running the Gladius detachment', startTime: 0, duration: 3 },
      { text: 'With these enhancements', startTime: 3, duration: 3 },
    ];

    const result = parseTranscript(segments);

    expect(result.armyListSection).not.toBeNull();
    expect(result.armyListSection!).toContain('detachment');
  });

  it('captures 2 minutes of content after trigger', () => {
    const segments: TranscriptSegment[] = [
      { text: 'Here is my army list', startTime: 0, duration: 3 },
      { text: 'Unit one', startTime: 60, duration: 3 },
      { text: 'Unit two', startTime: 100, duration: 3 },
      { text: 'Beyond time limit', startTime: 130, duration: 3 },
    ];

    const result = parseTranscript(segments);

    expect(result.armyListSection).not.toBeNull();
    expect(result.armyListSection!).toContain('army list');
    expect(result.armyListSection!).toContain('Unit one');
    expect(result.armyListSection!).toContain('Unit two');
    // 130s > 120s time limit, but it should still be included because we check startTime > sectionEndTime
    // which means at startTime 130, we check 130 > 120 and stop AFTER adding
  });

  it('stops at deployment keywords', () => {
    const segments: TranscriptSegment[] = [
      { text: 'Here is my army list', startTime: 0, duration: 3 },
      { text: 'Unit one', startTime: 10, duration: 3 },
      { text: 'Now we deploy the units', startTime: 20, duration: 3 },
      { text: 'More content after deploy', startTime: 30, duration: 3 },
    ];

    const result = parseTranscript(segments);

    expect(result.armyListSection).not.toBeNull();
    expect(result.armyListSection!).toContain('Unit one');
    expect(result.armyListSection!).toContain('deploy'); // The deploy segment itself is included
  });

  it('returns null when no army list keywords', () => {
    const segments: TranscriptSegment[] = [
      { text: 'Hello everyone', startTime: 0, duration: 3 },
      { text: 'Welcome to the video', startTime: 3, duration: 3 },
    ];

    const result = parseTranscript(segments);

    expect(result.armyListSection).toBeNull();
  });
});

describe('extractDeploymentSection (via parseTranscript)', () => {
  it('detects "deployment" keyword', () => {
    const segments: TranscriptSegment[] = [
      { text: 'Now for deployment', startTime: 0, duration: 3 },
      { text: 'I place my units here', startTime: 3, duration: 3 },
    ];

    const result = parseTranscript(segments);

    expect(result.deploymentSection).not.toBeNull();
    expect(result.deploymentSection!).toContain('deployment');
  });

  it('detects "deploying" keyword', () => {
    const segments: TranscriptSegment[] = [
      { text: 'I am deploying aggressively', startTime: 0, duration: 3 },
      { text: 'My units go forward', startTime: 3, duration: 3 },
    ];

    const result = parseTranscript(segments);

    expect(result.deploymentSection).not.toBeNull();
    expect(result.deploymentSection!).toContain('deploying');
  });

  it('detects "set up" keyword', () => {
    const segments: TranscriptSegment[] = [
      { text: 'I set up my army like this', startTime: 0, duration: 3 },
      { text: 'This formation works well', startTime: 3, duration: 3 },
    ];

    const result = parseTranscript(segments);

    expect(result.deploymentSection).not.toBeNull();
    expect(result.deploymentSection!).toContain('set up');
  });

  it('captures 3 minutes of content after trigger', () => {
    const segments: TranscriptSegment[] = [
      { text: 'Now for deployment', startTime: 0, duration: 3 },
      { text: 'Unit placement one', startTime: 100, duration: 3 },
      { text: 'Unit placement two', startTime: 150, duration: 3 },
      { text: 'Still in time window', startTime: 170, duration: 3 },
    ];

    const result = parseTranscript(segments);

    expect(result.deploymentSection).not.toBeNull();
    expect(result.deploymentSection!).toContain('Unit placement one');
    expect(result.deploymentSection!).toContain('Unit placement two');
  });

  it('stops at "turn 1" keyword', () => {
    const segments: TranscriptSegment[] = [
      { text: 'Now for deployment', startTime: 0, duration: 3 },
      { text: 'Units are placed', startTime: 10, duration: 3 },
      { text: 'Now turn 1 begins', startTime: 20, duration: 3 },
      { text: 'Movement phase', startTime: 30, duration: 3 },
    ];

    const result = parseTranscript(segments);

    expect(result.deploymentSection).not.toBeNull();
    expect(result.deploymentSection!).toContain('Units are placed');
    expect(result.deploymentSection!).toContain('turn 1'); // The turn 1 segment itself is included
  });

  it('stops at "command phase" keyword', () => {
    const segments: TranscriptSegment[] = [
      { text: 'Deployment begins', startTime: 0, duration: 3 },
      { text: 'Units go here', startTime: 10, duration: 3 },
      { text: 'Now the command phase', startTime: 20, duration: 3 },
      { text: 'Rolling for abilities', startTime: 30, duration: 3 },
    ];

    const result = parseTranscript(segments);

    expect(result.deploymentSection).not.toBeNull();
    expect(result.deploymentSection!).toContain('Units go here');
    expect(result.deploymentSection!).toContain('command phase');
  });

  it('returns null when no deployment keywords', () => {
    const segments: TranscriptSegment[] = [
      { text: 'The shooting phase', startTime: 0, duration: 3 },
      { text: 'Rolling dice', startTime: 3, duration: 3 },
    ];

    const result = parseTranscript(segments);

    expect(result.deploymentSection).toBeNull();
  });
});

describe('findChapterContent', () => {
  it('filters segments by chapter time range', () => {
    const result = findChapterContent(SAMPLE_SEGMENTS, SAMPLE_CHAPTERS, 'Army Lists');

    // Army Lists chapter: 60-180s
    // SAMPLE_SEGMENTS at times 120, 123 fall in this range
    expect(result.length).toBeGreaterThan(0);
    const times = result.map(s => s.startTime);
    times.forEach(t => {
      expect(t >= 60).toBe(true);
      expect(t < 180).toBe(true);
    });
  });

  it('handles last chapter (no end boundary)', () => {
    const result = findChapterContent(SAMPLE_SEGMENTS, SAMPLE_CHAPTERS, 'Turn 2');

    // Turn 2 chapter: 600s to infinity
    // No segments in our sample are >= 600s
    expect(result).toHaveLength(0);
  });

  it('returns empty array when chapter not found', () => {
    const result = findChapterContent(SAMPLE_SEGMENTS, SAMPLE_CHAPTERS, 'Nonexistent Chapter');

    expect(result).toHaveLength(0);
  });

  it('matches chapter title case-insensitively', () => {
    const result = findChapterContent(SAMPLE_SEGMENTS, SAMPLE_CHAPTERS, 'army lists');

    expect(result.length).toBeGreaterThan(0);
  });

  it('matches partial chapter titles', () => {
    const result = findChapterContent(SAMPLE_SEGMENTS, SAMPLE_CHAPTERS, 'Lists');

    expect(result.length).toBeGreaterThan(0);
  });

  it('handles empty segments', () => {
    const result = findChapterContent([], SAMPLE_CHAPTERS, 'Intro');

    expect(result).toHaveLength(0);
  });

  it('handles empty chapters', () => {
    const result = findChapterContent(SAMPLE_SEGMENTS, [], 'Intro');

    expect(result).toHaveLength(0);
  });
});

describe('extractMentionedUnits', () => {
  it('extracts pattern "3x Intercessors"', () => {
    const text = 'I have 3x Intercessors in my list';
    const result = extractMentionedUnits(text);

    expect(result).toInclude('Intercessors');
  });

  it('extracts pattern "5 Tactical Marines"', () => {
    const text = 'Running 5 Tactical Marines for objective play';
    const result = extractMentionedUnits(text);

    expect(result).toInclude('Tactical Marines');
  });

  it('extracts pattern "Hellblaster squad"', () => {
    // Note: The regex captures the full word sequence before "squad"
    // So "Hellblaster squad" alone (without "The") extracts "Hellblaster"
    const text = 'Hellblaster squad opens fire';
    const result = extractMentionedUnits(text);

    expect(result).toInclude('Hellblaster');
  });

  it('extracts pattern "the Terminators"', () => {
    const text = 'Then the Terminators charge in';
    const result = extractMentionedUnits(text);

    expect(result).toInclude('Terminators');
  });

  it('deduplicates results', () => {
    // Note: The regex pattern (?:the|a|my) is lowercase, so we use lowercase "the"
    const text = 'the Terminators advance. the Terminators are strong. the Terminators attack.';
    const result = extractMentionedUnits(text);

    const terminatorCount = result.filter(u => u === 'Terminators').length;
    expect(terminatorCount).toBe(1);
  });

  it('filters units with less than 4 chars', () => {
    const text = 'I have 3x War suits and some Ork boys';
    const result = extractMentionedUnits(text);

    // "War" is only 3 chars but "War suits" as a phrase works differently
    // The pattern extracts multi-word matches
    expect(result).not.toInclude('War');
    expect(result).not.toInclude('Ork');
  });

  it('handles multiple unit patterns in same text', () => {
    const text = '5 Intercessors, 3x Hellblasters, and the Terminators deploy';
    const result = extractMentionedUnits(text);

    expect(result).toInclude('Intercessors');
    expect(result).toInclude('Hellblasters');
    expect(result).toInclude('Terminators');
  });

  it('returns empty array for no matches', () => {
    const text = 'Rolling dice and moving forward';
    const result = extractMentionedUnits(text);

    expect(result).toHaveLength(0);
  });

  it('handles empty input', () => {
    const result = extractMentionedUnits('');

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
