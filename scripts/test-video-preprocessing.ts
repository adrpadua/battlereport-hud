/**
 * Test preprocessing with a real YouTube video.
 *
 * Usage:
 *   npx tsx scripts/test-video-preprocessing.ts <videoId> [faction1] [faction2]
 *
 * Examples:
 *   npx tsx scripts/test-video-preprocessing.ts I6QRlzqjHHw thousand-sons adepta-sororitas
 *   npx tsx scripts/test-video-preprocessing.ts dQw4w9WgXcQ space-marines necrons
 */

import * as fs from 'fs';
import * as path from 'path';
import { extractTranscript, formatTimestamp, type TranscriptResult } from './transcript-extractor';
import { preprocessTranscript, getDetectedStratagems } from '../src/background/transcript-preprocessor';
import { loadFactionById, factionIndex } from '../src/data/generated/index';

const CAPTIONS_DIR = path.join(process.cwd(), 'test-data', 'captions');

/**
 * Save transcript to a JSON file in the captions directory.
 */
function saveTranscript(transcript: TranscriptResult): void {
  // Ensure the directory exists
  if (!fs.existsSync(CAPTIONS_DIR)) {
    fs.mkdirSync(CAPTIONS_DIR, { recursive: true });
  }

  const filename = `${transcript.videoId}.json`;
  const filepath = path.join(CAPTIONS_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify(transcript, null, 2));
  console.log(`  Saved transcript to: ${filepath}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npx tsx scripts/test-video-preprocessing.ts <videoId> [faction1] [faction2]');
    console.log('');
    console.log('Available factions:');
    factionIndex.factions.forEach(f => {
      console.log('  ' + f.id + ' (' + f.name + ')');
    });
    process.exit(1);
  }

  const videoId = args[0];
  const faction1Id = args[1] || 'thousand-sons';
  const faction2Id = args[2] || 'adepta-sororitas';

  console.log('='.repeat(80));
  console.log('Testing preprocessing for video: ' + videoId);
  console.log('Factions: ' + faction1Id + ' vs ' + faction2Id);
  console.log('='.repeat(80));

  // Load unit names for the factions
  console.log('\nLoading faction data...');

  const faction1 = await loadFactionById(faction1Id);
  const faction2 = await loadFactionById(faction2Id);

  const unitNames: string[] = [];

  if (faction1) {
    const units = faction1.units.map(u => u.name);
    console.log('  ' + faction1.name + ': ' + units.length + ' units');
    unitNames.push(...units);
  } else {
    console.log('  Warning: Could not load faction ' + faction1Id);
  }

  if (faction2) {
    const units = faction2.units.map(u => u.name);
    console.log('  ' + faction2.name + ': ' + units.length + ' units');
    unitNames.push(...units);
  } else {
    console.log('  Warning: Could not load faction ' + faction2Id);
  }

  console.log('  Total unit names to search: ' + unitNames.length);

  // Extract transcript
  console.log('\nExtracting transcript...');
  const transcript = await extractTranscript(videoId);
  console.log('  Title: ' + transcript.title);
  console.log('  Segments: ' + transcript.segments.length);
  console.log('  Duration: ' + Math.floor(transcript.duration / 60) + ' minutes');

  // Save transcript to file
  saveTranscript(transcript);

  // Run preprocessor
  console.log('\nRunning preprocessor...');
  const startTime = Date.now();
  const result = preprocessTranscript(transcript.segments, unitNames);
  const elapsed = Date.now() - startTime;
  console.log('  Preprocessing took: ' + elapsed + 'ms');

  // Show detected stratagems
  const detectedStratagems = getDetectedStratagems(result);
  console.log('\n' + '='.repeat(50));
  console.log('DETECTED STRATAGEMS: ' + detectedStratagems.length);
  console.log('='.repeat(50));

  for (const [name, timestamps] of result.stratagemMentions) {
    const formattedTimestamps = timestamps.slice(0, 5).map(formatTimestamp).join(', ');
    const more = timestamps.length > 5 ? ' (+' + (timestamps.length - 5) + ' more)' : '';
    console.log('  "' + name + '" at ' + formattedTimestamps + more);
  }

  // Show detected units
  console.log('\n' + '='.repeat(50));
  console.log('DETECTED UNITS: ' + result.unitMentions.size);
  console.log('='.repeat(50));

  // Sort by first mention time
  const unitEntries = [...result.unitMentions.entries()]
    .sort((a, b) => a[1][0] - b[1][0]);

  for (const [name, timestamps] of unitEntries) {
    const formattedTimestamps = timestamps.slice(0, 3).map(formatTimestamp).join(', ');
    const more = timestamps.length > 3 ? ' (+' + (timestamps.length - 3) + ' more)' : '';
    console.log('  "' + name + '" at ' + formattedTimestamps + more);
  }

  // Show some context for unit matches
  console.log('\n' + '='.repeat(50));
  console.log('SAMPLE UNIT MATCHES WITH CONTEXT (first 15)');
  console.log('='.repeat(50));

  const unitMatches = result.matches
    .filter(m => m.type === 'unit')
    .slice(0, 15);

  for (const match of unitMatches) {
    console.log('[' + formatTimestamp(match.timestamp) + '] "' + match.term + '"');
    const context = match.segmentText.length > 70
      ? match.segmentText.slice(0, 70) + '...'
      : match.segmentText;
    console.log('   "' + context + '"');
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));
  console.log('  Total matches: ' + result.matches.length);
  console.log('  Stratagem matches: ' + result.matches.filter(m => m.type === 'stratagem').length);
  console.log('  Unit matches: ' + result.matches.filter(m => m.type === 'unit').length);
  console.log('  Unique stratagems: ' + result.stratagemMentions.size);
  console.log('  Unique units: ' + result.unitMentions.size);
}

main().catch(console.error);
