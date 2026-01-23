import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/connection.js';
import * as schema from '../../db/schema.js';
import { eq, ilike, or, and } from 'drizzle-orm';

interface DetachmentQuery {
  faction: string;
}

interface DetachmentParams {
  name: string;
}

export function registerDetachmentRoutes(fastify: FastifyInstance, db: Database): void {
  // Get a specific detachment by name for a faction
  fastify.get<{ Params: DetachmentParams; Querystring: DetachmentQuery }>(
    '/api/detachments/:name',
    async (request, reply) => {
      const { name } = request.params;
      const { faction } = request.query;

      if (!faction) {
        return reply.status(400).send({ error: 'Faction parameter is required' });
      }

      const factionRecord = await findFaction(db, faction);
      if (!factionRecord) {
        return reply.status(404).send({ error: `Faction not found: ${faction}` });
      }

      // Normalize detachment name for matching
      const normalizedName = name.toLowerCase().replace(/\s+/g, '-');

      const [detachment] = await db
        .select({
          name: schema.detachments.name,
          detachmentRule: schema.detachments.detachmentRule,
          detachmentRuleName: schema.detachments.detachmentRuleName,
          sourceUrl: schema.detachments.sourceUrl,
        })
        .from(schema.detachments)
        .where(
          and(
            eq(schema.detachments.factionId, factionRecord.id),
            or(
              ilike(schema.detachments.name, `%${name}%`),
              eq(schema.detachments.slug, normalizedName)
            )
          )
        )
        .limit(1);

      if (!detachment) {
        return reply.status(404).send({
          error: `Detachment not found: ${name} for faction ${faction}`
        });
      }

      return {
        detachment: {
          name: detachment.name,
          ruleName: detachment.detachmentRuleName,
          rule: detachment.detachmentRule,
          faction: factionRecord.name,
          sourceUrl: detachment.sourceUrl,
        },
      };
    }
  );

  // Get all detachments for a faction
  fastify.get<{ Querystring: DetachmentQuery }>(
    '/api/detachments',
    async (request, reply) => {
      const { faction } = request.query;

      if (!faction) {
        return reply.status(400).send({ error: 'Faction parameter is required' });
      }

      const factionRecord = await findFaction(db, faction);
      if (!factionRecord) {
        return reply.status(404).send({ error: `Faction not found: ${faction}` });
      }

      const detachments = await db
        .select({
          name: schema.detachments.name,
          detachmentRule: schema.detachments.detachmentRule,
          detachmentRuleName: schema.detachments.detachmentRuleName,
        })
        .from(schema.detachments)
        .where(eq(schema.detachments.factionId, factionRecord.id));

      return {
        faction: factionRecord.name,
        count: detachments.length,
        detachments: detachments.map(d => ({
          name: d.name,
          ruleName: d.detachmentRuleName,
          rule: d.detachmentRule,
        })),
      };
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
