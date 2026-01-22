/**
 * Consumer adapters for GameExtraction.
 *
 * These functions convert the unified GameExtraction structure into
 * formats expected by different consumers (HUD, narrator, etc.).
 */

import type { BattleReport, Unit, Stratagem, Enhancement } from '@/types/battle-report';
import type { GameExtraction, NormalizedSegment } from './types';

/**
 * Convert GameExtraction to BattleReport for backward compatibility with HUD.
 *
 * This adapter allows the HUD to continue using the BattleReport interface
 * while we migrate to the richer GameExtraction structure internally.
 */
export function toBattleReport(game: GameExtraction): BattleReport {
  // Convert units Map to array
  const units: Unit[] = [];
  for (const [name, entity] of game.units) {
    const assignment = game.assignments.units.get(name.toLowerCase());
    units.push({
      name: entity.canonicalName,
      playerIndex: assignment?.playerIndex ?? 0,
      confidence: assignment?.confidence ?? 'medium',
      pointsCost: entity.pointsCost,
      stats: entity.stats,
      keywords: entity.keywords,
      isValidated: entity.isValidated,
      suggestedMatch: entity.suggestedMatch ? {
        name: entity.suggestedMatch.name,
        confidence: entity.suggestedMatch.confidence,
      } : undefined,
      videoTimestamp: entity.timestamps[0],
    });
  }

  // Convert stratagems Map to array
  const stratagems: Stratagem[] = [];
  for (const [name, entity] of game.stratagems) {
    const assignment = game.assignments.stratagems.get(name.toLowerCase());
    stratagems.push({
      name: entity.canonicalName,
      playerIndex: assignment?.playerIndex,
      confidence: assignment?.confidence ?? 'medium',
      videoTimestamp: entity.timestamps[0],
    });
  }

  // Convert enhancements Map to array (only if non-empty)
  let enhancements: Enhancement[] | undefined;
  if (game.enhancements.size > 0) {
    enhancements = [];
    for (const [name, entity] of game.enhancements) {
      const assignment = game.assignments.enhancements.get(name.toLowerCase());
      enhancements.push({
        name: entity.canonicalName,
        playerIndex: assignment?.playerIndex,
        pointsCost: assignment?.pointsCost ?? entity.pointsCost,
        confidence: assignment?.confidence ?? 'medium',
        videoTimestamp: entity.timestamps[0],
      });
    }
  }

  return {
    players: game.players.map(p => ({
      name: p.name,
      faction: p.faction,
      detachment: p.detachment,
      confidence: p.confidence,
    })) as BattleReport['players'],
    units,
    stratagems,
    enhancements,
    mission: game.mission,
    pointsLimit: game.pointsLimit,
    extractedAt: game.extractedAt,
  };
}

/**
 * Narrator input structure.
 * Uses the rich timestamp data for generating time-aware narration.
 */
export interface NarratorInput {
  players: Array<{
    name: string;
    faction: string;
    factionId?: string;
    detachment: string;
  }>;
  /** Units with all their mention timestamps */
  units: Map<string, {
    name: string;
    playerIndex: number;
    timestamps: number[];
    isValidated: boolean;
  }>;
  /** Stratagems with usage timestamps */
  stratagems: Map<string, {
    name: string;
    playerIndex?: number;
    timestamps: number[];
  }>;
  /** Normalized transcript segments for narration */
  segments: NormalizedSegment[];
  /** Mission name if detected */
  mission?: string;
  /** Video ID for caching */
  videoId: string;
}

/**
 * Convert GameExtraction to NarratorInput.
 *
 * The narrator uses timestamps to generate time-aware battle narration,
 * so it needs the full timestamp arrays rather than just the first timestamp.
 */
export function toNarratorInput(game: GameExtraction): NarratorInput {
  const units = new Map<string, {
    name: string;
    playerIndex: number;
    timestamps: number[];
    isValidated: boolean;
  }>();

  for (const [name, entity] of game.units) {
    const assignment = game.assignments.units.get(name.toLowerCase());
    units.set(name, {
      name: entity.canonicalName,
      playerIndex: assignment?.playerIndex ?? 0,
      timestamps: entity.timestamps,
      isValidated: entity.isValidated,
    });
  }

  const stratagems = new Map<string, {
    name: string;
    playerIndex?: number;
    timestamps: number[];
  }>();

  for (const [name, entity] of game.stratagems) {
    const assignment = game.assignments.stratagems.get(name.toLowerCase());
    stratagems.set(name, {
      name: entity.canonicalName,
      playerIndex: assignment?.playerIndex,
      timestamps: entity.timestamps,
    });
  }

  return {
    players: game.players.map(p => ({
      name: p.name,
      faction: p.faction,
      factionId: p.factionId,
      detachment: p.detachment,
    })),
    units,
    stratagems,
    segments: game.segments,
    mission: game.mission,
    videoId: game.videoId,
  };
}

/**
 * Extract entity timeline from GameExtraction.
 *
 * Useful for building "jump to mention" features in the HUD.
 */
export function getEntityTimeline(
  game: GameExtraction,
  entityType: 'units' | 'stratagems' | 'enhancements'
): Array<{ name: string; timestamp: number; playerIndex?: number }> {
  const timeline: Array<{ name: string; timestamp: number; playerIndex?: number }> = [];
  const entityMap = game[entityType];
  const assignmentMap = game.assignments[entityType];

  for (const [name, entity] of entityMap) {
    const assignment = assignmentMap.get(name.toLowerCase());
    for (const timestamp of entity.timestamps) {
      timeline.push({
        name: entity.canonicalName,
        timestamp,
        playerIndex: assignment?.playerIndex,
      });
    }
  }

  // Sort by timestamp
  timeline.sort((a, b) => a.timestamp - b.timestamp);
  return timeline;
}

/**
 * Get summary statistics from GameExtraction.
 */
export function getExtractionStats(game: GameExtraction): {
  totalUnits: number;
  validatedUnits: number;
  totalStratagems: number;
  totalEnhancements: number;
  processingTimeMs: number;
} {
  let validatedUnits = 0;
  for (const entity of game.units.values()) {
    if (entity.isValidated) validatedUnits++;
  }

  return {
    totalUnits: game.units.size,
    validatedUnits,
    totalStratagems: game.stratagems.size,
    totalEnhancements: game.enhancements.size,
    processingTimeMs: game.processingTimeMs,
  };
}
