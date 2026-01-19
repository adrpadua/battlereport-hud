import OpenAI from 'openai';
import type { TranscriptSegment } from '@/types/youtube';
import type { LlmPreprocessResult } from '@/types/llm-preprocess';
import type { NormalizedSegment } from './transcript-preprocessor';

const MAX_CHARS_PER_CHUNK = 8000; // ~2000 tokens
const OVERLAP_SEGMENTS = 2; // Number of segments to overlap between chunks
const MAX_CONCURRENT_REQUESTS = 3;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

interface PreprocessResponse {
  mappings: Record<string, string>;
}

const PREPROCESS_SYSTEM_PROMPT = `You are a Warhammer 40,000 terminology expert. Extract colloquial terms, abbreviations, and nicknames from battle report transcripts and map them to their official game names.

GUIDELINES:
- Only map terms that are clearly Warhammer 40k related
- Map unit nicknames to official unit names (e.g., "las preds" → "Predator Destructor")
- Map stratagem nicknames to official names (e.g., "popped smoke" → "Smokescreen")
- Map misspellings to correct names (e.g., "Drukari" → "Drukhari")
- Map abbreviated names to full names (e.g., "termies" → "Terminators")
- DO NOT map general English words that aren't game-specific
- If no mappings are found, return an empty mappings object

Respond with a JSON object containing only "mappings" - an object mapping each colloquial term to its official name.

Example:
Input: "...las preds moving up, he popped smoke on the warriors..."
Output JSON:
{
  "mappings": {
    "las preds": "Predator Destructor",
    "popped smoke": "Smokescreen",
    "warriors": "Necron Warriors"
  }
}`;

interface ChunkInfo {
  segments: TranscriptSegment[];
  startIdx: number;
  endIdx: number;
  text: string;
}

/**
 * Chunk transcript segments into groups that fit within token limits.
 * Includes overlap between chunks for context continuity.
 */
function chunkTranscript(segments: TranscriptSegment[]): ChunkInfo[] {
  const chunks: ChunkInfo[] = [];
  let currentChunk: TranscriptSegment[] = [];
  let currentLength = 0;
  let startIdx = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const segText = `[${Math.floor(seg.startTime)}s] ${seg.text} `;
    const segLength = segText.length;

    if (currentLength + segLength > MAX_CHARS_PER_CHUNK && currentChunk.length > 0) {
      // Finish current chunk
      chunks.push({
        segments: [...currentChunk],
        startIdx,
        endIdx: i - 1,
        text: currentChunk.map(s => `[${Math.floor(s.startTime)}s] ${s.text}`).join(' '),
      });

      // Start new chunk with overlap
      const overlapStart = Math.max(0, currentChunk.length - OVERLAP_SEGMENTS);
      currentChunk = currentChunk.slice(overlapStart);
      currentLength = currentChunk.reduce(
        (acc, s) => acc + `[${Math.floor(s.startTime)}s] ${s.text} `.length,
        0
      );
      startIdx = i - (currentChunk.length);
    }

    currentChunk.push(seg);
    currentLength += segLength;
  }

  // Add final chunk if not empty
  if (currentChunk.length > 0) {
    chunks.push({
      segments: [...currentChunk],
      startIdx,
      endIdx: segments.length - 1,
      text: currentChunk.map(s => `[${Math.floor(s.startTime)}s] ${s.text}`).join(' '),
    });
  }

  return chunks;
}

/**
 * Build the user prompt for preprocessing a chunk.
 */
function buildPreprocessPrompt(chunk: ChunkInfo, factions: string[]): string {
  let prompt = '';

  if (factions.length > 0) {
    prompt += `FACTIONS IN THIS GAME: ${factions.join(', ')}\n\n`;
  }

  prompt += `TRANSCRIPT CHUNK:\n${chunk.text}`;

  return prompt;
}

/**
 * Sleep for a given duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse and validate the LLM response.
 */
function parseResponse(content: string): PreprocessResponse {
  try {
    const parsed = JSON.parse(content);
    return {
      mappings: typeof parsed.mappings === 'object' && parsed.mappings !== null ? parsed.mappings : {},
    };
  } catch {
    console.warn('Failed to parse LLM response:', content.slice(0, 200));
    return { mappings: {} };
  }
}

/**
 * Process a single chunk with the LLM, with retry logic for rate limits.
 */
async function processChunk(
  openai: OpenAI,
  chunk: ChunkInfo,
  factions: string[]
): Promise<PreprocessResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 1000, // Only returning mappings, so less tokens needed
        messages: [
          { role: 'system', content: PREPROCESS_SYSTEM_PROMPT },
          { role: 'user', content: buildPreprocessPrompt(chunk, factions) },
        ],
        response_format: { type: 'json_object' },
      });

      const choice = completion.choices[0];
      const content = choice?.message?.content;

      // Check finish reason for special cases
      if (choice?.finish_reason === 'length') {
        console.warn('Response truncated due to length, returning partial result');
        return { mappings: {} };
      }

      if (choice?.finish_reason === 'content_filter') {
        console.warn('Response blocked by content filter');
        return { mappings: {} };
      }

      if (!content) {
        throw new Error('No content in LLM response');
      }

      return parseResponse(content);
    } catch (error) {
      lastError = error as Error;

      // Handle specific OpenAI error types
      if (error instanceof OpenAI.RateLimitError) {
        const retryAfter = error.headers?.['retry-after'];
        const delayMs = retryAfter
          ? Number(retryAfter) * 1000
          : BASE_RETRY_DELAY_MS * Math.pow(2, attempt);

        console.warn(`Rate limited, retrying after ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delayMs);
        continue;
      }

      if (error instanceof OpenAI.APIError) {
        console.error(`OpenAI API Error: ${error.status} - ${error.message}`);

        // Retry on server errors
        if (error.status && error.status >= 500) {
          const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
          console.warn(`Server error, retrying after ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await sleep(delayMs);
          continue;
        }

        // Don't retry on client errors (4xx except rate limit)
        throw error;
      }

      if (error instanceof OpenAI.APIConnectionError) {
        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`Connection error, retrying after ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delayMs);
        continue;
      }

      // For other errors (like Zod validation), don't retry
      throw error;
    }
  }

  // All retries exhausted
  throw lastError ?? new Error('Failed to process chunk after all retries');
}

/**
 * Process chunks with limited concurrency.
 */
async function processChunksWithConcurrency(
  openai: OpenAI,
  chunks: ChunkInfo[],
  factions: string[]
): Promise<PreprocessResponse[]> {
  const results: PreprocessResponse[] = new Array(chunks.length);
  let currentIdx = 0;

  async function processNext(): Promise<void> {
    while (currentIdx < chunks.length) {
      const idx = currentIdx++;
      const chunk = chunks[idx];
      if (!chunk) continue;
      try {
        results[idx] = await processChunk(openai, chunk, factions);
      } catch (error) {
        console.error(`Failed to process chunk ${idx}:`, error);
        results[idx] = { mappings: {} };
      }
    }
  }

  // Start concurrent workers
  const workers = Array(Math.min(MAX_CONCURRENT_REQUESTS, chunks.length))
    .fill(null)
    .map(() => processNext());

  await Promise.all(workers);
  return results;
}

/**
 * Merge multiple chunk responses into a single result.
 */
function mergeChunkResponses(
  segments: TranscriptSegment[],
  responses: PreprocessResponse[]
): { normalizedSegments: NormalizedSegment[]; termMappings: Record<string, string> } {
  // Merge all term mappings (later chunks may override earlier ones)
  const termMappings: Record<string, string> = {};
  for (const response of responses) {
    Object.assign(termMappings, response.mappings);
  }

  // Apply mappings to create normalized segments
  const normalizedSegments: NormalizedSegment[] = segments.map((seg) => {
    let normalizedText = seg.text;
    let taggedText = seg.text;

    // Apply each mapping to the segment
    for (const [colloquial, official] of Object.entries(termMappings)) {
      // Create case-insensitive regex with word boundaries
      const escapedColloquial = colloquial.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedColloquial}\\b`, 'gi');

      // Replace in normalized text (preserve case of first letter)
      normalizedText = normalizedText.replace(regex, (match) => {
        const firstChar = match[0] ?? '';
        const isUpperCase = firstChar === firstChar.toUpperCase() && firstChar !== '';
        return isUpperCase
          ? official.charAt(0).toUpperCase() + official.slice(1)
          : official.toLowerCase();
      });

      // Replace in tagged text with markup
      taggedText = taggedText.replace(regex, `[TERM:${official}]`);
    }

    return {
      ...seg,
      normalizedText,
      taggedText,
    };
  });

  return { normalizedSegments, termMappings };
}

/**
 * Main entry point for LLM-based transcript preprocessing.
 * Returns normalized segments with colloquial terms replaced by official names.
 */
export async function preprocessWithLlm(
  transcript: TranscriptSegment[],
  factions: string[],
  apiKey: string
): Promise<LlmPreprocessResult> {
  if (transcript.length === 0) {
    return {
      normalizedSegments: [],
      termMappings: {},
      confidence: 1,
      modelUsed: 'gpt-4o-mini',
      processedAt: Date.now(),
    };
  }

  const openai = new OpenAI({ apiKey });

  // Chunk the transcript
  const chunks = chunkTranscript(transcript);
  console.log(`LLM preprocessing: ${chunks.length} chunks for ${transcript.length} segments`);

  // Process all chunks with concurrency limit
  const responses = await processChunksWithConcurrency(openai, chunks, factions);

  // Merge results
  const { normalizedSegments, termMappings } = mergeChunkResponses(transcript, responses);

  // Calculate confidence based on how many chunks had mappings
  const chunksWithMappings = responses.filter(r => Object.keys(r.mappings).length > 0).length;
  const confidence = chunks.length > 0 ? chunksWithMappings / chunks.length : 1;

  console.log(`LLM preprocessing complete: ${Object.keys(termMappings).length} term mappings found`);

  return {
    normalizedSegments,
    termMappings,
    confidence,
    modelUsed: 'gpt-4o-mini',
    processedAt: Date.now(),
  };
}
