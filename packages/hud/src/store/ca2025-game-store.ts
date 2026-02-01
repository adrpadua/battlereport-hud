/**
 * Zustand Store Wrapper for Chapter Approved 2025 Game Machine
 *
 * Provides React-friendly state management for CA2025 matched play games.
 */

import { create } from 'zustand';
import { createActor, type Actor } from 'xstate';
import { ca2025GameMachine, type CA2025GameMachine } from '../machines/ca2025-game-machine';
import type {
  CA2025GameContext,
  CA2025MachineEvent,
  CA2025GameInitInput,
  CA2025PlayerState,
  CA2025MissionConfig,
  PlayerIndex,
  TurnPhase,
  BattleRound,
  TrackedUnit,
  GameResult,
  SecondaryMission,
  ChallengerCard,
} from '../types/game-state';
import { phaseDisplayNames, getPhaseFromStateValue } from './game-store-utils';

// State value type from XState snapshot
type CA2025StateValue =
  | 'setup'
  | 'gameOver'
  | { round: { player1Turn: TurnPhase } | { player2Turn: TurnPhase } };

// Store state
interface CA2025StoreState {
  // XState actor
  actor: Actor<CA2025GameMachine> | null;

  // Derived state (subscribed from actor)
  context: CA2025GameContext | null;
  stateValue: CA2025StateValue | null;

  // Convenience getters
  isGameActive: boolean;
  currentPhaseDisplay: string;
  activePlayerName: string;

  // CA2025 specific
  missionConfig: CA2025MissionConfig | null;
  isChallengerEligible: boolean;
}

// Store actions
interface CA2025StoreActions {
  // Initialize/reset
  initialize: (input: CA2025GameInitInput) => void;
  reset: () => void;

  // Send events to machine
  send: (event: CA2025MachineEvent) => void;

  // Convenience methods
  startGame: (videoTimestamp: number) => void;
  nextPhase: (videoTimestamp: number) => void;
  endTurn: (videoTimestamp: number) => void;
  endRound: (videoTimestamp: number) => void;
  endGame: (result: GameResult, videoTimestamp: number) => void;
  setFirstPlayer: (playerIndex: PlayerIndex) => void;

  // Unit management
  addUnit: (unit: Omit<TrackedUnit, 'id' | 'status'>) => void;
  updateUnit: (unitId: string, updates: Partial<TrackedUnit>) => void;

  // CP management
  spendCP: (amount: number, playerIndex: PlayerIndex) => void;
  gainCP: (amount: number, playerIndex: PlayerIndex) => void;

  // CA2025 specific actions
  setMissionConfig: (config: CA2025MissionConfig) => void;
  setFixedSecondaries: (playerIndex: PlayerIndex, secondaries: [SecondaryMission, SecondaryMission]) => void;
  initializeTacticalDeck: (playerIndex: PlayerIndex, deckSize: number) => void;

  // Tactical card actions
  drawTacticalCard: (playerIndex: PlayerIndex, card: SecondaryMission, round: BattleRound, phase: TurnPhase, videoTimestamp: number) => void;
  discardTacticalCard: (playerIndex: PlayerIndex, card: SecondaryMission, gainCP: boolean, round: BattleRound, phase: TurnPhase, videoTimestamp: number) => void;
  achieveSecondary: (playerIndex: PlayerIndex, card: SecondaryMission, points: number, round: BattleRound, phase: TurnPhase, videoTimestamp: number, fixedSlot?: 0 | 1) => void;

  // Primary scoring
  scorePrimary: (playerIndex: PlayerIndex, points: number, round: BattleRound, videoTimestamp: number, objectivesHeld?: number) => void;

  // Terraform
  terraformObjective: (playerIndex: PlayerIndex, objectiveId: string, flippedOpponent: boolean, round: BattleRound, phase: TurnPhase, videoTimestamp: number) => void;

  // Challenger
  useChallenger: (playerIndex: PlayerIndex, card: ChallengerCard, chosenOption: 'stratagem' | 'mission', round: BattleRound, phase: TurnPhase, videoTimestamp: number, missionPoints?: number) => void;

  // Query methods
  getUnit: (unitId: string) => TrackedUnit | undefined;
  getUnitsForPlayer: (playerIndex: PlayerIndex) => TrackedUnit[];
  getDestroyedUnits: () => TrackedUnit[];
  getPlayerScoring: (playerIndex: PlayerIndex) => CA2025PlayerState['scoring'] | null;
  getTacticalHand: (playerIndex: PlayerIndex) => SecondaryMission[];
  checkChallengerEligibility: (playerIndex: PlayerIndex) => boolean;
}

type CA2025Store = CA2025StoreState & CA2025StoreActions;

// Helper to check Challenger eligibility
const checkEligibility = (context: CA2025GameContext | null, playerIndex: PlayerIndex): boolean => {
  if (!context) return false;

  const player = context.players[playerIndex];
  const opponent = context.players[playerIndex === 0 ? 1 : 0];

  const vpDiff = opponent.scoring.totalVP - player.scoring.totalVP;
  if (vpDiff < context.challengerThreshold) return false;
  if (player.scoring.challengerUsed) return false;
  if (context.challengerDeck.length === 0) return false;

  return true;
};

// Create the store
export const useCA2025GameStore = create<CA2025Store>((set, get) => ({
  // Initial state
  actor: null,
  context: null,
  stateValue: null,
  isGameActive: false,
  currentPhaseDisplay: '',
  activePlayerName: '',
  missionConfig: null,
  isChallengerEligible: false,

  // Initialize with game input
  initialize: (input: CA2025GameInitInput) => {
    const currentActor = get().actor;

    // Stop existing actor if any
    if (currentActor) {
      currentActor.stop();
    }

    // Create new actor
    const actor = createActor(ca2025GameMachine, { input });

    // Subscribe to state changes
    actor.subscribe((snapshot) => {
      const context = snapshot.context;
      const stateValue = snapshot.value as CA2025StateValue;
      const phase = getPhaseFromStateValue(stateValue);

      set({
        context,
        stateValue,
        isGameActive: typeof stateValue !== 'string' || stateValue === 'setup',
        currentPhaseDisplay: phase ? phaseDisplayNames[phase] : (stateValue === 'setup' ? 'Setup' : 'Game Over'),
        activePlayerName: context.players[context.activePlayer].name,
        missionConfig: context.missionConfig,
        isChallengerEligible: checkEligibility(context, context.activePlayer),
      });
    });

    // Start the actor
    actor.start();

    // Set initial state
    const initialSnapshot = actor.getSnapshot();
    const initialContext = initialSnapshot.context;
    const initialStateValue = initialSnapshot.value as CA2025StateValue;
    const initialPhase = getPhaseFromStateValue(initialStateValue);

    set({
      actor,
      context: initialContext,
      stateValue: initialStateValue,
      isGameActive: true,
      currentPhaseDisplay: initialPhase ? phaseDisplayNames[initialPhase] : 'Setup',
      activePlayerName: initialContext.players[initialContext.activePlayer].name,
      missionConfig: initialContext.missionConfig,
      isChallengerEligible: false,
    });
  },

  // Reset to initial state
  reset: () => {
    const currentActor = get().actor;
    if (currentActor) {
      currentActor.stop();
    }

    set({
      actor: null,
      context: null,
      stateValue: null,
      isGameActive: false,
      currentPhaseDisplay: '',
      activePlayerName: '',
      missionConfig: null,
      isChallengerEligible: false,
    });
  },

  // Send event to machine
  send: (event: CA2025MachineEvent) => {
    const { actor } = get();
    if (actor) {
      actor.send(event);
    }
  },

  // Convenience methods
  startGame: (videoTimestamp: number) => {
    get().send({ type: 'START_GAME', videoTimestamp });
  },

  nextPhase: (videoTimestamp: number) => {
    get().send({ type: 'NEXT_PHASE', videoTimestamp });
  },

  endTurn: (videoTimestamp: number) => {
    get().send({ type: 'END_TURN', videoTimestamp });
  },

  endRound: (videoTimestamp: number) => {
    get().send({ type: 'END_ROUND', videoTimestamp });
  },

  endGame: (result: GameResult, videoTimestamp: number) => {
    get().send({ type: 'END_GAME', result, videoTimestamp });
  },

  setFirstPlayer: (playerIndex: PlayerIndex) => {
    get().send({ type: 'SET_FIRST_PLAYER', playerIndex });
  },

  // Unit management
  addUnit: (unit: Omit<TrackedUnit, 'id' | 'status'>) => {
    get().send({ type: 'ADD_UNIT', unit: unit as Omit<TrackedUnit, 'id'> });
  },

  updateUnit: (unitId: string, updates: Partial<TrackedUnit>) => {
    get().send({ type: 'UPDATE_UNIT', unitId, updates });
  },

  // CP management
  spendCP: (amount: number, playerIndex: PlayerIndex) => {
    get().send({ type: 'SPEND_CP', amount, playerIndex });
  },

  gainCP: (amount: number, playerIndex: PlayerIndex) => {
    get().send({ type: 'GAIN_CP', amount, playerIndex });
  },

  // CA2025 specific
  setMissionConfig: (config: CA2025MissionConfig) => {
    get().send({ type: 'SET_MISSION_CONFIG', config });
  },

  setFixedSecondaries: (playerIndex: PlayerIndex, secondaries: [SecondaryMission, SecondaryMission]) => {
    get().send({ type: 'SET_FIXED_SECONDARIES', playerIndex, secondaries });
  },

  initializeTacticalDeck: (playerIndex: PlayerIndex, deckSize: number) => {
    get().send({ type: 'INITIALIZE_TACTICAL_DECK', playerIndex, deckSize });
  },

  drawTacticalCard: (playerIndex, card, round, phase, videoTimestamp) => {
    get().send({
      type: 'DRAW_TACTICAL_CARD',
      event: { type: 'draw_tactical_card', playerIndex, card, round, phase, videoTimestamp },
    });
  },

  discardTacticalCard: (playerIndex, card, gainedCP, round, phase, videoTimestamp) => {
    get().send({
      type: 'DISCARD_TACTICAL_CARD',
      event: { type: 'discard_tactical_card', playerIndex, card, gainedCP, round, phase, videoTimestamp },
    });
  },

  achieveSecondary: (playerIndex, card, pointsScored, round, phase, videoTimestamp, fixedSlot) => {
    get().send({
      type: 'ACHIEVE_SECONDARY',
      event: { type: 'achieve_secondary', playerIndex, card, pointsScored, round, phase, videoTimestamp, fixedSlot },
    });
  },

  scorePrimary: (playerIndex, pointsScored, round, videoTimestamp, objectivesHeld) => {
    get().send({
      type: 'SCORE_PRIMARY',
      event: { type: 'score_primary', playerIndex, pointsScored, round, phase: 'scoring', videoTimestamp, objectivesHeld },
    });
  },

  terraformObjective: (playerIndex, objectiveId, flippedOpponent, round, phase, videoTimestamp) => {
    get().send({
      type: 'TERRAFORM_OBJECTIVE',
      event: { type: 'terraform', playerIndex, objectiveId, flippedOpponent, round, phase, videoTimestamp },
    });
  },

  useChallenger: (playerIndex, card, chosenOption, round, phase, videoTimestamp, missionPointsScored) => {
    get().send({
      type: 'USE_CHALLENGER',
      event: { type: 'use_challenger', playerIndex, card, chosenOption, round, phase, videoTimestamp, missionPointsScored },
    });
  },

  // Query methods
  getUnit: (unitId: string) => {
    const { context } = get();
    return context?.units.get(unitId);
  },

  getUnitsForPlayer: (playerIndex: PlayerIndex) => {
    const { context } = get();
    if (!context) return [];
    return Array.from(context.units.values()).filter((unit) => unit.playerIndex === playerIndex);
  },

  getDestroyedUnits: () => {
    const { context } = get();
    if (!context) return [];
    return Array.from(context.units.values()).filter((unit) => unit.status.destroyed);
  },

  getPlayerScoring: (playerIndex: PlayerIndex) => {
    const { context } = get();
    if (!context) return null;
    return context.players[playerIndex].scoring;
  },

  getTacticalHand: (playerIndex: PlayerIndex) => {
    const { context } = get();
    if (!context) return [];
    const player = context.players[playerIndex];
    return player.tacticalDeck?.hand ?? [];
  },

  checkChallengerEligibility: (playerIndex: PlayerIndex) => {
    const { context } = get();
    return checkEligibility(context, playerIndex);
  },
}));

export type { CA2025Store, CA2025StoreState, CA2025StoreActions };
