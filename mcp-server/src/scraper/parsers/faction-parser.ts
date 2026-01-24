import * as cheerio from 'cheerio';
import type { NewFaction, NewDetachment, NewStratagem, NewEnhancement } from '../../db/schema.js';
import {
  slugify,
  normalizeKeywords,
  detectPhase,
  DeduplicationTracker,
  htmlToReadableText,
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
 * Parse a faction's main page for army rules and lore from HTML.
 */
export function parseFactionPage(
  html: string,
  factionSlug: string,
  factionName: string,
  sourceUrl: string
): NewFaction {
  const $ = cheerio.load(html);
  let armyRules = '';
  let lore = '';

  // Find Army Rules section by anchor name
  const armyRulesAnchor = $('a[name="Army-Rules"]');
  if (armyRulesAnchor.length) {
    // The army rule content is in a div.Columns2 that follows the Army-Rules anchor
    // Structure: <a name="Army-Rules"> <h2>Army Rules</h2> <div class="Columns2">...content...</div>
    // Detachments are in separate div.clFl elements after this

    // Find the Columns2 div that contains the actual army rule
    // It should be a sibling of the h2 header, not inside a clFl div
    const $header = armyRulesAnchor.next('h2');
    let $armyRuleDiv = $header.next('div.Columns2');

    if (!$armyRuleDiv.length) {
      // Try finding it as a sibling of the anchor
      $armyRuleDiv = armyRulesAnchor.siblings('div.Columns2').first();
    }

    if (!$armyRuleDiv.length) {
      // Last resort: find first Columns2 that contains the army rule anchor
      $armyRuleDiv = $('div.Columns2').filter((_, el) => {
        const $el = $(el);
        // Must contain an army rule anchor (not a detachment rule)
        const hasArmyRuleAnchor = $el.find('a[name]').filter((_, a) => {
          const name = $(a).attr('name') || '';
          // Skip detachment-related anchors
          return !name.toLowerCase().includes('detachment') &&
                 !name.toLowerCase().includes('enhancement') &&
                 !name.toLowerCase().includes('stratagem') &&
                 name !== 'Army-Rules';
        }).length > 0;
        // Must not be inside a clFl div (which indicates a detachment)
        const isInDetachment = $el.closest('div.clFl').length > 0;
        return hasArmyRuleAnchor && !isInDetachment;
      }).first();
    }

    if ($armyRuleDiv.length) {
      const sectionHtml = $.html($armyRuleDiv);
      armyRules = htmlToReadableText(sectionHtml);
    }
  }

  // Try to find specific army rule (e.g., "For the Greater Good")
  if (!armyRules) {
    // Look for h3 elements with faction-specific styling
    $('h3[class*="dsColorBg"]').first().each((_, el) => {
      const $rule = $(el);
      const ruleName = $rule.text().trim();
      // Get the content following the rule name
      const content = $rule.nextAll().first().text().trim();
      if (ruleName && content) {
        armyRules = `${ruleName}\n\n${content}`;
      }
    });
  }

  // Try to extract introduction/lore
  const introAnchor = $('a[name="Introduction"]');
  if (introAnchor.length) {
    const introContent = introAnchor.parent().next().text().trim();
    if (introContent.length > 100) {
      lore = introContent;
    }
  }

  // Fallback: get first paragraph after the header
  if (!lore) {
    const firstParagraph = $('div.BreakInsideAvoid').first().text().trim();
    if (firstParagraph.length > 100) {
      lore = firstParagraph.slice(0, SHORT_DESCRIPTION_MAX_LENGTH);
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
 * Wahapedia anchor naming pattern for section deduplication.
 * Handles formats like "Stratagems", "Stratagems-3", "Stratagems-4"
 */
function extractBaseSectionName(anchorName: string): string {
  return anchorName.replace(/-\d+$/, '');
}

/**
 * Clean up detachment name by removing markdown artifacts and invalid content.
 */
function cleanDetachmentName(name: string): string | null {
  let cleaned = name
    // Remove markdown image syntax
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    // Remove any remaining URLs
    .replace(/https?:\/\/[^\s]+/g, '')
    // Remove # Not Found markers
    .replace(/#+\s*Not\s*Found/gi, '')
    // Clean up whitespace
    .trim();

  // Skip if the result is empty or still contains invalid content
  if (!cleaned ||
      cleaned.toLowerCase().includes('not found') ||
      cleaned.includes('![') ||
      cleaned.startsWith('#') ||
      cleaned.length < 2) {
    return null;
  }

  return cleaned;
}

/**
 * Parse detachments from faction main page HTML.
 * Looks for anchor names that are followed by "Detachment-Rule" anchors.
 */
export function parseDetachments(
  html: string,
  sourceUrl: string
): Omit<NewDetachment, 'factionId'>[] {
  const $ = cheerio.load(html);
  const detachments: Omit<NewDetachment, 'factionId'>[] = [];
  const seen = new DeduplicationTracker();

  // System sections that are NOT detachment names
  const systemSections = new Set([
    'detachment-rule', 'enhancements', 'stratagems', 'army-rules',
    'datasheets', 'books', 'introduction', 'contents', 'boarding-actions',
    'crusade-rules', 'allied-units', 'requisitions', 'agendas', 'battle-traits',
    'faq', 'keywords', 'faction-pack'
  ]);

  // Find all anchor names that could be detachments
  const anchors = $('a[name]');
  const anchorNames: string[] = [];
  anchors.each((_, el) => {
    const name = $(el).attr('name');
    if (name) anchorNames.push(name);
  });

  for (let i = 0; i < anchorNames.length; i++) {
    const anchorName = anchorNames[i]!;
    const baseName = extractBaseSectionName(anchorName).toLowerCase();

    // Skip system sections
    if (systemSections.has(baseName)) continue;

    // Check if the next anchor is "Detachment-Rule" (with optional suffix)
    const nextAnchor = anchorNames[i + 1];
    if (!nextAnchor) continue;

    const nextBaseName = extractBaseSectionName(nextAnchor).toLowerCase();
    if (nextBaseName !== 'detachment-rule') continue;

    // This is a detachment!
    const $anchor = $(`a[name="${anchorName}"]`);

    // Get detachment name from h2.outline_header following the anchor
    // The h2 may contain images, so we extract only text content
    let $h2 = $anchor.next('h2.outline_header');
    if (!$h2.length) {
      // Try finding in parent or nearby
      $h2 = $anchor.parent().find('h2.outline_header').first();
    }
    if (!$h2.length) {
      $h2 = $anchor.nextAll('h2').first();
    }

    // Extract text only (this strips any img elements)
    let rawName = $h2.text().trim();
    if (!rawName) {
      // Fallback to anchor name converted to readable format
      rawName = anchorName.replace(/-/g, ' ');
    }

    // Clean up the name
    const detachmentName = cleanDetachmentName(rawName);
    if (!detachmentName) continue;

    if (!seen.addIfNew(detachmentName.toLowerCase())) continue;

    // Get lore (usually in a paragraph or ShowFluff element after the h2)
    const $section = $anchor.parent();
    const $lore = $section.find('.ShowFluff.legend, p.ShowFluff').first();
    const lore = $lore.text().trim().slice(0, SHORT_DESCRIPTION_MAX_LENGTH) || null;

    // Find detachment rule
    const $ruleAnchor = $(`a[name="${nextAnchor}"]`);
    let detachmentRuleName = '';
    let detachmentRule = '';

    // Rule name is typically in an h3 with dsColorBg* styling
    const $ruleH3 = $ruleAnchor.parent().find('h3[class*="dsColorBg"]').first();
    if ($ruleH3.length) {
      detachmentRuleName = $ruleH3.text().trim();
      // Rule content is everything after the h3
      detachmentRule = $ruleH3.nextAll().map((_, el) => $(el).text().trim()).get().join('\n').trim();
    } else {
      // Fallback: look for h3 in next sibling elements
      const $siblingH3 = $ruleAnchor.nextAll('h3').first();
      if ($siblingH3.length) {
        detachmentRuleName = $siblingH3.text().trim();
        detachmentRule = $siblingH3.parent().text().replace(detachmentRuleName, '').trim();
      }
    }

    detachments.push({
      slug: truncateSlug(slugify(detachmentName)),
      name: truncateName(detachmentName),
      detachmentRuleName: detachmentRuleName?.slice(0, NAME_MAX_LENGTH) || null,
      detachmentRule: detachmentRule.slice(0, MEDIUM_DESCRIPTION_MAX_LENGTH) || null,
      lore,
      sourceUrl,
      dataSource: 'wahapedia' as const,
    });
  }

  return detachments;
}

/**
 * Parse stratagems from faction page HTML.
 * Wahapedia uses div.str10Border for each stratagem card.
 */
export function parseStratagems(
  html: string,
  sourceUrl: string
): Omit<NewStratagem, 'factionId' | 'detachmentId'>[] {
  const $ = cheerio.load(html);
  const stratagems: Omit<NewStratagem, 'factionId' | 'detachmentId'>[] = [];
  const seen = new DeduplicationTracker(true); // Case-sensitive

  // Each stratagem is wrapped in div.str10Wrap which contains:
  // - div.str10Name (the stratagem name)
  // - div.str10Border (the card content with CP, type, effect)
  $('div.str10Wrap').each((_, el) => {
    const $wrap = $(el);

    // Extract stratagem name from div.str10Name
    const name = $wrap.find('.str10Name').text().trim();
    if (!name || !seen.addIfNew(name)) return;

    // Get the card content
    const $strat = $wrap.find('.str10Border');
    if (!$strat.length) return;

    // Extract CP cost from div.str10CP
    const cpText = $strat.find('.str10CP').text().trim();
    const cpMatch = cpText.match(/(\d+)CP/i);
    const cpCost = cpMatch ? cpMatch[1] : '1';

    // Extract type info from div.str10Type (e.g., "Gladius Task Force – Battle Tactic Stratagem")
    const typeInfo = $strat.find('.str10Type').text().trim();

    // Get the stratagem content
    const $content = $strat.find('.str10Text');
    const contentHtml = $content.html() || '';

    // Extract WHEN, TARGET, EFFECT, RESTRICTIONS from the content
    let when: string | null = null;
    let target: string | null = null;
    let effect = '';
    let restrictions: string | null = null;

    // Parse HTML to extract labeled sections
    const whenMatch = contentHtml.match(/<b>WHEN:<\/b>\s*([^<]*)/i);
    const targetMatch = contentHtml.match(/<b>TARGET:<\/b>\s*([\s\S]*?)(?=<br><br>|<b>EFFECT:|$)/i);
    const effectMatch = contentHtml.match(/<b>EFFECT:<\/b>\s*([\s\S]*?)(?=<br><br><b>RESTRICTIONS:|$)/i);
    const restrictionsMatch = contentHtml.match(/<b>RESTRICTIONS:<\/b>\s*([\s\S]*?)$/i);

    if (whenMatch?.[1]) {
      when = normalizeKeywords(whenMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    if (targetMatch?.[1]) {
      target = normalizeKeywords(targetMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    if (effectMatch?.[1]) {
      effect = normalizeKeywords(effectMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    if (restrictionsMatch?.[1]) {
      restrictions = normalizeKeywords(restrictionsMatch[1].replace(/<[^>]+>/g, '').trim());
    }

    // Skip if no effect extracted
    if (!effect) return;

    stratagems.push({
      slug: truncateSlug(slugify(name)),
      name: truncateName(name),
      cpCost: (cpCost || '1').slice(0, CP_COST_MAX_LENGTH),
      phase: detectPhase(when || ''),
      when,
      target,
      effect: effect.slice(0, MEDIUM_DESCRIPTION_MAX_LENGTH),
      restrictions,
      sourceUrl,
      dataSource: 'wahapedia' as const,
      isCore: false,
    });
  });

  return stratagems;
}

/**
 * Parse stratagems with detachment context.
 * This version associates stratagems with their parent detachment.
 */
export function parseStratagemsByDetachment(
  html: string,
  sourceUrl: string
): Map<string, Omit<NewStratagem, 'factionId' | 'detachmentId'>[]> {
  const $ = cheerio.load(html);
  const stratagemsByDetachment = new Map<string, Omit<NewStratagem, 'factionId' | 'detachmentId'>[]>();

  // Find all Stratagems sections by anchor
  const stratagemAnchors = $('a[name^="Stratagems"]');

  stratagemAnchors.each((_, anchorEl) => {
    const $anchor = $(anchorEl);
    const anchorName = $anchor.attr('name') || '';

    // Find the parent detachment by looking backwards through anchors
    let detachmentName = 'unknown';

    // Find previous siblings that are anchors to determine detachment
    const allAnchors = $('a[name]').toArray();
    const currentIndex = allAnchors.findIndex(el => $(el).attr('name') === anchorName);

    if (currentIndex > 0) {
      // Look backwards for a detachment anchor (one followed by Detachment-Rule)
      for (let i = currentIndex - 1; i >= 0; i--) {
        const prevName = $(allAnchors[i]).attr('name') || '';
        const baseName = extractBaseSectionName(prevName).toLowerCase();

        // Skip system sections
        if (['detachment-rule', 'enhancements', 'stratagems'].includes(baseName)) continue;

        // Check if next anchor is Detachment-Rule
        if (i + 1 < allAnchors.length) {
          const nextName = $(allAnchors[i + 1]).attr('name') || '';
          if (extractBaseSectionName(nextName).toLowerCase() === 'detachment-rule') {
            detachmentName = prevName.replace(/-/g, ' ');
            break;
          }
        }
      }
    }

    // Parse stratagems in this section
    const stratagems: Omit<NewStratagem, 'factionId' | 'detachmentId'>[] = [];
    const seen = new DeduplicationTracker(true);

    // Find stratagem wrappers that follow this anchor
    // Each stratagem is in div.str10Wrap with div.str10Name and div.str10Border
    const $section = $anchor.parent();
    let $stratWraps = $section.find('.str10Wrap');

    // Also check siblings if no wrappers in parent
    if (!$stratWraps.length) {
      $stratWraps = $anchor.nextUntil('a[name]', '.str10Wrap');
    }

    $stratWraps.each((_, el) => {
      const $wrap = $(el);

      // Extract stratagem name from div.str10Name
      const name = $wrap.find('.str10Name').text().trim();
      if (!name || !seen.addIfNew(name)) return;

      const $strat = $wrap.find('.str10Border');
      if (!$strat.length) return;

      const cpText = $strat.find('.str10CP').text().trim();
      const cpMatch = cpText.match(/(\d+)CP/i);
      const cpCost = cpMatch ? cpMatch[1] : '1';

      const $content = $strat.find('.str10Text');
      const contentHtml = $content.html() || '';

      // Parse WHEN, TARGET, EFFECT, RESTRICTIONS
      const whenMatch = contentHtml.match(/<b>WHEN:<\/b>\s*([^<]*)/i);
      const targetMatch = contentHtml.match(/<b>TARGET:<\/b>\s*([\s\S]*?)(?=<br><br>|<b>EFFECT:|$)/i);
      const effectMatch = contentHtml.match(/<b>EFFECT:<\/b>\s*([\s\S]*?)(?=<br><br><b>RESTRICTIONS:|$)/i);
      const restrictionsMatch = contentHtml.match(/<b>RESTRICTIONS:<\/b>\s*([\s\S]*?)$/i);

      const when = whenMatch?.[1] ? normalizeKeywords(whenMatch[1].replace(/<[^>]+>/g, '').trim()) : null;
      const target = targetMatch?.[1] ? normalizeKeywords(targetMatch[1].replace(/<[^>]+>/g, '').trim()) : null;
      const effect = effectMatch?.[1] ? normalizeKeywords(effectMatch[1].replace(/<[^>]+>/g, '').trim()) : '';
      const restrictions = restrictionsMatch?.[1] ? normalizeKeywords(restrictionsMatch[1].replace(/<[^>]+>/g, '').trim()) : null;

      if (!effect) return;

      stratagems.push({
        slug: truncateSlug(slugify(name)),
        name: truncateName(name),
        cpCost: (cpCost || '1').slice(0, CP_COST_MAX_LENGTH),
        phase: detectPhase(when || ''),
        when,
        target,
        effect: effect.slice(0, MEDIUM_DESCRIPTION_MAX_LENGTH),
        restrictions,
        sourceUrl,
        dataSource: 'wahapedia' as const,
        isCore: false,
      });
    });

    if (stratagems.length > 0) {
      const existing = stratagemsByDetachment.get(detachmentName) || [];
      stratagemsByDetachment.set(detachmentName, [...existing, ...stratagems]);
    }
  });

  return stratagemsByDetachment;
}

/**
 * Parse enhancements from faction page HTML.
 * Wahapedia uses ul.EnhancementsPts for enhancement lists.
 */
export function parseEnhancements(
  html: string,
  sourceUrl: string
): Omit<NewEnhancement, 'detachmentId'>[] {
  const $ = cheerio.load(html);
  const enhancements: Omit<NewEnhancement, 'detachmentId'>[] = [];
  const seen = new DeduplicationTracker();

  // Each enhancement is in a ul.EnhancementsPts
  $('ul.EnhancementsPts').each((_, el) => {
    const $enh = $(el);

    // Get all spans - typically two: name and points
    const $spans = $enh.find('span');
    if ($spans.length < 2) return;

    const name = $spans.first().text().trim();
    const pointsText = $spans.eq(1).text().trim();

    if (!name || !seen.addIfNew(name)) return;

    // Extract points cost
    const pointsMatch = pointsText.match(/(\d+)\s*pts?/i);
    const pointsCost = pointsMatch?.[1] ? parseInt(pointsMatch[1], 10) : 0;

    // Get description - content after the enhancement header
    // Usually in the next sibling or parent element
    let description = '';

    // Look for description in various locations
    const $nextSibling = $enh.next();
    if ($nextSibling.length && !$nextSibling.is('ul.EnhancementsPts')) {
      description = $nextSibling.text().trim();
    }

    // Also check for li content if this is a list item
    const $li = $enh.closest('li');
    if ($li.length) {
      const liText = $li.text().trim();
      // Remove the name and points from the text
      description = liText.replace(name, '').replace(pointsText, '').trim();
    }

    // Extract restriction patterns (e.g., "T'AU EMPIRE model only")
    const restrictionMatch = description.match(/([A-Z][A-Z\s'-]+(?:model|INFANTRY|PSYKER)[^.]*only\.?)/i);
    const restrictions = restrictionMatch?.[1]?.trim() || null;

    enhancements.push({
      slug: truncateSlug(slugify(name)),
      name: truncateName(name),
      pointsCost,
      description: description.slice(0, MEDIUM_DESCRIPTION_MAX_LENGTH),
      restrictions,
      sourceUrl,
      dataSource: 'wahapedia' as const,
    });
  });

  return enhancements;
}

/**
 * Parse enhancements by detachment.
 * Associates each enhancement with its parent detachment.
 */
export function parseEnhancementsByDetachment(
  html: string,
  sourceUrl: string
): Map<string, Omit<NewEnhancement, 'detachmentId'>[]> {
  const $ = cheerio.load(html);
  const enhancementsByDetachment = new Map<string, Omit<NewEnhancement, 'detachmentId'>[]>();

  // Find all Enhancement sections by anchor
  const enhancementAnchors = $('a[name^="Enhancements"]');

  enhancementAnchors.each((_, anchorEl) => {
    const $anchor = $(anchorEl);
    const anchorName = $anchor.attr('name') || '';

    // Find parent detachment
    let detachmentName = 'unknown';
    const allAnchors = $('a[name]').toArray();
    const currentIndex = allAnchors.findIndex(el => $(el).attr('name') === anchorName);

    if (currentIndex > 0) {
      for (let i = currentIndex - 1; i >= 0; i--) {
        const prevName = $(allAnchors[i]).attr('name') || '';
        const baseName = extractBaseSectionName(prevName).toLowerCase();

        if (['detachment-rule', 'enhancements', 'stratagems'].includes(baseName)) continue;

        if (i + 1 < allAnchors.length) {
          const nextName = $(allAnchors[i + 1]).attr('name') || '';
          if (extractBaseSectionName(nextName).toLowerCase() === 'detachment-rule') {
            detachmentName = prevName.replace(/-/g, ' ');
            break;
          }
        }
      }
    }

    // Parse enhancements in this section
    const enhancements: Omit<NewEnhancement, 'detachmentId'>[] = [];
    const seen = new DeduplicationTracker();

    // Find enhancement lists near this anchor
    const $section = $anchor.parent();
    let $enhLists = $section.find('ul.EnhancementsPts');

    // If no lists in parent, check siblings
    if (!$enhLists.length) {
      $enhLists = $anchor.nextUntil('a[name]', 'ul.EnhancementsPts');
    }

    // Also check parent's siblings
    if (!$enhLists.length) {
      $enhLists = $section.nextUntil('a[name]').find('ul.EnhancementsPts');
    }

    $enhLists.each((_, el) => {
      const $enh = $(el);
      const $spans = $enh.find('span');
      if ($spans.length < 2) return;

      const name = $spans.first().text().trim();
      const pointsText = $spans.eq(1).text().trim();

      if (!name || !seen.addIfNew(name)) return;

      const pointsMatch = pointsText.match(/(\d+)\s*pts?/i);
      const pointsCost = pointsMatch?.[1] ? parseInt(pointsMatch[1], 10) : 0;

      // Get description from the content between this and the next enhancement
      const $parent = $enh.parent();
      const parentText = $parent.text().trim();
      // Remove name and points to get description
      const description = parentText
        .replace(name, '')
        .replace(pointsText, '')
        .replace(/^\s*•\s*/, '')
        .trim();

      const restrictionMatch = description.match(/([A-Z][A-Z\s'-]+(?:model|INFANTRY|PSYKER)[^.]*only\.?)/i);
      const restrictions = restrictionMatch?.[1]?.trim() || null;

      enhancements.push({
        slug: truncateSlug(slugify(name)),
        name: truncateName(name),
        pointsCost,
        description: description.slice(0, MEDIUM_DESCRIPTION_MAX_LENGTH),
        restrictions,
        sourceUrl,
        dataSource: 'wahapedia' as const,
      });
    });

    if (enhancements.length > 0) {
      const existing = enhancementsByDetachment.get(detachmentName) || [];
      enhancementsByDetachment.set(detachmentName, [...existing, ...enhancements]);
    }
  });

  return enhancementsByDetachment;
}

/**
 * Extract a detachment's section content from HTML.
 */
export function extractDetachmentSection(html: string, detachmentName: string): string | null {
  const $ = cheerio.load(html);

  // Find the anchor for this detachment (convert spaces to hyphens)
  const anchorName = detachmentName.replace(/\s+/g, '-');
  const $anchor = $(`a[name="${anchorName}"], a[name="${anchorName.toLowerCase()}"]`);

  if (!$anchor.length) {
    // Try case-insensitive search
    const foundAnchor = $('a[name]').filter((_, el) => {
      const name = $(el).attr('name') || '';
      return name.toLowerCase() === anchorName.toLowerCase();
    });
    if (!foundAnchor.length) return null;
  }

  // Get content from this anchor through the Stratagems section
  const $section = $anchor.parent();
  return $section.html() || null;
}

// Re-export utilities for backwards compatibility
export { slugify, detectPhase } from './utils.js';
export { ParsedFaction };
