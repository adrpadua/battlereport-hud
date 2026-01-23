/**
 * Web extraction API routes for the standalone web app.
 *
 * These endpoints provide video transcript fetching and battle report extraction
 * for the web frontend without requiring the browser extension.
 */

import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/connection.js';
import { eq, and, gt } from 'drizzle-orm';
import { extractionCache, aiResponseCache } from '../../db/schema.js';
import {
  extractTranscript,
  extractVideoId,
  isYtDlpInstalled,
} from '../../services/youtube-service.js';
import {
  detectFactionNamesFromVideo,
  extractBattleReportWithArtifacts,
  enrichUnitsWithStats,
  createStageArtifact,
  completeStageArtifact,
  ALL_FACTIONS,
  type VideoData,
  type StageArtifact,
} from '../../services/extraction-service.js';
import { fetchNamesForCategory } from '../../tools/validation-tools.js';

// Cache TTL: 7 days (matching extension behavior)
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface FetchVideoBody {
  url: string;
}

interface ExtractBody {
  url: string;
  factions: [string, string];
  transcript?: {
    text: string;
    startTime: number;
    duration: number;
  }[];
  skipCache?: boolean;
}

export function registerWebExtractionRoutes(fastify: FastifyInstance, db: Database): void {
  // Check if required environment variables are set
  const apiKey = process.env.OPENAI_API_KEY;

  /**
   * POST /api/web/fetch-video
   *
   * Fetches video metadata and transcript from YouTube using yt-dlp.
   * Returns video info, transcript, detected factions, and all available factions.
   */
  fastify.post<{ Body: FetchVideoBody }>(
    '/api/web/fetch-video',
    {
      schema: {
        body: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { url } = request.body;

      // Validate URL
      const videoId = extractVideoId(url);
      if (!videoId) {
        return reply.status(400).send({
          error: 'Invalid YouTube URL or video ID',
          details: 'Please provide a valid youtube.com or youtu.be URL',
        });
      }

      // Check if yt-dlp is installed
      if (!isYtDlpInstalled()) {
        return reply.status(500).send({
          error: 'Server configuration error',
          details: 'yt-dlp is not installed on the server',
        });
      }

      try {
        // Extract transcript and video metadata
        const result = await extractTranscript(url);

        // Build video data for faction detection
        const videoData: VideoData = {
          videoId: result.videoId,
          title: result.title,
          channel: result.channel,
          description: result.description,
          chapters: result.chapters,
          transcript: result.segments,
          pinnedComment: null,
        };

        // Detect factions from video metadata
        const detectedFactions = detectFactionNamesFromVideo(videoData);

        return reply.send({
          videoId: result.videoId,
          title: result.title,
          channel: result.channel,
          description: result.description,
          chapters: result.chapters,
          transcript: result.segments,
          duration: result.duration,
          detectedFactions,
          allFactions: ALL_FACTIONS,
        });
      } catch (error) {
        console.error('Error fetching video:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(500).send({
          error: 'Failed to fetch video',
          details: message,
        });
      }
    }
  );

  /**
   * POST /api/web/extract
   *
   * Runs the full extraction pipeline using OpenAI.
   * Requires the user to have selected factions.
   */
  fastify.post<{ Body: ExtractBody }>(
    '/api/web/extract',
    {
      schema: {
        body: {
          type: 'object',
          required: ['url', 'factions'],
          properties: {
            url: { type: 'string' },
            factions: {
              type: 'array',
              items: { type: 'string' },
              minItems: 2,
              maxItems: 2,
            },
            transcript: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  startTime: { type: 'number' },
                  duration: { type: 'number' },
                },
              },
            },
            skipCache: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { url, factions, transcript: providedTranscript, skipCache } = request.body;

      // Check API key
      if (!apiKey) {
        return reply.status(500).send({
          error: 'Server configuration error',
          details: 'OPENAI_API_KEY environment variable is not set',
        });
      }

      // Validate URL
      const videoId = extractVideoId(url);
      if (!videoId) {
        return reply.status(400).send({
          error: 'Invalid YouTube URL or video ID',
        });
      }

      // Validate factions
      const typedFactions = factions as [string, string];
      if (!typedFactions[0] || !typedFactions[1]) {
        return reply.status(400).send({
          error: 'Two factions must be selected',
        });
      }

      try {
        // Sort factions for consistent cache key
        const sortedFactions = [...typedFactions].sort() as [string, string];

        // Check cache first (unless skipCache is set)
        if (!skipCache) {
          const cachedResult = await db
            .select()
            .from(extractionCache)
            .where(
              and(
                eq(extractionCache.videoId, videoId),
                gt(extractionCache.expiresAt, new Date())
              )
            )
            .limit(1);

          if (cachedResult.length > 0) {
          const cached = cachedResult[0]!;
          const cachedFactions = cached.factions as [string, string];
          const sortedCachedFactions = [...cachedFactions].sort();

          // Check if factions match (order-independent)
          if (
            sortedCachedFactions[0] === sortedFactions[0] &&
            sortedCachedFactions[1] === sortedFactions[1]
          ) {
            console.log(`Cache hit for video ${videoId} with factions ${typedFactions.join(', ')}`);

            // Create cache-hit artifact
            const now = Date.now();
            const cacheArtifact: StageArtifact = {
              stage: 0,
              name: 'cache-hit',
              status: 'completed',
              startedAt: now,
              completedAt: now,
              durationMs: 0,
              summary: `Loaded from cache (expires ${cached.expiresAt.toLocaleDateString()})`,
              details: { cachedAt: cached.createdAt?.toISOString() },
            };

            // Return cached report with cache-hit artifact
            const cachedReport = cached.report as Record<string, unknown>;
            return reply.send({
              ...cachedReport,
              artifacts: [cacheArtifact],
            });
          }
        }
        } // end skipCache check

        console.log(`${skipCache ? 'Cache bypassed' : 'Final report cache miss'} for video ${videoId}`);

        // Check AI response cache (allows re-running validation without re-calling OpenAI)
        let cachedAiResponse: string | undefined;
        const aiCacheResult = await db
          .select()
          .from(aiResponseCache)
          .where(
            and(
              eq(aiResponseCache.videoId, videoId),
              eq(aiResponseCache.factions, sortedFactions),
              gt(aiResponseCache.expiresAt, new Date())
            )
          )
          .limit(1);

        if (aiCacheResult.length > 0) {
          cachedAiResponse = aiCacheResult[0]!.rawResponse;
          console.log(`AI response cache hit for video ${videoId} (${cachedAiResponse.length} chars)`);
        } else {
          console.log(`AI response cache miss for video ${videoId} - will call OpenAI`);
        }

        // If transcript not provided, fetch it
        let videoData: VideoData;

        if (providedTranscript && providedTranscript.length > 0) {
          // Use provided transcript (from previous fetch-video call)
          videoData = {
            videoId,
            title: '',
            channel: '',
            description: '',
            chapters: [],
            transcript: providedTranscript,
            pinnedComment: null,
          };

          // Try to get metadata separately
          try {
            const result = await extractTranscript(url);
            videoData.title = result.title;
            videoData.channel = result.channel;
            videoData.description = result.description;
            videoData.chapters = result.chapters;
          } catch {
            // Use minimal metadata if fetch fails
            console.error('Failed to fetch video metadata, using minimal data');
          }
        } else {
          // Fetch fresh transcript
          const result = await extractTranscript(url);
          videoData = {
            videoId: result.videoId,
            title: result.title,
            channel: result.channel,
            description: result.description,
            chapters: result.chapters,
            transcript: result.segments,
            pinnedComment: null,
          };
        }

        // Get unit names for selected factions from the database
        const factionUnitNames = new Map<string, string[]>();
        for (const faction of typedFactions) {
          try {
            const unitNames = await fetchNamesForCategory(db, 'units', faction);
            factionUnitNames.set(faction, unitNames);
            console.log(`Loaded ${unitNames.length} unit names for faction: ${faction}`);
          } catch (error) {
            console.error(`Failed to load unit names for faction ${faction}:`, error);
            factionUnitNames.set(faction, []);
          }
        }

        // Extract battle report using OpenAI with artifact tracking
        const { report, artifacts, rawAiResponse } = await extractBattleReportWithArtifacts({
          videoData,
          factions: typedFactions,
          factionUnitNames,
          apiKey,
          cachedAiResponse,
        });

        // Cache the raw AI response if we didn't use a cached one
        if (!cachedAiResponse && rawAiResponse) {
          try {
            const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
            await db
              .insert(aiResponseCache)
              .values({
                videoId,
                factions: sortedFactions,
                rawResponse: rawAiResponse,
                expiresAt,
              })
              .onConflictDoNothing();
            console.log(`Cached AI response for video ${videoId}`);
          } catch (cacheError) {
            console.error('Failed to cache AI response:', cacheError);
          }
        }

        // Stage 5: Validate units against database
        let stage5: StageArtifact = createStageArtifact(5, 'validate-units');
        const enrichedUnits = await enrichUnitsWithStats(report.units, report.players, db);
        const validatedCount = enrichedUnits.filter(u => u.isValidated).length;
        stage5 = completeStageArtifact(
          stage5,
          `${validatedCount}/${enrichedUnits.length} units validated against database`,
          { validatedCount, totalUnits: enrichedUnits.length }
        );

        // Build final response
        const finalReport = {
          ...report,
          units: enrichedUnits,
        };

        // Write to cache (upsert to handle race conditions)
        try {
          const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
          await db
            .insert(extractionCache)
            .values({
              videoId,
              factions: typedFactions,
              report: finalReport,
              expiresAt,
            })
            .onConflictDoUpdate({
              target: extractionCache.videoId,
              set: {
                factions: typedFactions,
                report: finalReport,
                expiresAt,
                createdAt: new Date(),
              },
            });
          console.log(`Cached extraction result for video ${videoId}`);
        } catch (cacheError) {
          // Log but don't fail the request if caching fails
          console.error('Failed to cache extraction result:', cacheError);
        }

        return reply.send({
          ...finalReport,
          artifacts: [...artifacts, stage5],
        });
      } catch (error) {
        console.error('Error extracting battle report:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(500).send({
          error: 'Failed to extract battle report',
          details: message,
        });
      }
    }
  );

  /**
   * GET /api/web/factions
   *
   * Returns all available factions.
   */
  fastify.get('/api/web/factions', async (_request, reply) => {
    return reply.send({
      factions: ALL_FACTIONS,
    });
  });

  /**
   * GET /api/web/health
   *
   * Health check that verifies yt-dlp and OpenAI are configured.
   */
  fastify.get('/api/web/health', async (_request, reply) => {
    const ytdlpInstalled = isYtDlpInstalled();
    const openaiConfigured = !!apiKey;

    const healthy = ytdlpInstalled && openaiConfigured;

    return reply.status(healthy ? 200 : 503).send({
      status: healthy ? 'healthy' : 'unhealthy',
      checks: {
        ytdlp: ytdlpInstalled ? 'ok' : 'not installed',
        openai: openaiConfigured ? 'ok' : 'OPENAI_API_KEY not set',
      },
    });
  });
}
