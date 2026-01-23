import { describe, it, expect } from 'vitest';
import { parseDatasheets, cleanWeaponName, WEAPON_ABILITY_KEYWORDS } from './unit-parser.js';

describe('parseDatasheets', () => {
  const sourceUrl = 'https://wahapedia.ru/wh40k10ed/factions/leagues-of-votann/Arkanyst-Evaluator';

  it('returns empty array for non-unit content', () => {
    const nonUnitContent = '<html><body>Some non-unit content</body></html>';
    const result = parseDatasheets(nonUnitContent, sourceUrl);

    expect(result).toHaveLength(0);
  });
});

describe('cleanWeaponName', () => {
  describe('should extract concatenated weapon abilities (no space before keyword)', () => {
    it('extracts single concatenated ability', () => {
      // Ability must be concatenated without space to be extracted
      const result = cleanWeaponName('Bolterblast');

      expect(result.name).toBe('Bolter');
      expect(result.abilities).toBe('[BLAST]');
    });

    it('extracts multiple concatenated abilities', () => {
      const result = cleanWeaponName('Spore Mine launcherblastdevastatingwoundsheavyindirectfire');

      expect(result.name).toBe('Spore Mine launcher');
      expect(result.abilities).toContain('[BLAST]');
    });

    it('extracts "devastating wounds" ability', () => {
      const result = cleanWeaponName('Power sworddevastatingwounds');

      expect(result.name).toBe('Power sword');
      expect(result.abilities).toBe('[DEVASTATING WOUNDS]');
    });

    it('extracts "indirect fire" ability', () => {
      const result = cleanWeaponName('Mortarindirectfire');

      expect(result.name).toBe('Mortar');
      expect(result.abilities).toBe('[INDIRECT FIRE]');
    });

    it('extracts "heavy" ability when truly concatenated', () => {
      // Note: "Heavy bolter heavy" would be a false positive since "heavy" appears in the weapon name
      // The function works best when abilities are concatenated without spaces
      const result = cleanWeaponName('Lascannonheavy');

      expect(result.name).toBe('Lascannon');
      expect(result.abilities).toBe('[HEAVY]');
    });

    it('extracts "rapid fire" ability', () => {
      const result = cleanWeaponName('Bolt riflerapidfire');

      expect(result.name).toBe('Bolt rifle');
      expect(result.abilities).toBe('[RAPID FIRE]');
    });

    it('extracts "lethal hits" ability', () => {
      const result = cleanWeaponName('Power swordlethalhits');

      expect(result.name).toBe('Power sword');
      expect(result.abilities).toBe('[LETHAL HITS]');
    });

    it('extracts "lethal hits" multi-word ability when concatenated', () => {
      // Test multi-word ability extraction with truly concatenated input
      const result = cleanWeaponName('Relic bladelethalhits');

      expect(result.name).toBe('Relic blade');
      expect(result.abilities).toBe('[LETHAL HITS]');
    });

    it('extracts "torrent" ability', () => {
      const result = cleanWeaponName('Hand flamertorrent');

      expect(result.name).toBe('Hand flamer');
      expect(result.abilities).toBe('[TORRENT]');
    });

    it('extracts "melta" ability when truly concatenated', () => {
      // Multi-melta and meltagun are in the blocklist, so they won't be split
      const result = cleanWeaponName('Inferno cannonmelta');

      expect(result.name).toBe('Inferno cannon');
      expect(result.abilities).toBe('[MELTA]');
    });

    it('extracts "hazardous" ability', () => {
      const result = cleanWeaponName('Plasma cannonhazardous');

      expect(result.name).toBe('Plasma cannon');
      expect(result.abilities).toBe('[HAZARDOUS]');
    });

    it('extracts "precision" ability', () => {
      const result = cleanWeaponName('Sniper rifleprecision');

      expect(result.name).toBe('Sniper rifle');
      expect(result.abilities).toBe('[PRECISION]');
    });
  });

  describe('should NOT modify clean weapon names', () => {
    const cleanNames = [
      'Bolter',
      'Power sword',
      'Chainsword',
      'Bolt rifle',
      'Thunder hammer',
      'Storm bolter',
      'Lascannon',
      'Flamer',
      'Power fist',
      'Lightning claw',
      'Chitin-barbed limbs',
      'Close combat weapon',
      'Relic blade',
      'Force staff',
      'Chainfist',
    ];

    it.each(cleanNames)('should not modify: %s', (name) => {
      const result = cleanWeaponName(name);

      expect(result.name).toBe(name);
      expect(result.abilities).toBeNull();
    });
  });

  describe('should NOT split blocklisted compound weapon names', () => {
    // These weapon names contain ability keywords but are legitimate compound names
    // The blocklist prevents them from being incorrectly split
    const blocklistedNames = [
      ['Autopistol', 'Autopistol'],           // Contains "pistol" but is a valid weapon name
      ['Bolt pistol', 'Bolt pistol'],         // Contains "pistol" - space-separated, not concatenated
      ['Plasma pistol', 'Plasma pistol'],     // Contains "pistol" - space-separated
      ['Multi-melta', 'Multi-melta'],         // Contains "melta" but is a valid weapon name
      ['Melta gun', 'Melta gun'],             // Contains "melta" - space-separated
      ['Power lance', 'Power lance'],         // Contains "lance" - space-separated
    ];

    it.each(blocklistedNames)('should preserve: %s', (input, expected) => {
      const result = cleanWeaponName(input);

      expect(result.name).toBe(expected);
      expect(result.abilities).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = cleanWeaponName('');

      expect(result.name).toBe('');
      expect(result.abilities).toBeNull();
    });

    it('handles ability at start of name (should not match since idx must be > 0)', () => {
      // Abilities should only be detected after the weapon name (idx > 0)
      // Note: normalizeText adds space between lowercase and uppercase, so blastBolter → blast Bolter
      const result = cleanWeaponName('blastBolter');

      expect(result.name).toBe('blast Bolter');
      expect(result.abilities).toBeNull();
    });

    it('preserves weapon names with hyphens', () => {
      const result = cleanWeaponName('Twin-linked lascannon');

      expect(result.name).toBe('Twin-linked lascannon');
      expect(result.abilities).toBeNull();
    });

    it('does not extract space-separated abilities (only concatenated)', () => {
      // Space-separated abilities are NOT extracted - only truly concatenated ones
      const result = cleanWeaponName('Spore Mine launcher blast');

      expect(result.name).toBe('Spore Mine launcher blast');
      expect(result.abilities).toBeNull();
    });
  });
});

describe('WEAPON_ABILITY_KEYWORDS', () => {
  it('should include common weapon abilities', () => {
    const expectedAbilities = [
      'blast',
      'heavy',
      'melta',
      'torrent',
      'hazardous',
      'precision',
      'lance',
      'assault',
      'pistol',
      'psychic',
    ];

    for (const ability of expectedAbilities) {
      const found = WEAPON_ABILITY_KEYWORDS.some(
        (k) => k.toLowerCase().includes(ability.toLowerCase())
      );
      expect(found).toBe(true);
    }
  });

  it('should include concatenated versions of multi-word abilities', () => {
    // Check that both spaced and non-spaced versions exist
    expect(WEAPON_ABILITY_KEYWORDS).toContain('devastating wounds');
    expect(WEAPON_ABILITY_KEYWORDS).toContain('devastatingwounds');
    expect(WEAPON_ABILITY_KEYWORDS).toContain('indirect fire');
    expect(WEAPON_ABILITY_KEYWORDS).toContain('indirectfire');
    expect(WEAPON_ABILITY_KEYWORDS).toContain('lethal hits');
    expect(WEAPON_ABILITY_KEYWORDS).toContain('lethalhits');
    expect(WEAPON_ABILITY_KEYWORDS).toContain('sustained hits');
    expect(WEAPON_ABILITY_KEYWORDS).toContain('sustainedhits');
    expect(WEAPON_ABILITY_KEYWORDS).toContain('rapid fire');
    expect(WEAPON_ABILITY_KEYWORDS).toContain('rapidfire');
  });
});
