/**
 * Generate stratagem data from MCP server database.
 *
 * This script queries the database for all stratagems and generates
 * a JSON file for use in the transcript preprocessor.
 *
 * Usage:
 *   npm run generate:stratagems
 *   npx tsx scripts/generate-stratagem-data.ts
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from 'dotenv';

// Load environment from mcp-server/.env
config({ path: join(process.cwd(), 'mcp-server', '.env') });

const { Pool } = pg;

// Import schema types - we'll inline the table definition to avoid module issues
import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  text,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';

// Define stratagem table (matching mcp-server schema)
const phaseEnum = pgEnum('phase', [
  'command',
  'movement',
  'shooting',
  'charge',
  'fight',
  'any',
]);

const stratagems = pgTable('stratagems', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  cpCost: varchar('cp_cost', { length: 10 }).notNull(),
  phase: phaseEnum('phase').notNull(),
  detachmentId: integer('detachment_id'),
  factionId: integer('faction_id'),
  isCore: boolean('is_core').default(false),
  when: text('when'),
  target: text('target'),
  effect: text('effect').notNull(),
  restrictions: text('restrictions'),
  sourceUrl: text('source_url'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const OUTPUT_DIR = join(process.cwd(), 'src/data/generated');

interface GeneratedStratagemData {
  names: string[];
  coreStratagems: string[];
  aliases: Record<string, string>;
  generatedAt: string;
}

// Common aliases for stratagems (colloquial -> canonical)
const STRATAGEM_ALIASES: Record<string, string> = {
  overwatch: 'fire overwatch',
  're-roll': 'command re-roll',
  reroll: 'command re-roll',
  'counter offensive': 'counter-offensive',
  'go to ground': 'go to ground',
};

async function main() {
  console.log('🔧 Generating stratagem data from database...\n');

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    console.error('   Make sure mcp-server/.env exists with DATABASE_URL');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  try {
    const db = drizzle(pool, { schema: { stratagems } });

    // Query all stratagems
    console.log('📡 Querying stratagems from database...');
    const allStratagems = await db.select().from(stratagems);

    if (allStratagems.length === 0) {
      console.warn('⚠️  No stratagems found in database. Using fallback data.');
      writeFallbackData();
      return;
    }

    console.log(`   Found ${allStratagems.length} stratagems`);

    // Extract names
    const names = [...new Set(allStratagems.map((s) => s.name))].sort();

    // Extract core stratagems
    const coreStratagems = [
      ...new Set(allStratagems.filter((s) => s.isCore).map((s) => s.name)),
    ].sort();

    console.log(`   Core stratagems: ${coreStratagems.length}`);
    console.log(`   Faction stratagems: ${names.length - coreStratagems.length}`);

    const data: GeneratedStratagemData = {
      names,
      coreStratagems,
      aliases: STRATAGEM_ALIASES,
      generatedAt: new Date().toISOString(),
    };

    // Write JSON data
    const jsonPath = join(OUTPUT_DIR, 'stratagems.json');
    writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    console.log(`\n✅ Written ${jsonPath}`);

    // Write TypeScript loader
    const tsContent = generateTypeScriptLoader(data);
    const tsPath = join(OUTPUT_DIR, 'stratagems.ts');
    writeFileSync(tsPath, tsContent);
    console.log(`✅ Written ${tsPath}`);

    console.log(`\n✨ Generated stratagem data with ${names.length} stratagems`);
  } catch (error) {
    console.error('❌ Database query failed:', error);
    console.warn('⚠️  Using fallback data instead.');
    writeFallbackData();
  } finally {
    await pool.end();
  }
}

function writeFallbackData() {
  // Fallback: use hardcoded stratagems if database is unavailable
  const fallbackData: GeneratedStratagemData = {
    names: [
      // Core stratagems
      'Fire Overwatch',
      'Go to Ground',
      'Smokescreen',
      'Rapid Ingress',
      'Heroic Intervention',
      'Counter-offensive',
      'Insane Bravery',
      'Grenade',
      'Tank Shock',
      'Command Re-roll',
      'Epic Challenge',
      // Common faction stratagems
      'Armour of Contempt',
      'Only in Death Does Duty End',
      'Honour the Chapter',
      'Fury of the First',
      'Adaptive Strategy',
      'Storm of Fire',
      'Oath of Moment',
      'Fire and Fade',
      'Lightning-Fast Reactions',
      'Forewarned',
      'Phantasm',
      'Matchless Agility',
      'Feigned Retreat',
      'Cloudstrike',
      'Webway Strike',
      'Linked Fire',
      'Battle Focus',
      'Strands of Fate',
      'Strike Swiftly',
      'Focus Fire',
      'Awakened by Murder',
      'Disruption Fields',
      'Solar Pulse',
      'Techno-Oracular Targeting',
      'Protocol of the Hungry Void',
      'Protocol of the Vengeful Stars',
      'Protocol of the Conquering Tyrant',
      'Dark Pact',
      'Let the Galaxy Burn',
      'Profane Zeal',
      'Veterans of the Long War',
      'Disgustingly Resilient',
      'Putrid Detonation',
      'Trench Fighters',
      'Synaptic Channelling',
      'Rapid Regeneration',
      'Death Frenzy',
      'Endless Swarm',
      'Hyper-Adaptation',
      "Orks is Never Beaten",
      'Careen',
      'Get Stuck In',
      'Unbridled Carnage',
      'For the Greater Good',
      'Photon Grenades',
      'Point-Blank Volley',
      'Breach and Clear',
      'Arcane Genetic Alchemy',
      'Slayers of Tyrants',
      "Emperor's Auspice",
      'Tanglefoot Grenade',
      'Divine Intervention',
      'Martyrdom',
      'Spirit of the Martyr',
      'Take Cover',
      'Fields of Fire',
      'Reinforcements',
      'Suppressive Fire',
      'Rotate Ion Shields',
      'Machine Spirit Resurgent',
      'Ancestral Sentence',
      'Void Armour',
    ],
    coreStratagems: [
      'Fire Overwatch',
      'Go to Ground',
      'Smokescreen',
      'Rapid Ingress',
      'Heroic Intervention',
      'Counter-offensive',
      'Insane Bravery',
      'Grenade',
      'Tank Shock',
      'Command Re-roll',
      'Epic Challenge',
    ],
    aliases: STRATAGEM_ALIASES,
    generatedAt: new Date().toISOString(),
  };

  const jsonPath = join(OUTPUT_DIR, 'stratagems.json');
  writeFileSync(jsonPath, JSON.stringify(fallbackData, null, 2));
  console.log(`\n✅ Written fallback data to ${jsonPath}`);

  const tsContent = generateTypeScriptLoader(fallbackData);
  const tsPath = join(OUTPUT_DIR, 'stratagems.ts');
  writeFileSync(tsPath, tsContent);
  console.log(`✅ Written ${tsPath}`);

  console.log(`\n⚠️  Using fallback stratagem data (${fallbackData.names.length} stratagems)`);
}

function generateTypeScriptLoader(data: GeneratedStratagemData): string {
  return `// AUTO-GENERATED FILE - DO NOT EDIT
// Generated by scripts/generate-stratagem-data.ts
// Generated at: ${data.generatedAt}

import stratagemData from './stratagems.json';

export interface StratagemData {
  names: string[];
  coreStratagems: string[];
  aliases: Record<string, string>;
  generatedAt: string;
}

const data = stratagemData as StratagemData;

/** All stratagem names for transcript matching */
export const STRATAGEM_NAMES: string[] = data.names;

/** Core stratagems available to all armies */
export const CORE_STRATAGEMS: string[] = data.coreStratagems;

/** Map of colloquial names to canonical stratagem names */
export const STRATAGEM_ALIASES: Map<string, string> = new Map(
  Object.entries(data.aliases)
);

/** Get all stratagems (core + faction) */
export function getAllStratagems(): string[] {
  return [...STRATAGEM_NAMES];
}

/** Check if a name is a core stratagem */
export function isCoreStratagem(name: string): boolean {
  const normalized = name.toLowerCase().trim();
  return CORE_STRATAGEMS.some((s) => s.toLowerCase() === normalized);
}

/** Resolve an alias to its canonical name */
export function resolveStratagemAlias(name: string): string {
  const normalized = name.toLowerCase().trim();
  return STRATAGEM_ALIASES.get(normalized) ?? name;
}
`;
}

main().catch((error) => {
  console.error('❌ Generation failed:', error);
  process.exit(1);
});
