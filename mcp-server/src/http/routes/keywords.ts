import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/connection.js';
import * as schema from '../../db/schema.js';
import { eq, ilike, or } from 'drizzle-orm';
import { escapeIlike } from '../../utils/escape-ilike.js';

interface KeywordParams {
  name: string;
}

interface BatchQuery {
  keywords: string[];
}

interface KeywordResult {
  name: string;
  description: string | null;
  type: string;
}

export function registerKeywordRoutes(fastify: FastifyInstance, db: Database): void {
  /**
   * GET /api/keywords/:name
   * Lookup a single keyword description.
   * Searches keywords table, then abilities (weapon type), then core rules.
   *
   * Example: /api/keywords/LETHAL%20HITS
   */
  fastify.get<{ Params: KeywordParams }>(
    '/api/keywords/:name',
    async (request, reply) => {
      const { name } = request.params;
      const decodedName = decodeURIComponent(name).trim();
      const normalized = normalizeKeywordName(decodedName);

      const result = await lookupKeyword(db, normalized);

      if (!result) {
        return reply.status(404).send({
          error: `Keyword not found: ${decodedName}`,
          searched: normalized,
        });
      }

      return { keyword: result };
    }
  );

  /**
   * POST /api/keywords/batch
   * Batch lookup multiple keywords at once.
   * Returns a map of keyword names to their descriptions.
   *
   * Body: { keywords: ["LETHAL HITS", "DEVASTATING WOUNDS", ...] }
   */
  fastify.post<{ Body: BatchQuery }>(
    '/api/keywords/batch',
    async (request, reply) => {
      const { keywords } = request.body;

      if (!Array.isArray(keywords) || keywords.length === 0) {
        return reply.status(400).send({ error: 'keywords must be a non-empty array' });
      }

      if (keywords.length > 50) {
        return reply.status(400).send({ error: 'Maximum 50 keywords per batch request' });
      }

      const results: Record<string, KeywordResult | null> = {};

      // Normalize all keywords
      const normalizedKeywords = keywords.map((k) => ({
        original: k,
        normalized: normalizeKeywordName(k),
      }));

      // Batch lookup from keywords table
      const keywordNames = normalizedKeywords.map((k) => k.normalized);
      const keywordResults = await db
        .select({
          name: schema.keywords.name,
          description: schema.keywords.description,
          type: schema.keywords.keywordType,
        })
        .from(schema.keywords)
        .where(
          or(
            ...keywordNames.map((name) => ilike(schema.keywords.name, escapeIlike(name)))
          )
        );

      // Map results by normalized name
      const keywordMap = new Map<string, KeywordResult>();
      for (const kr of keywordResults) {
        keywordMap.set(kr.name.toUpperCase(), {
          name: kr.name,
          description: kr.description,
          type: kr.type,
        });
      }

      // Batch lookup from abilities table (for weapon abilities)
      const abilityResults = await db
        .select({
          name: schema.abilities.name,
          description: schema.abilities.description,
          type: schema.abilities.abilityType,
        })
        .from(schema.abilities)
        .where(
          or(
            ...keywordNames.map((name) => ilike(schema.abilities.name, escapeIlike(name)))
          )
        );

      const abilityMap = new Map<string, KeywordResult>();
      for (const ar of abilityResults) {
        abilityMap.set(ar.name.toUpperCase(), {
          name: ar.name,
          description: ar.description,
          type: ar.type,
        });
      }

      // Build results for each requested keyword
      for (const { original, normalized } of normalizedKeywords) {
        const upper = normalized.toUpperCase();

        // Check keywords table first
        let result = keywordMap.get(upper);

        // Then abilities table
        if (!result) {
          result = abilityMap.get(upper);
        }

        // Check hardcoded fallbacks
        if (!result) {
          const fallback = HARDCODED_KEYWORD_DESCRIPTIONS[upper];
          if (fallback) {
            result = {
              name: normalized,
              description: fallback,
              type: 'weapon',
            };
          }
        }

        results[original] = result ?? null;
      }

      return {
        keywords: results,
        found: Object.values(results).filter(Boolean).length,
        total: keywords.length,
      };
    }
  );
}

/**
 * Normalize keyword name for consistent lookup.
 * Handles escaped brackets, removes punctuation, etc.
 */
function normalizeKeywordName(name: string): string {
  let normalized = name;

  // Remove escape characters and brackets
  normalized = normalized.replace(/\\?\[|\\?\]/g, '');

  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Lookup a keyword from multiple sources.
 */
async function lookupKeyword(
  db: Database,
  name: string
): Promise<KeywordResult | null> {
  const upperName = name.toUpperCase();

  // 1. Check keywords table
  const [keyword] = await db
    .select({
      name: schema.keywords.name,
      description: schema.keywords.description,
      type: schema.keywords.keywordType,
    })
    .from(schema.keywords)
    .where(ilike(schema.keywords.name, escapeIlike(name)))
    .limit(1);

  if (keyword) {
    return {
      name: keyword.name,
      description: keyword.description,
      type: keyword.type,
    };
  }

  // 2. Check abilities table (for weapon abilities like Lethal Hits)
  const [ability] = await db
    .select({
      name: schema.abilities.name,
      description: schema.abilities.description,
      type: schema.abilities.abilityType,
    })
    .from(schema.abilities)
    .where(ilike(schema.abilities.name, escapeIlike(name)))
    .limit(1);

  if (ability) {
    return {
      name: ability.name,
      description: ability.description,
      type: ability.type,
    };
  }

  // 3. Check core rules for phase names
  const phaseNames: Record<string, string> = {
    'COMMAND PHASE': 'command',
    'MOVEMENT PHASE': 'movement',
    'SHOOTING PHASE': 'shooting',
    'CHARGE PHASE': 'charge',
    'FIGHT PHASE': 'fight',
  };

  const phaseCategory = phaseNames[upperName];
  if (phaseCategory) {
    const [rule] = await db
      .select({
        title: schema.coreRules.title,
        content: schema.coreRules.content,
      })
      .from(schema.coreRules)
      .where(eq(schema.coreRules.category, phaseCategory))
      .limit(1);

    if (rule) {
      return {
        name: rule.title,
        description: rule.content,
        type: 'phase',
      };
    }
  }

  // 4. Check hardcoded fallbacks for common weapon abilities
  const fallback = HARDCODED_KEYWORD_DESCRIPTIONS[upperName];
  if (fallback) {
    return {
      name: name,
      description: fallback,
      type: 'weapon',
    };
  }

  return null;
}

/**
 * Hardcoded descriptions for common weapon abilities.
 * Used as fallback when database entries are missing.
 */
const HARDCODED_KEYWORD_DESCRIPTIONS: Record<string, string> = {
  'LETHAL HITS':
    'Critical hits (unmodified hit rolls of 6) automatically wound the target.',
  'SUSTAINED HITS':
    'Critical hits (unmodified hit rolls of 6) score additional hits. SUSTAINED HITS X scores X additional hits.',
  'DEVASTATING WOUNDS':
    'Critical wounds (unmodified wound rolls of 6) bypass saving throws entirely, causing mortal wounds.',
  'RAPID FIRE':
    'RAPID FIRE X: Each time this weapon is used within half range, it makes X additional attacks.',
  ASSAULT:
    'Can be fired even if the unit Advanced this turn, but attacks made are at -1 to hit.',
  HEAVY:
    'Add 1 to hit rolls if the unit Remained Stationary this turn. Cannot be fired if the unit Advanced.',
  PISTOL:
    'Can be fired even if the unit is Engaged. Can only target enemy units within Engagement Range when Engaged.',
  BLAST:
    'Add 1 to the Attacks characteristic for every 5 models in the target unit (rounding down). Never used against targets within Engagement Range.',
  MELTA:
    'MELTA X: When targeting a unit within half range, increase the Damage characteristic by X.',
  TORRENT: 'Automatically hits - do not roll to hit.',
  HAZARDOUS:
    'After resolving attacks, roll one D6 for each Hazardous weapon used. On a 1, the bearer suffers 3 mortal wounds (Characters and Monsters suffer D3 instead).',
  PRECISION:
    'When targeting an Attached unit, you can choose to have this attack target an attached Character instead of the Bodyguard unit.',
  'INDIRECT FIRE':
    'Can target and make attacks against units not visible to the bearer. When doing so, attacks are at -1 to hit and the target has the Benefit of Cover.',
  'ONE SHOT': 'This weapon can only be fired once per battle.',
  PSYCHIC:
    'This is a Psychic weapon. If any attacks made with this weapon wound, the target suffers Perils of the Warp after resolving those attacks.',
  'TWIN-LINKED': 'Re-roll wound rolls for this weapon.',
  LANCE: 'Add 1 to wound rolls if the bearer Charged this turn.',
  'IGNORES COVER': 'The target does not receive the Benefit of Cover.',
  'EXTRA ATTACKS':
    'This weapon can be used in addition to other melee weapons.',
  'ANTI-INFANTRY 4+':
    'Unmodified wound rolls of 4+ against INFANTRY targets are critical wounds.',
  'ANTI-VEHICLE 4+':
    'Unmodified wound rolls of 4+ against VEHICLE targets are critical wounds.',
  'ANTI-MONSTER 4+':
    'Unmodified wound rolls of 4+ against MONSTER targets are critical wounds.',
  'FEEL NO PAIN':
    'FEEL NO PAIN X+: Each time this model would lose a wound, roll one D6. On X+, that wound is not lost.',
  'DEADLY DEMISE':
    'DEADLY DEMISE X: When this model is destroyed, roll one D6. On a 6, each unit within 6" suffers X mortal wounds.',
  'DEEP STRIKE':
    'During the Declare Battle Formations step, this unit can be set up in Reserves. At the end of any Movement phase, it can arrive from Reserves anywhere on the battlefield more than 9" away from all enemy models.',
  'FIGHTS FIRST':
    'Units with this ability fight in the Fights First step of the Fight phase.',
  'LONE OPERATIVE':
    'Unless part of an Attached unit, this unit can only be targeted by ranged attacks if the attacking model is within 12".',
  STEALTH:
    'When being targeted, if every model in this unit has this ability, subtract 1 from the Hit roll.',
  SCOUTS:
    'SCOUTS X": At the start of the first battle round, before the first turn begins, this unit can make a Normal move of up to X".',
  INFILTRATORS:
    'During deployment, this unit can be set up anywhere on the battlefield more than 9" away from enemy deployment zone and enemy models.',
  HOVER:
    'At the start of the Declare Battle Formations step, this model can hover. If it does, its Move characteristic becomes 20" for this battle round.',
  LEADER:
    'Before the battle, this model can be attached to one of its eligible Bodyguard units.',
  'FIRING DECK':
    'FIRING DECK X: Each time this Transport shoots, up to X models embarked within can shoot as well.',
};
