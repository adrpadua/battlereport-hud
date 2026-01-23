import { describe, it, expect } from 'vitest';
import { parseCoreRules, extractKeyRules } from './core-rules-parser.js';

const sourceUrl = 'https://wahapedia.ru/wh40k10ed/the-rules/core-rules/';

describe('parseCoreRules', () => {
  it('parses h2 sections without subsections', () => {
    const html = `
      <h2>Movement Phase</h2>
      <p>When a unit moves, it can travel up to its Move characteristic in inches.</p>
      <p>Each model in the unit must end its move within 2" of another model.</p>
    `;

    const result = parseCoreRules(html, sourceUrl);

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
    const html = `
      <h2>Shooting Phase</h2>
      <p>The shooting phase is where ranged attacks are resolved. This is intro text that should be included.</p>
      <h3>Selecting Targets</h3>
      <p>When a unit shoots, you must select a target for each weapon.</p>
      <h3>Making Hit Rolls</h3>
      <p>Roll a D6 for each attack.</p>
    `;

    const result = parseCoreRules(html, sourceUrl);

    expect(result.length).toBeGreaterThanOrEqual(2);

    // Should have main section with intro
    const mainSection = result.find((r) => r.slug === 'shooting-phase');
    expect(mainSection).toBeDefined();
    expect(mainSection?.category).toBe('shooting_phase');

    // Should have subsections
    const selectingTargets = result.find((r) => r.slug === 'shooting-phase-selecting-targets');
    expect(selectingTargets).toBeDefined();
    expect(selectingTargets?.subcategory).toBe('Shooting Phase');
    expect(selectingTargets?.content).toContain('select a target');

    const hitRolls = result.find((r) => r.slug === 'shooting-phase-making-hit-rolls');
    expect(hitRolls).toBeDefined();
    expect(hitRolls?.content).toContain('Roll a D6');
  });

  it('skips sections with minimal content (<10 chars)', () => {
    const html = `
      <h2>Valid Section</h2>
      <p>This section has enough content to be included in the output.</p>
      <h2>Empty Section</h2>
      <p>Short</p>
      <h2>Another Valid</h2>
      <p>This section also has enough content to pass the minimum threshold.</p>
    `;

    const result = parseCoreRules(html, sourceUrl);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.title)).toEqual(['Valid Section', 'Another Valid']);
  });

  it('correctly assigns orderIndex', () => {
    const html = `
      <h2>First Section</h2>
      <p>Content for first section that is long enough to be included.</p>
      <h2>Second Section</h2>
      <p>Content for second section that is long enough to be included.</p>
      <h2>Third Section</h2>
      <p>Content for third section that is long enough to be included.</p>
    `;

    const result = parseCoreRules(html, sourceUrl);

    expect(result).toHaveLength(3);
    expect(result[0]?.orderIndex).toBe(0);
    expect(result[1]?.orderIndex).toBe(1);
    expect(result[2]?.orderIndex).toBe(2);
  });

  it('truncates slug and title to 255 chars', () => {
    const longTitle = 'A'.repeat(300);
    const html = `
      <h2>${longTitle}</h2>
      <p>Content for the long titled section that needs enough text.</p>
    `;

    const result = parseCoreRules(html, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]?.slug.length).toBeLessThanOrEqual(255);
    expect(result[0]?.title.length).toBeLessThanOrEqual(255);
  });

  it('returns empty array for empty input', () => {
    expect(parseCoreRules('', sourceUrl)).toEqual([]);
  });

  it('handles HTML with only short content', () => {
    // Content must be >50 chars for main sections
    const html = '<h2>Short</h2><p>Tiny</p>';

    const result = parseCoreRules(html, sourceUrl);

    // Content "Tiny" is only 4 chars, should be skipped
    expect(result).toHaveLength(0);
  });

  it('parses alternative anchor-based structure when no h2 found', () => {
    const html = `
      <a name="Movement-Rules"></a>
      <p>This section describes how units move on the battlefield during your turn.</p>
      <p>Units can move, advance, or fall back depending on the situation.</p>
    `;

    const result = parseCoreRules(html, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('Movement Rules');
    expect(result[0]?.content).toContain('units move');
  });

  it('handles lists correctly', () => {
    const html = `
      <h2>Unit Types</h2>
      <p>Units in Warhammer 40,000 can be one of the following types:</p>
      <ul>
        <li>Infantry</li>
        <li>Vehicle</li>
        <li>Monster</li>
      </ul>
    `;

    const result = parseCoreRules(html, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]?.content).toContain('Infantry');
    expect(result[0]?.content).toContain('Vehicle');
  });

  it('handles tables correctly', () => {
    const html = `
      <h2>Weapon Characteristics</h2>
      <p>Weapons have the following characteristics shown in tables:</p>
      <table>
        <tr><th>Weapon</th><th>Range</th><th>Strength</th></tr>
        <tr><td>Bolter</td><td>24"</td><td>4</td></tr>
        <tr><td>Lascannon</td><td>48"</td><td>12</td></tr>
      </table>
    `;

    const result = parseCoreRules(html, sourceUrl);

    expect(result).toHaveLength(1);
    expect(result[0]?.content).toContain('Bolter');
    expect(result[0]?.content).toContain('Lascannon');
  });

  describe('slugify (via parseCoreRules)', () => {
    it('converts text to lowercase', () => {
      const html = `
        <h2>Space Marines Rules</h2>
        <p>Content here that is long enough for the section to be included.</p>
      `;

      const result = parseCoreRules(html, sourceUrl);
      expect(result[0]?.slug).toBe('space-marines-rules');
    });

    it('replaces special characters with hyphens', () => {
      const html = `
        <h2>T'au Empire's Rules & Regulations</h2>
        <p>Content here for testing special characters in title slugification.</p>
      `;

      const result = parseCoreRules(html, sourceUrl);
      expect(result[0]?.slug).toBe('t-au-empire-s-rules-regulations');
    });

    it('removes leading and trailing hyphens', () => {
      const html = `
        <h2>---Test Section---</h2>
        <p>Content here that is long enough for the section to be included.</p>
      `;

      const result = parseCoreRules(html, sourceUrl);
      expect(result[0]?.slug).toBe('test-section');
    });
  });

  describe('detectCategory (via parseCoreRules)', () => {
    const testCategory = (title: string, expectedCategory: string) => {
      const html = `
        <h2>${title}</h2>
        <p>Content for this section must be long enough to pass validation checks.</p>
      `;

      const result = parseCoreRules(html, sourceUrl);
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

  describe('edge cases', () => {
    it('handles malformed HTML gracefully', () => {
      const html = '<h2>Broken<p>Unclosed tags but with enough content for parsing';

      const result = parseCoreRules(html, sourceUrl);

      // Cheerio handles malformed HTML, should not throw
      expect(result).toBeDefined();
    });

    it('handles HTML with no h2 or anchors', () => {
      const html = '<p>Just some random content without any sections.</p>';

      const result = parseCoreRules(html, sourceUrl);

      expect(result).toEqual([]);
    });

    it('skips empty title h2 elements', () => {
      const html = `
        <h2></h2>
        <p>Content without a proper title should be skipped.</p>
        <h2>Valid Title</h2>
        <p>This content has a valid title and should be included.</p>
      `;

      const result = parseCoreRules(html, sourceUrl);

      expect(result).toHaveLength(1);
      expect(result[0]?.title).toBe('Valid Title');
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
