import 'dotenv/config';
import { getDb, closeConnection } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Weapon ability definitions for Warhammer 40K 10th Edition
 * These are the standard weapon abilities that appear on datasheets
 */
const WEAPON_ABILITIES = [
  // Damage modifiers
  {
    slug: 'devastating-wounds',
    name: 'Devastating Wounds',
    description:
      'Weapons with [DEVASTATING WOUNDS] cause mortal wounds on Critical Wounds. Each time an attack made with such a weapon scores a Critical Wound (an unmodified Wound roll of 6), the target suffers mortal wounds equal to the Damage characteristic of that weapon instead of the normal damage. These mortal wounds are inflicted in addition to and after all normal damage is resolved.',
  },
  {
    slug: 'lethal-hits',
    name: 'Lethal Hits',
    description:
      'Weapons with [LETHAL HITS] automatically wound on Critical Hits. Each time an attack made with such a weapon scores a Critical Hit (an unmodified Hit roll of 6), that attack automatically wounds the target (do not make a Wound roll).',
  },
  {
    slug: 'sustained-hits',
    name: 'Sustained Hits',
    description:
      'Weapons with [SUSTAINED HITS X] generate extra hits on Critical Hits. Each time an attack made with such a weapon scores a Critical Hit (an unmodified Hit roll of 6), that attack scores X additional hits on the target (in addition to the original successful hit). If a weapon has [SUSTAINED HITS] without a number, it generates 1 additional hit.',
  },
  {
    slug: 'anti',
    name: 'Anti-X',
    description:
      'Weapons with [ANTI-KEYWORD X+] wound more easily against targets with specific keywords. Each time an attack made with such a weapon is allocated to a target with the specified keyword, an unmodified Wound roll of X+ scores a Critical Wound.',
  },

  // Range & targeting
  {
    slug: 'torrent',
    name: 'Torrent',
    description:
      'Weapons with [TORRENT] automatically hit their targets. Each time an attack is made with such a weapon, that attack automatically hits the target (do not make a Hit roll).',
  },
  {
    slug: 'blast',
    name: 'Blast',
    description:
      'Weapons with [BLAST] inflict more hits against larger units. When making attacks with such a weapon against a unit containing 6 or more models, add 1 to the Attacks characteristic. When making attacks against a unit containing 11 or more models, add 2 instead. Blast weapons can never be used to make attacks against a unit that is within Engagement Range of one or more units from the attacking model\'s army.',
  },
  {
    slug: 'indirect-fire',
    name: 'Indirect Fire',
    description:
      'Weapons with [INDIRECT FIRE] can target units not visible to the bearer. Each time an attack is made with such a weapon, that attack can target units that are not visible to the attacking model. If no models in the target unit are visible to the attacking unit when it selects its targets, then each time a model in the attacking unit makes an attack against that target with an Indirect Fire weapon, subtract 1 from the Hit roll and the target has the Benefit of Cover against that attack.',
  },
  {
    slug: 'ignores-cover',
    name: 'Ignores Cover',
    description:
      'Weapons with [IGNORES COVER] negate cover bonuses. Each time an attack is made with such a weapon, the target cannot have the Benefit of Cover against that attack.',
  },
  {
    slug: 'precision',
    name: 'Precision',
    description:
      'Weapons with [PRECISION] can target Characters in attached units. Each time an attack made with such a weapon scores a Critical Hit against a unit that is not a Monster or Vehicle, if a Character model is attached to that unit, that attack can be allocated to that Character model instead of following the normal rules for allocating attacks.',
  },

  // Weapon types
  {
    slug: 'assault',
    name: 'Assault',
    description:
      'Weapons with [ASSAULT] can be fired after Advancing. If a unit contains any models equipped with Assault weapons, that unit is eligible to shoot in a turn in which it Advanced, but if it does, it can only make attacks with its Assault weapons when it shoots.',
  },
  {
    slug: 'heavy',
    name: 'Heavy',
    description:
      'Weapons with [HEAVY] are more accurate when stationary. Each time an attack is made with such a weapon, if the attacking model\'s unit has not made a Normal, Advance, or Fall Back move this turn, add 1 to that attack\'s Hit roll.',
  },
  {
    slug: 'rapid-fire',
    name: 'Rapid Fire',
    description:
      'Weapons with [RAPID FIRE X] shoot more at close range. Each time a model shoots with such a weapon, if the target is within half the weapon\'s range, the Attacks characteristic of that weapon is increased by X for that attack.',
  },
  {
    slug: 'pistol',
    name: 'Pistol',
    description:
      'Weapons with [PISTOL] can be shot while in Engagement Range. A model can make attacks with a Pistol weapon even if other models in its unit are within Engagement Range of one or more enemy units. In such circumstances, that model can target an enemy unit that is within Engagement Range of its own unit, and when it resolves those attacks, that model is considered to be within the target\'s Engagement Range. A model cannot make attacks with its Pistol and any other type of ranged weapon in the same phase.',
  },
  {
    slug: 'lance',
    name: 'Lance',
    description:
      'Weapons with [LANCE] are more effective on the charge. Each time an attack is made with such a weapon, if the bearer made a Charge move this turn, add 1 to that attack\'s Wound roll.',
  },

  // Special damage
  {
    slug: 'melta',
    name: 'Melta',
    description:
      'Weapons with [MELTA X] deal extra damage at close range. Each time an attack made with such a weapon targets a unit within half that weapon\'s range, that attack\'s Damage characteristic is increased by X.',
  },
  {
    slug: 'hazardous',
    name: 'Hazardous',
    description:
      'Weapons with [HAZARDOUS] pose a risk to the wielder. After a unit shoots or fights, if any of its models made attacks with Hazardous weapons, roll one D6 for each such model: for each 1 rolled, that unit suffers 3 mortal wounds (if the model was a Character, Monster, or Vehicle) or the model is destroyed.',
  },

  // Modifiers
  {
    slug: 'twin-linked',
    name: 'Twin-linked',
    description:
      'Weapons with [TWIN-LINKED] allow re-rolling Wound rolls. Each time an attack is made with such a weapon, you can re-roll that attack\'s Wound roll.',
  },
  {
    slug: 'extra-attacks',
    name: 'Extra Attacks',
    description:
      'Weapons with [EXTRA ATTACKS] give bonus attacks. Each time the bearer fights, it can make attacks with this weapon in addition to the attacks it makes with its other melee weapons. The number of attacks made with an Extra Attacks weapon cannot be modified by other rules.',
  },
  {
    slug: 'one-shot',
    name: 'One Shot',
    description:
      'Weapons with [ONE SHOT] can only be fired once per battle. Each time the bearer shoots, it can only shoot with this weapon once per battle.',
  },

  // Core weapon abilities
  {
    slug: 'psychic',
    name: 'Psychic',
    description:
      'Weapons with [PSYCHIC] are warp-powered attacks. These weapons channel psychic energy and can only be used by Psyker models. Some rules specifically interact with Psychic weapons.',
  },
];

async function seedWeaponAbilities() {
  console.log('Seeding weapon abilities...');

  const db = getDb();

  try {
    let inserted = 0;
    let updated = 0;

    for (const ability of WEAPON_ABILITIES) {
      // Check if ability already exists
      const existing = await db
        .select()
        .from(schema.abilities)
        .where(eq(schema.abilities.slug, ability.slug))
        .limit(1);

      if (existing.length > 0) {
        // Update existing
        await db
          .update(schema.abilities)
          .set({
            name: ability.name,
            description: ability.description,
            abilityType: 'weapon',
            dataSource: 'manual',
            updatedAt: new Date(),
          })
          .where(eq(schema.abilities.slug, ability.slug));
        updated++;
        console.log(`  Updated: ${ability.name}`);
      } else {
        // Insert new
        await db.insert(schema.abilities).values({
          slug: ability.slug,
          name: ability.name,
          abilityType: 'weapon',
          description: ability.description,
          dataSource: 'manual',
        });
        inserted++;
        console.log(`  Inserted: ${ability.name}`);
      }
    }

    console.log(`\nSeeding complete: ${inserted} inserted, ${updated} updated`);
  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  } finally {
    await closeConnection();
  }
}

seedWeaponAbilities().catch(console.error);
