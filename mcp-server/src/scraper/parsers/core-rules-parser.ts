import type { NewCoreRule } from '../../db/schema.js';

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
  const majorSections = markdown.split(/^## /m).filter(Boolean);

  for (const majorSection of majorSections) {
    const lines = majorSection.split('\n');
    const majorTitle = lines[0]?.trim() || 'Unknown';
    const majorSlug = slugify(majorTitle);
    const majorContent = lines.slice(1).join('\n').trim();

    // Check if this section has subsections (h3 headers)
    const subsections = majorContent.split(/^### /m);

    if (subsections.length > 1) {
      // Has subsections
      const introContent = subsections[0]?.trim();

      // Add the intro as the main section if it has content
      if (introContent && introContent.length > 50) {
        sections.push({
          slug: majorSlug,
          title: majorTitle,
          category: detectCategory(majorTitle),
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
            category: detectCategory(majorTitle),
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
          category: detectCategory(majorTitle),
          content: majorContent,
          orderIndex: orderIndex++,
        });
      }
    }
  }

  // Convert to database format
  return sections.map((section) => ({
    slug: section.slug.slice(0, 255),
    title: section.title.slice(0, 255),
    category: section.category.slice(0, 100),
    subcategory: section.subcategory?.slice(0, 100) ?? null,
    content: section.content,
    orderIndex: section.orderIndex,
    sourceUrl,
    dataSource: 'wahapedia' as const,
  }));
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function detectCategory(title: string): string {
  const titleLower = title.toLowerCase();

  // Phase detection
  if (titleLower.includes('command phase')) return 'command_phase';
  if (titleLower.includes('movement phase')) return 'movement_phase';
  if (titleLower.includes('shooting phase')) return 'shooting_phase';
  if (titleLower.includes('charge phase')) return 'charge_phase';
  if (titleLower.includes('fight phase')) return 'fight_phase';

  // Combat mechanics
  if (titleLower.includes('attacks') || titleLower.includes('hit roll') || titleLower.includes('wound roll')) {
    return 'combat';
  }
  if (titleLower.includes('morale') || titleLower.includes('battle-shock')) return 'morale';
  if (titleLower.includes('transport')) return 'transports';
  if (titleLower.includes('terrain') || titleLower.includes('cover')) return 'terrain';
  if (titleLower.includes('psychic') || titleLower.includes('psyker')) return 'psychic';
  if (titleLower.includes('stratagem')) return 'stratagems';
  if (titleLower.includes('objective') || titleLower.includes('victory')) return 'objectives';
  if (titleLower.includes('deployment') || titleLower.includes('reserves')) return 'deployment';
  if (titleLower.includes('unit') || titleLower.includes('datasheet')) return 'units';
  if (titleLower.includes('weapon') || titleLower.includes('wargear')) return 'weapons';
  if (titleLower.includes('ability') || titleLower.includes('abilities')) return 'abilities';
  if (titleLower.includes('keyword')) return 'keywords';
  if (titleLower.includes('leader') || titleLower.includes('attached')) return 'leaders';

  return 'general';
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
