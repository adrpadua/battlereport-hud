import { describe, it, expect } from 'vitest';
import { parseDatasheets } from './unit-parser.js';

// Real markdown from wahapedia individual unit page
const ARKANYST_EVALUATOR_MARKDOWN = `
# Leagues of Votann – Arkanyst Evaluator   \\[ No filterNEEDGAÂRD OATHBAND \\]

This datasheet does not meet the selection criteria.

![](https://wahapedia.ru/wh40k10ed/img/expansions/LeaguesOfVotann_logo3.png)

Arkanyst Evaluator

(⌀32mm)

![](https://wahapedia.ru/wh40k10ed/img/expansions/LeaguesOfVotann_logo3.png)

M

5"

T

5

Sv

3+

W

4

Ld

7+

OC

1

|     |     |     |     |     |     |     |     |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  | RANGED WEAPONS | RANGE | A | BS | S | AP | D |
|  | Transmatter inverter – half charge rapidfire1 |
|  | Transmatter inverter – half charge rapidfire1 | 12" | 3 | 2+ | 8 | -1 | 1 |
|  | Transmatter inverter – full charge hazardousrapidfire2 |
|  | Transmatter inverter – full charge hazardousrapidfire2 | 18" | 3 | 2+ | 8 | -2 | 2 |
|  | MELEE WEAPONS | RANGE | A | WS | S | AP | D |
|  | Close combat weapon |
|  | Close combat weapon | Melee | 1 | 4+ | 3 | 0 | 1 |

**Overcharge:** Each time the bearer takes a Hazardous test.

ABILITIES

CORE: **DeadlyDemise1**

FACTION: **PrioritisedEfficiency**

**Science Guild Support:** While this model is within 3" of one or more other friendly units.

UNIT COMPOSITION

- **1 Arkanyst Evaluator**

**This model is equipped with:** transmatter inverter; close combat weapon.

|     |     |
| --- | --- |
| 1 model | 65 |

KEYWORDS: INFANTRY, CHARACTER, ARKANYSTEVALUATOR

FACTION KEYWORDS:

LEAGUESOFVOTANN
`;

const HEARTHKYN_WARRIORS_MARKDOWN = `
# Leagues of Votann – Hearthkyn Warriors   \\[ filters \\]

![](https://wahapedia.ru/wh40k10ed/img/expansions/LeaguesOfVotann_logo3.png)

Hearthkyn Warriors

(⌀28mm)

M

5"

T

5

Sv

4+

W

1

Ld

7+

OC

2

|     |     |     |     |     |     |     |     |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  | RANGED WEAPONS | RANGE | A | BS | S | AP | D |
|  | Autoch-pattern bolt pistol |
|  | Autoch-pattern bolt pistol | 12" | 1 | 4+ | 4 | 0 | 1 |
|  | Autoch-pattern bolter |
|  | Autoch-pattern bolter | 24" | 2 | 4+ | 4 | 0 | 1 |
|  | MELEE WEAPONS | RANGE | A | WS | S | AP | D |
|  | Close combat weapon |
|  | Close combat weapon | Melee | 1 | 4+ | 4 | 0 | 1 |

ABILITIES

FACTION: **PrioritisedEfficiency**

**Warrior Pride:** Each time a model in this unit makes an attack, re-roll hit rolls of 1.

UNIT COMPOSITION

- **10 Hearthkyn Warriors**

|     |     |
| --- | --- |
| 10 models | 110 |

KEYWORDS: INFANTRY, BATTLELINE, GRENADES, HEARTHKYN WARRIORS

FACTION KEYWORDS:

LEAGUESOFVOTANN
`;

const HEKATON_LAND_FORTRESS_MARKDOWN = `
# Leagues of Votann – Hekaton Land Fortress   \\[ filters \\]

![](logo.png)

Hekaton Land Fortress

(⌀170mm oval)

M

10"

T

12

Sv

2+

W

18

Ld

7+

OC

5

This model has a 4+ invulnerable save.

|     |     |     |     |     |     |     |     |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  | RANGED WEAPONS | RANGE | A | BS | S | AP | D |
|  | Cyclic ion cannon |
|  | Cyclic ion cannon | 24" | 6 | 4+ | 9 | -2 | 2 |
|  | MELEE WEAPONS | RANGE | A | WS | S | AP | D |
|  | Armoured hull |
|  | Armoured hull | Melee | 6 | 4+ | 8 | 0 | 1 |

ABILITIES

CORE: **Deadly Demise D6**

FACTION: **Prioritised Efficiency**

**Fire Support:** In your Shooting phase, after this model has shot, select one enemy unit hit.

UNIT COMPOSITION

- **1 Hekaton Land Fortress**

|     |     |
| --- | --- |
| 1 model | 230 |

KEYWORDS: VEHICLE, TRANSPORT, HEKATON LAND FORTRESS

FACTION KEYWORDS:

LEAGUESOFVOTANN
`;

const SAGITAUR_MARKDOWN = `
# Leagues of Votann – Sagitaur   \\[ filters \\]

Sagitaur

(⌀120mm oval)

M

12"

T

9

Sv

3+

W

9

Ld

7+

OC

3

|     |     |     |     |     |     |     |     |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  | RANGED WEAPONS | RANGE | A | BS | S | AP | D |
|  | Twin bolt cannon |
|  | Twin bolt cannon | 36" | 3 | 4+ | 6 | -1 | 2 |

ABILITIES

**Transport Capacity:** This model can transport 6 infantry models.

UNIT COMPOSITION

- **1 Sagitaur**

|     |     |
| --- | --- |
| 1 model | 120 |

KEYWORDS: VEHICLE, TRANSPORT, DEDICATED TRANSPORT, SAGITAUR

FACTION KEYWORDS:

LEAGUESOFVOTANN
`;

describe('parseDatasheets - Individual Unit Pages', () => {
  const sourceUrl = 'https://wahapedia.ru/wh40k10ed/factions/leagues-of-votann/Arkanyst-Evaluator';

  describe('Unit name extraction', () => {
    it('extracts unit name from # Faction – Unit Name header', () => {
      const result = parseDatasheets(ARKANYST_EVALUATOR_MARKDOWN, sourceUrl);

      expect(result).toHaveLength(1);
      expect(result[0]?.unit.name).toBe('Arkanyst Evaluator');
    });

    it('generates correct slug from unit name', () => {
      const result = parseDatasheets(ARKANYST_EVALUATOR_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.slug).toBe('arkanyst-evaluator');
    });

    it('handles unit names with special formatting', () => {
      const result = parseDatasheets(HEARTHKYN_WARRIORS_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.name).toBe('Hearthkyn Warriors');
    });
  });

  describe('Stats extraction', () => {
    it('extracts movement stat', () => {
      const result = parseDatasheets(ARKANYST_EVALUATOR_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.movement).toBe('5"');
    });

    it('extracts toughness as number', () => {
      const result = parseDatasheets(ARKANYST_EVALUATOR_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.toughness).toBe(5);
    });

    it('extracts save characteristic', () => {
      const result = parseDatasheets(ARKANYST_EVALUATOR_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.save).toBe('3+');
    });

    it('extracts wounds as number', () => {
      const result = parseDatasheets(ARKANYST_EVALUATOR_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.wounds).toBe(4);
    });

    it('extracts leadership', () => {
      const result = parseDatasheets(ARKANYST_EVALUATOR_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.leadership).toBe(7);
    });

    it('extracts objective control', () => {
      const result = parseDatasheets(ARKANYST_EVALUATOR_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.objectiveControl).toBe(1);
    });

    it('extracts invulnerable save when present', () => {
      const result = parseDatasheets(HEKATON_LAND_FORTRESS_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.invulnerableSave).toBe('4+');
    });

    it('handles high stat values for vehicles', () => {
      const result = parseDatasheets(HEKATON_LAND_FORTRESS_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.movement).toBe('10"');
      expect(result[0]?.unit.toughness).toBe(12);
      expect(result[0]?.unit.wounds).toBe(18);
      expect(result[0]?.unit.save).toBe('2+');
    });
  });

  describe('Points cost extraction', () => {
    it('extracts points from composition table', () => {
      const result = parseDatasheets(ARKANYST_EVALUATOR_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.pointsCost).toBe(65);
    });

    it('extracts points for multi-model units', () => {
      const result = parseDatasheets(HEARTHKYN_WARRIORS_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.pointsCost).toBe(110);
    });

    it('extracts points for vehicles', () => {
      const result = parseDatasheets(HEKATON_LAND_FORTRESS_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.pointsCost).toBe(230);
    });
  });

  describe('Base size extraction', () => {
    it('extracts base size in mm', () => {
      const result = parseDatasheets(ARKANYST_EVALUATOR_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.baseSize).toBe('32mm');
    });

    it('extracts oval base sizes', () => {
      const result = parseDatasheets(HEKATON_LAND_FORTRESS_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.baseSize).toBe('170mm oval');
    });
  });

  describe('Unit type detection', () => {
    it('detects battleline units', () => {
      const result = parseDatasheets(HEARTHKYN_WARRIORS_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.isBattleline).toBe(true);
    });

    it('detects dedicated transports', () => {
      const result = parseDatasheets(SAGITAUR_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.isDedicatedTransport).toBe(true);
    });

    it('does not mark character as battleline', () => {
      const result = parseDatasheets(ARKANYST_EVALUATOR_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.isBattleline).toBe(false);
    });
  });

  describe('Weapons extraction', () => {
    it('extracts ranged weapons', () => {
      const result = parseDatasheets(ARKANYST_EVALUATOR_MARKDOWN, sourceUrl);
      const rangedWeapons = result[0]?.weapons.filter(w => w.weaponType === 'ranged');

      expect(rangedWeapons?.length).toBeGreaterThan(0);
    });

    it('extracts melee weapons', () => {
      const result = parseDatasheets(ARKANYST_EVALUATOR_MARKDOWN, sourceUrl);
      const meleeWeapons = result[0]?.weapons.filter(w => w.weaponType === 'melee');

      expect(meleeWeapons?.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    it('returns empty array for non-unit content', () => {
      const result = parseDatasheets('Some random content without unit data', sourceUrl);

      expect(result).toHaveLength(0);
    });

    it('handles markdown with navigation content before unit data', () => {
      const withNavigation = `
[Link1](url) [Link2](url)

Navigation content

${ARKANYST_EVALUATOR_MARKDOWN}
      `;
      const result = parseDatasheets(withNavigation, sourceUrl);

      expect(result).toHaveLength(1);
      expect(result[0]?.unit.name).toBe('Arkanyst Evaluator');
    });
  });

  describe('Source URL handling', () => {
    it('includes source URL in unit data', () => {
      const result = parseDatasheets(ARKANYST_EVALUATOR_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.sourceUrl).toBe(sourceUrl);
    });

    it('includes source URL in weapons', () => {
      const result = parseDatasheets(ARKANYST_EVALUATOR_MARKDOWN, sourceUrl);
      const weapon = result[0]?.weapons[0];

      expect(weapon?.sourceUrl).toBe(sourceUrl);
    });
  });

  describe('Data source marking', () => {
    it('marks unit as wahapedia data source', () => {
      const result = parseDatasheets(ARKANYST_EVALUATOR_MARKDOWN, sourceUrl);

      expect(result[0]?.unit.dataSource).toBe('wahapedia');
    });

    it('marks weapons as wahapedia data source', () => {
      const result = parseDatasheets(ARKANYST_EVALUATOR_MARKDOWN, sourceUrl);
      const weapon = result[0]?.weapons[0];

      expect(weapon?.dataSource).toBe('wahapedia');
    });
  });
});
