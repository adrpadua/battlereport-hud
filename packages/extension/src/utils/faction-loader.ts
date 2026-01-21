import type { FactionData, UnitData } from '@/types/bsdata';
import { factionIndex, loadFactionById, findFactionByName } from '@/data/generated';

// Cache for loaded factions
const factionCache = new Map<string, FactionData>();

// Build faction matching patterns from the index (cached)
let factionPatterns: { pattern: RegExp; factionName: string }[] | null = null;

/**
 * Build regex patterns for all factions and their aliases.
 * Patterns are sorted by length (longest first) to prefer more specific matches.
 */
function buildFactionPatterns(): { pattern: RegExp; factionName: string }[] {
  if (factionPatterns) {
    return factionPatterns;
  }

  const patterns: { pattern: RegExp; factionName: string; length: number }[] = [];

  for (const faction of factionIndex.factions) {
    // Add the canonical name
    const escapedName = faction.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    patterns.push({
      pattern: new RegExp(`\\b${escapedName}\\b`, 'i'),
      factionName: faction.name,
      length: faction.name.length,
    });

    // Add all aliases
    for (const alias of faction.aliases) {
      // Skip very short aliases (like "we", "ig", "am") to avoid false positives
      if (alias.length < 3) continue;

      const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Handle multi-word aliases with flexible spacing
      const flexibleAlias = escapedAlias.replace(/\s+/g, '\\s+');
      patterns.push({
        pattern: new RegExp(`\\b${flexibleAlias}\\b`, 'i'),
        factionName: faction.name,
        length: alias.length,
      });
    }
  }

  // Sort by length descending (longer matches first to prefer "Space Marines" over "Marines")
  patterns.sort((a, b) => b.length - a.length);

  factionPatterns = patterns.map(({ pattern, factionName }) => ({ pattern, factionName }));
  return factionPatterns;
}

/**
 * Infer factions from text (video title, description, etc.).
 * Returns an array of unique canonical faction names found in the text.
 *
 * @param text - The text to search for faction names
 * @param maxFactions - Maximum number of factions to return (default: 2 for typical battle reports)
 */
export function inferFactionsFromText(text: string, maxFactions: number = 2): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const patterns = buildFactionPatterns();
  const detectedFactions: string[] = [];
  const matchedTextRanges: { start: number; end: number }[] = [];

  for (const { pattern, factionName } of patterns) {
    // Skip if we already have this faction
    if (detectedFactions.includes(factionName)) {
      continue;
    }

    // Find all matches in the text
    const match = pattern.exec(text);
    if (match) {
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;

      // Check if this match overlaps with an already-matched region
      const overlaps = matchedTextRanges.some(
        (range) => matchStart < range.end && matchEnd > range.start
      );

      if (!overlaps) {
        detectedFactions.push(factionName);
        matchedTextRanges.push({ start: matchStart, end: matchEnd });

        // Stop early if we've found enough factions
        if (detectedFactions.length >= maxFactions) {
          break;
        }
      }
    }

    // Reset lastIndex for next iteration since we're reusing the regex
    pattern.lastIndex = 0;
  }

  return detectedFactions;
}

/**
 * Infer factions from video metadata.
 * Searches title, description, and pinned comment.
 * Returns faction data ready for the narrator prompt.
 */
export async function inferFactionsFromVideo(
  videoData: { title: string; description?: string; pinnedComment?: string }
): Promise<{ faction1?: { name: string; units: string[] }; faction2?: { name: string; units: string[] } }> {
  // Combine all text sources, prioritizing title
  const searchText = [
    videoData.title,
    videoData.description ?? '',
    videoData.pinnedComment ?? '',
  ].join(' ');

  const detectedNames = inferFactionsFromText(searchText, 2);

  if (detectedNames.length === 0) {
    return {};
  }

  const result: { faction1?: { name: string; units: string[] }; faction2?: { name: string; units: string[] } } = {};

  // Load faction data for detected factions
  const [faction1Units, faction2Units] = await Promise.all([
    detectedNames[0] ? getFactionUnitNames(detectedNames[0]) : Promise.resolve([]),
    detectedNames[1] ? getFactionUnitNames(detectedNames[1]) : Promise.resolve([]),
  ]);

  if (detectedNames[0]) {
    result.faction1 = { name: detectedNames[0], units: faction1Units };
  }
  if (detectedNames[1]) {
    result.faction2 = { name: detectedNames[1], units: faction2Units };
  }

  return result;
}

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
