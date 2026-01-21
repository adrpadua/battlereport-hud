// Stub file for faction aliases
// This should be populated by a generation script with LLM-generated aliases

/**
 * Get aliases for multiple factions.
 * Returns a Map of colloquial names to canonical unit names.
 *
 * @param factionIds - Array of faction IDs to load aliases for
 * @returns Map of alias -> canonical name
 */
export async function getMultiFactionAliases(
  factionIds: string[]
): Promise<Map<string, string>> {
  // TODO: Implement loading of pre-generated LLM aliases
  // For now, return an empty map - the hardcoded aliases in transcript-preprocessor.ts will be used
  void factionIds; // Suppress unused parameter warning
  return new Map<string, string>();
}
