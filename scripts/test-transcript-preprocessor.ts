/**
 * Test script for transcript preprocessing.
 *
 * Usage:
 *   npx tsx scripts/test-transcript-preprocessor.ts              # Run with mock data
 *   npx tsx scripts/test-transcript-preprocessor.ts --mock       # Run with mock data
 *   npx tsx scripts/test-transcript-preprocessor.ts <videoId>    # Fetch from YouTube
 *   npx tsx scripts/test-transcript-preprocessor.ts --file <path> # Load from JSON file
 */

import * as fs from 'fs';
import {
  preprocessTranscript,
  getDetectedStratagems,
  enrichUnitTimestamps,
} from '../src/background/transcript-preprocessor';
import type { TranscriptSegment } from '../src/types/youtube';
import type { Unit } from '../src/types/battle-report';
import {
  extractTranscript,
  extractVideoId,
  formatTimestamp,
  isYtDlpInstalled,
} from './transcript-extractor';

// Mock unit names from BSData that might appear in the transcript
const MOCK_UNIT_NAMES = [
  'Yvraine',
  'Visarch',
  'Wraithguard',
  'Guardian Defenders',
  'Wave Serpent',
  'Marneus Calgar',
  'Intercessors',
  'Assault Intercessors',
  'Terminators',
  'Rangers',
  'Assault Marines',
  'Guardians',
  'Windriders',
  'Scouts',
  'Striking Scorpions',
];

// Mock transcript that simulates a Warhammer 40k battle report
const MOCK_TRANSCRIPT: TranscriptSegment[] = [
  { text: "Welcome to today's battle report, we've got an exciting game", startTime: 0, duration: 5 },
  { text: 'between Aeldari and Space Marines, 2000 points strike force', startTime: 5, duration: 5 },
  { text: "I'm playing the Aeldari with the Yvraine and the Visarch", startTime: 10, duration: 5 },
  { text: "I've got a unit of Wraithguard with D-scythes", startTime: 15, duration: 4 },
  { text: 'and two squads of Guardian Defenders', startTime: 19, duration: 3 },
  { text: 'plus a Wave Serpent to transport them', startTime: 22, duration: 4 },
  {
    text: 'My opponent Nick is playing Space Marines, Ultramarines specifically',
    startTime: 30,
    duration: 5,
  },
  { text: "He's running Marneus Calgar as his warlord", startTime: 35, duration: 4 },
  { text: 'with some Intercessors and Assault Intercessors', startTime: 39, duration: 4 },
  { text: "Let's deploy and get this game started", startTime: 50, duration: 4 },
  // Gameplay segments with stratagems
  { text: "Turn one, I'm going to move the Wraithguard forward", startTime: 120, duration: 5 },
  { text: 'and use Fire and Fade after they shoot', startTime: 125, duration: 4 },
  { text: "That's a great stratagem for keeping them safe", startTime: 129, duration: 3 },
  { text: 'His Intercessors are going to use Fire Overwatch', startTime: 180, duration: 5 },
  { text: 'using the Overwatch stratagem costs 1 CP', startTime: 185, duration: 4 },
  { text: "I'll use Lightning-Fast Reactions on my Wraithguard", startTime: 220, duration: 5 },
  { text: 'to make them harder to hit, minus one to hit', startTime: 225, duration: 4 },
  { text: 'Now my Guardians are going to shoot', startTime: 280, duration: 4 },
  { text: "I'm using Battle Focus to advance and still shoot", startTime: 284, duration: 4 },
  { text: "Turn two now, he's using Armour of Contempt", startTime: 350, duration: 5 },
  { text: 'on his Terminators to improve their save', startTime: 355, duration: 4 },
  { text: "I'll respond with Focus Fire on my shooting phase", startTime: 420, duration: 5 },
  { text: 'to get extra hits on the Terminators', startTime: 425, duration: 4 },
  { text: 'The Visarch is going to charge, using Heroic Intervention', startTime: 500, duration: 5 },
  { text: 'after they tried to charge my Rangers', startTime: 505, duration: 4 },
  { text: 'Counter-offensive is played by my opponent', startTime: 560, duration: 5 },
  { text: 'so his Assault Marines can fight first', startTime: 565, duration: 4 },
  { text: 'I use Insane Bravery to auto-pass morale', startTime: 620, duration: 5 },
  { text: 'on my badly damaged Guardian squad', startTime: 625, duration: 4 },
  { text: 'Turn three, using Command Re-roll on this charge', startTime: 720, duration: 5 },
  { text: 'Need that nine to get in', startTime: 725, duration: 3 },
  { text: 'Strike Swiftly lets my Windriders advance and charge', startTime: 800, duration: 5 },
  { text: "That's really powerful for the mobility", startTime: 805, duration: 4 },
  { text: 'He uses Go to Ground on his Scouts', startTime: 900, duration: 5 },
  { text: 'getting that extra save against my shooting', startTime: 905, duration: 4 },
  { text: 'Final turn, I need to secure this objective', startTime: 1000, duration: 5 },
  { text: 'Rapid Ingress brings in my Striking Scorpions', startTime: 1005, duration: 5 },
  { text: 'from strategic reserves at the end of his turn', startTime: 1010, duration: 4 },
  { text: 'Great game, the Aeldari win 85 to 72', startTime: 1100, duration: 5 },
];

function testWithTranscript(
  transcript: TranscriptSegment[],
  name: string,
  unitNames: string[] = MOCK_UNIT_NAMES
): void {
  console.log('\n' + '='.repeat(80));
  console.log(`Testing: ${name}`);
  console.log('='.repeat(80));

  console.log(`Transcript segments: ${transcript.length}`);
  console.log(`Total duration: ${formatTimestamp(transcript[transcript.length - 1]?.startTime ?? 0)}`);

  // Show sample of transcript
  console.log('\n--- Transcript Sample (first 5 segments) ---');
  transcript.slice(0, 5).forEach((seg) => {
    console.log(`[${formatTimestamp(seg.startTime)}] ${seg.text}`);
  });

  // Run preprocessor with unit names
  console.log('\n--- Running Preprocessor ---');
  console.log(`Searching for ${unitNames.length} unit names...`);
  const result = preprocessTranscript(transcript, unitNames);

  // Show detected stratagems
  const detectedStratagems = getDetectedStratagems(result);
  console.log(`\nDetected stratagems: ${detectedStratagems.length}`);

  if (detectedStratagems.length > 0) {
    console.log('\nStratagem mentions:');
    for (const [name, timestamps] of result.stratagemMentions) {
      const formattedTimestamps = timestamps.map(formatTimestamp).join(', ');
      console.log(`  - "${name}" at ${formattedTimestamps}`);
    }
  } else {
    console.log('No stratagems detected in transcript.');
  }

  // Show detected units
  console.log(`\nDetected units: ${result.unitMentions.size}`);

  if (result.unitMentions.size > 0) {
    console.log('\nUnit mentions:');
    for (const [name, timestamps] of result.unitMentions) {
      const formattedTimestamps = timestamps.map(formatTimestamp).join(', ');
      console.log(`  - "${name}" at ${formattedTimestamps}`);
    }

    // Test enrichUnitTimestamps function
    console.log('\n--- Testing enrichUnitTimestamps ---');
    const mockUnits: Unit[] = unitNames.map((name, i) => ({
      name,
      playerIndex: i % 2,
      confidence: 'medium' as const,
    }));
    const enrichedUnits = enrichUnitTimestamps(mockUnits, result);
    const unitsWithTimestamps = enrichedUnits.filter((u) => u.videoTimestamp !== undefined);
    console.log(`Units enriched with timestamps: ${unitsWithTimestamps.length}/${enrichedUnits.length}`);
    unitsWithTimestamps.forEach((u) => {
      console.log(`  - "${u.name}" -> ${formatTimestamp(u.videoTimestamp!)}`);
    });
  } else {
    console.log('No units detected in transcript.');
  }

  // Show all matches with context
  const stratagemMatches = result.matches.filter((m) => m.type === 'stratagem');
  if (stratagemMatches.length > 0) {
    console.log(`\n--- Stratagem Matches (${stratagemMatches.length} total) ---`);
    stratagemMatches.forEach((match) => {
      console.log(`[${formatTimestamp(match.timestamp)}] "${match.term}"`);
      console.log(`   Context: "${match.segmentText}"`);
    });
  }

  // Show unit matches with context
  const unitMatches = result.matches.filter((m) => m.type === 'unit');
  if (unitMatches.length > 0) {
    console.log(`\n--- Unit Matches (${unitMatches.length} total) ---`);
    unitMatches.slice(0, 15).forEach((match) => {
      console.log(`[${formatTimestamp(match.timestamp)}] "${match.term}"`);
      console.log(`   Context: "${match.segmentText}"`);
    });
    if (unitMatches.length > 15) {
      console.log(`\n... and ${unitMatches.length - 15} more unit matches`);
    }
  }

  // Search for stratagem-related keywords
  console.log('\n--- Stratagem Keyword Search ---');
  const stratagemKeywords = ['stratagem', 'CP', 'command point'];
  let keywordCount = 0;
  for (const seg of transcript) {
    const lowerText = seg.text.toLowerCase();
    for (const keyword of stratagemKeywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        console.log(`[${formatTimestamp(seg.startTime)}] Found "${keyword}": "${seg.text}"`);
        keywordCount++;
      }
    }
  }
  if (keywordCount === 0) {
    console.log('No stratagem keywords found.');
  }
}

async function testWithVideoId(videoId: string): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log(`Fetching transcript for video: ${videoId}`);
  console.log('='.repeat(80));

  if (!isYtDlpInstalled()) {
    console.error('Error: yt-dlp is not installed.');
    console.error('Install it with: brew install yt-dlp (macOS) or pip install yt-dlp');
    process.exit(1);
  }

  try {
    const result = await extractTranscript(videoId);
    testWithTranscript(result.segments, result.title);
  } catch (error) {
    console.error('Failed to fetch transcript:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--mock') {
    // Test with mock data
    console.log('Running with MOCK transcript data...');
    testWithTranscript(MOCK_TRANSCRIPT, 'Mock Battle Report');
    return;
  }

  if (args[0] === '--file' && args[1]) {
    // Load from JSON file
    const filePath = args[1];
    console.log(`Loading transcript from file: ${filePath}`);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      const transcript: TranscriptSegment[] = Array.isArray(data) ? data : data.transcript;
      testWithTranscript(transcript, `File: ${filePath}`);
    } catch (error) {
      console.error(`Failed to load file: ${error}`);
    }
    return;
  }

  // Test with video ID or URL
  const videoId = extractVideoId(args[0]);
  if (!videoId) {
    console.error(`Invalid video ID or URL: ${args[0]}`);
    process.exit(1);
  }

  await testWithVideoId(videoId);
}

main().catch(console.error);
