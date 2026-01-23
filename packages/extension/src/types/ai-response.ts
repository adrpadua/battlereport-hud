import { z } from 'zod';

export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low']);

export const PlayerSchema = z.object({
  name: z.string().describe('Player name or identifier'),
  faction: z.string().describe('Parent Warhammer 40k faction (e.g., Space Marines, Orks, Aeldari)'),
  subfaction: z.string().nullable().optional().describe('Chapter/Craftworld/etc. (e.g., Blood Angels, Ultramarines, Ulthwé)'),
  detachment: z.string().describe('Army detachment (e.g., Gladius Task Force, Ironstorm Spearhead). REQUIRED - infer from units/stratagems if not explicitly stated'),
  confidence: ConfidenceLevelSchema.describe('How confident we are in this extraction'),
});

export const UnitSchema = z.object({
  name: z.string().describe('Unit name'),
  playerIndex: z.number().min(0).max(1).describe('Which player owns this unit (0 or 1)'),
  confidence: ConfidenceLevelSchema,
  pointsCost: z.number().nullable().optional().describe('Points cost if mentioned'),
});

export const StratagemSchema = z.object({
  name: z.string().describe('Stratagem name'),
  playerIndex: z.number().min(0).max(1).nullable().optional().describe('Which player used it'),
  confidence: ConfidenceLevelSchema,
  videoTimestamp: z
    .number()
    .nullable()
    .optional()
    .describe('Approximate video timestamp in seconds when the stratagem was mentioned'),
});

export const EnhancementSchema = z.object({
  name: z.string().describe('Enhancement name'),
  playerIndex: z.number().min(0).max(1).nullable().optional().describe('Which player has this enhancement'),
  pointsCost: z.number().nullable().optional().describe('Points cost of the enhancement'),
  confidence: ConfidenceLevelSchema,
  videoTimestamp: z
    .number()
    .nullable()
    .optional()
    .describe('Approximate video timestamp in seconds when the enhancement was mentioned'),
});

export const BattleReportExtractionSchema = z.object({
  players: z
    .array(PlayerSchema)
    .min(1)
    .max(2)
    .describe('The players in this battle report'),
  units: z.array(UnitSchema).describe('Units mentioned in the battle report'),
  stratagems: z.array(StratagemSchema).describe('Stratagems mentioned in the battle report'),
  enhancements: z.array(EnhancementSchema).optional().describe('Enhancements mentioned in the battle report'),
  mission: z.string().nullable().optional().describe('The mission being played if mentioned'),
  pointsLimit: z.number().nullable().optional().describe('Points limit of the game (e.g., 2000)'),
});

export type BattleReportExtraction = z.infer<typeof BattleReportExtractionSchema>;
