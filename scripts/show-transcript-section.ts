/**
 * Show a section of a video transcript.
 *
 * Usage:
 *   npx tsx scripts/show-transcript-section.ts <videoId> [startMin] [endMin]
 */

import { extractTranscript, formatTimestamp } from './transcript-extractor';

async function main() {
  const args = process.argv.slice(2);
  const videoId = args[0] || 'I6QRlzqjHHw';
  const startMin = parseInt(args[1] || '1');
  const endMin = parseInt(args[2] || '15');

  console.log('Extracting transcript for ' + videoId + '...\n');
  const transcript = await extractTranscript(videoId);

  const startSec = startMin * 60;
  const endSec = endMin * 60;

  // Filter segments in range
  const segments = transcript.segments.filter(
    seg => seg.startTime >= startSec && seg.startTime <= endSec
  );

  console.log('='.repeat(80));
  console.log('TRANSCRIPT: ' + startMin + ':00 to ' + endMin + ':00');
  console.log('='.repeat(80) + '\n');

  // Dedupe and combine nearby segments
  const combined: { time: number; text: string }[] = [];
  let lastText = '';

  for (const seg of segments) {
    // Skip duplicates
    if (seg.text === lastText) continue;
    lastText = seg.text;

    // Combine with previous if within 2 seconds
    const last = combined[combined.length - 1];
    if (last && seg.startTime - last.time < 2) {
      last.text += ' ' + seg.text;
    } else {
      combined.push({ time: seg.startTime, text: seg.text });
    }
  }

  // Print with timestamps
  for (const item of combined) {
    const mins = Math.floor(item.time / 60);
    const secs = Math.floor(item.time % 60);
    const timestamp = '[' + mins + ':' + secs.toString().padStart(2, '0') + ']';
    console.log(timestamp + ' ' + item.text);
  }

  console.log('\n' + '='.repeat(80));
  console.log('Total segments in range: ' + combined.length);
}

main().catch(console.error);
