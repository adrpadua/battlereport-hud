import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/connection.js';
import * as schema from '../../db/schema.js';
import { eq, ilike, and } from 'drizzle-orm';
import { findFaction } from '../../utils/find-faction.js';
import { escapeIlike } from '../../utils/escape-ilike.js';

interface StratagemParams {
  name: string;
}

interface StratagemSearchQuery {
  faction?: string;
  phase?: string;
}

export function registerStratagemRoutes(fastify: FastifyInstance, db: Database): void {
  // Get stratagem by name
  fastify.get<{ Params: StratagemParams; Querystring: { faction?: string } }>(
    '/api/stratagems/:name',
    async (request, reply) => {
      const { name } = request.params;
      const { faction } = request.query;

      const decodedName = decodeURIComponent(name);

      // Build where conditions
      let whereCondition = ilike(schema.stratagems.name, `%${escapeIlike(decodedName)}%`);

      if (faction) {
        const factionRecord = await findFaction(db, faction);
        if (factionRecord) {
          whereCondition = and(
            ilike(schema.stratagems.name, `%${escapeIlike(decodedName)}%`),
            eq(schema.stratagems.factionId, factionRecord.id)
          )!;
        }
      }

      const [stratagem] = await db
        .select({
          name: schema.stratagems.name,
          cpCost: schema.stratagems.cpCost,
          phase: schema.stratagems.phase,
          when: schema.stratagems.when,
          target: schema.stratagems.target,
          effect: schema.stratagems.effect,
          restrictions: schema.stratagems.restrictions,
          detachment: schema.detachments.name,
          factionName: schema.factions.name,
        })
        .from(schema.stratagems)
        .leftJoin(schema.detachments, eq(schema.stratagems.detachmentId, schema.detachments.id))
        .leftJoin(schema.factions, eq(schema.stratagems.factionId, schema.factions.id))
        .where(whereCondition)
        .limit(1);

      if (!stratagem) {
        return reply.status(404).send({ error: `Stratagem not found: ${decodedName}` });
      }

      return {
        stratagem: {
          name: stratagem.name,
          cpCost: stratagem.cpCost,
          phase: stratagem.phase,
          when: stratagem.when,
          target: stratagem.target,
          effect: stratagem.effect,
          restrictions: stratagem.restrictions,
          detachment: stratagem.detachment,
          faction: stratagem.factionName,
        },
      };
    }
  );

  // Search/list stratagems for a faction
  fastify.get<{ Querystring: StratagemSearchQuery }>(
    '/api/stratagems',
    async (request, reply) => {
      const { faction, phase } = request.query;

      if (!faction) {
        return reply.status(400).send({ error: 'Faction parameter is required' });
      }

      const factionRecord = await findFaction(db, faction);
      if (!factionRecord) {
        return reply.status(404).send({ error: `Faction not found: ${faction}` });
      }

      // Build where conditions
      let whereCondition = eq(schema.stratagems.factionId, factionRecord.id);

      if (phase) {
        whereCondition = and(
          eq(schema.stratagems.factionId, factionRecord.id),
          eq(schema.stratagems.phase, phase as 'command' | 'movement' | 'shooting' | 'charge' | 'fight' | 'any')
        )!;
      }

      const stratagems = await db
        .select({
          name: schema.stratagems.name,
          cpCost: schema.stratagems.cpCost,
          phase: schema.stratagems.phase,
          when: schema.stratagems.when,
          target: schema.stratagems.target,
          effect: schema.stratagems.effect,
          detachment: schema.detachments.name,
        })
        .from(schema.stratagems)
        .leftJoin(schema.detachments, eq(schema.stratagems.detachmentId, schema.detachments.id))
        .where(whereCondition);

      return { faction: factionRecord.name, count: stratagems.length, stratagems };
    }
  );
}

