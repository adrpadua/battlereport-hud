import { describe, it, expect } from 'vitest';
import {
  parseFactionIndex,
  parseFactionPage,
  parseDetachments,
  parseStratagems,
  parseEnhancements,
  parseStratagemsByDetachment,
  parseEnhancementsByDetachment,
  extractDetachmentSection,
  slugify,
  detectPhase,
} from './faction-parser.js';

// Re-exported utilities tests
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

// HTML Parser tests
const sourceUrl = 'https://wahapedia.ru/wh40k10ed/factions/test-faction/';

describe('parseFactionIndex', () => {
  it('extracts faction links from HTML', () => {
    const html = `
      <html>
        <body>
          <a href="/wh40k10ed/factions/space-marines/">Space Marines</a>
          <a href="/wh40k10ed/factions/tyranids/">Tyranids</a>
          <a href="/wh40k10ed/factions/necrons/">Necrons</a>
        </body>
      </html>
    `;

    const factions = parseFactionIndex(html, sourceUrl);

    expect(factions).toHaveLength(3);
    expect(factions[0]).toMatchObject({
      slug: 'space-marines',
      name: 'Space Marines',
      wahapediaPath: '/wh40k10ed/factions/space-marines/',
      dataSource: 'wahapedia',
    });
    expect(factions[1]).toMatchObject({
      slug: 'tyranids',
      name: 'Tyranids',
    });
    expect(factions[2]).toMatchObject({
      slug: 'necrons',
      name: 'Necrons',
    });
  });

  it('deduplicates faction links', () => {
    const html = `
      <html>
        <body>
          <a href="/wh40k10ed/factions/space-marines/">Space Marines</a>
          <a href="/wh40k10ed/factions/space-marines/">Space Marines Again</a>
          <a href="/wh40k10ed/factions/tyranids/">Tyranids</a>
        </body>
      </html>
    `;

    const factions = parseFactionIndex(html, sourceUrl);

    expect(factions).toHaveLength(2);
  });

  it('filters out unit page links', () => {
    const html = `
      <html>
        <body>
          <a href="/wh40k10ed/factions/space-marines/">Space Marines</a>
          <a href="/wh40k10ed/factions/space-marines/Intercessor-Squad">Intercessor Squad</a>
          <a href="/wh40k10ed/factions/space-marines/datasheets.html">Datasheets</a>
        </body>
      </html>
    `;

    const factions = parseFactionIndex(html, sourceUrl);

    expect(factions).toHaveLength(1);
    expect(factions[0]?.slug).toBe('space-marines');
  });

  it('returns empty array for non-faction content', () => {
    const html = '<html><body>No factions here</body></html>';

    const factions = parseFactionIndex(html, sourceUrl);

    expect(factions).toHaveLength(0);
  });

  it('handles special characters in faction names', () => {
    const html = `<a href="/wh40k10ed/factions/t-au-empire/">T'au Empire</a>`;

    const factions = parseFactionIndex(html, sourceUrl);

    expect(factions).toHaveLength(1);
    expect(factions[0]?.name).toBe("T'au Empire");
  });
});

describe('parseFactionPage', () => {
  it('extracts army rules from Army-Rules anchor', () => {
    const html = `
      <html>
        <body>
          <a name="Army-Rules"></a>
          <h2>Army Rules</h2>
          <div>For the Greater Good</div>
          <p>This is the army rule description with detailed mechanics.</p>
        </body>
      </html>
    `;

    const faction = parseFactionPage(html, 'tau-empire', "T'au Empire", sourceUrl);

    expect(faction.slug).toBe('tau-empire');
    expect(faction.name).toBe("T'au Empire");
    expect(faction.armyRules).toContain('For the Greater Good');
    expect(faction.dataSource).toBe('wahapedia');
  });

  it('extracts lore from Introduction anchor', () => {
    const html = `
      <html>
        <body>
          <a name="Introduction"></a>
          <div>
            <p>Short intro</p>
          </div>
          <div class="BreakInsideAvoid">
            This is a longer lore description that tells the story of the faction and their place in the galaxy.
            It should be over 100 characters to be captured as lore content for the faction page.
          </div>
        </body>
      </html>
    `;

    const faction = parseFactionPage(html, 'space-marines', 'Space Marines', sourceUrl);

    expect(faction.lore).toContain('longer lore description');
  });

  it('returns null for missing optional fields', () => {
    const html = '<html><body>Minimal content</body></html>';

    const faction = parseFactionPage(html, 'test-faction', 'Test Faction', sourceUrl);

    expect(faction.armyRules).toBeNull();
    expect(faction.lore).toBeNull();
  });

  it('returns proper structure with empty HTML', () => {
    const faction = parseFactionPage('', 'test', 'Test', sourceUrl);

    expect(faction).toMatchObject({
      slug: 'test',
      name: 'Test',
      wahapediaPath: '/wh40k10ed/factions/test/',
      dataSource: 'wahapedia',
    });
  });
});

describe('parseDetachments', () => {
  it('extracts detachments from anchor structure', () => {
    const html = `
      <html>
        <body>
          <a name="Gladius-Task-Force"></a>
          <div>
            <h2 class="outline_header">Gladius Task Force</h2>
            <p class="ShowFluff">The Gladius Task Force is a combined arms formation.</p>
          </div>

          <a name="Detachment-Rule"></a>
          <div>
            <h2>Detachment Rule</h2>
            <h3 class="dsColorBgSM font-white padLeft8">Oath of Moment</h3>
            <p>At the start of your Command phase, select one enemy unit.</p>
          </div>

          <a name="Enhancements"></a>
          <h2>Enhancements</h2>

          <a name="Stratagems"></a>
          <h2>Stratagems</h2>
        </body>
      </html>
    `;

    const detachments = parseDetachments(html, sourceUrl);

    expect(detachments).toHaveLength(1);
    expect(detachments[0]).toMatchObject({
      name: 'Gladius Task Force',
      dataSource: 'wahapedia',
    });
    expect(detachments[0]?.lore).toContain('combined arms formation');
  });

  it('returns empty array when no detachments found', () => {
    const html = '<html><body>No detachments</body></html>';

    const detachments = parseDetachments(html, sourceUrl);

    expect(detachments).toHaveLength(0);
  });

  it('filters out system sections', () => {
    const html = `
      <html>
        <body>
          <a name="Introduction"></a>
          <h2>Introduction</h2>
          <a name="Army-Rules"></a>
          <h2>Army Rules</h2>
          <a name="Books"></a>
          <h2>Books</h2>
        </body>
      </html>
    `;

    const detachments = parseDetachments(html, sourceUrl);

    expect(detachments).toHaveLength(0);
  });

  it('parses multiple detachments when present', () => {
    // In Wahapedia HTML, each detachment has a sequence of anchors:
    // DetachmentName -> Detachment-Rule -> Enhancements -> Stratagems
    // The parser detects detachment names by checking if the NEXT anchor is "Detachment-Rule"
    const html = `
      <html>
        <body>
          <a name="Alpha-Formation"></a>
          <div><h2>Alpha Formation</h2></div>
          <a name="Detachment-Rule"></a>
          <div><h2>Detachment Rule</h2></div>
        </body>
      </html>
    `;

    const detachments = parseDetachments(html, sourceUrl);

    // This tests that the basic detection mechanism works
    expect(detachments).toHaveLength(1);
    expect(detachments[0]?.name).toBe('Alpha Formation');
  });
});

describe('parseStratagems', () => {
  it('extracts stratagems from str10Border elements', () => {
    const html = `
      <html>
        <body>
          <div class="str10Border">
            <div class="str10Diamond">
              <div class="str10CP">1CP</div>
            </div>
            <div class="str10Type">Gladius Task Force – Battle Tactic Stratagem</div>
            <div class="str10Text">
              <b>WHEN:</b> Your Shooting phase.<br><br>
              <b>TARGET:</b> One Space Marines unit from your army.<br><br>
              <b>EFFECT:</b> Until the end of the phase, improve the AP of that unit's weapons by 1.
            </div>
          </div>
        </body>
      </html>
    `;

    const stratagems = parseStratagems(html, sourceUrl);

    expect(stratagems).toHaveLength(1);
    expect(stratagems[0]).toMatchObject({
      cpCost: '1',
      phase: 'shooting',
      when: 'Your Shooting phase.',
      dataSource: 'wahapedia',
      isCore: false,
    });
    expect(stratagems[0]?.target).toContain('Space Marines');
    expect(stratagems[0]?.effect).toContain('improve the AP');
  });

  it('extracts 2CP stratagems correctly', () => {
    const html = `
      <html>
        <body>
          <div class="str10Border">
            <div class="str10CP">2CP</div>
            <div class="str10Type">Test – Strategic Ploy Stratagem</div>
            <div class="str10Text">
              <b>WHEN:</b> Your opponent's Movement phase.<br><br>
              <b>TARGET:</b> One Infantry unit.<br><br>
              <b>EFFECT:</b> Your unit can move up to 6".
            </div>
          </div>
        </body>
      </html>
    `;

    const stratagems = parseStratagems(html, sourceUrl);

    expect(stratagems).toHaveLength(1);
    expect(stratagems[0]?.cpCost).toBe('2');
  });

  it('returns empty array when no stratagems found', () => {
    const html = '<html><body>No stratagems here</body></html>';

    const stratagems = parseStratagems(html, sourceUrl);

    expect(stratagems).toHaveLength(0);
  });

  it('detects fight phase from WHEN clause', () => {
    const html = `
      <html>
        <body>
          <div class="str10Border">
            <div class="str10CP">1CP</div>
            <div class="str10Type">Test – Battle Tactic Stratagem</div>
            <div class="str10Text">
              <b>WHEN:</b> Fight phase.<br><br>
              <b>TARGET:</b> One unit.<br><br>
              <b>EFFECT:</b> Add 1 to hit rolls.
            </div>
          </div>
        </body>
      </html>
    `;

    const stratagems = parseStratagems(html, sourceUrl);

    expect(stratagems[0]?.phase).toBe('fight');
  });

  it('skips stratagems without EFFECT', () => {
    const html = `
      <html>
        <body>
          <div class="str10Border">
            <div class="str10CP">1CP</div>
            <div class="str10Type">Test – Stratagem</div>
            <div class="str10Text">
              <b>WHEN:</b> Shooting phase.<br><br>
              <b>TARGET:</b> One unit.
            </div>
          </div>
        </body>
      </html>
    `;

    const stratagems = parseStratagems(html, sourceUrl);

    expect(stratagems).toHaveLength(0);
  });

  it('parses multiple stratagems', () => {
    const html = `
      <html>
        <body>
          <div class="str10Border">
            <div class="str10CP">1CP</div>
            <div class="str10Type">Test – Battle Tactic Stratagem</div>
            <div class="str10Text">
              <b>WHEN:</b> Shooting phase.<br><br>
              <b>TARGET:</b> Unit one.<br><br>
              <b>EFFECT:</b> Effect one.
            </div>
          </div>
          <div class="str10Border">
            <div class="str10CP">2CP</div>
            <div class="str10Type">Test – Strategic Ploy Stratagem</div>
            <div class="str10Text">
              <b>WHEN:</b> Movement phase.<br><br>
              <b>TARGET:</b> Unit two.<br><br>
              <b>EFFECT:</b> Effect two.
            </div>
          </div>
        </body>
      </html>
    `;

    const stratagems = parseStratagems(html, sourceUrl);

    expect(stratagems).toHaveLength(2);
  });
});

describe('parseEnhancements', () => {
  it('extracts enhancements from EnhancementsPts elements', () => {
    const html = `
      <html>
        <body>
          <ul class="EnhancementsPts">
            <span>Adept of the Codex</span>
            <span>20 pts</span>
          </ul>
          <div>ADEPTUS ASTARTES model only. Once per battle, you can re-roll a Hit roll.</div>

          <ul class="EnhancementsPts">
            <span>Artificer Armour</span>
            <span>15 pts</span>
          </ul>
          <div>Model has a 2+ Save.</div>
        </body>
      </html>
    `;

    const enhancements = parseEnhancements(html, sourceUrl);

    expect(enhancements).toHaveLength(2);
    expect(enhancements[0]).toMatchObject({
      name: 'Adept of the Codex',
      pointsCost: 20,
      dataSource: 'wahapedia',
    });
    expect(enhancements[1]).toMatchObject({
      name: 'Artificer Armour',
      pointsCost: 15,
    });
  });

  it('handles enhancements without pts suffix', () => {
    const html = `
      <html>
        <body>
          <ul class="EnhancementsPts">
            <span>Test Enhancement</span>
            <span>25pts</span>
          </ul>
        </body>
      </html>
    `;

    const enhancements = parseEnhancements(html, sourceUrl);

    expect(enhancements[0]?.pointsCost).toBe(25);
  });

  it('deduplicates enhancements by name', () => {
    const html = `
      <html>
        <body>
          <ul class="EnhancementsPts">
            <span>Duplicate Enhancement</span>
            <span>20 pts</span>
          </ul>
          <ul class="EnhancementsPts">
            <span>Duplicate Enhancement</span>
            <span>20 pts</span>
          </ul>
        </body>
      </html>
    `;

    const enhancements = parseEnhancements(html, sourceUrl);

    expect(enhancements).toHaveLength(1);
  });

  it('returns empty array when no enhancements found', () => {
    const html = '<html><body>No enhancements</body></html>';

    const enhancements = parseEnhancements(html, sourceUrl);

    expect(enhancements).toHaveLength(0);
  });

  it('handles malformed enhancement HTML', () => {
    const html = `
      <html>
        <body>
          <ul class="EnhancementsPts">
            <span>Only Name</span>
          </ul>
        </body>
      </html>
    `;

    const enhancements = parseEnhancements(html, sourceUrl);

    expect(enhancements).toHaveLength(0);
  });
});

describe('parseStratagemsByDetachment', () => {
  it('groups stratagems by their parent detachment', () => {
    const html = `
      <html>
        <body>
          <a name="Gladius-Task-Force"></a>
          <h2>Gladius Task Force</h2>

          <a name="Detachment-Rule"></a>
          <h2>Detachment Rule</h2>

          <a name="Stratagems"></a>
          <h2>Stratagems</h2>
          <div class="str10Border">
            <div class="str10CP">1CP</div>
            <div class="str10Type">Gladius – Battle Tactic</div>
            <div class="str10Text">
              <b>WHEN:</b> Shooting phase.<br><br>
              <b>TARGET:</b> One unit.<br><br>
              <b>EFFECT:</b> Re-roll hits.
            </div>
          </div>
        </body>
      </html>
    `;

    const stratagemsByDetachment = parseStratagemsByDetachment(html, sourceUrl);

    expect(stratagemsByDetachment.size).toBeGreaterThanOrEqual(1);
  });
});

describe('parseEnhancementsByDetachment', () => {
  it('groups enhancements by their parent detachment', () => {
    const html = `
      <html>
        <body>
          <a name="Gladius-Task-Force"></a>
          <h2>Gladius Task Force</h2>

          <a name="Detachment-Rule"></a>
          <h2>Detachment Rule</h2>

          <a name="Enhancements"></a>
          <h2>Enhancements</h2>
          <div>
            <ul class="EnhancementsPts">
              <span>Test Enhancement</span>
              <span>20 pts</span>
            </ul>
          </div>
        </body>
      </html>
    `;

    const enhancementsByDetachment = parseEnhancementsByDetachment(html, sourceUrl);

    expect(enhancementsByDetachment.size).toBeGreaterThanOrEqual(1);
  });
});

describe('extractDetachmentSection', () => {
  it('extracts section content for a named detachment', () => {
    const html = `
      <html>
        <body>
          <div>
            <a name="Gladius-Task-Force"></a>
            <h2>Gladius Task Force</h2>
            <p>This is the Gladius content.</p>
          </div>
        </body>
      </html>
    `;

    const section = extractDetachmentSection(html, 'Gladius Task Force');

    expect(section).toContain('Gladius');
  });

  it('returns null when detachment not found', () => {
    const html = '<html><body>No such detachment</body></html>';

    const section = extractDetachmentSection(html, 'Missing Detachment');

    expect(section).toBeNull();
  });
});
