import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/connection.js';
import * as schema from '../../db/schema.js';
import { eq, ilike, or } from 'drizzle-orm';

interface FactionParams {
  name: string;
}

export function registerFactionRoutes(fastify: FastifyInstance, db: Database): void {
  // Get a specific faction by name with army rules
  fastify.get<{ Params: FactionParams }>(
    '/api/factions/:name',
    async (request, reply) => {
      const { name } = request.params;

      // Normalize faction name for matching
      const normalizedName = name.toLowerCase().replace(/\s+/g, '-');

      const [faction] = await db
        .select({
          name: schema.factions.name,
          armyRules: schema.factions.armyRules,
          sourceUrl: schema.factions.sourceUrl,
        })
        .from(schema.factions)
        .where(
          or(
            ilike(schema.factions.name, `%${name}%`),
            eq(schema.factions.slug, normalizedName)
          )
        )
        .limit(1);

      if (!faction) {
        return reply.status(404).send({
          error: `Faction not found: ${name}`
        });
      }

      return {
        faction: {
          name: faction.name,
          armyRule: faction.armyRules,
          sourceUrl: faction.sourceUrl,
        },
      };
    }
  );
}
