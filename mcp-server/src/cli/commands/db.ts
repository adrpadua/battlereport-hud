import { Command } from 'commander';
import { getPool, closeConnection } from '../../db/connection.js';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

async function runMigration(): Promise<void> {
  console.log('Starting database migration...');

  const pool = getPool();
  const db = drizzle(pool);

  try {
    // Create enums
    console.log('Creating enums...');
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE data_source AS ENUM ('wahapedia', 'bsdata', 'manual');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE phase AS ENUM ('command', 'movement', 'shooting', 'charge', 'fight', 'any');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE weapon_type AS ENUM ('ranged', 'melee');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create tables
    console.log('Creating tables...');

    // Core rules
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS core_rules (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(255) NOT NULL UNIQUE,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        subcategory VARCHAR(100),
        content TEXT NOT NULL,
        raw_html TEXT,
        order_index INTEGER DEFAULT 0,
        source_url TEXT,
        data_source data_source NOT NULL DEFAULT 'wahapedia',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS core_rules_category_idx ON core_rules(category);
    `);

    // Factions
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS factions (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        short_name VARCHAR(50),
        parent_faction_id INTEGER REFERENCES factions(id),
        is_subfaction BOOLEAN DEFAULT FALSE,
        army_rules TEXT,
        army_rules_raw TEXT,
        lore TEXT,
        icon_url TEXT,
        source_url TEXT,
        wahapedia_path VARCHAR(255),
        bsdata_catalogue_id VARCHAR(100),
        data_source data_source NOT NULL DEFAULT 'wahapedia',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS factions_name_idx ON factions(name);
    `);

    // Detachments
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS detachments (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        faction_id INTEGER REFERENCES factions(id) NOT NULL,
        detachment_rule TEXT,
        detachment_rule_name VARCHAR(255),
        restrictions TEXT,
        lore TEXT,
        source_url TEXT,
        data_source data_source NOT NULL DEFAULT 'wahapedia',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(slug, faction_id)
      );
      CREATE INDEX IF NOT EXISTS detachments_faction_idx ON detachments(faction_id);
    `);

    // Units
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS units (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        faction_id INTEGER REFERENCES factions(id) NOT NULL,
        movement VARCHAR(20),
        toughness INTEGER,
        save VARCHAR(10),
        invulnerable_save VARCHAR(10),
        wounds INTEGER,
        leadership INTEGER,
        objective_control INTEGER,
        base_size VARCHAR(50),
        min_models INTEGER,
        max_models INTEGER,
        points_cost INTEGER,
        points_per_model INTEGER,
        unit_composition TEXT,
        wargear_options TEXT,
        transport_capacity TEXT,
        leader_info TEXT,
        led_by TEXT,
        is_epic_hero BOOLEAN DEFAULT FALSE,
        is_battleline BOOLEAN DEFAULT FALSE,
        is_dedicated_transport BOOLEAN DEFAULT FALSE,
        legends BOOLEAN DEFAULT FALSE,
        lore TEXT,
        source_url TEXT,
        bsdata_entry_id VARCHAR(100),
        data_source data_source NOT NULL DEFAULT 'wahapedia',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(slug, faction_id)
      );
      CREATE INDEX IF NOT EXISTS units_faction_idx ON units(faction_id);
      CREATE INDEX IF NOT EXISTS units_name_idx ON units(name);
    `);

    // Unit profiles
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS unit_profiles (
        id SERIAL PRIMARY KEY,
        unit_id INTEGER REFERENCES units(id) NOT NULL,
        profile_name VARCHAR(255) NOT NULL,
        condition VARCHAR(255),
        movement VARCHAR(20),
        toughness INTEGER,
        save VARCHAR(10),
        wounds INTEGER,
        leadership INTEGER,
        objective_control INTEGER,
        order_index INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS unit_profiles_unit_idx ON unit_profiles(unit_id);
    `);

    // Weapons
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS weapons (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        weapon_type weapon_type NOT NULL,
        range VARCHAR(20),
        attacks VARCHAR(20),
        skill VARCHAR(10),
        strength VARCHAR(10),
        armor_penetration VARCHAR(10),
        damage VARCHAR(20),
        abilities TEXT,
        abilities_json JSONB,
        source_url TEXT,
        data_source data_source NOT NULL DEFAULT 'wahapedia',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS weapons_name_idx ON weapons(name);
      CREATE INDEX IF NOT EXISTS weapons_type_idx ON weapons(weapon_type);
    `);

    // Unit weapons junction
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS unit_weapons (
        id SERIAL PRIMARY KEY,
        unit_id INTEGER REFERENCES units(id) NOT NULL,
        weapon_id INTEGER REFERENCES weapons(id) NOT NULL,
        is_default BOOLEAN DEFAULT TRUE,
        is_option BOOLEAN DEFAULT FALSE,
        points_cost INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS unit_weapons_unit_idx ON unit_weapons(unit_id);
      CREATE INDEX IF NOT EXISTS unit_weapons_weapon_idx ON unit_weapons(weapon_id);
    `);

    // Abilities
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS abilities (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        ability_type VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        phase phase,
        faction_id INTEGER REFERENCES factions(id),
        source_url TEXT,
        data_source data_source NOT NULL DEFAULT 'wahapedia',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS abilities_name_idx ON abilities(name);
      CREATE INDEX IF NOT EXISTS abilities_type_idx ON abilities(ability_type);
      CREATE INDEX IF NOT EXISTS abilities_faction_idx ON abilities(faction_id);
    `);

    // Unit abilities junction
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS unit_abilities (
        id SERIAL PRIMARY KEY,
        unit_id INTEGER REFERENCES units(id) NOT NULL,
        ability_id INTEGER REFERENCES abilities(id) NOT NULL
      );
      CREATE INDEX IF NOT EXISTS unit_abilities_unit_idx ON unit_abilities(unit_id);
      CREATE INDEX IF NOT EXISTS unit_abilities_ability_idx ON unit_abilities(ability_id);
    `);

    // Stratagems
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS stratagems (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        cp_cost VARCHAR(10) NOT NULL,
        phase phase NOT NULL,
        detachment_id INTEGER REFERENCES detachments(id),
        faction_id INTEGER REFERENCES factions(id),
        is_core BOOLEAN DEFAULT FALSE,
        "when" TEXT,
        target TEXT,
        effect TEXT NOT NULL,
        restrictions TEXT,
        source_url TEXT,
        data_source data_source NOT NULL DEFAULT 'wahapedia',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS stratagems_name_idx ON stratagems(name);
      CREATE INDEX IF NOT EXISTS stratagems_detachment_idx ON stratagems(detachment_id);
      CREATE INDEX IF NOT EXISTS stratagems_faction_idx ON stratagems(faction_id);
      CREATE INDEX IF NOT EXISTS stratagems_phase_idx ON stratagems(phase);
    `);

    // Enhancements
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS enhancements (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        points_cost INTEGER NOT NULL,
        detachment_id INTEGER REFERENCES detachments(id) NOT NULL,
        description TEXT NOT NULL,
        restrictions TEXT,
        source_url TEXT,
        data_source data_source NOT NULL DEFAULT 'wahapedia',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS enhancements_name_idx ON enhancements(name);
      CREATE INDEX IF NOT EXISTS enhancements_detachment_idx ON enhancements(detachment_id);
    `);

    // Keywords
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS keywords (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        keyword_type VARCHAR(50) NOT NULL,
        description TEXT
      );
      CREATE INDEX IF NOT EXISTS keywords_type_idx ON keywords(keyword_type);
    `);

    // Unit keywords junction
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS unit_keywords (
        id SERIAL PRIMARY KEY,
        unit_id INTEGER REFERENCES units(id) NOT NULL,
        keyword_id INTEGER REFERENCES keywords(id) NOT NULL
      );
      CREATE INDEX IF NOT EXISTS unit_keywords_unit_idx ON unit_keywords(unit_id);
      CREATE INDEX IF NOT EXISTS unit_keywords_keyword_idx ON unit_keywords(keyword_id);
    `);

    // FAQs
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS faqs (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        faction_id INTEGER REFERENCES factions(id),
        question TEXT,
        answer TEXT,
        content TEXT,
        effective_date TIMESTAMP,
        source_url TEXT,
        data_source data_source NOT NULL DEFAULT 'wahapedia',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS faqs_category_idx ON faqs(category);
      CREATE INDEX IF NOT EXISTS faqs_faction_idx ON faqs(faction_id);
    `);

    // Missions
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS missions (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        mission_type VARCHAR(50) NOT NULL,
        primary_objective TEXT,
        deployment TEXT,
        mission_rule TEXT,
        source_url TEXT,
        data_source data_source NOT NULL DEFAULT 'wahapedia',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS missions_type_idx ON missions(mission_type);
    `);

    // Secondary objectives
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS secondary_objectives (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        scoring_condition TEXT,
        max_points INTEGER,
        faction_id INTEGER REFERENCES factions(id),
        source_url TEXT,
        data_source data_source NOT NULL DEFAULT 'wahapedia',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS secondary_objectives_category_idx ON secondary_objectives(category);
      CREATE INDEX IF NOT EXISTS secondary_objectives_faction_idx ON secondary_objectives(faction_id);
    `);

    // Scrape log
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS scrape_log (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        scrape_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        content_hash VARCHAR(64),
        error_message TEXT,
        scraped_at TIMESTAMP DEFAULT NOW(),
        processed_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS scrape_log_url_idx ON scrape_log(url);
      CREATE INDEX IF NOT EXISTS scrape_log_type_idx ON scrape_log(scrape_type);
    `);

    // Scrape status enum for unit_index
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE scrape_status AS ENUM ('pending', 'success', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Unit index (for tracking discovered units before full scrape)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS unit_index (
        id SERIAL PRIMARY KEY,
        faction_id INTEGER REFERENCES factions(id) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        wahapedia_url TEXT,
        discovered_at TIMESTAMP DEFAULT NOW(),
        last_scraped_at TIMESTAMP,
        scrape_status scrape_status DEFAULT 'pending'
      );
      CREATE INDEX IF NOT EXISTS unit_index_faction_idx ON unit_index(faction_id);
      CREATE UNIQUE INDEX IF NOT EXISTS unit_index_slug_faction_idx ON unit_index(slug, faction_id);
      CREATE INDEX IF NOT EXISTS unit_index_status_idx ON unit_index(scrape_status);
    `);

    // AI response cache (for caching raw OpenAI JSON before processing)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_response_cache (
        id SERIAL PRIMARY KEY,
        video_id VARCHAR(20) NOT NULL,
        factions JSONB NOT NULL,
        raw_response TEXT NOT NULL,
        prompt_hash VARCHAR(64),
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ai_response_cache_video_faction_idx ON ai_response_cache(video_id, factions);
      CREATE INDEX IF NOT EXISTS ai_response_cache_expires_at_idx ON ai_response_cache(expires_at);
    `);

    // Extraction cache (for caching final extraction results)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS extraction_cache (
        id SERIAL PRIMARY KEY,
        video_id VARCHAR(20) NOT NULL UNIQUE,
        factions JSONB NOT NULL,
        report JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS extraction_cache_video_id_idx ON extraction_cache(video_id);
      CREATE INDEX IF NOT EXISTS extraction_cache_expires_at_idx ON extraction_cache(expires_at);
    `);

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await closeConnection();
  }
}

async function checkStatus(): Promise<void> {
  console.log('Checking database connection...');

  const pool = getPool();

  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as time, current_database() as db, current_user as user');
    client.release();

    const { time, db, user } = result.rows[0];
    console.log('\n=== Database Connection Status ===');
    console.log(`  Connected: Yes`);
    console.log(`  Database: ${db}`);
    console.log(`  User: ${user}`);
    console.log(`  Server time: ${time}`);

    // Get table counts
    const db2 = drizzle(pool);
    const tables = ['factions', 'units', 'weapons', 'abilities', 'stratagems', 'detachments', 'core_rules', 'missions', 'secondary_objectives', 'ai_response_cache', 'extraction_cache'];

    console.log('\n=== Table Counts ===');
    for (const table of tables) {
      try {
        const countResult = await db2.execute(sql.raw(`SELECT COUNT(*) as count FROM ${table}`));
        const count = (countResult.rows[0] as { count: string }).count;
        console.log(`  ${table}: ${count} rows`);
      } catch {
        console.log(`  ${table}: (table not found)`);
      }
    }
  } catch (error) {
    console.error('Connection failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

export const dbCommand = new Command('db')
  .description('Database operations');

dbCommand
  .command('migrate')
  .description('Run database migrations')
  .action(async () => {
    await runMigration();
  });

dbCommand
  .command('status')
  .description('Show database connection status')
  .action(async () => {
    await checkStatus();
  });

dbCommand
  .command('fix-factions')
  .description('Fix corrupted faction names by deriving from slug')
  .action(async () => {
    await fixFactionNames();
  });

dbCommand
  .command('debug-unit')
  .description('Debug unit data including duplicate weapons/abilities')
  .argument('<name>', 'Unit name to search for')
  .action(async (name: string) => {
    await debugUnit(name);
  });

async function debugUnit(unitName: string): Promise<void> {
  console.log(`Debugging unit: ${unitName}\n`);

  const pool = getPool();
  const db = drizzle(pool);

  try {
    // Find the unit
    const units = await db.execute(sql`
      SELECT u.id, u.name, f.name as faction
      FROM units u
      JOIN factions f ON u.faction_id = f.id
      WHERE u.name ILIKE ${'%' + unitName + '%'}
      LIMIT 5
    `);

    if (units.rows.length === 0) {
      console.log('No units found matching that name');
      return;
    }

    console.log('=== Matching Units ===');
    for (const u of units.rows as { id: number; name: string; faction: string }[]) {
      console.log(`  [${u.id}] ${u.name} (${u.faction})`);
    }

    const unitId = (units.rows[0] as { id: number }).id;
    console.log(`\nUsing unit ID: ${unitId}\n`);

    // Check weapon join table entries
    console.log('=== Weapon Join Table Entries (unit_weapons) ===');
    const weaponJoins = await db.execute(sql`
      SELECT uw.id as join_id, uw.weapon_id, w.name, w.weapon_type
      FROM unit_weapons uw
      JOIN weapons w ON uw.weapon_id = w.id
      WHERE uw.unit_id = ${unitId}
      ORDER BY w.name
    `);
    for (const w of weaponJoins.rows as { join_id: number; weapon_id: number; name: string; weapon_type: string }[]) {
      console.log(`  join_id=${w.join_id} weapon_id=${w.weapon_id} "${w.name}" (${w.weapon_type})`);
    }
    console.log(`Total: ${weaponJoins.rows.length} join entries`);

    // Check for duplicate weapon names
    console.log('\n=== Weapons Grouped by Name ===');
    const weaponsByName = await db.execute(sql`
      SELECT w.name, COUNT(*) as count, array_agg(DISTINCT w.id) as weapon_ids
      FROM unit_weapons uw
      JOIN weapons w ON uw.weapon_id = w.id
      WHERE uw.unit_id = ${unitId}
      GROUP BY w.name
      ORDER BY count DESC
    `);
    for (const w of weaponsByName.rows as { name: string; count: string; weapon_ids: number[] }[]) {
      console.log(`  "${w.name}": ${w.count} entries, weapon IDs: [${w.weapon_ids.join(', ')}]`);
    }

    // Check ability join table entries
    console.log('\n=== Ability Join Table Entries (unit_abilities) ===');
    const abilityJoins = await db.execute(sql`
      SELECT ua.id as join_id, ua.ability_id, a.name, a.ability_type
      FROM unit_abilities ua
      JOIN abilities a ON ua.ability_id = a.id
      WHERE ua.unit_id = ${unitId}
      ORDER BY a.name
    `);
    for (const a of abilityJoins.rows as { join_id: number; ability_id: number; name: string; ability_type: string }[]) {
      console.log(`  join_id=${a.join_id} ability_id=${a.ability_id} "${a.name}" (${a.ability_type})`);
    }
    console.log(`Total: ${abilityJoins.rows.length} join entries`);

    // Check for duplicate ability names
    console.log('\n=== Abilities Grouped by Name ===');
    const abilitiesByName = await db.execute(sql`
      SELECT a.name, COUNT(*) as count, array_agg(DISTINCT a.id) as ability_ids
      FROM unit_abilities ua
      JOIN abilities a ON ua.ability_id = a.id
      WHERE ua.unit_id = ${unitId}
      GROUP BY a.name
      ORDER BY count DESC
    `);
    for (const a of abilitiesByName.rows as { name: string; count: string; ability_ids: number[] }[]) {
      console.log(`  "${a.name}": ${a.count} entries, ability IDs: [${a.ability_ids.join(', ')}]`);
    }

    // Check keywords
    console.log('\n=== Keyword Join Table Entries (unit_keywords) ===');
    const keywordJoins = await db.execute(sql`
      SELECT uk.id as join_id, uk.keyword_id, k.name
      FROM unit_keywords uk
      JOIN keywords k ON uk.keyword_id = k.id
      WHERE uk.unit_id = ${unitId}
      ORDER BY k.name
    `);
    for (const k of keywordJoins.rows as { join_id: number; keyword_id: number; name: string }[]) {
      console.log(`  join_id=${k.join_id} keyword_id=${k.keyword_id} "${k.name}"`);
    }
    console.log(`Total: ${keywordJoins.rows.length} join entries`);

  } catch (error) {
    console.error('Debug failed:', error);
    throw error;
  } finally {
    await closeConnection();
  }
}

async function fixFactionNames(): Promise<void> {
  console.log('Fixing corrupted faction names...');

  const pool = getPool();
  const db = drizzle(pool);

  // Map of slug -> proper display name
  const factionNameMap: Record<string, string> = {
    'adeptus-custodes': 'Adeptus Custodes',
    'adeptus-mechanicus': 'Adeptus Mechanicus',
    'aeldari': 'Aeldari',
    'agents-of-the-imperium': 'Agents of the Imperium',
    'astra-militarum': 'Astra Militarum',
    'black-templars': 'Black Templars',
    'blood-angels': 'Blood Angels',
    'chaos-daemons': 'Chaos Daemons',
    'chaos-knights': 'Chaos Knights',
    'chaos-space-marines': 'Chaos Space Marines',
    'dark-angels': 'Dark Angels',
    'death-guard': 'Death Guard',
    'deathwatch': 'Deathwatch',
    'drukhari': 'Drukhari',
    'genestealers-cults': 'Genestealer Cults',
    'genestealer-cults': 'Genestealer Cults',
    'grey-knights': 'Grey Knights',
    'imperial-knights': 'Imperial Knights',
    'leagues-of-votann': 'Leagues of Votann',
    'necrons': 'Necrons',
    'orks': 'Orks',
    'space-marines': 'Space Marines',
    'space-wolves': 'Space Wolves',
    'tau-empire': "T'au Empire",
    't-au-empire': "T'au Empire",
    'thousand-sons': 'Thousand Sons',
    'tyranids': 'Tyranids',
    'world-eaters': 'World Eaters',
    'sisters-of-battle': 'Adepta Sororitas',
    'adepta-sororitas': 'Adepta Sororitas',
  };

  try {
    // Get all factions
    const factions = await db.execute(sql`SELECT id, slug, name FROM factions`);

    let fixedCount = 0;
    for (const faction of factions.rows as { id: number; slug: string; name: string }[]) {
      const properName = factionNameMap[faction.slug];

      if (properName && faction.name !== properName) {
        console.log(`  Fixing: "${faction.slug}"`);
        console.log(`    Old name: "${faction.name.substring(0, 50)}${faction.name.length > 50 ? '...' : ''}"`);
        console.log(`    New name: "${properName}"`);

        await db.execute(
          sql`UPDATE factions SET name = ${properName}, updated_at = NOW() WHERE id = ${faction.id}`
        );
        fixedCount++;
      } else if (!properName) {
        // Try to derive name from slug for unknown factions
        const derivedName = faction.slug
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        if (faction.name !== derivedName && faction.name.length > derivedName.length + 10) {
          console.log(`  Fixing (derived): "${faction.slug}"`);
          console.log(`    Old name: "${faction.name.substring(0, 50)}${faction.name.length > 50 ? '...' : ''}"`);
          console.log(`    New name: "${derivedName}"`);

          await db.execute(
            sql`UPDATE factions SET name = ${derivedName}, updated_at = NOW() WHERE id = ${faction.id}`
          );
          fixedCount++;
        }
      }
    }

    console.log(`\nFixed ${fixedCount} faction name(s)`);
  } catch (error) {
    console.error('Failed to fix faction names:', error);
    throw error;
  } finally {
    await closeConnection();
  }
}
