// Re-export game state types
export * from './game-state';

// Re-export unit detail types
export * from './unit-detail';

// Confidence level for extracted data
export type ConfidenceLevel = 'high' | 'medium' | 'low';

// Progress log entry for extraction status
export interface ProgressLogEntry {
  id: string;
  message: string;
  timestamp: number;
  status: 'pending' | 'in-progress' | 'complete' | 'error';
}

// Unit stats from BSData
export interface UnitStats {
  movement: string;
  toughness: number;
  save: string;
  wounds: number;
  leadership: string;
  objectiveControl: number;
}

// Weapon profile from database
export interface WeaponProfile {
  name: string;
  type: 'ranged' | 'melee';
  range: string;
  attacks: string;
  skill: string;
  strength: string;
  ap: string;
  damage: string;
  abilities?: string | null;
}

// Player in a battle report
export interface Player {
  name: string;
  faction: string;
  subfaction?: string;  // e.g., "Blood Angels" for Space Marines, "Ulthwé" for Aeldari
  detachment: string;
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
  weapons?: WeaponProfile[];
  keywords?: string[];
  isValidated?: boolean;
  suggestedMatch?: UnitSuggestion;
  videoTimestamp?: number; // seconds in video when first mentioned
  mentionCount?: number; // how many times mentioned throughout video
}

// Stratagem suggestion for fuzzy matching
export interface StratagemSuggestion {
  name: string;
  confidence: number; // 0-1 fuzzy match score
  cpCost?: string;
  phase?: string;
}

// Stratagem in a battle report
export interface Stratagem {
  name: string;
  playerIndex?: number;
  confidence: ConfidenceLevel;
  videoTimestamp?: number; // seconds in video when used
  // Validation fields (populated by report-processor)
  cpCost?: string;
  phase?: string;
  effect?: string;
  detachment?: string;
  isValidated?: boolean;
  suggestedMatch?: StratagemSuggestion;
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

// Detachment details for display
export interface DetachmentDetails {
  name: string;
  ruleName: string | null;
  rule: string | null;
  faction: string;
}

// Sub-ability within an army rule (e.g., Ka'tah Stances)
export interface ArmyRuleSubAbility {
  name: string;
  lore: string | null;
  effect: string;
}

// Faction details for display
export interface FactionDetails {
  name: string;
  armyRuleName: string | null;
  armyRuleLore: string | null;
  armyRuleEffect: string | null;
  armyRuleSubAbilities: ArmyRuleSubAbility[];
  // Legacy field for backwards compatibility
  armyRule: string | null;
}

// Stratagem details for display
export interface StratagemDetails {
  name: string;
  cpCost: string;
  phase: string;
  when: string | null;
  target: string | null;
  effect: string;
  restrictions: string | null;
  detachment: string | null;
  faction: string | null;
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
  progressLogs: ProgressLogEntry[];
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
  removeUnit: (unitIndex: number) => void;
  acceptSuggestion: (unitIndex: number) => void;
  setPhase: (phase: ExtractionPhase, statusMessage?: string) => void;
  setVideoData: (videoData: VideoData) => void;
  setDetectedFactions: (factions: string[], allFactions: string[]) => void;
  setSelectedFactions: (factions: [string, string]) => void;
  startExtraction: () => void;
  addProgressLog: (message: string, status?: ProgressLogEntry['status']) => string;
  updateProgressLog: (id: string, updates: Partial<ProgressLogEntry>) => void;
  clearProgressLogs: () => void;
}

// Full battle store type
export type BattleStore = BattleState & BattleActions;

// Unit search result from fuzzy search API
export interface UnitSearchResult {
  name: string;
  category: string;
  faction?: string;
  confidence: number;
}

// Unit search modal props
export interface UnitSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery: string;
  faction: string;
  onSelect: (unitName: string) => void;
  onSearch: (query: string, faction: string) => Promise<UnitSearchResult[]>;
}
