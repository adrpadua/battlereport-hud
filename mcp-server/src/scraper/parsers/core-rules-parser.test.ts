import { describe, it, expect } from 'vitest';
import { parseCoreRules, extractKeyRules } from './core-rules-parser.js';

describe('parseCoreRules', () => {
  const sourceUrl = 'https://wahapedia.ru/wh40k10ed/the-rules/core-rules/';

  it('parses h2 sections without subsections', () => {
    const markdown = `## Movement Phase

When a unit moves, it can travel up to its Move characteristic in inches.

Each model in the unit must end its move within 2" of another model.`;

    const result = parseCoreRules(markdown, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      slug: 'movement-phase',
      title: 'Movement Phase',
      category: 'movement_phase',
      subcategory: null,
      orderIndex: 0,
      sourceUrl,
      dataSource: 'wahapedia',
    });
    expect(result[0]?.content).toContain('Move characteristic');
  });

  it('parses h2 sections with h3 subsections', () => {
    const markdown = `## Shooting Phase

The shooting phase is where ranged attacks are resolved.

This is intro text that should be included since it's over 50 characters long for the main section.

### Selecting Targets

When a unit shoots, you must select a target for each weapon.

### Making Hit Rolls

Roll a D6 for each attack.`;

    const result = parseCoreRules(markdown, sourceUrl);

    expect(result.length).toBeGreaterThanOrEqual(2);

    // Should have main section with intro
    const mainSection = result.find(r => r.slug === 'shooting-phase');
    expect(mainSection).toBeDefined();
    expect(mainSection?.category).toBe('shooting_phase');

    // Should have subsections
    const selectingTargets = result.find(r => r.slug === 'shooting-phase-selecting-targets');
    expect(selectingTargets).toBeDefined();
    expect(selectingTargets?.subcategory).toBe('Shooting Phase');
    expect(selectingTargets?.content).toContain('select a target');

    const hitRolls = result.find(r => r.slug === 'shooting-phase-making-hit-rolls');
    expect(hitRolls).toBeDefined();
    expect(hitRolls?.content).toContain('Roll a D6');
  });

  it('skips sections with minimal content (<10 chars)', () => {
    const markdown = `## Valid Section

This section has enough content to be included in the output.

## Empty Section

Short

## Another Valid

This section also has enough content to pass the minimum threshold.`;

    const result = parseCoreRules(markdown, sourceUrl);

    expect(result).toHaveLength(2);
    expect(result.map(r => r.title)).toEqual(['Valid Section', 'Another Valid']);
  });

  it('correctly assigns orderIndex', () => {
    const markdown = `## First Section

Content for first section.

## Second Section

Content for second section.

## Third Section

Content for third section.`;

    const result = parseCoreRules(markdown, sourceUrl);

    expect(result).toHaveLength(3);
    expect(result[0]?.orderIndex).toBe(0);
    expect(result[1]?.orderIndex).toBe(1);
    expect(result[2]?.orderIndex).toBe(2);
  });

  it('truncates slug and title to 255 chars', () => {
    const longTitle = 'A'.repeat(300);
    const markdown = `## ${longTitle}

Content for the long titled section.`;

    const result = parseCoreRules(markdown, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]?.slug.length).toBeLessThanOrEqual(255);
    expect(result[0]?.title.length).toBeLessThanOrEqual(255);
  });

  it('returns empty array for empty input', () => {
    expect(parseCoreRules('', sourceUrl)).toEqual([]);
  });

  it('handles markdown with only short content', () => {
    // Content must be >10 chars to be included
    const markdown = `## Short

Tiny`;

    const result = parseCoreRules(markdown, sourceUrl);

    // Content "Tiny" is only 4 chars, should be skipped
    expect(result).toHaveLength(0);
  });

  describe('slugify (via parseCoreRules)', () => {
    it('converts text to lowercase', () => {
      const markdown = `## Space Marines Rules

Content here.`;

      const result = parseCoreRules(markdown, sourceUrl);
      expect(result[0]?.slug).toBe('space-marines-rules');
    });

    it('replaces special characters with hyphens', () => {
      const markdown = `## T'au Empire's Rules & Regulations

Content here for testing special characters.`;

      const result = parseCoreRules(markdown, sourceUrl);
      expect(result[0]?.slug).toBe('t-au-empire-s-rules-regulations');
    });

    it('removes leading and trailing hyphens', () => {
      const markdown = `## ---Test Section---

Content here.`;

      const result = parseCoreRules(markdown, sourceUrl);
      expect(result[0]?.slug).toBe('test-section');
    });
  });

  describe('detectCategory (via parseCoreRules)', () => {
    const testCategory = (title: string, expectedCategory: string) => {
      const markdown = `## ${title}

Content for this section must be long enough to pass validation.`;

      const result = parseCoreRules(markdown, sourceUrl);
      expect(result[0]?.category).toBe(expectedCategory);
    };

    it('detects command_phase', () => {
      testCategory('The Command Phase', 'command_phase');
    });

    it('detects movement_phase', () => {
      testCategory('Movement Phase Rules', 'movement_phase');
    });

    it('detects shooting_phase', () => {
      testCategory('Shooting Phase', 'shooting_phase');
    });

    it('detects charge_phase', () => {
      testCategory('Charge Phase', 'charge_phase');
    });

    it('detects fight_phase', () => {
      testCategory('The Fight Phase', 'fight_phase');
    });

    it('detects combat from attacks', () => {
      testCategory('Making Attacks', 'combat');
    });

    it('detects combat from hit roll', () => {
      testCategory('The Hit Roll', 'combat');
    });

    it('detects combat from wound roll', () => {
      testCategory('Wound Roll Rules', 'combat');
    });

    it('detects morale', () => {
      testCategory('Morale Tests', 'morale');
    });

    it('detects morale from battle-shock', () => {
      testCategory('Battle-shock Tests', 'morale');
    });

    it('detects transports', () => {
      testCategory('Transport Capacity', 'transports');
    });

    it('detects terrain', () => {
      testCategory('Terrain Rules', 'terrain');
    });

    it('detects terrain from cover', () => {
      testCategory('Cover Rules', 'terrain');
    });

    it('detects psychic', () => {
      testCategory('Psychic Powers', 'psychic');
    });

    it('detects psychic from psyker', () => {
      testCategory('Psyker Units', 'psychic');
    });

    it('detects stratagems', () => {
      testCategory('Using Stratagems', 'stratagems');
    });

    it('detects objectives', () => {
      testCategory('Objective Markers', 'objectives');
    });

    it('detects objectives from victory', () => {
      testCategory('Victory Points', 'objectives');
    });

    it('detects deployment', () => {
      testCategory('Deployment Zone', 'deployment');
    });

    it('detects deployment from reserves', () => {
      testCategory('Reserves Rules', 'deployment');
    });

    it('detects units', () => {
      testCategory('Unit Profiles', 'units');
    });

    it('detects units from datasheet', () => {
      testCategory('Reading a Datasheet', 'units');
    });

    it('detects weapons', () => {
      testCategory('Weapon Profiles', 'weapons');
    });

    it('detects weapons from wargear', () => {
      testCategory('Wargear Options', 'weapons');
    });

    it('detects abilities', () => {
      testCategory('Core Abilities', 'abilities');
    });

    it('detects keywords', () => {
      testCategory('Keyword Rules', 'keywords');
    });

    it('detects leaders', () => {
      testCategory('Leader Characters', 'leaders');
    });

    it('detects leaders from attached', () => {
      testCategory('Attached Models', 'leaders');
    });

    it('defaults to general for unknown categories', () => {
      testCategory('Random Section Title', 'general');
    });
  });
});

describe('extractKeyRules', () => {
  it('groups rules by category correctly', () => {
    const rules = [
      {
        slug: 'movement-basic',
        title: 'Basic Movement',
        category: 'movement_phase',
        subcategory: null,
        content: 'Movement content',
        orderIndex: 0,
        sourceUrl: 'test',
        dataSource: 'wahapedia' as const,
      },
      {
        slug: 'movement-advance',
        title: 'Advancing',
        category: 'movement_phase',
        subcategory: null,
        content: 'Advance content',
        orderIndex: 1,
        sourceUrl: 'test',
        dataSource: 'wahapedia' as const,
      },
      {
        slug: 'shooting-basic',
        title: 'Basic Shooting',
        category: 'shooting_phase',
        subcategory: null,
        content: 'Shooting content',
        orderIndex: 2,
        sourceUrl: 'test',
        dataSource: 'wahapedia' as const,
      },
    ];

    const grouped = extractKeyRules(rules);

    expect(Object.keys(grouped)).toHaveLength(2);
    expect(grouped.movement_phase).toHaveLength(2);
    expect(grouped.shooting_phase).toHaveLength(1);
    expect(grouped.movement_phase![0]?.title).toBe('Basic Movement');
    expect(grouped.movement_phase![1]?.title).toBe('Advancing');
  });

  it('handles empty input', () => {
    const grouped = extractKeyRules([]);

    expect(Object.keys(grouped)).toHaveLength(0);
  });

  it('handles single rule', () => {
    const rules = [
      {
        slug: 'test-rule',
        title: 'Test Rule',
        category: 'general',
        subcategory: null,
        content: 'Test content',
        orderIndex: 0,
        sourceUrl: 'test',
        dataSource: 'wahapedia' as const,
      },
    ];

    const grouped = extractKeyRules(rules);

    expect(Object.keys(grouped)).toHaveLength(1);
    expect(grouped.general).toHaveLength(1);
  });
});
