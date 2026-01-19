import { Command } from 'commander';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { XMLParser } from 'fast-xml-parser';
import { getDb, closeConnection } from '../../db/connection.js';
import * as schema from '../../db/schema.js';
import { eq } from 'drizzle-orm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BSDATA_REPO = 'BSData/wh40k-10e';
const BSDATA_CACHE_DIR = join(__dirname, '../../../.bsdata-cache');

interface BSDataCatalogue {
  catalogue?: {
    '@_id': string;
    '@_name': string;
    '@_battleScribeVersion': string;
    selectionEntries?: { selectionEntry: BSDataEntry | BSDataEntry[] };
    sharedSelectionEntries?: { selectionEntry: BSDataEntry | BSDataEntry[] };
    sharedProfiles?: { profile: BSDataProfile | BSDataProfile[] };
  };
  gameSystem?: {
    '@_id': string;
    '@_name': string;
  };
}

interface BSDataEntry {
  '@_id': string;
  '@_name': string;
  '@_type'?: string;
  profiles?: { profile: BSDataProfile | BSDataProfile[] };
  selectionEntries?: { selectionEntry: BSDataEntry | BSDataEntry[] };
  costs?: { cost: BSDataCost | BSDataCost[] };
  categoryLinks?: { categoryLink: BSDataCategoryLink | BSDataCategoryLink[] };
}

interface BSDataProfile {
  '@_id': string;
  '@_name': string;
  '@_typeName': string;
  characteristics?: { characteristic: BSDataCharacteristic | BSDataCharacteristic[] };
}

interface BSDataCharacteristic {
  '@_name': string;
  '#text'?: string;
}

interface BSDataCost {
  '@_name': string;
  '@_value': string;
}

interface BSDataCategoryLink {
  '@_targetId': string;
  '@_name': string;
}

async function run(script: string, args: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${script} ${args.join(' ')}`);
    console.log('='.repeat(60));

    const proc = spawn('npx', ['tsx', script, ...args], {
      cwd: join(__dirname, '../../..'),
      stdio: 'inherit',
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script ${script} exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

async function fetchCatalogues(): Promise<void> {
  console.log('Fetching catalogue list from GitHub...');

  const response = await fetch(
    `https://api.github.com/repos/${BSDATA_REPO}/contents`,
    {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'wh40k-rules-mcp',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const files = (await response.json()) as Array<{ name: string; download_url: string }>;
  const catFiles = files.filter(
    (f) => f.name.endsWith('.cat') || f.name.endsWith('.gst')
  );

  console.log(`Found ${catFiles.length} catalogue files`);

  for (const file of catFiles) {
    const cachePath = join(BSDATA_CACHE_DIR, file.name);

    if (existsSync(cachePath)) {
      console.log(`  [Cache] ${file.name}`);
      continue;
    }

    console.log(`  [Fetch] ${file.name}`);

    const fileResponse = await fetch(file.download_url);
    if (!fileResponse.ok) {
      console.error(`  Failed to download ${file.name}`);
      continue;
    }

    const content = await fileResponse.text();
    writeFileSync(cachePath, content);

    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

function normalizeArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function mapCatalogueToFaction(catalogueName: string): string | null {
  const mappings: Record<string, string> = {
    'Imperium - Adeptus Astartes': 'adeptus-astartes',
    'Imperium - Blood Angels': 'blood-angels',
    'Imperium - Dark Angels': 'dark-angels',
    'Imperium - Deathwatch': 'deathwatch',
    'Imperium - Space Wolves': 'space-wolves',
    'Imperium - Black Templars': 'black-templars',
    'Imperium - Grey Knights': 'grey-knights',
    'Imperium - Adeptus Custodes': 'adeptus-custodes',
    'Imperium - Adepta Sororitas': 'adepta-sororitas',
    'Imperium - Adeptus Mechanicus': 'adeptus-mechanicus',
    'Imperium - Astra Militarum': 'astra-militarum',
    'Imperium - Imperial Knights': 'imperial-knights',
    'Imperium - Imperial Agents': 'imperial-agents',
    'Chaos - Chaos Space Marines': 'chaos-space-marines',
    'Chaos - Death Guard': 'death-guard',
    'Chaos - Thousand Sons': 'thousand-sons',
    'Chaos - World Eaters': 'world-eaters',
    'Chaos - Chaos Daemons': 'chaos-daemons',
    'Chaos - Chaos Knights': 'chaos-knights',
    'Aeldari - Craftworlds': 'aeldari',
    'Aeldari - Drukhari': 'drukhari',
    'Aeldari - Harlequins': 'harlequins',
    'Aeldari - Ynnari': 'ynnari',
    Necrons: 'necrons',
    Orks: 'orks',
    "T'au Empire": 'tau-empire',
    Tyranids: 'tyranids',
    'Genestealer Cults': 'genestealer-cults',
    'Leagues of Votann': 'leagues-of-votann',
  };

  if (mappings[catalogueName]) {
    return mappings[catalogueName]!;
  }

  for (const [key, value] of Object.entries(mappings)) {
    if (catalogueName.includes(key) || key.includes(catalogueName)) {
      return value;
    }
  }

  return null;
}

function extractUnitStats(profile: BSDataProfile): Record<string, unknown> {
  const characteristics = normalizeArray(profile.characteristics?.characteristic);
  const stats: Record<string, unknown> = {};

  for (const char of characteristics) {
    const name = char['@_name'];
    const value = char['#text'] || '';

    switch (name) {
      case 'M':
        stats.movement = value;
        break;
      case 'T':
        stats.toughness = parseInt(value, 10) || null;
        break;
      case 'SV':
        stats.save = value;
        break;
      case 'W':
        stats.wounds = parseInt(value, 10) || null;
        break;
      case 'LD':
        stats.leadership = parseInt(value, 10) || null;
        break;
      case 'OC':
        stats.objectiveControl = parseInt(value, 10) || null;
        break;
      case 'INVUL':
        stats.invulnerableSave = value;
        break;
    }
  }

  return stats;
}

async function processWeapon(
  db: ReturnType<typeof getDb>,
  unitId: number,
  profile: BSDataProfile,
  weaponType: 'ranged' | 'melee'
): Promise<void> {
  const name = profile['@_name'];
  const slug = slugify(name);

  const characteristics = normalizeArray(profile.characteristics?.characteristic);
  const chars: Record<string, string> = {};

  for (const char of characteristics) {
    chars[char['@_name']] = char['#text'] || '';
  }

  const [weapon] = await db
    .insert(schema.weapons)
    .values({
      slug,
      name,
      weaponType,
      range: chars['Range'] || null,
      attacks: chars['A'] || null,
      skill: chars['BS'] || chars['WS'] || null,
      strength: chars['S'] || null,
      armorPenetration: chars['AP'] || null,
      damage: chars['D'] || null,
      abilities: chars['Keywords'] || null,
      dataSource: 'bsdata',
    })
    .onConflictDoNothing()
    .returning();

  if (weapon) {
    await db
      .insert(schema.unitWeapons)
      .values({ unitId, weaponId: weapon.id })
      .onConflictDoNothing();
  }
}

async function processKeyword(
  db: ReturnType<typeof getDb>,
  unitId: number,
  keywordName: string
): Promise<void> {
  let keywordType = 'unit_type';
  if (keywordName.toLowerCase().includes('faction')) {
    keywordType = 'faction';
  } else if (['infantry', 'vehicle', 'monster', 'character', 'fly'].some((k) =>
    keywordName.toLowerCase().includes(k)
  )) {
    keywordType = 'unit_type';
  }

  let [keyword] = await db
    .select()
    .from(schema.keywords)
    .where(eq(schema.keywords.name, keywordName))
    .limit(1);

  if (!keyword) {
    [keyword] = await db
      .insert(schema.keywords)
      .values({ name: keywordName, keywordType })
      .returning();
  }

  await db
    .insert(schema.unitKeywords)
    .values({ unitId, keywordId: keyword!.id })
    .onConflictDoNothing();
}

async function processUnit(
  db: ReturnType<typeof getDb>,
  factionId: number,
  entry: BSDataEntry
): Promise<void> {
  const name = entry['@_name'];
  const slug = slugify(name);

  const profiles = normalizeArray(entry.profiles?.profile);
  const unitProfile = profiles.find((p) => p['@_typeName'] === 'Unit');
  const stats = unitProfile ? extractUnitStats(unitProfile) : {};

  const costs = normalizeArray(entry.costs?.cost);
  const pointsCost = costs.find((c) => c['@_name'] === 'pts');
  const points = pointsCost ? parseInt(pointsCost['@_value'], 10) : null;

  const categoryLinks = normalizeArray(entry.categoryLinks?.categoryLink);
  const keywords = categoryLinks.map((c) => c['@_name']).filter(Boolean);

  const isEpicHero = keywords.some((k) => k.toLowerCase().includes('epic hero'));
  const isBattleline = keywords.some((k) => k.toLowerCase().includes('battleline'));

  const [unit] = await db
    .insert(schema.units)
    .values({
      slug,
      name,
      factionId,
      movement: stats.movement as string ?? null,
      toughness: stats.toughness as number ?? null,
      save: stats.save as string ?? null,
      invulnerableSave: stats.invulnerableSave as string ?? null,
      wounds: stats.wounds as number ?? null,
      leadership: stats.leadership as number ?? null,
      objectiveControl: stats.objectiveControl as number ?? null,
      pointsCost: points,
      isEpicHero,
      isBattleline,
      bsdataEntryId: entry['@_id'],
      dataSource: 'bsdata',
    })
    .onConflictDoUpdate({
      target: [schema.units.slug, schema.units.factionId],
      set: {
        movement: stats.movement as string ?? null,
        toughness: stats.toughness as number ?? null,
        save: stats.save as string ?? null,
        invulnerableSave: stats.invulnerableSave as string ?? null,
        wounds: stats.wounds as number ?? null,
        leadership: stats.leadership as number ?? null,
        objectiveControl: stats.objectiveControl as number ?? null,
        pointsCost: points,
        isEpicHero,
        isBattleline,
        bsdataEntryId: entry['@_id'],
        updatedAt: new Date(),
      },
    })
    .returning();

  const rangedProfiles = profiles.filter((p) => p['@_typeName'] === 'Ranged Weapons');
  const meleeProfiles = profiles.filter((p) => p['@_typeName'] === 'Melee Weapons');

  for (const weaponProfile of rangedProfiles) {
    await processWeapon(db, unit!.id, weaponProfile, 'ranged');
  }

  for (const weaponProfile of meleeProfiles) {
    await processWeapon(db, unit!.id, weaponProfile, 'melee');
  }

  for (const keyword of keywords) {
    await processKeyword(db, unit!.id, keyword);
  }
}

async function ingestCatalogues(db: ReturnType<typeof getDb>): Promise<void> {
  const files = readdirSync(BSDATA_CACHE_DIR).filter(
    (f) => f.endsWith('.cat') || f.endsWith('.gst')
  );

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });

  for (const file of files) {
    console.log(`\nProcessing: ${file}`);

    const content = readFileSync(join(BSDATA_CACHE_DIR, file), 'utf-8');
    const parsed = parser.parse(content) as BSDataCatalogue;

    const catalogue = parsed.catalogue;
    if (!catalogue) {
      console.log('  Skipping (not a catalogue)');
      continue;
    }

    const catalogueName = catalogue['@_name'];
    const catalogueId = catalogue['@_id'];

    const factionSlug = mapCatalogueToFaction(catalogueName);
    if (!factionSlug) {
      console.log(`  Skipping (no faction mapping for "${catalogueName}")`);
      continue;
    }

    let [faction] = await db
      .select()
      .from(schema.factions)
      .where(eq(schema.factions.slug, factionSlug))
      .limit(1);

    if (!faction) {
      [faction] = await db
        .insert(schema.factions)
        .values({
          slug: factionSlug,
          name: catalogueName,
          bsdataCatalogueId: catalogueId,
          dataSource: 'bsdata',
        })
        .returning();
    } else {
      await db
        .update(schema.factions)
        .set({ bsdataCatalogueId: catalogueId })
        .where(eq(schema.factions.id, faction.id));
    }

    const entries = normalizeArray(catalogue.selectionEntries?.selectionEntry);
    const sharedEntries = normalizeArray(catalogue.sharedSelectionEntries?.selectionEntry);

    const allEntries = [...entries, ...sharedEntries];
    let unitCount = 0;

    for (const entry of allEntries) {
      if (entry['@_type'] === 'unit' || entry['@_type'] === 'model') {
        await processUnit(db, faction!.id, entry);
        unitCount++;
      }
    }

    console.log(`  Processed ${unitCount} units`);
  }
}

async function runBsdataIngest(): Promise<void> {
  console.log('Starting BSData ingestion...');

  if (!existsSync(BSDATA_CACHE_DIR)) {
    mkdirSync(BSDATA_CACHE_DIR, { recursive: true });
  }

  await fetchCatalogues();

  const db = getDb();

  try {
    await ingestCatalogues(db);
    console.log('\nBSData ingestion completed!');
  } finally {
    await closeConnection();
  }
}

async function runFullIngestion(options: { skipMigrate?: boolean; skipWahapedia?: boolean; skipBsdata?: boolean }): Promise<void> {
  const { skipMigrate, skipWahapedia, skipBsdata } = options;

  console.log('Starting full data ingestion pipeline...\n');

  try {
    if (!skipMigrate) {
      await run('src/db/migrate.ts');
    }

    if (!skipWahapedia) {
      await run('src/scraper/run-scraper.ts', ['--target', 'all']);
    }

    if (!skipBsdata) {
      await runBsdataIngest();
    }

    console.log('\n' + '='.repeat(60));
    console.log('Full ingestion completed successfully!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\nIngestion failed:', error);
    process.exit(1);
  }
}

export const ingestCommand = new Command('ingest')
  .description('Run data ingestion pipeline')
  .option('--skip-migrate', 'Skip database migration')
  .option('--skip-wahapedia', 'Skip Wahapedia scraping')
  .option('--skip-bsdata', 'Skip BSData ingestion')
  .action(async (options) => {
    await runFullIngestion(options);
  });

ingestCommand
  .command('bsdata')
  .description('Ingest BSData only')
  .action(async () => {
    await runBsdataIngest();
  });
