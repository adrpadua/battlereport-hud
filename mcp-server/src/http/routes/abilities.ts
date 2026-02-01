import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/connection.js';
import * as schema from '../../db/schema.js';
import { eq, ilike, or, and } from 'drizzle-orm';
import { findFaction } from '../../utils/find-faction.js';
import { escapeIlike } from '../../utils/escape-ilike.js';

interface AbilityParams {
  name: string;
}

interface AbilitySearchQuery {
  type?: string;
  faction?: string;
}

export function registerAbilityRoutes(fastify: FastifyInstance, db: Database): void {
  /**
   * GET /api/abilities/:name
   * Get ability by name or slug (supports weapon abilities, core abilities, etc.)
   * Example: /api/abilities/devastating-wounds or /api/abilities/Devastating%20Wounds
   */
  fastify.get<{ Params: AbilityParams; Querystring: { type?: string } }>(
    '/api/abilities/:name',
    async (request, reply) => {
      const { name } = request.params;
      const { type } = request.query;

      const decodedName = decodeURIComponent(name);
      const slug = decodedName.toLowerCase().replace(/\s+/g, '-');

      // Build where conditions - search by name or slug
      let whereCondition = or(
        ilike(schema.abilities.name, `%${escapeIlike(decodedName)}%`),
        eq(schema.abilities.slug, slug)
      );

      // Optionally filter by ability type
      if (type) {
        whereCondition = and(
          whereCondition,
          eq(schema.abilities.abilityType, type)
        );
      }

      const [ability] = await db
        .select({
          slug: schema.abilities.slug,
          name: schema.abilities.name,
          abilityType: schema.abilities.abilityType,
          description: schema.abilities.description,
          phase: schema.abilities.phase,
          factionName: schema.factions.name,
        })
        .from(schema.abilities)
        .leftJoin(schema.factions, eq(schema.abilities.factionId, schema.factions.id))
        .where(whereCondition!)
        .limit(1);

      if (!ability) {
        return reply.status(404).send({ error: `Ability not found: ${decodedName}` });
      }

      return {
        ability: {
          slug: ability.slug,
          name: ability.name,
          type: ability.abilityType,
          description: ability.description,
          phase: ability.phase,
          faction: ability.factionName,
        },
      };
    }
  );

  /**
   * GET /api/abilities/weapon/:name
   * Shortcut to get weapon abilities specifically (Devastating Wounds, Lethal Hits, etc.)
   * Example: /api/abilities/weapon/devastating-wounds
   */
  fastify.get<{ Params: AbilityParams }>(
    '/api/abilities/weapon/:name',
    async (request, reply) => {
      const { name } = request.params;
      const decodedName = decodeURIComponent(name);
      const slug = decodedName.toLowerCase().replace(/\s+/g, '-');

      const [ability] = await db
        .select({
          slug: schema.abilities.slug,
          name: schema.abilities.name,
          description: schema.abilities.description,
        })
        .from(schema.abilities)
        .where(
          and(
            eq(schema.abilities.abilityType, 'weapon'),
            or(
              ilike(schema.abilities.name, `%${escapeIlike(decodedName)}%`),
              eq(schema.abilities.slug, slug)
            )
          )
        )
        .limit(1);

      if (!ability) {
        return reply.status(404).send({ error: `Weapon ability not found: ${decodedName}` });
      }

      return { ability };
    }
  );

  /**
   * GET /api/abilities
   * List/search abilities with optional filters
   * Query params: type (weapon, core, faction, unit, wargear), faction
   */
  fastify.get<{ Querystring: AbilitySearchQuery }>(
    '/api/abilities',
    async (request) => {
      const { type, faction } = request.query;

      // Build where conditions
      const conditions = [];

      if (type) {
        conditions.push(eq(schema.abilities.abilityType, type));
      }

      if (faction) {
        const factionRecord = await findFaction(db, faction);
        if (factionRecord) {
          conditions.push(eq(schema.abilities.factionId, factionRecord.id));
        }
      }

      const baseQuery = db
        .select({
          slug: schema.abilities.slug,
          name: schema.abilities.name,
          abilityType: schema.abilities.abilityType,
          description: schema.abilities.description,
          phase: schema.abilities.phase,
          factionName: schema.factions.name,
        })
        .from(schema.abilities)
        .leftJoin(schema.factions, eq(schema.abilities.factionId, schema.factions.id));

      const abilities = conditions.length > 0
        ? await baseQuery.where(conditions.reduce((acc, cond) => and(acc, cond)!)!)
        : await baseQuery;

      return {
        count: abilities.length,
        abilities: abilities.map((a) => ({
          slug: a.slug,
          name: a.name,
          type: a.abilityType,
          description: a.description,
          phase: a.phase,
          faction: a.factionName,
        })),
      };
    }
  );

  /**
   * GET /api/abilities/weapon
   * List all weapon abilities (Devastating Wounds, Lethal Hits, Sustained Hits, etc.)
   * Useful for quick reference of all weapon keywords
   */
  fastify.get('/api/abilities/weapon', async () => {
    const abilities = await db
      .select({
        slug: schema.abilities.slug,
        name: schema.abilities.name,
        description: schema.abilities.description,
      })
      .from(schema.abilities)
      .where(eq(schema.abilities.abilityType, 'weapon'));

    return {
      count: abilities.length,
      abilities,
    };
  });
}

