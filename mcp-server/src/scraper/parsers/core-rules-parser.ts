import * as cheerio from 'cheerio';
import type { NewCoreRule } from '../../db/schema.js';
import { slugify, detectRuleCategory } from './utils.js';
import {
  SLUG_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  CATEGORY_MAX_LENGTH,
} from './constants.js';

interface ParsedSection {
  slug: string;
  title: string;
  category: string;
  subcategory?: string;
  content: string;
  orderIndex: number;
}

/**
 * Parses the core rules HTML from Wahapedia into structured sections
 */
export function parseCoreRules(html: string, sourceUrl: string): NewCoreRule[] {
  const $ = cheerio.load(html);
  const sections: ParsedSection[] = [];
  let orderIndex = 0;

  // Find all h2 elements (major sections)
  const $h2Elements = $('h2');

  $h2Elements.each((_, h2El) => {
    const $h2 = $(h2El);
    const majorTitle = $h2.text().trim();

    if (!majorTitle || majorTitle.length < 2) return;

    const majorSlug = slugify(majorTitle);
    const majorCategory = detectRuleCategory(majorTitle);

    // Collect content until next h2
    let content = '';
    const subsections: { title: string; content: string }[] = [];
    let currentSubsection: { title: string; content: string } | null = null;

    // Iterate through siblings until next h2
    let $current = $h2.next();
    while ($current.length && !$current.is('h2')) {
      if ($current.is('h3')) {
        // Start new subsection
        if (currentSubsection && currentSubsection.content.trim().length > 10) {
          subsections.push(currentSubsection);
        }
        currentSubsection = {
          title: $current.text().trim(),
          content: '',
        };
      } else if (currentSubsection) {
        // Add to current subsection
        currentSubsection.content += getElementText($, $current) + '\n';
      } else {
        // Add to main section content (before any h3)
        content += getElementText($, $current) + '\n';
      }

      $current = $current.next();
    }

    // Don't forget the last subsection
    if (currentSubsection && currentSubsection.content.trim().length > 10) {
      subsections.push(currentSubsection);
    }

    content = content.trim();

    // Add main section if it has enough content
    if (content.length > 50) {
      sections.push({
        slug: majorSlug,
        title: majorTitle,
        category: majorCategory,
        content,
        orderIndex: orderIndex++,
      });
    }

    // Add subsections
    for (const sub of subsections) {
      if (sub.content.trim().length > 10) {
        sections.push({
          slug: `${majorSlug}-${slugify(sub.title)}`,
          title: sub.title,
          category: majorCategory,
          subcategory: majorTitle,
          content: sub.content.trim(),
          orderIndex: orderIndex++,
        });
      }
    }
  });

  // If no h2 sections found, try alternative structure with anchors
  if (sections.length === 0) {
    parseByAnchors($, sections, orderIndex);
  }

  // Convert to database format
  return sections.map((section) => ({
    slug: section.slug.slice(0, SLUG_MAX_LENGTH),
    title: section.title.slice(0, TITLE_MAX_LENGTH),
    category: section.category.slice(0, CATEGORY_MAX_LENGTH),
    subcategory: section.subcategory?.slice(0, CATEGORY_MAX_LENGTH) ?? null,
    content: section.content,
    orderIndex: section.orderIndex,
    sourceUrl,
    dataSource: 'wahapedia' as const,
  }));
}

/**
 * Get text content from an element, handling various element types
 */
function getElementText($: cheerio.CheerioAPI, $el: cheerio.Cheerio<cheerio.Element>): string {
  // Skip script and style tags
  if ($el.is('script, style')) return '';

  // Get text content, preserving some structure
  const text = $el.text().trim();

  // For lists, add bullet points
  if ($el.is('ul, ol')) {
    return $el
      .find('li')
      .map((_, li) => `• ${$(li).text().trim()}`)
      .get()
      .join('\n');
  }

  // For tables, try to preserve structure
  if ($el.is('table')) {
    const rows: string[] = [];
    $el.find('tr').each((_, tr) => {
      const cells = $(tr)
        .find('td, th')
        .map((__, cell) => $(cell).text().trim())
        .get();
      rows.push(cells.join(' | '));
    });
    return rows.join('\n');
  }

  return text;
}

/**
 * Alternative parsing using anchor elements for section identification
 */
function parseByAnchors(
  $: cheerio.CheerioAPI,
  sections: ParsedSection[],
  orderIndex: number
): void {
  // Look for anchors that might indicate section starts
  const $anchors = $('a[name]');

  $anchors.each((_, anchorEl) => {
    const $anchor = $(anchorEl);
    const anchorName = $anchor.attr('name') || '';

    // Skip if not a meaningful anchor
    if (!anchorName || anchorName.length < 3) return;

    // Try to get the title from the anchor name
    const title = anchorName.replace(/-/g, ' ').trim();
    if (title.length < 3) return;

    // Collect content from following siblings
    let content = '';
    let $current = $anchor.next();

    // Stop at next anchor or h2/h3
    while ($current.length && !$current.is('a[name], h2, h3')) {
      content += getElementText($, $current) + '\n';
      $current = $current.next();
    }

    content = content.trim();

    if (content.length > 50) {
      sections.push({
        slug: slugify(title),
        title: toTitleCase(title),
        category: detectRuleCategory(title),
        content,
        orderIndex: orderIndex++,
      });
    }
  });
}

/**
 * Convert string to title case
 */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Extract specific rules sections for quick reference
 */
export function extractKeyRules(rules: NewCoreRule[]): Record<string, NewCoreRule[]> {
  const grouped: Record<string, NewCoreRule[]> = {};

  for (const rule of rules) {
    if (!grouped[rule.category]) {
      grouped[rule.category] = [];
    }
    grouped[rule.category]!.push(rule);
  }

  return grouped;
}
