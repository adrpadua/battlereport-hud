/**
 * Zustand Store Wrapper for XState Game Machine
 *
 * Provides React-friendly state management by wrapping the XState actor
 * with Zustand, following the existing battle-store.ts patterns.
 */

import { create } from 'zustand';
import { createActor, type Actor } from 'xstate';
import { gameMachine, type GameMachine } from '../machines/game-machine';
import type {
  GameContext,
  GameMachineEvent,
  GameInitInput,
  PlayerIndex,
  TurnPhase,
  BattleRound,
  TrackedUnit,
  GameEvent,
  GameResult,
} from '../types/game-state';

// State value type from XState snapshot
type GameStateValue =
  | 'setup'
  | 'gameOver'
  | { round: { player1Turn: TurnPhase } | { player2Turn: TurnPhase } };

// Store state
interface GameStoreState {
  // XState actor
  actor: Actor<GameMachine> | null;

  // Derived state (subscribed from actor)
  context: GameContext | null;
  stateValue: GameStateValue | null;

  // Convenience getters
  isGameActive: boolean;
  currentPhaseDisplay: string;
  activePlayerName: string;
}

// Store actions
interface GameStoreActions {
  // Initialize/reset
  initialize: (input: GameInitInput) => void;
  reset: () => void;

  // Send events to machine
  send: (event: GameMachineEvent) => void;

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

  // Jump for video seeking
  jumpToPhase: (phase: TurnPhase, round: BattleRound, player: PlayerIndex, videoTimestamp: number) => void;

  // Query methods
  getUnit: (unitId: string) => TrackedUnit | undefined;
  getUnitsForPlayer: (playerIndex: PlayerIndex) => TrackedUnit[];
  getDestroyedUnits: () => TrackedUnit[];
  getEventsInPhase: (round: BattleRound, phase: TurnPhase, playerIndex?: PlayerIndex) => GameEvent[];
}

type GameStore = GameStoreState & GameStoreActions;

// Phase display names
const phaseDisplayNames: Record<TurnPhase, string> = {
  command: 'Command Phase',
  movement: 'Movement Phase',
  shooting: 'Shooting Phase',
  charge: 'Charge Phase',
  fight: 'Fight Phase',
  scoring: 'Scoring',
};

// Helper to extract current phase from state value
const getPhaseFromStateValue = (stateValue: GameStateValue | null): TurnPhase | null => {
  if (!stateValue || typeof stateValue === 'string') return null;

  if ('round' in stateValue) {
    const round = stateValue.round;
    if ('player1Turn' in round) return round.player1Turn;
    if ('player2Turn' in round) return round.player2Turn;
  }
  return null;
};

// Create the store
export const useGameStore = create<GameStore>((set, get) => ({
  // Initial state
  actor: null,
  context: null,
  stateValue: null,
  isGameActive: false,
  currentPhaseDisplay: '',
  activePlayerName: '',

  // Initialize with game input
  initialize: (input: GameInitInput) => {
    const currentActor = get().actor;

    // Stop existing actor if any
    if (currentActor) {
      currentActor.stop();
    }

    // Create new actor
    const actor = createActor(gameMachine, { input });

    // Subscribe to state changes
    actor.subscribe((snapshot) => {
      const context = snapshot.context;
      const stateValue = snapshot.value as GameStateValue;
      const phase = getPhaseFromStateValue(stateValue);

      set({
        context,
        stateValue,
        isGameActive: typeof stateValue !== 'string' || stateValue === 'setup',
        currentPhaseDisplay: phase ? phaseDisplayNames[phase] : (stateValue === 'setup' ? 'Setup' : 'Game Over'),
        activePlayerName: context.players[context.activePlayer].name,
      });
    });

    // Start the actor
    actor.start();

    // Set initial state from the started actor
    const initialSnapshot = actor.getSnapshot();
    const initialContext = initialSnapshot.context;
    const initialStateValue = initialSnapshot.value as GameStateValue;
    const initialPhase = getPhaseFromStateValue(initialStateValue);

    set({
      actor,
      context: initialContext,
      stateValue: initialStateValue,
      isGameActive: true,
      currentPhaseDisplay: initialPhase ? phaseDisplayNames[initialPhase] : 'Setup',
      activePlayerName: initialContext.players[initialContext.activePlayer].name,
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
    });
  },

  // Send event to machine
  send: (event: GameMachineEvent) => {
    const { actor } = get();
    if (actor) {
      actor.send(event);
    }
  },

  // Convenience: Start game
  startGame: (videoTimestamp: number) => {
    get().send({ type: 'START_GAME', videoTimestamp });
  },

  // Convenience: Next phase
  nextPhase: (videoTimestamp: number) => {
    get().send({ type: 'NEXT_PHASE', videoTimestamp });
  },

  // Convenience: End turn
  endTurn: (videoTimestamp: number) => {
    get().send({ type: 'END_TURN', videoTimestamp });
  },

  // Convenience: End round
  endRound: (videoTimestamp: number) => {
    get().send({ type: 'END_ROUND', videoTimestamp });
  },

  // Convenience: End game
  endGame: (result: GameResult, videoTimestamp: number) => {
    get().send({ type: 'END_GAME', result, videoTimestamp });
  },

  // Convenience: Set first player
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

  // Jump for video seeking
  jumpToPhase: (phase: TurnPhase, round: BattleRound, player: PlayerIndex, videoTimestamp: number) => {
    get().send({ type: 'JUMP_TO_PHASE', phase, round, player, videoTimestamp });
  },

  // Query: Get unit by ID
  getUnit: (unitId: string) => {
    const { context } = get();
    return context?.units.get(unitId);
  },

  // Query: Get units for a player
  getUnitsForPlayer: (playerIndex: PlayerIndex) => {
    const { context } = get();
    if (!context) return [];
    return Array.from(context.units.values()).filter((unit) => unit.playerIndex === playerIndex);
  },

  // Query: Get destroyed units
  getDestroyedUnits: () => {
    const { context } = get();
    if (!context) return [];
    return Array.from(context.units.values()).filter((unit) => unit.status.destroyed);
  },

  // Query: Get events in a specific phase
  getEventsInPhase: (round: BattleRound, phase: TurnPhase, playerIndex?: PlayerIndex) => {
    const { context } = get();
    if (!context) return [];

    return context.eventLog.filter((event) => {
      const matchesRound = event.round === round;
      const matchesPhase = event.phase === phase;
      const matchesPlayer = playerIndex === undefined || event.playerIndex === playerIndex;
      return matchesRound && matchesPhase && matchesPlayer;
    });
  },
}));

// Export type for external use
export type { GameStore, GameStoreState, GameStoreActions };
