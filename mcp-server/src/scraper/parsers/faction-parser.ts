import * as cheerio from 'cheerio';
import type { NewFaction, NewDetachment, NewStratagem, NewEnhancement } from '../../db/schema.js';
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
 * Parse faction index page to get list of all factions from HTML.
 * Looks for faction links in format: <a href="/wh40k10ed/factions/faction-slug/">Faction Name</a>
 */
export function parseFactionIndex(html: string, sourceUrl: string): NewFaction[] {
  const $ = cheerio.load(html);
  const factions: NewFaction[] = [];
  const seen = new DeduplicationTracker();

  // Find all faction links
  $('a[href*="/wh40k10ed/factions/"]').each((_, el) => {
    const $link = $(el);
    const href = $link.attr('href') || '';
    const name = $link.text().trim();

    // Extract faction slug from href
    const slugMatch = href.match(/\/wh40k10ed\/factions\/([^/]+)\/?/);
    if (!slugMatch) return;

    const slug = slugMatch[1];
    if (!slug || !name) return;

    // Skip non-faction pages (datasheets, specific units, etc.)
    if (href.includes('/datasheets') || href.includes('.html')) return;

    // Skip if we've already seen this faction
    if (!seen.addIfNew(slug)) return;

    factions.push({
      slug,
      name,
      wahapediaPath: `/wh40k10ed/factions/${slug}/`,
      sourceUrl,
      dataSource: 'wahapedia' as const,
    });
  });

  return factions;
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
    // Get content after the anchor until next major section
    const $section = armyRulesAnchor.nextAll().slice(0, 10);
    armyRules = $section
      .map((_, el) => $(el).text().trim())
      .get()
      .join('\n')
      .trim();
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
    const $section = $anchor.parent();

    // Get detachment name from h2 following the anchor
    const $h2 = $section.find('h2').first().length
      ? $section.find('h2').first()
      : $anchor.nextAll('h2').first();

    const detachmentName = $h2.text().trim() || anchorName.replace(/-/g, ' ');
    if (!seen.addIfNew(detachmentName.toLowerCase())) continue;

    // Get lore (usually in a paragraph or ShowFluff element after the name)
    const $lore = $section.find('.ShowFluff, .legend2, p').first();
    const lore = $lore.text().trim().slice(0, SHORT_DESCRIPTION_MAX_LENGTH) || null;

    // Find detachment rule
    const $ruleAnchor = $(`a[name="${nextAnchor}"]`);
    let detachmentRuleName = '';
    let detachmentRule = '';

    // Rule name is typically in an h3 with specific styling
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

  // Each stratagem is in a div.str10Border
  $('div.str10Border').each((_, el) => {
    const $strat = $(el);

    // Extract CP cost from div.str10CP
    const cpText = $strat.find('.str10CP').text().trim();
    const cpMatch = cpText.match(/(\d+)CP/i);
    const cpCost = cpMatch ? cpMatch[1] : '1';

    // Extract type info from div.str10Type (e.g., "Kauyon – Battle Tactic Stratagem")
    const typeInfo = $strat.find('.str10Type').text().trim();

    // Extract name from type info (before the dash)
    // Type format: "DetachmentName – Stratagem Type"
    let name = '';

    // Get the stratagem content
    const $content = $strat.find('.str10Text');
    const contentHtml = $content.html() || '';

    // Extract WHEN, TARGET, EFFECT, RESTRICTIONS from the content
    let when: string | null = null;
    let target: string | null = null;
    let effect = '';

    // Parse HTML to extract labeled sections
    const whenMatch = contentHtml.match(/<b>WHEN:<\/b>\s*([^<]*)/i);
    const targetMatch = contentHtml.match(/<b>TARGET:<\/b>\s*([\s\S]*?)(?=<br><br><[^b]|<b>EFFECT:|$)/i);
    const effectMatch = contentHtml.match(/<b>EFFECT:<\/b>\s*([\s\S]*?)(?=<br><br><b>RESTRICTIONS:|$)/i);

    if (whenMatch?.[1]) {
      when = normalizeKeywords(whenMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    if (targetMatch?.[1]) {
      target = normalizeKeywords(targetMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    if (effectMatch?.[1]) {
      effect = normalizeKeywords(effectMatch[1].replace(/<[^>]+>/g, '').trim());
    }

    // Try to extract name from content or infer from type
    // Wahapedia doesn't have a dedicated name element for stratagems
    // The name would typically come from a parent section header
    // For now, generate from type info
    const typeMatch = typeInfo.match(/([^–-]+)\s*[–-]\s*(.+)/);
    if (typeMatch) {
      // Name isn't directly in the stratagem card - we'll use an index approach
      // or derive from surrounding context
      name = ''; // Will be populated from context
    }

    // Skip if no effect extracted
    if (!effect) return;

    // Use surrounding context or position to determine name
    // For now, track by hash of effect to avoid duplicates
    const effectHash = effect.slice(0, 50);
    if (!seen.addIfNew(effectHash)) return;

    // Create unique name from type and position if no explicit name
    if (!name) {
      // Determine stratagem type for naming
      const stratagemType = typeInfo.includes('Battle Tactic')
        ? 'Battle Tactic'
        : typeInfo.includes('Strategic Ploy')
          ? 'Strategic Ploy'
          : typeInfo.includes('Wargear')
            ? 'Wargear'
            : 'Stratagem';

      // We'll need the parent detachment context to properly name this
      // For now, create a placeholder
      name = `${stratagemType} - ${effectHash.slice(0, 20)}`;
    }

    stratagems.push({
      slug: truncateSlug(slugify(name)),
      name: truncateName(name),
      cpCost: (cpCost || '1').slice(0, CP_COST_MAX_LENGTH),
      phase: detectPhase(when || ''),
      when,
      target,
      effect: effect.slice(0, MEDIUM_DESCRIPTION_MAX_LENGTH),
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

    // Find stratagem cards that follow this anchor
    const $section = $anchor.parent();
    const $stratCards = $section.find('.str10Border');

    // Also check siblings if no cards in parent
    const $siblingCards = $stratCards.length ? $stratCards : $anchor.nextUntil('a[name]', '.str10Border');

    $siblingCards.each((idx, el) => {
      const $strat = $(el);

      const cpText = $strat.find('.str10CP').text().trim();
      const cpMatch = cpText.match(/(\d+)CP/i);
      const cpCost = cpMatch ? cpMatch[1] : '1';

      const typeInfo = $strat.find('.str10Type').text().trim();
      const $content = $strat.find('.str10Text');
      const contentHtml = $content.html() || '';

      // Parse WHEN, TARGET, EFFECT
      const whenMatch = contentHtml.match(/<b>WHEN:<\/b>\s*([^<]*)/i);
      const targetMatch = contentHtml.match(/<b>TARGET:<\/b>\s*([\s\S]*?)(?=<br><br>|<b>EFFECT:|$)/i);
      const effectMatch = contentHtml.match(/<b>EFFECT:<\/b>\s*([\s\S]*?)(?=<br><br><b>|$)/i);

      const when = whenMatch?.[1] ? normalizeKeywords(whenMatch[1].replace(/<[^>]+>/g, '').trim()) : null;
      const target = targetMatch?.[1] ? normalizeKeywords(targetMatch[1].replace(/<[^>]+>/g, '').trim()) : null;
      const effect = effectMatch?.[1] ? normalizeKeywords(effectMatch[1].replace(/<[^>]+>/g, '').trim()) : '';

      if (!effect) return;

      // Generate name from detachment and index
      const effectHash = effect.slice(0, 50);
      if (!seen.addIfNew(effectHash)) return;

      const stratagemType = typeInfo.includes('Battle Tactic')
        ? 'Battle Tactic'
        : typeInfo.includes('Strategic Ploy')
          ? 'Strategic Ploy'
          : typeInfo.includes('Wargear')
            ? 'Wargear'
            : 'Stratagem';

      const name = `${detachmentName} ${stratagemType} ${idx + 1}`;

      stratagems.push({
        slug: truncateSlug(slugify(name)),
        name: truncateName(name),
        cpCost: (cpCost || '1').slice(0, CP_COST_MAX_LENGTH),
        phase: detectPhase(when || ''),
        when,
        target,
        effect: effect.slice(0, MEDIUM_DESCRIPTION_MAX_LENGTH),
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
