/**
 * Generate detachment data from MCP server database.
 *
 * This script queries the database for all detachments and generates
 * the detachments.ts constants file for use in transcript preprocessing.
 *
 * Usage:
 *   npm run cli generate detachments
 *   cd mcp-server && npx tsx src/scripts/generate-detachment-data.ts
 */

import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { getDb, closeConnection } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Output path is relative to the monorepo root (parent of mcp-server)
const OUTPUT_PATH = join(
  process.cwd(),
  '..',
  'packages/extension/src/data/constants/detachments.ts'
);

// Common aliases for detachments (colloquial -> canonical)
const DETACHMENT_ALIASES: Record<string, string> = {
  // Drukhari
  cartel: 'Kabalite Cartel',
  'cabalite cartel': 'Kabalite Cartel',
  'sky-splinter': 'Skysplinter Assault',
  'sky splinter': 'Skysplinter Assault',
  'sky-splinter assault': 'Skysplinter Assault',
  'sky splinter assault': 'Skysplinter Assault',
  // Space Marines
  gladius: 'Gladius Task Force',
  ironstorm: 'Ironstorm Spearhead',
  firestorm: 'Firestorm Assault Force',
  vanguard: 'Vanguard Spearhead',
  '1st company': 'First Company Task Force',
  'first company': 'First Company Task Force',
  stormlance: 'Stormlance Task Force',
  // Necrons
  awakened: 'Awakened Dynasty',
  canoptek: 'Canoptek Court',
  hypercrypt: 'Hypercrypt Legion',
  obeisance: 'Obeisance Phalanx',
  // Tyranids
  invasion: 'Invasion Fleet',
  crusher: 'Crusher Stampede',
  synaptic: 'Synaptic Nexus',
  assimilation: 'Assimilation Swarm',
  unending: 'Unending Swarm',
  // Custodes
  'shield host': 'Shield Host',
  auric: 'Auric Champions',
  talons: 'Talons of the Emperor',
  'null maiden': 'Null Maiden Vigil',
  // Orks
  waaagh: 'Waaagh! Tribe',
  'war horde': 'War Horde',
  'bully boyz': 'Bully Boyz',
  'kult of speed': 'Kult of Speed',
  'speed freeks': 'Kult of Speed',
  'dread mob': 'Dread Mob',
  'green tide': 'Green Tide',
  // T'au
  kauyon: 'Kauyon',
  montka: "Mont'ka",
  "mont'ka": "Mont'ka",
  retaliation: 'Retaliation Cadre',
  // Chaos Space Marines
  'slaves to darkness': 'Slaves to Darkness',
  veterans: 'Veterans of the Long War',
  pactbound: 'Pactbound Zealots',
  deceptors: 'Deceptors',
  'dread talons': 'Dread Talons',
  soulforged: 'Soulforged Warpack',
  // Aeldari
  'battle host': 'Battle Host',
  windrider: 'Windrider Host',
  starhost: 'Starhost',
  // Grey Knights
  'teleport strike': 'Teleport Strike Force',
  'warp bane': 'Teleport Strike Force',
  // Death Guard
  'plague company': 'Plague Company',
  'creeping death': 'Creeping Death',
  // World Eaters
  berzerker: 'Berzerker Warband',
  // Thousand Sons
  'cult of magic': 'Cult of Magic',
};

/**
 * Clean detachment name by removing markdown image tags and other artifacts.
 */
function cleanDetachmentName(name: string): string {
  // Remove markdown image tags like ![](url)
  let cleaned = name.replace(/!\[.*?\]\([^)]+\)/g, '').trim();
  // Remove any remaining markdown artifacts
  cleaned = cleaned.replace(/^#+\s*/, '').trim();
  return cleaned;
}

/**
 * Check if a detachment name is valid (not a placeholder or error).
 */
function isValidDetachment(name: string): boolean {
  const lowerName = name.toLowerCase();
  return (
    !lowerName.includes('not found') &&
    !lowerName.includes('![') &&
    name.length >= 3
  );
}

async function main() {
  console.log('🔧 Generating detachment data from database...\n');

  const db = getDb();

  try {
    // Query all detachments with faction names
    console.log('📡 Querying detachments from database...');
    const allDetachments = await db
      .select({
        name: schema.detachments.name,
        factionName: schema.factions.name,
      })
      .from(schema.detachments)
      .leftJoin(schema.factions, eq(schema.detachments.factionId, schema.factions.id));

    if (allDetachments.length === 0) {
      console.warn('⚠️  No detachments found in database.');
      process.exit(1);
    }

    console.log(`   Found ${allDetachments.length} detachments in database`);

    // Process and clean detachment names
    const detachmentsByFaction = new Map<string, string[]>();
    const allNames = new Set<string>();

    for (const row of allDetachments) {
      const cleanedName = cleanDetachmentName(row.name);
      if (!isValidDetachment(cleanedName)) {
        continue;
      }

      allNames.add(cleanedName);

      const faction = row.factionName || 'Unknown';
      if (!detachmentsByFaction.has(faction)) {
        detachmentsByFaction.set(faction, []);
      }
      detachmentsByFaction.get(faction)!.push(cleanedName);
    }

    console.log(`   Valid detachments: ${allNames.size}`);
    console.log(`   Factions with detachments: ${detachmentsByFaction.size}`);

    // Generate TypeScript file content
    const tsContent = generateTypeScriptFile(detachmentsByFaction, allNames);

    // Write the file
    writeFileSync(OUTPUT_PATH, tsContent);
    console.log(`\n✅ Written ${OUTPUT_PATH}`);

    // Print summary by faction
    console.log('\n📊 Detachments by faction:');
    const sortedFactions = [...detachmentsByFaction.keys()].sort();
    for (const faction of sortedFactions) {
      const count = detachmentsByFaction.get(faction)!.length;
      console.log(`   ${faction}: ${count}`);
    }

    console.log(`\n✨ Generated detachment data with ${allNames.size} detachments`);
  } catch (error) {
    console.error('❌ Database query failed:', error);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

function generateTypeScriptFile(
  detachmentsByFaction: Map<string, string[]>,
  _allNames: Set<string>
): string {
  const sortedFactions = [...detachmentsByFaction.keys()].sort();

  // Build the detachments array with faction comments
  const detachmentLines: string[] = [];
  for (const faction of sortedFactions) {
    const factionDetachments = detachmentsByFaction.get(faction)!.sort();
    detachmentLines.push(`  // ${faction}`);
    for (const name of factionDetachments) {
      // Escape single quotes in names
      const escapedName = name.includes("'") ? `"${name}"` : `'${name}'`;
      detachmentLines.push(`  ${escapedName},`);
    }
  }

  // Build aliases map entries
  const aliasEntries = Object.entries(DETACHMENT_ALIASES)
    .map(([alias, canonical]) => {
      const escapedAlias = alias.includes("'") ? `"${alias}"` : `'${alias}'`;
      const escapedCanonical = canonical.includes("'")
        ? `"${canonical}"`
        : `'${canonical}'`;
      return `  [${escapedAlias}, ${escapedCanonical}],`;
    })
    .join('\n');

  return `/**
 * Detachment data constants for Warhammer 40K.
 *
 * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 * Generated by: mcp-server/src/scripts/generate-detachment-data.ts
 * Generated at: ${new Date().toISOString()}
 *
 * To regenerate: npm run cli generate detachments
 */

// Army Detachments by faction
export const DETACHMENTS = [
${detachmentLines.join('\n')}
] as const;

// Common aliases for detachments (colloquial -> canonical)
export const DETACHMENT_ALIASES = new Map<string, string>([
${aliasEntries}
]);

export type Detachment = typeof DETACHMENTS[number];

/** Get all detachment names */
export function getAllDetachments(): string[] {
  return [...DETACHMENTS];
}

/** Resolve an alias to its canonical name */
export function resolveDetachmentAlias(name: string): string {
  const normalized = name.toLowerCase().trim();
  return DETACHMENT_ALIASES.get(normalized) ?? name;
}
`;
}

main().catch((error) => {
  console.error('❌ Generation failed:', error);
  process.exit(1);
});
