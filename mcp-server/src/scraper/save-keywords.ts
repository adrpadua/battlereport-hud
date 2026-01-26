import * as schema from '../db/schema.js';
import { eq, ilike } from 'drizzle-orm';
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
 */
export async function saveUnitKeywords(
  db: Database,
  unitId: number,
  keywords: string[]
): Promise<void> {
  for (const keywordName of keywords) {
    if (!keywordName || keywordName.length < 2) continue;

    const keywordType = determineKeywordType(keywordName);

    // Find or create keyword
    let keyword = await db
      .select()
      .from(schema.keywords)
      .where(ilike(schema.keywords.name, keywordName))
      .limit(1)
      .then(rows => rows[0]);

    if (!keyword) {
      const [inserted] = await db
        .insert(schema.keywords)
        .values({
          name: keywordName,
          keywordType,
        })
        .onConflictDoNothing()
        .returning();

      keyword = inserted ?? await db
        .select()
        .from(schema.keywords)
        .where(ilike(schema.keywords.name, keywordName))
        .limit(1)
        .then(rows => rows[0]);
    }

    if (keyword) {
      // Link keyword to unit
      await db
        .insert(schema.unitKeywords)
        .values({ unitId, keywordId: keyword.id })
        .onConflictDoNothing();
    }
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
