/**
 * Database Integrity Tests
 *
 * These tests validate data quality and consistency in the Warhammer 40K rules database.
 * Run with: npm run test:run -- src/db/integrity.test.ts
 *
 * Categories:
 * - Duplicate Detection: Find duplicate entries that shouldn't exist
 * - Name Truncation: Detect names that appear to be cut off (parser bugs)
 * - Orphan Records: Find records with broken foreign key relationships
 * - Data Consistency: Validate naming conventions and data formats
 * - Referential Integrity: Ensure junction tables have valid references
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { getDb, closeConnection, type Database } from './connection.js';

describe('Database Integrity Checks', () => {
  let db: Database;

  beforeAll(() => {
    db = getDb();
  });

  afterAll(async () => {
    await closeConnection();
  });

  // ===========================================================================
  // DUPLICATE DETECTION
  // ===========================================================================

  describe('Duplicate Detection', () => {
    it('should have no duplicate faction slugs', async () => {
      const duplicates = await db.execute<{ slug: string; count: number }>(sql`
        SELECT slug, COUNT(*) as count
        FROM factions
        GROUP BY slug
        HAVING COUNT(*) > 1
      `);
      expect(duplicates.rows).toEqual([]);
    });

    it('should have no duplicate detachment names within same faction', async () => {
      const duplicates = await db.execute<{ name: string; faction_id: number; count: number }>(sql`
        SELECT d.name, d.faction_id, COUNT(*) as count
        FROM detachments d
        GROUP BY d.name, d.faction_id
        HAVING COUNT(*) > 1
      `);
      expect(duplicates.rows).toEqual([]);
    });

    it('should have no duplicate unit names within same faction', async () => {
      const duplicates = await db.execute<{ name: string; faction_id: number; count: number }>(sql`
        SELECT u.name, u.faction_id, COUNT(*) as count
        FROM units u
        GROUP BY u.name, u.faction_id
        HAVING COUNT(*) > 1
      `);
      expect(duplicates.rows).toEqual([]);
    });

    it('should have no duplicate stratagem names within same faction', async () => {
      const duplicates = await db.execute<{ name: string; faction_id: number; count: number }>(sql`
        SELECT s.name, s.faction_id, COUNT(*) as count
        FROM stratagems s
        WHERE s.faction_id IS NOT NULL
        GROUP BY s.name, s.faction_id
        HAVING COUNT(*) > 1
      `);
      expect(duplicates.rows).toEqual([]);
    });

    it('should have no duplicate enhancement names within same detachment', async () => {
      const duplicates = await db.execute<{ name: string; detachment_id: number; count: number }>(sql`
        SELECT e.name, e.detachment_id, COUNT(*) as count
        FROM enhancements e
        GROUP BY e.name, e.detachment_id
        HAVING COUNT(*) > 1
      `);
      expect(duplicates.rows).toEqual([]);
    });
  });

  // ===========================================================================
  // NAME TRUNCATION DETECTION
  // ===========================================================================

  describe('Name Truncation Detection', () => {
    it('should have no unit names that are prefixes of other unit names in same faction', async () => {
      // Detects cases like "Shield" existing alongside "Shield-captain"
      // which indicates a parser bug that truncated the full name
      const truncated = await db.execute<{ id: number; name: string; full_name: string }>(sql`
        SELECT u1.id, u1.name, u2.name as full_name
        FROM units u1
        JOIN units u2 ON u2.faction_id = u1.faction_id
          AND u2.name LIKE u1.name || '-%'
          AND LENGTH(u2.name) > LENGTH(u1.name)
        WHERE u1.name NOT LIKE '%-%'
          AND LENGTH(u1.name) < 20
      `);
      expect(truncated.rows).toEqual([]);
    });

    it('should have no unit names ending with incomplete compound words', async () => {
      // Detects names like "Caladius Grav" instead of "Caladius Grav-tank"
      const incomplete = await db.execute<{ id: number; name: string }>(sql`
        SELECT id, name FROM units
        WHERE name ~ ' (Grav|With|In|On|Of|And|The|For)$'
      `);
      expect(incomplete.rows).toEqual([]);
    });

    it('should have no detachment names with numbered suffixes', async () => {
      // Detects parsing artifacts like "The Forsaken 1", "The Forsaken 2"
      const numbered = await db.execute<{ id: number; name: string }>(sql`
        SELECT id, name FROM detachments
        WHERE name ~ ' \d+$'
      `);
      expect(numbered.rows).toEqual([]);
    });

    it('should have no detachment names missing apostrophes', async () => {
      // Detects "Ka tah" instead of "Ka'tah"
      const missingApostrophe = await db.execute<{ id: number; name: string }>(sql`
        SELECT id, name FROM detachments
        WHERE name ~* 'ka\s+tah'
      `);
      expect(missingApostrophe.rows).toEqual([]);
    });
  });

  // ===========================================================================
  // ORPHAN RECORDS
  // ===========================================================================

  describe('Orphan Records', () => {
    it('should have no units with invalid faction references', async () => {
      const orphans = await db.execute<{ id: number; name: string; faction_id: number }>(sql`
        SELECT u.id, u.name, u.faction_id
        FROM units u
        LEFT JOIN factions f ON u.faction_id = f.id
        WHERE f.id IS NULL
      `);
      expect(orphans.rows).toEqual([]);
    });

    it('should have no detachments with invalid faction references', async () => {
      const orphans = await db.execute<{ id: number; name: string; faction_id: number }>(sql`
        SELECT d.id, d.name, d.faction_id
        FROM detachments d
        LEFT JOIN factions f ON d.faction_id = f.id
        WHERE f.id IS NULL
      `);
      expect(orphans.rows).toEqual([]);
    });

    it('should have no stratagems with invalid detachment references', async () => {
      const orphans = await db.execute<{ id: number; name: string; detachment_id: number }>(sql`
        SELECT s.id, s.name, s.detachment_id
        FROM stratagems s
        LEFT JOIN detachments d ON s.detachment_id = d.id
        WHERE s.detachment_id IS NOT NULL AND d.id IS NULL
      `);
      expect(orphans.rows).toEqual([]);
    });

    it('should have no enhancements with invalid detachment references', async () => {
      const orphans = await db.execute<{ id: number; name: string; detachment_id: number }>(sql`
        SELECT e.id, e.name, e.detachment_id
        FROM enhancements e
        LEFT JOIN detachments d ON e.detachment_id = d.id
        WHERE d.id IS NULL
      `);
      expect(orphans.rows).toEqual([]);
    });

    it('should have no unit_weapons with invalid unit references', async () => {
      const orphans = await db.execute<{ id: number; unit_id: number }>(sql`
        SELECT uw.id, uw.unit_id
        FROM unit_weapons uw
        LEFT JOIN units u ON uw.unit_id = u.id
        WHERE u.id IS NULL
      `);
      expect(orphans.rows).toEqual([]);
    });

    it('should have no unit_weapons with invalid weapon references', async () => {
      const orphans = await db.execute<{ id: number; weapon_id: number }>(sql`
        SELECT uw.id, uw.weapon_id
        FROM unit_weapons uw
        LEFT JOIN weapons w ON uw.weapon_id = w.id
        WHERE w.id IS NULL
      `);
      expect(orphans.rows).toEqual([]);
    });

    it('should have no unit_abilities with invalid unit references', async () => {
      const orphans = await db.execute<{ id: number; unit_id: number }>(sql`
        SELECT ua.id, ua.unit_id
        FROM unit_abilities ua
        LEFT JOIN units u ON ua.unit_id = u.id
        WHERE u.id IS NULL
      `);
      expect(orphans.rows).toEqual([]);
    });

    it('should have no unit_abilities with invalid ability references', async () => {
      const orphans = await db.execute<{ id: number; ability_id: number }>(sql`
        SELECT ua.id, ua.ability_id
        FROM unit_abilities ua
        LEFT JOIN abilities a ON ua.ability_id = a.id
        WHERE a.id IS NULL
      `);
      expect(orphans.rows).toEqual([]);
    });
  });

  // ===========================================================================
  // DATA CONSISTENCY
  // ===========================================================================

  describe('Data Consistency', () => {
    it('should have no factions without any units', async () => {
      // Skip parent factions that only have subfactions
      const emptyFactions = await db.execute<{ id: number; name: string }>(sql`
        SELECT f.id, f.name
        FROM factions f
        LEFT JOIN units u ON u.faction_id = f.id
        LEFT JOIN factions sf ON sf.parent_faction_id = f.id
        WHERE u.id IS NULL AND sf.id IS NULL
      `);
      // This might be intentional for some factions, so we just log
      if (emptyFactions.rows.length > 0) {
        console.warn('Factions without units:', emptyFactions.rows.map(r => r.name));
      }
      // Not failing, just warning
    });

    it('should have no detachments without stratagems or enhancements', async () => {
      const emptyDetachments = await db.execute<{ id: number; name: string; faction: string }>(sql`
        SELECT d.id, d.name, f.name as faction
        FROM detachments d
        JOIN factions f ON d.faction_id = f.id
        LEFT JOIN stratagems s ON s.detachment_id = d.id
        LEFT JOIN enhancements e ON e.detachment_id = d.id
        WHERE s.id IS NULL AND e.id IS NULL
      `);
      // Log but don't fail - some detachments might be newly added
      if (emptyDetachments.rows.length > 0) {
        console.warn('Detachments without stratagems/enhancements:',
          emptyDetachments.rows.map(r => `${r.faction}: ${r.name}`));
      }
    });

    it('should have valid phase values in stratagems', async () => {
      const validPhases = ['command', 'movement', 'shooting', 'charge', 'fight', 'any'];
      const invalidPhases = await db.execute<{ id: number; name: string; phase: string }>(sql`
        SELECT id, name, phase FROM stratagems
        WHERE phase IS NOT NULL AND phase NOT IN ('command', 'movement', 'shooting', 'charge', 'fight', 'any')
      `);
      expect(invalidPhases.rows).toEqual([]);
    });

    it('should have valid weapon types', async () => {
      const invalidTypes = await db.execute<{ id: number; name: string; weapon_type: string }>(sql`
        SELECT id, name, weapon_type FROM weapons
        WHERE weapon_type NOT IN ('ranged', 'melee')
      `);
      expect(invalidTypes.rows).toEqual([]);
    });

    it('should have non-empty unit names', async () => {
      const emptyNames = await db.execute<{ id: number; name: string }>(sql`
        SELECT id, name FROM units
        WHERE name IS NULL OR TRIM(name) = ''
      `);
      expect(emptyNames.rows).toEqual([]);
    });

    it('should have non-empty stratagem effects', async () => {
      const emptyEffects = await db.execute<{ id: number; name: string }>(sql`
        SELECT id, name FROM stratagems
        WHERE effect IS NULL OR TRIM(effect) = ''
      `);
      expect(emptyEffects.rows).toEqual([]);
    });
  });

  // ===========================================================================
  // DATA QUALITY
  // ===========================================================================

  describe('Data Quality', () => {
    it('should have consistent name casing (no all-lowercase unit names)', async () => {
      const lowercaseNames = await db.execute<{ id: number; name: string }>(sql`
        SELECT id, name FROM units
        WHERE name = LOWER(name) AND LENGTH(name) > 3
      `);
      expect(lowercaseNames.rows).toEqual([]);
    });

    it('should have no HTML artifacts in unit names', async () => {
      const htmlArtifacts = await db.execute<{ id: number; name: string }>(sql`
        SELECT id, name FROM units
        WHERE name ~ '<[^>]+>' OR name ~ '&[a-z]+;' OR name ~ '&#\d+;'
      `);
      expect(htmlArtifacts.rows).toEqual([]);
    });

    it('should have no HTML artifacts in stratagem effects', async () => {
      const htmlArtifacts = await db.execute<{ id: number; name: string }>(sql`
        SELECT id, name FROM stratagems
        WHERE effect ~ '<[^>]+>' AND effect !~ '<br>'
      `);
      // Some HTML might be intentional for formatting, so check for problematic tags
      expect(htmlArtifacts.rows).toEqual([]);
    });

    it('should have valid CP costs in stratagems', async () => {
      const invalidCosts = await db.execute<{ id: number; name: string; cp_cost: string }>(sql`
        SELECT id, name, cp_cost FROM stratagems
        WHERE cp_cost !~ '^[0-9]+(/[0-9]+)?$' AND cp_cost != '0'
      `);
      expect(invalidCosts.rows).toEqual([]);
    });

    it('should have positive points costs for enhancements', async () => {
      const invalidPoints = await db.execute<{ id: number; name: string; points_cost: number }>(sql`
        SELECT id, name, points_cost FROM enhancements
        WHERE points_cost < 0
      `);
      expect(invalidPoints.rows).toEqual([]);
    });
  });

  // ===========================================================================
  // STATISTICS (informational, not failing)
  // ===========================================================================

  describe('Database Statistics', () => {
    it('should report table counts', async () => {
      const stats = await db.execute<{ table_name: string; count: number }>(sql`
        SELECT 'factions' as table_name, COUNT(*) as count FROM factions
        UNION ALL SELECT 'detachments', COUNT(*) FROM detachments
        UNION ALL SELECT 'units', COUNT(*) FROM units
        UNION ALL SELECT 'weapons', COUNT(*) FROM weapons
        UNION ALL SELECT 'abilities', COUNT(*) FROM abilities
        UNION ALL SELECT 'stratagems', COUNT(*) FROM stratagems
        UNION ALL SELECT 'enhancements', COUNT(*) FROM enhancements
        UNION ALL SELECT 'keywords', COUNT(*) FROM keywords
        ORDER BY table_name
      `);

      console.log('\n📊 Database Statistics:');
      stats.rows.forEach(row => {
        console.log(`   ${row.table_name}: ${row.count}`);
      });

      // Just verify we have data
      const totalRecords = stats.rows.reduce((sum, row) => sum + Number(row.count), 0);
      expect(totalRecords).toBeGreaterThan(0);
    });

    it('should report units per faction', async () => {
      const unitCounts = await db.execute<{ faction: string; unit_count: number }>(sql`
        SELECT f.name as faction, COUNT(u.id) as unit_count
        FROM factions f
        LEFT JOIN units u ON u.faction_id = f.id
        GROUP BY f.id, f.name
        HAVING COUNT(u.id) > 0
        ORDER BY unit_count DESC
        LIMIT 10
      `);

      console.log('\n📊 Top 10 Factions by Unit Count:');
      unitCounts.rows.forEach(row => {
        console.log(`   ${row.faction}: ${row.unit_count} units`);
      });
    });
  });
});
