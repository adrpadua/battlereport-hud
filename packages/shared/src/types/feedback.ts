// Feedback types for unknown/low-confidence token handling

export type FeedbackEntityType = 'unit' | 'stratagem' | 'faction' | 'detachment';
export type FeedbackStatus = 'pending' | 'resolved' | 'ignored';

/**
 * A single feedback item representing an unknown or low-confidence token
 * that needs user resolution.
 */
export interface FeedbackItem {
  id: string;
  videoId: string;
  originalToken: string;           // Raw extracted text
  entityType: FeedbackEntityType;
  playerIndex?: number;
  transcriptContext: string;       // Surrounding text for context
  videoTimestamp?: number;
  confidenceScore: number;         // 0-1
  suggestions: Array<{ name: string; confidence: number }>;
  status: FeedbackStatus;
  resolvedTo?: string;             // The canonical name after resolution
  factionId?: string;              // Faction context for this item
}

/**
 * A user-defined mapping from a colloquial term to a canonical name.
 * These are persisted and applied in future extractions.
 */
export interface UserMapping {
  id: string;
  alias: string;                   // Colloquial/misspelled term
  canonicalName: string;           // Official name
  entityType: FeedbackEntityType;
  factionId?: string;              // Faction-specific if set
  createdAt: number;               // Unix timestamp
  usageCount: number;              // How many times this mapping has been used
}

/**
 * Result from processing that includes both the enriched unit and
 * any feedback item that should be surfaced to the user.
 */
export interface ValidationWithFeedback<T> {
  result: T;
  feedbackItem?: FeedbackItem;
}
