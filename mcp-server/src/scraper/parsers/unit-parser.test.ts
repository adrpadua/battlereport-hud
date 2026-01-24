import { describe, it, expect } from 'vitest';
import { parseDatasheets, cleanWeaponName, WEAPON_ABILITY_KEYWORDS } from './unit-parser.js';

describe('parseDatasheets', () => {
  const sourceUrl = 'https://wahapedia.ru/wh40k10ed/factions/space-marines/Intercessor-Squad';

  describe('unit name extraction', () => {
    it('extracts unit name from page title with dash separator', () => {
      const html = `
        <html>
          <head><title>Space Marines – Intercessor Squad</title></head>
          <body>
            <table>
              <tr><th>M</th><th>T</th><th>SV</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>6"</td><td>4</td><td>3+</td><td>2</td><td>6+</td><td>2</td></tr>
            </table>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      expect(result).toHaveLength(1);
      expect(result[0]?.unit.name).toBe('Intercessor Squad');
      expect(result[0]?.unit.slug).toBe('intercessor-squad');
    });

    it('extracts unit name from h1 when title unavailable', () => {
      const html = `
        <html>
          <body>
            <h1>Hive Tyrant</h1>
            <table>
              <tr><th>M</th><th>T</th><th>SV</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>8"</td><td>10</td><td>2+</td><td>10</td><td>7+</td><td>4</td></tr>
            </table>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      expect(result).toHaveLength(1);
      expect(result[0]?.unit.name).toBe('Hive Tyrant');
    });

    it('removes Wahapedia suffix from title', () => {
      const html = `
        <html>
          <head><title>Tyranids – Hive Tyrant – Wahapedia</title></head>
          <body>
            <table>
              <tr><th>M</th><th>T</th><th>SV</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>8"</td><td>10</td><td>2+</td><td>10</td><td>7+</td><td>4</td></tr>
            </table>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      expect(result[0]?.unit.name).toBe('Hive Tyrant');
    });

    it('returns empty array for names shorter than 3 characters', () => {
      const html = `
        <html>
          <head><title>Test – AB</title></head>
          <body>Content</body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      expect(result).toHaveLength(0);
    });
  });

  describe('unit stats extraction', () => {
    it('extracts stats from table with standard headers', () => {
      const html = `
        <html>
          <head><title>Space Marines – Intercessor Squad</title></head>
          <body>
            <table>
              <tr><th>M</th><th>T</th><th>SV</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>6"</td><td>4</td><td>3+</td><td>2</td><td>6+</td><td>2</td></tr>
            </table>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      expect(result[0]?.unit.movement).toBe('6"');
      expect(result[0]?.unit.toughness).toBe(4);
      expect(result[0]?.unit.save).toBe('3+');
      expect(result[0]?.unit.wounds).toBe(2);
      expect(result[0]?.unit.leadership).toBe(6);
      expect(result[0]?.unit.objectiveControl).toBe(2);
    });

    it('extracts stats with SAVE header variation', () => {
      const html = `
        <html>
          <head><title>Test – Test Unit</title></head>
          <body>
            <table>
              <tr><th>M</th><th>T</th><th>SAVE</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>10"</td><td>6</td><td>2+</td><td>12</td><td>7+</td><td>5</td></tr>
            </table>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      expect(result[0]?.unit.toughness).toBe(6);
      expect(result[0]?.unit.wounds).toBe(12);
    });
  });

  describe('invulnerable save extraction', () => {
    it('extracts invulnerable save from dedicated section', () => {
      const html = `
        <html>
          <head><title>Test – Test Unit</title></head>
          <body>
            <table>
              <tr><th>M</th><th>T</th><th>SV</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>6"</td><td>4</td><td>3+</td><td>2</td><td>6+</td><td>2</td></tr>
            </table>
            <div>INVULNERABLE SAVE 4+</div>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      expect(result[0]?.unit.invulnerableSave).toBe('4+');
    });

    it('extracts invulnerable save from ability text', () => {
      const html = `
        <html>
          <head><title>Test – Test Unit</title></head>
          <body>
            <table>
              <tr><th>M</th><th>T</th><th>SV</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>6"</td><td>4</td><td>3+</td><td>2</td><td>6+</td><td>2</td></tr>
            </table>
            <div>This model has a 5+ invulnerable save.</div>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      expect(result[0]?.unit.invulnerableSave).toBe('5+');
    });

    it('returns null when no invulnerable save present', () => {
      const html = `
        <html>
          <head><title>Test – Test Unit</title></head>
          <body>
            <table>
              <tr><th>M</th><th>T</th><th>SV</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>6"</td><td>4</td><td>3+</td><td>2</td><td>6+</td><td>2</td></tr>
            </table>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      expect(result[0]?.unit.invulnerableSave).toBeNull();
    });
  });

  describe('points cost extraction', () => {
    it('extracts points from table with model count', () => {
      const html = `
        <html>
          <head><title>Test – Test Unit</title></head>
          <body>
            <table>
              <tr><th>M</th><th>T</th><th>SV</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>6"</td><td>4</td><td>3+</td><td>2</td><td>6+</td><td>2</td></tr>
            </table>
            <table>
              <tr><td>5 models</td><td>90</td></tr>
            </table>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      expect(result[0]?.unit.pointsCost).toBe(90);
    });

    it('ignores invalid points costs outside valid range', () => {
      const html = `
        <html>
          <head><title>Test – Test Unit</title></head>
          <body>
            <table>
              <tr><th>M</th><th>T</th><th>SV</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>6"</td><td>4</td><td>3+</td><td>2</td><td>6+</td><td>2</td></tr>
            </table>
            <table>
              <tr><td>1 model</td><td>10</td></tr>
            </table>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      // 10 is below MIN_POINTS_COST (20), so should be null
      expect(result[0]?.unit.pointsCost).toBeNull();
    });
  });

  describe('keyword detection', () => {
    it('detects Epic Hero keyword', () => {
      const html = `
        <html>
          <head><title>Test – Marneus Calgar</title></head>
          <body>
            <table>
              <tr><th>M</th><th>T</th><th>SV</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>6"</td><td>6</td><td>2+</td><td>6</td><td>6+</td><td>1</td></tr>
            </table>
            <div>KEYWORDS: Infantry, Character, Epic Hero, Imperium</div>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      expect(result[0]?.unit.isEpicHero).toBe(true);
    });

    it('detects Battleline keyword', () => {
      const html = `
        <html>
          <head><title>Test – Intercessor Squad</title></head>
          <body>
            <table>
              <tr><th>M</th><th>T</th><th>SV</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>6"</td><td>4</td><td>3+</td><td>2</td><td>6+</td><td>2</td></tr>
            </table>
            <div>KEYWORDS: Infantry, Battleline, Imperium</div>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      expect(result[0]?.unit.isBattleline).toBe(true);
    });

    it('detects Dedicated Transport keyword', () => {
      const html = `
        <html>
          <head><title>Test – Rhino</title></head>
          <body>
            <table>
              <tr><th>M</th><th>T</th><th>SV</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>12"</td><td>9</td><td>3+</td><td>10</td><td>6+</td><td>2</td></tr>
            </table>
            <div>KEYWORDS: Vehicle, Dedicated Transport, Smoke</div>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      expect(result[0]?.unit.isDedicatedTransport).toBe(true);
    });

    it('returns false for keywords not present', () => {
      const html = `
        <html>
          <head><title>Test – Basic Unit</title></head>
          <body>
            <table>
              <tr><th>M</th><th>T</th><th>SV</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>6"</td><td>4</td><td>3+</td><td>2</td><td>6+</td><td>2</td></tr>
            </table>
            <div>KEYWORDS: Infantry, Imperium</div>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      expect(result[0]?.unit.isEpicHero).toBe(false);
      expect(result[0]?.unit.isBattleline).toBe(false);
      expect(result[0]?.unit.isDedicatedTransport).toBe(false);
    });
  });

  describe('weapons extraction', () => {
    it('extracts ranged weapons from table', () => {
      const html = `
        <html>
          <head><title>Test – Test Unit</title></head>
          <body>
            <table>
              <tr><th>M</th><th>T</th><th>SV</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>6"</td><td>4</td><td>3+</td><td>2</td><td>6+</td><td>2</td></tr>
            </table>
            <table>
              <tr><th>RANGED WEAPONS</th><th>RANGE</th><th>A</th><th>BS</th><th>S</th><th>AP</th><th>D</th></tr>
              <tr><td>Bolt rifle</td><td>24"</td><td>2</td><td>3+</td><td>4</td><td>-1</td><td>1</td></tr>
            </table>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      expect(result[0]?.weapons).toHaveLength(1);
      expect(result[0]?.weapons[0]).toMatchObject({
        name: 'Bolt rifle',
        weaponType: 'ranged',
        range: '24"',
        attacks: '2',
        skill: '3+',
        strength: '4',
        armorPenetration: '-1',
        damage: '1',
      });
    });

    it('extracts melee weapons from table', () => {
      const html = `
        <html>
          <head><title>Test – Test Unit</title></head>
          <body>
            <table>
              <tr><th>M</th><th>T</th><th>SV</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>6"</td><td>4</td><td>3+</td><td>2</td><td>6+</td><td>2</td></tr>
            </table>
            <table>
              <tr><th>MELEE WEAPONS</th><th>RANGE</th><th>A</th><th>WS</th><th>S</th><th>AP</th><th>D</th></tr>
              <tr><td>Power sword</td><td>Melee</td><td>4</td><td>3+</td><td>5</td><td>-2</td><td>1</td></tr>
            </table>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      expect(result[0]?.weapons).toHaveLength(1);
      expect(result[0]?.weapons[0]).toMatchObject({
        name: 'Power sword',
        weaponType: 'melee',
        range: 'Melee',
      });
    });

    it('deduplicates weapons by name', () => {
      const html = `
        <html>
          <head><title>Test – Test Unit</title></head>
          <body>
            <table>
              <tr><th>M</th><th>T</th><th>SV</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>6"</td><td>4</td><td>3+</td><td>2</td><td>6+</td><td>2</td></tr>
            </table>
            <table>
              <tr><th>RANGED WEAPONS</th><th>RANGE</th><th>A</th><th>BS</th><th>S</th><th>AP</th><th>D</th></tr>
              <tr><td>Bolt rifle</td><td>24"</td><td>2</td><td>3+</td><td>4</td><td>-1</td><td>1</td></tr>
              <tr><td>Bolt rifle</td><td>24"</td><td>2</td><td>3+</td><td>4</td><td>-1</td><td>1</td></tr>
            </table>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      expect(result[0]?.weapons).toHaveLength(1);
    });
  });

  describe('abilities extraction', () => {
    it('extracts CORE abilities', () => {
      const html = `
        <html>
          <head><title>Test – Test Unit</title></head>
          <body>
            <table>
              <tr><th>M</th><th>T</th><th>SV</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>6"</td><td>4</td><td>3+</td><td>2</td><td>6+</td><td>2</td></tr>
            </table>
            <b>CORE: Leader, Deep Strike</b>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      expect(result[0]?.abilities.length).toBeGreaterThan(0);
      const coreAbilities = result[0]?.abilities.filter((a) => a.abilityType === 'core');
      expect(coreAbilities?.some((a) => a.name === 'Leader')).toBe(true);
      expect(coreAbilities?.some((a) => a.name === 'Deep Strike')).toBe(true);
    });

    it('extracts FACTION abilities', () => {
      const html = `
        <html>
          <head><title>Test – Test Unit</title></head>
          <body>
            <table>
              <tr><th>M</th><th>T</th><th>SV</th><th>W</th><th>LD</th><th>OC</th></tr>
              <tr><td>6"</td><td>4</td><td>3+</td><td>2</td><td>6+</td><td>2</td></tr>
            </table>
            <b>FACTION: Oath of Moment</b>
          </body>
        </html>
      `;

      const result = parseDatasheets(html, sourceUrl);

      const factionAbilities = result[0]?.abilities.filter((a) => a.abilityType === 'faction');
      expect(factionAbilities?.some((a) => a.name === 'Oath of Moment')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for non-unit content', () => {
      const html = '<html><body>Some non-unit content</body></html>';
      const result = parseDatasheets(html, sourceUrl);

      expect(result).toHaveLength(0);
    });

    it('handles malformed HTML gracefully', () => {
      const html = '<html><head><title>Test – Unit Name</title><body><table><tr><th>M<td>6"';

      const result = parseDatasheets(html, sourceUrl);

      // Cheerio handles malformed HTML, should not throw
      expect(result).toBeDefined();
    });

    it('handles empty HTML', () => {
      const result = parseDatasheets('', sourceUrl);

      expect(result).toHaveLength(0);
    });
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
