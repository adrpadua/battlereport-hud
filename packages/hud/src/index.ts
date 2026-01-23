// Components
export { HudContainer } from './components/HudContainer';
export { PlayerCard } from './components/PlayerCard';
export { FactionCard } from './components/FactionCard';
export { UnitList } from './components/UnitList';
export { UnitCell } from './components/UnitCell';
export { StratagemList } from './components/StratagemList';
export { StratagemCard } from './components/StratagemCard';
export { EnhancementList } from './components/EnhancementList';
export { FactionSelector } from './components/FactionSelector';
export { ConfidenceBadge } from './components/ConfidenceBadge';
export { LoadingState } from './components/LoadingState';
export { ProgressLogs } from './components/ProgressLogs';
export { UnitDetailModal } from './components/UnitDetailModal';

// Store
export { useBattleStore } from './store/battle-store';
export { useGameStore } from './store/game-store';
export type { GameStore, GameStoreState, GameStoreActions } from './store/game-store';
export { useCA2025GameStore } from './store/ca2025-game-store';
export type { CA2025Store, CA2025StoreState, CA2025StoreActions } from './store/ca2025-game-store';

// State Machine
export { gameMachine, type GameMachine } from './machines/game-machine';
export { ca2025GameMachine, type CA2025GameMachine } from './machines/ca2025-game-machine';

// Hooks
export {
  useGameState,
  useEventsAtTimestamp,
  useGameStateAtTimestamp,
  usePlayerStats,
  useUnitByName,
  useBattleShockedUnits,
  useEngagedUnits,
  useCurrentRoundAndPhase,
  useEventLog,
  useEventsByType,
  useIsInPhase,
  useCommandPoints,
  useVictoryPoints,
} from './hooks/useGameState';
export { useExpandable } from './hooks/useExpandable';

// Utilities
export {
  initializeGameFromReport,
  getGameStateAtTimestamp,
  getEventsNearTimestamp,
  getEventsForPhase,
  getDestroyedUnits,
  getDestroyedUnitsForPlayer,
  getSurvivingUnitsForPlayer,
  getBattleShockedUnits,
  getEngagedUnits,
  calculatePointsLost,
  getGameStateSummary,
  findUnitByName,
  getEventCounts,
  getEventsByRound,
} from './utils/game-state-integration';

// Types
export type {
  // Battle report types
  ConfidenceLevel,
  UnitStats,
  WeaponProfile,
  Player,
  UnitSuggestion,
  Unit,
  Stratagem,
  StratagemSuggestion,
  Enhancement,
  BattleReport,
  Chapter,
  TranscriptSegment,
  VideoData,
  ExtractionPhase,
  BattleState,
  BattleActions,
  BattleStore,
  ProgressLogEntry,
  // Card details types
  DetachmentDetails,
  FactionDetails,
  StratagemDetails,
  // Unit search types
  UnitSearchResult,
  UnitSearchModalProps,
  // Unit detail types
  UnitDetailResponse,
  UnitDetailUnit,
  UnitDetailStats,
  UnitDetailWeapon,
  UnitDetailAbility,
  // Game state types
  GamePhase,
  TurnPhase,
  PlayerIndex,
  BattleRound,
  UnitStatus,
  TrackedUnit,
  PlayerGameState,
  BaseGameEvent,
  MovementEvent,
  ShootingEvent,
  ChargeEvent,
  FightEvent,
  StratagemEvent,
  ScoringEvent,
  BattleShockEvent,
  UnitDestroyedEvent,
  GameEvent,
  GameContext,
  GameResult,
  GameMachineEvent,
  GameMachineState,
  GameInitInput,
  // Chapter Approved 2025 types
  BattleSize,
  SecondaryMissionType,
  PrimaryMission,
  SecondaryMission,
  DeploymentMap,
  MissionRule,
  ChallengerCard,
  TacticalDeckState,
  FixedSecondaryState,
  TerraformState,
  CA2025PlayerScoring,
  CA2025MissionConfig,
  CA2025PlayerState,
  CA2025GameContext,
  DrawTacticalCardEvent,
  DiscardTacticalCardEvent,
  AchieveSecondaryEvent,
  ScorePrimaryEvent,
  TerraformEvent,
  UseChallengerEvent,
  CA2025Event,
  ExtendedGameEvent,
  CA2025MachineEvent,
  CA2025GameInitInput,
} from './types';

// Re-export constants
export {
  PHASE_DISPLAY_NAMES,
  PHASE_ORDER,
  BATTLE_SIZE_POINTS,
  STARTING_CP,
  MAX_CP,
  CHALLENGER_VP_THRESHOLD,
  MAX_TACTICAL_HAND_SIZE,
  PRIMARY_SCORING_START_ROUND,
} from './types/game-state';
