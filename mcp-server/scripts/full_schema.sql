-- ============================================================================
-- BattleReport HUD - Full Database Schema Migration
-- ============================================================================
-- This migration creates the complete database schema from scratch.
-- Run with: psql -d your_database -f full_schema.sql
-- Or: cat full_schema.sql | psql -d your_database
-- ============================================================================

-- Uncomment the following lines to drop existing schema first:
-- DROP SCHEMA public CASCADE;
-- CREATE SCHEMA public;

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE "public"."data_source" AS ENUM('wahapedia', 'bsdata', 'manual');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "public"."phase" AS ENUM('command', 'movement', 'shooting', 'charge', 'fight', 'any');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "public"."weapon_type" AS ENUM('ranged', 'melee');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "public"."scrape_status" AS ENUM('pending', 'success', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- CORE RULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS "core_rules" (
    "id" serial PRIMARY KEY NOT NULL,
    "slug" varchar(255) NOT NULL,
    "title" varchar(255) NOT NULL,
    "category" varchar(100) NOT NULL,
    "subcategory" varchar(100),
    "content" text NOT NULL,
    "raw_html" text,
    "order_index" integer DEFAULT 0,
    "source_url" text,
    "data_source" "data_source" DEFAULT 'wahapedia' NOT NULL,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "core_rules_slug_unique" UNIQUE("slug")
);

-- ============================================================================
-- FACTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "factions" (
    "id" serial PRIMARY KEY NOT NULL,
    "slug" varchar(100) NOT NULL,
    "name" varchar(255) NOT NULL,
    "short_name" varchar(50),
    "parent_faction_id" integer,
    "is_subfaction" boolean DEFAULT false,
    "army_rules" text,
    "army_rules_raw" text,
    "lore" text,
    "icon_url" text,
    "source_url" text,
    "wahapedia_path" varchar(255),
    "bsdata_catalogue_id" varchar(100),
    "data_source" "data_source" DEFAULT 'wahapedia' NOT NULL,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "factions_slug_unique" UNIQUE("slug")
);

-- ============================================================================
-- DETACHMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "detachments" (
    "id" serial PRIMARY KEY NOT NULL,
    "slug" varchar(255) NOT NULL,
    "name" varchar(255) NOT NULL,
    "faction_id" integer NOT NULL,
    "detachment_rule" text,
    "detachment_rule_name" varchar(255),
    "restrictions" text,
    "lore" text,
    "source_url" text,
    "data_source" "data_source" DEFAULT 'wahapedia' NOT NULL,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

-- ============================================================================
-- UNITS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "units" (
    "id" serial PRIMARY KEY NOT NULL,
    "slug" varchar(255) NOT NULL,
    "name" varchar(255) NOT NULL,
    "faction_id" integer NOT NULL,
    "movement" varchar(20),
    "toughness" integer,
    "save" varchar(50),
    "invulnerable_save" varchar(50),
    "wounds" integer,
    "leadership" integer,
    "objective_control" integer,
    "base_size" varchar(50),
    "min_models" integer,
    "max_models" integer,
    "points_cost" integer,
    "points_per_model" integer,
    "unit_composition" text,
    "wargear_options" text,
    "transport_capacity" text,
    "leader_info" text,
    "led_by" text,
    "is_epic_hero" boolean DEFAULT false,
    "is_battleline" boolean DEFAULT false,
    "is_dedicated_transport" boolean DEFAULT false,
    "legends" boolean DEFAULT false,
    "lore" text,
    "source_url" text,
    "bsdata_entry_id" varchar(100),
    "data_source" "data_source" DEFAULT 'wahapedia' NOT NULL,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

-- ============================================================================
-- UNIT PROFILES (for variable stat profiles)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "unit_profiles" (
    "id" serial PRIMARY KEY NOT NULL,
    "unit_id" integer NOT NULL,
    "profile_name" varchar(255) NOT NULL,
    "condition" varchar(255),
    "movement" varchar(20),
    "toughness" integer,
    "save" varchar(50),
    "wounds" integer,
    "leadership" integer,
    "objective_control" integer,
    "order_index" integer DEFAULT 0
);

-- ============================================================================
-- WEAPONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "weapons" (
    "id" serial PRIMARY KEY NOT NULL,
    "slug" varchar(255) NOT NULL,
    "name" varchar(255) NOT NULL,
    "weapon_type" "weapon_type" NOT NULL,
    "range" varchar(20),
    "attacks" varchar(20),
    "skill" varchar(50),
    "strength" varchar(50),
    "armor_penetration" varchar(50),
    "damage" varchar(20),
    "abilities" text,
    "abilities_json" jsonb,
    "source_url" text,
    "data_source" "data_source" DEFAULT 'wahapedia' NOT NULL,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

-- ============================================================================
-- UNIT WEAPONS (junction table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "unit_weapons" (
    "id" serial PRIMARY KEY NOT NULL,
    "unit_id" integer NOT NULL,
    "weapon_id" integer NOT NULL,
    "is_default" boolean DEFAULT true,
    "is_option" boolean DEFAULT false,
    "points_cost" integer DEFAULT 0
);

-- ============================================================================
-- ABILITIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS "abilities" (
    "id" serial PRIMARY KEY NOT NULL,
    "slug" varchar(255) NOT NULL,
    "name" varchar(255) NOT NULL,
    "ability_type" varchar(50) NOT NULL,
    "description" text NOT NULL,
    "phase" "phase",
    "faction_id" integer,
    "source_url" text,
    "data_source" "data_source" DEFAULT 'wahapedia' NOT NULL,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

-- ============================================================================
-- UNIT ABILITIES (junction table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "unit_abilities" (
    "id" serial PRIMARY KEY NOT NULL,
    "unit_id" integer NOT NULL,
    "ability_id" integer NOT NULL
);

-- ============================================================================
-- STRATAGEMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "stratagems" (
    "id" serial PRIMARY KEY NOT NULL,
    "slug" varchar(255) NOT NULL,
    "name" varchar(255) NOT NULL,
    "cp_cost" varchar(10) NOT NULL,
    "phase" "phase" NOT NULL,
    "detachment_id" integer,
    "faction_id" integer,
    "is_core" boolean DEFAULT false,
    "when" text,
    "target" text,
    "effect" text NOT NULL,
    "restrictions" text,
    "source_url" text,
    "data_source" "data_source" DEFAULT 'wahapedia' NOT NULL,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

-- ============================================================================
-- ENHANCEMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "enhancements" (
    "id" serial PRIMARY KEY NOT NULL,
    "slug" varchar(255) NOT NULL,
    "name" varchar(255) NOT NULL,
    "points_cost" integer NOT NULL,
    "detachment_id" integer NOT NULL,
    "description" text NOT NULL,
    "restrictions" text,
    "source_url" text,
    "data_source" "data_source" DEFAULT 'wahapedia' NOT NULL,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

-- ============================================================================
-- KEYWORDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "keywords" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar(100) NOT NULL,
    "keyword_type" varchar(50) NOT NULL,
    "description" text,
    CONSTRAINT "keywords_name_unique" UNIQUE("name")
);

-- ============================================================================
-- UNIT KEYWORDS (junction table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "unit_keywords" (
    "id" serial PRIMARY KEY NOT NULL,
    "unit_id" integer NOT NULL,
    "keyword_id" integer NOT NULL
);

-- ============================================================================
-- FAQs & ERRATA
-- ============================================================================

CREATE TABLE IF NOT EXISTS "faqs" (
    "id" serial PRIMARY KEY NOT NULL,
    "slug" varchar(255) NOT NULL,
    "title" varchar(255) NOT NULL,
    "category" varchar(100) NOT NULL,
    "faction_id" integer,
    "question" text,
    "answer" text,
    "content" text,
    "effective_date" timestamp,
    "source_url" text,
    "data_source" "data_source" DEFAULT 'wahapedia' NOT NULL,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

-- ============================================================================
-- MISSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "missions" (
    "id" serial PRIMARY KEY NOT NULL,
    "slug" varchar(255) NOT NULL,
    "name" varchar(255) NOT NULL,
    "mission_type" varchar(50) NOT NULL,
    "primary_objective" text,
    "deployment" text,
    "mission_rule" text,
    "source_url" text,
    "data_source" "data_source" DEFAULT 'wahapedia' NOT NULL,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "missions_slug_unique" UNIQUE("slug")
);

-- ============================================================================
-- SECONDARY OBJECTIVES
-- ============================================================================

CREATE TABLE IF NOT EXISTS "secondary_objectives" (
    "id" serial PRIMARY KEY NOT NULL,
    "slug" varchar(255) NOT NULL,
    "name" varchar(255) NOT NULL,
    "category" varchar(100) NOT NULL,
    "description" text NOT NULL,
    "scoring_condition" text,
    "max_points" integer,
    "faction_id" integer,
    "source_url" text,
    "data_source" "data_source" DEFAULT 'wahapedia' NOT NULL,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

-- ============================================================================
-- UNIT INDEX (for tracking discovered units before full scrape)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "unit_index" (
    "id" serial PRIMARY KEY NOT NULL,
    "faction_id" integer NOT NULL,
    "slug" varchar(255) NOT NULL,
    "name" varchar(255) NOT NULL,
    "wahapedia_url" text,
    "discovered_at" timestamp DEFAULT now(),
    "last_scraped_at" timestamp,
    "scrape_status" "scrape_status" DEFAULT 'pending'
);

-- ============================================================================
-- AI RESPONSE CACHE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ai_response_cache" (
    "id" serial PRIMARY KEY NOT NULL,
    "video_id" varchar(20) NOT NULL,
    "factions" jsonb NOT NULL,
    "raw_response" text NOT NULL,
    "prompt_hash" varchar(64),
    "created_at" timestamp DEFAULT now(),
    "expires_at" timestamp NOT NULL
);

-- ============================================================================
-- EXTRACTION CACHE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "extraction_cache" (
    "id" serial PRIMARY KEY NOT NULL,
    "video_id" varchar(20) NOT NULL,
    "factions" jsonb NOT NULL,
    "report" jsonb NOT NULL,
    "created_at" timestamp DEFAULT now(),
    "expires_at" timestamp NOT NULL,
    CONSTRAINT "extraction_cache_video_id_unique" UNIQUE("video_id")
);

-- ============================================================================
-- TERRAIN LAYOUTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "terrain_layouts" (
    "id" serial PRIMARY KEY NOT NULL,
    "slug" varchar(100) NOT NULL,
    "name" varchar(100) NOT NULL,
    "season" varchar(50) NOT NULL,
    "image_base64" text NOT NULL,
    "battlefield_width" integer DEFAULT 60 NOT NULL,
    "battlefield_height" integer DEFAULT 44 NOT NULL,
    "source_url" text,
    "data_source" "data_source" DEFAULT 'wahapedia' NOT NULL,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "terrain_layouts_slug_unique" UNIQUE("slug")
);

-- ============================================================================
-- SCRAPE LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS "scrape_log" (
    "id" serial PRIMARY KEY NOT NULL,
    "url" text NOT NULL,
    "scrape_type" varchar(50) NOT NULL,
    "status" varchar(20) NOT NULL,
    "content_hash" varchar(64),
    "error_message" text,
    "scraped_at" timestamp DEFAULT now(),
    "processed_at" timestamp
);

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

-- Factions self-reference
ALTER TABLE "factions" DROP CONSTRAINT IF EXISTS "factions_parent_faction_id_factions_id_fk";
ALTER TABLE "factions" ADD CONSTRAINT "factions_parent_faction_id_factions_id_fk"
    FOREIGN KEY ("parent_faction_id") REFERENCES "public"."factions"("id") ON DELETE no action ON UPDATE no action;

-- Detachments -> Factions
ALTER TABLE "detachments" DROP CONSTRAINT IF EXISTS "detachments_faction_id_factions_id_fk";
ALTER TABLE "detachments" ADD CONSTRAINT "detachments_faction_id_factions_id_fk"
    FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE no action ON UPDATE no action;

-- Units -> Factions
ALTER TABLE "units" DROP CONSTRAINT IF EXISTS "units_faction_id_factions_id_fk";
ALTER TABLE "units" ADD CONSTRAINT "units_faction_id_factions_id_fk"
    FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE no action ON UPDATE no action;

-- Unit Profiles -> Units
ALTER TABLE "unit_profiles" DROP CONSTRAINT IF EXISTS "unit_profiles_unit_id_units_id_fk";
ALTER TABLE "unit_profiles" ADD CONSTRAINT "unit_profiles_unit_id_units_id_fk"
    FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;

-- Unit Weapons -> Units, Weapons
ALTER TABLE "unit_weapons" DROP CONSTRAINT IF EXISTS "unit_weapons_unit_id_units_id_fk";
ALTER TABLE "unit_weapons" ADD CONSTRAINT "unit_weapons_unit_id_units_id_fk"
    FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "unit_weapons" DROP CONSTRAINT IF EXISTS "unit_weapons_weapon_id_weapons_id_fk";
ALTER TABLE "unit_weapons" ADD CONSTRAINT "unit_weapons_weapon_id_weapons_id_fk"
    FOREIGN KEY ("weapon_id") REFERENCES "public"."weapons"("id") ON DELETE no action ON UPDATE no action;

-- Abilities -> Factions
ALTER TABLE "abilities" DROP CONSTRAINT IF EXISTS "abilities_faction_id_factions_id_fk";
ALTER TABLE "abilities" ADD CONSTRAINT "abilities_faction_id_factions_id_fk"
    FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE no action ON UPDATE no action;

-- Unit Abilities -> Units, Abilities
ALTER TABLE "unit_abilities" DROP CONSTRAINT IF EXISTS "unit_abilities_unit_id_units_id_fk";
ALTER TABLE "unit_abilities" ADD CONSTRAINT "unit_abilities_unit_id_units_id_fk"
    FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "unit_abilities" DROP CONSTRAINT IF EXISTS "unit_abilities_ability_id_abilities_id_fk";
ALTER TABLE "unit_abilities" ADD CONSTRAINT "unit_abilities_ability_id_abilities_id_fk"
    FOREIGN KEY ("ability_id") REFERENCES "public"."abilities"("id") ON DELETE no action ON UPDATE no action;

-- Stratagems -> Detachments, Factions
ALTER TABLE "stratagems" DROP CONSTRAINT IF EXISTS "stratagems_detachment_id_detachments_id_fk";
ALTER TABLE "stratagems" ADD CONSTRAINT "stratagems_detachment_id_detachments_id_fk"
    FOREIGN KEY ("detachment_id") REFERENCES "public"."detachments"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "stratagems" DROP CONSTRAINT IF EXISTS "stratagems_faction_id_factions_id_fk";
ALTER TABLE "stratagems" ADD CONSTRAINT "stratagems_faction_id_factions_id_fk"
    FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE no action ON UPDATE no action;

-- Enhancements -> Detachments
ALTER TABLE "enhancements" DROP CONSTRAINT IF EXISTS "enhancements_detachment_id_detachments_id_fk";
ALTER TABLE "enhancements" ADD CONSTRAINT "enhancements_detachment_id_detachments_id_fk"
    FOREIGN KEY ("detachment_id") REFERENCES "public"."detachments"("id") ON DELETE no action ON UPDATE no action;

-- Unit Keywords -> Units, Keywords
ALTER TABLE "unit_keywords" DROP CONSTRAINT IF EXISTS "unit_keywords_unit_id_units_id_fk";
ALTER TABLE "unit_keywords" ADD CONSTRAINT "unit_keywords_unit_id_units_id_fk"
    FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "unit_keywords" DROP CONSTRAINT IF EXISTS "unit_keywords_keyword_id_keywords_id_fk";
ALTER TABLE "unit_keywords" ADD CONSTRAINT "unit_keywords_keyword_id_keywords_id_fk"
    FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE no action ON UPDATE no action;

-- FAQs -> Factions
ALTER TABLE "faqs" DROP CONSTRAINT IF EXISTS "faqs_faction_id_factions_id_fk";
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_faction_id_factions_id_fk"
    FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE no action ON UPDATE no action;

-- Secondary Objectives -> Factions
ALTER TABLE "secondary_objectives" DROP CONSTRAINT IF EXISTS "secondary_objectives_faction_id_factions_id_fk";
ALTER TABLE "secondary_objectives" ADD CONSTRAINT "secondary_objectives_faction_id_factions_id_fk"
    FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE no action ON UPDATE no action;

-- Unit Index -> Factions
ALTER TABLE "unit_index" DROP CONSTRAINT IF EXISTS "unit_index_faction_id_factions_id_fk";
ALTER TABLE "unit_index" ADD CONSTRAINT "unit_index_faction_id_factions_id_fk"
    FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE no action ON UPDATE no action;

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Core Rules
CREATE INDEX IF NOT EXISTS "core_rules_category_idx" ON "core_rules" USING btree ("category");
CREATE UNIQUE INDEX IF NOT EXISTS "core_rules_slug_idx" ON "core_rules" USING btree ("slug");

-- Factions
CREATE INDEX IF NOT EXISTS "factions_name_idx" ON "factions" USING btree ("name");
CREATE UNIQUE INDEX IF NOT EXISTS "factions_slug_idx" ON "factions" USING btree ("slug");

-- Detachments
CREATE INDEX IF NOT EXISTS "detachments_faction_idx" ON "detachments" USING btree ("faction_id");
CREATE UNIQUE INDEX IF NOT EXISTS "detachments_slug_faction_idx" ON "detachments" USING btree ("slug", "faction_id");

-- Units
CREATE INDEX IF NOT EXISTS "units_faction_idx" ON "units" USING btree ("faction_id");
CREATE INDEX IF NOT EXISTS "units_name_idx" ON "units" USING btree ("name");
CREATE UNIQUE INDEX IF NOT EXISTS "units_slug_faction_idx" ON "units" USING btree ("slug", "faction_id");

-- Unit Profiles
CREATE INDEX IF NOT EXISTS "unit_profiles_unit_idx" ON "unit_profiles" USING btree ("unit_id");

-- Weapons
CREATE INDEX IF NOT EXISTS "weapons_name_idx" ON "weapons" USING btree ("name");
CREATE INDEX IF NOT EXISTS "weapons_type_idx" ON "weapons" USING btree ("weapon_type");

-- Unit Weapons
CREATE INDEX IF NOT EXISTS "unit_weapons_unit_idx" ON "unit_weapons" USING btree ("unit_id");
CREATE INDEX IF NOT EXISTS "unit_weapons_weapon_idx" ON "unit_weapons" USING btree ("weapon_id");

-- Abilities
CREATE INDEX IF NOT EXISTS "abilities_name_idx" ON "abilities" USING btree ("name");
CREATE INDEX IF NOT EXISTS "abilities_type_idx" ON "abilities" USING btree ("ability_type");
CREATE INDEX IF NOT EXISTS "abilities_faction_idx" ON "abilities" USING btree ("faction_id");

-- Unit Abilities
CREATE INDEX IF NOT EXISTS "unit_abilities_unit_idx" ON "unit_abilities" USING btree ("unit_id");
CREATE INDEX IF NOT EXISTS "unit_abilities_ability_idx" ON "unit_abilities" USING btree ("ability_id");

-- Stratagems
CREATE INDEX IF NOT EXISTS "stratagems_name_idx" ON "stratagems" USING btree ("name");
CREATE INDEX IF NOT EXISTS "stratagems_detachment_idx" ON "stratagems" USING btree ("detachment_id");
CREATE INDEX IF NOT EXISTS "stratagems_faction_idx" ON "stratagems" USING btree ("faction_id");
CREATE INDEX IF NOT EXISTS "stratagems_phase_idx" ON "stratagems" USING btree ("phase");
CREATE UNIQUE INDEX IF NOT EXISTS "stratagems_slug_faction_unique" ON "stratagems" USING btree ("slug", "faction_id");

-- Enhancements
CREATE INDEX IF NOT EXISTS "enhancements_name_idx" ON "enhancements" USING btree ("name");
CREATE INDEX IF NOT EXISTS "enhancements_detachment_idx" ON "enhancements" USING btree ("detachment_id");

-- Keywords
CREATE UNIQUE INDEX IF NOT EXISTS "keywords_name_idx" ON "keywords" USING btree ("name");
CREATE INDEX IF NOT EXISTS "keywords_type_idx" ON "keywords" USING btree ("keyword_type");

-- Unit Keywords
CREATE INDEX IF NOT EXISTS "unit_keywords_unit_idx" ON "unit_keywords" USING btree ("unit_id");
CREATE INDEX IF NOT EXISTS "unit_keywords_keyword_idx" ON "unit_keywords" USING btree ("keyword_id");

-- FAQs
CREATE INDEX IF NOT EXISTS "faqs_category_idx" ON "faqs" USING btree ("category");
CREATE INDEX IF NOT EXISTS "faqs_faction_idx" ON "faqs" USING btree ("faction_id");
CREATE UNIQUE INDEX IF NOT EXISTS "faqs_slug_idx" ON "faqs" USING btree ("slug");

-- Missions
CREATE INDEX IF NOT EXISTS "missions_type_idx" ON "missions" USING btree ("mission_type");

-- Secondary Objectives
CREATE INDEX IF NOT EXISTS "secondary_objectives_category_idx" ON "secondary_objectives" USING btree ("category");
CREATE INDEX IF NOT EXISTS "secondary_objectives_faction_idx" ON "secondary_objectives" USING btree ("faction_id");

-- Unit Index
CREATE INDEX IF NOT EXISTS "unit_index_faction_idx" ON "unit_index" USING btree ("faction_id");
CREATE UNIQUE INDEX IF NOT EXISTS "unit_index_slug_faction_idx" ON "unit_index" USING btree ("slug", "faction_id");
CREATE INDEX IF NOT EXISTS "unit_index_status_idx" ON "unit_index" USING btree ("scrape_status");

-- AI Response Cache
CREATE UNIQUE INDEX IF NOT EXISTS "ai_response_cache_video_faction_idx" ON "ai_response_cache" USING btree ("video_id", "factions");
CREATE INDEX IF NOT EXISTS "ai_response_cache_expires_at_idx" ON "ai_response_cache" USING btree ("expires_at");

-- Extraction Cache
CREATE UNIQUE INDEX IF NOT EXISTS "extraction_cache_video_id_idx" ON "extraction_cache" USING btree ("video_id");
CREATE INDEX IF NOT EXISTS "extraction_cache_expires_at_idx" ON "extraction_cache" USING btree ("expires_at");

-- Terrain Layouts
CREATE INDEX IF NOT EXISTS "terrain_layouts_season_idx" ON "terrain_layouts" USING btree ("season");
CREATE UNIQUE INDEX IF NOT EXISTS "terrain_layouts_slug_idx" ON "terrain_layouts" USING btree ("slug");

-- Scrape Log
CREATE INDEX IF NOT EXISTS "scrape_log_url_idx" ON "scrape_log" USING btree ("url");
CREATE INDEX IF NOT EXISTS "scrape_log_type_idx" ON "scrape_log" USING btree ("scrape_type");

-- ============================================================================
-- DONE
-- ============================================================================
