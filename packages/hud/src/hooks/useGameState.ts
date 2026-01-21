/**
 * React Hooks for Game State Management
 *
 * Provides React-friendly access to the game state machine
 * with video timestamp synchronization.
 */

import { useMemo } from 'react';
import { useGameStore } from '../store/game-store';
import {
  getEventsNearTimestamp,
  getGameStateAtTimestamp,
  getGameStateSummary,
  findUnitByName,
  getBattleShockedUnits,
  getEngagedUnits,
} from '../utils/game-state-integration';
import type {
  TurnPhase,
  BattleRound,
  PlayerIndex,
  GameEvent,
} from '../types/game-state';

/**
 * Main hook for accessing and controlling game state
 */
export function useGameState() {
  const {
    context,
    stateValue,
    isGameActive,
    currentPhaseDisplay,
    activePlayerName,
    send,
    initialize,
    reset,
    startGame,
    nextPhase,
    endTurn,
    endRound,
    endGame,
    setFirstPlayer,
    addUnit,
    updateUnit,
    spendCP,
    gainCP,
    jumpToPhase,
    getUnit,
    getUnitsForPlayer,
    getDestroyedUnits: getDestroyedUnitsFromStore,
    getEventsInPhase,
  } = useGameStore();

  // Compute game summary
  const gameSummary = useMemo(() => {
    if (!context) return null;
    return getGameStateSummary(context);
  }, [context]);

  // Get current player info
  const currentPlayer = useMemo(() => {
    if (!context) return null;
    return context.players[context.activePlayer];
  }, [context]);

  // Get both players
  const players = useMemo(() => {
    if (!context) return null;
    return context.players;
  }, [context]);

  return {
    // State
    context,
    stateValue,
    isGameActive,
    currentPhaseDisplay,
    activePlayerName,
    gameSummary,
    currentPlayer,
    players,

    // Actions
    send,
    initialize,
    reset,
    startGame,
    nextPhase,
    endTurn,
    endRound,
    endGame,
    setFirstPlayer,
    addUnit,
    updateUnit,
    spendCP,
    gainCP,
    jumpToPhase,

    // Queries
    getUnit,
    getUnitsForPlayer,
    getDestroyedUnits: getDestroyedUnitsFromStore,
    getEventsInPhase,
  };
}

/**
 * Hook for getting events near a video timestamp
 * Useful for showing "what's happening now" during playback
 */
export function useEventsAtTimestamp(
  videoTimestamp: number,
  windowSeconds: number = 5
) {
  const context = useGameStore((state) => state.context);

  const events = useMemo(() => {
    if (!context) return [];
    return getEventsNearTimestamp(context, videoTimestamp, windowSeconds);
  }, [context, videoTimestamp, windowSeconds]);

  return events;
}

/**
 * Hook for syncing game state with video timestamp
 * Returns the game state that should be displayed at the current video time
 */
export function useGameStateAtTimestamp(videoTimestamp: number) {
  const context = useGameStore((state) => state.context);

  const stateAtTimestamp = useMemo(() => {
    if (!context) return null;
    return getGameStateAtTimestamp(context, videoTimestamp);
  }, [context, videoTimestamp]);

  return stateAtTimestamp;
}

/**
 * Hook for getting player stats
 */
export function usePlayerStats(playerIndex: PlayerIndex) {
  const context = useGameStore((state) => state.context);

  const stats = useMemo(() => {
    if (!context) {
      return {
        name: '',
        faction: '',
        detachment: undefined,
        commandPoints: 0,
        victoryPoints: 0,
        isActive: false,
        unitsTotal: 0,
        unitsRemaining: 0,
        unitsLost: 0,
      };
    }

    const player = context.players[playerIndex];
    const units = Array.from(context.units.values()).filter(
      (u) => u.playerIndex === playerIndex
    );
    const lostUnits = units.filter((u) => u.status.destroyed);

    return {
      name: player.name,
      faction: player.faction,
      detachment: player.detachment,
      commandPoints: player.commandPoints,
      victoryPoints: player.victoryPoints,
      isActive: player.isActive,
      unitsTotal: units.length,
      unitsRemaining: units.length - lostUnits.length,
      unitsLost: lostUnits.length,
    };
  }, [context, playerIndex]);

  return stats;
}

/**
 * Hook for getting unit status by name
 */
export function useUnitByName(name: string, playerIndex?: PlayerIndex) {
  const context = useGameStore((state) => state.context);

  const unit = useMemo(() => {
    if (!context || !name) return undefined;
    return findUnitByName(context, name, playerIndex);
  }, [context, name, playerIndex]);

  return unit;
}

/**
 * Hook for getting all battleshocked units
 */
export function useBattleShockedUnits() {
  const context = useGameStore((state) => state.context);

  const units = useMemo(() => {
    if (!context) return [];
    return getBattleShockedUnits(context);
  }, [context]);

  return units;
}

/**
 * Hook for getting all engaged units (in melee)
 */
export function useEngagedUnits() {
  const context = useGameStore((state) => state.context);

  const units = useMemo(() => {
    if (!context) return [];
    return getEngagedUnits(context);
  }, [context]);

  return units;
}

/**
 * Hook for getting the current round number and phase
 */
export function useCurrentRoundAndPhase() {
  const context = useGameStore((state) => state.context);

  return useMemo(() => {
    if (!context) {
      return { round: 1 as BattleRound, phase: 'command' as TurnPhase };
    }
    return {
      round: context.currentRound,
      phase: context.currentPhase,
    };
  }, [context]);
}

/**
 * Hook for getting the event log
 */
export function useEventLog() {
  const context = useGameStore((state) => state.context);

  return useMemo(() => {
    if (!context) return [];
    return context.eventLog;
  }, [context]);
}

/**
 * Hook for getting events of a specific type
 */
export function useEventsByType<T extends GameEvent['type']>(
  type: T
): Extract<GameEvent, { type: T }>[] {
  const context = useGameStore((state) => state.context);

  return useMemo(() => {
    if (!context) return [];
    return context.eventLog.filter(
      (event): event is Extract<GameEvent, { type: T }> => event.type === type
    );
  }, [context, type]);
}

/**
 * Hook for tracking if we're in a specific phase
 */
export function useIsInPhase(phase: TurnPhase) {
  const context = useGameStore((state) => state.context);

  return useMemo(() => {
    if (!context) return false;
    return context.currentPhase === phase;
  }, [context, phase]);
}

/**
 * Hook for getting command point counts for both players
 */
export function useCommandPoints() {
  const context = useGameStore((state) => state.context);

  return useMemo(() => {
    if (!context) {
      return { player1: 0, player2: 0 };
    }
    return {
      player1: context.players[0].commandPoints,
      player2: context.players[1].commandPoints,
    };
  }, [context]);
}

/**
 * Hook for getting victory point counts for both players
 */
export function useVictoryPoints() {
  const context = useGameStore((state) => state.context);

  return useMemo(() => {
    if (!context) {
      return { player1: 0, player2: 0 };
    }
    return {
      player1: context.players[0].victoryPoints,
      player2: context.players[1].victoryPoints,
    };
  }, [context]);
}
