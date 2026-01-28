CREATE TYPE "public"."data_source" AS ENUM('wahapedia', 'bsdata', 'manual');--> statement-breakpoint
CREATE TYPE "public"."phase" AS ENUM('command', 'movement', 'shooting', 'charge', 'fight', 'any');--> statement-breakpoint
CREATE TYPE "public"."weapon_type" AS ENUM('ranged', 'melee');--> statement-breakpoint
CREATE TABLE "abilities" (
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
--> statement-breakpoint
CREATE TABLE "core_rules" (
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
--> statement-breakpoint
CREATE TABLE "detachments" (
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
--> statement-breakpoint
CREATE TABLE "enhancements" (
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
--> statement-breakpoint
CREATE TABLE "factions" (
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
--> statement-breakpoint
CREATE TABLE "faqs" (
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
--> statement-breakpoint
CREATE TABLE "keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"keyword_type" varchar(50) NOT NULL,
	"description" text,
	CONSTRAINT "keywords_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "missions" (
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
--> statement-breakpoint
CREATE TABLE "scrape_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"scrape_type" varchar(50) NOT NULL,
	"status" varchar(20) NOT NULL,
	"content_hash" varchar(64),
	"error_message" text,
	"scraped_at" timestamp DEFAULT now(),
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "secondary_objectives" (
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
--> statement-breakpoint
CREATE TABLE "stratagems" (
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
--> statement-breakpoint
CREATE TABLE "unit_abilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" integer NOT NULL,
	"ability_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" integer NOT NULL,
	"keyword_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_profiles" (
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
--> statement-breakpoint
CREATE TABLE "unit_weapons" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" integer NOT NULL,
	"weapon_id" integer NOT NULL,
	"is_default" boolean DEFAULT true,
	"is_option" boolean DEFAULT false,
	"points_cost" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "units" (
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
--> statement-breakpoint
CREATE TABLE "weapons" (
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
--> statement-breakpoint
ALTER TABLE "abilities" ADD CONSTRAINT "abilities_faction_id_factions_id_fk" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detachments" ADD CONSTRAINT "detachments_faction_id_factions_id_fk" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhancements" ADD CONSTRAINT "enhancements_detachment_id_detachments_id_fk" FOREIGN KEY ("detachment_id") REFERENCES "public"."detachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factions" ADD CONSTRAINT "factions_parent_faction_id_factions_id_fk" FOREIGN KEY ("parent_faction_id") REFERENCES "public"."factions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_faction_id_factions_id_fk" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secondary_objectives" ADD CONSTRAINT "secondary_objectives_faction_id_factions_id_fk" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stratagems" ADD CONSTRAINT "stratagems_detachment_id_detachments_id_fk" FOREIGN KEY ("detachment_id") REFERENCES "public"."detachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stratagems" ADD CONSTRAINT "stratagems_faction_id_factions_id_fk" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_abilities" ADD CONSTRAINT "unit_abilities_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_abilities" ADD CONSTRAINT "unit_abilities_ability_id_abilities_id_fk" FOREIGN KEY ("ability_id") REFERENCES "public"."abilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_keywords" ADD CONSTRAINT "unit_keywords_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_keywords" ADD CONSTRAINT "unit_keywords_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_profiles" ADD CONSTRAINT "unit_profiles_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_weapons" ADD CONSTRAINT "unit_weapons_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_weapons" ADD CONSTRAINT "unit_weapons_weapon_id_weapons_id_fk" FOREIGN KEY ("weapon_id") REFERENCES "public"."weapons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_faction_id_factions_id_fk" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abilities_name_idx" ON "abilities" USING btree ("name");--> statement-breakpoint
CREATE INDEX "abilities_type_idx" ON "abilities" USING btree ("ability_type");--> statement-breakpoint
CREATE INDEX "abilities_faction_idx" ON "abilities" USING btree ("faction_id");--> statement-breakpoint
CREATE INDEX "core_rules_category_idx" ON "core_rules" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "core_rules_slug_idx" ON "core_rules" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "detachments_faction_idx" ON "detachments" USING btree ("faction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "detachments_slug_faction_idx" ON "detachments" USING btree ("slug","faction_id");--> statement-breakpoint
CREATE INDEX "enhancements_name_idx" ON "enhancements" USING btree ("name");--> statement-breakpoint
CREATE INDEX "enhancements_detachment_idx" ON "enhancements" USING btree ("detachment_id");--> statement-breakpoint
CREATE INDEX "factions_name_idx" ON "factions" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "factions_slug_idx" ON "factions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "faqs_category_idx" ON "faqs" USING btree ("category");--> statement-breakpoint
CREATE INDEX "faqs_faction_idx" ON "faqs" USING btree ("faction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "keywords_name_idx" ON "keywords" USING btree ("name");--> statement-breakpoint
CREATE INDEX "keywords_type_idx" ON "keywords" USING btree ("keyword_type");--> statement-breakpoint
CREATE INDEX "missions_type_idx" ON "missions" USING btree ("mission_type");--> statement-breakpoint
CREATE INDEX "scrape_log_url_idx" ON "scrape_log" USING btree ("url");--> statement-breakpoint
CREATE INDEX "scrape_log_type_idx" ON "scrape_log" USING btree ("scrape_type");--> statement-breakpoint
CREATE INDEX "secondary_objectives_category_idx" ON "secondary_objectives" USING btree ("category");--> statement-breakpoint
CREATE INDEX "secondary_objectives_faction_idx" ON "secondary_objectives" USING btree ("faction_id");--> statement-breakpoint
CREATE INDEX "stratagems_name_idx" ON "stratagems" USING btree ("name");--> statement-breakpoint
CREATE INDEX "stratagems_detachment_idx" ON "stratagems" USING btree ("detachment_id");--> statement-breakpoint
CREATE INDEX "stratagems_faction_idx" ON "stratagems" USING btree ("faction_id");--> statement-breakpoint
CREATE INDEX "stratagems_phase_idx" ON "stratagems" USING btree ("phase");--> statement-breakpoint
CREATE INDEX "unit_abilities_unit_idx" ON "unit_abilities" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "unit_abilities_ability_idx" ON "unit_abilities" USING btree ("ability_id");--> statement-breakpoint
CREATE INDEX "unit_keywords_unit_idx" ON "unit_keywords" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "unit_keywords_keyword_idx" ON "unit_keywords" USING btree ("keyword_id");--> statement-breakpoint
CREATE INDEX "unit_profiles_unit_idx" ON "unit_profiles" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "unit_weapons_unit_idx" ON "unit_weapons" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "unit_weapons_weapon_idx" ON "unit_weapons" USING btree ("weapon_id");--> statement-breakpoint
CREATE INDEX "units_faction_idx" ON "units" USING btree ("faction_id");--> statement-breakpoint
CREATE INDEX "units_name_idx" ON "units" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "units_slug_faction_idx" ON "units" USING btree ("slug","faction_id");--> statement-breakpoint
CREATE INDEX "weapons_name_idx" ON "weapons" USING btree ("name");--> statement-breakpoint
CREATE INDEX "weapons_type_idx" ON "weapons" USING btree ("weapon_type");