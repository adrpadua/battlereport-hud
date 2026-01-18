import { z } from 'zod';

export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low']);

export const PlayerSchema = z.object({
  name: z.string().describe('Player name or identifier'),
  faction: z.string().describe('Warhammer 40k faction (e.g., Space Marines, Orks, Aeldari)'),
  detachment: z.string().nullable().optional().describe('Army detachment or subfaction'),
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
});

export const BattleReportExtractionSchema = z.object({
  players: z
    .array(PlayerSchema)
    .min(1)
    .max(2)
    .describe('The players in this battle report'),
  units: z.array(UnitSchema).describe('Units mentioned in the battle report'),
  stratagems: z.array(StratagemSchema).describe('Stratagems mentioned in the battle report'),
  mission: z.string().nullable().optional().describe('The mission being played if mentioned'),
  pointsLimit: z.number().nullable().optional().describe('Points limit of the game (e.g., 2000)'),
});

export type BattleReportExtraction = z.infer<typeof BattleReportExtractionSchema>;
