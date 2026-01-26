import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Database } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { eq, ilike, or, and, inArray } from 'drizzle-orm';
import {
  createValidationTools,
  handleValidationToolCall,
  VALIDATION_TOOL_NAMES,
} from './validation-tools.js';

/**
 * Space Marine chapter definitions.
 * Maps chapter names to their parent faction slug and chapter keyword.
 */
const SPACE_MARINE_CHAPTERS: Record<string, { parentFaction: string; keyword: string }> = {
  'blood angels': { parentFaction: 'space-marines', keyword: 'BLOOD ANGELS' },
  'dark angels': { parentFaction: 'space-marines', keyword: 'DARK ANGELS' },
  'space wolves': { parentFaction: 'space-marines', keyword: 'SPACE WOLVES' },
  'black templars': { parentFaction: 'space-marines', keyword: 'BLACK TEMPLARS' },
  'deathwatch': { parentFaction: 'space-marines', keyword: 'DEATHWATCH' },
  'ultramarines': { parentFaction: 'space-marines', keyword: 'ULTRAMARINES' },
  'imperial fists': { parentFaction: 'space-marines', keyword: 'IMPERIAL FISTS' },
  'white scars': { parentFaction: 'space-marines', keyword: 'WHITE SCARS' },
  'raven guard': { parentFaction: 'space-marines', keyword: 'RAVEN GUARD' },
  'salamanders': { parentFaction: 'space-marines', keyword: 'SALAMANDERS' },
  'iron hands': { parentFaction: 'space-marines', keyword: 'IRON HANDS' },
};

/**
 * Check if a query matches a Space Marine chapter.
 */
function getChapterInfo(query: string): { parentFaction: string; keyword: string } | null {
  const normalized = query.toLowerCase().trim();
  return SPACE_MARINE_CHAPTERS[normalized] ?? null;
}

export function createTools(): Tool[] {
  return [
    // Validation tools for LLM terminology validation
    ...createValidationTools(),

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
        'Get detailed information about a specific faction including army rules and lore. For Space Marine chapters (Blood Angels, Dark Angels, etc.), returns the parent Space Marines faction with chapter-specific context.',
      inputSchema: {
        type: 'object',
        properties: {
          faction: {
            type: 'string',
            description: 'Faction name or slug (e.g., "Space Marines", "necrons", "Aeldari"). Also accepts Space Marine chapter names like "Blood Angels", "Dark Angels", etc.',
          },
        },
        required: ['faction'],
      },
    },
    {
      name: 'list_chapters',
      description: 'List all Space Marine chapters with their unique units count. Useful for understanding chapter-specific content.',
      inputSchema: {
        type: 'object',
        properties: {},
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
        'Search for units by name across all factions or within a specific faction. For Space Marines, can filter by chapter keyword.',
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
          chapter: {
            type: 'string',
            description: 'Optional: filter Space Marine units by chapter keyword (e.g., "Blood Angels", "Dark Angels", "Space Wolves")',
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
  // Check if this is a validation tool
  if (VALIDATION_TOOL_NAMES.includes(name)) {
    return handleValidationToolCall(db, name, args);
  }

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
      case 'list_chapters':
        result = await listChapters(db);
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
        result = await searchUnits(
          db,
          args.query as string,
          args.faction as string | undefined,
          args.chapter as string | undefined
        );
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

async function listChapters(db: Database) {
  const chapters = [];

  for (const [chapterName, info] of Object.entries(SPACE_MARINE_CHAPTERS)) {
    // Find the chapter keyword
    const chapterKeyword = await db
      .select()
      .from(schema.keywords)
      .where(ilike(schema.keywords.name, info.keyword))
      .limit(1);

    let unitCount = 0;
    let sampleUnits: string[] = [];

    if (chapterKeyword[0]) {
      // Get unit IDs with this chapter keyword
      const unitIdsWithKeyword = await db
        .select({ unitId: schema.unitKeywords.unitId })
        .from(schema.unitKeywords)
        .where(eq(schema.unitKeywords.keywordId, chapterKeyword[0].id));

      unitCount = unitIdsWithKeyword.length;

      // Get sample unit names
      if (unitIdsWithKeyword.length > 0) {
        const sampleUnitIds = unitIdsWithKeyword.slice(0, 3).map(u => u.unitId);
        const sampleUnitRecords = await db
          .select({ name: schema.units.name })
          .from(schema.units)
          .where(inArray(schema.units.id, sampleUnitIds));
        sampleUnits = sampleUnitRecords.map(u => u.name);
      }
    }

    // Capitalize chapter name for display
    const displayName = chapterName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    chapters.push({
      name: displayName,
      keyword: info.keyword,
      parentFaction: 'Space Marines',
      uniqueUnitsCount: unitCount,
      sampleUnits,
    });
  }

  // Sort by unit count descending
  chapters.sort((a, b) => b.uniqueUnitsCount - a.uniqueUnitsCount);

  return {
    count: chapters.length,
    chapters,
    note: 'Space Marine chapters share the core Space Marines army rules but have chapter-specific units. Use search_units with chapter filter to find chapter-specific units.',
  };
}

async function getFaction(db: Database, factionQuery: string) {
  // Check if this is a Space Marine chapter
  const chapterInfo = getChapterInfo(factionQuery);

  if (chapterInfo) {
    // Get the parent Space Marines faction
    const faction = await db
      .select()
      .from(schema.factions)
      .where(eq(schema.factions.slug, chapterInfo.parentFaction))
      .limit(1);

    if (!faction[0]) {
      return { error: `Parent faction not found: ${chapterInfo.parentFaction}` };
    }

    // Get chapter-specific units count
    const chapterKeyword = await db
      .select()
      .from(schema.keywords)
      .where(ilike(schema.keywords.name, chapterInfo.keyword))
      .limit(1);

    let chapterUnitCount = 0;
    if (chapterKeyword[0]) {
      const unitKeywordLinks = await db
        .select({ unitId: schema.unitKeywords.unitId })
        .from(schema.unitKeywords)
        .where(eq(schema.unitKeywords.keywordId, chapterKeyword[0].id));
      chapterUnitCount = unitKeywordLinks.length;
    }

    return {
      ...faction[0],
      isChapter: true,
      chapterName: factionQuery,
      chapterKeyword: chapterInfo.keyword,
      chapterUnitCount,
      note: `${factionQuery} is a Space Marine chapter. They share the core Space Marines army rules but have ${chapterUnitCount} chapter-specific units with the "${chapterInfo.keyword}" keyword.`,
    };
  }

  // Standard faction lookup
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

async function searchUnits(db: Database, query: string, factionQuery?: string, chapterQuery?: string) {
  // Check if chapter is a Space Marine chapter
  const chapterInfo = chapterQuery ? getChapterInfo(chapterQuery) : null;

  // Build WHERE condition first
  let whereCondition = ilike(schema.units.name, `%${query}%`);

  // If chapter specified, use the parent faction (Space Marines)
  const effectiveFactionQuery = chapterInfo ? chapterInfo.parentFaction : factionQuery;

  if (effectiveFactionQuery) {
    const faction = await findFaction(db, effectiveFactionQuery);
    if (faction) {
      whereCondition = and(
        ilike(schema.units.name, `%${query}%`),
        eq(schema.units.factionId, faction.id)
      )!;
    }
  }

  // If chapter filtering, we need to get units with that keyword
  if (chapterInfo) {
    // Find the chapter keyword
    const chapterKeyword = await db
      .select()
      .from(schema.keywords)
      .where(ilike(schema.keywords.name, chapterInfo.keyword))
      .limit(1);

    if (chapterKeyword[0]) {
      // Get unit IDs with this chapter keyword
      const unitIdsWithKeyword = await db
        .select({ unitId: schema.unitKeywords.unitId })
        .from(schema.unitKeywords)
        .where(eq(schema.unitKeywords.keywordId, chapterKeyword[0].id));

      const unitIds = unitIdsWithKeyword.map(u => u.unitId);

      if (unitIds.length > 0) {
        whereCondition = and(
          ilike(schema.units.name, `%${query}%`),
          inArray(schema.units.id, unitIds)
        )!;
      } else {
        // No units with this chapter keyword found
        return {
          count: 0,
          units: [],
          chapter: chapterInfo.keyword,
          note: `No units found with the "${chapterInfo.keyword}" keyword. You may need to re-scrape units to populate keywords.`,
        };
      }
    } else {
      return {
        count: 0,
        units: [],
        chapter: chapterInfo.keyword,
        note: `Chapter keyword "${chapterInfo.keyword}" not found in database. You may need to re-scrape units to populate keywords.`,
      };
    }
  }

  const units = await db
    .select({
      id: schema.units.id,
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

  const result: {
    count: number;
    units: typeof units;
    chapter?: string;
  } = { count: units.length, units };

  if (chapterInfo) {
    result.chapter = chapterInfo.keyword;
  }

  return result;
}

async function getUnit(db: Database, unitQuery: string, factionQuery?: string) {
  // Build WHERE condition first
  let whereCondition = ilike(schema.units.name, `%${unitQuery}%`);

  if (factionQuery) {
    const faction = await findFaction(db, factionQuery);
    if (faction) {
      whereCondition = and(
        ilike(schema.units.name, `%${unitQuery}%`),
        eq(schema.units.factionId, faction.id)
      )!;
    }
  }

  const results = await db
    .select()
    .from(schema.units)
    .innerJoin(schema.factions, eq(schema.units.factionId, schema.factions.id))
    .where(whereCondition)
    .limit(1);

  const result = results[0];

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
  _detachmentQuery?: string,
  phase?: string
) {
  const faction = await findFaction(db, factionQuery);
  if (!faction) {
    return { error: `Faction not found: ${factionQuery}` };
  }

  // Build WHERE condition first
  let whereCondition = eq(schema.stratagems.factionId, faction.id);

  if (phase) {
    whereCondition = and(
      eq(schema.stratagems.factionId, faction.id),
      eq(schema.stratagems.phase, phase as any)
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

  return { faction: faction.name, count: stratagems.length, stratagems };
}

async function getEnhancements(
  db: Database,
  factionQuery: string,
  _detachmentQuery?: string
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
  // Build WHERE condition first
  let whereCondition = ilike(schema.weapons.name, `%${query}%`);

  if (type) {
    whereCondition = and(
      ilike(schema.weapons.name, `%${query}%`),
      eq(schema.weapons.weaponType, type as any)
    )!;
  }

  const weapons = await db
    .select()
    .from(schema.weapons)
    .where(whereCondition)
    .limit(20);

  return { count: weapons.length, weapons };
}

async function searchAbilities(db: Database, query: string, type?: string) {
  // Build WHERE condition first
  let whereCondition = or(
    ilike(schema.abilities.name, `%${query}%`),
    ilike(schema.abilities.description, `%${query}%`)
  );

  if (type) {
    whereCondition = and(
      or(
        ilike(schema.abilities.name, `%${query}%`),
        ilike(schema.abilities.description, `%${query}%`)
      ),
      eq(schema.abilities.abilityType, type)
    );
  }

  const abilities = await db
    .select()
    .from(schema.abilities)
    .where(whereCondition!)
    .limit(20);

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
  // Build WHERE condition first
  let whereCondition = or(
    ilike(schema.faqs.question, `%${query}%`),
    ilike(schema.faqs.answer, `%${query}%`),
    ilike(schema.faqs.content, `%${query}%`)
  );

  if (factionQuery) {
    const faction = await findFaction(db, factionQuery);
    if (faction) {
      whereCondition = and(
        or(
          ilike(schema.faqs.question, `%${query}%`),
          ilike(schema.faqs.answer, `%${query}%`),
          ilike(schema.faqs.content, `%${query}%`)
        ),
        eq(schema.faqs.factionId, faction.id)
      );
    }
  }

  const faqs = await db
    .select()
    .from(schema.faqs)
    .where(whereCondition!)
    .limit(20);

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
