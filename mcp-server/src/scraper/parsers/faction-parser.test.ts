import { describe, it, expect } from 'vitest';
import {
  parseFactionIndex,
  parseFactionPage,
  parseDetachments,
  parseStratagems,
  parseEnhancements,
  slugify,
  detectPhase,
} from './faction-parser.js';

describe('slugify', () => {
  it('converts text to lowercase', () => {
    expect(slugify('Space Marines')).toBe('space-marines');
  });

  it('replaces special characters with hyphens', () => {
    expect(slugify("T'au Empire")).toBe('t-au-empire');
  });

  it('removes leading and trailing hyphens', () => {
    expect(slugify('--test--')).toBe('test');
  });

  it('handles multiple consecutive special characters', () => {
    expect(slugify('Death   Guard')).toBe('death-guard');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });
});

describe('detectPhase', () => {
  it('detects command phase', () => {
    expect(detectPhase('During your Command phase')).toBe('command');
  });

  it('detects movement phase', () => {
    expect(detectPhase('In the Movement phase')).toBe('movement');
  });

  it('detects shooting phase', () => {
    expect(detectPhase('Your Shooting phase')).toBe('shooting');
  });

  it('detects charge phase', () => {
    expect(detectPhase('Charge phase')).toBe('charge');
  });

  it('detects fight phase', () => {
    expect(detectPhase('During the Fight phase')).toBe('fight');
  });

  it('returns any for unknown phase', () => {
    expect(detectPhase('Any time')).toBe('any');
  });

  it('returns any for empty string', () => {
    expect(detectPhase('')).toBe('any');
  });

  it('is case insensitive', () => {
    expect(detectPhase('SHOOTING PHASE')).toBe('shooting');
  });
});

describe('parseFactionIndex', () => {
  const sourceUrl = 'https://wahapedia.ru/wh40k10ed/the-rules/';

  it('parses a single faction link', () => {
    const markdown = '[Space Marines](/wh40k10ed/factions/space-marines/)';
    const result = parseFactionIndex(markdown, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      slug: 'space-marines',
      name: 'Space Marines',
      wahapediaPath: '/wh40k10ed/factions/space-marines/',
      sourceUrl,
      dataSource: 'wahapedia',
    });
  });

  it('parses multiple faction links', () => {
    const markdown = `
[Space Marines](/wh40k10ed/factions/space-marines/)
[Orks](/wh40k10ed/factions/orks/)
[Aeldari](/wh40k10ed/factions/aeldari/)
    `;
    const result = parseFactionIndex(markdown, sourceUrl);

    expect(result).toHaveLength(3);
    expect(result.map((f) => f.slug)).toEqual(['space-marines', 'orks', 'aeldari']);
  });

  it('deduplicates factions with same slug', () => {
    const markdown = `
[Space Marines](/wh40k10ed/factions/space-marines/)
[Space Marines](/wh40k10ed/factions/space-marines/)
    `;
    const result = parseFactionIndex(markdown, sourceUrl);

    expect(result).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    expect(parseFactionIndex('', sourceUrl)).toEqual([]);
  });

  it('ignores non-faction links', () => {
    const markdown = `
[The Rules](/wh40k10ed/the-rules/core-rules/)
[Space Marines](/wh40k10ed/factions/space-marines/)
[FAQ](/wh40k10ed/faq/)
    `;
    const result = parseFactionIndex(markdown, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]?.slug).toBe('space-marines');
  });

  it('handles special characters in faction names', () => {
    const markdown = "[T'au Empire](/wh40k10ed/factions/tau-empire/)";
    const result = parseFactionIndex(markdown, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("T'au Empire");
  });

  it('handles trailing slash variants', () => {
    const markdown = `
[Space Marines](/wh40k10ed/factions/space-marines/)
[Orks](/wh40k10ed/factions/orks)
    `;
    const result = parseFactionIndex(markdown, sourceUrl);

    expect(result).toHaveLength(2);
    expect(result.map((f) => f.slug)).toEqual(['space-marines', 'orks']);
  });
});

describe('parseFactionPage', () => {
  const sourceUrl = 'https://wahapedia.ru/wh40k10ed/factions/space-marines/';

  it('extracts army rules section', () => {
    const markdown = `
# Space Marines

Some intro text.

## Army Rules

The Adeptus Astartes are the Emperor's finest warriors.

They have many special rules.

## Detachments
    `;
    const result = parseFactionPage(markdown, 'space-marines', 'Space Marines', sourceUrl);

    expect(result.armyRules).toContain("Emperor's finest warriors");
    expect(result.armyRules).toContain('special rules');
  });

  it('extracts lore from Background section', () => {
    const markdown = `
# Space Marines

## Background

The Space Marines are genetically enhanced super soldiers.

## Army Rules
    `;
    const result = parseFactionPage(markdown, 'space-marines', 'Space Marines', sourceUrl);

    expect(result.lore).toContain('genetically enhanced');
  });

  it('extracts lore from Lore section', () => {
    const markdown = `
## Lore

Ancient warriors of the Imperium.

## Army Rules
    `;
    const result = parseFactionPage(markdown, 'space-marines', 'Space Marines', sourceUrl);

    expect(result.lore).toContain('Ancient warriors');
  });

  it('uses intro text as lore if no explicit section and >100 chars', () => {
    const markdown = `
The Space Marines are the Imperium's greatest warriors. They are genetically engineered super soldiers who fight across the galaxy in defense of humanity. Each Space Marine is worth a hundred normal soldiers.

## Army Rules

Combat Doctrines.
    `;
    const result = parseFactionPage(markdown, 'space-marines', 'Space Marines', sourceUrl);

    expect(result.lore).toContain("Imperium's greatest warriors");
  });

  it('returns null for missing armyRules', () => {
    const markdown = `
# Space Marines

Some content without army rules.

## Detachments
    `;
    const result = parseFactionPage(markdown, 'space-marines', 'Space Marines', sourceUrl);

    expect(result.armyRules).toBeNull();
  });

  it('returns null for missing lore when intro is too short', () => {
    const markdown = `
Short intro.

## Army Rules

Combat Doctrines.
    `;
    const result = parseFactionPage(markdown, 'space-marines', 'Space Marines', sourceUrl);

    expect(result.lore).toBeNull();
  });

  it('returns faction with null fields for empty input', () => {
    const result = parseFactionPage('', 'space-marines', 'Space Marines', sourceUrl);

    expect(result).toMatchObject({
      slug: 'space-marines',
      name: 'Space Marines',
      armyRules: null,
      lore: null,
      wahapediaPath: '/wh40k10ed/factions/space-marines/',
      sourceUrl,
      dataSource: 'wahapedia',
    });
  });
});

describe('parseDetachments', () => {
  const sourceUrl = 'https://wahapedia.ru/wh40k10ed/factions/space-marines/';

  it('parses a valid detachment', () => {
    const markdown = `
## Gladius Task Force

The most common Space Marine formation.

## Detachment Rule

### Oath of Moment

At the start of the battle round, select one enemy unit...

## Enhancements
    `;
    const result = parseDetachments(markdown, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'Gladius Task Force',
      slug: 'gladius-task-force',
      detachmentRuleName: 'Oath of Moment',
      dataSource: 'wahapedia',
    });
  });

  it('extracts detachment rule name and content', () => {
    const markdown = `
## Vanguard Spearhead

Fast attack formation.

## Detachment Rule

### Lightning Assault

Units can advance and charge.

## Stratagems
    `;
    const result = parseDetachments(markdown, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]?.detachmentRuleName).toBe('Lightning Assault');
    expect(result[0]?.detachmentRule).toContain('advance and charge');
  });

  it('skips system sections', () => {
    const markdown = `
## Army Rules

Army wide rules.

## Gladius Task Force

Formation lore.

## Detachment Rule

### Some Rule

Rule text.

## Enhancements

Enhancement content.

## Stratagems

Stratagem content.
    `;
    const result = parseDetachments(markdown, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Gladius Task Force');
  });

  it('does not treat section without following Detachment Rule as detachment', () => {
    const markdown = `
## Random Section

Some content.

## Another Section

More content.
    `;
    const result = parseDetachments(markdown, sourceUrl);

    expect(result).toHaveLength(0);
  });

  it('truncates lore at 1000 characters', () => {
    const longLore = 'A'.repeat(1500);
    const markdown = `
## Test Detachment

${longLore}

## Detachment Rule

### Rule Name

Rule content.
    `;
    const result = parseDetachments(markdown, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]?.lore?.length).toBeLessThanOrEqual(1000);
  });

  it('truncates detachment rule at 2000 characters', () => {
    const longRule = 'B'.repeat(2500);
    const markdown = `
## Test Detachment

Lore.

## Detachment Rule

### Rule Name

${longRule}
    `;
    const result = parseDetachments(markdown, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]?.detachmentRule?.length).toBeLessThanOrEqual(2000);
  });

  it('handles detachment without lore content', () => {
    const markdown = `
## Minimalist Detachment

## Detachment Rule

### Simple Rule

Does something.

## Enhancements
    `;
    const result = parseDetachments(markdown, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]?.lore).toBe(null);
  });
});

describe('parseStratagems', () => {
  const sourceUrl = 'https://wahapedia.ru/wh40k10ed/factions/space-marines/';

  it('parses a complete stratagem', () => {
    const markdown = `
RAPID REDEPLOYMENT
1CP
Gladius Task Force – Strategic Ploy Stratagem

**WHEN:** Your Movement phase.

**TARGET:** One unit from your army.

**EFFECT:** That unit can make a Normal move of up to 6".
    `;
    const result = parseStratagems(markdown, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'RAPID REDEPLOYMENT',
      cpCost: '1',
      phase: 'movement',
      when: 'Your Movement phase.',
      target: 'One unit from your army.',
    });
    expect(result[0]?.effect).toContain('Normal move');
  });

  it('detects shooting phase', () => {
    const markdown = `
HEAVY FIRE
2CP
Test – Battle Tactic Stratagem

**WHEN:** Your Shooting phase.

**TARGET:** One unit.

**EFFECT:** Re-roll hits.
    `;
    const result = parseStratagems(markdown, sourceUrl);

    expect(result[0]?.phase).toBe('shooting');
  });

  it('deduplicates stratagems with same name', () => {
    const markdown = `
RAPID FIRE
1CP
Test – Stratagem

**WHEN:** Shooting phase.

**TARGET:** Unit.

**EFFECT:** Effect 1.

RAPID FIRE
1CP
Test – Stratagem

**WHEN:** Shooting phase.

**TARGET:** Unit.

**EFFECT:** Effect 2.
    `;
    const result = parseStratagems(markdown, sourceUrl);

    expect(result).toHaveLength(1);
  });

  it('skips stratagems without EFFECT field', () => {
    // Real Wahapedia stratagems always have structured WHEN/TARGET/EFFECT fields
    // Stratagems without EFFECT should be skipped
    const markdown = `
SIMPLE STRATAGEM
1CP
Test – Wargear Stratagem

Just a description without structured fields.
    `;
    const result = parseStratagems(markdown, sourceUrl);

    expect(result).toHaveLength(0);
  });

  it('handles missing WHEN/TARGET but has EFFECT', () => {
    const markdown = `
SIMPLE STRATAGEM
1CP
Test – Wargear Stratagem

**EFFECT:** Just an effect without when/target.
    `;
    const result = parseStratagems(markdown, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]?.when).toBeNull();
    expect(result[0]?.target).toBeNull();
  });

  it('truncates effect at 2000 characters', () => {
    const longEffect = 'E'.repeat(2500);
    const markdown = `
LONG EFFECT
1CP
Test – Stratagem

**WHEN:** Phase.

**TARGET:** Unit.

**EFFECT:** ${longEffect}
    `;
    const result = parseStratagems(markdown, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]?.effect?.length).toBeLessThanOrEqual(2000);
  });

  it('detects Battle Tactic stratagem type', () => {
    const markdown = `
TACTIC
1CP
Detachment – Battle Tactic Stratagem

**WHEN:** Phase.

**TARGET:** Unit.

**EFFECT:** Effect.
    `;
    const result = parseStratagems(markdown, sourceUrl);

    expect(result).toHaveLength(1);
  });

  it('returns empty array for no stratagems', () => {
    const markdown = `
## Some Section

No stratagems here.
    `;
    const result = parseStratagems(markdown, sourceUrl);

    expect(result).toEqual([]);
  });
});

describe('parseEnhancements', () => {
  const sourceUrl = 'https://wahapedia.ru/wh40k10ed/factions/space-marines/';

  it('parses enhancement from Wahapedia table format', () => {
    const markdown = `
## Enhancements

|     |
| --- |
| - Artificer Armour 20 pts<br>A finely crafted set of armour.<br>SPACEMARINES model only. The bearer has a 2+ Save. |
    `;
    const result = parseEnhancements(markdown, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'Artificer Armour',
      pointsCost: 20,
      slug: 'artificer-armour',
      dataSource: 'wahapedia',
    });
    expect(result[0]?.description).toContain('A finely crafted set of armour');
  });

  it('handles pts format', () => {
    const markdown = `
|     |
| --- |
| - Storm Shield 15 pts<br>Defensive gear.<br>Effect text here. |
    `;
    const result = parseEnhancements(markdown, sourceUrl);

    expect(result[0]?.pointsCost).toBe(15);
  });

  it('handles pt format (singular)', () => {
    const markdown = `
|     |
| --- |
| - Minor Relic 1 pt<br>A small bonus. |
    `;
    const result = parseEnhancements(markdown, sourceUrl);

    expect(result[0]?.pointsCost).toBe(1);
  });

  it('extracts restrictions from model only pattern', () => {
    const markdown = `
|     |
| --- |
| - Chapter Master Relic 30 pts<br>A sacred weapon.<br>CAPTAIN model only. Grants rerolls. |
    `;
    const result = parseEnhancements(markdown, sourceUrl);

    expect(result[0]?.restrictions).toContain('CAPTAIN model only');
  });

  it('extracts restrictions with INFANTRY pattern', () => {
    const markdown = `
|     |
| --- |
| - Psyker Staff 25 pts<br>Psychic enhancement.<br>PSYKER INFANTRY model only. Add 1 to psychic tests. |
    `;
    const result = parseEnhancements(markdown, sourceUrl);

    expect(result[0]?.restrictions).toContain('PSYKER INFANTRY model only');
  });

  it('parses multiple enhancements in table format', () => {
    const markdown = `
## Enhancements

|     |
| --- |
| - First 10 pts<br>Description one. |

|     |
| --- |
| - Second 20 pts<br>Description two. |

|     |
| --- |
| - Third 30 pts<br>Description three. |
    `;
    const result = parseEnhancements(markdown, sourceUrl);

    expect(result).toHaveLength(3);
    expect(result.map((e) => e.name)).toEqual(['First', 'Second', 'Third']);
  });

  it('returns empty array for no enhancements', () => {
    const markdown = `
## Some Section

No enhancements here.
    `;
    const result = parseEnhancements(markdown, sourceUrl);

    expect(result).toEqual([]);
  });

  it('deduplicates enhancements with same name', () => {
    const markdown = `
|     |
| --- |
| - Duplicate 10 pts<br>First instance. |

|     |
| --- |
| - Duplicate 10 pts<br>Second instance. |
    `;
    const result = parseEnhancements(markdown, sourceUrl);

    expect(result).toHaveLength(1);
  });

  it('parses real Wahapedia format', () => {
    // Real example from Thousand Sons
    const markdown = `
## Enhancements

|     |
| --- |
| - Lord of Forbidden Lore 20 pts<br>This Sorcerer has committed many a grimoire and unholy tome to memory.<br>THOUSANDSONS model only. Each time the bearer manifests a Ritual, add 6" to its range. |
    `;
    const result = parseEnhancements(markdown, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Lord of Forbidden Lore');
    expect(result[0]?.pointsCost).toBe(20);
    expect(result[0]?.restrictions).toContain('THOUSANDSONS model only');
  });
});
