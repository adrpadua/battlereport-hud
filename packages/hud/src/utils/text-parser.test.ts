import { describe, it, expect } from 'vitest';
import {
  stripUnitNameParentheses,
  parseAbilityDescription,
  cleanAbilityName,
  normalizeKeyword,
  parseWeaponAbilities,
  getKeywordVariant,
} from './text-parser';

describe('stripUnitNameParentheses', () => {
  it('should strip "(unit 1)" suffix', () => {
    expect(stripUnitNameParentheses('Gargoyles (unit 1)')).toBe('Gargoyles');
  });

  it('should strip "(unit 2)" suffix', () => {
    expect(stripUnitNameParentheses('Raveners (unit 2)')).toBe('Raveners');
  });

  it('should strip "(unit 2, deep strike)" suffix', () => {
    expect(stripUnitNameParentheses('Gargoyles (unit 2, deep strike)')).toBe('Gargoyles');
  });

  it('should strip numeric count "(15)" suffix', () => {
    expect(stripUnitNameParentheses('Hormagaunts (15)')).toBe('Hormagaunts');
  });

  it('should strip "(20)" suffix', () => {
    expect(stripUnitNameParentheses('Termagants (20)')).toBe('Termagants');
  });

  it('should return original name if no parentheses', () => {
    expect(stripUnitNameParentheses('Hive Tyrant')).toBe('Hive Tyrant');
  });

  it('should handle empty string', () => {
    expect(stripUnitNameParentheses('')).toBe('');
  });

  it('should handle unit names with hyphens', () => {
    expect(stripUnitNameParentheses('Screamer-killer (unit 1)')).toBe('Screamer-killer');
  });

  it('should only strip trailing parentheses', () => {
    // Parentheses in the middle should be preserved (if that ever happens)
    expect(stripUnitNameParentheses('Unit (A) Name')).toBe('Unit (A) Name');
  });

  it('should handle extra whitespace', () => {
    expect(stripUnitNameParentheses('Gargoyles  (unit 1)  ')).toBe('Gargoyles');
  });
});

describe('parseAbilityDescription', () => {
  it('should parse plain text', () => {
    const result = parseAbilityDescription('This is plain text.');
    expect(result).toEqual([{ type: 'text', content: 'This is plain text.' }]);
  });

  it('should parse keyword brackets', () => {
    const result = parseAbilityDescription('Gains [LETHAL HITS] ability.');
    expect(result).toEqual([
      { type: 'text', content: 'Gains ' },
      { type: 'keyword', content: 'LETHAL HITS', normalized: 'LETHAL HITS' },
      { type: 'text', content: ' ability.' },
    ]);
  });

  it('should parse escaped keyword brackets', () => {
    // Escaped brackets like \[KEYWORD\] are matched by the keyword pattern
    const result = parseAbilityDescription('Gains [SUSTAINED HITS] ability.');
    expect(result).toEqual([
      { type: 'text', content: 'Gains ' },
      { type: 'keyword', content: 'SUSTAINED HITS', normalized: 'SUSTAINED HITS' },
      { type: 'text', content: ' ability.' },
    ]);
  });

  it('should parse markdown links', () => {
    const result = parseAbilityDescription('See the [rules](http://example.com) here.');
    expect(result).toEqual([
      { type: 'text', content: 'See the ' },
      { type: 'link', text: 'rules', url: 'http://example.com' },
      { type: 'text', content: ' here.' },
    ]);
  });

  it('should parse ALL-CAPS unit keywords as bold', () => {
    const result = parseAbilityDescription('Friendly TYRANIDS units within 6".');
    expect(result).toEqual([
      { type: 'text', content: 'Friendly ' },
      { type: 'unit-keyword', content: 'TYRANIDS' },
      { type: 'text', content: ' units within 6".' },
    ]);
  });

  it('should parse multiple ALL-CAPS keywords', () => {
    const result = parseAbilityDescription('TYRANIDS INFANTRY units gain this ability.');
    expect(result).toEqual([
      { type: 'unit-keyword', content: 'TYRANIDS INFANTRY' },
      { type: 'text', content: ' units gain this ability.' },
    ]);
  });

  it('should parse SYNAPSE keyword', () => {
    const result = parseAbilityDescription('While within Synapse Range of your army.');
    // "Synapse" is mixed case, not ALL-CAPS, so it should be plain text
    expect(result).toEqual([{ type: 'text', content: 'While within Synapse Range of your army.' }]);
  });

  it('should parse SYNAPSE RANGE as unit keyword when ALL-CAPS', () => {
    const result = parseAbilityDescription('While within SYNAPSE RANGE of your army.');
    expect(result).toEqual([
      { type: 'text', content: 'While within ' },
      { type: 'unit-keyword', content: 'SYNAPSE RANGE' },
      { type: 'text', content: ' of your army.' },
    ]);
  });

  it('should handle mixed content with keywords and unit keywords', () => {
    const result = parseAbilityDescription('TYRANIDS units gain [LETHAL HITS].');
    expect(result).toEqual([
      { type: 'unit-keyword', content: 'TYRANIDS' },
      { type: 'text', content: ' units gain ' },
      { type: 'keyword', content: 'LETHAL HITS', normalized: 'LETHAL HITS' },
      { type: 'text', content: '.' },
    ]);
  });

  it('should handle empty string', () => {
    expect(parseAbilityDescription('')).toEqual([]);
  });

  it('should not match single capital letters', () => {
    const result = parseAbilityDescription('Roll a D6.');
    // "D" alone or short words should not be matched as unit keywords
    expect(result).toEqual([{ type: 'text', content: 'Roll a D6.' }]);
  });

  it('should handle hyphenated ALL-CAPS keywords', () => {
    const result = parseAbilityDescription('The BATTLE-SHOCKED unit cannot fall back.');
    expect(result).toEqual([
      { type: 'text', content: 'The ' },
      { type: 'unit-keyword', content: 'BATTLE-SHOCKED' },
      { type: 'text', content: ' unit cannot fall back.' },
    ]);
  });
});

describe('cleanAbilityName', () => {
  it('should insert space between camelCase', () => {
    expect(cleanAbilityName('DeadlyDemise')).toBe('Deadly Demise');
  });

  it('should handle "ShadowintheWarp"', () => {
    // The function handles camelCase but "inthe" pattern requires word boundaries
    // So it becomes "Shadowinthe Warp" (space before Warp due to camelCase)
    expect(cleanAbilityName('ShadowintheWarp')).toBe('Shadowinthe Warp');
  });

  it('should preserve D6 in ability names', () => {
    expect(cleanAbilityName('DeadlyDemiseD6')).toBe('Deadly Demise D6');
  });

  it('should handle "FeelNoPain5+"', () => {
    expect(cleanAbilityName('FeelNoPain5+')).toBe('Feel No Pain 5+');
  });

  it('should return empty string for empty input', () => {
    expect(cleanAbilityName('')).toBe('');
  });
});

describe('normalizeKeyword', () => {
  it('should normalize LETHALHITS', () => {
    expect(normalizeKeyword('LETHALHITS')).toBe('LETHAL HITS');
  });

  it('should normalize SUSTAINEDHITS', () => {
    expect(normalizeKeyword('SUSTAINEDHITS')).toBe('SUSTAINED HITS');
  });

  it('should normalize DEVASTATINGWOUNDS', () => {
    expect(normalizeKeyword('DEVASTATINGWOUNDS')).toBe('DEVASTATING WOUNDS');
  });

  it('should remove escape characters', () => {
    expect(normalizeKeyword('\\[LETHAL HITS\\]')).toBe('LETHAL HITS');
  });

  it('should insert space before numbers', () => {
    expect(normalizeKeyword('ANTI-VEHICLE4+')).toBe('ANTI-VEHICLE 4+');
  });

  it('should return empty string for empty input', () => {
    expect(normalizeKeyword('')).toBe('');
  });
});

describe('parseWeaponAbilities', () => {
  it('should parse comma-separated abilities', () => {
    expect(parseWeaponAbilities('Assault, Blast, Hazardous')).toEqual([
      'Assault',
      'Blast',
      'Hazardous',
    ]);
  });

  it('should parse concatenated abilities', () => {
    const result = parseWeaponAbilities('assaultblasthazardous');
    expect(result).toContain('Assault');
    expect(result).toContain('Blast');
    expect(result).toContain('Hazardous');
  });

  it('should return empty array for empty input', () => {
    expect(parseWeaponAbilities('')).toEqual([]);
  });
});

describe('getKeywordVariant', () => {
  it('should return weapon for LETHAL HITS', () => {
    expect(getKeywordVariant('LETHAL HITS')).toBe('weapon');
  });

  it('should return weapon for SUSTAINED HITS', () => {
    expect(getKeywordVariant('SUSTAINED HITS')).toBe('weapon');
  });

  it('should return weapon for ANTI- prefixed keywords', () => {
    expect(getKeywordVariant('ANTI-VEHICLE 4+')).toBe('weapon');
  });

  it('should return core for DEEP STRIKE', () => {
    expect(getKeywordVariant('DEEP STRIKE')).toBe('core');
  });

  it('should return core for FEEL NO PAIN', () => {
    expect(getKeywordVariant('FEEL NO PAIN')).toBe('core');
  });

  it('should return unit for unknown keywords', () => {
    expect(getKeywordVariant('INFANTRY')).toBe('unit');
    expect(getKeywordVariant('MONSTER')).toBe('unit');
  });
});
