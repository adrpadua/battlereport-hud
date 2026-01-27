/**
 * MCP Tool implementations for LLM terminology validation.
 * Optimized for batch validation and fuzzy matching against the game database.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Database } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { eq, ilike, or, sql, inArray, notInArray, and } from 'drizzle-orm';
import {
  findBestMatches,
  normalizeString,
  BUILTIN_ALIASES,
  type Category,
} from './fuzzy-matcher.js';

// In-memory cache for valid names with TTL
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const nameCache = new Map<string, CacheEntry<Array<{ name: string; category: Category; faction?: string }>>>();

function getCached<T>(key: string): T | null {
  const entry = nameCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    nameCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache<T>(key: string, data: T): void {
  nameCache.set(key, { data: data as any, timestamp: Date.now() });
}

/**
 * Create validation tool definitions for MCP registration.
 */
export function createValidationTools(): Tool[] {
  return [
    {
      name: 'validate_terms',
      description:
        'Batch validate multiple Warhammer 40K terms against the game database. Returns matches with confidence scores for units, stratagems, abilities, factions, enhancements, and keywords.',
      inputSchema: {
        type: 'object',
        properties: {
          terms: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of terms to validate (max 50)',
            maxItems: 50,
          },
          factions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional faction context for disambiguation',
          },
          categories: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['units', 'stratagems', 'abilities', 'factions', 'enhancements', 'keywords', 'weapons'],
            },
            description: 'Limit validation to specific categories',
          },
          minConfidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Minimum confidence score (0-1, default 0.6)',
          },
        },
        required: ['terms'],
      },
    },
    {
      name: 'list_valid_names',
      description:
        'Get all valid official names for a category (units, stratagems, abilities, factions, detachments, enhancements, keywords). Useful for building autocomplete or validation lists.',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['units', 'stratagems', 'abilities', 'factions', 'detachments', 'enhancements', 'keywords', 'weapons'],
            description: 'Category to list names for',
          },
          faction: {
            type: 'string',
            description: 'Optional faction to filter by',
          },
          includeAliases: {
            type: 'boolean',
            description: 'Include built-in aliases in the response (default false)',
          },
        },
        required: ['category'],
      },
    },
    {
      name: 'fuzzy_search',
      description:
        'Search across all categories with ranked similarity scores. Returns the best matches for a given query term.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Term to search for',
          },
          categories: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['units', 'stratagems', 'abilities', 'factions', 'detachments', 'enhancements', 'keywords', 'weapons'],
            },
            description: 'Limit search to specific categories',
          },
          faction: {
            type: 'string',
            description: 'Optional faction context',
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 20,
            description: 'Maximum results to return (default 5, max 20)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'resolve_ambiguous_term',
      description:
        'Handle terms that could match multiple entities (e.g., "warriors" could be Necron Warriors or Kabalite Warriors). Returns ranked candidates with relevance scores.',
      inputSchema: {
        type: 'object',
        properties: {
          term: {
            type: 'string',
            description: 'Ambiguous term to resolve',
          },
          factionHints: {
            type: 'array',
            items: { type: 'string' },
            description: 'Faction hints to help disambiguation',
          },
          contextSnippet: {
            type: 'string',
            description: 'Optional context text (max 500 chars) to help disambiguation',
            maxLength: 500,
          },
        },
        required: ['term'],
      },
    },
  ];
}

/**
 * Handle validation tool calls.
 */
export async function handleValidationToolCall(
  db: Database,
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    let result: unknown;

    switch (name) {
      case 'validate_terms':
        result = await validateTerms(db, args);
        break;
      case 'list_valid_names':
        result = await listValidNames(db, args);
        break;
      case 'fuzzy_search':
        result = await fuzzySearch(db, args);
        break;
      case 'resolve_ambiguous_term':
        result = await resolveAmbiguousTerm(db, args);
        break;
      default:
        throw new Error(`Unknown validation tool: ${name}`);
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    };
  }
}

// ============================================================================
// Tool Implementations
// ============================================================================

interface ValidateTermsArgs {
  terms: string[];
  factions?: string[];
  categories?: Category[];
  minConfidence?: number;
}

interface ValidateTermsResult {
  results: Array<{
    input: string;
    match: string | null;
    category: Category | null;
    faction: string | null;
    confidence: number;
    alternates: Array<{ name: string; confidence: number }>;
  }>;
  processed: number;
  matched: number;
}

async function validateTerms(
  db: Database,
  args: Record<string, unknown>
): Promise<ValidateTermsResult> {
  const typedArgs = args as unknown as ValidateTermsArgs;
  const {
    terms,
    factions = [],
    categories = ['units', 'stratagems', 'abilities', 'factions', 'enhancements', 'keywords'],
    minConfidence = 0.6,
  } = typedArgs;

  // Limit terms to 50
  const termsToValidate = terms.slice(0, 50);

  // Load candidates from database
  const candidates = await loadCandidates(db, categories, factions);

  // Validate each term
  const results = termsToValidate.map((term) => {
    const matches = findBestMatches(term, candidates, {
      minConfidence,
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

interface ListValidNamesArgs {
  category: 'units' | 'stratagems' | 'abilities' | 'factions' | 'detachments' | 'enhancements' | 'keywords';
  faction?: string;
  includeAliases?: boolean;
}

interface ListValidNamesResult {
  category: string;
  faction: string | null;
  names: string[];
  count: number;
  aliases?: Record<string, string>;
}

async function listValidNames(
  db: Database,
  args: Record<string, unknown>
): Promise<ListValidNamesResult> {
  const typedArgs = args as unknown as ListValidNamesArgs;
  const { category, faction, includeAliases = false } = typedArgs;

  // Try cache first
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

  if (includeAliases) {
    // Filter aliases relevant to this category
    const categoryAliases: Record<string, string> = {};
    for (const [alias, target] of Object.entries(BUILTIN_ALIASES)) {
      // Check if alias target matches any name in this category
      const normalizedTarget = normalizeString(target);
      if (names.some((n) => normalizeString(n) === normalizedTarget)) {
        categoryAliases[alias] = target;
      }
    }
    result.aliases = categoryAliases;
  }

  return result;
}

interface FuzzySearchArgs {
  query: string;
  categories?: Category[];
  faction?: string;
  limit?: number;
}

interface FuzzySearchResult {
  query: string;
  matches: Array<{
    name: string;
    category: Category;
    faction: string | null;
    confidence: number;
  }>;
}

async function fuzzySearch(
  db: Database,
  args: Record<string, unknown>
): Promise<FuzzySearchResult> {
  const typedArgs = args as unknown as FuzzySearchArgs;
  const {
    query,
    categories = ['units', 'stratagems', 'abilities', 'factions', 'detachments', 'enhancements', 'keywords'],
    faction,
    limit = 5,
  } = typedArgs;

  const effectiveLimit = Math.min(limit, 20);

  // Load candidates
  const candidates = await loadCandidates(db, categories, faction ? [faction] : []);

  // Find matches
  const matches = findBestMatches(query, candidates, {
    minConfidence: 0.3, // Lower threshold for search
    limit: effectiveLimit,
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

interface ResolveAmbiguousTermArgs {
  term: string;
  factionHints?: string[];
  contextSnippet?: string;
}

interface ResolveAmbiguousTermResult {
  term: string;
  ambiguous: boolean;
  candidates: Array<{
    name: string;
    faction: string | null;
    category: Category;
    relevance: number;
  }>;
  recommendation: string | null;
}

async function resolveAmbiguousTerm(
  db: Database,
  args: Record<string, unknown>
): Promise<ResolveAmbiguousTermResult> {
  const typedArgs = args as unknown as ResolveAmbiguousTermArgs;
  const {
    term,
    factionHints = [],
    contextSnippet = '',
  } = typedArgs;

  // Load all candidates (broader search for ambiguous terms)
  const candidates = await loadCandidates(db, ['units', 'stratagems', 'abilities', 'factions', 'detachments', 'enhancements'], []);

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
        if (normalizedFaction.includes(normalizeString(hint)) ||
            normalizeString(hint).includes(normalizedFaction)) {
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

  // Determine if truly ambiguous (multiple high-scoring candidates)
  const highScoreCandidates = scoredCandidates.filter((c) => c.relevance >= 0.7);
  const ambiguous = highScoreCandidates.length > 1;

  return {
    term,
    ambiguous,
    candidates: scoredCandidates,
    recommendation: scoredCandidates[0]?.name || null,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function loadCandidates(
  db: Database,
  categories: Category[],
  factionFilters: string[]
): Promise<Array<{ name: string; category: Category; faction?: string }>> {
  const candidates: Array<{ name: string; category: Category; faction?: string }> = [];

  // Build faction ID lookup if filtering by faction
  let factionIds: number[] = [];
  if (factionFilters.length > 0) {
    const factionResults = await Promise.all(
      factionFilters.map((f) =>
        db
          .select({ id: schema.factions.id })
          .from(schema.factions)
          .where(or(
            ilike(schema.factions.name, `%${f}%`),
            eq(schema.factions.slug, f.toLowerCase().replace(/\s+/g, '-'))
          ))
          .limit(1)
      )
    );
    factionIds = factionResults.flat().map((r) => r.id);
  }

  const hasFactionFilter = factionIds.length > 0;

  // Load each category
  if (categories.includes('units')) {
    const cacheKey = `units:${hasFactionFilter ? factionIds.join(',') : 'all'}`;
    let units = getCached<Array<{ name: string; faction: string }>>(cacheKey);

    if (!units) {
      let query = db
        .select({
          name: schema.units.name,
          faction: schema.factions.name,
        })
        .from(schema.units)
        .innerJoin(schema.factions, eq(schema.units.factionId, schema.factions.id));

      if (hasFactionFilter) {
        query = query.where(
          sql`${schema.units.factionId} IN (${sql.join(factionIds.map(id => sql`${id}`), sql`, `)})`
        ) as typeof query;
      }

      units = await query;
      setCache(cacheKey, units);
    }

    candidates.push(...units.map((u) => ({ name: u.name, category: 'units' as const, faction: u.faction })));
  }

  if (categories.includes('stratagems')) {
    const cacheKey = `stratagems:${hasFactionFilter ? factionIds.join(',') : 'all'}`;
    let stratagems = getCached<Array<{ name: string; faction: string | null }>>(cacheKey);

    if (!stratagems) {
      let query = db
        .select({
          name: schema.stratagems.name,
          faction: schema.factions.name,
        })
        .from(schema.stratagems)
        .leftJoin(schema.factions, eq(schema.stratagems.factionId, schema.factions.id));

      if (hasFactionFilter) {
        query = query.where(
          sql`${schema.stratagems.factionId} IN (${sql.join(factionIds.map(id => sql`${id}`), sql`, `)})`
        ) as typeof query;
      }

      stratagems = await query;
      setCache(cacheKey, stratagems);
    }

    candidates.push(
      ...stratagems.map((s) => ({
        name: s.name,
        category: 'stratagems' as const,
        faction: s.faction || undefined,
      }))
    );
  }

  if (categories.includes('abilities')) {
    const cacheKey = `abilities:${hasFactionFilter ? factionIds.join(',') : 'all'}`;
    let abilities = getCached<Array<{ name: string; faction: string | null }>>(cacheKey);

    if (!abilities) {
      let query = db
        .select({
          name: schema.abilities.name,
          faction: schema.factions.name,
        })
        .from(schema.abilities)
        .leftJoin(schema.factions, eq(schema.abilities.factionId, schema.factions.id));

      if (hasFactionFilter) {
        query = query.where(
          sql`${schema.abilities.factionId} IN (${sql.join(factionIds.map(id => sql`${id}`), sql`, `)})`
        ) as typeof query;
      }

      abilities = await query;
      setCache(cacheKey, abilities);
    }

    candidates.push(
      ...abilities.map((a) => ({
        name: a.name,
        category: 'abilities' as const,
        faction: a.faction || undefined,
      }))
    );
  }

  if (categories.includes('factions')) {
    const cacheKey = 'factions:all';
    let factions = getCached<Array<{ name: string }>>(cacheKey);

    if (!factions) {
      factions = await db.select({ name: schema.factions.name }).from(schema.factions);
      setCache(cacheKey, factions);
    }

    candidates.push(...factions.map((f) => ({ name: f.name, category: 'factions' as const })));
  }

  if (categories.includes('detachments')) {
    const cacheKey = `detachments:${hasFactionFilter ? factionIds.join(',') : 'all'}`;
    let detachments = getCached<Array<{ name: string; faction: string }>>(cacheKey);

    if (!detachments) {
      let query = db
        .select({
          name: schema.detachments.name,
          faction: schema.factions.name,
        })
        .from(schema.detachments)
        .innerJoin(schema.factions, eq(schema.detachments.factionId, schema.factions.id));

      if (hasFactionFilter) {
        query = query.where(
          sql`${schema.detachments.factionId} IN (${sql.join(factionIds.map(id => sql`${id}`), sql`, `)})`
        ) as typeof query;
      }

      detachments = await query;
      setCache(cacheKey, detachments);
    }

    candidates.push(
      ...detachments.map((d) => ({
        name: d.name,
        category: 'detachments' as const,
        faction: d.faction,
      }))
    );
  }

  if (categories.includes('enhancements')) {
    const cacheKey = `enhancements:${hasFactionFilter ? factionIds.join(',') : 'all'}`;
    let enhancements = getCached<Array<{ name: string; faction: string }>>(cacheKey);

    if (!enhancements) {
      let query = db
        .select({
          name: schema.enhancements.name,
          faction: schema.factions.name,
        })
        .from(schema.enhancements)
        .innerJoin(schema.detachments, eq(schema.enhancements.detachmentId, schema.detachments.id))
        .innerJoin(schema.factions, eq(schema.detachments.factionId, schema.factions.id));

      if (hasFactionFilter) {
        query = query.where(
          sql`${schema.detachments.factionId} IN (${sql.join(factionIds.map(id => sql`${id}`), sql`, `)})`
        ) as typeof query;
      }

      enhancements = await query;
      setCache(cacheKey, enhancements);
    }

    candidates.push(
      ...enhancements.map((e) => ({
        name: e.name,
        category: 'enhancements' as const,
        faction: e.faction,
      }))
    );
  }

  if (categories.includes('keywords')) {
    const cacheKey = 'keywords:all';
    let keywords = getCached<Array<{ name: string }>>(cacheKey);

    if (!keywords) {
      keywords = await db.select({ name: schema.keywords.name }).from(schema.keywords);
      setCache(cacheKey, keywords);
    }

    candidates.push(...keywords.map((k) => ({ name: k.name, category: 'keywords' as const })));
  }

  if (categories.includes('weapons')) {
    const cacheKey = 'weapons:all';
    let weapons = getCached<Array<{ name: string }>>(cacheKey);

    if (!weapons) {
      weapons = await db.select({ name: schema.weapons.name }).from(schema.weapons);
      setCache(cacheKey, weapons);
    }

    candidates.push(...weapons.map((w) => ({ name: w.name, category: 'weapons' as const })));
  }

  return candidates;
}

/**
 * Normalize apostrophes in a string.
 * Converts curly/smart apostrophes (U+2019) to straight apostrophes (U+0027).
 * This handles mismatches between user input and database values.
 */
function normalizeApostrophes(str: string): string {
  return str.replace(/[\u2019\u2018\u0060\u00B4]/g, "'");
}

import { getSubfactionInfo, SPACE_MARINE_CHAPTERS, type SubfactionInfo } from './subfactions.js';

/**
 * Get all exclusive subfaction keywords for a parent faction.
 * These are keywords that mark a unit as belonging to a specific subfaction.
 */
function getExclusiveSubfactionKeywords(parentFactionSlug: string): string[] {
  switch (parentFactionSlug) {
    case 'space-marines':
      return Object.values(SPACE_MARINE_CHAPTERS).map(c => c.keyword).filter((k): k is string => !!k);
    // Add other factions as needed
    default:
      return [];
  }
}

/**
 * Fetch units for a subfaction, filtering to include only:
 * - Units with the subfaction keyword (e.g., SPACE WOLVES)
 * - Generic units that don't have ANY exclusive subfaction keyword
 */
async function fetchUnitsForSubfaction(
  db: Database,
  factionId: number,
  subfactionInfo: SubfactionInfo
): Promise<string[]> {
  // Get all exclusive subfaction keywords for this parent faction
  const allExclusiveKeywords = getExclusiveSubfactionKeywords(subfactionInfo.parentFaction);
  const otherExclusiveKeywords = allExclusiveKeywords.filter(k => k !== subfactionInfo.keyword);

  // Get all units from the parent faction
  const allFactionUnits = await db
    .select({ id: schema.units.id, name: schema.units.name })
    .from(schema.units)
    .where(eq(schema.units.factionId, factionId))
    .orderBy(schema.units.name);

  if (!subfactionInfo.keyword || otherExclusiveKeywords.length === 0) {
    // No keyword filtering needed
    return allFactionUnits.map(u => u.name);
  }

  // Get keyword IDs for the subfaction keyword and other exclusive keywords
  const [subfactionKeyword] = await db
    .select({ id: schema.keywords.id })
    .from(schema.keywords)
    .where(ilike(schema.keywords.name, subfactionInfo.keyword))
    .limit(1);

  const otherKeywords = await db
    .select({ id: schema.keywords.id, name: schema.keywords.name })
    .from(schema.keywords)
    .where(
      or(...otherExclusiveKeywords.map(k => ilike(schema.keywords.name, k)))
    );

  const otherKeywordIds = otherKeywords.map(k => k.id);

  // Get unit IDs that have OTHER exclusive keywords (to exclude)
  let unitsWithOtherKeywords: number[] = [];
  if (otherKeywordIds.length > 0) {
    const excluded = await db
      .select({ unitId: schema.unitKeywords.unitId })
      .from(schema.unitKeywords)
      .where(inArray(schema.unitKeywords.keywordId, otherKeywordIds));
    unitsWithOtherKeywords = excluded.map(e => e.unitId);
  }

  // Get unit IDs that have the subfaction keyword (to always include)
  let unitsWithSubfactionKeyword: number[] = [];
  if (subfactionKeyword) {
    const included = await db
      .select({ unitId: schema.unitKeywords.unitId })
      .from(schema.unitKeywords)
      .where(eq(schema.unitKeywords.keywordId, subfactionKeyword.id));
    unitsWithSubfactionKeyword = included.map(i => i.unitId);
  }

  // Filter: include units that have subfaction keyword OR don't have any other exclusive keyword
  const excludeSet = new Set(unitsWithOtherKeywords);
  const includeSet = new Set(unitsWithSubfactionKeyword);

  const filteredUnits = allFactionUnits.filter(unit => {
    // Always include if has the subfaction keyword
    if (includeSet.has(unit.id)) return true;
    // Exclude if has another exclusive keyword
    if (excludeSet.has(unit.id)) return false;
    // Include generic units (no exclusive keywords)
    return true;
  });

  return filteredUnits.map(u => u.name);
}

async function fetchNamesForCategory(
  db: Database,
  category: string,
  faction?: string
): Promise<string[]> {
  let factionId: number | null = null;
  let subfactionInfo: SubfactionInfo | null = null;

  if (faction) {
    // Normalize apostrophes and generate slug variants
    const normalizedFaction = normalizeApostrophes(faction);
    // Generate slug: lowercase, replace spaces and apostrophes with hyphens
    const slug = normalizedFaction.toLowerCase().replace(/[\s']+/g, '-').replace(/-+/g, '-');
    // Also try with apostrophe removed entirely (e.g., "emperor-s-children" -> "emperors-children")
    const slugNoApostrophe = normalizedFaction.toLowerCase().replace(/[\s']+/g, '').replace(/\s+/g, '-');

    // First try exact slug match (most reliable)
    let [factionResult] = await db
      .select({ id: schema.factions.id })
      .from(schema.factions)
      .where(
        or(
          eq(schema.factions.slug, slug),
          eq(schema.factions.slug, slugNoApostrophe)
        )
      )
      .limit(1);

    // If no exact slug match, try exact name match (case-insensitive)
    if (!factionResult) {
      [factionResult] = await db
        .select({ id: schema.factions.id })
        .from(schema.factions)
        .where(ilike(schema.factions.name, normalizedFaction))
        .limit(1);
    }

    // Check if this is a known subfaction (Space Marine chapter, Craftworld, etc.)
    if (!factionResult) {
      subfactionInfo = getSubfactionInfo(normalizedFaction);
      if (subfactionInfo) {
        [factionResult] = await db
          .select({ id: schema.factions.id })
          .from(schema.factions)
          .where(eq(schema.factions.slug, subfactionInfo.parentFaction))
          .limit(1);
      }
    }

    factionId = factionResult?.id || null;

    // If faction specified but not found, return empty array instead of all rows
    if (!factionId) {
      console.warn(`Faction not found in database: "${faction}" (tried slug: "${slug}")`);
      return [];
    }
  }

  switch (category) {
    case 'units': {
      // If this is a subfaction query, we need to filter by keyword
      if (subfactionInfo && factionId) {
        return await fetchUnitsForSubfaction(db, factionId, subfactionInfo);
      }

      let query = db.select({ name: schema.units.name }).from(schema.units);
      if (factionId) {
        query = query.where(eq(schema.units.factionId, factionId)) as typeof query;
      }
      const results = await query.orderBy(schema.units.name);
      return results.map((r) => r.name);
    }

    case 'stratagems': {
      let query = db.select({ name: schema.stratagems.name }).from(schema.stratagems);
      if (factionId) {
        query = query.where(eq(schema.stratagems.factionId, factionId)) as typeof query;
      }
      const results = await query.orderBy(schema.stratagems.name);
      return results.map((r) => r.name);
    }

    case 'abilities': {
      let query = db.select({ name: schema.abilities.name }).from(schema.abilities);
      if (factionId) {
        query = query.where(eq(schema.abilities.factionId, factionId)) as typeof query;
      }
      const results = await query.orderBy(schema.abilities.name);
      return results.map((r) => r.name);
    }

    case 'factions': {
      const results = await db
        .select({ name: schema.factions.name })
        .from(schema.factions)
        .orderBy(schema.factions.name);
      return results.map((r) => r.name);
    }

    case 'detachments': {
      let query = db.select({ name: schema.detachments.name }).from(schema.detachments);
      if (factionId) {
        query = query.where(eq(schema.detachments.factionId, factionId)) as typeof query;
      }
      const results = await query.orderBy(schema.detachments.name);
      return results.map((r) => r.name);
    }

    case 'enhancements': {
      let query = db
        .select({ name: schema.enhancements.name })
        .from(schema.enhancements)
        .innerJoin(schema.detachments, eq(schema.enhancements.detachmentId, schema.detachments.id));
      if (factionId) {
        query = query.where(eq(schema.detachments.factionId, factionId)) as typeof query;
      }
      const results = await query.orderBy(schema.enhancements.name);
      return results.map((r) => r.name);
    }

    case 'keywords': {
      const results = await db
        .select({ name: schema.keywords.name })
        .from(schema.keywords)
        .orderBy(schema.keywords.name);
      return results.map((r) => r.name);
    }

    case 'weapons': {
      const results = await db
        .select({ name: schema.weapons.name })
        .from(schema.weapons)
        .orderBy(schema.weapons.name);
      return results.map((r) => r.name);
    }

    default:
      return [];
  }
}

/**
 * Export the validation tool names for checking in handleToolCall
 */
export const VALIDATION_TOOL_NAMES = [
  'validate_terms',
  'list_valid_names',
  'fuzzy_search',
  'resolve_ambiguous_term',
];

// Export shared functions for use by HTTP routes
export { loadCandidates, fetchNamesForCategory, getCached, setCache };
