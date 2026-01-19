import type { NewFaction, NewDetachment, NewStratagem, NewEnhancement } from '../../db/schema.js';

interface ParsedFaction {
  faction: NewFaction;
  detachments: Omit<NewDetachment, 'factionId'>[];
  stratagems: Omit<NewStratagem, 'factionId' | 'detachmentId'>[];
  enhancements: Omit<NewEnhancement, 'detachmentId'>[];
}

/**
 * Parse faction index page to get list of all factions
 */
export function parseFactionIndex(markdown: string, sourceUrl: string): NewFaction[] {
  const factions: NewFaction[] = [];

  // Look for faction links in format [Faction Name](/wh40k10ed/factions/faction-slug/)
  const factionLinkRegex = /\[([^\]]+)\]\(\/wh40k10ed\/factions\/([^/)]+)\/?[^)]*\)/g;
  let match;

  while ((match = factionLinkRegex.exec(markdown)) !== null) {
    const name = match[1]?.trim();
    const slug = match[2]?.trim();

    if (name && slug && !factions.find((f) => f.slug === slug)) {
      factions.push({
        slug,
        name,
        wahapediaPath: `/wh40k10ed/factions/${slug}/`,
        sourceUrl,
        dataSource: 'wahapedia' as const,
      });
    }
  }

  return factions;
}

/**
 * Parse a faction's main page for army rules and lore
 */
export function parseFactionPage(
  markdown: string,
  factionSlug: string,
  factionName: string,
  sourceUrl: string
): NewFaction {
  let armyRules = '';
  let lore = '';

  // Try to extract army rules section
  const armyRulesMatch = markdown.match(/## Army Rules?\s*([\s\S]*?)(?=##|$)/i);
  if (armyRulesMatch?.[1]) {
    armyRules = armyRulesMatch[1].trim();
  }

  // Try to extract lore/background
  const loreMatch = markdown.match(
    /## (?:Background|Lore|About|Introduction)\s*([\s\S]*?)(?=##|$)/i
  );
  if (loreMatch?.[1]) {
    lore = loreMatch[1].trim();
  }

  // If no explicit lore section, take the intro text before first ##
  if (!lore) {
    const introMatch = markdown.match(/^([\s\S]*?)(?=##)/);
    if (introMatch?.[1] && introMatch[1].trim().length > 100) {
      lore = introMatch[1].trim();
    }
  }

  return {
    slug: factionSlug,
    name: factionName,
    armyRules: armyRules || null,
    lore: lore || null,
    wahapediaPath: `/wh40k10ed/factions/${factionSlug}/`,
    sourceUrl,
    dataSource: 'wahapedia' as const,
  };
}

/**
 * Parse detachments page for a faction
 */
export function parseDetachments(
  markdown: string,
  sourceUrl: string
): Omit<NewDetachment, 'factionId'>[] {
  const detachments: Omit<NewDetachment, 'factionId'>[] = [];

  // Split by h2 headers to get each detachment
  const sections = markdown.split(/^## /m).filter(Boolean);

  for (const section of sections) {
    const lines = section.split('\n');
    const name = lines[0]?.trim();

    if (!name || name.toLowerCase().includes('detachment')) {
      // Skip header sections
      continue;
    }

    const content = lines.slice(1).join('\n');

    // Extract detachment rule
    let detachmentRule = '';
    let detachmentRuleName = '';

    // Look for the rule name and description
    const ruleNameMatch = content.match(/### ([^\n]+)/);
    if (ruleNameMatch?.[1]) {
      detachmentRuleName = ruleNameMatch[1].trim();
    }

    // The rule text usually follows the name
    const ruleMatch = content.match(/### [^\n]+\n([\s\S]*?)(?=###|$)/);
    if (ruleMatch?.[1]) {
      detachmentRule = ruleMatch[1].trim();
    }

    // Extract lore if present
    const loreMatch = content.match(/(?:^|\n)([A-Z][^#\n]*(?:\n(?![#\-\*])[^\n]+)*)/);
    const lore = loreMatch?.[1]?.trim() || null;

    detachments.push({
      slug: slugify(name),
      name,
      detachmentRuleName: detachmentRuleName || null,
      detachmentRule: detachmentRule || null,
      lore,
      sourceUrl,
      dataSource: 'wahapedia' as const,
    });
  }

  return detachments;
}

/**
 * Parse stratagems from a detachment or faction page
 */
export function parseStratagems(
  markdown: string,
  sourceUrl: string
): Omit<NewStratagem, 'factionId' | 'detachmentId'>[] {
  const stratagems: Omit<NewStratagem, 'factionId' | 'detachmentId'>[] = [];

  // Stratagems are usually in a table or list format
  // Look for stratagem patterns

  // Pattern 1: Table format with headers
  const tableMatch = markdown.match(
    /\|.*Name.*\|.*CP.*\|.*Phase.*\|[\s\S]*?\n\|[-\s|]+\|\n([\s\S]*?)(?=\n\n|$)/i
  );

  if (tableMatch?.[1]) {
    const rows = tableMatch[1].split('\n').filter((r) => r.includes('|'));
    for (const row of rows) {
      const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 3) {
        stratagems.push(parseStratagemRow(cells, sourceUrl));
      }
    }
  }

  // Pattern 2: Block format
  const blockPattern = /### ([^\n]+)\n(?:.*?CP[:\s]*(\d+))?[\s\S]*?(?:WHEN|When)[:\s]*([^\n]+)[\s\S]*?(?:TARGET|Target)[:\s]*([^\n]+)[\s\S]*?(?:EFFECT|Effect)[:\s]*([\s\S]*?)(?=###|$)/g;
  let match;

  while ((match = blockPattern.exec(markdown)) !== null) {
    const name = match[1]?.trim();
    const cpCost = match[2] || '1';
    const when = match[3]?.trim();
    const target = match[4]?.trim();
    const effect = match[5]?.trim();

    if (name && effect) {
      stratagems.push({
        slug: slugify(name),
        name,
        cpCost,
        phase: detectPhase(when || ''),
        when: when ?? null,
        target: target ?? null,
        effect,
        sourceUrl,
        dataSource: 'wahapedia' as const,
        isCore: false,
      });
    }
  }

  return stratagems;
}

function parseStratagemRow(
  cells: string[],
  sourceUrl: string
): Omit<NewStratagem, 'factionId' | 'detachmentId'> {
  const name = cells[0] || 'Unknown';
  const cpCost = cells[1] || '1';
  const phase = cells[2] || '';
  const effect = cells[3] || '';

  return {
    slug: slugify(name),
    name,
    cpCost,
    phase: detectPhase(phase),
    effect,
    sourceUrl,
    dataSource: 'wahapedia' as const,
    isCore: false,
    when: null,
    target: null,
    restrictions: null,
  };
}

/**
 * Parse enhancements from a detachment page
 */
export function parseEnhancements(
  markdown: string,
  sourceUrl: string
): Omit<NewEnhancement, 'detachmentId'>[] {
  const enhancements: Omit<NewEnhancement, 'detachmentId'>[] = [];

  // Look for enhancement patterns
  // Pattern: ### Enhancement Name (X pts)
  const enhancementPattern =
    /### ([^\n(]+)\s*\((\d+)\s*(?:pts?|points)?\)\n([\s\S]*?)(?=###|$)/gi;
  let match;

  while ((match = enhancementPattern.exec(markdown)) !== null) {
    const name = match[1]?.trim();
    const pointsCost = parseInt(match[2] || '0', 10);
    const description = match[3]?.trim();

    if (name && description) {
      // Check for restrictions
      const restrictionsMatch = description.match(/(?:Restriction|Only)[:\s]*([^\n]+)/i);
      const restrictions = restrictionsMatch?.[1]?.trim() || null;

      enhancements.push({
        slug: slugify(name),
        name,
        pointsCost,
        description,
        restrictions,
        sourceUrl,
        dataSource: 'wahapedia' as const,
      });
    }
  }

  return enhancements;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function detectPhase(text: string): 'command' | 'movement' | 'shooting' | 'charge' | 'fight' | 'any' {
  const lower = text.toLowerCase();

  if (lower.includes('command')) return 'command';
  if (lower.includes('movement')) return 'movement';
  if (lower.includes('shooting')) return 'shooting';
  if (lower.includes('charge')) return 'charge';
  if (lower.includes('fight')) return 'fight';

  return 'any';
}

export { ParsedFaction };
