/**
 * WH40K 10th Edition Game State Types
 *
 * Models the complete game flow structure:
 * - 5 Battle Rounds
 * - 2 Player Turns per round
 * - 5 Phases per turn: Command, Movement, Shooting, Charge, Fight
 * - Scoring after each turn
 */

// Core game structure types
export type GamePhase = 'command' | 'movement' | 'shooting' | 'charge' | 'fight';
export type TurnPhase = GamePhase | 'scoring';
export type PlayerIndex = 0 | 1;
export type BattleRound = 1 | 2 | 3 | 4 | 5;

// Unit tracking during game
export interface UnitStatus {
  destroyed: boolean;
  belowHalfStrength: boolean;
  battleShocked: boolean;
  engaged: boolean;
  // Turn-specific flags (reset each turn)
  advanced: boolean;
  fellBack: boolean;
  hasShot: boolean;
  hasCharged: boolean;
  hasFought: boolean;
}

export interface TrackedUnit {
  id: string; // unique identifier
  name: string;
  playerIndex: PlayerIndex;
  currentWounds?: number;
  maxWounds?: number;
  currentModels?: number;
  maxModels?: number;
  status: UnitStatus;
  destroyedAtTimestamp?: number;
  destroyedAtRound?: BattleRound;
}

// Player state
export interface PlayerGameState {
  index: PlayerIndex;
  name: string;
  faction: string;
  subfaction?: string;  // e.g., "Blood Angels" for Space Marines
  detachment: string;
  commandPoints: number;
  victoryPoints: number;
  isActive: boolean;
  wentFirst: boolean;
}

// Game events with video timestamp correlation
export interface BaseGameEvent {
  id: string;
  videoTimestamp: number;
  round: BattleRound;
  phase: TurnPhase;
  playerIndex: PlayerIndex;
}

export interface MovementEvent extends BaseGameEvent {
  type: 'movement';
  unitId: string;
  movementType: 'normal' | 'advance' | 'fall_back' | 'remain_stationary' | 'reserves';
  distance?: number;
}

export interface ShootingEvent extends BaseGameEvent {
  type: 'shooting';
  attackingUnitId: string;
  targetUnitId: string;
  weaponName?: string;
  hits?: number;
  wounds?: number;
  damageDealt?: number;
  modelsDestroyed?: number;
}

export interface ChargeEvent extends BaseGameEvent {
  type: 'charge';
  chargingUnitId: string;
  targetUnitIds: string[];
  chargeRoll?: number;
  successful: boolean;
}

export interface FightEvent extends BaseGameEvent {
  type: 'fight';
  attackingUnitId: string;
  targetUnitId: string;
  hits?: number;
  wounds?: number;
  damageDealt?: number;
  modelsDestroyed?: number;
}

export interface StratagemEvent extends BaseGameEvent {
  type: 'stratagem';
  stratagemName: string;
  cpCost: number;
  targetUnitIds?: string[];
}

export interface ScoringEvent extends BaseGameEvent {
  type: 'scoring';
  primaryPoints?: number;
  secondaryPoints?: number;
  objectiveName?: string;
  totalPointsGained: number;
}

export interface BattleShockEvent extends BaseGameEvent {
  type: 'battleshock';
  unitId: string;
  testPassed: boolean;
  roll?: number;
}

export interface UnitDestroyedEvent extends BaseGameEvent {
  type: 'unit_destroyed';
  unitId: string;
  destroyedBy?: 'shooting' | 'melee' | 'morale' | 'other';
  destroyingUnitId?: string;
}

export type GameEvent =
  | MovementEvent
  | ShootingEvent
  | ChargeEvent
  | FightEvent
  | StratagemEvent
  | ScoringEvent
  | BattleShockEvent
  | UnitDestroyedEvent;

// Full game context
export interface GameContext {
  currentRound: BattleRound;
  currentPhase: TurnPhase;
  activePlayer: PlayerIndex;
  players: [PlayerGameState, PlayerGameState];
  units: Map<string, TrackedUnit>;
  eventLog: GameEvent[];
  mission?: string;
  gameStartTimestamp?: number;
  gameEnded: boolean;
  result?: GameResult;
}

export interface GameResult {
  winnerIndex: PlayerIndex | null; // null for draw
  player1Score: number;
  player2Score: number;
  endReason?: 'complete' | 'concession' | 'tabled';
}

// State machine events
export type GameMachineEvent =
  // Phase transitions
  | { type: 'NEXT_PHASE'; videoTimestamp: number }
  | { type: 'END_TURN'; videoTimestamp: number }
  | { type: 'END_ROUND'; videoTimestamp: number }
  | { type: 'END_GAME'; result: GameResult; videoTimestamp: number }
  // Jump for video seeking
  | {
      type: 'JUMP_TO_PHASE';
      phase: TurnPhase;
      round: BattleRound;
      player: PlayerIndex;
      videoTimestamp: number;
    }
  // Game setup
  | { type: 'START_GAME'; videoTimestamp: number }
  | { type: 'SET_FIRST_PLAYER'; playerIndex: PlayerIndex }
  // Game actions
  | { type: 'UNIT_MOVED'; event: Omit<MovementEvent, 'id'> }
  | { type: 'UNIT_SHOT'; event: Omit<ShootingEvent, 'id'> }
  | { type: 'UNIT_CHARGED'; event: Omit<ChargeEvent, 'id'> }
  | { type: 'UNIT_FOUGHT'; event: Omit<FightEvent, 'id'> }
  | { type: 'STRATAGEM_USED'; event: Omit<StratagemEvent, 'id'> }
  | { type: 'SCORE_POINTS'; event: Omit<ScoringEvent, 'id'> }
  | { type: 'UNIT_DESTROYED'; event: Omit<UnitDestroyedEvent, 'id'> }
  | { type: 'BATTLESHOCK_TEST'; event: Omit<BattleShockEvent, 'id'> }
  // CP management
  | { type: 'SPEND_CP'; amount: number; playerIndex: PlayerIndex }
  | { type: 'GAIN_CP'; amount: number; playerIndex: PlayerIndex }
  // Unit management
  | { type: 'ADD_UNIT'; unit: Omit<TrackedUnit, 'id'> }
  | { type: 'UPDATE_UNIT'; unitId: string; updates: Partial<TrackedUnit> };

// State value types for the machine
export type GameMachineState =
  | { value: 'setup'; context: GameContext }
  | { value: { round: { player1Turn: TurnPhase } }; context: GameContext }
  | { value: { round: { player2Turn: TurnPhase } }; context: GameContext }
  | { value: 'gameOver'; context: GameContext };

// Initialization input
export interface GameInitInput {
  player1: {
    name: string;
    faction: string;
    detachment: string;
  };
  player2: {
    name: string;
    faction: string;
    detachment: string;
  };
  mission?: string;
  units?: Array<Omit<TrackedUnit, 'id' | 'status'>>;
}

// Display helpers
export const PHASE_DISPLAY_NAMES: Record<TurnPhase, string> = {
  command: 'Command Phase',
  movement: 'Movement Phase',
  shooting: 'Shooting Phase',
  charge: 'Charge Phase',
  fight: 'Fight Phase',
  scoring: 'Scoring',
};

export const PHASE_ORDER: TurnPhase[] = [
  'command',
  'movement',
  'shooting',
  'charge',
  'fight',
  'scoring',
];

// ============================================================================
// CHAPTER APPROVED 2025 - MATCHED PLAY TYPES
// ============================================================================

/**
 * Battle size determines points limit and army construction rules
 */
export type BattleSize = 'incursion' | 'strike_force';

export const BATTLE_SIZE_POINTS: Record<BattleSize, number> = {
  incursion: 1000,
  strike_force: 2000,
};

/**
 * Secondary mission selection type
 * - fixed: Choose 2 secondaries before the game
 * - tactical: Draw from deck during game
 */
export type SecondaryMissionType = 'fixed' | 'tactical';

/**
 * Primary mission card from the Chapter Approved deck
 */
export interface PrimaryMission {
  name: string;
  slug: string;
  description?: string;
  scoringRules: string;
  hasAction?: boolean; // e.g., Terraform
}

/**
 * Secondary mission card
 */
export interface SecondaryMission {
  id: string;
  name: string;
  slug: string;
  category: 'fixed' | 'tactical' | 'both';
  description: string;
  scoringCondition?: string;
  maxPoints?: number;
}

/**
 * Deployment map from the mission deck
 */
export interface DeploymentMap {
  name: string;
  slug: string;
  description?: string;
}

/**
 * Mission rule card that modifies the game
 */
export interface MissionRule {
  name: string;
  slug: string;
  effect: string;
}

/**
 * Challenger card - catch-up mechanic for player trailing by 6+ VP
 * Each card has BOTH a stratagem AND a mission - player chooses one
 */
export interface ChallengerCard {
  id: string;
  name: string;
  // Stratagem option
  stratagem: {
    name: string;
    cpCost: number;
    when: string;
    effect: string;
  };
  // Mission option (score immediately if achieved)
  mission: {
    name: string;
    condition: string;
    points: number;
  };
}

/**
 * Tactical deck state for a player
 */
export interface TacticalDeckState {
  /** Cards remaining in deck (not yet drawn) */
  deckSize: number;
  /** Currently held cards (max 2) */
  hand: SecondaryMission[];
  /** Cards achieved this game */
  achieved: Array<{
    card: SecondaryMission;
    achievedRound: BattleRound;
    pointsScored: number;
  }>;
  /** Cards discarded without achieving */
  discarded: SecondaryMission[];
}

/**
 * Fixed secondary selection for a player
 */
export interface FixedSecondaryState {
  /** The 2 fixed secondaries chosen before the game */
  selected: [SecondaryMission, SecondaryMission] | null;
  /** Progress/points scored on each */
  progress: [number, number];
}

/**
 * Terraform objective state (for Terraform primary mission)
 */
export interface TerraformState {
  /** Map of objective marker ID to controlling player */
  terraformedBy: Map<string, PlayerIndex>;
  /** When each objective was terraformed */
  terraformTimestamps: Map<string, number>;
}

/**
 * Player's Chapter Approved 2025 scoring state
 */
export interface CA2025PlayerScoring {
  /** Primary mission points (scored each turn from Round 2) */
  primaryPoints: number;
  /** Secondary mission points */
  secondaryPoints: number;
  /** Total VP (primary + secondary) */
  totalVP: number;
  /** Challenger card usage */
  challengerUsed: boolean;
  challengerCardPlayed?: {
    card: ChallengerCard;
    chosenOption: 'stratagem' | 'mission';
    round: BattleRound;
  };
}

/**
 * Full Chapter Approved 2025 mission configuration
 */
export interface CA2025MissionConfig {
  battleSize: BattleSize;
  primaryMission: PrimaryMission;
  deploymentMap: DeploymentMap;
  missionRule?: MissionRule;
  secondaryType: SecondaryMissionType;
}

/**
 * Extended player state for Chapter Approved 2025
 */
export interface CA2025PlayerState extends PlayerGameState {
  scoring: CA2025PlayerScoring;
  /** Fixed secondaries (if using fixed mode) */
  fixedSecondaries?: FixedSecondaryState;
  /** Tactical deck (if using tactical mode) */
  tacticalDeck?: TacticalDeckState;
}

/**
 * Extended game context for Chapter Approved 2025
 */
export interface CA2025GameContext extends Omit<GameContext, 'players' | 'eventLog'> {
  /** Chapter Approved mission configuration */
  missionConfig: CA2025MissionConfig;
  /** Extended player states with CA2025 scoring */
  players: [CA2025PlayerState, CA2025PlayerState];
  /** Extended event log including CA2025 events */
  eventLog: ExtendedGameEvent[];
  /** Terraform state (if using Terraform primary) */
  terraform?: TerraformState;
  /** Available Challenger cards */
  challengerDeck: ChallengerCard[];
  /** VP difference threshold for Challenger eligibility */
  challengerThreshold: number; // Default: 6
}

// ============================================================================
// CHAPTER APPROVED 2025 - EVENTS
// ============================================================================

/**
 * Event: Draw a tactical card
 */
export interface DrawTacticalCardEvent extends BaseGameEvent {
  type: 'draw_tactical_card';
  card: SecondaryMission;
}

/**
 * Event: Discard a tactical card
 */
export interface DiscardTacticalCardEvent extends BaseGameEvent {
  type: 'discard_tactical_card';
  card: SecondaryMission;
  /** Gain 1 CP if discarded at end of own turn */
  gainedCP: boolean;
}

/**
 * Event: Achieve a secondary mission
 */
export interface AchieveSecondaryEvent extends BaseGameEvent {
  type: 'achieve_secondary';
  card: SecondaryMission;
  pointsScored: number;
  /** For fixed secondaries, which slot (0 or 1) */
  fixedSlot?: 0 | 1;
}

/**
 * Event: Score primary mission points
 */
export interface ScorePrimaryEvent extends BaseGameEvent {
  type: 'score_primary';
  pointsScored: number;
  /** Objectives held */
  objectivesHeld?: number;
  /** For Terraform: which objectives are terraformed */
  terraformedObjectives?: string[];
}

/**
 * Event: Terraform an objective
 */
export interface TerraformEvent extends BaseGameEvent {
  type: 'terraform';
  objectiveId: string;
  /** Did this flip an opponent's terraform? */
  flippedOpponent: boolean;
}

/**
 * Event: Use a Challenger card
 */
export interface UseChallengerEvent extends BaseGameEvent {
  type: 'use_challenger';
  card: ChallengerCard;
  chosenOption: 'stratagem' | 'mission';
  /** If mission chosen and achieved, points scored */
  missionPointsScored?: number;
}

/**
 * All CA2025 events
 */
export type CA2025Event =
  | DrawTacticalCardEvent
  | DiscardTacticalCardEvent
  | AchieveSecondaryEvent
  | ScorePrimaryEvent
  | TerraformEvent
  | UseChallengerEvent;

/**
 * Extended game event type including CA2025 events
 */
export type ExtendedGameEvent = GameEvent | CA2025Event;

// ============================================================================
// CHAPTER APPROVED 2025 - MACHINE EVENTS
// ============================================================================

/**
 * Extended machine events for Chapter Approved 2025
 */
export type CA2025MachineEvent =
  | GameMachineEvent
  // Mission setup
  | { type: 'SET_MISSION_CONFIG'; config: CA2025MissionConfig }
  | { type: 'SET_FIXED_SECONDARIES'; playerIndex: PlayerIndex; secondaries: [SecondaryMission, SecondaryMission] }
  | { type: 'INITIALIZE_TACTICAL_DECK'; playerIndex: PlayerIndex; deckSize: number }
  // Tactical deck actions
  | { type: 'DRAW_TACTICAL_CARD'; event: Omit<DrawTacticalCardEvent, 'id'> }
  | { type: 'DISCARD_TACTICAL_CARD'; event: Omit<DiscardTacticalCardEvent, 'id'> }
  | { type: 'ACHIEVE_SECONDARY'; event: Omit<AchieveSecondaryEvent, 'id'> }
  // Primary scoring
  | { type: 'SCORE_PRIMARY'; event: Omit<ScorePrimaryEvent, 'id'> }
  // Terraform
  | { type: 'TERRAFORM_OBJECTIVE'; event: Omit<TerraformEvent, 'id'> }
  // Challenger
  | { type: 'USE_CHALLENGER'; event: Omit<UseChallengerEvent, 'id'> }
  | { type: 'CHECK_CHALLENGER_ELIGIBILITY' };

// ============================================================================
// CHAPTER APPROVED 2025 - INITIALIZATION
// ============================================================================

/**
 * Extended initialization input for Chapter Approved 2025 games
 */
export interface CA2025GameInitInput extends GameInitInput {
  missionConfig: CA2025MissionConfig;
  /** Pre-selected fixed secondaries (if using fixed mode) */
  player1FixedSecondaries?: [SecondaryMission, SecondaryMission];
  player2FixedSecondaries?: [SecondaryMission, SecondaryMission];
  /** Challenger cards available (shuffled deck) */
  challengerDeck?: ChallengerCard[];
}

// ============================================================================
// CHAPTER APPROVED 2025 - HELPER CONSTANTS
// ============================================================================

/**
 * Starting CP by battle size (Chapter Approved 2025)
 */
export const STARTING_CP: Record<BattleSize, number> = {
  incursion: 6,
  strike_force: 6,
};

/**
 * Max CP that can be held
 */
export const MAX_CP = 12;

/**
 * VP threshold to become eligible for Challenger cards
 */
export const CHALLENGER_VP_THRESHOLD = 6;

/**
 * Max tactical cards in hand
 */
export const MAX_TACTICAL_HAND_SIZE = 2;

/**
 * Primary mission scoring starts from this round
 */
export const PRIMARY_SCORING_START_ROUND: BattleRound = 2;
