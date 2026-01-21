import OpenAI from 'openai';
import type { TranscriptSegment } from '@/types/youtube';
import type { LlmPreprocessResult } from '@/types/llm-preprocess';
import type { NormalizedSegment } from './transcript-preprocessor';
import { findFactionByName, loadFactionById } from '@/data/generated';
import { ALL_STRATAGEMS, FACTIONS, DETACHMENTS } from '@/data/constants';
import { PHONETIC_OVERRIDES } from '@/data/phonetic-overrides';

const MAX_CHARS_PER_CHUNK = 12000; // ~3000 tokens - larger chunks = fewer API calls
const OVERLAP_SEGMENTS = 1; // Reduced overlap for cost efficiency
const SINGLE_REQUEST_THRESHOLD = 24000; // Skip chunking for short transcripts
const MAX_CONCURRENT_REQUESTS = 3;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;
const MCP_SERVER_URL = 'http://localhost:40401';
const MCP_VALIDATION_TIMEOUT_MS = 5000;

interface PreprocessResponse {
  mappings: Record<string, string>;
}

const PREPROCESS_SYSTEM_PROMPT = `You are a Warhammer 40,000 terminology expert. Extract colloquial terms, abbreviations, and nicknames from battle report transcripts and map them to their official UNIT, FACTION, DETACHMENT, or STRATAGEM names ONLY.

GUIDELINES:
- Only map terms that are clearly Warhammer 40k related
- Map unit nicknames to official unit names (e.g., "las preds" → "Predator Destructor")
- Map stratagem nicknames to official names (e.g., "popped smoke" → "Smokescreen")
- Map misspellings to correct names (e.g., "Drukari" → "Drukhari", "Kalidus" → "Callidus Assassin")
- Map abbreviated names to full names (e.g., "termies" → "Terminators")

DO NOT MAP THE FOLLOWING - THEY ARE NOT TAGGABLE ENTITIES:
- WEAPONS: Dark Lance, Meltagun, Huskblade, Splinter Rifle, Shuriken Catapult, etc.
- WEAPON ABILITIES: Devastating Wounds, Sustained Hits, Lethal Hits, Anti-Infantry, etc.
- GAME MECHANICS: Battleshock, Command Points, Feel No Pain, Mortal Wounds, Deep Strike, etc.
- ARMY RULES: Power from Pain, Strands of Fate, Oath of Moment, etc.
- OBJECTIVE/MISSION NAMES: Terraform, Hidden Supplies, Assassination, etc.
- General English words that aren't unit/faction/stratagem names

PLAYER NAME HANDLING:
When a player name is combined with a unit type, map to JUST the unit type:
- "Archon Skari" → "Archon" (Skari is the player)
- "Librarian Zarek" → "Librarian" (Zarek is the player)
- "Captain John" → "Captain"

WEAPON LOADOUT HANDLING:
When a unit is mentioned with weapons, map to JUST the unit:
- "Scourge with Dark Lances" → "Scourges"
- "Terminators with Thunder Hammers" → "Terminator Squad"

If no valid mappings are found, return an empty mappings object.

Respond with a JSON object containing only "mappings" - an object mapping each colloquial term to its official name.

Example:
Input: "...las preds moving up, the kalidus got devastating wounds, archon skari charges..."
Output JSON:
{
  "mappings": {
    "las preds": "Predator Destructor",
    "kalidus": "Callidus Assassin",
    "archon skari": "Archon"
  }
}

NOTE: "devastating wounds" is NOT mapped because it's a weapon ability, not a unit.`;

interface ChunkInfo {
  segments: TranscriptSegment[];
  startIdx: number;
  endIdx: number;
  text: string;
}

/**
 * Build a reverse mapping from phonetic variations to canonical names.
 * This is used to pre-normalize transcript text before LLM processing.
 */
function buildPhoneticOverrideMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [canonical, variations] of Object.entries(PHONETIC_OVERRIDES)) {
    for (const variation of variations) {
      map.set(variation.toLowerCase(), canonical);
    }
  }
  return map;
}

// Cache the phonetic override map
const phoneticOverrideMap = buildPhoneticOverrideMap();

/**
 * Apply phonetic overrides to normalize YouTube caption errors in text.
 * This runs BEFORE LLM processing to fix common mishearings like "Gilman" → "Roboute Guilliman".
 */
function applyPhoneticOverrides(text: string): { text: string; applied: string[] } {
  let result = text;
  const applied: string[] = [];

  // Sort by variation length (longest first) to avoid partial matches
  const sortedEntries = [...phoneticOverrideMap.entries()].sort(
    (a, b) => b[0].length - a[0].length
  );

  for (const [variation, canonical] of sortedEntries) {
    // Create case-insensitive regex with word boundaries
    const escapedVariation = variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedVariation}\\b`, 'gi');

    if (regex.test(result)) {
      result = result.replace(regex, (match) => {
        // Preserve case of first letter
        const firstChar = match[0] ?? '';
        const isUpperCase = firstChar === firstChar.toUpperCase() && firstChar !== '';
        applied.push(`${variation} → ${canonical}`);
        return isUpperCase
          ? canonical.charAt(0).toUpperCase() + canonical.slice(1)
          : canonical.toLowerCase();
      });
    }
  }

  return { text: result, applied };
}

/**
 * Pre-process transcript segments to normalize phonetic errors.
 * Returns modified segments with corrected text.
 */
function normalizeTranscriptWithPhoneticOverrides(
  segments: TranscriptSegment[]
): { segments: TranscriptSegment[]; totalApplied: number } {
  let totalApplied = 0;
  const normalizedSegments = segments.map(seg => {
    const { text, applied } = applyPhoneticOverrides(seg.text);
    totalApplied += applied.length;
    return { ...seg, text };
  });
  return { segments: normalizedSegments, totalApplied };
}

/**
 * Load unit names for the specified factions.
 * Returns a Set of lowercase unit names for efficient lookup.
 */
async function loadFactionUnits(factionNames: string[]): Promise<Set<string>> {
  const units = new Set<string>();

  for (const name of factionNames) {
    const faction = findFactionByName(name);
    if (faction) {
      const data = await loadFactionById(faction.id);
      if (data) {
        for (const unit of data.units) {
          units.add(unit.name.toLowerCase());
        }
      }
    }
  }

  return units;
}

/**
 * Filter term mappings to remove units that don't belong to the declared factions.
 * This prevents cross-faction unit contamination (e.g., "Plasmancer" appearing in a non-Necron game).
 */
async function filterMappingsByFaction(
  mappings: Record<string, string>,
  factions: string[]
): Promise<Record<string, string>> {
  if (factions.length === 0) {
    // No faction filtering if no factions declared
    return mappings;
  }

  const factionUnits = await loadFactionUnits(factions);

  // If we couldn't load any faction units, skip filtering to avoid removing everything
  if (factionUnits.size === 0) {
    console.warn('Could not load any faction unit data, skipping faction filtering');
    return mappings;
  }

  // Build sets for known stratagems, factions, and detachments (lowercase for comparison)
  const knownStratagems = new Set(ALL_STRATAGEMS.map(s => s.toLowerCase()));
  const knownFactions = new Set(FACTIONS.map(f => f.toLowerCase()));
  const knownDetachments = new Set(DETACHMENTS.map(d => d.toLowerCase()));

  const finalMappings: Record<string, string> = {};
  let filteredCount = 0;

  for (const [colloquial, official] of Object.entries(mappings)) {
    const officialLower = official.toLowerCase();

    // Check if this is a known non-unit term (stratagem, faction, detachment)
    const isKnownStratagem = knownStratagems.has(officialLower);
    const isKnownFaction = knownFactions.has(officialLower);
    const isKnownDetachment = knownDetachments.has(officialLower);

    // If it's a known stratagem/faction/detachment, keep it
    if (isKnownStratagem || isKnownFaction || isKnownDetachment) {
      finalMappings[colloquial] = official;
      continue;
    }

    // This term is likely a unit - check if it belongs to declared factions
    if (factionUnits.has(officialLower)) {
      finalMappings[colloquial] = official;
    } else {
      console.log(`Filtering out '${colloquial}' → '${official}' (unit not in declared factions: ${factions.join(', ')})`);
      filteredCount++;
    }
  }

  if (filteredCount > 0) {
    console.log(`Faction filtering removed ${filteredCount} cross-faction unit mappings`);
  }

  return finalMappings;
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

// Categories that should NOT be tagged as units - these are not taggable entities
const EXCLUDED_MCP_CATEGORIES = new Set(['weapons', 'abilities', 'keywords']);

/**
 * Validate term mappings against the MCP server.
 * Returns corrected mappings where available, falling back to original LLM mappings.
 * Filters out terms that match weapons, abilities, or keywords categories.
 * This is optional - if the MCP server is unavailable, it returns the original mappings.
 */
async function validateTermsWithMcp(
  termMappings: Record<string, string>,
  factions: string[]
): Promise<Record<string, string>> {
  const terms = Object.values(termMappings);
  if (terms.length === 0) return termMappings;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MCP_VALIDATION_TIMEOUT_MS);

    const response = await fetch(`${MCP_SERVER_URL}/api/validate-terms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        terms,
        factions,
        minConfidence: 0.7,
        // Include weapons category so we can filter them out
        categories: ['units', 'stratagems', 'abilities', 'factions', 'enhancements', 'weapons', 'keywords'],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`MCP validation failed with status ${response.status}, using LLM mappings`);
      return termMappings;
    }

    const data = await response.json();

    // Validate response structure
    if (!data || typeof data !== 'object' || !Array.isArray(data.results)) {
      console.warn('MCP validation returned invalid response structure, using LLM mappings');
      return termMappings;
    }

    // Build a map of LLM official names to MCP validated names
    // Also track which terms matched excluded categories (weapons, abilities, keywords)
    const mcpValidated: Record<string, string> = {};
    const excludedTerms = new Set<string>();

    for (const result of data.results) {
      if (
        result &&
        typeof result === 'object' &&
        typeof result.input === 'string' &&
        typeof result.match === 'string' &&
        typeof result.confidence === 'number' &&
        result.confidence >= 0.7
      ) {
        const inputLower = result.input.toLowerCase();
        const category = result.category as string | undefined;

        // Check if this term matched an excluded category
        if (category && EXCLUDED_MCP_CATEGORIES.has(category)) {
          excludedTerms.add(inputLower);
          console.log(`Filtering out '${result.input}' - matched category '${category}' (not a taggable entity)`);
          continue;
        }

        mcpValidated[inputLower] = result.match;
      }
    }

    // Apply MCP corrections to the mappings, excluding filtered terms
    const correctedMappings: Record<string, string> = {};
    for (const [colloquial, llmOfficial] of Object.entries(termMappings)) {
      const llmLower = llmOfficial.toLowerCase();

      // Skip terms that matched excluded categories
      if (excludedTerms.has(llmLower)) {
        console.log(`Removing mapping '${colloquial}' → '${llmOfficial}' (matched excluded category)`);
        continue;
      }

      const mcpMatch = mcpValidated[llmLower];
      // Use MCP match if found, otherwise keep LLM mapping
      correctedMappings[colloquial] = mcpMatch || llmOfficial;
    }

    const corrections = Object.entries(correctedMappings).filter(
      ([k, v]) => termMappings[k] !== v
    ).length;
    const filtered = Object.keys(termMappings).length - Object.keys(correctedMappings).length;

    if (corrections > 0) {
      console.log(`MCP validation corrected ${corrections} term mappings`);
    }
    if (filtered > 0) {
      console.log(`MCP validation filtered out ${filtered} non-taggable terms`);
    }

    // Filter out units not in declared factions
    const factionFilteredMappings = await filterMappingsByFaction(correctedMappings, factions);

    return factionFilteredMappings;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('MCP validation timed out, using LLM mappings');
    } else {
      console.warn('MCP validation unavailable, using LLM mappings:', error);
    }
    // Still apply faction filtering even when MCP validation fails
    return filterMappingsByFaction(termMappings, factions);
  }
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

  // Step 1: Apply phonetic overrides to fix YouTube caption errors
  // This normalizes common mishearings like "Gilman" → "Roboute Guilliman" BEFORE LLM processing
  const { segments: normalizedTranscript, totalApplied } = normalizeTranscriptWithPhoneticOverrides(transcript);
  if (totalApplied > 0) {
    console.log(`Applied ${totalApplied} phonetic override corrections`);
  }

  const openai = new OpenAI({ apiKey });

  // Calculate total text length to determine chunking strategy
  const totalTextLength = normalizedTranscript.reduce(
    (acc, seg) => acc + `[${Math.floor(seg.startTime)}s] ${seg.text} `.length,
    0
  );

  // Use single request for short transcripts (cost optimization)
  if (totalTextLength <= SINGLE_REQUEST_THRESHOLD) {
    console.log(`LLM preprocessing: single request for ${normalizedTranscript.length} segments (${totalTextLength} chars)`);
    const singleChunk: ChunkInfo = {
      segments: normalizedTranscript,
      startIdx: 0,
      endIdx: normalizedTranscript.length - 1,
      text: normalizedTranscript.map(s => `[${Math.floor(s.startTime)}s] ${s.text}`).join(' '),
    };
    const response = await processChunk(openai, singleChunk, factions);
    const validatedMappings = await validateTermsWithMcp(response.mappings, factions);

    const normalizedSegments: NormalizedSegment[] = normalizedTranscript.map((seg) => {
      let normalizedText = seg.text;
      let taggedText = seg.text;
      for (const [colloquial, official] of Object.entries(validatedMappings)) {
        const escapedColloquial = colloquial.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedColloquial}\\b`, 'gi');
        normalizedText = normalizedText.replace(regex, (match) => {
          const firstChar = match[0] ?? '';
          const isUpperCase = firstChar === firstChar.toUpperCase() && firstChar !== '';
          return isUpperCase
            ? official.charAt(0).toUpperCase() + official.slice(1)
            : official.toLowerCase();
        });
        taggedText = taggedText.replace(regex, `[TERM:${official}]`);
      }
      return { ...seg, normalizedText, taggedText };
    });

    return {
      normalizedSegments,
      termMappings: validatedMappings,
      confidence: Object.keys(validatedMappings).length > 0 ? 1 : 0.5,
      modelUsed: 'gpt-4o-mini',
      processedAt: Date.now(),
    };
  }

  // Chunk the transcript for longer content
  const chunks = chunkTranscript(normalizedTranscript);
  console.log(`LLM preprocessing: ${chunks.length} chunks for ${normalizedTranscript.length} segments (${totalTextLength} chars)`);

  // Process all chunks with concurrency limit
  const responses = await processChunksWithConcurrency(openai, chunks, factions);

  // Merge results from all chunks
  const { termMappings: rawTermMappings } = mergeChunkResponses(normalizedTranscript, responses);

  // Optionally validate LLM mappings against MCP server (non-blocking if unavailable)
  const validatedMappings = await validateTermsWithMcp(rawTermMappings, factions);

  // Apply validated mappings to create final normalized segments
  const normalizedSegments: NormalizedSegment[] = normalizedTranscript.map((seg) => {
    let normalizedText = seg.text;
    let taggedText = seg.text;

    for (const [colloquial, official] of Object.entries(validatedMappings)) {
      const escapedColloquial = colloquial.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedColloquial}\\b`, 'gi');

      normalizedText = normalizedText.replace(regex, (match) => {
        const firstChar = match[0] ?? '';
        const isUpperCase = firstChar === firstChar.toUpperCase() && firstChar !== '';
        return isUpperCase
          ? official.charAt(0).toUpperCase() + official.slice(1)
          : official.toLowerCase();
      });

      taggedText = taggedText.replace(regex, `[TERM:${official}]`);
    }

    return {
      ...seg,
      normalizedText,
      taggedText,
    };
  });

  // Calculate confidence based on how many chunks had mappings
  const chunksWithMappings = responses.filter(r => Object.keys(r.mappings).length > 0).length;
  const confidence = chunks.length > 0 ? chunksWithMappings / chunks.length : 1;

  console.log(`LLM preprocessing complete: ${Object.keys(validatedMappings).length} term mappings found`);

  return {
    normalizedSegments,
    termMappings: validatedMappings,
    confidence,
    modelUsed: 'gpt-4o-mini',
    processedAt: Date.now(),
  };
}
