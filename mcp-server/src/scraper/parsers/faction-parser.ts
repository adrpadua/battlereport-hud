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
 * Parse detachments from faction main page
 * Structure: ## DetachmentName -> ## Detachment Rule -> ## Enhancements -> ## Stratagems
 * Each is a separate ## section
 */
export function parseDetachments(
  markdown: string,
  sourceUrl: string
): Omit<NewDetachment, 'factionId'>[] {
  const detachments: Omit<NewDetachment, 'factionId'>[] = [];

  // Section names that are NOT detachment names
  const systemSections = [
    'detachment rule', 'enhancements', 'stratagems', 'army rules',
    'datasheets', 'books', 'introduction', 'contents', 'boarding actions',
    'crusade rules', 'allied units', 'requisitions', 'agendas', 'battle traits',
    'kindred legend', 'not found', 'void salvagers', 'hearthfire strike'
  ];

  // Split by ## headers
  const sections = markdown.split(/^## /m).filter(Boolean);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const lines = section.split('\n');
    const name = lines[0]?.trim();

    if (!name) continue;

    const nameLower = name.toLowerCase();

    // Skip system sections
    if (systemSections.some(sys => nameLower === sys || nameLower.startsWith(sys))) {
      continue;
    }

    // Check if next section is "Detachment Rule" - that confirms this is a detachment
    const nextSection = sections[i + 1];
    if (!nextSection) continue;

    const nextName = nextSection.split('\n')[0]?.trim().toLowerCase();
    if (nextName !== 'detachment rule') {
      continue;
    }

    // This is a valid detachment!
    // Extract lore from current section
    const lore = lines.slice(1).join('\n').trim().slice(0, 1000) || null;

    // Get detachment rule from next section
    let detachmentRuleName = '';
    let detachmentRule = '';

    const ruleContent = nextSection.split('\n').slice(1).join('\n');
    const ruleNameMatch = ruleContent.match(/^### ([^\n]+)/m);
    if (ruleNameMatch?.[1]) {
      detachmentRuleName = ruleNameMatch[1].trim();
    }
    const ruleTextMatch = ruleContent.match(/### [^\n]+\n([\s\S]*?)(?=## |$)/);
    if (ruleTextMatch?.[1]) {
      detachmentRule = ruleTextMatch[1].trim().slice(0, 2000);
    }

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
 * Parse stratagems from faction page
 * Wahapedia format:
 * STRATAGEM NAME
 * 1CP
 * {Detachment} – {Type} Stratagem
 * Description...
 * **WHEN:** ...
 * **TARGET:** ...
 * **EFFECT:** ...
 */
export function parseStratagems(
  markdown: string,
  sourceUrl: string
): Omit<NewStratagem, 'factionId' | 'detachmentId'>[] {
  const stratagems: Omit<NewStratagem, 'factionId' | 'detachmentId'>[] = [];
  const seen = new Set<string>();

  // Pattern: ALL CAPS NAME followed by CP cost and "Stratagem" type
  // Example: VOID HARDENED\n1CP\nNeedgaârd Oathband – Wargear Stratagem
  const stratagemPattern = /([A-Z][A-Z\s']+)\n(\d+)CP\n([^\n]+Stratagem)\n([\s\S]*?)(?=\n[A-Z][A-Z\s']+\n\d+CP|## |$)/g;

  let match;
  while ((match = stratagemPattern.exec(markdown)) !== null) {
    const name = match[1]?.trim();
    const cpCost = match[2] || '1';
    const typeInfo = match[3]?.trim() || '';
    const content = match[4] || '';

    if (!name || seen.has(name)) continue;
    seen.add(name);

    // Extract WHEN, TARGET, EFFECT
    const whenMatch = content.match(/\*\*WHEN:\*\*\s*([^\n]+(?:\n(?!\*\*)[^\n]+)*)/i);
    const targetMatch = content.match(/\*\*TARGET:\*\*\s*([^\n]+(?:\n(?!\*\*)[^\n]+)*)/i);
    const effectMatch = content.match(/\*\*EFFECT:\*\*\s*([^\n]+(?:\n(?!\*\*)[^\n]+)*)/i);

    const when = whenMatch?.[1]?.trim() || null;
    const target = targetMatch?.[1]?.trim() || null;
    const effect = effectMatch?.[1]?.trim() || '';

    // Determine stratagem type from typeInfo (reserved for future use)
    let _stratagemType = 'other';
    if (typeInfo.includes('Battle Tactic')) _stratagemType = 'battle_tactic';
    else if (typeInfo.includes('Strategic Ploy')) _stratagemType = 'strategic_ploy';
    else if (typeInfo.includes('Wargear')) _stratagemType = 'wargear';
    void _stratagemType; // Suppress unused variable warning

    stratagems.push({
      slug: slugify(name),
      name,
      cpCost,
      phase: detectPhase(when || ''),
      when,
      target,
      effect: effect.slice(0, 2000), // Limit length
      sourceUrl,
      dataSource: 'wahapedia' as const,
      isCore: false,
    });
  }

  return stratagems;
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

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function detectPhase(text: string): 'command' | 'movement' | 'shooting' | 'charge' | 'fight' | 'any' {
  const lower = text.toLowerCase();

  if (lower.includes('command')) return 'command';
  if (lower.includes('movement')) return 'movement';
  if (lower.includes('shooting')) return 'shooting';
  if (lower.includes('charge')) return 'charge';
  if (lower.includes('fight')) return 'fight';

  return 'any';
}

export { ParsedFaction };
