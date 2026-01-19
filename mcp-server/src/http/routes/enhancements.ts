import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/connection.js';
import * as schema from '../../db/schema.js';
import { eq, ilike, or } from 'drizzle-orm';

interface EnhancementQuery {
  faction: string;
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
}

// Helper function to find faction by name or slug
async function findFaction(db: Database, query: string) {
  const [faction] = await db
    .select()
    .from(schema.factions)
    .where(
      or(
        ilike(schema.factions.name, `%${query}%`),
        eq(schema.factions.slug, query.toLowerCase().replace(/\s+/g, '-'))
      )
    )
    .limit(1);

  return faction;
}
