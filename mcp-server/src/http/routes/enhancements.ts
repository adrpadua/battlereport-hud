import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/connection.js';
import * as schema from '../../db/schema.js';
import { eq, ilike } from 'drizzle-orm';
import { findFaction } from '../../utils/find-faction.js';
import { escapeIlike } from '../../utils/escape-ilike.js';

interface EnhancementQuery {
  faction?: string;
}

interface EnhancementParams {
  name: string;
}

export function registerEnhancementRoutes(fastify: FastifyInstance, db: Database): void {
  // Get enhancements for a faction
  fastify.get<{ Querystring: EnhancementQuery }>(
    '/api/enhancements',
    async (request, reply) => {
      const { faction } = request.query;

      if (!faction) {
        return reply.status(400).send({ error: 'Faction parameter is required' });
      }

      const factionRecord = await findFaction(db, faction);
      if (!factionRecord) {
        return reply.status(404).send({ error: `Faction not found: ${faction}` });
      }

      const enhancements = await db
        .select({
          name: schema.enhancements.name,
          pointsCost: schema.enhancements.pointsCost,
          description: schema.enhancements.description,
          restrictions: schema.enhancements.restrictions,
          detachment: schema.detachments.name,
        })
        .from(schema.enhancements)
        .innerJoin(schema.detachments, eq(schema.enhancements.detachmentId, schema.detachments.id))
        .where(eq(schema.detachments.factionId, factionRecord.id));

      return { faction: factionRecord.name, count: enhancements.length, enhancements };
    }
  );

  // Get a specific enhancement by name
  fastify.get<{ Params: EnhancementParams; Querystring: EnhancementQuery }>(
    '/api/enhancements/:name',
    async (request, reply) => {
      const { name } = request.params;
      const { faction } = request.query;

      // Build the base query
      let query = db
        .select({
          name: schema.enhancements.name,
          pointsCost: schema.enhancements.pointsCost,
          description: schema.enhancements.description,
          restrictions: schema.enhancements.restrictions,
          detachment: schema.detachments.name,
          faction: schema.factions.name,
        })
        .from(schema.enhancements)
        .innerJoin(schema.detachments, eq(schema.enhancements.detachmentId, schema.detachments.id))
        .innerJoin(schema.factions, eq(schema.detachments.factionId, schema.factions.id))
        .where(ilike(schema.enhancements.name, escapeIlike(name)));

      const results = await query;

      if (results.length === 0) {
        return reply.status(404).send({ error: `Enhancement not found: ${name}` });
      }

      // If faction is specified, filter results to that faction
      if (faction) {
        const factionRecord = await findFaction(db, faction);
        if (factionRecord) {
          const filtered = results.filter(
            r => r.faction.toLowerCase() === factionRecord.name.toLowerCase()
          );
          if (filtered.length > 0) {
            const enhancement = filtered[0]!;
            return {
              enhancement: {
                name: enhancement.name,
                pointsCost: enhancement.pointsCost,
                description: enhancement.description,
                restrictions: enhancement.restrictions,
                detachment: enhancement.detachment,
                faction: enhancement.faction,
              },
            };
          }
        }
      }

      // Return the first match (we know results.length > 0 from the check above)
      const enhancement = results[0]!;
      return {
        enhancement: {
          name: enhancement.name,
          pointsCost: enhancement.pointsCost,
          description: enhancement.description,
          restrictions: enhancement.restrictions,
          detachment: enhancement.detachment,
          faction: enhancement.faction,
        },
      };
    }
  );
}

