/**
 * Transcript deduplication phase.
 * Removes consecutive duplicate lines that are common in YouTube auto-captions.
 */

import type { TranscriptSegment } from '@/types/youtube';

/**
 * Deduplicate consecutive identical lines in a transcript.
 * YouTube auto-captions often repeat lines, which creates noise.
 *
 * @param transcript Raw transcript segments
 * @returns Deduplicated transcript segments
 */
export function deduplicateSegments(transcript: TranscriptSegment[]): TranscriptSegment[] {
  const deduped: TranscriptSegment[] = [];
  let lastText = '';

  for (const seg of transcript) {
    const trimmedText = seg.text.trim();
    if (trimmedText !== lastText) {
      deduped.push(seg);
      lastText = trimmedText;
    }
  }

  return deduped;
}
