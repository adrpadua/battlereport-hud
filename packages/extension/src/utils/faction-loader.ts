import type { FactionData, UnitData } from '@/types/bsdata';
import { factionIndex, loadFactionById, findFactionByName } from '@/data/generated';

// Cache for loaded factions
const factionCache = new Map<string, FactionData>();

/**
 * Load faction data by faction name or alias.
 * Returns null if faction not found.
 */
export async function loadFactionByName(name: string): Promise<FactionData | null> {
  const faction = findFactionByName(name);
  if (!faction) {
    return null;
  }

  // Check cache first
  if (factionCache.has(faction.id)) {
    return factionCache.get(faction.id)!;
  }

  // Load faction data
  const data = await loadFactionById(faction.id);
  if (data) {
    factionCache.set(faction.id, data);
  }
  return data;
}

/**
 * Get all unit names for a faction.
 * Useful for AI prompt injection.
 */
export async function getFactionUnitNames(factionName: string): Promise<string[]> {
  const faction = await loadFactionByName(factionName);
  if (!faction) {
    return [];
  }
  return faction.units.map((u) => u.name);
}

/**
 * Get a specific unit by name from a faction.
 * Returns null if not found.
 */
export async function getUnitFromFaction(
  factionName: string,
  unitName: string
): Promise<UnitData | null> {
  const faction = await loadFactionByName(factionName);
  if (!faction) {
    return null;
  }

  // Try exact match first
  const exactMatch = faction.units.find(
    (u) => u.name.toLowerCase() === unitName.toLowerCase()
  );
  if (exactMatch) {
    return exactMatch;
  }

  // Try canonical name match
  const canonicalName = unitName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const canonicalMatch = faction.units.find(
    (u) => u.canonicalName === canonicalName
  );
  return canonicalMatch ?? null;
}

/**
 * Get all faction names (for display).
 */
export function getAllFactionNames(): string[] {
  return factionIndex.factions.map((f) => f.name);
}

/**
 * Get all faction IDs.
 */
export function getAllFactionIds(): string[] {
  return factionIndex.factions.map((f) => f.id);
}

/**
 * Clear the faction cache.
 */
export function clearFactionCache(): void {
  factionCache.clear();
}

/**
 * Get multiple factions by names/aliases.
 * Useful for loading both players' factions.
 */
export async function loadMultipleFactions(
  names: string[]
): Promise<Map<string, FactionData>> {
  const results = new Map<string, FactionData>();

  await Promise.all(
    names.map(async (name) => {
      const faction = await loadFactionByName(name);
      if (faction) {
        results.set(name.toLowerCase(), faction);
      }
    })
  );

  return results;
}
