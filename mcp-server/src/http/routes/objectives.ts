import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/connection.js';
import * as schema from '../../db/schema.js';
import { eq, ilike } from 'drizzle-orm';

export interface ObjectivesResponse {
  primaryMissions: string[];
  secondaryObjectives: string[];
  gambits: string[];
  aliases: Record<string, string>;
}

export function registerObjectivesRoutes(fastify: FastifyInstance, db: Database): void {
  // Get all objectives for preprocessor use
  // Returns mission names, secondary objective names, and gambits
  fastify.get<{ Querystring: { missionType?: string } }>(
    '/api/objectives',
    async (request) => {
      const { missionType } = request.query;

      // Fetch primary missions
      let missionsQuery = db
        .select({
          name: schema.missions.name,
          slug: schema.missions.slug,
          missionType: schema.missions.missionType,
        })
        .from(schema.missions);

      if (missionType) {
        missionsQuery = missionsQuery.where(eq(schema.missions.missionType, missionType)) as typeof missionsQuery;
      }

      const missions = await missionsQuery;

      // Fetch secondary objectives
      const secondaries = await db
        .select({
          name: schema.secondaryObjectives.name,
          slug: schema.secondaryObjectives.slug,
          category: schema.secondaryObjectives.category,
        })
        .from(schema.secondaryObjectives);

      // Fetch gambits from core_rules (category = 'gambit')
      const gambits = await db
        .select({
          name: schema.coreRules.title,
          slug: schema.coreRules.slug,
        })
        .from(schema.coreRules)
        .where(eq(schema.coreRules.category, 'gambit'));

      // Build aliases map for common colloquial names
      const aliases: Record<string, string> = {
        // Secondary objective aliases
        'storm hostile': 'Storm Hostile Objective',
        'behind lines': 'Behind Enemy Lines',
        'engage all fronts': 'Engage On All Fronts',
        'bring down': 'Bring It Down',
        'no prisoner': 'No Prisoners',
        'cull horde': 'Cull The Horde',
        'marked death': 'Marked For Death',
        'establish locus': 'Establish Locus',
        // Primary mission aliases
        'take hold': 'Take And Hold',
        'purge foe': 'Purge The Foe',
        'scorched': 'Scorched Earth',
        'burden trust': 'Burden Of Trust',
        'unexploded ordnance': 'Unexploded Ordnance',
      };

      // Add slug-based aliases (e.g., "take-and-hold" -> "Take And Hold")
      for (const mission of missions) {
        aliases[mission.slug] = mission.name;
      }
      for (const secondary of secondaries) {
        aliases[secondary.slug] = secondary.name;
      }

      const response: ObjectivesResponse = {
        primaryMissions: [...new Set(missions.map(m => m.name))],
        secondaryObjectives: [...new Set(secondaries.map(s => s.name))],
        gambits: gambits.map(g => g.name.replace('gambit-', '')),
        aliases,
      };

      return response;
    }
  );

  // Get details for a specific mission by name
  fastify.get<{ Params: { name: string } }>(
    '/api/objectives/mission/:name',
    async (request, reply) => {
      const { name } = request.params;
      const decodedName = decodeURIComponent(name);

      const [mission] = await db
        .select()
        .from(schema.missions)
        .where(ilike(schema.missions.name, `%${decodedName}%`))
        .limit(1);

      if (!mission) {
        return reply.status(404).send({ error: `Mission not found: ${decodedName}` });
      }

      return { mission };
    }
  );

  // Get details for a specific secondary objective by name
  fastify.get<{ Params: { name: string } }>(
    '/api/objectives/secondary/:name',
    async (request, reply) => {
      const { name } = request.params;
      const decodedName = decodeURIComponent(name);

      const [objective] = await db
        .select()
        .from(schema.secondaryObjectives)
        .where(ilike(schema.secondaryObjectives.name, `%${decodedName}%`))
        .limit(1);

      if (!objective) {
        return reply.status(404).send({ error: `Secondary objective not found: ${decodedName}` });
      }

      return { objective };
    }
  );
}
