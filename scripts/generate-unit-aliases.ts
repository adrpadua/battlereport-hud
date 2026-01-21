/**
 * Generate unit name aliases using LLM.
 *
 * Usage:
 *   npx tsx scripts/generate-unit-aliases.ts                    # All factions (batch mode)
 *   npx tsx scripts/generate-unit-aliases.ts drukhari           # Single faction (realtime)
 *   npx tsx scripts/generate-unit-aliases.ts --dry-run          # Preview without saving
 *   npx tsx scripts/generate-unit-aliases.ts --no-batch         # Force realtime mode (no batch API)
 *   npx tsx scripts/generate-unit-aliases.ts --batch-status <id> # Check batch status
 */

import 'dotenv/config';
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import OpenAI from 'openai';
import { Readable } from 'stream';

const INPUT_DIR = join(process.cwd(), 'packages/extension/src/data/generated');
const OUTPUT_DIR = join(process.cwd(), 'packages/extension/src/data/generated/aliases');

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

interface BatchRequest {
  custom_id: string;
  method: 'POST';
  url: '/v1/chat/completions';
  body: {
    model: string;
    temperature: number;
    max_completion_tokens: number;
    messages: Array<{ role: 'system' | 'user'; content: string }>;
    response_format: { type: 'json_object' };
  };
}

interface BatchResult {
  custom_id: string;
  response: {
    status_code: number;
    body: {
      choices: Array<{ message: { content: string } }>;
    };
  };
}

const BATCH_STATUS_FILE = join(process.cwd(), '.batch-alias-status.json');

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
        model: 'gpt-5-mini',
        max_completion_tokens: 2000, // Limit output tokens for cost control
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
 * Create batch requests for all factions.
 */
function createBatchRequests(factions: FactionData[]): BatchRequest[] {
  const requests: BatchRequest[] = [];

  for (const faction of factions) {
    const unitNames = faction.units.map((u) => u.name);
    const batches = batchUnits(unitNames);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const userPrompt = `Generate aliases for these ${faction.name} units:\n\n${batch.join('\n')}`;

      requests.push({
        custom_id: `${faction.id}:${i}`,
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: 'gpt-5-mini',
          max_completion_tokens: 2000,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
        },
      });
    }
  }

  return requests;
}

/**
 * Submit batch to OpenAI Batch API (50% cost savings).
 */
async function submitBatch(openai: OpenAI, requests: BatchRequest[]): Promise<string> {
  // Create JSONL content
  const jsonlContent = requests.map((r) => JSON.stringify(r)).join('\n');

  // Upload the file
  console.log(`  Uploading batch file with ${requests.length} requests...`);
  const file = await openai.files.create({
    file: new File([jsonlContent], 'batch-requests.jsonl', { type: 'application/jsonl' }),
    purpose: 'batch',
  });

  // Create the batch
  console.log(`  Creating batch with file ${file.id}...`);
  const batch = await openai.batches.create({
    input_file_id: file.id,
    endpoint: '/v1/chat/completions',
    completion_window: '24h',
    metadata: {
      description: 'Unit alias generation',
    },
  });

  // Save batch status
  writeFileSync(
    BATCH_STATUS_FILE,
    JSON.stringify({ batchId: batch.id, fileId: file.id, createdAt: Date.now() }, null, 2)
  );

  console.log(`  ✅ Batch created: ${batch.id}`);
  console.log(`  Status: ${batch.status}`);

  return batch.id;
}

/**
 * Poll batch status until complete.
 */
async function waitForBatch(openai: OpenAI, batchId: string): Promise<OpenAI.Batches.Batch> {
  console.log(`\nWaiting for batch ${batchId} to complete...`);

  while (true) {
    const batch = await openai.batches.retrieve(batchId);

    console.log(`  Status: ${batch.status} (${batch.request_counts?.completed ?? 0}/${batch.request_counts?.total ?? 0} completed)`);

    if (batch.status === 'completed') {
      return batch;
    }

    if (batch.status === 'failed' || batch.status === 'expired' || batch.status === 'cancelled') {
      throw new Error(`Batch ${batch.status}: ${JSON.stringify(batch.errors)}`);
    }

    // Poll every 30 seconds
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }
}

/**
 * Download and parse batch results.
 */
async function downloadBatchResults(
  openai: OpenAI,
  outputFileId: string
): Promise<Map<string, Record<string, string[]>>> {
  console.log(`\nDownloading results from ${outputFileId}...`);

  const fileResponse = await openai.files.content(outputFileId);
  const content = await fileResponse.text();
  const lines = content.trim().split('\n');

  // Group results by faction
  const resultsByFaction = new Map<string, Record<string, string[]>>();

  for (const line of lines) {
    const result: BatchResult = JSON.parse(line);
    const [factionId] = result.custom_id.split(':');

    if (result.response.status_code !== 200) {
      console.warn(`  ⚠️  Request ${result.custom_id} failed with status ${result.response.status_code}`);
      continue;
    }

    const content = result.response.body.choices[0]?.message?.content;
    if (!content) continue;

    try {
      const parsed = JSON.parse(content) as LlmAliasResponse;
      const existing = resultsByFaction.get(factionId!) || {};
      Object.assign(existing, parsed.aliases || {});
      resultsByFaction.set(factionId!, existing);
    } catch {
      console.warn(`  ⚠️  Failed to parse response for ${result.custom_id}`);
    }
  }

  return resultsByFaction;
}

/**
 * Check status of an existing batch.
 */
async function checkBatchStatus(openai: OpenAI, batchId: string): Promise<void> {
  const batch = await openai.batches.retrieve(batchId);
  console.log(`Batch ID: ${batch.id}`);
  console.log(`Status: ${batch.status}`);
  console.log(`Progress: ${batch.request_counts?.completed ?? 0}/${batch.request_counts?.total ?? 0} completed`);
  console.log(`Created: ${new Date((batch.created_at ?? 0) * 1000).toISOString()}`);

  if (batch.output_file_id) {
    console.log(`Output file: ${batch.output_file_id}`);
  }
  if (batch.error_file_id) {
    console.log(`Error file: ${batch.error_file_id}`);
  }
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

async function processWithBatchApi(
  openai: OpenAI,
  factions: FactionData[],
  dryRun: boolean
): Promise<string[]> {
  const successfulFactions: string[] = [];

  // Create batch requests
  const requests = createBatchRequests(factions);
  console.log(`\n📦 Created ${requests.length} batch requests for ${factions.length} factions`);

  if (dryRun) {
    console.log('\n(Dry run - would submit batch with 50% cost savings)');
    return factions.map((f) => f.id);
  }

  // Submit batch
  const batchId = await submitBatch(openai, requests);

  // Wait for completion
  const batch = await waitForBatch(openai, batchId);

  if (!batch.output_file_id) {
    throw new Error('Batch completed but no output file available');
  }

  // Download and process results
  const resultsByFaction = await downloadBatchResults(openai, batch.output_file_id);

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Write results for each faction
  for (const faction of factions) {
    const rawAliases = resultsByFaction.get(faction.id);
    if (!rawAliases) {
      console.warn(`  ⚠️  No results for ${faction.id}`);
      continue;
    }

    // Normalize aliases
    const unitNames = faction.units.map((u) => u.name);
    const normalizedAliases: Record<string, string[]> = {};

    for (const [unit, aliases] of Object.entries(rawAliases)) {
      const unitLower = unit.toLowerCase();
      const officialName = unitNames.find((n) => {
        const nameLower = n.toLowerCase();
        return nameLower === unitLower || nameLower.replace(/\s*\[legends\]$/, '') === unitLower;
      });

      if (!officialName) continue;

      const cleaned = aliases
        .map((a) => a.toLowerCase().trim())
        .filter((a) => a.length > 0 && a !== officialName.toLowerCase());

      if (cleaned.length > 0) {
        normalizedAliases[officialName] = [...new Set(cleaned)];
      }
    }

    // Create alias file
    const aliasFile: AliasFile = {
      factionId: faction.id,
      factionName: faction.name,
      generatedAt: new Date().toISOString(),
      aliases: normalizedAliases,
    };

    const outputPath = join(OUTPUT_DIR, `${faction.id}-aliases.json`);
    writeFileSync(outputPath, JSON.stringify(aliasFile, null, 2));
    console.log(`  ✅ ${faction.id}: ${Object.keys(normalizedAliases).length} unit aliases`);
    successfulFactions.push(faction.id);
  }

  // Clean up batch status file
  if (existsSync(BATCH_STATUS_FILE)) {
    unlinkSync(BATCH_STATUS_FILE);
  }

  return successfulFactions;
}

async function processRealtime(
  openai: OpenAI,
  factionIds: string[],
  dryRun: boolean
): Promise<string[]> {
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
        const outputPath = join(OUTPUT_DIR, `${factionId}-aliases.json`);
        writeFileSync(outputPath, JSON.stringify(aliasFile, null, 2));
        console.log(`  ✅ Wrote ${Object.keys(aliasFile.aliases).length} unit aliases`);
      }

      successfulFactions.push(factionId);
    } catch (error) {
      console.error(`  ❌ Failed:`, error instanceof Error ? error.message : error);
    }
  }

  return successfulFactions;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const noBatch = args.includes('--no-batch');
  const batchStatusArg = args.indexOf('--batch-status');
  const specificFaction = args.find((a) => !a.startsWith('--'));

  // Validate OpenAI API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable not set');
    console.error('Please set it in your .env file or environment');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey });

  // Check batch status if requested
  if (batchStatusArg !== -1) {
    const batchId = args[batchStatusArg + 1];
    if (!batchId) {
      // Try to load from status file
      if (existsSync(BATCH_STATUS_FILE)) {
        const status = JSON.parse(readFileSync(BATCH_STATUS_FILE, 'utf-8'));
        await checkBatchStatus(openai, status.batchId);
      } else {
        console.error('Error: No batch ID provided and no status file found');
        process.exit(1);
      }
    } else {
      await checkBatchStatus(openai, batchId);
    }
    return;
  }

  console.log('🔧 Generating unit aliases using LLM...\n');

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Determine which factions to process
  const factionIds = specificFaction ? [specificFaction] : getAllFactionIds();
  const useBatch = !noBatch && !specificFaction && factionIds.length > 1;

  console.log(`Processing ${factionIds.length} faction(s)${dryRun ? ' (dry run)' : ''}`);
  console.log(`Mode: ${useBatch ? 'Batch API (50% cost savings)' : 'Realtime API'}\n`);

  let successfulFactions: string[];

  if (useBatch) {
    // Load all factions
    const factions: FactionData[] = [];
    for (const factionId of factionIds) {
      const faction = loadFactionData(factionId);
      if (faction && faction.units.length > 0) {
        factions.push(faction);
      }
    }

    successfulFactions = await processWithBatchApi(openai, factions, dryRun);
  } else {
    successfulFactions = await processRealtime(openai, factionIds, dryRun);
  }

  // Generate index.ts loader
  if (!dryRun && successfulFactions.length > 0) {
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
