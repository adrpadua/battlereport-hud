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
import { preprocessTranscript, getDetectedStratagems } from '../packages/extension/src/background/transcript-preprocessor';
import { loadFactionById, factionIndex } from '../packages/extension/src/data/generated/index';

const CAPTIONS_DIR = path.join(process.cwd(), 'test-data', 'captions');

/**
 * Detect factions from video title/description using faction index.
 * Returns up to 2 faction IDs detected via name or alias matching.
 * Uses overlap detection to avoid matching substrings of already-matched factions
 * (e.g., "Knights" inside "Grey Knights").
 */
function detectFactionsFromText(text: string): string[] {
  if (!text) return [];

  // Build all candidate patterns sorted by length (longest first)
  const candidates: { pattern: RegExp; factionId: string; length: number }[] = [];

  for (const faction of factionIndex.factions) {
    const escapedName = faction.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    candidates.push({
      pattern: new RegExp(`\\b${escapedName}\\b`, 'i'),
      factionId: faction.id,
      length: faction.name.length,
    });

    for (const alias of faction.aliases) {
      if (alias.length < 3) continue;
      const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      candidates.push({
        pattern: new RegExp(`\\b${escapedAlias}\\b`, 'i'),
        factionId: faction.id,
        length: alias.length,
      });
    }
  }

  // Sort longest first so "Grey Knights" beats "Knights"
  candidates.sort((a, b) => b.length - a.length);

  const detected: string[] = [];
  const matchedRanges: { start: number; end: number }[] = [];

  for (const { pattern, factionId } of candidates) {
    if (detected.includes(factionId)) continue;

    const match = pattern.exec(text);
    if (!match) continue;

    const start = match.index;
    const end = start + match[0].length;

    // Skip if overlapping with an already-matched range
    const overlaps = matchedRanges.some(r => start < r.end && end > r.start);
    if (overlaps) continue;

    detected.push(factionId);
    matchedRanges.push({ start, end });

    if (detected.length >= 2) break;
  }

  return detected;
}

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
  let faction1Id = args[1];
  let faction2Id = args[2];

  // If factions not provided, extract transcript first to detect from title
  if (!faction1Id || !faction2Id) {
    console.log('No factions specified, detecting from video title...');
    const preTranscript = await extractTranscript(videoId);
    const detected = detectFactionsFromText(preTranscript.title);
    if (detected.length >= 1) faction1Id = faction1Id || detected[0];
    if (detected.length >= 2) faction2Id = faction2Id || detected[1];

    if (!faction1Id || !faction2Id) {
      console.log('  Could not auto-detect factions from title: ' + preTranscript.title);
      console.log('  Please provide faction IDs as arguments.');
      console.log('  Available factions:');
      factionIndex.factions.forEach(f => {
        console.log('    ' + f.id + ' (' + f.name + ')');
      });
      process.exit(1);
    }
    console.log('  Detected: ' + faction1Id + ' vs ' + faction2Id);
  }

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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
