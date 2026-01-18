import type { VideoData } from './youtube';
import type { BattleReport } from './battle-report';

// Message types for communication between content script and service worker

export type MessageType =
  | 'EXTRACT_BATTLE_REPORT'
  | 'EXTRACTION_RESULT'
  | 'EXTRACTION_ERROR'
  | 'GET_CACHED_REPORT'
  | 'CACHE_HIT'
  | 'CACHE_MISS'
  | 'CLEAR_CACHE'
  | 'CLEAR_CACHE_RESULT'
  | 'GET_API_KEY'
  | 'API_KEY_RESULT';

export interface ExtractBattleReportMessage {
  type: 'EXTRACT_BATTLE_REPORT';
  payload: VideoData;
}

export interface ExtractionResultMessage {
  type: 'EXTRACTION_RESULT';
  payload: BattleReport;
}

export interface ExtractionErrorMessage {
  type: 'EXTRACTION_ERROR';
  payload: { error: string };
}

export interface GetCachedReportMessage {
  type: 'GET_CACHED_REPORT';
  payload: { videoId: string };
}

export interface CacheHitMessage {
  type: 'CACHE_HIT';
  payload: BattleReport;
}

export interface CacheMissMessage {
  type: 'CACHE_MISS';
}

export interface GetApiKeyMessage {
  type: 'GET_API_KEY';
}

export interface ApiKeyResultMessage {
  type: 'API_KEY_RESULT';
  payload: { apiKey: string | null };
}

export interface ClearCacheMessage {
  type: 'CLEAR_CACHE';
  payload: { videoId: string };
}

export interface ClearCacheResultMessage {
  type: 'CLEAR_CACHE_RESULT';
  payload: { success: boolean };
}

export type Message =
  | ExtractBattleReportMessage
  | ExtractionResultMessage
  | ExtractionErrorMessage
  | GetCachedReportMessage
  | CacheHitMessage
  | CacheMissMessage
  | ClearCacheMessage
  | ClearCacheResultMessage
  | GetApiKeyMessage
  | ApiKeyResultMessage;
