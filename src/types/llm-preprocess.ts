import type { NormalizedSegment } from '@/background/transcript-preprocessor';

export interface LlmPreprocessResult {
  normalizedSegments: NormalizedSegment[];
  termMappings: Record<string, string>; // colloquial → official
  confidence: number;
  modelUsed: string;
  processedAt: number;
}

export interface CachedPreprocessResult {
  videoId: string;
  result: LlmPreprocessResult;
  cachedAt: number;
}
