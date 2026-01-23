import { describe, it, expect } from 'vitest';
import {
  stripBattleSizeSuffix,
  isRulesParagraph,
  stripFluffParagraphs,
  normalizeKeywordName,
  parseRuleText,
  getPlainText,
  extractKeywords,
  BATTLE_SIZE_SUFFIXES,
  KEYWORD_MAPPINGS,
} from './rule-text-parser';

describe('stripBattleSizeSuffix', () => {
  it('should strip Combat Patrol suffix', () => {
    expect(stripBattleSizeSuffix('Invasion Fleet (Combat Patrol)')).toBe('Invasion Fleet');
  });

  it('should strip Strike Force suffix', () => {
    expect(stripBattleSizeSuffix('Invasion Fleet (Strike Force)')).toBe('Invasion Fleet');
  });

  it('should strip Incursion suffix', () => {
    expect(stripBattleSizeSuffix('Gladius Task Force (Incursion)')).toBe('Gladius Task Force');
  });

  it('should strip Onslaught suffix', () => {
    expect(stripBattleSizeSuffix('Annihilation Legion (Onslaught)')).toBe('Annihilation Legion');
  });

  it('should return original name if no suffix', () => {
    expect(stripBattleSizeSuffix('Invasion Fleet')).toBe('Invasion Fleet');
  });

  it('should handle empty string', () => {
    expect(stripBattleSizeSuffix('')).toBe('');
  });

  it('should only strip known suffixes', () => {
    expect(stripBattleSizeSuffix('Invasion Fleet (Custom)')).toBe('Invasion Fleet (Custom)');
  });
});

describe('isRulesParagraph', () => {
  it('should detect "At the start of" pattern', () => {
    expect(isRulesParagraph('At the start of your Command phase, select one unit from your army.')).toBe(true);
  });

  it('should detect "Each time" pattern', () => {
    expect(isRulesParagraph('Each time a model makes an attack, add 1 to the Hit roll.')).toBe(true);
  });

  it('should detect phase references', () => {
    expect(isRulesParagraph('In the Shooting phase, this unit can target enemy units.')).toBe(true);
    expect(isRulesParagraph('During the Fight phase, models in this unit fight first.')).toBe(true);
    expect(isRulesParagraph('At the end of the Movement phase, you may select one unit.')).toBe(true);
  });

  it('should detect "units from your army" pattern', () => {
    expect(isRulesParagraph('Units from your army with this ability gain +1 to hit.')).toBe(true);
  });

  it('should detect roll mechanics', () => {
    expect(isRulesParagraph('You can re-roll Hit rolls of 1 for this unit.')).toBe(true);
    expect(isRulesParagraph('Add 1 to Wound rolls made by this unit.')).toBe(true);
  });

  it('should not detect fluff/lore text', () => {
    expect(isRulesParagraph('Every warrior in the Tyranid swarm fights with savage ferocity.')).toBe(false);
    expect(isRulesParagraph('The Space Marines are the Emperor\'s finest warriors.')).toBe(false);
  });
});

describe('stripFluffParagraphs', () => {
  it('should remove leading fluff paragraphs', () => {
    const text = `Every warrior in the Tyranid swarm fights with savage ferocity.

At the start of your Command phase, select one unit from your army.`;

    const result = stripFluffParagraphs(text);
    expect(result).toBe('At the start of your Command phase, select one unit from your army.');
  });

  it('should keep all content if first paragraph is rules', () => {
    const text = `At the start of your Command phase, select one unit from your army.

This unit gains +1 to hit.`;

    const result = stripFluffParagraphs(text);
    expect(result).toBe(text);
  });

  it('should return original text if no rules paragraphs found', () => {
    const text = 'Pure fluff text with no rules content.';
    const result = stripFluffParagraphs(text);
    expect(result).toBe(text);
  });

  it('should handle multiple fluff paragraphs before rules', () => {
    const text = `Fluff paragraph one.

Fluff paragraph two.

At the start of your Command phase, do something.

More rules here.`;

    const result = stripFluffParagraphs(text);
    expect(result).toBe(`At the start of your Command phase, do something.

More rules here.`);
  });
});

describe('normalizeKeywordName', () => {
  it('should normalize SUSTAINEDHITS', () => {
    expect(normalizeKeywordName('SUSTAINEDHITS')).toBe('SUSTAINED HITS');
  });

  it('should normalize SUSTAINEDHITS1', () => {
    expect(normalizeKeywordName('SUSTAINEDHITS1')).toBe('SUSTAINED HITS 1');
  });

  it('should normalize LETHALHITS', () => {
    expect(normalizeKeywordName('LETHALHITS')).toBe('LETHAL HITS');
  });

  it('should normalize DEVASTATINGWOUNDS', () => {
    expect(normalizeKeywordName('DEVASTATINGWOUNDS')).toBe('DEVASTATING WOUNDS');
  });

  it('should normalize FEELNOPAIN with number', () => {
    expect(normalizeKeywordName('FEELNOPAIN5')).toBe('FEEL NO PAIN 5');
  });

  it('should normalize ANTIVEHICLE with number', () => {
    expect(normalizeKeywordName('ANTIVEHICLE4')).toBe('ANTI-VEHICLE 4');
  });

  it('should preserve unknown keywords', () => {
    expect(normalizeKeywordName('INFANTRY')).toBe('INFANTRY');
    expect(normalizeKeywordName('MONSTER')).toBe('MONSTER');
  });

  it('should handle keywords with plus modifiers', () => {
    expect(normalizeKeywordName('SUSTAINEDHITS2+')).toBe('SUSTAINED HITS 2+');
  });
});

describe('parseRuleText', () => {
  it('should parse plain text without keywords', () => {
    const result = parseRuleText('This is plain text.');
    expect(result).toEqual([{ type: 'text', content: 'This is plain text.' }]);
  });

  it('should parse escaped bracket keywords', () => {
    const result = parseRuleText('Units gain \\[SUSTAINEDHITS1\\] ability.');
    expect(result).toEqual([
      { type: 'text', content: 'Units gain ' },
      { type: 'keyword', keyword: 'SUSTAINED HITS 1' },
      { type: 'text', content: ' ability.' },
    ]);
  });

  it('should parse regular bracket keywords', () => {
    const result = parseRuleText('Units gain [INFANTRY] keyword.');
    expect(result).toEqual([
      { type: 'text', content: 'Units gain ' },
      { type: 'keyword', keyword: 'INFANTRY' },
      { type: 'text', content: ' keyword.' },
    ]);
  });

  it('should convert markdown links to plain text', () => {
    const result = parseRuleText('During the [Fight phase](link) they attack.');
    expect(result).toEqual([{ type: 'text', content: 'During the Fight phase they attack.' }]);
  });

  it('should remove markdown images', () => {
    const result = parseRuleText('Text ![alt](image.png) more text.');
    expect(result).toEqual([{ type: 'text', content: 'Text  more text.' }]);
  });

  it('should convert markdown bold to plain text', () => {
    const result = parseRuleText('This is **important** text.');
    expect(result).toEqual([{ type: 'text', content: 'This is important text.' }]);
  });

  it('should handle multiple keywords in one text', () => {
    const result = parseRuleText('Gains \\[SUSTAINEDHITS1\\] and \\[LETHALHITS\\].');
    expect(result).toEqual([
      { type: 'text', content: 'Gains ' },
      { type: 'keyword', keyword: 'SUSTAINED HITS 1' },
      { type: 'text', content: ' and ' },
      { type: 'keyword', keyword: 'LETHAL HITS' },
      { type: 'text', content: '.' },
    ]);
  });

  it('should not match lowercase bracket content', () => {
    const result = parseRuleText('See [reinforcements] rules.');
    // lowercase should become link text conversion (no url), so plain text
    expect(result).toEqual([{ type: 'text', content: 'See [reinforcements] rules.' }]);
  });

  it('should handle complex real-world text', () => {
    const text = `Each time a model makes a ranged attack, if the target is within half range, add 1 to the [Wound roll](). In addition, ranged weapons equipped by models have the \\[SUSTAINEDHITS1\\] ability.`;
    const result = parseRuleText(text);

    expect(result.length).toBe(3);
    expect(result[0]).toEqual({ type: 'text', content: 'Each time a model makes a ranged attack, if the target is within half range, add 1 to the Wound roll. In addition, ranged weapons equipped by models have the ' });
    expect(result[1]).toEqual({ type: 'keyword', keyword: 'SUSTAINED HITS 1' });
    expect(result[2]).toEqual({ type: 'text', content: ' ability.' });
  });

  it('should clean up table markdown formatting', () => {
    const text = `Some rule text.
| Header | Header |
|--------|--------|
| Cell | Cell |
More text.`;
    const result = parseRuleText(text);
    const plainText = getPlainText(result);
    expect(plainText).not.toContain('|--------|');
    expect(plainText).not.toContain('| Cell |');
  });
});

describe('getPlainText', () => {
  it('should convert segments back to readable text', () => {
    const segments = [
      { type: 'text' as const, content: 'Units gain ' },
      { type: 'keyword' as const, keyword: 'SUSTAINED HITS 1' },
      { type: 'text' as const, content: ' ability.' },
    ];
    expect(getPlainText(segments)).toBe('Units gain [SUSTAINED HITS 1] ability.');
  });
});

describe('extractKeywords', () => {
  it('should extract all keywords from segments', () => {
    const segments = [
      { type: 'text' as const, content: 'Gains ' },
      { type: 'keyword' as const, keyword: 'SUSTAINED HITS 1' },
      { type: 'text' as const, content: ' and ' },
      { type: 'keyword' as const, keyword: 'LETHAL HITS' },
      { type: 'text' as const, content: '.' },
    ];
    expect(extractKeywords(segments)).toEqual(['SUSTAINED HITS 1', 'LETHAL HITS']);
  });

  it('should return empty array if no keywords', () => {
    const segments = [{ type: 'text' as const, content: 'Plain text.' }];
    expect(extractKeywords(segments)).toEqual([]);
  });
});

describe('constants', () => {
  it('should have all battle size suffixes', () => {
    expect(BATTLE_SIZE_SUFFIXES).toContain('(Combat Patrol)');
    expect(BATTLE_SIZE_SUFFIXES).toContain('(Incursion)');
    expect(BATTLE_SIZE_SUFFIXES).toContain('(Strike Force)');
    expect(BATTLE_SIZE_SUFFIXES).toContain('(Onslaught)');
  });

  it('should have common keyword mappings', () => {
    expect(KEYWORD_MAPPINGS.SUSTAINEDHITS).toBe('SUSTAINED HITS');
    expect(KEYWORD_MAPPINGS.LETHALHITS).toBe('LETHAL HITS');
    expect(KEYWORD_MAPPINGS.DEVASTATINGWOUNDS).toBe('DEVASTATING WOUNDS');
    expect(KEYWORD_MAPPINGS.FEELNOPAIN).toBe('FEEL NO PAIN');
    expect(KEYWORD_MAPPINGS.DEEPSTRIKE).toBe('DEEP STRIKE');
  });
});
