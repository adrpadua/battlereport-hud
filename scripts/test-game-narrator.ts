/**
 * Test script for the game narrator prompt.
 *
 * Tests the narrator prompt by:
 * 1. Loading saved captions from test-data
 * 2. Running preprocessing with detected factions
 * 3. Building the narrator prompts
 * 4. Saving preprocessed transcript to test-data
 * 5. Optionally calling the AI to generate narration
 *
 * Usage:
 *   npx tsx scripts/test-game-narrator.ts <videoId>          # Test with specific video ID (required)
 *   npx tsx scripts/test-game-narrator.ts <videoId> --call-ai  # Generate narration (requires OPENAI_API_KEY)
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { preprocessTranscriptWithGeneratedAliases } from '../src/background/transcript-preprocessor';
import { getFactionContextForPrompt } from '../src/background/report-processor';
import { findFactionByName } from '../src/data/generated';
import {
  GAME_NARRATOR_SYSTEM_PROMPT,
  buildNarratorUserPrompt,
  formatStratagemTimeline,
  formatObjectiveTimeline,
  formatUnitTimeline,
  formatFactionTimeline,
  formatDetachmentTimeline,
  type FactionData,
} from '../src/prompts/game-narrator-prompt';
import type { TranscriptSegment } from '../src/types/youtube';
import { formatTimestamp } from './transcript-extractor';

const CAPTIONS_DIR = path.join(process.cwd(), 'test-data', 'captions');

interface CaptionFile {
  videoId: string;
  title: string;
  segments: TranscriptSegment[];
  duration?: number;
  language?: string;
}

/**
 * Load caption file from test-data directory.
 */
function loadCaptions(videoId: string): CaptionFile {
  const filepath = path.join(CAPTIONS_DIR, `${videoId}.json`);
  if (!fs.existsSync(filepath)) {
    throw new Error(`Caption file not found: ${filepath}`);
  }

  const content = fs.readFileSync(filepath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Detect likely factions from video title.
 * Returns an array of faction names.
 */
function detectFactionsFromTitle(title: string): string[] {
  const searchText = title.toLowerCase();
  const detectedFactions: string[] = [];

  const factionPatterns: [RegExp, string][] = [
    [/\bspace\s*marines?\b|\bastartes\b/i, 'Space Marines'],
    [/\bnecrons?\b/i, 'Necrons'],
    [/\borks?\b/i, 'Orks'],
    [/\btyranids?\b|\bnids?\b/i, 'Tyranids'],
    [/\baeldari\b|\beldar\b|\bcraftworld/i, 'Aeldari'],
    [/\bdrukhari\b|\bdark\s*eldar\b|\bdukari\b/i, 'Drukhari'],
    [/\bt'?au\b/i, "T'au Empire"],
    [/\bchaos\s*space\s*marines?\b|\bcsm\b/i, 'Chaos Space Marines'],
    [/\bdeath\s*guard\b/i, 'Death Guard'],
    [/\bthousand\s*sons?\b/i, 'Thousand Sons'],
    [/\bworld\s*eaters?\b/i, 'World Eaters'],
    [/\bchaos\s*daemons?\b|\bdaemons?\b/i, 'Chaos Daemons'],
    [/\bimperial\s*knights?\b/i, 'Imperial Knights'],
    [/\bchaos\s*knights?\b/i, 'Chaos Knights'],
    [/\bastra\s*militarum\b|\bimperial\s*guard\b/i, 'Astra Militarum'],
    [/\badeptus\s*custodes\b|\bcustodes\b/i, 'Adeptus Custodes'],
    [/\badepta\s*sororitas\b|\bsisters\b/i, 'Adepta Sororitas'],
    [/\badeptus\s*mechanicus\b|\badmech\b/i, 'Adeptus Mechanicus'],
    [/\bgrey\s*knights?\b/i, 'Grey Knights'],
    [/\bblood\s*angels?\b/i, 'Blood Angels'],
    [/\bdark\s*angels?\b/i, 'Dark Angels'],
    [/\bblack\s*templars?\b/i, 'Black Templars'],
    [/\bspace\s*wolves?\b/i, 'Space Wolves'],
    [/\bgenestealer\s*cults?\b|\bgsc\b/i, 'Genestealer Cults'],
    [/\bleagues?\s*(of\s*)?votann\b/i, 'Leagues of Votann'],
  ];

  for (const [pattern, factionName] of factionPatterns) {
    if (pattern.test(searchText) && !detectedFactions.includes(factionName)) {
      detectedFactions.push(factionName);
    }
  }

  return detectedFactions;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const callAi = args.includes('--call-ai');
  const videoId = args.find((a) => !a.startsWith('--'));

  if (!videoId) {
    console.error('Usage: npx tsx scripts/test-game-narrator.ts <videoId> [--call-ai]');
    console.error('Example: npx tsx scripts/test-game-narrator.ts QtqshWdUeiQ --call-ai');
    process.exit(1);
  }

  console.log('='.repeat(80));
  console.log('Game Narrator Prompt Test');
  console.log('='.repeat(80));

  // Load captions
  console.log(`\nLoading captions for video: ${videoId}`);
  const captions = loadCaptions(videoId);
  console.log(`Title: ${captions.title}`);
  console.log(`Segments: ${captions.segments.length}`);

  const duration = captions.segments[captions.segments.length - 1]?.startTime ?? 0;
  console.log(`Duration: ${formatTimestamp(duration)}`);

  // Detect factions from title
  const detectedFactions = detectFactionsFromTitle(captions.title);
  console.log(`\nDetected factions: ${detectedFactions.join(', ') || 'None'}`);

  // Load unit names for detected factions
  const factionUnitNames = new Map<string, string[]>();
  for (const faction of detectedFactions) {
    const unitNames = await getFactionContextForPrompt(faction);
    if (unitNames.length > 0) {
      factionUnitNames.set(faction, unitNames);
      console.log(`  ${faction}: ${unitNames.length} units loaded`);
    }
  }

  // Preprocess transcript with generated aliases
  console.log('\nPreprocessing transcript...');
  const allUnitNames = [...factionUnitNames.values()].flat();

  // Get faction IDs for loading generated aliases
  const factionIds = detectedFactions
    .map((name) => findFactionByName(name)?.id)
    .filter((id): id is string => id !== undefined);

  console.log(`Loading generated aliases for: ${factionIds.join(', ') || 'none'}`);

  const preprocessed = await preprocessTranscriptWithGeneratedAliases(
    captions.segments,
    allUnitNames,
    factionIds
  );

  console.log(`Factions detected: ${preprocessed.factionMentions.size}`);
  console.log(`Detachments detected: ${preprocessed.detachmentMentions.size}`);
  console.log(`Stratagems detected: ${preprocessed.stratagemMentions.size}`);
  console.log(`Objectives detected: ${preprocessed.objectiveMentions.size}`);
  console.log(`Units detected: ${preprocessed.unitMentions.size}`);
  console.log(`Term corrections: ${preprocessed.colloquialToOfficial.size}`);

  // Save preprocessed transcript
  const transcriptLines = preprocessed.normalizedSegments
    .map((s) => {
      const mins = Math.floor(s.startTime / 60);
      const secs = String(Math.floor(s.startTime % 60)).padStart(2, '0');
      return `[${mins}:${secs}] ${s.taggedText}`;
    })
    .join('\n');
  const transcriptPath = path.join(process.cwd(), 'test-data', `transcript-${videoId}.txt`);
  fs.writeFileSync(transcriptPath, transcriptLines);
  console.log(`\nPreprocessed transcript saved to: ${transcriptPath}`);

  // Build faction data for prompt
  let factionData: { faction1?: FactionData; faction2?: FactionData } | undefined;
  if (detectedFactions.length >= 2) {
    factionData = {
      faction1: {
        name: detectedFactions[0],
        units: factionUnitNames.get(detectedFactions[0]) ?? [],
      },
      faction2: {
        name: detectedFactions[1],
        units: factionUnitNames.get(detectedFactions[1]) ?? [],
      },
    };
  }

  // Build the user prompt
  const userPrompt = buildNarratorUserPrompt(
    { title: captions.title, videoId: captions.videoId },
    preprocessed,
    factionData
  );

  // Display results
  console.log('\n' + '='.repeat(80));
  console.log('FACTION TIMELINE');
  console.log('='.repeat(80));
  console.log(formatFactionTimeline(preprocessed.factionMentions));

  console.log('\n' + '='.repeat(80));
  console.log('DETACHMENT TIMELINE');
  console.log('='.repeat(80));
  console.log(formatDetachmentTimeline(preprocessed.detachmentMentions));

  console.log('\n' + '='.repeat(80));
  console.log('STRATAGEM TIMELINE');
  console.log('='.repeat(80));
  console.log(formatStratagemTimeline(preprocessed.stratagemMentions));

  console.log('\n' + '='.repeat(80));
  console.log('OBJECTIVE TIMELINE');
  console.log('='.repeat(80));
  console.log(formatObjectiveTimeline(preprocessed.objectiveMentions));

  console.log('\n' + '='.repeat(80));
  console.log('UNIT TIMELINE');
  console.log('='.repeat(80));
  console.log(formatUnitTimeline(preprocessed.unitMentions));

  console.log('\n' + '='.repeat(80));
  console.log('SYSTEM PROMPT');
  console.log('='.repeat(80));
  console.log(`Length: ${GAME_NARRATOR_SYSTEM_PROMPT.length} characters`);
  console.log('\n--- First 2000 chars ---');
  console.log(GAME_NARRATOR_SYSTEM_PROMPT.slice(0, 2000));
  console.log('...');

  console.log('\n' + '='.repeat(80));
  console.log('USER PROMPT');
  console.log('='.repeat(80));
  console.log(`Length: ${userPrompt.length} characters`);
  console.log('\n--- First 3000 chars ---');
  console.log(userPrompt.slice(0, 3000));
  console.log('...');

  // Calculate total tokens (rough estimate)
  const totalChars = GAME_NARRATOR_SYSTEM_PROMPT.length + userPrompt.length;
  const estimatedTokens = Math.ceil(totalChars / 4);
  console.log(`\n--- Token Estimate ---`);
  console.log(`Total characters: ${totalChars}`);
  console.log(`Estimated tokens: ~${estimatedTokens}`);

  // Optionally call the AI
  if (callAi) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('\nError: OPENAI_API_KEY environment variable not set');
      console.log('Set it with: export OPENAI_API_KEY=your-key-here');
      process.exit(1);
    }

    console.log('\n' + '='.repeat(80));
    console.log('CALLING AI FOR NARRATION');
    console.log('='.repeat(80));

    // Dynamic import OpenAI to avoid requiring it when not using --call-ai
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey });

    console.log('Sending request to GPT-4o...');
    const startTime = Date.now();

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      max_tokens: 16000,
      messages: [
        { role: 'system', content: GAME_NARRATOR_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Response received in ${elapsed}s`);

    const narration = response.choices[0]?.message?.content;
    if (narration) {
      console.log('\n' + '='.repeat(80));
      console.log('AI NARRATION');
      console.log('='.repeat(80));
      console.log(narration);

      // Save to file
      const outputPath = path.join(process.cwd(), 'test-data', `narration-${videoId}.md`);
      fs.writeFileSync(outputPath, narration);
      console.log(`\nNarration saved to: ${outputPath}`);
    } else {
      console.log('No narration generated.');
    }

    // Log usage
    if (response.usage) {
      console.log('\n--- API Usage ---');
      console.log(`Prompt tokens: ${response.usage.prompt_tokens}`);
      console.log(`Completion tokens: ${response.usage.completion_tokens}`);
      console.log(`Total tokens: ${response.usage.total_tokens}`);
    }
  } else {
    console.log('\n--- To generate actual narration, run with --call-ai flag ---');
    console.log(`npx tsx scripts/test-game-narrator.ts ${videoId} --call-ai`);
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
