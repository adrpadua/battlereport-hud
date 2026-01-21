/**
 * Test the chapter-aware and keyword-based army list detection,
 * as well as the new transcript normalization and tagging.
 *
 * Usage:
 *   npx tsx scripts/test-chapter-detection.ts <videoId> [faction1] [faction2]
 */

import { extractTranscript, formatTimestamp } from './transcript-extractor';
import { preprocessTranscript } from '../packages/extension/src/background/transcript-preprocessor';
import { loadFactionById } from '../packages/extension/src/data/generated/index';
import type { TranscriptSegment } from '../packages/extension/src/types/youtube';

const ARMY_LIST_CHAPTER_KEYWORDS = [
  'army', 'list', 'lists', 'forces', 'armies', 'roster'
];

// Be specific to avoid false positives during gameplay
const ARMY_LIST_KEYWORDS = [
  'army list', 'my list', 'the list', 'list for', 'the lists',
  'running with', "i'm playing", 'playing with', "i'm running",
  'points of', '2000 points', '2,000 points', '1000 points', '1,000 points',
  'strike force', 'incursion'
];

function findArmyListByKeywords(transcript: TranscriptSegment[]): TranscriptSegment[] {
  const result: TranscriptSegment[] = [];
  let inArmySection = false;
  let sectionEndTime = 0;

  for (const seg of transcript) {
    const lower = seg.text.toLowerCase();
    const startsSection = ARMY_LIST_KEYWORDS.some(kw => lower.includes(kw));

    if (startsSection && !inArmySection) {
      inArmySection = true;
      sectionEndTime = seg.startTime + 180; // 3 min window
      console.log(`\n>>> Army list section detected at ${formatTimestamp(seg.startTime)}`);
      console.log(`    Triggered by: "${seg.text.slice(0, 70)}..."`);
    }

    if (inArmySection) {
      result.push(seg);
      if (seg.startTime > sectionEndTime || lower.includes('deploy') || lower.includes('first turn')) {
        console.log(`    Section ends at ${formatTimestamp(seg.startTime)}`);
        inArmySection = false;
      }
    }
  }

  return result;
}

async function main() {
  const videoId = process.argv[2];
  const faction1Id = process.argv[3] || 'drukhari';
  const faction2Id = process.argv[4] || 'genestealer-cults';

  if (!videoId) {
    console.log('Usage: npx tsx scripts/test-chapter-detection.ts <videoId> [faction1] [faction2]');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log('Testing chapter-aware army list detection for:', videoId);
  console.log('Factions:', faction1Id, 'vs', faction2Id);
  console.log('='.repeat(70));

  const data = await extractTranscript(videoId);

  console.log('\nTitle:', data.title);
  console.log('Segments:', data.segments.length);
  console.log('Duration:', Math.floor(data.duration / 60), 'minutes');

  // Load faction data for preprocessing
  const faction1 = await loadFactionById(faction1Id);
  const faction2 = await loadFactionById(faction2Id);
  const unitNames: string[] = [];
  if (faction1) unitNames.push(...faction1.units.map(u => u.name));
  if (faction2) unitNames.push(...faction2.units.map(u => u.name));
  console.log('Loaded', unitNames.length, 'unit names for preprocessing');

  // Check chapters
  console.log('\n' + '='.repeat(50));
  console.log('CHAPTER DETECTION');
  console.log('='.repeat(50));

  if (data.chapters && data.chapters.length > 0) {
    console.log('\nChapters found:', data.chapters.length);
    for (const ch of data.chapters) {
      const mins = Math.floor(ch.startTime / 60);
      const secs = ch.startTime % 60;
      console.log(`  ${mins}:${secs.toString().padStart(2, '0')} - ${ch.title}`);
    }

    const armyChapters = data.chapters.filter(ch =>
      ARMY_LIST_CHAPTER_KEYWORDS.some(kw => ch.title.toLowerCase().includes(kw))
    );

    console.log('\nArmy list chapters detected:', armyChapters.length);
    for (const ch of armyChapters) {
      console.log(`  >> ${ch.title} (at ${formatTimestamp(ch.startTime)})`);
    }

    if (armyChapters.length > 0) {
      console.log('\n✅ Will use CHAPTER-AWARE strategy');
    } else {
      console.log('\n⚠️  Chapters exist but none match army list keywords - will use KEYWORD strategy');
    }
  } else {
    console.log('\nNo chapters found in this video');
    console.log('Will use KEYWORD-BASED fallback strategy');
  }

  // Test keyword detection
  console.log('\n' + '='.repeat(50));
  console.log('KEYWORD-BASED DETECTION');
  console.log('='.repeat(50));

  const armyListSegments = findArmyListByKeywords(data.segments);

  console.log('\nTotal segments in army list sections:', armyListSegments.length);

  // Show sample
  if (armyListSegments.length > 0) {
    console.log('\n--- Sample from detected army list sections (first 15 lines) ---');
    for (const seg of armyListSegments.slice(0, 15)) {
      console.log(`[${formatTimestamp(seg.startTime)}] ${seg.text}`);
    }
  }

  // Run preprocessing to show tagging
  console.log('\n' + '='.repeat(50));
  console.log('PREPROCESSING & TAGGING');
  console.log('='.repeat(50));

  const preprocessed = preprocessTranscript(data.segments, unitNames);

  console.log('\nColloquial → Official corrections made:', preprocessed.colloquialToOfficial.size);
  if (preprocessed.colloquialToOfficial.size > 0) {
    console.log('\n--- Corrections Applied ---');
    const corrections = [...preprocessed.colloquialToOfficial.entries()].slice(0, 15);
    for (const [colloquial, official] of corrections) {
      console.log(`  "${colloquial}" → "${official}"`);
    }
    if (preprocessed.colloquialToOfficial.size > 15) {
      console.log(`  ... and ${preprocessed.colloquialToOfficial.size - 15} more`);
    }
  }

  // Show sample of tagged transcript from army list section
  const taggedArmyList = preprocessed.normalizedSegments
    .filter(seg => seg.startTime >= 20 && seg.startTime < 200)
    .filter(seg => seg.taggedText !== seg.text); // Only show segments with tags

  if (taggedArmyList.length > 0) {
    console.log('\n--- Sample Tagged Transcript (showing segments with tags) ---');
    for (const seg of taggedArmyList.slice(0, 10)) {
      console.log(`[${formatTimestamp(seg.startTime)}] ${seg.taggedText}`);
    }
  }

  // Summary of what the new buildTranscriptSection would produce
  console.log('\n' + '='.repeat(50));
  console.log('TRANSCRIPT BUILDING SUMMARY');
  console.log('='.repeat(50));

  const introSegments = data.segments.filter(seg => seg.startTime < 300);
  const sampleTimes = [300, 600, 900, 1200, 1500, 1800, 2400, 3000, 3600];
  let sampledCount = 0;
  for (const time of sampleTimes) {
    if (time <= 300) continue;
    const window = data.segments.filter(
      seg => seg.startTime >= time && seg.startTime < time + 120
    );
    sampledCount += window.length;
  }

  console.log('\nNew strategy would include:');
  console.log(`  - Intro (first 5 min): ${introSegments.length} segments`);
  console.log(`  - Army list sections (keyword-detected): ${armyListSegments.length} segments`);
  console.log(`  - Gameplay samples (2-min windows): ~${sampledCount} segments`);
  console.log(`  - Total (after deduplication): estimated ${Math.round((introSegments.length + armyListSegments.length + sampledCount) * 0.8)} segments`);

  // Compare to old approach
  const oldIntro = data.segments.filter(seg => seg.startTime < 900);
  let oldSampledCount = 0;
  const oldSampleTimes = [900, 1200, 1500, 1800, 2100, 2400, 2700, 3000, 3300, 3600];
  for (const time of oldSampleTimes) {
    const window = data.segments.filter(
      seg => seg.startTime >= time && seg.startTime < time + 180
    );
    oldSampledCount += window.length;
  }

  console.log('\nOld strategy would include:');
  console.log(`  - Intro (first 15 min): ${oldIntro.length} segments`);
  console.log(`  - Gameplay samples (3-min windows): ~${oldSampledCount} segments`);
  console.log(`  - Total: ~${oldIntro.length + oldSampledCount} segments`);
}

main().catch(console.error);
