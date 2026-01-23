import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// ============================================================================
// ENUMS
// ============================================================================

export const dataSourceEnum = pgEnum('data_source', ['wahapedia', 'bsdata', 'manual']);
export const phaseEnum = pgEnum('phase', [
  'command',
  'movement',
  'shooting',
  'charge',
  'fight',
  'any',
]);
export const weaponTypeEnum = pgEnum('weapon_type', ['ranged', 'melee']);

// ============================================================================
// CORE RULES
// ============================================================================

export const coreRules = pgTable('core_rules', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  title: varchar('title', { length: 255 }).notNull(),
  category: varchar('category', { length: 100 }).notNull(), // e.g., 'phases', 'combat', 'terrain'
  subcategory: varchar('subcategory', { length: 100 }),
  content: text('content').notNull(), // Markdown content
  rawHtml: text('raw_html'), // Original HTML if needed
  orderIndex: integer('order_index').default(0),
  sourceUrl: text('source_url'),
  dataSource: dataSourceEnum('data_source').notNull().default('wahapedia'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  categoryIdx: index('core_rules_category_idx').on(table.category),
  slugIdx: uniqueIndex('core_rules_slug_idx').on(table.slug),
}));

// ============================================================================
// FACTIONS
// ============================================================================

export const factions = pgTable('factions', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  shortName: varchar('short_name', { length: 50 }),
  parentFactionId: integer('parent_faction_id').references((): AnyPgColumn => factions.id),
  isSubfaction: boolean('is_subfaction').default(false),
  armyRules: text('army_rules'), // Markdown content
  armyRulesRaw: text('army_rules_raw'), // Raw HTML
  lore: text('lore'),
  iconUrl: text('icon_url'),
  sourceUrl: text('source_url'),
  wahapediaPath: varchar('wahapedia_path', { length: 255 }),
  bsdataCatalogueId: varchar('bsdata_catalogue_id', { length: 100 }),
  dataSource: dataSourceEnum('data_source').notNull().default('wahapedia'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  nameIdx: index('factions_name_idx').on(table.name),
  slugIdx: uniqueIndex('factions_slug_idx').on(table.slug),
}));

// ============================================================================
// DETACHMENTS
// ============================================================================

export const detachments = pgTable('detachments', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  factionId: integer('faction_id').references(() => factions.id).notNull(),
  detachmentRule: text('detachment_rule'), // The main detachment ability
  detachmentRuleName: varchar('detachment_rule_name', { length: 255 }),
  restrictions: text('restrictions'), // Any restrictions on units/wargear
  lore: text('lore'),
  sourceUrl: text('source_url'),
  dataSource: dataSourceEnum('data_source').notNull().default('wahapedia'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  factionIdx: index('detachments_faction_idx').on(table.factionId),
  slugFactionIdx: uniqueIndex('detachments_slug_faction_idx').on(table.slug, table.factionId),
}));

// ============================================================================
// UNITS
// ============================================================================

export const units = pgTable('units', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  factionId: integer('faction_id').references(() => factions.id).notNull(),

  // Unit stats (can be null for units with variable profiles)
  movement: varchar('movement', { length: 20 }),
  toughness: integer('toughness'),
  save: varchar('save', { length: 50 }),
  invulnerableSave: varchar('invulnerable_save', { length: 50 }),
  wounds: integer('wounds'),
  leadership: integer('leadership'),
  objectiveControl: integer('objective_control'),

  // Composition and points
  baseSize: varchar('base_size', { length: 50 }),
  minModels: integer('min_models'),
  maxModels: integer('max_models'),
  pointsCost: integer('points_cost'),
  pointsPerModel: integer('points_per_model'),

  // Content
  unitComposition: text('unit_composition'),
  wargearOptions: text('wargear_options'),
  transportCapacity: text('transport_capacity'),
  leaderInfo: text('leader_info'), // Which units this can lead
  ledBy: text('led_by'), // Which leaders can lead this unit

  // Metadata
  isEpicHero: boolean('is_epic_hero').default(false),
  isBattleline: boolean('is_battleline').default(false),
  isDedicatedTransport: boolean('is_dedicated_transport').default(false),
  legends: boolean('legends').default(false), // Legends/discontinued units

  lore: text('lore'),
  sourceUrl: text('source_url'),
  bsdataEntryId: varchar('bsdata_entry_id', { length: 100 }),
  dataSource: dataSourceEnum('data_source').notNull().default('wahapedia'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  factionIdx: index('units_faction_idx').on(table.factionId),
  nameIdx: index('units_name_idx').on(table.name),
  slugFactionIdx: uniqueIndex('units_slug_faction_idx').on(table.slug, table.factionId),
}));

// Unit profiles for units with multiple stat lines (e.g., damaged profiles)
export const unitProfiles = pgTable('unit_profiles', {
  id: serial('id').primaryKey(),
  unitId: integer('unit_id').references(() => units.id).notNull(),
  profileName: varchar('profile_name', { length: 255 }).notNull(),
  condition: varchar('condition', { length: 255 }), // e.g., "1-4 wounds remaining"
  movement: varchar('movement', { length: 20 }),
  toughness: integer('toughness'),
  save: varchar('save', { length: 50 }),
  wounds: integer('wounds'),
  leadership: integer('leadership'),
  objectiveControl: integer('objective_control'),
  orderIndex: integer('order_index').default(0),
}, (table) => ({
  unitIdx: index('unit_profiles_unit_idx').on(table.unitId),
}));

// ============================================================================
// WEAPONS
// ============================================================================

export const weapons = pgTable('weapons', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  weaponType: weaponTypeEnum('weapon_type').notNull(),

  // Weapon stats
  range: varchar('range', { length: 20 }), // e.g., "24\"" or "Melee"
  attacks: varchar('attacks', { length: 20 }), // Can be "D6", "2", etc.
  skill: varchar('skill', { length: 50 }), // BS or WS, e.g., "3+"
  strength: varchar('strength', { length: 50 }),
  armorPenetration: varchar('armor_penetration', { length: 50 }),
  damage: varchar('damage', { length: 20 }),

  // Weapon abilities (keywords like Rapid Fire, Melta, etc.)
  abilities: text('abilities'),
  abilitiesJson: jsonb('abilities_json'), // Parsed array of abilities

  sourceUrl: text('source_url'),
  dataSource: dataSourceEnum('data_source').notNull().default('wahapedia'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  nameIdx: index('weapons_name_idx').on(table.name),
  typeIdx: index('weapons_type_idx').on(table.weaponType),
}));

// Junction table for units and their weapons
export const unitWeapons = pgTable('unit_weapons', {
  id: serial('id').primaryKey(),
  unitId: integer('unit_id').references(() => units.id).notNull(),
  weaponId: integer('weapon_id').references(() => weapons.id).notNull(),
  isDefault: boolean('is_default').default(true),
  isOption: boolean('is_option').default(false),
  pointsCost: integer('points_cost').default(0),
}, (table) => ({
  unitIdx: index('unit_weapons_unit_idx').on(table.unitId),
  weaponIdx: index('unit_weapons_weapon_idx').on(table.weaponId),
}));

// ============================================================================
// ABILITIES
// ============================================================================

export const abilities = pgTable('abilities', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  abilityType: varchar('ability_type', { length: 50 }).notNull(), // 'core', 'faction', 'unit', 'wargear'
  description: text('description').notNull(),
  phase: phaseEnum('phase'),
  factionId: integer('faction_id').references(() => factions.id), // Null for core abilities
  sourceUrl: text('source_url'),
  dataSource: dataSourceEnum('data_source').notNull().default('wahapedia'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  nameIdx: index('abilities_name_idx').on(table.name),
  typeIdx: index('abilities_type_idx').on(table.abilityType),
  factionIdx: index('abilities_faction_idx').on(table.factionId),
}));

// Junction table for units and their abilities
export const unitAbilities = pgTable('unit_abilities', {
  id: serial('id').primaryKey(),
  unitId: integer('unit_id').references(() => units.id).notNull(),
  abilityId: integer('ability_id').references(() => abilities.id).notNull(),
}, (table) => ({
  unitIdx: index('unit_abilities_unit_idx').on(table.unitId),
  abilityIdx: index('unit_abilities_ability_idx').on(table.abilityId),
}));

// ============================================================================
// STRATAGEMS
// ============================================================================

export const stratagems = pgTable('stratagems', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  cpCost: varchar('cp_cost', { length: 10 }).notNull(), // e.g., "1", "2", "1/2"
  phase: phaseEnum('phase').notNull(),

  // Detachment or faction association
  detachmentId: integer('detachment_id').references(() => detachments.id),
  factionId: integer('faction_id').references(() => factions.id),
  isCore: boolean('is_core').default(false), // Core stratagems available to all

  // Content
  when: text('when'), // When can you use this
  target: text('target'), // What can you target
  effect: text('effect').notNull(), // What it does
  restrictions: text('restrictions'), // Any restrictions

  sourceUrl: text('source_url'),
  dataSource: dataSourceEnum('data_source').notNull().default('wahapedia'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  nameIdx: index('stratagems_name_idx').on(table.name),
  detachmentIdx: index('stratagems_detachment_idx').on(table.detachmentId),
  factionIdx: index('stratagems_faction_idx').on(table.factionId),
  phaseIdx: index('stratagems_phase_idx').on(table.phase),
  slugFactionUnique: uniqueIndex('stratagems_slug_faction_unique').on(table.slug, table.factionId),
}));

// ============================================================================
// DETACHMENT UNIT RESTRICTIONS
// ============================================================================

// Junction table for detachment-specific unit availability
// This tracks which units are explicitly allowed/excluded in a detachment
export const detachmentUnits = pgTable('detachment_units', {
  id: serial('id').primaryKey(),
  detachmentId: integer('detachment_id').references(() => detachments.id).notNull(),
  unitId: integer('unit_id').references(() => units.id).notNull(),
  isAllowed: boolean('is_allowed').default(true), // true = allowed, false = excluded
}, (table) => ({
  detachmentIdx: index('detachment_units_detachment_idx').on(table.detachmentId),
  unitIdx: index('detachment_units_unit_idx').on(table.unitId),
  uniqueIdx: uniqueIndex('detachment_units_unique_idx').on(table.detachmentId, table.unitId),
}));

// Keyword-based restrictions for detachments
// e.g., "Only INFANTRY and MOUNTED units" or "No VEHICLE units"
export const detachmentKeywordRestrictions = pgTable('detachment_keyword_restrictions', {
  id: serial('id').primaryKey(),
  detachmentId: integer('detachment_id').references(() => detachments.id).notNull(),
  keywordId: integer('keyword_id').references(() => keywords.id).notNull(),
  restrictionType: varchar('restriction_type', { length: 20 }).notNull(), // 'required', 'allowed', 'excluded'
  description: text('description'), // Human-readable explanation
}, (table) => ({
  detachmentIdx: index('detachment_keyword_restrictions_detachment_idx').on(table.detachmentId),
  keywordIdx: index('detachment_keyword_restrictions_keyword_idx').on(table.keywordId),
}));

// ============================================================================
// ENHANCEMENTS
// ============================================================================

export const enhancements = pgTable('enhancements', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  pointsCost: integer('points_cost').notNull(),
  detachmentId: integer('detachment_id').references(() => detachments.id).notNull(),

  description: text('description').notNull(),
  restrictions: text('restrictions'), // e.g., "Character only"

  sourceUrl: text('source_url'),
  dataSource: dataSourceEnum('data_source').notNull().default('wahapedia'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  nameIdx: index('enhancements_name_idx').on(table.name),
  detachmentIdx: index('enhancements_detachment_idx').on(table.detachmentId),
}));

// ============================================================================
// KEYWORDS
// ============================================================================

export const keywords = pgTable('keywords', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  keywordType: varchar('keyword_type', { length: 50 }).notNull(), // 'faction', 'unit_type', 'ability'
  description: text('description'),
}, (table) => ({
  nameIdx: uniqueIndex('keywords_name_idx').on(table.name),
  typeIdx: index('keywords_type_idx').on(table.keywordType),
}));

// Junction table for units and keywords
export const unitKeywords = pgTable('unit_keywords', {
  id: serial('id').primaryKey(),
  unitId: integer('unit_id').references(() => units.id).notNull(),
  keywordId: integer('keyword_id').references(() => keywords.id).notNull(),
}, (table) => ({
  unitIdx: index('unit_keywords_unit_idx').on(table.unitId),
  keywordIdx: index('unit_keywords_keyword_idx').on(table.keywordId),
}));

// ============================================================================
// FAQs & ERRATA
// ============================================================================

export const faqs = pgTable('faqs', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 255 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  category: varchar('category', { length: 100 }).notNull(), // 'core', 'faction', 'codex'
  factionId: integer('faction_id').references(() => factions.id),

  question: text('question'),
  answer: text('answer'),
  content: text('content'), // For errata that isn't Q&A format

  effectiveDate: timestamp('effective_date'),
  sourceUrl: text('source_url'),
  dataSource: dataSourceEnum('data_source').notNull().default('wahapedia'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  categoryIdx: index('faqs_category_idx').on(table.category),
  factionIdx: index('faqs_faction_idx').on(table.factionId),
}));

// ============================================================================
// MISSIONS & SECONDARY OBJECTIVES
// ============================================================================

export const missions = pgTable('missions', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  missionType: varchar('mission_type', { length: 50 }).notNull(), // 'leviathan', 'pariah_nexus', 'gt'

  primaryObjective: text('primary_objective'),
  deployment: text('deployment'),
  missionRule: text('mission_rule'),

  sourceUrl: text('source_url'),
  dataSource: dataSourceEnum('data_source').notNull().default('wahapedia'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  typeIdx: index('missions_type_idx').on(table.missionType),
}));

export const secondaryObjectives = pgTable('secondary_objectives', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  category: varchar('category', { length: 100 }).notNull(), // 'fixed', 'tactical', 'secret'

  description: text('description').notNull(),
  scoringCondition: text('scoring_condition'),
  maxPoints: integer('max_points'),

  // Faction-specific secondaries
  factionId: integer('faction_id').references(() => factions.id),

  sourceUrl: text('source_url'),
  dataSource: dataSourceEnum('data_source').notNull().default('wahapedia'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  categoryIdx: index('secondary_objectives_category_idx').on(table.category),
  factionIdx: index('secondary_objectives_faction_idx').on(table.factionId),
}));

// ============================================================================
// UNIT INDEX (for tracking discovered units before full scrape)
// ============================================================================

export const scrapeStatusEnum = pgEnum('scrape_status', ['pending', 'success', 'failed']);

export const unitIndex = pgTable('unit_index', {
  id: serial('id').primaryKey(),
  factionId: integer('faction_id').references(() => factions.id).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  wahapediaUrl: text('wahapedia_url'),
  discoveredAt: timestamp('discovered_at').defaultNow(),
  lastScrapedAt: timestamp('last_scraped_at'),
  scrapeStatus: scrapeStatusEnum('scrape_status').default('pending'),
}, (table) => ({
  factionIdx: index('unit_index_faction_idx').on(table.factionId),
  slugFactionIdx: uniqueIndex('unit_index_slug_faction_idx').on(table.slug, table.factionId),
  statusIdx: index('unit_index_status_idx').on(table.scrapeStatus),
}));

// ============================================================================
// AI RESPONSE CACHE (for caching raw OpenAI JSON before processing)
// ============================================================================

export const aiResponseCache = pgTable('ai_response_cache', {
  id: serial('id').primaryKey(),
  videoId: varchar('video_id', { length: 20 }).notNull(),
  factions: jsonb('factions').notNull(), // [string, string] tuple (sorted)
  rawResponse: text('raw_response').notNull(), // Raw JSON string from OpenAI
  promptHash: varchar('prompt_hash', { length: 64 }), // Optional hash for cache invalidation
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
}, (table) => ({
  videoFactionIdx: uniqueIndex('ai_response_cache_video_faction_idx').on(table.videoId, table.factions),
  expiresAtIdx: index('ai_response_cache_expires_at_idx').on(table.expiresAt),
}));

// ============================================================================
// EXTRACTION CACHE (for caching final extraction results)
// ============================================================================

export const extractionCache = pgTable('extraction_cache', {
  id: serial('id').primaryKey(),
  videoId: varchar('video_id', { length: 20 }).notNull().unique(),
  factions: jsonb('factions').notNull(), // [string, string] tuple
  report: jsonb('report').notNull(), // The full BattleReport object
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(), // TTL for cache expiration
}, (table) => ({
  videoIdIdx: uniqueIndex('extraction_cache_video_id_idx').on(table.videoId),
  expiresAtIdx: index('extraction_cache_expires_at_idx').on(table.expiresAt),
}));

// ============================================================================
// TERRAIN LAYOUTS
// ============================================================================

export const terrainLayouts = pgTable('terrain_layouts', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(), // "Layout 1", "Layout 2", etc.

  // Season/ruleset
  season: varchar('season', { length: 50 }).notNull(), // 'chapter_approved_2025_26'

  // Image storage as base64-encoded PNG
  imageBase64: text('image_base64').notNull(),

  // Battlefield dimensions (in inches)
  battlefieldWidth: integer('battlefield_width').notNull().default(60),
  battlefieldHeight: integer('battlefield_height').notNull().default(44),

  sourceUrl: text('source_url'),
  dataSource: dataSourceEnum('data_source').notNull().default('wahapedia'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  seasonIdx: index('terrain_layouts_season_idx').on(table.season),
  slugIdx: uniqueIndex('terrain_layouts_slug_idx').on(table.slug),
}));

// ============================================================================
// SCRAPE METADATA (for tracking what's been scraped)
// ============================================================================

export const scrapeLog = pgTable('scrape_log', {
  id: serial('id').primaryKey(),
  url: text('url').notNull(),
  scrapeType: varchar('scrape_type', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(), // 'success', 'failed', 'pending'
  contentHash: varchar('content_hash', { length: 64 }), // SHA-256 hash for change detection
  errorMessage: text('error_message'),
  scrapedAt: timestamp('scraped_at').defaultNow(),
  processedAt: timestamp('processed_at'),
}, (table) => ({
  urlIdx: index('scrape_log_url_idx').on(table.url),
  typeIdx: index('scrape_log_type_idx').on(table.scrapeType),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type CoreRule = typeof coreRules.$inferSelect;
export type NewCoreRule = typeof coreRules.$inferInsert;

export type Faction = typeof factions.$inferSelect;
export type NewFaction = typeof factions.$inferInsert;

export type Detachment = typeof detachments.$inferSelect;
export type NewDetachment = typeof detachments.$inferInsert;

export type Unit = typeof units.$inferSelect;
export type NewUnit = typeof units.$inferInsert;

export type Weapon = typeof weapons.$inferSelect;
export type NewWeapon = typeof weapons.$inferInsert;

export type Ability = typeof abilities.$inferSelect;
export type NewAbility = typeof abilities.$inferInsert;

export type Stratagem = typeof stratagems.$inferSelect;
export type NewStratagem = typeof stratagems.$inferInsert;

export type Enhancement = typeof enhancements.$inferSelect;
export type NewEnhancement = typeof enhancements.$inferInsert;

export type Keyword = typeof keywords.$inferSelect;
export type NewKeyword = typeof keywords.$inferInsert;

export type FAQ = typeof faqs.$inferSelect;
export type NewFAQ = typeof faqs.$inferInsert;

export type Mission = typeof missions.$inferSelect;
export type NewMission = typeof missions.$inferInsert;

export type SecondaryObjective = typeof secondaryObjectives.$inferSelect;
export type NewSecondaryObjective = typeof secondaryObjectives.$inferInsert;

export type UnitIndex = typeof unitIndex.$inferSelect;
export type NewUnitIndex = typeof unitIndex.$inferInsert;

export type DetachmentUnit = typeof detachmentUnits.$inferSelect;
export type NewDetachmentUnit = typeof detachmentUnits.$inferInsert;

export type DetachmentKeywordRestriction = typeof detachmentKeywordRestrictions.$inferSelect;
export type NewDetachmentKeywordRestriction = typeof detachmentKeywordRestrictions.$inferInsert;

export type AiResponseCache = typeof aiResponseCache.$inferSelect;
export type NewAiResponseCache = typeof aiResponseCache.$inferInsert;

export type ExtractionCache = typeof extractionCache.$inferSelect;
export type NewExtractionCache = typeof extractionCache.$inferInsert;

export type TerrainLayout = typeof terrainLayouts.$inferSelect;
export type NewTerrainLayout = typeof terrainLayouts.$inferInsert;
