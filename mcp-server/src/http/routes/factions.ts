import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/connection.js';
import * as schema from '../../db/schema.js';
import { eq, ilike, or } from 'drizzle-orm';

interface FactionParams {
  name: string;
}

interface ArmyRuleSubAbility {
  name: string;
  lore: string | null;
  effect: string;
}

interface ParsedArmyRule {
  name: string | null;
  lore: string | null;
  effect: string | null;
  subAbilities: ArmyRuleSubAbility[];
}

/**
 * Parse army rules markdown into structured components.
 *
 * Expected format:
 * ### Rule Name
 *
 * Lore text (italicized paragraph)
 *
 * Effect text (rules mechanics)
 *
 * |     |
 * | --- |
 * | Sub-ability Name<br>Sub-ability lore<br>Sub-ability effect |
 */
function parseArmyRules(markdown: string | null): ParsedArmyRule {
  const result: ParsedArmyRule = {
    name: null,
    lore: null,
    effect: null,
    subAbilities: [],
  };

  if (!markdown) return result;

  // Extract rule name from ### heading
  const nameMatch = markdown.match(/^###\s+(.+?)$/m);
  if (nameMatch?.[1]) {
    result.name = nameMatch[1].trim();
  }

  // Remove the heading line for further parsing
  let content = markdown.replace(/^###\s+.+?\n+/m, '').trim();

  // Split content into paragraphs
  const paragraphs = content.split(/\n\n+/);

  // Find the first paragraph that looks like rules (contains game mechanics keywords)
  const rulesKeywords = [
    /\beach time\b/i,
    /\bselect\b.*\b(one|unit|model)\b/i,
    /\bunits? from your army\b/i,
    /\bmodels? in this unit\b/i,
    /\bhas the\b.*\bability\b/i,
    /\bgains?\b.*\bability\b/i,
    /\buntil\b.*\b(finished|end of)\b/i,
  ];

  const isRulesParagraph = (p: string) => rulesKeywords.some(k => k.test(p));

  // Find first rules paragraph index
  let firstRulesIdx = paragraphs.findIndex(p => isRulesParagraph(p) && !p.startsWith('|'));

  // Everything before first rules paragraph is lore
  if (firstRulesIdx > 0) {
    result.lore = paragraphs.slice(0, firstRulesIdx).join('\n\n').trim();
  }

  // Find effect text (all paragraphs from first rules paragraph until tables)
  const effectParagraphs: string[] = [];
  for (let i = Math.max(0, firstRulesIdx); i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (!p) continue;
    // Stop when we hit a table
    if (p.startsWith('|')) break;
    // Include all paragraphs, not just those matching rules keywords
    effectParagraphs.push(p);
  }
  if (effectParagraphs.length > 0) {
    result.effect = effectParagraphs.join('\n\n').trim();
  }

  // Parse sub-abilities from markdown tables
  // Format: | Sub-ability Name<br>Lore text<br>Effect text |
  const tableRowPattern = /\|\s*([^|]+?)\s*\|(?!\s*---)/g;
  let match;

  while ((match = tableRowPattern.exec(content)) !== null) {
    const cellContent = match[1]?.trim();

    // Skip header separators and empty cells
    if (!cellContent || cellContent === '---' || cellContent.match(/^[-:\s]+$/)) {
      continue;
    }

    // Split by <br> to get parts
    const parts = cellContent.split(/<br\s*\/?>/i).map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) continue;

    // First part is the name
    const subName = parts[0];
    if (!subName) continue;

    // Find the effect part (contains [KEYWORD] or ability references)
    let subLore: string | null = null;
    let subEffect = '';

    if (parts.length >= 3) {
      // Format: Name, Lore, Effect
      subLore = parts[1] || null;
      subEffect = parts.slice(2).join(' ');
    } else if (parts.length === 2) {
      // Format: Name, Effect (or Name, Lore if no keywords)
      const secondPart = parts[1] || '';
      if (secondPart.includes('[') || secondPart.toLowerCase().includes('ability')) {
        subEffect = secondPart;
      } else {
        subLore = secondPart;
      }
    }

    result.subAbilities.push({
      name: subName,
      lore: subLore,
      effect: subEffect,
    });
  }

  return result;
}

export function registerFactionRoutes(fastify: FastifyInstance, db: Database): void {
  // Get a specific faction by name with army rules
  fastify.get<{ Params: FactionParams }>(
    '/api/factions/:name',
    async (request, reply) => {
      const { name } = request.params;
      const decodedName = decodeURIComponent(name);

      // Normalize faction name for matching - handle apostrophes in slug
      const normalizedName = decodedName.toLowerCase().replace(/'/g, '-').replace(/\s+/g, '-');

      const [faction] = await db
        .select({
          name: schema.factions.name,
          armyRules: schema.factions.armyRules,
          sourceUrl: schema.factions.sourceUrl,
        })
        .from(schema.factions)
        .where(
          or(
            ilike(schema.factions.name, `%${decodedName}%`),
            eq(schema.factions.slug, normalizedName)
          )
        )
        .limit(1);

      if (!faction) {
        return reply.status(404).send({
          error: `Faction not found: ${decodedName}`
        });
      }

      const parsed = parseArmyRules(faction.armyRules);

      return {
        faction: {
          name: faction.name,
          armyRuleName: parsed.name,
          armyRuleLore: parsed.lore,
          armyRuleEffect: parsed.effect,
          armyRuleSubAbilities: parsed.subAbilities,
          // Legacy field for backwards compatibility
          armyRule: faction.armyRules,
          sourceUrl: faction.sourceUrl,
        },
      };
    }
  );
}
