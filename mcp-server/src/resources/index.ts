import type { Resource } from '@modelcontextprotocol/sdk/types.js';
import type { Database } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function createResources(db: Database): Promise<Resource[]> {
  const resources: Resource[] = [];

  // Core rules as a resource
  resources.push({
    uri: 'wh40k://rules/core',
    name: 'Core Rules',
    description: 'Warhammer 40,000 10th Edition Core Rules',
    mimeType: 'text/markdown',
  });

  // Each faction as a resource
  const factions = await db.select().from(schema.factions);
  for (const faction of factions) {
    resources.push({
      uri: `wh40k://factions/${faction.slug}`,
      name: faction.name,
      description: `${faction.name} faction rules, units, and detachments`,
      mimeType: 'text/markdown',
    });

    // Detachments as sub-resources
    const detachments = await db
      .select()
      .from(schema.detachments)
      .where(eq(schema.detachments.factionId, faction.id));

    for (const detachment of detachments) {
      resources.push({
        uri: `wh40k://factions/${faction.slug}/detachments/${detachment.slug}`,
        name: `${faction.name} - ${detachment.name}`,
        description: `${detachment.name} detachment rules for ${faction.name}`,
        mimeType: 'text/markdown',
      });
    }
  }

  return resources;
}

export async function handleResourceRead(
  db: Database,
  uri: string
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  const url = new URL(uri);
  const pathParts = url.pathname.split('/').filter(Boolean);

  try {
    // Core rules
    if (pathParts[0] === 'rules' && pathParts[1] === 'core') {
      const rules = await db
        .select()
        .from(schema.coreRules)
        .orderBy(schema.coreRules.orderIndex);

      const markdown = formatCoreRules(rules);
      return {
        contents: [{ uri, mimeType: 'text/markdown', text: markdown }],
      };
    }

    // Faction resources
    if (pathParts[0] === 'factions') {
      const factionSlug = pathParts[1];

      if (!factionSlug) {
        throw new Error('Faction slug required');
      }

      const [faction] = await db
        .select()
        .from(schema.factions)
        .where(eq(schema.factions.slug, factionSlug))
        .limit(1);

      if (!faction) {
        throw new Error(`Faction not found: ${factionSlug}`);
      }

      // Detachment resource
      if (pathParts[2] === 'detachments' && pathParts[3]) {
        const detachmentSlug = pathParts[3];

        const [detachment] = await db
          .select()
          .from(schema.detachments)
          .where(eq(schema.detachments.slug, detachmentSlug))
          .limit(1);

        if (!detachment) {
          throw new Error(`Detachment not found: ${detachmentSlug}`);
        }

        const stratagems = await db
          .select()
          .from(schema.stratagems)
          .where(eq(schema.stratagems.detachmentId, detachment.id));

        const enhancements = await db
          .select()
          .from(schema.enhancements)
          .where(eq(schema.enhancements.detachmentId, detachment.id));

        const markdown = formatDetachment(faction, detachment, stratagems, enhancements);
        return {
          contents: [{ uri, mimeType: 'text/markdown', text: markdown }],
        };
      }

      // Faction overview resource
      const detachments = await db
        .select()
        .from(schema.detachments)
        .where(eq(schema.detachments.factionId, faction.id));

      const units = await db
        .select()
        .from(schema.units)
        .where(eq(schema.units.factionId, faction.id));

      const markdown = formatFaction(faction, detachments, units);
      return {
        contents: [{ uri, mimeType: 'text/markdown', text: markdown }],
      };
    }

    throw new Error(`Unknown resource: ${uri}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      contents: [
        { uri, mimeType: 'text/plain', text: `Error: ${message}` },
      ],
    };
  }
}

function formatCoreRules(rules: schema.CoreRule[]): string {
  let markdown = '# Warhammer 40,000 10th Edition Core Rules\n\n';

  // Group by category
  const byCategory = new Map<string, schema.CoreRule[]>();
  for (const rule of rules) {
    const existing = byCategory.get(rule.category) || [];
    existing.push(rule);
    byCategory.set(rule.category, existing);
  }

  for (const [category, categoryRules] of byCategory) {
    markdown += `## ${formatCategoryName(category)}\n\n`;

    for (const rule of categoryRules) {
      if (rule.subcategory) {
        markdown += `### ${rule.title}\n\n`;
      } else {
        markdown += `### ${rule.title}\n\n`;
      }
      markdown += `${rule.content}\n\n`;
    }
  }

  return markdown;
}

function formatFaction(
  faction: schema.Faction,
  detachments: schema.Detachment[],
  units: schema.Unit[]
): string {
  let markdown = `# ${faction.name}\n\n`;

  if (faction.lore) {
    markdown += `## Background\n\n${faction.lore}\n\n`;
  }

  if (faction.armyRules) {
    markdown += `## Army Rules\n\n${faction.armyRules}\n\n`;
  }

  markdown += `## Detachments (${detachments.length})\n\n`;
  for (const detachment of detachments) {
    markdown += `- **${detachment.name}**`;
    if (detachment.detachmentRuleName) {
      markdown += ` - ${detachment.detachmentRuleName}`;
    }
    markdown += '\n';
  }
  markdown += '\n';

  markdown += `## Units (${units.length})\n\n`;
  const sortedUnits = [...units].sort((a, b) => a.name.localeCompare(b.name));
  for (const unit of sortedUnits) {
    markdown += `- ${unit.name}`;
    if (unit.pointsCost) {
      markdown += ` (${unit.pointsCost} pts)`;
    }
    if (unit.isEpicHero) {
      markdown += ' [Epic Hero]';
    }
    if (unit.isBattleline) {
      markdown += ' [Battleline]';
    }
    markdown += '\n';
  }

  return markdown;
}

function formatDetachment(
  faction: schema.Faction,
  detachment: schema.Detachment,
  stratagems: schema.Stratagem[],
  enhancements: schema.Enhancement[]
): string {
  let markdown = `# ${faction.name} - ${detachment.name}\n\n`;

  if (detachment.lore) {
    markdown += `${detachment.lore}\n\n`;
  }

  if (detachment.detachmentRuleName) {
    markdown += `## ${detachment.detachmentRuleName}\n\n`;
    markdown += `${detachment.detachmentRule || ''}\n\n`;
  }

  if (stratagems.length > 0) {
    markdown += `## Stratagems (${stratagems.length})\n\n`;
    for (const strat of stratagems) {
      markdown += `### ${strat.name} (${strat.cpCost} CP)\n`;
      markdown += `**Phase:** ${strat.phase}\n\n`;
      if (strat.when) markdown += `**When:** ${strat.when}\n\n`;
      if (strat.target) markdown += `**Target:** ${strat.target}\n\n`;
      markdown += `**Effect:** ${strat.effect}\n\n`;
    }
  }

  if (enhancements.length > 0) {
    markdown += `## Enhancements (${enhancements.length})\n\n`;
    for (const enh of enhancements) {
      markdown += `### ${enh.name} (${enh.pointsCost} pts)\n\n`;
      markdown += `${enh.description}\n\n`;
      if (enh.restrictions) {
        markdown += `*Restrictions: ${enh.restrictions}*\n\n`;
      }
    }
  }

  return markdown;
}

function formatCategoryName(category: string): string {
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
