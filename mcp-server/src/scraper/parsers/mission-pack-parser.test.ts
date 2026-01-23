import { describe, it, expect } from 'vitest';
import { parseMissionPack, detectMissionPackType } from './mission-pack-parser.js';

const sourceUrl = 'https://wahapedia.ru/wh40k10ed/chapter-approved/';

describe('detectMissionPackType', () => {
  it('detects chapter_approved_2025 from URL', () => {
    expect(detectMissionPackType('https://wahapedia.ru/wh40k10ed/chapter-approved-2025-26/missions/')).toBe('chapter_approved_2025');
  });

  it('detects chapter_approved from URL', () => {
    expect(detectMissionPackType('https://wahapedia.ru/wh40k10ed/chapter-approved/missions/')).toBe('chapter_approved');
  });

  it('detects pariah_nexus from URL', () => {
    expect(detectMissionPackType('https://wahapedia.ru/wh40k10ed/pariah-nexus/missions/')).toBe('pariah_nexus');
  });

  it('detects leviathan from URL', () => {
    expect(detectMissionPackType('https://wahapedia.ru/wh40k10ed/leviathan/missions/')).toBe('leviathan');
  });

  it('defaults to matched_play for unknown URLs', () => {
    expect(detectMissionPackType('https://wahapedia.ru/wh40k10ed/other/missions/')).toBe('matched_play');
  });

  it('handles empty URL', () => {
    expect(detectMissionPackType('')).toBe('matched_play');
  });

  it('prioritizes chapter_approved_2025 over chapter_approved', () => {
    const url = 'https://wahapedia.ru/wh40k10ed/chapter-approved-2025-26/missions/';
    expect(detectMissionPackType(url)).toBe('chapter_approved_2025');
  });
});

describe('parseMissionPack', () => {
  describe('parsePrimaryMissions (via parseMissionPack)', () => {
    it('extracts mission from div with mission class', () => {
      const html = `
        <div class="mission-card">
          <h3>TAKE AND HOLD</h3>
          <p>Secure the objectives and hold them against the enemy.</p>
          <p>SECOND BATTLE ROUND ONWARDS</p>
          <p>Score 4VP if you control one objective.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.missions).toHaveLength(1);
      expect(result.missions[0]?.name).toBe('Take And Hold');
      expect(result.missions[0]?.slug).toBe('take-and-hold');
      expect(result.missions[0]?.missionType).toBe('chapter_approved');
      expect(result.missions[0]?.dataSource).toBe('wahapedia');
    });

    it('extracts mission from div with Mission in class name', () => {
      const html = `
        <div class="PrimaryMission">
          <h4>BATTLEFIELD SUPREMACY</h4>
          <p>Control the battlefield through superior tactics.</p>
          <p>Score 4VP if you control more objectives than your opponent.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.missions).toHaveLength(1);
      expect(result.missions[0]?.name).toBe('Battlefield Supremacy');
    });

    it('extracts VP scoring rules', () => {
      const html = `
        <div class="mission">
          <b>RECOVER ASSETS</b>
          <p>Score 4VP if you control one objective at end of turn.</p>
          <p>Score 8VP if you control three or more objectives.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.missions).toHaveLength(1);
      expect(result.missions[0]?.primaryObjective).toContain('4VP');
      expect(result.missions[0]?.primaryObjective).toContain('8VP');
    });

    it('handles action definitions', () => {
      const html = `
        <div class="mission">
          <b>SECURE INTEL</b>
          <p>Recover vital intelligence from the battlefield.</p>
          <p>(ACTION) One unit can perform this action while within range of an objective.</p>
          <p>Score 3VP per completed action.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.missions).toHaveLength(1);
      expect(result.missions[0]?.missionRule).toContain('ACTION');
    });

    it('extracts missions from list items with Primary Mission', () => {
      const html = `
        <ul>
          <li class="primary-mission">
            <b>DEFEND STRONGHOLD</b>
            <p>Score 4VP if you control one or more objective markers in your deployment zone.</p>
          </li>
        </ul>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.missions).toHaveLength(1);
      expect(result.missions[0]?.name).toBe('Defend Stronghold');
    });

    it('deduplicates missions with same name', () => {
      const html = `
        <div class="mission">
          <h3>RECOVER ASSETS</h3>
          <p>First version of the mission with some content here.</p>
        </div>
        <div class="mission">
          <h3>RECOVER ASSETS</h3>
          <p>Duplicate that should be skipped from parsing.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.missions).toHaveLength(1);
    });

    it('skips cards with content shorter than 20 characters', () => {
      // Use compact HTML to avoid whitespace padding the length
      const html = '<div class="mission"><h3>SHORT</h3><p>Tiny</p></div>';

      const result = parseMissionPack(html, sourceUrl);

      expect(result.missions).toHaveLength(0);
    });

    it('uses custom missionType when provided', () => {
      const html = `
        <div class="mission">
          <h3>AREA DENIAL</h3>
          <p>Score 5VP if no enemy models are within range of any objective markers.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl, 'pariah_nexus');

      expect(result.missions[0]?.missionType).toBe('pariah_nexus');
    });

    it('returns empty array when no mission cards found', () => {
      const html = `
        <div class="some-other-content">
          <p>No mission cards here.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.missions).toHaveLength(0);
    });
  });

  describe('parseSecondaryMissions (via parseMissionPack)', () => {
    it('extracts secondary objectives from div elements', () => {
      const html = `
        <div class="secondary-mission">
          <h3>ASSASSINATION</h3>
          <p>Eliminate the enemy's leaders.</p>
          <p>Score 4VP each time an enemy CHARACTER model is destroyed.</p>
          <p>Maximum: 12VP</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.secondaryObjectives).toHaveLength(1);
      expect(result.secondaryObjectives[0]?.name).toBe('Assassination');
      expect(result.secondaryObjectives[0]?.slug).toBe('assassination');
      expect(result.secondaryObjectives[0]?.maxPoints).toBe(12);
    });

    it('extracts secondary from div with Secondary in class', () => {
      const html = `
        <div class="SecondaryCard">
          <b>DEPLOY TELEPORT HOMERS</b>
          <p>Score 2VP each time a model completes a Deploy Teleport Homer action.</p>
          <p>Maximum: 8VP</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.secondaryObjectives).toHaveLength(1);
      expect(result.secondaryObjectives[0]?.name).toBe('Deploy Teleport Homers');
      expect(result.secondaryObjectives[0]?.maxPoints).toBe(8);
    });

    it('detects tactical category by default', () => {
      const html = `
        <div class="secondary">
          <h3>ENGAGE ON ALL FRONTS</h3>
          <p>Spread your forces across the battlefield.</p>
          <p>Score 3VP if you have units in three or more table quarters.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.secondaryObjectives).toHaveLength(1);
      expect(result.secondaryObjectives[0]?.category).toBe('tactical');
    });

    it('detects fixed category', () => {
      const html = `
        <div class="secondary">
          <h3>FIXED OBJECTIVE</h3>
          <p>This is a Fixed Mission that can only be used in certain ways.</p>
          <p>Score 5VP for completing the fixed objective.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.secondaryObjectives).toHaveLength(1);
      expect(result.secondaryObjectives[0]?.category).toBe('fixed');
    });

    it('detects both category when FIXED and TACTICAL present', () => {
      const html = `
        <div class="secondary">
          <h4>FLEXIBLE MISSION</h4>
          <p>This can be used as FIXED or TACTICAL depending on the situation.</p>
          <p>Score 5VP for completing this objective.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.secondaryObjectives).toHaveLength(1);
      expect(result.secondaryObjectives[0]?.category).toBe('both');
    });

    it('extracts scoring condition when WHEN marker present', () => {
      const html = `
        <div class="secondary">
          <b>ENGAGE ON ALL FRONTS</b>
          <p><b>WHEN:</b> At the end of your turn</p>
          <p>Score 3VP if you have units in 3+ table quarters.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.secondaryObjectives).toHaveLength(1);
      expect(result.secondaryObjectives[0]?.scoringCondition).toContain('At the end of your turn');
    });

    it('extracts max points from highest VP value', () => {
      const html = `
        <div class="secondary">
          <h4>HIGH VALUE TARGET</h4>
          <p>Destroy enemy units worth the most points.</p>
          <p>Score 5VP for each destroyed vehicle.</p>
          <p>Score up to 15VP for destroying expensive units.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.secondaryObjectives).toHaveLength(1);
      expect(result.secondaryObjectives[0]?.maxPoints).toBe(15);
    });

    it('deduplicates secondary objectives by name', () => {
      const html = `
        <div class="secondary">
          <h3>ASSASSINATION</h3>
          <p>Score 4VP per CHARACTER destroyed that you kill.</p>
        </div>
        <div class="secondary">
          <h3>ASSASSINATION</h3>
          <p>Duplicate entry that should be skipped from parsing.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.secondaryObjectives).toHaveLength(1);
    });

    it('returns empty array when no secondary cards found', () => {
      const html = `
        <div class="primary-mission">
          <h3>PRIMARY ONLY</h3>
          <p>This is not a secondary objective so should not parse.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.secondaryObjectives).toHaveLength(0);
    });
  });

  describe('parseChallengers/gambits (via parseMissionPack)', () => {
    it('extracts gambit cards from challenger elements', () => {
      const html = `
        <div class="challenger-card">
          <h3>Risk It All</h3>
          <p><b>WHEN:</b> Start of the battle round</p>
          <p><b>EFFECT:</b> Double VP scored this turn, but lose 5VP if objective not achieved.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.gambits).toHaveLength(1);
      expect(result.gambits[0]?.name).toBe('Risk It All');
      expect(result.gambits[0]?.timing).toContain('Start of the battle round');
      expect(result.gambits[0]?.effect).toContain('Double VP');
    });

    it('extracts gambit from .gambit class elements', () => {
      const html = `
        <div class="gambit">
          <b>Double Down</b>
          <p><b>WHEN:</b> Command phase</p>
          <p><b>EFFECT:</b> Your primary objective scores double this turn.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.gambits).toHaveLength(1);
      expect(result.gambits[0]?.name).toBe('Double Down');
    });

    it('extracts timing from WHEN marker', () => {
      const html = `
        <div class="Challenger">
          <h4>Bold Advance</h4>
          <p><b>WHEN:</b> Start of your Movement phase</p>
          <p><b>EFFECT:</b> One unit can move up to 6 inches before the phase begins.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.gambits).toHaveLength(1);
      expect(result.gambits[0]?.timing).toContain('Start of your Movement phase');
    });

    it('extracts effect from EFFECT marker', () => {
      const html = `
        <div class="challenger">
          <h4>Daring Strike</h4>
          <p><b>WHEN:</b> Charge phase</p>
          <p><b>EFFECT:</b> One unit can declare a charge even if it Advanced this turn.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.gambits).toHaveLength(1);
      expect(result.gambits[0]?.effect).toContain('declare a charge');
    });

    it('handles challengers without explicit WHEN/EFFECT format', () => {
      const html = `
        <div class="challenger">
          <h4>Simple Card</h4>
          <p>A straightforward effect that just does something useful.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.gambits).toHaveLength(1);
      expect(result.gambits[0]?.name).toBe('Simple Card');
      expect(result.gambits[0]?.timing).toBe('');
    });

    it('deduplicates gambits by name', () => {
      const html = `
        <div class="challenger">
          <h3>Risk It All</h3>
          <p>First version of the gambit card with content.</p>
        </div>
        <div class="challenger">
          <h3>Risk It All</h3>
          <p>Duplicate that should be skipped from the parsing.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.gambits).toHaveLength(1);
    });

    it('returns empty array when no challenger cards found', () => {
      const html = `
        <div class="mission">
          <h3>MISSION CARD</h3>
          <p>This is not a challenger card so should not be parsed.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.gambits).toHaveLength(0);
    });
  });

  describe('parseMatchedPlayRules (via parseMissionPack)', () => {
    it('extracts rules from anchor-based sections', () => {
      const html = `
        <div>
          <a name="Muster-Armies"></a>
          <p>Each player must bring an army with a Power Level of 100 or less.</p>
          <p>Army construction follows standard Matched Play rules with modifications.</p>
          <p>Additional rule text here to meet minimum length requirements.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0]?.title).toBe('Muster Armies');
      expect(result.rules[0]?.category).toBe('army_construction');
      expect(result.rules[0]?.content).toContain('Power Level');
    });

    it('extracts rules from heading-based sections', () => {
      const html = `
        <div>
          <h3>Chapter Approved Battles</h3>
          <p>This section details how to play a Chapter Approved mission. Follow these steps in order.</p>
          <p>Additional content to ensure minimum content length is met for extraction.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0]?.category).toBe('battle_sequence');
    });

    it('extracts multiple rule sections', () => {
      const html = `
        <div>
          <a name="Muster-Armies"></a>
          <p>Muster your armies following these guidelines. Each player brings an army of 2000 points.</p>
          <p>Additional army construction content here to meet length.</p>
        </div>
        <div>
          <a name="Deploy-Armies"></a>
          <p>Deploy your armies in your deployment zone. The Attacker deploys first unless specified.</p>
          <p>Additional deployment content here to meet length requirement.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.rules).toHaveLength(2);
      expect(result.rules.map((r) => r.category)).toContain('army_construction');
      expect(result.rules.map((r) => r.category)).toContain('deployment');
    });

    it('extracts Set Mission Parameters rules', () => {
      const html = `
        <div>
          <a name="Set-Mission-Parameters"></a>
          <p>Both players agree on the battle size and mission parameters before selecting armies.</p>
          <p>Points limit is typically 2000 for Strike Force games in matched play.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      const missionParamsRule = result.rules.find((r) => r.category === 'mission_parameters');
      expect(missionParamsRule).toBeDefined();
      expect(missionParamsRule?.title).toBe('Set Mission Parameters');
    });

    it('extracts Terrain Layouts rules', () => {
      const html = `
        <div>
          <a name="Terrain-Layout"></a>
          <p>Use the terrain layout maps provided for competitive play and tournament settings.</p>
          <p>Each layout is designed for balanced gameplay and fair competition.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      const terrainRule = result.rules.find((r) => r.category === 'terrain_layouts');
      expect(terrainRule).toBeDefined();
      expect(terrainRule?.content).toContain('terrain layout');
    });

    it('skips rules with content under 50 characters', () => {
      const html = `
        <div>
          <a name="Muster-Armies"></a>
          <p>Short.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.rules).toHaveLength(0);
    });

    it('returns empty array when no rule sections found', () => {
      const html = `
        <div>
          <p>Some random content without any rule anchors or headings.</p>
        </div>
      `;

      const result = parseMissionPack(html, sourceUrl);

      expect(result.rules).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('handles empty HTML gracefully', () => {
      const result = parseMissionPack('', sourceUrl);

      expect(result.missions).toHaveLength(0);
      expect(result.secondaryObjectives).toHaveLength(0);
      expect(result.gambits).toHaveLength(0);
      expect(result.rules).toHaveLength(0);
    });

    it('handles HTML with no relevant content', () => {
      const html = '<html><body><p>Some random content</p></body></html>';

      const result = parseMissionPack(html, sourceUrl);

      expect(result.missions).toHaveLength(0);
      expect(result.secondaryObjectives).toHaveLength(0);
      expect(result.gambits).toHaveLength(0);
      expect(result.rules).toHaveLength(0);
    });

    it('handles malformed HTML gracefully', () => {
      const html = '<div class="mission"><h3>BROKEN<p>Unclosed tags and broken structure';

      const result = parseMissionPack(html, sourceUrl);

      // Cheerio handles malformed HTML, should not throw
      expect(result).toBeDefined();
    });
  });

  describe('integration', () => {
    it('parses a complete mission pack with all sections', () => {
      const html = `
        <html>
        <body>
          <div class="mission">
            <h3>CONTROL THE CENTER</h3>
            <p>Dominate the middle of the battlefield for strategic advantage.</p>
            <p>Score 4VP if you control the center objective at end of turn.</p>
          </div>

          <div class="secondary">
            <h3>BEHIND ENEMY LINES</h3>
            <p>Get units into the enemy deployment zone for tactical advantage.</p>
            <p>Score 4VP at end of turn if one unit is wholly within enemy zone.</p>
          </div>

          <div class="challenger">
            <h4>Daring Strike</h4>
            <p><b>WHEN:</b> Start of your Charge phase</p>
            <p><b>EFFECT:</b> One unit can declare a charge even if it Advanced this turn.</p>
          </div>

          <a name="Chapter-Approved-Battles"></a>
          <p>This section explains the rules for Chapter Approved battles including setup.</p>
          <p>Victory conditions and scoring are detailed in the following sections.</p>
        </body>
        </html>
      `;

      const result = parseMissionPack(html, sourceUrl, 'chapter_approved');

      expect(result.missions).toHaveLength(1);
      expect(result.secondaryObjectives).toHaveLength(1);
      expect(result.gambits).toHaveLength(1);
      expect(result.rules.length).toBeGreaterThanOrEqual(1);

      expect(result.missions[0]?.name).toBe('Control The Center');
      expect(result.secondaryObjectives[0]?.name).toBe('Behind Enemy Lines');
      expect(result.gambits[0]?.name).toBe('Daring Strike');
    });
  });
});
