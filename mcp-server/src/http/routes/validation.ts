/**
 * HTTP API routes for LLM terminology validation.
 * These routes provide REST access to the validation tools for the LLM preprocessing service.
 */

import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/connection.js';
import {
  findBestMatches,
  normalizeString,
  BUILTIN_ALIASES,
  type Category,
} from '../../tools/fuzzy-matcher.js';
import {
  loadCandidates,
  fetchNamesForCategory,
  getCached,
  setCache,
} from '../../tools/validation-tools.js';

// Request/Response types
interface ValidateTermsBody {
  terms: string[];
  factions?: string[];
  categories?: Category[];
  minConfidence?: number;
}

interface FuzzySearchQuery {
  query: string;
  categories?: string;
  faction?: string;
  limit?: string;
}

interface ResolveTermBody {
  term: string;
  factionHints?: string[];
  contextSnippet?: string;
}

interface ValidNamesParams {
  category: string;
}

interface ValidNamesQuery {
  faction?: string;
  includeAliases?: string;
}

interface ValidateTermResult {
  input: string;
  match: string | null;
  category: Category | null;
  faction: string | null;
  confidence: number;
  alternates: Array<{ name: string; confidence: number }>;
}

interface ListValidNamesResult {
  category: string;
  faction: string | null;
  names: string[];
  count: number;
  aliases?: Record<string, string>;
}

export function registerValidationRoutes(fastify: FastifyInstance, db: Database): void {
  /**
   * POST /api/validate-terms
   * Batch validate multiple terms against the game database.
   */
  fastify.post<{ Body: ValidateTermsBody }>(
    '/api/validate-terms',
    async (request, reply) => {
      const {
        terms,
        factions = [],
        categories = ['units', 'stratagems', 'abilities', 'factions', 'enhancements', 'keywords'],
        minConfidence = 0.6,
      } = request.body;

      if (!terms || !Array.isArray(terms)) {
        return reply.status(400).send({ error: 'terms array is required' });
      }

      // Validate minConfidence
      const effectiveMinConfidence = Math.max(0, Math.min(1, minConfidence));

      // Limit to 50 terms
      const termsToValidate = terms.slice(0, 50);

      // Load candidates using shared function
      const candidates = await loadCandidates(db, categories, factions);

      // Validate each term
      const results: ValidateTermResult[] = termsToValidate.map((term) => {
        // Skip non-string terms
        if (typeof term !== 'string') {
          return {
            input: String(term),
            match: null,
            category: null,
            faction: null,
            confidence: 0,
            alternates: [],
          };
        }

        const matches = findBestMatches(term, candidates, {
          minConfidence: effectiveMinConfidence,
          limit: 5,
          checkAliases: true,
        });

        const best = matches[0];
        if (!best) {
          return {
            input: term,
            match: null,
            category: null,
            faction: null,
            confidence: 0,
            alternates: [],
          };
        }

        const alternates = matches.slice(1).map((m) => ({
          name: m.name,
          confidence: Math.round(m.confidence * 100) / 100,
        }));

        return {
          input: term,
          match: best.name,
          category: best.category,
          faction: best.faction || null,
          confidence: Math.round(best.confidence * 100) / 100,
          alternates,
        };
      });

      return {
        results,
        processed: results.length,
        matched: results.filter((r) => r.match !== null).length,
      };
    }
  );

  /**
   * GET /api/valid-names/:category
   * Get all valid names for a category.
   */
  fastify.get<{ Params: ValidNamesParams; Querystring: ValidNamesQuery }>(
    '/api/valid-names/:category',
    async (request, reply) => {
      const { category } = request.params;
      const { faction, includeAliases } = request.query;

      const validCategories = ['units', 'stratagems', 'abilities', 'factions', 'detachments', 'enhancements', 'keywords'];
      if (!validCategories.includes(category)) {
        return reply.status(400).send({
          error: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
        });
      }

      // Try shared cache first
      const cacheKey = `names:${category}:${faction || 'all'}`;
      let names = getCached<string[]>(cacheKey);

      if (!names) {
        names = await fetchNamesForCategory(db, category, faction);
        setCache(cacheKey, names);
      }

      const result: ListValidNamesResult = {
        category,
        faction: faction || null,
        names,
        count: names.length,
      };

      if (includeAliases === 'true') {
        // Filter aliases relevant to this category
        const categoryAliases: Record<string, string> = {};
        for (const [alias, target] of Object.entries(BUILTIN_ALIASES)) {
          const normalizedTarget = normalizeString(target);
          if (names.some((n) => normalizeString(n) === normalizedTarget)) {
            categoryAliases[alias] = target;
          }
        }
        result.aliases = categoryAliases;
      }

      return result;
    }
  );

  /**
   * GET /api/fuzzy-search
   * Search across categories with ranked similarity scores.
   */
  fastify.get<{ Querystring: FuzzySearchQuery }>(
    '/api/fuzzy-search',
    async (request, reply) => {
      const { query, categories: categoriesParam, faction, limit: limitParam } = request.query;

      if (!query || query.length < 2) {
        return reply.status(400).send({ error: 'query must be at least 2 characters' });
      }

      const categories: Category[] = categoriesParam
        ? (categoriesParam.split(',') as Category[])
        : ['units', 'stratagems', 'abilities', 'factions', 'detachments', 'enhancements', 'keywords'];

      const limit = Math.min(parseInt(limitParam || '5', 10), 20);

      // Load candidates using shared function
      const candidates = await loadCandidates(db, categories, faction ? [faction] : []);

      // Find matches
      const matches = findBestMatches(query, candidates, {
        minConfidence: 0.3, // Lower threshold for search
        limit,
        checkAliases: true,
      });

      return {
        query,
        matches: matches.map((m) => ({
          name: m.name,
          category: m.category,
          faction: m.faction || null,
          confidence: Math.round(m.confidence * 100) / 100,
        })),
      };
    }
  );

  /**
   * POST /api/resolve-term
   * Resolve ambiguous terms with faction hints and context.
   */
  fastify.post<{ Body: ResolveTermBody }>(
    '/api/resolve-term',
    async (request, reply) => {
      const { term, factionHints = [], contextSnippet = '' } = request.body;

      if (!term) {
        return reply.status(400).send({ error: 'term is required' });
      }

      // Load all candidates using shared function
      const candidates = await loadCandidates(
        db,
        ['units', 'stratagems', 'abilities', 'factions', 'detachments', 'enhancements'],
        []
      );

      // Find matches with lower threshold
      const matches = findBestMatches(term, candidates, {
        minConfidence: 0.4,
        limit: 10,
        checkAliases: true,
      });

      if (matches.length === 0) {
        return {
          term,
          ambiguous: false,
          candidates: [],
          recommendation: null,
        };
      }

      // Score candidates based on faction hints and context
      const scoredCandidates = matches.map((match) => {
        let relevanceBoost = 0;

        // Boost for matching faction hints
        if (match.faction && factionHints.length > 0) {
          const normalizedFaction = normalizeString(match.faction);
          for (const hint of factionHints) {
            if (
              normalizedFaction.includes(normalizeString(hint)) ||
              normalizeString(hint).includes(normalizedFaction)
            ) {
              relevanceBoost += 0.2;
              break;
            }
          }
        }

        // Boost for context snippet containing related terms
        if (contextSnippet && match.faction) {
          const normalizedContext = normalizeString(contextSnippet);
          const normalizedFaction = normalizeString(match.faction);
          if (normalizedContext.includes(normalizedFaction)) {
            relevanceBoost += 0.15;
          }
        }

        return {
          name: match.name,
          faction: match.faction || null,
          category: match.category,
          relevance: Math.min(1, Math.round((match.confidence + relevanceBoost) * 100) / 100),
        };
      });

      // Sort by relevance
      scoredCandidates.sort((a, b) => b.relevance - a.relevance);

      // Determine if truly ambiguous
      const highScoreCandidates = scoredCandidates.filter((c) => c.relevance >= 0.7);
      const ambiguous = highScoreCandidates.length > 1;

      return {
        term,
        ambiguous,
        candidates: scoredCandidates,
        recommendation: scoredCandidates[0]?.name || null,
      };
    }
  );
}
