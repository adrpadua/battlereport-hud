import type { VideoData } from './youtube';
import type { BattleReport } from './battle-report';
import type { StageArtifact } from '@/background/preprocessing/types';

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
  | 'API_KEY_RESULT'
  // Video data (transcript) caching
  | 'GET_CACHED_VIDEO_DATA'
  | 'VIDEO_DATA_HIT'
  | 'VIDEO_DATA_MISS'
  | 'CACHE_VIDEO_DATA'
  | 'VIDEO_DATA_CACHED'
  // Phased extraction messages
  | 'DETECT_FACTIONS'
  | 'FACTIONS_DETECTED'
  | 'EXTRACT_WITH_FACTIONS'
  // Legacy enhanced pipeline messages (deprecated, use EXTRACT_WITH_FACTIONS instead)
  | 'EXTRACT_ENHANCED'
  | 'ENHANCED_EXTRACTION_RESULT';

export interface ExtractBattleReportMessage {
  type: 'EXTRACT_BATTLE_REPORT';
  payload: VideoData;
}

export interface ExtractionResultPayload {
  report: BattleReport;
  artifacts?: StageArtifact[];
}

export interface ExtractionResultMessage {
  type: 'EXTRACTION_RESULT';
  payload: ExtractionResultPayload;
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
  payload: ExtractionResultPayload;
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

// Video data (transcript) caching messages

export interface GetCachedVideoDataMessage {
  type: 'GET_CACHED_VIDEO_DATA';
  payload: { videoId: string };
}

export interface VideoDataHitMessage {
  type: 'VIDEO_DATA_HIT';
  payload: VideoData;
}

export interface VideoDataMissMessage {
  type: 'VIDEO_DATA_MISS';
}

export interface CacheVideoDataMessage {
  type: 'CACHE_VIDEO_DATA';
  payload: VideoData;
}

export interface VideoDataCachedMessage {
  type: 'VIDEO_DATA_CACHED';
  payload: { success: boolean };
}

// Phased extraction messages

export interface DetectFactionsMessage {
  type: 'DETECT_FACTIONS';
  payload: VideoData;
}

export interface FactionsDetectedMessage {
  type: 'FACTIONS_DETECTED';
  payload: {
    detectedFactions: string[];
    allFactions: string[];
  };
}

export interface ExtractWithFactionsMessage {
  type: 'EXTRACT_WITH_FACTIONS';
  payload: {
    videoData: VideoData;
    factions: [string, string];
  };
}

// Enhanced pipeline messages (deprecated, use EXTRACT_WITH_FACTIONS instead)

/**
 * @deprecated Use ExtractWithFactionsMessage instead. EXTRACT_ENHANCED now returns
 * EXTRACTION_RESULT with BattleReport for backwards compatibility.
 */
export interface ExtractEnhancedMessage {
  type: 'EXTRACT_ENHANCED';
  payload: {
    videoData: VideoData;
    factions: [string, string];
  };
}

/**
 * @deprecated Use ExtractionResultMessage instead. This message type is no longer
 * returned by the message handler.
 */
export interface EnhancedExtractionResultMessage {
  type: 'ENHANCED_EXTRACTION_RESULT';
  payload: BattleReport; // Changed from EnhancedExtractionResult for backwards compat
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
  | ApiKeyResultMessage
  | GetCachedVideoDataMessage
  | VideoDataHitMessage
  | VideoDataMissMessage
  | CacheVideoDataMessage
  | VideoDataCachedMessage
  | DetectFactionsMessage
  | FactionsDetectedMessage
  | ExtractWithFactionsMessage
  | ExtractEnhancedMessage
  | EnhancedExtractionResultMessage;
