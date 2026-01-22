/**
 * API client for the MCP server web extraction endpoints.
 */

import type { TranscriptSegment, Chapter, BattleReport } from '@battlereport/hud';

const API_BASE_URL = 'http://localhost:40401';

/**
 * Stage artifact from the extraction pipeline.
 */
export interface StageArtifact {
  stage: number;
  name: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  summary: string;
  details?: Record<string, unknown>;
  error?: string;
}

export interface FetchVideoResponse {
  videoId: string;
  title: string;
  channel: string;
  description: string;
  chapters: Chapter[];
  transcript: TranscriptSegment[];
  duration: number;
  detectedFactions: string[];
  allFactions: string[];
}

export interface ExtractResponse extends BattleReport {
  artifacts?: StageArtifact[];
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  checks: {
    ytdlp: string;
    openai: string;
  };
}

export interface ApiError {
  error: string;
  details?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data as ApiError;
      throw new Error(error.details || error.error || 'Unknown error');
    }

    return data as T;
  }

  /**
   * Check server health.
   */
  async checkHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/api/web/health');
  }

  /**
   * Fetch video metadata and transcript.
   */
  async fetchVideo(url: string): Promise<FetchVideoResponse> {
    return this.request<FetchVideoResponse>('/api/web/fetch-video', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  /**
   * Extract battle report from video.
   */
  async extractBattleReport(
    url: string,
    factions: [string, string],
    transcript?: TranscriptSegment[]
  ): Promise<ExtractResponse> {
    return this.request<ExtractResponse>('/api/web/extract', {
      method: 'POST',
      body: JSON.stringify({
        url,
        factions,
        transcript,
      }),
    });
  }

  /**
   * Get all available factions.
   */
  async getFactions(): Promise<{ factions: string[] }> {
    return this.request<{ factions: string[] }>('/api/web/factions');
  }
}

export const api = new ApiClient();
