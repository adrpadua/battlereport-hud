import { Command } from 'commander';
import { runScript } from '../utils/runner.js';

export const videoCommand = new Command('video')
  .description('Video processing commands');

// Extract transcript from YouTube
videoCommand
  .command('extract <url>')
  .description('Extract transcript from a YouTube video')
  .action(async (url: string) => {
    await runScript('transcript-extractor.ts', [url]);
  });

// Show transcript section
videoCommand
  .command('show <videoId>')
  .description('Show a section of a video transcript')
  .argument('[startMin]', 'Start minute', '1')
  .argument('[endMin]', 'End minute', '15')
  .action(async (videoId: string, startMin: string, endMin: string) => {
    await runScript('show-transcript-section.ts', [videoId, startMin, endMin]);
  });

// Test preprocessing
videoCommand
  .command('preprocess <videoId>')
  .description('Test preprocessing with a video')
  .argument('[faction1]', 'First faction ID')
  .argument('[faction2]', 'Second faction ID')
  .action(async (videoId: string, faction1?: string, faction2?: string) => {
    const args = [videoId];
    if (faction1) args.push(faction1);
    if (faction2) args.push(faction2);
    await runScript('test-video-preprocessing.ts', args);
  });

// Test LLM preprocessing
videoCommand
  .command('llm-preprocess <videoId>')
  .description('Compare LLM vs pattern-based preprocessing')
  .action(async (videoId: string) => {
    await runScript('test-llm-preprocessing.ts', [videoId]);
  });

// Test game narrator
videoCommand
  .command('narrate <videoId>')
  .description('Generate narration for a video')
  .option('--call-ai', 'Actually call the AI to generate narration')
  .action(async (videoId: string, options: { callAi?: boolean }) => {
    const args = [videoId];
    if (options.callAi) args.push('--call-ai');
    await runScript('test-game-narrator.ts', args);
  });

// Test chapter detection
videoCommand
  .command('chapters <videoId>')
  .description('Test chapter detection for a video')
  .action(async (videoId: string) => {
    await runScript('test-chapter-detection.ts', [videoId]);
  });

// Test transcript preprocessor
videoCommand
  .command('test-preprocessor')
  .description('Run transcript preprocessor tests')
  .action(async () => {
    await runScript('test-transcript-preprocessor.ts');
  });

// E2E pipeline
videoCommand
  .command('pipeline <url>')
  .description('Run the complete video processing pipeline')
  .option('--narrate', 'Generate narration at the end')
  .action(async (url: string, options: { narrate?: boolean }) => {
    console.log('\n=== BattleReport Video Pipeline ===\n');

    // Step 1: Extract transcript
    console.log('Step 1: Extracting transcript...');
    await runScript('transcript-extractor.ts', [url]);

    // Step 2: Run preprocessing (this saves the transcript and runs pattern-based preprocessing)
    console.log('\nStep 2: Running preprocessing...');
    // Extract video ID from URL for subsequent steps
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    const videoId = videoIdMatch?.[1] || url;
    await runScript('test-video-preprocessing.ts', [videoId]);

    // Step 3: Optionally generate narration
    if (options.narrate) {
      console.log('\nStep 3: Generating narration...');
      await runScript('test-game-narrator.ts', [videoId, '--call-ai']);
    }

    console.log('\n=== Pipeline Complete ===\n');
  });
