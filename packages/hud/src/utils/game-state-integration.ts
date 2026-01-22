/**
 * Game State Integration Utilities
 *
 * Helper functions for integrating the game state machine with
 * battle reports and video timestamps.
 */

import type { BattleReport } from '../types';
import type {
  GameContext,
  GameInitInput,
  TrackedUnit,
  PlayerIndex,
  BattleRound,
  TurnPhase,
  GameEvent,
} from '../types/game-state';

/**
 * Create initial game input from a battle report
 */
export function initializeGameFromReport(report: BattleReport): GameInitInput {
  const [player1, player2] = report.players;

  // Convert battle report units to tracked units
  const units: Array<Omit<TrackedUnit, 'id' | 'status'>> = report.units.map((unit) => ({
    name: unit.name,
    playerIndex: unit.playerIndex as PlayerIndex,
    maxWounds: unit.stats?.wounds,
    currentWounds: unit.stats?.wounds,
    // Note: Model count would need to be inferred from unit data if available
  }));

  return {
    player1: {
      name: player1?.name ?? 'Player 1',
      faction: player1?.faction ?? 'Unknown',
      detachment: player1?.detachment ?? 'Unknown',
    },
    player2: {
      name: player2?.name ?? 'Player 2',
      faction: player2?.faction ?? 'Unknown',
      detachment: player2?.detachment ?? 'Unknown',
    },
    mission: report.mission,
    units,
  };
}

/**
 * Find the game state at a specific video timestamp
 *
 * Returns the most recent phase/round/turn that was active at the given timestamp
 * based on logged events.
 */
export function getGameStateAtTimestamp(
  context: GameContext,
  timestamp: number
): {
  round: BattleRound;
  phase: TurnPhase;
  playerIndex: PlayerIndex;
} | null {
  // Find the most recent event before or at this timestamp
  const eventsBeforeTimestamp = context.eventLog
    .filter((event) => event.videoTimestamp <= timestamp)
    .sort((a, b) => b.videoTimestamp - a.videoTimestamp);

  if (eventsBeforeTimestamp.length === 0) {
    // No events yet, return starting state
    return {
      round: 1,
      phase: 'command',
      playerIndex: context.players[0].wentFirst ? 0 : 1,
    };
  }

  const mostRecent = eventsBeforeTimestamp[0];
  return {
    round: mostRecent.round,
    phase: mostRecent.phase,
    playerIndex: mostRecent.playerIndex,
  };
}

/**
 * Get all events within a time window around a timestamp
 * Useful for showing "what's happening now" during video playback
 */
export function getEventsNearTimestamp(
  context: GameContext,
  timestamp: number,
  windowSeconds: number = 5
): GameEvent[] {
  const minTime = timestamp - windowSeconds;
  const maxTime = timestamp + windowSeconds;

  return context.eventLog.filter(
    (event) => event.videoTimestamp >= minTime && event.videoTimestamp <= maxTime
  );
}

/**
 * Get events for a specific phase
 */
export function getEventsForPhase(
  context: GameContext,
  round: BattleRound,
  phase: TurnPhase,
  playerIndex?: PlayerIndex
): GameEvent[] {
  return context.eventLog.filter((event) => {
    const matchesRound = event.round === round;
    const matchesPhase = event.phase === phase;
    const matchesPlayer = playerIndex === undefined || event.playerIndex === playerIndex;
    return matchesRound && matchesPhase && matchesPlayer;
  });
}

/**
 * Get all destroyed units
 */
export function getDestroyedUnits(context: GameContext): TrackedUnit[] {
  return Array.from(context.units.values()).filter((unit) => unit.status.destroyed);
}

/**
 * Get destroyed units for a specific player
 */
export function getDestroyedUnitsForPlayer(
  context: GameContext,
  playerIndex: PlayerIndex
): TrackedUnit[] {
  return Array.from(context.units.values()).filter(
    (unit) => unit.status.destroyed && unit.playerIndex === playerIndex
  );
}

/**
 * Get surviving units for a player
 */
export function getSurvivingUnitsForPlayer(
  context: GameContext,
  playerIndex: PlayerIndex
): TrackedUnit[] {
  return Array.from(context.units.values()).filter(
    (unit) => !unit.status.destroyed && unit.playerIndex === playerIndex
  );
}

/**
 * Get units that are battleshocked
 */
export function getBattleShockedUnits(context: GameContext): TrackedUnit[] {
  return Array.from(context.units.values()).filter(
    (unit) => unit.status.battleShocked && !unit.status.destroyed
  );
}

/**
 * Get units that are currently engaged in combat
 */
export function getEngagedUnits(context: GameContext): TrackedUnit[] {
  return Array.from(context.units.values()).filter(
    (unit) => unit.status.engaged && !unit.status.destroyed
  );
}

/**
 * Calculate total points destroyed for a player (units they lost)
 * Note: Requires pointsCost to be set on units
 */
export function calculatePointsLost(
  context: GameContext,
  playerIndex: PlayerIndex,
  unitPointsMap?: Map<string, number>
): number {
  const destroyedUnits = getDestroyedUnitsForPlayer(context, playerIndex);

  return destroyedUnits.reduce((total, unit) => {
    const points = unitPointsMap?.get(unit.name) ?? 0;
    return total + points;
  }, 0);
}

/**
 * Get a summary of the current game state for display
 */
export function getGameStateSummary(context: GameContext): {
  round: BattleRound;
  phase: TurnPhase;
  activePlayer: string;
  player1: {
    name: string;
    faction: string;
    cp: number;
    vp: number;
    unitsRemaining: number;
    unitsLost: number;
  };
  player2: {
    name: string;
    faction: string;
    cp: number;
    vp: number;
    unitsRemaining: number;
    unitsLost: number;
  };
} {
  const player1Units = Array.from(context.units.values()).filter((u) => u.playerIndex === 0);
  const player2Units = Array.from(context.units.values()).filter((u) => u.playerIndex === 1);

  const player1Lost = player1Units.filter((u) => u.status.destroyed).length;
  const player2Lost = player2Units.filter((u) => u.status.destroyed).length;

  return {
    round: context.currentRound,
    phase: context.currentPhase,
    activePlayer: context.players[context.activePlayer].name,
    player1: {
      name: context.players[0].name,
      faction: context.players[0].faction,
      cp: context.players[0].commandPoints,
      vp: context.players[0].victoryPoints,
      unitsRemaining: player1Units.length - player1Lost,
      unitsLost: player1Lost,
    },
    player2: {
      name: context.players[1].name,
      faction: context.players[1].faction,
      cp: context.players[1].commandPoints,
      vp: context.players[1].victoryPoints,
      unitsRemaining: player2Units.length - player2Lost,
      unitsLost: player2Lost,
    },
  };
}

/**
 * Find a unit by name (case-insensitive partial match)
 */
export function findUnitByName(
  context: GameContext,
  name: string,
  playerIndex?: PlayerIndex
): TrackedUnit | undefined {
  const normalizedName = name.toLowerCase().trim();

  for (const unit of context.units.values()) {
    if (playerIndex !== undefined && unit.playerIndex !== playerIndex) {
      continue;
    }

    if (unit.name.toLowerCase().includes(normalizedName)) {
      return unit;
    }
  }

  return undefined;
}

/**
 * Get the total event count by type
 */
export function getEventCounts(context: GameContext): Record<GameEvent['type'], number> {
  const counts: Record<GameEvent['type'], number> = {
    movement: 0,
    shooting: 0,
    charge: 0,
    fight: 0,
    stratagem: 0,
    scoring: 0,
    battleshock: 0,
    unit_destroyed: 0,
  };

  for (const event of context.eventLog) {
    counts[event.type]++;
  }

  return counts;
}

/**
 * Get events grouped by round
 */
export function getEventsByRound(context: GameContext): Map<BattleRound, GameEvent[]> {
  const byRound = new Map<BattleRound, GameEvent[]>();

  for (let round = 1; round <= 5; round++) {
    byRound.set(round as BattleRound, []);
  }

  for (const event of context.eventLog) {
    const events = byRound.get(event.round) ?? [];
    events.push(event);
    byRound.set(event.round, events);
  }

  return byRound;
}
