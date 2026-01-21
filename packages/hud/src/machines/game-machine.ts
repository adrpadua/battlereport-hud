/**
 * WH40K 10th Edition Game State Machine
 *
 * State hierarchy:
 * setup → round → gameOver
 *           │
 *           ├── player1Turn
 *           │   └── command → movement → shooting → charge → fight → scoring
 *           │
 *           └── player2Turn
 *               └── command → movement → shooting → charge → fight → scoring
 */

import { setup, assign } from 'xstate';
import type {
  GameContext,
  GameMachineEvent,
  GameInitInput,
  PlayerIndex,
  BattleRound,
  TurnPhase,
  TrackedUnit,
  UnitStatus,
  GameEvent,
} from '../types/game-state';

// Helper to generate unique IDs
const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// Default unit status
const createDefaultUnitStatus = (): UnitStatus => ({
  destroyed: false,
  belowHalfStrength: false,
  battleShocked: false,
  engaged: false,
  advanced: false,
  fellBack: false,
  hasShot: false,
  hasCharged: false,
  hasFought: false,
});

// Create initial context from input
const createInitialContext = (input: GameInitInput): GameContext => {
  const units = new Map<string, TrackedUnit>();

  // Add units if provided
  if (input.units) {
    for (const unit of input.units) {
      const id = generateId();
      units.set(id, {
        ...unit,
        id,
        status: createDefaultUnitStatus(),
      });
    }
  }

  return {
    currentRound: 1,
    currentPhase: 'command',
    activePlayer: 0,
    players: [
      {
        index: 0,
        name: input.player1.name,
        faction: input.player1.faction,
        detachment: input.player1.detachment,
        commandPoints: 0, // Starts at 0, gains +1 on first command phase
        victoryPoints: 0,
        isActive: true,
        wentFirst: true,
      },
      {
        index: 1,
        name: input.player2.name,
        faction: input.player2.faction,
        detachment: input.player2.detachment,
        commandPoints: 0,
        victoryPoints: 0,
        isActive: false,
        wentFirst: false,
      },
    ],
    units,
    eventLog: [],
    mission: input.mission,
    gameEnded: false,
  };
};

// Phase order for transitions
const phaseOrder: TurnPhase[] = ['command', 'movement', 'shooting', 'charge', 'fight', 'scoring'];

const getNextPhase = (currentPhase: TurnPhase): TurnPhase | null => {
  const currentIndex = phaseOrder.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex === phaseOrder.length - 1) {
    return null; // End of turn
  }
  return phaseOrder[currentIndex + 1];
};

// Setup the machine with types and actions
// Note: gameMachineSetup is not exported to avoid TypeScript serialization issues
const gameMachineSetup = setup({
  types: {
    context: {} as GameContext,
    events: {} as GameMachineEvent,
    input: {} as GameInitInput,
  },
  actions: {
    // Gain command point on command phase entry
    gainCommandPoint: assign({
      players: ({ context }) => {
        const newPlayers = [...context.players] as [typeof context.players[0], typeof context.players[1]];
        newPlayers[context.activePlayer] = {
          ...newPlayers[context.activePlayer],
          commandPoints: newPlayers[context.activePlayer].commandPoints + 1,
        };
        return newPlayers;
      },
    }),

    // Spend CP
    spendCP: assign({
      players: ({ context, event }) => {
        if (event.type !== 'SPEND_CP') return context.players;
        const newPlayers = [...context.players] as [typeof context.players[0], typeof context.players[1]];
        newPlayers[event.playerIndex] = {
          ...newPlayers[event.playerIndex],
          commandPoints: Math.max(0, newPlayers[event.playerIndex].commandPoints - event.amount),
        };
        return newPlayers;
      },
    }),

    // Gain CP (from abilities/stratagems)
    gainCP: assign({
      players: ({ context, event }) => {
        if (event.type !== 'GAIN_CP') return context.players;
        const newPlayers = [...context.players] as [typeof context.players[0], typeof context.players[1]];
        newPlayers[event.playerIndex] = {
          ...newPlayers[event.playerIndex],
          commandPoints: newPlayers[event.playerIndex].commandPoints + event.amount,
        };
        return newPlayers;
      },
    }),

    // Set first player
    setFirstPlayer: assign({
      players: ({ context, event }) => {
        if (event.type !== 'SET_FIRST_PLAYER') return context.players;
        const newPlayers = [...context.players] as [typeof context.players[0], typeof context.players[1]];
        newPlayers[0] = { ...newPlayers[0], wentFirst: event.playerIndex === 0 };
        newPlayers[1] = { ...newPlayers[1], wentFirst: event.playerIndex === 1 };
        return newPlayers;
      },
      activePlayer: ({ event }) => {
        if (event.type !== 'SET_FIRST_PLAYER') return 0;
        return event.playerIndex;
      },
    }),

    // Advance to next phase
    advancePhase: assign({
      currentPhase: ({ context }) => {
        const next = getNextPhase(context.currentPhase);
        return next ?? context.currentPhase;
      },
    }),

    // Switch active player
    switchPlayer: assign({
      activePlayer: ({ context }) => (context.activePlayer === 0 ? 1 : 0) as PlayerIndex,
      players: ({ context }) => {
        const newPlayers = [...context.players] as [typeof context.players[0], typeof context.players[1]];
        newPlayers[0] = { ...newPlayers[0], isActive: context.activePlayer === 1 };
        newPlayers[1] = { ...newPlayers[1], isActive: context.activePlayer === 0 };
        return newPlayers;
      },
    }),

    // Reset to command phase for new turn
    resetToCommandPhase: assign({
      currentPhase: () => 'command' as TurnPhase,
    }),

    // Advance round
    advanceRound: assign({
      currentRound: ({ context }) => {
        const nextRound = context.currentRound + 1;
        return (nextRound <= 5 ? nextRound : 5) as BattleRound;
      },
    }),

    // Reset unit turn-specific flags at turn end
    resetUnitTurnFlags: assign({
      units: ({ context }) => {
        const newUnits = new Map(context.units);
        for (const [id, unit] of newUnits) {
          newUnits.set(id, {
            ...unit,
            status: {
              ...unit.status,
              advanced: false,
              fellBack: false,
              hasShot: false,
              hasCharged: false,
              hasFought: false,
            },
          });
        }
        return newUnits;
      },
    }),

    // Log game event
    logEvent: assign({
      eventLog: ({ context, event }) => {
        let newEvent: GameEvent | null = null;
        const id = generateId();

        switch (event.type) {
          case 'UNIT_MOVED':
            newEvent = { ...event.event, id } as GameEvent;
            break;
          case 'UNIT_SHOT':
            newEvent = { ...event.event, id } as GameEvent;
            break;
          case 'UNIT_CHARGED':
            newEvent = { ...event.event, id } as GameEvent;
            break;
          case 'UNIT_FOUGHT':
            newEvent = { ...event.event, id } as GameEvent;
            break;
          case 'STRATAGEM_USED':
            newEvent = { ...event.event, id } as GameEvent;
            break;
          case 'SCORE_POINTS':
            newEvent = { ...event.event, id } as GameEvent;
            break;
          case 'UNIT_DESTROYED':
            newEvent = { ...event.event, id } as GameEvent;
            break;
          case 'BATTLESHOCK_TEST':
            newEvent = { ...event.event, id } as GameEvent;
            break;
        }

        if (newEvent) {
          return [...context.eventLog, newEvent];
        }
        return context.eventLog;
      },
    }),

    // Update unit status based on events
    updateUnitFromEvent: assign({
      units: ({ context, event }) => {
        const newUnits = new Map(context.units);

        switch (event.type) {
          case 'UNIT_MOVED': {
            const unit = newUnits.get(event.event.unitId);
            if (unit) {
              newUnits.set(event.event.unitId, {
                ...unit,
                status: {
                  ...unit.status,
                  advanced: event.event.movementType === 'advance',
                  fellBack: event.event.movementType === 'fall_back',
                },
              });
            }
            break;
          }
          case 'UNIT_SHOT': {
            const unit = newUnits.get(event.event.attackingUnitId);
            if (unit) {
              newUnits.set(event.event.attackingUnitId, {
                ...unit,
                status: { ...unit.status, hasShot: true },
              });
            }
            break;
          }
          case 'UNIT_CHARGED': {
            const unit = newUnits.get(event.event.chargingUnitId);
            if (unit && event.event.successful) {
              newUnits.set(event.event.chargingUnitId, {
                ...unit,
                status: { ...unit.status, hasCharged: true, engaged: true },
              });
            }
            break;
          }
          case 'UNIT_FOUGHT': {
            const unit = newUnits.get(event.event.attackingUnitId);
            if (unit) {
              newUnits.set(event.event.attackingUnitId, {
                ...unit,
                status: { ...unit.status, hasFought: true },
              });
            }
            break;
          }
          case 'BATTLESHOCK_TEST': {
            const unit = newUnits.get(event.event.unitId);
            if (unit) {
              newUnits.set(event.event.unitId, {
                ...unit,
                status: { ...unit.status, battleShocked: !event.event.testPassed },
              });
            }
            break;
          }
          case 'UNIT_DESTROYED': {
            const unit = newUnits.get(event.event.unitId);
            if (unit) {
              newUnits.set(event.event.unitId, {
                ...unit,
                status: { ...unit.status, destroyed: true },
                destroyedAtTimestamp: event.event.videoTimestamp,
                destroyedAtRound: event.event.round,
              });
            }
            break;
          }
        }

        return newUnits;
      },
    }),

    // Add unit to tracking
    addUnit: assign({
      units: ({ context, event }) => {
        if (event.type !== 'ADD_UNIT') return context.units;
        const newUnits = new Map(context.units);
        const id = generateId();
        newUnits.set(id, {
          ...event.unit,
          id,
          status: event.unit.status ?? createDefaultUnitStatus(),
        } as TrackedUnit);
        return newUnits;
      },
    }),

    // Update existing unit
    updateUnit: assign({
      units: ({ context, event }) => {
        if (event.type !== 'UPDATE_UNIT') return context.units;
        const newUnits = new Map(context.units);
        const unit = newUnits.get(event.unitId);
        if (unit) {
          newUnits.set(event.unitId, { ...unit, ...event.updates });
        }
        return newUnits;
      },
    }),

    // Update VP from scoring event
    updateVictoryPoints: assign({
      players: ({ context, event }) => {
        if (event.type !== 'SCORE_POINTS') return context.players;
        const newPlayers = [...context.players] as [typeof context.players[0], typeof context.players[1]];
        newPlayers[event.event.playerIndex] = {
          ...newPlayers[event.event.playerIndex],
          victoryPoints: newPlayers[event.event.playerIndex].victoryPoints + event.event.totalPointsGained,
        };
        return newPlayers;
      },
    }),

    // Spend CP from stratagem
    spendCPFromStratagem: assign({
      players: ({ context, event }) => {
        if (event.type !== 'STRATAGEM_USED') return context.players;
        const newPlayers = [...context.players] as [typeof context.players[0], typeof context.players[1]];
        newPlayers[event.event.playerIndex] = {
          ...newPlayers[event.event.playerIndex],
          commandPoints: Math.max(0, newPlayers[event.event.playerIndex].commandPoints - event.event.cpCost),
        };
        return newPlayers;
      },
    }),

    // Set game start timestamp
    setGameStartTimestamp: assign({
      gameStartTimestamp: ({ event }) => {
        if (event.type === 'START_GAME') {
          return event.videoTimestamp;
        }
        return undefined;
      },
    }),

    // End game
    endGame: assign({
      gameEnded: () => true,
      result: ({ event }) => {
        if (event.type === 'END_GAME') {
          return event.result;
        }
        return undefined;
      },
    }),

    // Jump to specific game state (for video seeking)
    jumpToState: assign(({ event }) => {
      if (event.type !== 'JUMP_TO_PHASE') return {};
      return {
        currentRound: event.round,
        currentPhase: event.phase,
        activePlayer: event.player,
        players: undefined, // Keep existing
      };
    }),
  },
  guards: {
    isEndOfTurn: ({ context }) => context.currentPhase === 'scoring',
    isEndOfRound: ({ context }) =>
      context.currentPhase === 'scoring' && context.activePlayer === 1,
    isEndOfGame: ({ context }) =>
      context.currentRound === 5 &&
      context.currentPhase === 'scoring' &&
      context.activePlayer === 1,
    canAdvancePhase: ({ context }) => {
      const next = getNextPhase(context.currentPhase);
      return next !== null;
    },
  },
});

// Create the game machine
export const gameMachine = gameMachineSetup.createMachine({
  id: 'wh40kGame',
  context: ({ input }) => createInitialContext(input),
  initial: 'setup',
  states: {
    setup: {
      on: {
        SET_FIRST_PLAYER: {
          actions: 'setFirstPlayer',
        },
        START_GAME: {
          target: 'round',
          actions: 'setGameStartTimestamp',
        },
        ADD_UNIT: {
          actions: 'addUnit',
        },
      },
    },
    round: {
      initial: 'player1Turn',
      states: {
        player1Turn: {
          initial: 'command',
          entry: ['switchPlayer', 'resetToCommandPhase'],
          states: {
            command: {
              entry: 'gainCommandPoint',
              on: {
                NEXT_PHASE: { target: 'movement', actions: 'advancePhase' },
                BATTLESHOCK_TEST: { actions: ['logEvent', 'updateUnitFromEvent'] },
                STRATAGEM_USED: { actions: ['logEvent', 'spendCPFromStratagem'] },
              },
            },
            movement: {
              on: {
                NEXT_PHASE: { target: 'shooting', actions: 'advancePhase' },
                UNIT_MOVED: { actions: ['logEvent', 'updateUnitFromEvent'] },
                STRATAGEM_USED: { actions: ['logEvent', 'spendCPFromStratagem'] },
              },
            },
            shooting: {
              on: {
                NEXT_PHASE: { target: 'charge', actions: 'advancePhase' },
                UNIT_SHOT: { actions: ['logEvent', 'updateUnitFromEvent'] },
                UNIT_DESTROYED: { actions: ['logEvent', 'updateUnitFromEvent'] },
                STRATAGEM_USED: { actions: ['logEvent', 'spendCPFromStratagem'] },
              },
            },
            charge: {
              on: {
                NEXT_PHASE: { target: 'fight', actions: 'advancePhase' },
                UNIT_CHARGED: { actions: ['logEvent', 'updateUnitFromEvent'] },
                STRATAGEM_USED: { actions: ['logEvent', 'spendCPFromStratagem'] },
              },
            },
            fight: {
              on: {
                NEXT_PHASE: { target: 'scoring', actions: 'advancePhase' },
                UNIT_FOUGHT: { actions: ['logEvent', 'updateUnitFromEvent'] },
                UNIT_DESTROYED: { actions: ['logEvent', 'updateUnitFromEvent'] },
                STRATAGEM_USED: { actions: ['logEvent', 'spendCPFromStratagem'] },
              },
            },
            scoring: {
              on: {
                SCORE_POINTS: { actions: ['logEvent', 'updateVictoryPoints'] },
                END_TURN: {
                  target: '#wh40kGame.round.player2Turn',
                  actions: 'resetUnitTurnFlags',
                },
              },
            },
          },
        },
        player2Turn: {
          initial: 'command',
          entry: ['switchPlayer', 'resetToCommandPhase'],
          states: {
            command: {
              entry: 'gainCommandPoint',
              on: {
                NEXT_PHASE: { target: 'movement', actions: 'advancePhase' },
                BATTLESHOCK_TEST: { actions: ['logEvent', 'updateUnitFromEvent'] },
                STRATAGEM_USED: { actions: ['logEvent', 'spendCPFromStratagem'] },
              },
            },
            movement: {
              on: {
                NEXT_PHASE: { target: 'shooting', actions: 'advancePhase' },
                UNIT_MOVED: { actions: ['logEvent', 'updateUnitFromEvent'] },
                STRATAGEM_USED: { actions: ['logEvent', 'spendCPFromStratagem'] },
              },
            },
            shooting: {
              on: {
                NEXT_PHASE: { target: 'charge', actions: 'advancePhase' },
                UNIT_SHOT: { actions: ['logEvent', 'updateUnitFromEvent'] },
                UNIT_DESTROYED: { actions: ['logEvent', 'updateUnitFromEvent'] },
                STRATAGEM_USED: { actions: ['logEvent', 'spendCPFromStratagem'] },
              },
            },
            charge: {
              on: {
                NEXT_PHASE: { target: 'fight', actions: 'advancePhase' },
                UNIT_CHARGED: { actions: ['logEvent', 'updateUnitFromEvent'] },
                STRATAGEM_USED: { actions: ['logEvent', 'spendCPFromStratagem'] },
              },
            },
            fight: {
              on: {
                NEXT_PHASE: { target: 'scoring', actions: 'advancePhase' },
                UNIT_FOUGHT: { actions: ['logEvent', 'updateUnitFromEvent'] },
                UNIT_DESTROYED: { actions: ['logEvent', 'updateUnitFromEvent'] },
                STRATAGEM_USED: { actions: ['logEvent', 'spendCPFromStratagem'] },
              },
            },
            scoring: {
              on: {
                SCORE_POINTS: { actions: ['logEvent', 'updateVictoryPoints'] },
                END_ROUND: [
                  {
                    guard: 'isEndOfGame',
                    target: '#wh40kGame.gameOver',
                    actions: 'resetUnitTurnFlags',
                  },
                  {
                    target: '#wh40kGame.round.player1Turn',
                    actions: ['resetUnitTurnFlags', 'advanceRound'],
                  },
                ],
              },
            },
          },
        },
      },
      on: {
        // Global events that can happen in any phase
        SPEND_CP: { actions: 'spendCP' },
        GAIN_CP: { actions: 'gainCP' },
        ADD_UNIT: { actions: 'addUnit' },
        UPDATE_UNIT: { actions: 'updateUnit' },
        JUMP_TO_PHASE: { actions: 'jumpToState' },
        END_GAME: {
          target: 'gameOver',
          actions: 'endGame',
        },
      },
    },
    gameOver: {
      type: 'final',
      entry: assign({ gameEnded: () => true }),
    },
  },
});

export type GameMachine = typeof gameMachine;
