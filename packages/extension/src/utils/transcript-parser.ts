import type { TranscriptSegment, Chapter } from '@/types/youtube';

export interface ParsedTranscript {
  fullText: string;
  segments: TranscriptSegment[];
  armyListSection: string | null;
  deploymentSection: string | null;
}

export function parseTranscript(segments: TranscriptSegment[]): ParsedTranscript {
  const fullText = segments.map((s) => s.text).join(' ');

  return {
    fullText,
    segments,
    armyListSection: extractArmyListSection(segments),
    deploymentSection: extractDeploymentSection(segments),
  };
}

function extractArmyListSection(segments: TranscriptSegment[]): string | null {
  // Keywords that often indicate army list discussion
  const armyListKeywords = [
    'army list',
    'list for',
    'running with',
    'bringing',
    'i\'m playing',
    'playing with',
    'my list',
    'the list',
    'points',
    'detachment',
    'battalion',
    'patrol',
    'strike force',
  ];

  // Find segments that likely discuss army lists
  const relevantSegments: TranscriptSegment[] = [];
  let inArmySection = false;
  let sectionEndTime = 0;

  for (const segment of segments) {
    const lowerText = segment.text.toLowerCase();

    // Check if this segment starts an army list section
    const startsArmySection = armyListKeywords.some((kw) =>
      lowerText.includes(kw)
    );

    if (startsArmySection && !inArmySection) {
      inArmySection = true;
      sectionEndTime = segment.startTime + 120; // Capture next 2 minutes
    }

    if (inArmySection) {
      relevantSegments.push(segment);

      // End section after time limit or if we hit deployment keywords
      if (
        segment.startTime > sectionEndTime ||
        lowerText.includes('deploy') ||
        lowerText.includes('first turn')
      ) {
        inArmySection = false;
      }
    }
  }

  if (relevantSegments.length === 0) {
    return null;
  }

  return relevantSegments.map((s) => s.text).join(' ');
}

function extractDeploymentSection(
  segments: TranscriptSegment[]
): string | null {
  const deploymentKeywords = [
    'deployment',
    'deploying',
    'set up',
    'setting up',
    'goes first',
    'first turn',
  ];

  const relevantSegments: TranscriptSegment[] = [];
  let inDeploymentSection = false;
  let sectionEndTime = 0;

  for (const segment of segments) {
    const lowerText = segment.text.toLowerCase();

    const startsDeploymentSection = deploymentKeywords.some((kw) =>
      lowerText.includes(kw)
    );

    if (startsDeploymentSection && !inDeploymentSection) {
      inDeploymentSection = true;
      sectionEndTime = segment.startTime + 180; // Capture next 3 minutes
    }

    if (inDeploymentSection) {
      relevantSegments.push(segment);

      if (
        segment.startTime > sectionEndTime ||
        lowerText.includes('turn 1') ||
        lowerText.includes('command phase')
      ) {
        inDeploymentSection = false;
      }
    }
  }

  if (relevantSegments.length === 0) {
    return null;
  }

  return relevantSegments.map((s) => s.text).join(' ');
}

export function findChapterContent(
  segments: TranscriptSegment[],
  chapters: Chapter[],
  chapterTitle: string
): TranscriptSegment[] {
  // Find the chapter
  const chapterIndex = chapters.findIndex((c) =>
    c.title.toLowerCase().includes(chapterTitle.toLowerCase())
  );

  if (chapterIndex === -1) {
    return [];
  }

  const chapter = chapters[chapterIndex];
  const nextChapter = chapters[chapterIndex + 1];

  const startTime = chapter?.startTime ?? 0;
  const endTime = nextChapter?.startTime ?? Infinity;

  return segments.filter(
    (s) => s.startTime >= startTime && s.startTime < endTime
  );
}

export function extractMentionedUnits(text: string): string[] {
  // Common unit patterns in 40k
  const unitPatterns = [
    /(\d+)\s*x?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, // "3x Intercessors", "5 Tactical Marines"
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:squad|unit|team)/gi, // "Hellblaster squad"
    /(?:the|a|my)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, // "the Terminators"
  ];

  const units = new Set<string>();

  for (const pattern of unitPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const unit = match[2] || match[1];
      if (unit && unit.length > 3) {
        units.add(unit.trim());
      }
    }
  }

  return Array.from(units);
}
