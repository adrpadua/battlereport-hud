/**
 * Shared utilities for XState-backed game stores.
 *
 * Both game-store.ts and ca2025-game-store.ts duplicate these helpers.
 * Centralizing them here keeps the stores focused on their machine-specific logic.
 */
import type { TurnPhase } from '../types/game-state';

/** Human-readable display names for turn phases. */
export const phaseDisplayNames: Record<TurnPhase, string> = {
  command: 'Command Phase',
  movement: 'Movement Phase',
  shooting: 'Shooting Phase',
  charge: 'Charge Phase',
  fight: 'Fight Phase',
  scoring: 'Scoring',
};

/** State value shape shared by both game machines. */
type StateValueWithRound =
  | string
  | { round: { player1Turn: TurnPhase } | { player2Turn: TurnPhase } };

/** Extract the current TurnPhase from an XState state value. */
export const getPhaseFromStateValue = (stateValue: StateValueWithRound | null): TurnPhase | null => {
  if (!stateValue || typeof stateValue === 'string') return null;

  if ('round' in stateValue) {
    const round = stateValue.round;
    if ('player1Turn' in round) return round.player1Turn;
    if ('player2Turn' in round) return round.player2Turn;
  }
  return null;
};
