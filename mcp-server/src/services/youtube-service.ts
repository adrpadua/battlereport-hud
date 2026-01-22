/**
 * YouTube transcript extraction service using yt-dlp.
 *
 * The youtube-transcript npm package is unreliable with auto-generated captions,
 * so we use yt-dlp which handles YouTube's various caption formats correctly.
 *
 * Requires: yt-dlp installed (brew install yt-dlp)
 */

import { execSync, spawn } from 'child_process';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// ============================================================================
// Transcript Cache
// ============================================================================

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedTranscript {
  result: TranscriptResult;
  cachedAt: number;
}

const transcriptCache = new Map<string, CachedTranscript>();

/**
 * Get cached transcript if available and not expired.
 */
function getCachedTranscript(videoId: string): TranscriptResult | null {
  const cached = transcriptCache.get(videoId);
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.cachedAt > CACHE_TTL_MS) {
    transcriptCache.delete(videoId);
    return null;
  }

  return cached.result;
}

/**
 * Cache a transcript result.
 */
function cacheTranscript(videoId: string, result: TranscriptResult): void {
  transcriptCache.set(videoId, {
    result,
    cachedAt: Date.now(),
  });
}

/**
 * Clear expired cache entries. Call periodically.
 */
export function clearExpiredTranscriptCache(): number {
  const now = Date.now();
  let cleared = 0;

  for (const [videoId, cached] of transcriptCache) {
    if (now - cached.cachedAt > CACHE_TTL_MS) {
      transcriptCache.delete(videoId);
      cleared++;
    }
  }

  return cleared;
}

/**
 * Get cache statistics for monitoring.
 */
export function getTranscriptCacheStats(): { size: number; oldestAge: number } {
  let oldestAge = 0;
  const now = Date.now();

  for (const cached of transcriptCache.values()) {
    const age = now - cached.cachedAt;
    if (age > oldestAge) oldestAge = age;
  }

  return {
    size: transcriptCache.size,
    oldestAge: Math.floor(oldestAge / 1000 / 60), // minutes
  };
}

// ============================================================================
// Types
// ============================================================================

export interface TranscriptSegment {
  text: string;
  startTime: number; // seconds
  duration: number;
}

export interface Chapter {
  title: string;
  startTime: number; // seconds
}

export interface TranscriptResult {
  videoId: string;
  title: string;
  channel: string;
  description: string;
  segments: TranscriptSegment[];
  chapters: Chapter[];
  duration: number; // seconds
  language: string;
}

export interface ExtractOptions {
  language?: string; // Default: 'en'
  keepFile?: boolean; // Keep the downloaded VTT file
  outputDir?: string; // Directory for VTT file (default: system temp)
}

/**
 * Check if yt-dlp is installed.
 */
export function isYtDlpInstalled(): boolean {
  try {
    execSync('which yt-dlp', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract video ID from various YouTube URL formats.
 */
export function extractVideoId(input: string): string | null {
  // Already a video ID (11 characters)
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return input;
  }

  // URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      return match[1] ?? null;
    }
  }

  return null;
}

/**
 * Parse VTT file content into TranscriptSegment array.
 */
function parseVtt(vttContent: string): TranscriptSegment[] {
  const lines = vttContent.split('\n');
  const segments: TranscriptSegment[] = [];
  let currentStartTime: number | null = null;
  let currentDuration: number = 0;
  const seenTexts = new Set<string>();

  for (const line of lines) {
    // Match timestamp line: 00:00:00.160 --> 00:00:02.070
    const timeMatch = line.match(
      /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/
    );
    if (timeMatch) {
      const startSeconds =
        parseInt(timeMatch[1]!) * 3600 +
        parseInt(timeMatch[2]!) * 60 +
        parseInt(timeMatch[3]!) +
        parseInt(timeMatch[4]!) / 1000;

      const endSeconds =
        parseInt(timeMatch[5]!) * 3600 +
        parseInt(timeMatch[6]!) * 60 +
        parseInt(timeMatch[7]!) +
        parseInt(timeMatch[8]!) / 1000;

      currentStartTime = startSeconds;
      currentDuration = endSeconds - startSeconds;
      continue;
    }

    // Skip metadata lines
    if (
      !line.trim() ||
      line.startsWith('WEBVTT') ||
      line.startsWith('Kind:') ||
      line.startsWith('Language:') ||
      line.startsWith('NOTE')
    ) {
      continue;
    }

    // Clean text (remove timing tags like <00:00:00.480><c>)
    const cleanText = line
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();

    if (cleanText && currentStartTime !== null) {
      // Deduplicate consecutive identical texts
      const key = `${Math.floor(currentStartTime)}:${cleanText}`;
      if (!seenTexts.has(key)) {
        seenTexts.add(key);
        segments.push({
          text: cleanText,
          startTime: currentStartTime,
          duration: currentDuration,
        });
      }
    }
  }

  // Merge segments that are very close together (within 0.5s) with same text
  const mergedSegments: TranscriptSegment[] = [];
  for (const seg of segments) {
    const last = mergedSegments[mergedSegments.length - 1];
    if (last && last.text === seg.text && seg.startTime - last.startTime < 0.5) {
      // Extend duration of previous segment
      last.duration = seg.startTime + seg.duration - last.startTime;
    } else {
      mergedSegments.push({ ...seg });
    }
  }

  return mergedSegments;
}

/**
 * Get video metadata using yt-dlp.
 */
async function getVideoMetadata(
  videoId: string
): Promise<{ title: string; channel: string; description: string; chapters: Chapter[] }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', [
      '--dump-json',
      '--no-download',
      `https://www.youtube.com/watch?v=${videoId}`,
    ]);

    let output = '';
    let error = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      error += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const json = JSON.parse(output);
          const chapters: Chapter[] = (json.chapters || []).map(
            (ch: { title: string; start_time: number }) => ({
              title: ch.title,
              startTime: ch.start_time,
            })
          );
          resolve({
            title: json.title || 'Unknown',
            channel: json.channel || json.uploader || 'Unknown',
            description: json.description || '',
            chapters,
          });
        } catch {
          reject(new Error(`Failed to parse video metadata: ${output.slice(0, 200)}`));
        }
      } else {
        reject(new Error(`Failed to get video metadata: ${error}`));
      }
    });
  });
}

/**
 * Download subtitles using yt-dlp.
 */
async function downloadSubtitles(
  videoId: string,
  outputPath: string,
  language: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '--write-auto-sub',
      '--sub-lang',
      language,
      '--skip-download',
      '--sub-format',
      'vtt',
      '-o',
      outputPath,
      `https://www.youtube.com/watch?v=${videoId}`,
    ];

    const proc = spawn('yt-dlp', args);

    let error = '';

    proc.stderr.on('data', (data) => {
      error += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`yt-dlp failed: ${error}`));
      }
    });
  });
}

/**
 * Extract transcript from a YouTube video.
 * Results are cached for 7 days to avoid repeated yt-dlp calls.
 */
export async function extractTranscript(
  videoIdOrUrl: string,
  options: ExtractOptions = {}
): Promise<TranscriptResult> {
  const { language = 'en', keepFile = false, outputDir = tmpdir() } = options;

  // Extract video ID first (needed for cache lookup)
  const videoId = extractVideoId(videoIdOrUrl);
  if (!videoId) {
    throw new Error(`Invalid video ID or URL: ${videoIdOrUrl}`);
  }

  // Check cache first
  const cached = getCachedTranscript(videoId);
  if (cached) {
    console.error(`Using cached transcript for ${videoId}`);
    return cached;
  }

  // Check yt-dlp is installed
  if (!isYtDlpInstalled()) {
    throw new Error(
      'yt-dlp is not installed. Install it with: brew install yt-dlp (macOS) or pip install yt-dlp'
    );
  }

  const outputBase = join(outputDir, videoId);
  const vttPath = `${outputBase}.${language}.vtt`;

  try {
    // Get video metadata (title, channel, description, chapters)
    console.error(`Fetching video metadata for ${videoId}...`);
    const metadata = await getVideoMetadata(videoId);
    console.error(`Title: ${metadata.title}`);
    console.error(`Channel: ${metadata.channel}`);
    console.error(`Chapters: ${metadata.chapters.length}`);

    // Download subtitles
    console.error(`Downloading ${language} subtitles...`);
    await downloadSubtitles(videoId, outputBase, language);

    // Check if VTT file was created
    if (!existsSync(vttPath)) {
      throw new Error(`No subtitles available in ${language} for this video`);
    }

    // Parse VTT file
    console.error('Parsing subtitles...');
    const vttContent = readFileSync(vttPath, 'utf-8');
    const segments = parseVtt(vttContent);

    // Calculate duration from last segment
    const duration =
      segments.length > 0
        ? segments[segments.length - 1]!.startTime + segments[segments.length - 1]!.duration
        : 0;

    console.error(`Extracted ${segments.length} segments (${Math.floor(duration / 60)} minutes)`);

    const result: TranscriptResult = {
      videoId,
      title: metadata.title,
      channel: metadata.channel,
      description: metadata.description,
      segments,
      chapters: metadata.chapters,
      duration,
      language,
    };

    // Cache the result
    cacheTranscript(videoId, result);
    console.error(`Cached transcript for ${videoId}`);

    return result;
  } finally {
    // Cleanup VTT file unless keepFile is true
    if (!keepFile && existsSync(vttPath)) {
      unlinkSync(vttPath);
    }
  }
}

/**
 * Format timestamp as MM:SS or HH:MM:SS.
 */
export function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
