/**
 * Test script for LLM-based transcript preprocessing.
 *
 * Usage:
 *   npx tsx scripts/test-llm-preprocessing.ts --mock                    # Run with mock data
 *   npx tsx scripts/test-llm-preprocessing.ts <videoId> [f1] [f2]       # Fetch from YouTube
 *   npx tsx scripts/test-llm-preprocessing.ts --file <path> [f1] [f2]   # Load from JSON file
 *
 * Examples:
 *   npx tsx scripts/test-llm-preprocessing.ts --mock
 *   npx tsx scripts/test-llm-preprocessing.ts QtqshWdUeiQ space-marines necrons
 *   npx tsx scripts/test-llm-preprocessing.ts --file test-data/captions/QtqshWdUeiQ.json
 *
 * Environment:
 *   OPENAI_API_KEY - Required for LLM preprocessing
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { extractTranscript, extractVideoId, formatTimestamp, isYtDlpInstalled, type TranscriptResult } from './transcript-extractor';
import { preprocessTranscript } from '../src/background/transcript-preprocessor';
import { preprocessWithLlm } from '../src/background/llm-preprocess-service';
import { loadFactionById, factionIndex } from '../src/data/generated/index';
import type { TranscriptSegment } from '../src/types/youtube';

const CAPTIONS_DIR = path.join(process.cwd(), 'test-data', 'captions');

// Mock transcript with colloquial terms for testing
const MOCK_TRANSCRIPT: TranscriptSegment[] = [
  { text: "Welcome to today's battle report", startTime: 0, duration: 3 },
  { text: "we've got Space Marines versus Necrons, 2000 points", startTime: 3, duration: 4 },
  { text: "I'm running the las preds today, two of them", startTime: 10, duration: 4 },
  { text: "with some intercessors to hold objectives", startTime: 14, duration: 3 },
  { text: "and a unit of bladeguard for the counter punch", startTime: 17, duration: 4 },
  { text: "My opponent has warriors, lots of warriors", startTime: 25, duration: 4 },
  { text: "with a doomsday ark for anti-tank", startTime: 29, duration: 3 },
  { text: "and some wraiths coming up the flank", startTime: 32, duration: 3 },
  { text: "Turn one, I'm moving the las preds up", startTime: 60, duration: 4 },
  { text: "he pops smoke on the warriors to protect them", startTime: 64, duration: 4 },
  { text: "I use overwatch when his wraiths charge", startTime: 120, duration: 4 },
  { text: "and he uses reanimation protocols", startTime: 124, duration: 3 },
  { text: "the termies are coming in from deep strike", startTime: 180, duration: 4 },
  { text: "using rapid ingress at the end of his turn", startTime: 184, duration: 4 },
  { text: "I pop armour of contempt on my bladeguard", startTime: 240, duration: 4 },
  { text: "to tank those gauss shots", startTime: 244, duration: 3 },
  { text: "going for assassination secondary here", startTime: 300, duration: 4 },
  { text: "need to kill his overlord for max points", startTime: 304, duration: 3 },
];

const MOCK_FACTIONS = ['Space Marines', 'Necrons'];

function printSection(title: string): void {
  console.log('\n' + '='.repeat(70));
  console.log(title);
  console.log('='.repeat(70));
}

function printSubsection(title: string): void {
  console.log('\n' + '-'.repeat(50));
  console.log(title);
  console.log('-'.repeat(50));
}

/**
 * Save transcript to test-data/captions for reuse.
 */
function saveTranscript(transcript: TranscriptResult): void {
  if (!fs.existsSync(CAPTIONS_DIR)) {
    fs.mkdirSync(CAPTIONS_DIR, { recursive: true });
  }
  const filepath = path.join(CAPTIONS_DIR, `${transcript.videoId}.json`);
  fs.writeFileSync(filepath, JSON.stringify(transcript, null, 2));
  console.log(`Saved transcript to: ${filepath}`);
}

/**
 * Load transcript from JSON file.
 */
function loadTranscript(filepath: string): TranscriptSegment[] {
  const content = fs.readFileSync(filepath, 'utf-8');
  const data = JSON.parse(content);
  return data.segments || data.transcript || data;
}

/**
 * Run comparison between LLM and pattern-only preprocessing.
 */
async function runComparison(
  transcript: TranscriptSegment[],
  factions: string[],
  unitNames: string[],
  apiKey: string
): Promise<void> {
  printSection('TRANSCRIPT INFO');
  console.log(`Segments: ${transcript.length}`);
  console.log(`Duration: ${formatTimestamp(transcript[transcript.length - 1]?.startTime ?? 0)}`);
  console.log(`Factions: ${factions.join(' vs ')}`);
  console.log(`Unit names loaded: ${unitNames.length}`);

  // Show sample
  printSubsection('Sample (first 5 segments)');
  transcript.slice(0, 5).forEach(seg => {
    console.log(`[${formatTimestamp(seg.startTime)}] ${seg.text}`);
  });

  // Run LLM preprocessing
  printSection('LLM PREPROCESSING');
  console.log('Calling GPT-4o-mini...');
  const llmStart = Date.now();

  let llmResult;
  try {
    llmResult = await preprocessWithLlm(transcript, factions, apiKey);
    const llmElapsed = Date.now() - llmStart;
    console.log(`Completed in ${llmElapsed}ms`);
    console.log(`Model: ${llmResult.modelUsed}`);
    console.log(`Confidence: ${(llmResult.confidence * 100).toFixed(1)}%`);
  } catch (error) {
    console.error('LLM preprocessing failed:', error);
    return;
  }

  // Show LLM term mappings
  printSubsection('LLM Term Mappings');
  const mappingEntries = Object.entries(llmResult.termMappings);
  if (mappingEntries.length === 0) {
    console.log('No mappings found (transcript may already use official terms)');
  } else {
    console.log(`Found ${mappingEntries.length} mappings:`);
    mappingEntries.forEach(([colloquial, official]) => {
      console.log(`  "${colloquial}" → "${official}"`);
    });
  }

  // Run pattern-only preprocessing
  printSection('PATTERN-ONLY PREPROCESSING');
  const patternStart = Date.now();
  const patternResult = preprocessTranscript(transcript, unitNames);
  const patternElapsed = Date.now() - patternStart;
  console.log(`Completed in ${patternElapsed}ms`);

  // Show pattern-based corrections
  printSubsection('Pattern-Based Corrections');
  if (patternResult.colloquialToOfficial.size === 0) {
    console.log('No corrections made');
  } else {
    console.log(`Found ${patternResult.colloquialToOfficial.size} corrections:`);
    for (const [colloquial, official] of patternResult.colloquialToOfficial) {
      console.log(`  "${colloquial}" → "${official}"`);
    }
  }

  // Compare detections
  printSection('DETECTION COMPARISON');

  // Stratagems
  printSubsection('Stratagems Detected');
  console.log('\nPattern-based:');
  if (patternResult.stratagemMentions.size === 0) {
    console.log('  (none)');
  } else {
    for (const [name, timestamps] of patternResult.stratagemMentions) {
      console.log(`  "${name}" at ${timestamps.slice(0, 3).map(formatTimestamp).join(', ')}`);
    }
  }

  // Units
  printSubsection('Units Detected');
  console.log('\nPattern-based:');
  if (patternResult.unitMentions.size === 0) {
    console.log('  (none)');
  } else {
    for (const [name, timestamps] of patternResult.unitMentions) {
      console.log(`  "${name}" at ${timestamps.slice(0, 3).map(formatTimestamp).join(', ')}`);
    }
  }

  // Objectives
  printSubsection('Objectives Detected');
  if (patternResult.objectiveMentions.size === 0) {
    console.log('  (none)');
  } else {
    for (const [name, timestamps] of patternResult.objectiveMentions) {
      console.log(`  "${name}" at ${timestamps.slice(0, 3).map(formatTimestamp).join(', ')}`);
    }
  }

  // Show normalized text sample
  printSection('NORMALIZED TEXT SAMPLE');
  const sampleIndices = [2, 8, 10, 14]; // Segments with colloquial terms
  for (const idx of sampleIndices) {
    const seg = llmResult.normalizedSegments[idx];
    if (seg) {
      console.log(`\n[${formatTimestamp(seg.startTime)}]`);
      console.log(`  Original:   "${transcript[idx]?.text}"`);
      console.log(`  Normalized: "${seg.normalizedText}"`);
      console.log(`  Tagged:     "${seg.taggedText}"`);
    }
  }

  // Summary
  printSection('SUMMARY');
  console.log(`LLM mappings found:        ${mappingEntries.length}`);
  console.log(`Pattern corrections found: ${patternResult.colloquialToOfficial.size}`);
  console.log(`Stratagems detected:       ${patternResult.stratagemMentions.size}`);
  console.log(`Units detected:            ${patternResult.unitMentions.size}`);
  console.log(`Objectives detected:       ${patternResult.objectiveMentions.size}`);
  console.log(`LLM processing time:       ${Date.now() - llmStart}ms`);
  console.log(`Pattern processing time:   ${patternElapsed}ms`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Check for API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
    console.error('Set it in .env file or export OPENAI_API_KEY=sk-...');
    process.exit(1);
  }

  let transcript: TranscriptSegment[];
  let factions: string[];
  let unitNames: string[] = [];

  if (args.length === 0 || args[0] === '--mock') {
    // Run with mock data
    console.log('Running with MOCK transcript data...');
    transcript = MOCK_TRANSCRIPT;
    factions = MOCK_FACTIONS;

    // Load unit names for mock factions
    for (const factionName of MOCK_FACTIONS) {
      const factionId = factionName.toLowerCase().replace(/\s+/g, '-');
      const faction = await loadFactionById(factionId);
      if (faction) {
        unitNames.push(...faction.units.map(u => u.name));
      }
    }
  } else if (args[0] === '--file' && args[1]) {
    // Load from file
    const filepath = args[1];
    console.log(`Loading transcript from: ${filepath}`);
    transcript = loadTranscript(filepath);

    // Get factions from args or use defaults
    const faction1Id = args[2] || 'space-marines';
    const faction2Id = args[3] || 'necrons';
    factions = [faction1Id, faction2Id];

    for (const factionId of factions) {
      const faction = await loadFactionById(factionId);
      if (faction) {
        factions[factions.indexOf(factionId)] = faction.name;
        unitNames.push(...faction.units.map(u => u.name));
      }
    }
  } else {
    // Fetch from YouTube
    const videoId = extractVideoId(args[0] ?? '');
    if (!videoId) {
      console.error(`Invalid video ID or URL: ${args[0]}`);
      console.error('\nUsage:');
      console.error('  npx tsx scripts/test-llm-preprocessing.ts --mock');
      console.error('  npx tsx scripts/test-llm-preprocessing.ts <videoId> [faction1] [faction2]');
      console.error('  npx tsx scripts/test-llm-preprocessing.ts --file <path> [faction1] [faction2]');
      console.error('\nAvailable factions:');
      factionIndex.factions.slice(0, 10).forEach(f => {
        console.error(`  ${f.id}`);
      });
      console.error('  ... and more');
      process.exit(1);
    }

    if (!isYtDlpInstalled()) {
      console.error('Error: yt-dlp is not installed');
      console.error('Install with: brew install yt-dlp');
      process.exit(1);
    }

    console.log(`Fetching transcript for video: ${videoId}`);
    const result = await extractTranscript(videoId);
    saveTranscript(result);
    transcript = result.segments;

    // Get factions
    const faction1Id = args[1] || 'space-marines';
    const faction2Id = args[2] || 'necrons';
    factions = [];

    for (const factionId of [faction1Id, faction2Id]) {
      const faction = await loadFactionById(factionId);
      if (faction) {
        factions.push(faction.name);
        unitNames.push(...faction.units.map(u => u.name));
      } else {
        factions.push(factionId);
      }
    }
  }

  await runComparison(transcript, factions, unitNames, apiKey);
}

main().catch(console.error);
