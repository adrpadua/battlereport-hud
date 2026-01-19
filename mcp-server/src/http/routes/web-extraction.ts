/**
 * Web extraction API routes for the standalone web app.
 *
 * These endpoints provide video transcript fetching and battle report extraction
 * for the web frontend without requiring the browser extension.
 */

import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/connection.js';
import {
  extractTranscript,
  extractVideoId,
  isYtDlpInstalled,
} from '../../services/youtube-service.js';
import {
  detectFactionNamesFromVideo,
  extractBattleReport,
  ALL_FACTIONS,
  type VideoData,
} from '../../services/extraction-service.js';

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
}

export function registerWebExtractionRoutes(fastify: FastifyInstance, _db: Database): void {
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
          },
        },
      },
    },
    async (request, reply) => {
      const { url, factions, transcript: providedTranscript } = request.body;

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
        // For now, we'll use empty maps - this can be enhanced to query the DB
        const factionUnitNames = new Map<string, string[]>();
        for (const faction of typedFactions) {
          // TODO: Query database for unit names
          // For now, just add empty arrays
          factionUnitNames.set(faction, []);
        }

        // Extract battle report using OpenAI
        const report = await extractBattleReport(
          videoData,
          typedFactions,
          factionUnitNames,
          apiKey
        );

        return reply.send(report);
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
