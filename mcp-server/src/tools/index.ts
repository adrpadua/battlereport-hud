import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Database } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { eq, ilike, or, and, sql } from 'drizzle-orm';

export function createTools(): Tool[] {
  return [
    // Core Rules
    {
      name: 'get_core_rules',
      description:
        'Get Warhammer 40,000 10th Edition core rules. Can filter by category (e.g., "shooting_phase", "combat", "morale") or search by keyword.',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description:
              'Filter by category: command_phase, movement_phase, shooting_phase, charge_phase, fight_phase, combat, morale, transports, terrain, psychic, stratagems, objectives, deployment, units, weapons, abilities, keywords, leaders, general',
          },
          search: {
            type: 'string',
            description: 'Search for rules containing this keyword',
          },
        },
      },
    },

    // Factions
    {
      name: 'list_factions',
      description: 'List all Warhammer 40,000 factions available in the database.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_faction',
      description:
        'Get detailed information about a specific faction including army rules and lore.',
      inputSchema: {
        type: 'object',
        properties: {
          faction: {
            type: 'string',
            description: 'Faction name or slug (e.g., "Space Marines", "necrons", "Aeldari")',
          },
        },
        required: ['faction'],
      },
    },

    // Detachments
    {
      name: 'get_detachments',
      description: 'Get all detachments for a faction with their rules and abilities.',
      inputSchema: {
        type: 'object',
        properties: {
          faction: {
            type: 'string',
            description: 'Faction name or slug',
          },
        },
        required: ['faction'],
      },
    },
    {
      name: 'get_detachment_details',
      description:
        'Get detailed information about a specific detachment including stratagems and enhancements.',
      inputSchema: {
        type: 'object',
        properties: {
          faction: {
            type: 'string',
            description: 'Faction name or slug',
          },
          detachment: {
            type: 'string',
            description: 'Detachment name',
          },
        },
        required: ['faction', 'detachment'],
      },
    },

    // Units
    {
      name: 'search_units',
      description:
        'Search for units by name across all factions or within a specific faction.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Unit name to search for',
          },
          faction: {
            type: 'string',
            description: 'Optional: limit search to this faction',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_unit',
      description:
        'Get complete datasheet for a unit including stats, weapons, abilities, and keywords.',
      inputSchema: {
        type: 'object',
        properties: {
          unit: {
            type: 'string',
            description: 'Unit name',
          },
          faction: {
            type: 'string',
            description: 'Optional: faction to narrow down if unit exists in multiple factions',
          },
        },
        required: ['unit'],
      },
    },

    // Stratagems
    {
      name: 'get_stratagems',
      description: 'Get stratagems for a faction or detachment. Can filter by phase.',
      inputSchema: {
        type: 'object',
        properties: {
          faction: {
            type: 'string',
            description: 'Faction name or slug',
          },
          detachment: {
            type: 'string',
            description: 'Optional: specific detachment name',
          },
          phase: {
            type: 'string',
            enum: ['command', 'movement', 'shooting', 'charge', 'fight', 'any'],
            description: 'Optional: filter by game phase',
          },
        },
        required: ['faction'],
      },
    },

    // Enhancements
    {
      name: 'get_enhancements',
      description: 'Get enhancements for a faction or specific detachment.',
      inputSchema: {
        type: 'object',
        properties: {
          faction: {
            type: 'string',
            description: 'Faction name or slug',
          },
          detachment: {
            type: 'string',
            description: 'Optional: specific detachment name',
          },
        },
        required: ['faction'],
      },
    },

    // Weapons
    {
      name: 'search_weapons',
      description: 'Search for weapon profiles by name.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Weapon name to search for',
          },
          type: {
            type: 'string',
            enum: ['ranged', 'melee'],
            description: 'Optional: filter by weapon type',
          },
        },
        required: ['query'],
      },
    },

    // Abilities
    {
      name: 'search_abilities',
      description: 'Search for abilities by name or description.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Ability name or keyword to search for',
          },
          type: {
            type: 'string',
            enum: ['core', 'faction', 'unit', 'wargear'],
            description: 'Optional: filter by ability type',
          },
        },
        required: ['query'],
      },
    },

    // Keywords
    {
      name: 'get_keyword_info',
      description: 'Get information about a keyword and what it does.',
      inputSchema: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: 'Keyword to look up',
          },
        },
        required: ['keyword'],
      },
    },

    // Missions
    {
      name: 'get_missions',
      description: 'Get available missions and their rules.',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Mission type (e.g., "leviathan", "pariah_nexus", "gt")',
          },
        },
      },
    },

    // FAQs
    {
      name: 'search_faqs',
      description: 'Search FAQs and errata for rules clarifications.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term',
          },
          faction: {
            type: 'string',
            description: 'Optional: limit to faction-specific FAQs',
          },
        },
        required: ['query'],
      },
    },
  ];
}

export async function handleToolCall(
  db: Database,
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    let result: unknown;

    switch (name) {
      case 'get_core_rules':
        result = await getCoreRules(db, args);
        break;
      case 'list_factions':
        result = await listFactions(db);
        break;
      case 'get_faction':
        result = await getFaction(db, args.faction as string);
        break;
      case 'get_detachments':
        result = await getDetachments(db, args.faction as string);
        break;
      case 'get_detachment_details':
        result = await getDetachmentDetails(
          db,
          args.faction as string,
          args.detachment as string
        );
        break;
      case 'search_units':
        result = await searchUnits(db, args.query as string, args.faction as string | undefined);
        break;
      case 'get_unit':
        result = await getUnit(db, args.unit as string, args.faction as string | undefined);
        break;
      case 'get_stratagems':
        result = await getStratagems(
          db,
          args.faction as string,
          args.detachment as string | undefined,
          args.phase as string | undefined
        );
        break;
      case 'get_enhancements':
        result = await getEnhancements(
          db,
          args.faction as string,
          args.detachment as string | undefined
        );
        break;
      case 'search_weapons':
        result = await searchWeapons(db, args.query as string, args.type as string | undefined);
        break;
      case 'search_abilities':
        result = await searchAbilities(db, args.query as string, args.type as string | undefined);
        break;
      case 'get_keyword_info':
        result = await getKeywordInfo(db, args.keyword as string);
        break;
      case 'get_missions':
        result = await getMissions(db, args.type as string | undefined);
        break;
      case 'search_faqs':
        result = await searchFaqs(db, args.query as string, args.faction as string | undefined);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    };
  }
}

// Tool implementations

async function getCoreRules(db: Database, args: Record<string, unknown>) {
  const { category, search } = args as { category?: string; search?: string };

  let query = db.select().from(schema.coreRules);

  if (category) {
    query = query.where(eq(schema.coreRules.category, category)) as typeof query;
  }

  if (search) {
    query = query.where(
      or(
        ilike(schema.coreRules.title, `%${search}%`),
        ilike(schema.coreRules.content, `%${search}%`)
      )
    ) as typeof query;
  }

  const rules = await query.orderBy(schema.coreRules.orderIndex);
  return {
    count: rules.length,
    rules: rules.map((r) => ({
      title: r.title,
      category: r.category,
      subcategory: r.subcategory,
      content: r.content,
    })),
  };
}

async function listFactions(db: Database) {
  const factions = await db
    .select({
      name: schema.factions.name,
      slug: schema.factions.slug,
    })
    .from(schema.factions)
    .orderBy(schema.factions.name);

  return { count: factions.length, factions };
}

async function getFaction(db: Database, factionQuery: string) {
  const faction = await db
    .select()
    .from(schema.factions)
    .where(
      or(
        ilike(schema.factions.name, factionQuery),
        eq(schema.factions.slug, factionQuery.toLowerCase().replace(/\s+/g, '-'))
      )
    )
    .limit(1);

  if (!faction[0]) {
    return { error: `Faction not found: ${factionQuery}` };
  }

  return faction[0];
}

async function getDetachments(db: Database, factionQuery: string) {
  const faction = await findFaction(db, factionQuery);
  if (!faction) {
    return { error: `Faction not found: ${factionQuery}` };
  }

  const detachments = await db
    .select()
    .from(schema.detachments)
    .where(eq(schema.detachments.factionId, faction.id));

  return {
    faction: faction.name,
    count: detachments.length,
    detachments: detachments.map((d) => ({
      name: d.name,
      detachmentRuleName: d.detachmentRuleName,
      detachmentRule: d.detachmentRule,
    })),
  };
}

async function getDetachmentDetails(
  db: Database,
  factionQuery: string,
  detachmentQuery: string
) {
  const faction = await findFaction(db, factionQuery);
  if (!faction) {
    return { error: `Faction not found: ${factionQuery}` };
  }

  const [detachment] = await db
    .select()
    .from(schema.detachments)
    .where(
      and(
        eq(schema.detachments.factionId, faction.id),
        ilike(schema.detachments.name, `%${detachmentQuery}%`)
      )
    )
    .limit(1);

  if (!detachment) {
    return { error: `Detachment not found: ${detachmentQuery}` };
  }

  // Get stratagems for this detachment
  const stratagems = await db
    .select()
    .from(schema.stratagems)
    .where(eq(schema.stratagems.detachmentId, detachment.id));

  // Get enhancements for this detachment
  const enhancements = await db
    .select()
    .from(schema.enhancements)
    .where(eq(schema.enhancements.detachmentId, detachment.id));

  return {
    faction: faction.name,
    detachment: {
      name: detachment.name,
      detachmentRuleName: detachment.detachmentRuleName,
      detachmentRule: detachment.detachmentRule,
      lore: detachment.lore,
    },
    stratagems: stratagems.map((s) => ({
      name: s.name,
      cpCost: s.cpCost,
      phase: s.phase,
      when: s.when,
      target: s.target,
      effect: s.effect,
    })),
    enhancements: enhancements.map((e) => ({
      name: e.name,
      pointsCost: e.pointsCost,
      description: e.description,
      restrictions: e.restrictions,
    })),
  };
}

async function searchUnits(db: Database, query: string, factionQuery?: string) {
  let searchQuery = db
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
    .where(ilike(schema.units.name, `%${query}%`));

  if (factionQuery) {
    const faction = await findFaction(db, factionQuery);
    if (faction) {
      searchQuery = searchQuery.where(
        and(
          ilike(schema.units.name, `%${query}%`),
          eq(schema.units.factionId, faction.id)
        )
      ) as typeof searchQuery;
    }
  }

  const units = await searchQuery.limit(20);
  return { count: units.length, units };
}

async function getUnit(db: Database, unitQuery: string, factionQuery?: string) {
  let baseQuery = db
    .select()
    .from(schema.units)
    .innerJoin(schema.factions, eq(schema.units.factionId, schema.factions.id))
    .where(ilike(schema.units.name, `%${unitQuery}%`));

  if (factionQuery) {
    const faction = await findFaction(db, factionQuery);
    if (faction) {
      baseQuery = baseQuery.where(
        and(
          ilike(schema.units.name, `%${unitQuery}%`),
          eq(schema.units.factionId, faction.id)
        )
      ) as typeof baseQuery;
    }
  }

  const [result] = await baseQuery.limit(1);

  if (!result) {
    return { error: `Unit not found: ${unitQuery}` };
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
    faction: result.factions.name,
    unit: {
      name: unit.name,
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
    weapons,
    abilities,
    keywords: keywords.map((k) => k.name),
  };
}

async function getStratagems(
  db: Database,
  factionQuery: string,
  detachmentQuery?: string,
  phase?: string
) {
  const faction = await findFaction(db, factionQuery);
  if (!faction) {
    return { error: `Faction not found: ${factionQuery}` };
  }

  let query = db
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
    .where(eq(schema.stratagems.factionId, faction.id));

  if (phase) {
    query = query.where(
      and(
        eq(schema.stratagems.factionId, faction.id),
        eq(schema.stratagems.phase, phase as any)
      )
    ) as typeof query;
  }

  const stratagems = await query;
  return { faction: faction.name, count: stratagems.length, stratagems };
}

async function getEnhancements(
  db: Database,
  factionQuery: string,
  detachmentQuery?: string
) {
  const faction = await findFaction(db, factionQuery);
  if (!faction) {
    return { error: `Faction not found: ${factionQuery}` };
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
    .where(eq(schema.detachments.factionId, faction.id));

  return { faction: faction.name, count: enhancements.length, enhancements };
}

async function searchWeapons(db: Database, query: string, type?: string) {
  let searchQuery = db
    .select()
    .from(schema.weapons)
    .where(ilike(schema.weapons.name, `%${query}%`));

  if (type) {
    searchQuery = searchQuery.where(
      and(
        ilike(schema.weapons.name, `%${query}%`),
        eq(schema.weapons.weaponType, type as any)
      )
    ) as typeof searchQuery;
  }

  const weapons = await searchQuery.limit(20);
  return { count: weapons.length, weapons };
}

async function searchAbilities(db: Database, query: string, type?: string) {
  let searchQuery = db
    .select()
    .from(schema.abilities)
    .where(
      or(
        ilike(schema.abilities.name, `%${query}%`),
        ilike(schema.abilities.description, `%${query}%`)
      )
    );

  if (type) {
    searchQuery = searchQuery.where(
      and(
        or(
          ilike(schema.abilities.name, `%${query}%`),
          ilike(schema.abilities.description, `%${query}%`)
        ),
        eq(schema.abilities.abilityType, type)
      )
    ) as typeof searchQuery;
  }

  const abilities = await searchQuery.limit(20);
  return { count: abilities.length, abilities };
}

async function getKeywordInfo(db: Database, keyword: string) {
  const [result] = await db
    .select()
    .from(schema.keywords)
    .where(ilike(schema.keywords.name, keyword))
    .limit(1);

  if (!result) {
    return { error: `Keyword not found: ${keyword}` };
  }

  return result;
}

async function getMissions(db: Database, type?: string) {
  let query = db.select().from(schema.missions);

  if (type) {
    query = query.where(eq(schema.missions.missionType, type)) as typeof query;
  }

  const missions = await query;
  return { count: missions.length, missions };
}

async function searchFaqs(db: Database, query: string, factionQuery?: string) {
  let searchQuery = db
    .select()
    .from(schema.faqs)
    .where(
      or(
        ilike(schema.faqs.question, `%${query}%`),
        ilike(schema.faqs.answer, `%${query}%`),
        ilike(schema.faqs.content, `%${query}%`)
      )
    );

  if (factionQuery) {
    const faction = await findFaction(db, factionQuery);
    if (faction) {
      searchQuery = searchQuery.where(
        and(
          or(
            ilike(schema.faqs.question, `%${query}%`),
            ilike(schema.faqs.answer, `%${query}%`),
            ilike(schema.faqs.content, `%${query}%`)
          ),
          eq(schema.faqs.factionId, faction.id)
        )
      ) as typeof searchQuery;
    }
  }

  const faqs = await searchQuery.limit(20);
  return { count: faqs.length, faqs };
}

// Helper function
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
