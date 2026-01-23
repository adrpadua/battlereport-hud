import { describe, it, expect } from 'vitest';
import { parseRuleText } from './RuleText';

describe('parseRuleText', () => {
  it('should parse plain text', () => {
    const result = parseRuleText('This is plain text.');
    expect(result).toEqual([{ type: 'text', content: 'This is plain text.' }]);
  });

  it('should parse keyword brackets', () => {
    const result = parseRuleText('Gains [LETHAL HITS] ability.');
    expect(result).toEqual([
      { type: 'text', content: 'Gains ' },
      { type: 'keyword', keyword: 'LETHAL HITS' },
      { type: 'text', content: ' ability.' },
    ]);
  });

  it('should parse ALL-CAPS unit keywords as bold', () => {
    const result = parseRuleText('Friendly TYRANIDS units within 6".');
    expect(result).toEqual([
      { type: 'text', content: 'Friendly ' },
      { type: 'unit-keyword', content: 'TYRANIDS' },
      { type: 'text', content: ' units within 6".' },
    ]);
  });

  it('should parse multiple ALL-CAPS keywords', () => {
    const result = parseRuleText('MAWLOC and TRYGON units from your army.');
    expect(result).toEqual([
      { type: 'unit-keyword', content: 'MAWLOC' },
      { type: 'text', content: ' and ' },
      { type: 'unit-keyword', content: 'TRYGON' },
      { type: 'text', content: ' units from your army.' },
    ]);
  });

  it('should handle mixed bracketed keywords and unit keywords', () => {
    const result = parseRuleText('TYRANIDS units gain [SUSTAINED HITS 1].');
    expect(result).toEqual([
      { type: 'unit-keyword', content: 'TYRANIDS' },
      { type: 'text', content: ' units gain ' },
      { type: 'keyword', keyword: 'SUSTAINED HITS 1' },
      { type: 'text', content: '.' },
    ]);
  });

  it('should normalize concatenated keywords', () => {
    const result = parseRuleText('Units gain [SUSTAINEDHITS1].');
    expect(result).toEqual([
      { type: 'text', content: 'Units gain ' },
      { type: 'keyword', keyword: 'SUSTAINED HITS 1' },
      { type: 'text', content: '.' },
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

  it('should handle hyphenated ALL-CAPS keywords', () => {
    const result = parseRuleText('The BATTLE-SHOCKED unit cannot fall back.');
    expect(result).toEqual([
      { type: 'text', content: 'The ' },
      { type: 'unit-keyword', content: 'BATTLE-SHOCKED' },
      { type: 'text', content: ' unit cannot fall back.' },
    ]);
  });

  it('should handle real detachment rule text', () => {
    const text = 'Each time a TYRANIDS model from your army makes an attack, re-roll a Hitroll of 1.';
    const result = parseRuleText(text);

    expect(result.some(s => s.type === 'unit-keyword' && s.content === 'TYRANIDS')).toBe(true);
    expect(result.some(s => s.type === 'text' && s.content.includes('re-roll'))).toBe(true);
  });

  it('should handle BURROWER keyword', () => {
    const text = 'Each time a BURROWER unit from your army is set up on the battlefield.';
    const result = parseRuleText(text);

    expect(result).toContainEqual({ type: 'unit-keyword', content: 'BURROWER' });
  });

  it('should handle AIRCRAFT keyword', () => {
    const text = 'If an enemy model (excluding AIRCRAFT) ends any kind of move.';
    const result = parseRuleText(text);

    expect(result).toContainEqual({ type: 'unit-keyword', content: 'AIRCRAFT' });
  });

  it('should handle CHARACTER keyword', () => {
    const text = 'The selected units gain the CHARACTER keyword.';
    const result = parseRuleText(text);

    expect(result).toContainEqual({ type: 'unit-keyword', content: 'CHARACTER' });
  });

  it('should handle WARLORD keyword', () => {
    const text = 'One of them can be selected as your WARLORD.';
    const result = parseRuleText(text);

    expect(result).toContainEqual({ type: 'unit-keyword', content: 'WARLORD' });
  });

  it('should handle empty string', () => {
    expect(parseRuleText('')).toEqual([]);
  });
});
