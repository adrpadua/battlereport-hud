import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/connection.js';
import * as schema from '../../db/schema.js';
import { eq, asc, sql } from 'drizzle-orm';

/**
 * Compact rule reference (for index endpoint)
 */
interface RuleReference {
  slug: string;
  title: string;
  category: string;
  subcategory: string | null;
}

/**
 * Full rule content
 */
interface RuleContent extends RuleReference {
  content: string;
  orderIndex: number | null;
}

/**
 * Category summary with rule count
 */
interface CategorySummary {
  category: string;
  count: number;
  rules: RuleReference[];
}

/**
 * Response for game terms endpoint - terms that should be blocklisted from unit matching
 */
interface GameTermsResponse {
  terms: string[];
  count: number;
  categories: string[];
}

export function registerRulesRoutes(fastify: FastifyInstance, db: Database): void {
  /**
   * GET /api/rules/index
   * Returns a compact index of all rules (slugs + titles only)
   * Use for initial cache population - low token cost
   */
  fastify.get<{ Querystring: { category?: string } }>(
    '/api/rules/index',
    async (request) => {
      const { category } = request.query;

      const baseQuery = db
        .select({
          slug: schema.coreRules.slug,
          title: schema.coreRules.title,
          category: schema.coreRules.category,
          subcategory: schema.coreRules.subcategory,
        })
        .from(schema.coreRules)
        .orderBy(asc(schema.coreRules.category), asc(schema.coreRules.orderIndex));

      const rules = category
        ? await baseQuery.where(eq(schema.coreRules.category, category))
        : await baseQuery;

      // Group by category
      const byCategory = new Map<string, RuleReference[]>();
      for (const rule of rules) {
        const existing = byCategory.get(rule.category) ?? [];
        existing.push(rule);
        byCategory.set(rule.category, existing);
      }

      const categories: CategorySummary[] = Array.from(byCategory.entries()).map(
        ([cat, catRules]) => ({
          category: cat,
          count: catRules.length,
          rules: catRules,
        })
      );

      return {
        totalRules: rules.length,
        categoryCount: categories.length,
        categories,
      };
    }
  );

  /**
   * GET /api/rules/:slug
   * Returns full content for a single rule by slug
   */
  fastify.get<{ Params: { slug: string } }>(
    '/api/rules/:slug',
    async (request, reply) => {
      const { slug } = request.params;

      const [rule] = await db
        .select({
          slug: schema.coreRules.slug,
          title: schema.coreRules.title,
          category: schema.coreRules.category,
          subcategory: schema.coreRules.subcategory,
          content: schema.coreRules.content,
          orderIndex: schema.coreRules.orderIndex,
        })
        .from(schema.coreRules)
        .where(eq(schema.coreRules.slug, slug))
        .limit(1);

      if (!rule) {
        return reply.status(404).send({ error: `Rule not found: ${slug}` });
      }

      return { rule };
    }
  );

  /**
   * GET /api/rules/category/:category
   * Returns all rules in a specific category with full content
   */
  fastify.get<{ Params: { category: string } }>(
    '/api/rules/category/:category',
    async (request, reply) => {
      const { category } = request.params;

      const rules = await db
        .select({
          slug: schema.coreRules.slug,
          title: schema.coreRules.title,
          category: schema.coreRules.category,
          subcategory: schema.coreRules.subcategory,
          content: schema.coreRules.content,
          orderIndex: schema.coreRules.orderIndex,
        })
        .from(schema.coreRules)
        .where(eq(schema.coreRules.category, category))
        .orderBy(asc(schema.coreRules.orderIndex));

      if (rules.length === 0) {
        return reply.status(404).send({ error: `No rules found for category: ${category}` });
      }

      return {
        category,
        count: rules.length,
        rules,
      };
    }
  );

  /**
   * GET /api/rules/game-terms
   * Returns extractable game mechanics terms for use in unit name blocklist
   * These are terms that appear in rules but should NOT be matched as units
   */
  fastify.get('/api/rules/game-terms', async () => {
    // Extract terms from rules content using common patterns
    // Terms like "Feel No Pain", "Devastating Wounds", etc.
    const rules = await db
      .select({
        content: schema.coreRules.content,
        title: schema.coreRules.title,
        category: schema.coreRules.category,
      })
      .from(schema.coreRules);

    const termSet = new Set<string>();
    const categories = new Set<string>();

    // Common game mechanics patterns to extract
    const mechanicsPatterns = [
      // Ability keywords in all caps or with specific formatting
      /\b(DEVASTATING WOUNDS|LETHAL HITS|SUSTAINED HITS|FEEL NO PAIN)\b/gi,
      /\b(ANTI-\w+)\b/gi,
      /\b(HAZARDOUS|TORRENT|BLAST|MELTA|PRECISION)\b/gi,
      /\b(IGNORES COVER|INDIRECT FIRE|TWIN-LINKED|RAPID FIRE)\b/gi,
      /\b(ASSAULT|HEAVY|PISTOL|LANCE)\b/gi,
      // Core mechanics
      /\b(Battle-shock|Battleshock)\b/gi,
      /\b(Deep Strike|Deep Striking)\b/gi,
      /\b(Fall Back|Falling Back)\b/gi,
      /\b(Pile In|Pile-in|Consolidate)\b/gi,
      /\b(Advance|Advancing|Charge|Charging)\b/gi,
      /\b(Fights? First|Fights? Last)\b/gi,
      /\b(Objective Control|OC)\b/gi,
      /\b(Command Points?|CP)\b/gi,
      /\b(Mortal Wounds?|Mortals?)\b/gi,
      /\b(Invulnerable Save|Invuln)\b/gi,
      /\b(Lone Operative)\b/gi,
      /\b(Deadly Demise)\b/gi,
    ];

    for (const rule of rules) {
      categories.add(rule.category);

      // Add rule titles as terms (these are mechanics names)
      if (rule.title) {
        termSet.add(rule.title.toLowerCase());
      }

      // Extract mechanics from content
      for (const pattern of mechanicsPatterns) {
        const matches = rule.content.match(pattern);
        if (matches) {
          for (const match of matches) {
            termSet.add(match.toLowerCase().trim());
          }
        }
      }
    }

    // Convert to sorted array
    const terms = Array.from(termSet).sort();

    return {
      terms,
      count: terms.length,
      categories: Array.from(categories).sort(),
    } satisfies GameTermsResponse;
  });

  /**
   * GET /api/rules/phases
   * Returns all rules related to game phases (optimized for game narrator context)
   */
  fastify.get('/api/rules/phases', async () => {
    const phaseCategories = ['phases', 'combat', 'movement'];

    const rules = await db
      .select({
        slug: schema.coreRules.slug,
        title: schema.coreRules.title,
        category: schema.coreRules.category,
        subcategory: schema.coreRules.subcategory,
        content: schema.coreRules.content,
        orderIndex: schema.coreRules.orderIndex,
      })
      .from(schema.coreRules)
      .where(
        sql`${schema.coreRules.category} = ANY(${phaseCategories})`
      )
      .orderBy(asc(schema.coreRules.orderIndex));

    // Group by category
    const byCategory = new Map<string, RuleContent[]>();
    for (const rule of rules) {
      const existing = byCategory.get(rule.category) ?? [];
      existing.push(rule);
      byCategory.set(rule.category, existing);
    }

    return {
      totalRules: rules.length,
      categories: Object.fromEntries(byCategory),
    };
  });
}
