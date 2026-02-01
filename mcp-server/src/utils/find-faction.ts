/**
 * Shared faction lookup used by HTTP routes and MCP tools.
 *
 * Resolution order:
 * 1. Exact slug match (most reliable)
 * 2. Exact name match (case-insensitive)
 * 3. Fuzzy name match (wildcard ILIKE, last resort)
 *
 * URI-decodes and normalizes the query, and handles apostrophes in slugs
 * (e.g. "Emperor's Children" → "emperor-s-children").
 */
import type { Database } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { eq, ilike } from 'drizzle-orm';
import { escapeIlike } from './escape-ilike.js';

export async function findFaction(db: Database, query: string) {
  const decoded = decodeURIComponent(query).trim();
  const slug = decoded.toLowerCase().replace(/'/g, '-').replace(/\s+/g, '-');

  // 1. Exact slug match
  let [faction] = await db
    .select()
    .from(schema.factions)
    .where(eq(schema.factions.slug, slug))
    .limit(1);

  if (faction) return faction;

  // 2. Exact name match (case-insensitive)
  [faction] = await db
    .select()
    .from(schema.factions)
    .where(ilike(schema.factions.name, escapeIlike(decoded)))
    .limit(1);

  if (faction) return faction;

  // 3. Fuzzy name match (last resort)
  [faction] = await db
    .select()
    .from(schema.factions)
    .where(ilike(schema.factions.name, `%${escapeIlike(decoded)}%`))
    .limit(1);

  return faction;
}
