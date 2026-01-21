/**
 * Chapter Approved 2025 Game State Machine
 *
 * Extends the base WH40K game machine with matched play rules:
 * - Primary/Secondary mission scoring
 * - Tactical card deck mechanics
 * - Challenger cards (catch-up mechanic)
 * - Terraform objectives
 */

import { setup, assign } from 'xstate';
import type {
  CA2025GameContext,
  CA2025MachineEvent,
  CA2025GameInitInput,
  CA2025PlayerState,
  CA2025PlayerScoring,
  PlayerIndex,
  BattleRound,
  TurnPhase,
  TrackedUnit,
  UnitStatus,
  ExtendedGameEvent,
  SecondaryMission,
  TacticalDeckState,
  FixedSecondaryState,
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

// Default CA2025 player scoring
const createDefaultScoring = (): CA2025PlayerScoring => ({
  primaryPoints: 0,
  secondaryPoints: 0,
  totalVP: 0,
  challengerUsed: false,
});

// Default tactical deck state
const createDefaultTacticalDeck = (deckSize: number = 12): TacticalDeckState => ({
  deckSize,
  hand: [],
  achieved: [],
  discarded: [],
});

// Default fixed secondary state
const createDefaultFixedSecondaries = (): FixedSecondaryState => ({
  selected: null,
  progress: [0, 0],
});

// Create initial CA2025 context from input
const createCA2025InitialContext = (input: CA2025GameInitInput): CA2025GameContext => {
  const units = new Map<string, TrackedUnit>();
  const startingCP = 6; // CA2025 starting CP

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

  // Create player states based on secondary type
  const createPlayerState = (
    index: PlayerIndex,
    playerInput: { name: string; faction: string; detachment?: string },
    fixedSecondaries?: [SecondaryMission, SecondaryMission]
  ): CA2025PlayerState => {
    const base: CA2025PlayerState = {
      index,
      name: playerInput.name,
      faction: playerInput.faction,
      detachment: playerInput.detachment,
      commandPoints: startingCP,
      victoryPoints: 0,
      isActive: index === 0,
      wentFirst: index === 0,
      scoring: createDefaultScoring(),
    };

    if (input.missionConfig.secondaryType === 'tactical') {
      base.tacticalDeck = createDefaultTacticalDeck();
    } else {
      base.fixedSecondaries = createDefaultFixedSecondaries();
      if (fixedSecondaries) {
        base.fixedSecondaries.selected = fixedSecondaries;
      }
    }

    return base;
  };

  return {
    currentRound: 1,
    currentPhase: 'command',
    activePlayer: 0,
    players: [
      createPlayerState(0, input.player1, input.player1FixedSecondaries),
      createPlayerState(1, input.player2, input.player2FixedSecondaries),
    ],
    units,
    eventLog: [],
    mission: input.missionConfig.primaryMission.name,
    gameEnded: false,
    missionConfig: input.missionConfig,
    terraform: input.missionConfig.primaryMission.hasAction
      ? { terraformedBy: new Map(), terraformTimestamps: new Map() }
      : undefined,
    challengerDeck: input.challengerDeck ?? [],
    challengerThreshold: 6,
  };
};

// Phase order for transitions
const phaseOrder: TurnPhase[] = ['command', 'movement', 'shooting', 'charge', 'fight', 'scoring'];

const getNextPhase = (currentPhase: TurnPhase): TurnPhase | null => {
  const currentIndex = phaseOrder.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex === phaseOrder.length - 1) {
    return null;
  }
  return phaseOrder[currentIndex + 1];
};

// Helper to check Challenger eligibility
const isEligibleForChallenger = (context: CA2025GameContext, playerIndex: PlayerIndex): boolean => {
  const player = context.players[playerIndex];
  const opponent = context.players[playerIndex === 0 ? 1 : 0];

  // Must be trailing by threshold VP
  const vpDiff = opponent.scoring.totalVP - player.scoring.totalVP;
  if (vpDiff < context.challengerThreshold) return false;

  // Must not have used a Challenger this game
  if (player.scoring.challengerUsed) return false;

  // Must have Challenger cards available
  if (context.challengerDeck.length === 0) return false;

  return true;
};

// Setup the CA2025 machine
const ca2025MachineSetup = setup({
  types: {
    context: {} as CA2025GameContext,
    events: {} as CA2025MachineEvent,
    input: {} as CA2025GameInitInput,
  },
  actions: {
    // Gain command point on command phase entry
    gainCommandPoint: assign({
      players: ({ context }) => {
        const newPlayers = [...context.players] as [CA2025PlayerState, CA2025PlayerState];
        const currentCP = newPlayers[context.activePlayer].commandPoints;
        newPlayers[context.activePlayer] = {
          ...newPlayers[context.activePlayer],
          commandPoints: Math.min(12, currentCP + 1), // CA2025 max CP is 12
        };
        return newPlayers;
      },
    }),

    // Spend CP
    spendCP: assign({
      players: ({ context, event }) => {
        if (event.type !== 'SPEND_CP') return context.players;
        const newPlayers = [...context.players] as [CA2025PlayerState, CA2025PlayerState];
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
        const newPlayers = [...context.players] as [CA2025PlayerState, CA2025PlayerState];
        const currentCP = newPlayers[event.playerIndex].commandPoints;
        newPlayers[event.playerIndex] = {
          ...newPlayers[event.playerIndex],
          commandPoints: Math.min(12, currentCP + event.amount),
        };
        return newPlayers;
      },
    }),

    // Set first player
    setFirstPlayer: assign({
      players: ({ context, event }) => {
        if (event.type !== 'SET_FIRST_PLAYER') return context.players;
        const newPlayers = [...context.players] as [CA2025PlayerState, CA2025PlayerState];
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
        const newPlayers = [...context.players] as [CA2025PlayerState, CA2025PlayerState];
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
        let newEvent: ExtendedGameEvent | null = null;
        const id = generateId();

        switch (event.type) {
          case 'UNIT_MOVED':
          case 'UNIT_SHOT':
          case 'UNIT_CHARGED':
          case 'UNIT_FOUGHT':
          case 'STRATAGEM_USED':
          case 'SCORE_POINTS':
          case 'UNIT_DESTROYED':
          case 'BATTLESHOCK_TEST':
          case 'DRAW_TACTICAL_CARD':
          case 'DISCARD_TACTICAL_CARD':
          case 'ACHIEVE_SECONDARY':
          case 'SCORE_PRIMARY':
          case 'TERRAFORM_OBJECTIVE':
          case 'USE_CHALLENGER':
            newEvent = { ...event.event, id } as ExtendedGameEvent;
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

    // Spend CP from stratagem
    spendCPFromStratagem: assign({
      players: ({ context, event }) => {
        if (event.type !== 'STRATAGEM_USED') return context.players;
        const newPlayers = [...context.players] as [CA2025PlayerState, CA2025PlayerState];
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

    // === CA2025 SPECIFIC ACTIONS ===

    // Draw tactical card
    drawTacticalCard: assign({
      players: ({ context, event }) => {
        if (event.type !== 'DRAW_TACTICAL_CARD') return context.players;
        const newPlayers = [...context.players] as [CA2025PlayerState, CA2025PlayerState];
        const player = newPlayers[event.event.playerIndex];

        if (player.tacticalDeck && player.tacticalDeck.hand.length < 2) {
          newPlayers[event.event.playerIndex] = {
            ...player,
            tacticalDeck: {
              ...player.tacticalDeck,
              hand: [...player.tacticalDeck.hand, event.event.card],
              deckSize: Math.max(0, player.tacticalDeck.deckSize - 1),
            },
          };
        }
        return newPlayers;
      },
    }),

    // Discard tactical card
    discardTacticalCard: assign({
      players: ({ context, event }) => {
        if (event.type !== 'DISCARD_TACTICAL_CARD') return context.players;
        const newPlayers = [...context.players] as [CA2025PlayerState, CA2025PlayerState];
        const player = newPlayers[event.event.playerIndex];

        if (player.tacticalDeck) {
          const newHand = player.tacticalDeck.hand.filter(c => c.id !== event.event.card.id);
          newPlayers[event.event.playerIndex] = {
            ...player,
            tacticalDeck: {
              ...player.tacticalDeck,
              hand: newHand,
              discarded: [...player.tacticalDeck.discarded, event.event.card],
            },
            // Gain 1 CP if discarded at end of own turn
            commandPoints: event.event.gainedCP
              ? Math.min(12, player.commandPoints + 1)
              : player.commandPoints,
          };
        }
        return newPlayers;
      },
    }),

    // Achieve secondary mission
    achieveSecondary: assign({
      players: ({ context, event }) => {
        if (event.type !== 'ACHIEVE_SECONDARY') return context.players;
        const newPlayers = [...context.players] as [CA2025PlayerState, CA2025PlayerState];
        const player = newPlayers[event.event.playerIndex];

        const newScoring: CA2025PlayerScoring = {
          ...player.scoring,
          secondaryPoints: player.scoring.secondaryPoints + event.event.pointsScored,
          totalVP: player.scoring.totalVP + event.event.pointsScored,
        };

        // Handle tactical vs fixed
        if (player.tacticalDeck) {
          const newHand = player.tacticalDeck.hand.filter(c => c.id !== event.event.card.id);
          newPlayers[event.event.playerIndex] = {
            ...player,
            scoring: newScoring,
            victoryPoints: player.victoryPoints + event.event.pointsScored,
            tacticalDeck: {
              ...player.tacticalDeck,
              hand: newHand,
              achieved: [
                ...player.tacticalDeck.achieved,
                {
                  card: event.event.card,
                  achievedRound: event.event.round,
                  pointsScored: event.event.pointsScored,
                },
              ],
            },
          };
        } else if (player.fixedSecondaries && event.event.fixedSlot !== undefined) {
          const newProgress = [...player.fixedSecondaries.progress] as [number, number];
          newProgress[event.event.fixedSlot] += event.event.pointsScored;
          newPlayers[event.event.playerIndex] = {
            ...player,
            scoring: newScoring,
            victoryPoints: player.victoryPoints + event.event.pointsScored,
            fixedSecondaries: {
              ...player.fixedSecondaries,
              progress: newProgress,
            },
          };
        }

        return newPlayers;
      },
    }),

    // Score primary mission
    scorePrimary: assign({
      players: ({ context, event }) => {
        if (event.type !== 'SCORE_PRIMARY') return context.players;
        const newPlayers = [...context.players] as [CA2025PlayerState, CA2025PlayerState];
        const player = newPlayers[event.event.playerIndex];

        newPlayers[event.event.playerIndex] = {
          ...player,
          scoring: {
            ...player.scoring,
            primaryPoints: player.scoring.primaryPoints + event.event.pointsScored,
            totalVP: player.scoring.totalVP + event.event.pointsScored,
          },
          victoryPoints: player.victoryPoints + event.event.pointsScored,
        };

        return newPlayers;
      },
    }),

    // Terraform an objective
    terraformObjective: assign({
      terraform: ({ context, event }) => {
        if (event.type !== 'TERRAFORM_OBJECTIVE' || !context.terraform) return context.terraform;

        const newTerraformedBy = new Map(context.terraform.terraformedBy);
        const newTimestamps = new Map(context.terraform.terraformTimestamps);

        // If flipping opponent's terraform, remove their claim
        if (event.event.flippedOpponent) {
          newTerraformedBy.delete(event.event.objectiveId);
        }

        // Set new terraform
        newTerraformedBy.set(event.event.objectiveId, event.event.playerIndex);
        newTimestamps.set(event.event.objectiveId, event.event.videoTimestamp);

        return {
          terraformedBy: newTerraformedBy,
          terraformTimestamps: newTimestamps,
        };
      },
    }),

    // Use Challenger card
    useChallenger: assign({
      players: ({ context, event }) => {
        if (event.type !== 'USE_CHALLENGER') return context.players;
        const newPlayers = [...context.players] as [CA2025PlayerState, CA2025PlayerState];
        const player = newPlayers[event.event.playerIndex];

        let newScoring = { ...player.scoring, challengerUsed: true };
        let vpGain = 0;

        // If chose mission and achieved it, add points
        if (event.event.chosenOption === 'mission' && event.event.missionPointsScored) {
          vpGain = event.event.missionPointsScored;
          newScoring = {
            ...newScoring,
            secondaryPoints: player.scoring.secondaryPoints + vpGain,
            totalVP: player.scoring.totalVP + vpGain,
          };
        }

        newPlayers[event.event.playerIndex] = {
          ...player,
          scoring: {
            ...newScoring,
            challengerCardPlayed: {
              card: event.event.card,
              chosenOption: event.event.chosenOption,
              round: event.event.round,
            },
          },
          victoryPoints: player.victoryPoints + vpGain,
        };

        return newPlayers;
      },
      challengerDeck: ({ context, event }) => {
        if (event.type !== 'USE_CHALLENGER') return context.challengerDeck;
        // Remove used card from deck
        return context.challengerDeck.filter(c => c.id !== event.event.card.id);
      },
    }),

    // Set mission config
    setMissionConfig: assign({
      missionConfig: ({ event }) => {
        if (event.type !== 'SET_MISSION_CONFIG') return undefined as never;
        return event.config;
      },
      mission: ({ event }) => {
        if (event.type !== 'SET_MISSION_CONFIG') return undefined;
        return event.config.primaryMission.name;
      },
    }),

    // Set fixed secondaries
    setFixedSecondaries: assign({
      players: ({ context, event }) => {
        if (event.type !== 'SET_FIXED_SECONDARIES') return context.players;
        const newPlayers = [...context.players] as [CA2025PlayerState, CA2025PlayerState];
        newPlayers[event.playerIndex] = {
          ...newPlayers[event.playerIndex],
          fixedSecondaries: {
            selected: event.secondaries,
            progress: [0, 0],
          },
        };
        return newPlayers;
      },
    }),

    // Initialize tactical deck
    initializeTacticalDeck: assign({
      players: ({ context, event }) => {
        if (event.type !== 'INITIALIZE_TACTICAL_DECK') return context.players;
        const newPlayers = [...context.players] as [CA2025PlayerState, CA2025PlayerState];
        newPlayers[event.playerIndex] = {
          ...newPlayers[event.playerIndex],
          tacticalDeck: createDefaultTacticalDeck(event.deckSize),
        };
        return newPlayers;
      },
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
    canUseChallenger: ({ context }) => {
      return isEligibleForChallenger(context, context.activePlayer);
    },
    isPrimaryScoringRound: ({ context }) => context.currentRound >= 2,
  },
});

// Create the CA2025 game machine
export const ca2025GameMachine = ca2025MachineSetup.createMachine({
  id: 'ca2025Game',
  context: ({ input }) => createCA2025InitialContext(input),
  initial: 'setup',
  states: {
    setup: {
      on: {
        SET_FIRST_PLAYER: {
          actions: 'setFirstPlayer',
        },
        SET_MISSION_CONFIG: {
          actions: 'setMissionConfig',
        },
        SET_FIXED_SECONDARIES: {
          actions: 'setFixedSecondaries',
        },
        INITIALIZE_TACTICAL_DECK: {
          actions: 'initializeTacticalDeck',
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
                DRAW_TACTICAL_CARD: { actions: ['logEvent', 'drawTacticalCard'] },
                USE_CHALLENGER: { guard: 'canUseChallenger', actions: ['logEvent', 'useChallenger'] },
              },
            },
            movement: {
              on: {
                NEXT_PHASE: { target: 'shooting', actions: 'advancePhase' },
                UNIT_MOVED: { actions: ['logEvent', 'updateUnitFromEvent'] },
                STRATAGEM_USED: { actions: ['logEvent', 'spendCPFromStratagem'] },
                TERRAFORM_OBJECTIVE: { actions: ['logEvent', 'terraformObjective'] },
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
                SCORE_PRIMARY: { guard: 'isPrimaryScoringRound', actions: ['logEvent', 'scorePrimary'] },
                ACHIEVE_SECONDARY: { actions: ['logEvent', 'achieveSecondary'] },
                DISCARD_TACTICAL_CARD: { actions: ['logEvent', 'discardTacticalCard'] },
                END_TURN: {
                  target: '#ca2025Game.round.player2Turn',
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
                DRAW_TACTICAL_CARD: { actions: ['logEvent', 'drawTacticalCard'] },
                USE_CHALLENGER: { guard: 'canUseChallenger', actions: ['logEvent', 'useChallenger'] },
              },
            },
            movement: {
              on: {
                NEXT_PHASE: { target: 'shooting', actions: 'advancePhase' },
                UNIT_MOVED: { actions: ['logEvent', 'updateUnitFromEvent'] },
                STRATAGEM_USED: { actions: ['logEvent', 'spendCPFromStratagem'] },
                TERRAFORM_OBJECTIVE: { actions: ['logEvent', 'terraformObjective'] },
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
                SCORE_PRIMARY: { guard: 'isPrimaryScoringRound', actions: ['logEvent', 'scorePrimary'] },
                ACHIEVE_SECONDARY: { actions: ['logEvent', 'achieveSecondary'] },
                DISCARD_TACTICAL_CARD: { actions: ['logEvent', 'discardTacticalCard'] },
                END_ROUND: [
                  {
                    guard: 'isEndOfGame',
                    target: '#ca2025Game.gameOver',
                    actions: 'resetUnitTurnFlags',
                  },
                  {
                    target: '#ca2025Game.round.player1Turn',
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

export type CA2025GameMachine = typeof ca2025GameMachine;
