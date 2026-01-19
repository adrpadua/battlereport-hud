import 'dotenv/config';
import { getPool, closeConnection } from './connection.js';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

async function migrate() {
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

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await closeConnection();
  }
}

migrate().catch(console.error);
