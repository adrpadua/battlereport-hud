import type { NewCoreRule } from '../../db/schema.js';
import { SPLIT_H2, SPLIT_H3 } from './regex-patterns.js';
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
 * Parses the core rules markdown from Wahapedia into structured sections
 */
export function parseCoreRules(markdown: string, sourceUrl: string): NewCoreRule[] {
  const sections: ParsedSection[] = [];
  let orderIndex = 0;

  // Split by h2 headers (##) to get major sections
  const majorSections = markdown.split(SPLIT_H2).filter(Boolean);

  for (const majorSection of majorSections) {
    const lines = majorSection.split('\n');
    const majorTitle = lines[0]?.trim() || 'Unknown';
    const majorSlug = slugify(majorTitle);
    const majorContent = lines.slice(1).join('\n').trim();

    // Check if this section has subsections (h3 headers)
    const subsections = majorContent.split(SPLIT_H3);

    if (subsections.length > 1) {
      // Has subsections
      const introContent = subsections[0]?.trim();

      // Add the intro as the main section if it has content
      if (introContent && introContent.length > 50) {
        sections.push({
          slug: majorSlug,
          title: majorTitle,
          category: detectRuleCategory(majorTitle),
          content: introContent,
          orderIndex: orderIndex++,
        });
      }

      // Process each subsection
      for (let i = 1; i < subsections.length; i++) {
        const subsection = subsections[i];
        if (!subsection) continue;

        const subLines = subsection.split('\n');
        const subTitle = subLines[0]?.trim() || 'Unknown';
        const subContent = subLines.slice(1).join('\n').trim();

        if (subContent.length > 10) {
          sections.push({
            slug: `${majorSlug}-${slugify(subTitle)}`,
            title: subTitle,
            category: detectRuleCategory(majorTitle),
            subcategory: majorTitle,
            content: subContent,
            orderIndex: orderIndex++,
          });
        }
      }
    } else {
      // No subsections, add as single section
      if (majorContent.length > 10) {
        sections.push({
          slug: majorSlug,
          title: majorTitle,
          category: detectRuleCategory(majorTitle),
          content: majorContent,
          orderIndex: orderIndex++,
        });
      }
    }
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
