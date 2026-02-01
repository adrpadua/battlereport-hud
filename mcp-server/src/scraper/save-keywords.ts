import * as schema from '../db/schema.js';
import { eq, ilike, or } from 'drizzle-orm';
import type { Database } from '../db/connection.js';

/**
 * Determines the keyword type based on the keyword name.
 * - faction: Space Marine chapters, faction identifiers (Imperium, Chaos, etc.)
 * - unit_type: Epic Hero, Battleline, Character, Infantry, Monster, etc.
 * - ability: Core abilities like Deep Strike, Scouts, etc.
 */
function determineKeywordType(keyword: string): 'faction' | 'unit_type' | 'ability' {
  const upperKeyword = keyword.toUpperCase();

  // Faction keywords - chapters and faction identifiers
  const factionKeywords = [
    'IMPERIUM', 'CHAOS', 'AELDARI', 'TYRANIDS', 'NECRONS', 'ORKS', 'TAU EMPIRE', "T'AU EMPIRE",
    'ADEPTUS ASTARTES', 'SPACE MARINES', 'ADEPTUS MECHANICUS', 'ASTRA MILITARUM',
    'BLOOD ANGELS', 'DARK ANGELS', 'SPACE WOLVES', 'BLACK TEMPLARS', 'DEATHWATCH',
    'ULTRAMARINES', 'IMPERIAL FISTS', 'WHITE SCARS', 'RAVEN GUARD', 'SALAMANDERS', 'IRON HANDS',
    'GREY KNIGHTS', 'ADEPTUS CUSTODES', 'SISTERS OF BATTLE', 'ADEPTA SORORITAS',
    'DEATH GUARD', 'THOUSAND SONS', 'WORLD EATERS', "EMPEROR'S CHILDREN",
    'DRUKHARI', 'CRAFTWORLD', 'HARLEQUINS', 'YNNARI',
    'GENESTEALER CULTS', 'LEAGUES OF VOTANN', 'AGENTS OF THE IMPERIUM',
    'HERETIC ASTARTES', 'CHAOS KNIGHTS', 'IMPERIAL KNIGHTS',
  ];

  // Unit type keywords
  const unitTypeKeywords = [
    'EPIC HERO', 'CHARACTER', 'BATTLELINE', 'DEDICATED TRANSPORT',
    'INFANTRY', 'MOUNTED', 'VEHICLE', 'MONSTER', 'BEAST', 'SWARM',
    'FLY', 'WALKER', 'TITANIC', 'TOWERING', 'PSYKER', 'DAEMON',
    'PRIMARCH', 'JUMP PACK', 'TERMINATOR', 'GRAVIS', 'PHOBOS',
    'DREADNOUGHT', 'SMOKE', 'GRENADES', 'LEADER',
  ];

  if (factionKeywords.some(f => upperKeyword === f || upperKeyword.includes(f))) {
    return 'faction';
  }

  if (unitTypeKeywords.some(t => upperKeyword === t || upperKeyword.includes(t))) {
    return 'unit_type';
  }

  return 'ability';
}

/**
 * Save keywords for a unit to the database.
 * Creates keyword records if they don't exist and links them to the unit.
 *
 * Uses batched queries instead of per-keyword lookups to avoid N+1.
 */
export async function saveUnitKeywords(
  db: Database,
  unitId: number,
  keywords: string[]
): Promise<void> {
  const validKeywords = keywords.filter(k => k && k.length >= 2);
  if (validKeywords.length === 0) return;

  // Batch-find existing keywords (single query)
  const existingKeywords = await db
    .select()
    .from(schema.keywords)
    .where(or(...validKeywords.map(k => ilike(schema.keywords.name, k)))!);

  const existingByName = new Map(
    existingKeywords.map(k => [k.name.toUpperCase(), k])
  );

  // Insert missing keywords in one batch
  const missingNames = validKeywords.filter(k => !existingByName.has(k.toUpperCase()));
  if (missingNames.length > 0) {
    const inserted = await db
      .insert(schema.keywords)
      .values(missingNames.map(name => ({
        name,
        keywordType: determineKeywordType(name),
      })))
      .onConflictDoNothing()
      .returning();

    for (const kw of inserted) {
      existingByName.set(kw.name.toUpperCase(), kw);
    }

    // Re-fetch any that hit onConflictDoNothing (concurrent race)
    const stillMissing = missingNames.filter(k => !existingByName.has(k.toUpperCase()));
    if (stillMissing.length > 0) {
      const refetched = await db
        .select()
        .from(schema.keywords)
        .where(or(...stillMissing.map(k => ilike(schema.keywords.name, k)))!);
      for (const kw of refetched) {
        existingByName.set(kw.name.toUpperCase(), kw);
      }
    }
  }

  // Batch-insert junction records (single query)
  const junctionValues = validKeywords
    .map(k => existingByName.get(k.toUpperCase()))
    .filter((kw): kw is NonNullable<typeof kw> => !!kw)
    .map(kw => ({ unitId, keywordId: kw.id }));

  if (junctionValues.length > 0) {
    await db
      .insert(schema.unitKeywords)
      .values(junctionValues)
      .onConflictDoNothing();
  }
}

/**
 * Clear all keyword associations for a unit (used before re-importing).
 */
export async function clearUnitKeywords(db: Database, unitId: number): Promise<void> {
  await db
    .delete(schema.unitKeywords)
    .where(eq(schema.unitKeywords.unitId, unitId));
}
