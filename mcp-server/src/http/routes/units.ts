import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/connection.js';
import * as schema from '../../db/schema.js';
import { eq, ilike, or, and } from 'drizzle-orm';

interface UnitParams {
  name: string;
}

interface UnitSearchQuery {
  q: string;
  faction?: string;
}

export function registerUnitRoutes(fastify: FastifyInstance, db: Database): void {
  // Search units by name
  fastify.get<{ Querystring: UnitSearchQuery }>(
    '/api/units/search',
    async (request, reply) => {
      const { q, faction } = request.query;

      if (!q || q.length < 2) {
        return reply.status(400).send({ error: 'Query must be at least 2 characters' });
      }

      // Build where conditions
      let whereCondition = ilike(schema.units.name, `%${q}%`);

      if (faction) {
        const factionRecord = await findFaction(db, faction);
        if (factionRecord) {
          whereCondition = and(
            ilike(schema.units.name, `%${q}%`),
            eq(schema.units.factionId, factionRecord.id)
          )!;
        }
      }

      const units = await db
        .select({
          name: schema.units.name,
          faction: schema.factions.name,
          movement: schema.units.movement,
          toughness: schema.units.toughness,
          save: schema.units.save,
          wounds: schema.units.wounds,
          leadership: schema.units.leadership,
          objectiveControl: schema.units.objectiveControl,
          pointsCost: schema.units.pointsCost,
        })
        .from(schema.units)
        .innerJoin(schema.factions, eq(schema.units.factionId, schema.factions.id))
        .where(whereCondition)
        .limit(20);

      return { count: units.length, units };
    }
  );

  // Get full unit datasheet by name
  fastify.get<{ Params: UnitParams; Querystring: { faction?: string } }>(
    '/api/units/:name',
    async (request, reply) => {
      const { name } = request.params;
      const { faction } = request.query;

      const decodedName = decodeURIComponent(name);

      // Build where conditions
      let whereCondition = ilike(schema.units.name, `%${decodedName}%`);

      if (faction) {
        const factionRecord = await findFaction(db, faction);
        if (factionRecord) {
          whereCondition = and(
            ilike(schema.units.name, `%${decodedName}%`),
            eq(schema.units.factionId, factionRecord.id)
          )!;
        }
      }

      const [result] = await db
        .select()
        .from(schema.units)
        .innerJoin(schema.factions, eq(schema.units.factionId, schema.factions.id))
        .where(whereCondition)
        .limit(1);

      if (!result) {
        return reply.status(404).send({ error: `Unit not found: ${decodedName}` });
      }

      const unit = result.units;

      // Get weapons
      const weapons = await db
        .select({
          name: schema.weapons.name,
          type: schema.weapons.weaponType,
          range: schema.weapons.range,
          attacks: schema.weapons.attacks,
          skill: schema.weapons.skill,
          strength: schema.weapons.strength,
          ap: schema.weapons.armorPenetration,
          damage: schema.weapons.damage,
          abilities: schema.weapons.abilities,
        })
        .from(schema.unitWeapons)
        .innerJoin(schema.weapons, eq(schema.unitWeapons.weaponId, schema.weapons.id))
        .where(eq(schema.unitWeapons.unitId, unit.id));

      // Get abilities
      const abilities = await db
        .select({
          name: schema.abilities.name,
          type: schema.abilities.abilityType,
          description: schema.abilities.description,
        })
        .from(schema.unitAbilities)
        .innerJoin(schema.abilities, eq(schema.unitAbilities.abilityId, schema.abilities.id))
        .where(eq(schema.unitAbilities.unitId, unit.id));

      // Get keywords
      const keywords = await db
        .select({
          name: schema.keywords.name,
          type: schema.keywords.keywordType,
        })
        .from(schema.unitKeywords)
        .innerJoin(schema.keywords, eq(schema.unitKeywords.keywordId, schema.keywords.id))
        .where(eq(schema.unitKeywords.unitId, unit.id));

      return {
        unit: {
          name: unit.name,
          faction: result.factions.name,
          stats: {
            movement: unit.movement,
            toughness: unit.toughness,
            save: unit.save,
            invulnerableSave: unit.invulnerableSave,
            wounds: unit.wounds,
            leadership: unit.leadership,
            objectiveControl: unit.objectiveControl,
          },
          pointsCost: unit.pointsCost,
          composition: unit.unitComposition,
          wargearOptions: unit.wargearOptions,
          leaderInfo: unit.leaderInfo,
          ledBy: unit.ledBy,
          transportCapacity: unit.transportCapacity,
          isEpicHero: unit.isEpicHero,
          isBattleline: unit.isBattleline,
        },
        weapons: weapons.map((w) => ({
          name: w.name,
          type: w.type,
          range: w.range,
          attacks: w.attacks,
          skill: w.skill,
          strength: w.strength,
          ap: w.ap,
          damage: w.damage,
          abilities: w.abilities,
        })),
        abilities: abilities.map((a) => ({
          name: a.name,
          type: a.type,
          description: a.description,
        })),
        keywords: keywords.map((k) => k.name),
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
