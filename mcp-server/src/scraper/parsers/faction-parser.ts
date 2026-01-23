import type { NewFaction, NewDetachment, NewStratagem, NewEnhancement } from '../../db/schema.js';
import {
  FACTION_LINK,
  ARMY_RULES_PATTERNS,
  LORE_SECTION,
  INTRO_TEXT,
  SPLIT_H2,
  DETACHMENT_RULE_NAME,
  DETACHMENT_RULE_CONTENT,
  STRATAGEM_BLOCK,
  STRATAGEM_WHEN,
  STRATAGEM_TARGET,
  STRATAGEM_EFFECT,
  ENHANCEMENT_TABLE_ROW,
  ENHANCEMENT_NAME_POINTS,
  ENHANCEMENT_RESTRICTION,
} from './regex-patterns.js';
import {
  slugify,
  normalizeKeywords,
  detectPhase,
  DeduplicationTracker,
} from './utils.js';
import {
  CATEGORY_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PATH_MAX_LENGTH,
  CP_COST_MAX_LENGTH,
  SHORT_DESCRIPTION_MAX_LENGTH,
  MEDIUM_DESCRIPTION_MAX_LENGTH,
  truncateSlug,
  truncateName,
} from './constants.js';

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
  const seen = new DeduplicationTracker();

  // Look for faction links in format [Faction Name](/wh40k10ed/factions/faction-slug/)
  const factionLinkRegex = new RegExp(FACTION_LINK.source, 'g');
  let match;

  while ((match = factionLinkRegex.exec(markdown)) !== null) {
    const name = match[1]?.trim();
    const slug = match[2]?.trim();

    if (name && slug && seen.addIfNew(slug)) {
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

  // Try to extract army rules section using multiple patterns
  // Wahapedia formats vary - try several heading patterns
  for (const pattern of ARMY_RULES_PATTERNS) {
    const match = markdown.match(pattern);
    if (match?.[1]?.trim()) {
      armyRules = match[1].trim();
      break;
    }
  }

  // Try to extract lore/background
  const loreMatch = markdown.match(LORE_SECTION);
  if (loreMatch?.[1]) {
    lore = loreMatch[1].trim();
  }

  // If no explicit lore section, take the intro text before first ##
  if (!lore) {
    const introMatch = markdown.match(INTRO_TEXT);
    if (introMatch?.[1] && introMatch[1].trim().length > 100) {
      lore = introMatch[1].trim();
    }
  }

  return {
    slug: factionSlug.slice(0, CATEGORY_MAX_LENGTH),
    name: factionName.slice(0, NAME_MAX_LENGTH),
    armyRules: armyRules || null,
    lore: lore || null,
    wahapediaPath: `/wh40k10ed/factions/${factionSlug}/`.slice(0, PATH_MAX_LENGTH),
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
  const sections = markdown.split(SPLIT_H2).filter(Boolean);

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
    const lore = lines.slice(1).join('\n').trim().slice(0, SHORT_DESCRIPTION_MAX_LENGTH) || null;

    // Get detachment rule from next section
    let detachmentRuleName = '';
    let detachmentRule = '';

    const ruleContent = nextSection.split('\n').slice(1).join('\n');
    const ruleNameMatch = ruleContent.match(DETACHMENT_RULE_NAME);
    if (ruleNameMatch?.[1]) {
      detachmentRuleName = ruleNameMatch[1].trim();
    }
    const ruleTextMatch = ruleContent.match(DETACHMENT_RULE_CONTENT);
    if (ruleTextMatch?.[1]) {
      detachmentRule = ruleTextMatch[1].trim().slice(0, MEDIUM_DESCRIPTION_MAX_LENGTH);
    }

    detachments.push({
      slug: truncateSlug(slugify(name)),
      name: truncateName(name),
      detachmentRuleName: detachmentRuleName?.slice(0, NAME_MAX_LENGTH) || null,
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
 * Wahapedia format (with blank lines between sections):
 * STRATAGEM NAME
 *
 * 1CP
 *
 * {Detachment} – {Type} Stratagem
 *
 * Description...
 *
 * **WHEN:** ...
 * **TARGET:** ...
 * **EFFECT:** ...
 */
export function parseStratagems(
  markdown: string,
  sourceUrl: string
): Omit<NewStratagem, 'factionId' | 'detachmentId'>[] {
  const stratagems: Omit<NewStratagem, 'factionId' | 'detachmentId'>[] = [];
  const seen = new DeduplicationTracker(true); // Case-sensitive for stratagem names

  // Use centralized pattern for stratagem blocks
  const stratagemPattern = new RegExp(STRATAGEM_BLOCK.source, 'g');

  let match;
  while ((match = stratagemPattern.exec(markdown)) !== null) {
    const name = match[1]?.trim();
    const cpCost = match[2] || '1';
    const typeInfo = match[3]?.trim() || '';
    const content = match[4] || '';

    if (!name || !seen.addIfNew(name)) continue;

    // Skip if name is too short or looks like a header
    if (name.length < 4) continue;

    // Extract WHEN, TARGET, EFFECT and normalize concatenated keywords
    const whenMatch = content.match(STRATAGEM_WHEN);
    const targetMatch = content.match(STRATAGEM_TARGET);
    const effectMatch = content.match(STRATAGEM_EFFECT);

    const when = whenMatch?.[1]?.trim() ? normalizeKeywords(whenMatch[1].trim()) : null;
    const target = targetMatch?.[1]?.trim() ? normalizeKeywords(targetMatch[1].trim()) : null;
    const effect = effectMatch?.[1]?.trim() ? normalizeKeywords(effectMatch[1].trim()) : '';

    // Skip if we didn't find the core effect content
    if (!effect) continue;

    // Determine stratagem type from typeInfo (reserved for future use)
    let _stratagemType = 'other';
    if (typeInfo.includes('Battle Tactic')) _stratagemType = 'battle_tactic';
    else if (typeInfo.includes('Strategic Ploy')) _stratagemType = 'strategic_ploy';
    else if (typeInfo.includes('Wargear')) _stratagemType = 'wargear';
    void _stratagemType; // Suppress unused variable warning

    stratagems.push({
      slug: truncateSlug(slugify(name)),
      name: truncateName(name),
      cpCost: cpCost.slice(0, CP_COST_MAX_LENGTH),
      phase: detectPhase(when || ''),
      when,
      target,
      effect: effect.slice(0, MEDIUM_DESCRIPTION_MAX_LENGTH),
      sourceUrl,
      dataSource: 'wahapedia' as const,
      isCore: false,
    });
  }

  return stratagems;
}

/**
 * Parse enhancements from a detachment's Enhancements section.
 *
 * Wahapedia format (markdown table):
 * ## Enhancements
 *
 * |     |
 * | --- |
 * | - Enhancement Name XX pts<br>Lore description<br>RESTRICTION model only. Effect text |
 *
 * Each enhancement is in a table cell with <br> separating parts.
 */
export function parseEnhancements(
  markdown: string,
  sourceUrl: string
): Omit<NewEnhancement, 'detachmentId'>[] {
  const enhancements: Omit<NewEnhancement, 'detachmentId'>[] = [];
  const seen = new DeduplicationTracker();

  // Use centralized pattern for table rows
  const tableRowPattern = new RegExp(ENHANCEMENT_TABLE_ROW.source, 'g');
  let match;

  while ((match = tableRowPattern.exec(markdown)) !== null) {
    const cellContent = match[1]?.trim();
    if (!cellContent) continue;

    // Split by <br> to get parts
    const parts = cellContent.split(/<br\s*\/?>/i).map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) continue;

    // First part: "Enhancement Name XX pts"
    const firstPart = parts[0]!;
    const nameMatch = firstPart.match(ENHANCEMENT_NAME_POINTS);
    if (!nameMatch) continue;

    const name = nameMatch[1]?.trim();
    const pointsCost = parseInt(nameMatch[2] || '0', 10);

    if (!name || !seen.addIfNew(name)) continue;

    // Combine remaining parts as description
    const descriptionParts = parts.slice(1);
    const fullDescription = descriptionParts.join(' ').trim();

    // Extract restriction (e.g., "THOUSANDSONS model only.")
    const restrictionMatch = fullDescription.match(ENHANCEMENT_RESTRICTION);
    const restrictions = restrictionMatch?.[1]?.trim() || null;

    // Clean description - take lore text (second part usually) or full description
    let description = fullDescription;
    if (descriptionParts.length >= 2) {
      // First description part is usually lore, rest is rules
      const lore = descriptionParts[0] || '';
      const rules = descriptionParts.slice(1).join(' ');
      description = `${lore}\n\n${rules}`.trim();
    }

    enhancements.push({
      slug: truncateSlug(slugify(name)),
      name: truncateName(name),
      pointsCost,
      description: description.slice(0, MEDIUM_DESCRIPTION_MAX_LENGTH),
      restrictions,
      sourceUrl,
      dataSource: 'wahapedia' as const,
    });
  }

  return enhancements;
}

// Re-export utilities for backwards compatibility
export { slugify, detectPhase } from './utils.js';

/**
 * Extract a detachment's section content including its Enhancements section.
 * Returns the markdown from the detachment name header through its Stratagems section.
 */
export function extractDetachmentSection(markdown: string, detachmentName: string): string | null {
  // Split by ## headers
  const sections = markdown.split(SPLIT_H2).filter(Boolean);

  let collecting = false;
  let detachmentContent: string[] = [];

  for (const section of sections) {
    const headerLine = section.split('\n')[0]?.trim();

    if (headerLine?.toLowerCase() === detachmentName.toLowerCase()) {
      // Found the detachment, start collecting
      collecting = true;
      detachmentContent.push(`## ${section}`);
      continue;
    }

    if (collecting) {
      // Check if we hit the next detachment (has "Detachment Rule" as next section)
      const headerLower = headerLine?.toLowerCase() || '';

      // System sections that are part of the current detachment
      const detachmentSections = ['detachment rule', 'enhancements', 'stratagems'];
      if (detachmentSections.some(s => headerLower === s || headerLower.startsWith(s))) {
        detachmentContent.push(`## ${section}`);
        // If we hit Stratagems, we're at the end of this detachment's content
        if (headerLower === 'stratagems') {
          break;
        }
      } else {
        // Hit a new section that's not part of the detachment - stop
        break;
      }
    }
  }

  return detachmentContent.length > 0 ? detachmentContent.join('\n') : null;
}

export { ParsedFaction };
