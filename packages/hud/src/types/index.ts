// Confidence level for extracted data
export type ConfidenceLevel = 'high' | 'medium' | 'low';

// Unit stats from BSData
export interface UnitStats {
  movement: string;
  toughness: number;
  save: string;
  wounds: number;
  leadership: string;
  objectiveControl: number;
}

// Weapon profile from BSData
export interface WeaponProfile {
  name: string;
  type: 'ranged' | 'melee';
  range: string;
  attacks: string;
  skill: string;
  strength: number;
  ap: number;
  damage: string;
  keywords?: string[];
}

// Player in a battle report
export interface Player {
  name: string;
  faction: string;
  detachment?: string;
  confidence: ConfidenceLevel;
}

// Unit suggestion for fuzzy matching
export interface UnitSuggestion {
  name: string;
  confidence: number; // 0-1 fuzzy match score
  stats?: UnitStats;
  keywords?: string[];
  pointsCost?: number;
}

// Unit in a battle report
export interface Unit {
  name: string;
  playerIndex: number; // 0 or 1
  confidence: ConfidenceLevel;
  pointsCost?: number;
  stats?: UnitStats;
  keywords?: string[];
  isValidated?: boolean;
  suggestedMatch?: UnitSuggestion;
  videoTimestamp?: number; // seconds in video when first mentioned
}

// Stratagem in a battle report
export interface Stratagem {
  name: string;
  playerIndex?: number;
  confidence: ConfidenceLevel;
  videoTimestamp?: number; // seconds in video when used
}

// Enhancement in a battle report
export interface Enhancement {
  name: string;
  playerIndex?: number;
  pointsCost?: number;
  detachment?: string;
  confidence: ConfidenceLevel;
  videoTimestamp?: number; // seconds in video when mentioned
}

// Complete battle report
export interface BattleReport {
  players: [Player, Player] | [Player];
  units: Unit[];
  stratagems: Stratagem[];
  enhancements?: Enhancement[];
  mission?: string;
  pointsLimit?: number;
  extractedAt: number; // timestamp
}

// Video chapter
export interface Chapter {
  title: string;
  startTime: number; // seconds
}

// Transcript segment
export interface TranscriptSegment {
  text: string;
  startTime: number; // seconds
  duration: number;
}

// Video data for extraction
export interface VideoData {
  videoId: string;
  title: string;
  channel: string;
  description: string;
  chapters: Chapter[];
  transcript: TranscriptSegment[];
  pinnedComment: string | null;
}

// Extraction phases
export type ExtractionPhase =
  | 'idle'           // Ready to extract
  | 'extracting'     // Getting video data
  | 'faction-select' // Waiting for user faction confirmation
  | 'preprocessing'  // Running preprocessor
  | 'ai-extracting'  // Calling OpenAI
  | 'complete'       // Showing results
  | 'error';         // Error state

// Battle state for the store
export interface BattleState {
  report: BattleReport | null;
  loading: boolean;
  error: string | null;
  videoId: string | null;
  isExpanded: boolean;
  phase: ExtractionPhase;
  statusMessage: string;
  videoData: VideoData | null;
  detectedFactions: string[];
  selectedFactions: [string, string] | null;
  allFactions: string[];
}

// Battle store actions
export interface BattleActions {
  setReport: (report: BattleReport, videoId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setVideoId: (videoId: string | null) => void;
  toggleExpanded: () => void;
  reset: () => void;
  updateUnit: (unitIndex: number, updates: Partial<Unit>) => void;
  acceptSuggestion: (unitIndex: number) => void;
  setPhase: (phase: ExtractionPhase, statusMessage?: string) => void;
  setVideoData: (videoData: VideoData) => void;
  setDetectedFactions: (factions: string[], allFactions: string[]) => void;
  setSelectedFactions: (factions: [string, string]) => void;
  startExtraction: () => void;
}

// Full battle store type
export type BattleStore = BattleState & BattleActions;
