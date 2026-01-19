/**
 * Generate unit name aliases using LLM.
 *
 * Usage:
 *   npx tsx scripts/generate-unit-aliases.ts                    # All factions
 *   npx tsx scripts/generate-unit-aliases.ts drukhari           # Single faction
 *   npx tsx scripts/generate-unit-aliases.ts --dry-run          # Preview without saving
 */

import 'dotenv/config';
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import OpenAI from 'openai';

const INPUT_DIR = join(process.cwd(), 'src/data/generated');
const OUTPUT_DIR = join(process.cwd(), 'src/data/generated/aliases');

interface FactionData {
  id: string;
  name: string;
  units: Array<{ name: string; canonicalName: string }>;
}

interface AliasFile {
  factionId: string;
  factionName: string;
  generatedAt: string;
  aliases: Record<string, string[]>;
}

interface LlmAliasResponse {
  aliases: Record<string, string[]>;
}

// System prompt for LLM alias generation
const SYSTEM_PROMPT = `You are a Warhammer 40,000 terminology expert. Generate common misspellings,
abbreviations, and colloquial names for unit names.

For each unit, provide:
- Common misspellings (phonetic errors, typos)
- Abbreviations (first letters, shortened forms)
- Informal names (nicknames used by players)
- Plural/singular variations
- How YouTube auto-captions might mishear the name

Output JSON format:
{
  "aliases": {
    "Unit Name": ["alias1", "alias2", ...]
  }
}

Rules:
- All aliases should be lowercase
- Include the unit name without suffixes like "Squad" or "Unit"
- Consider how YouTube auto-captions might mishear the name
- Include common tournament/competitive scene abbreviations
- Do NOT include the original unit name as an alias
- Focus on variations that are DIFFERENT from the original
- Generate 3-8 aliases per unit (more for complex names, fewer for simple ones)
- For character names, include common misspellings of their specific name`;

/**
 * Load faction data from JSON file.
 */
function loadFactionData(factionId: string): FactionData | null {
  const filepath = join(INPUT_DIR, `${factionId}.json`);
  if (!existsSync(filepath)) {
    console.warn(`Faction file not found: ${filepath}`);
    return null;
  }

  const content = readFileSync(filepath, 'utf-8');
  return JSON.parse(content) as FactionData;
}

/**
 * Get all available faction IDs from the generated data directory.
 */
function getAllFactionIds(): string[] {
  const files = readdirSync(INPUT_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'index.ts')
    .map((f) => basename(f, '.json'));

  // Filter out library files (they don't have actual units)
  return files.filter((f) => !f.includes('-library'));
}

/**
 * Load existing aliases file if it exists.
 */
function loadExistingAliases(factionId: string): AliasFile | null {
  const filepath = join(OUTPUT_DIR, `${factionId}-aliases.json`);
  if (!existsSync(filepath)) {
    return null;
  }

  const content = readFileSync(filepath, 'utf-8');
  return JSON.parse(content) as AliasFile;
}

/**
 * Batch units into groups for API calls.
 */
function batchUnits(units: string[], batchSize: number = 15): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < units.length; i += batchSize) {
    batches.push(units.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Generate aliases for a batch of units using LLM.
 */
async function generateAliasesForBatch(
  openai: OpenAI,
  factionName: string,
  unitNames: string[],
  retries: number = 3
): Promise<Record<string, string[]>> {
  const userPrompt = `Generate aliases for these ${factionName} units:\n\n${unitNames.join('\n')}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from LLM');
      }

      const parsed = JSON.parse(content) as LlmAliasResponse;
      return parsed.aliases || {};
    } catch (error) {
      if (attempt === retries) {
        console.error(`Failed after ${retries} attempts:`, error);
        throw error;
      }
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return {};
}

/**
 * Generate aliases for all units in a faction.
 */
async function generateAliasesForFaction(
  openai: OpenAI,
  faction: FactionData,
  existingAliases?: AliasFile | null
): Promise<AliasFile> {
  const unitNames = faction.units.map((u) => u.name);
  const batches = batchUnits(unitNames);

  console.log(`  Processing ${unitNames.length} units in ${batches.length} batches...`);

  const allAliases: Record<string, string[]> = {};

  // Process batches with concurrency limit
  const maxConcurrent = 3;
  for (let i = 0; i < batches.length; i += maxConcurrent) {
    const batchGroup = batches.slice(i, i + maxConcurrent);
    const results = await Promise.all(
      batchGroup.map((batch, idx) => {
        console.log(`    Batch ${i + idx + 1}/${batches.length}: ${batch.length} units`);
        return generateAliasesForBatch(openai, faction.name, batch);
      })
    );

    for (const result of results) {
      Object.assign(allAliases, result);
    }

    // Small delay between batch groups to avoid rate limits
    if (i + maxConcurrent < batches.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Merge with existing manual aliases if any
  if (existingAliases?.aliases) {
    for (const [unit, aliases] of Object.entries(existingAliases.aliases)) {
      if (allAliases[unit]) {
        // Combine and deduplicate
        const combined = new Set([...allAliases[unit], ...aliases]);
        allAliases[unit] = [...combined];
      } else {
        allAliases[unit] = aliases;
      }
    }
  }

  // Clean up aliases and normalize keys to match official unit names
  const normalizedAliases: Record<string, string[]> = {};
  const unmatchedUnits: string[] = [];

  for (const [unit, aliases] of Object.entries(allAliases)) {
    // Find the matching official unit name (preserve proper casing)
    // Also match when official name has [Legends] suffix
    const unitLower = unit.toLowerCase();
    const officialName = unitNames.find(
      (n) => {
        const nameLower = n.toLowerCase();
        return nameLower === unitLower ||
               nameLower.replace(/\s*\[legends\]$/, '') === unitLower;
      }
    );

    // Skip aliases for units that don't exist in BSData
    if (!officialName) {
      unmatchedUnits.push(unit);
      continue;
    }

    // Filter out the unit name itself (case-insensitive) and clean up
    const cleaned = aliases
      .map((a) => a.toLowerCase().trim())
      .filter((a) => a.length > 0 && a !== officialName.toLowerCase());

    if (cleaned.length > 0) {
      // Merge with existing aliases for this unit (in case of duplicates)
      if (normalizedAliases[officialName]) {
        const combined = new Set([...normalizedAliases[officialName], ...cleaned]);
        normalizedAliases[officialName] = [...combined];
      } else {
        normalizedAliases[officialName] = [...new Set(cleaned)];
      }
    }
  }

  if (unmatchedUnits.length > 0) {
    console.log(`    ⚠️  Skipped ${unmatchedUnits.length} unmatched units: ${unmatchedUnits.slice(0, 5).join(', ')}${unmatchedUnits.length > 5 ? '...' : ''}`);
  }

  return {
    factionId: faction.id,
    factionName: faction.name,
    generatedAt: new Date().toISOString(),
    aliases: normalizedAliases,
  };
}

/**
 * Generate the TypeScript loader for all aliases.
 */
function generateAliasLoader(availableFactionIds: string[]): string {
  // Build the loader content with proper escaping
  const lines = [
    '// AUTO-GENERATED FILE - DO NOT EDIT',
    '// Generated by scripts/generate-unit-aliases.ts',
    '',
    'type AliasMap = Map<string, string>;',
    '',
    'interface AliasFile {',
    '  factionId: string;',
    '  factionName: string;',
    '  generatedAt: string;',
    '  aliases: Record<string, string[]>;',
    '}',
    '',
    '// Cache for loaded alias files',
    'const aliasCache = new Map<string, AliasFile>();',
    '',
    '/**',
    ' * Load aliases for a specific faction.',
    ' */',
    'export async function loadFactionAliasFile(factionId: string): Promise<AliasFile | null> {',
    '  if (aliasCache.has(factionId)) {',
    '    return aliasCache.get(factionId)!;',
    '  }',
    '',
    '  try {',
    '    const data = await import(`./${factionId}-aliases.json`);',
    '    const aliasFile = data.default as AliasFile;',
    '    aliasCache.set(factionId, aliasFile);',
    '    return aliasFile;',
    '  } catch {',
    '    // Alias file not generated yet for this faction',
    '    return null;',
    '  }',
    '}',
    '',
    '/**',
    ' * Get flattened alias map for a faction (alias -> canonical name).',
    ' */',
    'export async function getFactionAliases(factionId: string): Promise<AliasMap> {',
    '  const aliasFile = await loadFactionAliasFile(factionId);',
    '  if (!aliasFile) {',
    '    return new Map();',
    '  }',
    '',
    '  const map = new Map<string, string>();',
    '  for (const [canonicalName, aliases] of Object.entries(aliasFile.aliases)) {',
    '    for (const alias of aliases) {',
    '      map.set(alias.toLowerCase(), canonicalName);',
    '    }',
    '  }',
    '  return map;',
    '}',
    '',
    '/**',
    ' * Get combined aliases for multiple factions.',
    ' */',
    'export async function getMultiFactionAliases(factionIds: string[]): Promise<AliasMap> {',
    '  const combined = new Map<string, string>();',
    '',
    '  for (const factionId of factionIds) {',
    '    const factionAliases = await getFactionAliases(factionId);',
    '    for (const [alias, canonical] of factionAliases) {',
    '      combined.set(alias, canonical);',
    '    }',
    '  }',
    '',
    '  return combined;',
    '}',
    '',
    '/**',
    ' * Get all available faction IDs with alias files.',
    ' */',
    'export function getAvailableFactionIds(): string[] {',
    `  return ${JSON.stringify(availableFactionIds)};`,
    '}',
  ];

  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const specificFaction = args.find((a) => !a.startsWith('--'));

  // Validate OpenAI API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable not set');
    console.error('Please set it in your .env file or environment');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey });

  console.log('🔧 Generating unit aliases using LLM...\n');

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Determine which factions to process
  const factionIds = specificFaction ? [specificFaction] : getAllFactionIds();

  console.log(`Processing ${factionIds.length} faction(s)${dryRun ? ' (dry run)' : ''}...\n`);

  const successfulFactions: string[] = [];

  for (const factionId of factionIds) {
    console.log(`\n📦 ${factionId}`);

    const faction = loadFactionData(factionId);
    if (!faction) {
      console.log(`  ⏭️  Skipping (no data file)`);
      continue;
    }

    if (faction.units.length === 0) {
      console.log(`  ⏭️  Skipping (no units)`);
      continue;
    }

    try {
      const existingAliases = loadExistingAliases(factionId);
      const aliasFile = await generateAliasesForFaction(openai, faction, existingAliases);

      if (dryRun) {
        console.log(`  📄 Generated aliases (dry run):`);
        const sampleUnits = Object.keys(aliasFile.aliases).slice(0, 3);
        for (const unit of sampleUnits) {
          console.log(`     ${unit}: ${aliasFile.aliases[unit].slice(0, 5).join(', ')}`);
        }
        console.log(`     ... and ${Object.keys(aliasFile.aliases).length - 3} more units`);
      } else {
        // Write alias file
        const outputPath = join(OUTPUT_DIR, `${factionId}-aliases.json`);
        writeFileSync(outputPath, JSON.stringify(aliasFile, null, 2));
        console.log(`  ✅ Wrote ${Object.keys(aliasFile.aliases).length} unit aliases`);
      }

      successfulFactions.push(factionId);
    } catch (error) {
      console.error(`  ❌ Failed:`, error instanceof Error ? error.message : error);
    }
  }

  // Generate index.ts loader
  if (!dryRun && successfulFactions.length > 0) {
    // Get all existing alias files for the loader
    const existingAliasFiles = readdirSync(OUTPUT_DIR)
      .filter((f) => f.endsWith('-aliases.json'))
      .map((f) => basename(f, '-aliases.json'));

    const loaderContent = generateAliasLoader(existingAliasFiles);
    writeFileSync(join(OUTPUT_DIR, 'index.ts'), loaderContent);
    console.log(`\n📝 Generated alias loader with ${existingAliasFiles.length} factions`);
  }

  console.log(`\n✨ Processed ${successfulFactions.length}/${factionIds.length} factions`);
  if (dryRun) {
    console.log('   (Run without --dry-run to save files)');
  }
}

main().catch((error) => {
  console.error('❌ Generation failed:', error);
  process.exit(1);
});
