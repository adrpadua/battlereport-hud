import { describe, it, expect } from 'vitest';
import { parseMissionPack, detectMissionPackType } from './mission-pack-parser.js';

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
});

describe('parseMissionPack', () => {
  const sourceUrl = 'https://wahapedia.ru/wh40k10ed/chapter-approved/missions/';

  describe('parsePrimaryMissions (via parseMissionPack)', () => {
    it('extracts mission name from CAPS format', () => {
      const markdown = `## Primary Mission deck

Primary Mission

TAKE AND HOLD

Secure the objectives and hold them against the enemy.

SECOND BATTLE ROUND ONWARDS
Score 4VP if you control one objective.`;

      const result = parseMissionPack(markdown, sourceUrl);

      expect(result.missions).toHaveLength(1);
      expect(result.missions[0]?.name).toBe('Take And Hold');
      expect(result.missions[0]?.slug).toBe('take-and-hold');
    });

    it('extracts description and scoring rules', () => {
      const markdown = `## Primary Mission deck

Primary Mission

BATTLEFIELD SUPREMACY

Control the battlefield through superior tactics.

SECOND BATTLE ROUND ONWARDS
Score 4VP if you control more objectives than your opponent.

ANY BATTLE ROUND
Score 2VP if you control at least two objectives.`;

      const result = parseMissionPack(markdown, sourceUrl);

      expect(result.missions).toHaveLength(1);
      expect(result.missions[0]?.primaryObjective).toContain('SECOND BATTLE ROUND');
      expect(result.missions[0]?.primaryObjective).toContain('ANY BATTLE ROUND');
    });

    it('handles action definitions', () => {
      const markdown = `## Primary Mission deck

Primary Mission

SECURE INTEL

Recover vital intelligence from the battlefield.

(ACTION) One unit can perform this action while within range of an objective.

SECOND BATTLE ROUND ONWARDS
Score 3VP per completed action.`;

      const result = parseMissionPack(markdown, sourceUrl);

      expect(result.missions).toHaveLength(1);
      expect(result.missions[0]?.missionRule).toContain('ACTION');
    });

    it('returns empty array when no Primary Mission deck section', () => {
      const markdown = `## Some Other Section

Just some content here without any missions.`;

      const result = parseMissionPack(markdown, sourceUrl);

      expect(result.missions).toHaveLength(0);
    });

    it('skips entries that do not look like mission names', () => {
      const markdown = `## Primary Mission deck

Primary Mission

some lowercase text that should not be a mission

Primary Mission

VALID MISSION NAME

This is a valid mission with proper content.`;

      const result = parseMissionPack(markdown, sourceUrl);

      // Should only parse the valid uppercase mission
      expect(result.missions).toHaveLength(1);
      expect(result.missions[0]?.name).toBe('Valid Mission Name');
    });
  });

  describe('parseSecondaryMissions (via parseMissionPack)', () => {
    it('extracts secondary objectives', () => {
      const markdown = `## Secondary Mission deck

Secondary Mission

ASSASSINATION

Eliminate the enemy's leaders.

**When Drawn:** At the end of the battle, score 5VP if the enemy Warlord is destroyed.`;

      const result = parseMissionPack(markdown, sourceUrl);

      expect(result.secondaryObjectives).toHaveLength(1);
      expect(result.secondaryObjectives[0]?.name).toBe('Assassination');
      expect(result.secondaryObjectives[0]?.slug).toBe('assassination');
    });

    it('detects tactical category by default', () => {
      const markdown = `## Secondary Mission deck

Secondary Mission

ENGAGE ON ALL FRONTS

Spread your forces across the battlefield.`;

      const result = parseMissionPack(markdown, sourceUrl);

      expect(result.secondaryObjectives).toHaveLength(1);
      expect(result.secondaryObjectives[0]?.category).toBe('tactical');
    });

    it('detects fixed category', () => {
      const markdown = `## Secondary Mission deck

Secondary Mission

FIXED OBJECTIVE

This is a Fixed Mission that can only be used in certain ways.

Fixed Mission requirements apply here.`;

      const result = parseMissionPack(markdown, sourceUrl);

      expect(result.secondaryObjectives).toHaveLength(1);
      expect(result.secondaryObjectives[0]?.category).toBe('fixed');
    });

    it('detects both category when FIXED and TACTICAL present', () => {
      const markdown = `## Secondary Mission deck

Secondary Mission

FLEXIBLE MISSION

This can be used as FIXED or TACTICAL depending on the situation.`;

      const result = parseMissionPack(markdown, sourceUrl);

      expect(result.secondaryObjectives).toHaveLength(1);
      expect(result.secondaryObjectives[0]?.category).toBe('both');
    });

    it('extracts max points from VP patterns', () => {
      const markdown = `## Secondary Mission deck

Secondary Mission

HIGH VALUE TARGET

Destroy enemy units worth the most points.

Score up to 15VP for destroying expensive units.
At least 5VP minimum.`;

      const result = parseMissionPack(markdown, sourceUrl);

      expect(result.secondaryObjectives).toHaveLength(1);
      expect(result.secondaryObjectives[0]?.maxPoints).toBe(15);
    });

    it('returns empty array when no Secondary Mission deck section', () => {
      const markdown = `## Primary Mission deck

Primary Mission

SOME MISSION

Content here.`;

      const result = parseMissionPack(markdown, sourceUrl);

      expect(result.secondaryObjectives).toHaveLength(0);
    });
  });

  describe('parseChallengers (via parseMissionPack)', () => {
    it('extracts challenger cards with timing and effect', () => {
      const markdown = `## Challenger deck

Challenger

BOLD ADVANCE

Push forward aggressively.

**WHEN:** Start of your Movement phase.

**EFFECT:** One unit can make a Normal move of up to 6" before the phase begins.`;

      const result = parseMissionPack(markdown, sourceUrl);

      expect(result.gambits).toHaveLength(1);
      expect(result.gambits[0]?.name).toBe('Bold Advance');
      expect(result.gambits[0]?.slug).toBe('bold-advance');
      expect(result.gambits[0]?.timing).toBe('Start of your Movement phase.');
      expect(result.gambits[0]?.effect).toContain('Normal move');
    });

    it('handles challengers without explicit WHEN/EFFECT format', () => {
      const markdown = `## Challenger deck

Challenger

SIMPLE CARD

A straightforward effect that just does something.`;

      const result = parseMissionPack(markdown, sourceUrl);

      expect(result.gambits).toHaveLength(1);
      expect(result.gambits[0]?.name).toBe('Simple Card');
      expect(result.gambits[0]?.timing).toBe('');
      expect(result.gambits[0]?.effect).toContain('straightforward effect');
    });

    it('returns empty array when no Challenger deck section', () => {
      const markdown = `## Primary Mission deck

Primary Mission

SOME MISSION

Content here.`;

      const result = parseMissionPack(markdown, sourceUrl);

      expect(result.gambits).toHaveLength(0);
    });
  });

  describe('parseMatchedPlayRules (via parseMissionPack)', () => {
    it('extracts Chapter Approved Battles rules', () => {
      const markdown = `### Chapter Approved Battles

Chapter Approved battles use the following sequence of steps to set up and play a game of Warhammer 40,000.

This section explains how to prepare for battle.`;

      const result = parseMissionPack(markdown, sourceUrl);

      const battleSequenceRule = result.rules.find(r => r.category === 'battle_sequence');
      expect(battleSequenceRule).toBeDefined();
      expect(battleSequenceRule?.content).toContain('sequence of steps');
    });

    it('extracts Set Mission Parameters rules', () => {
      const markdown = `### Set Mission Parameters

Both players agree on the battle size and mission parameters before selecting armies.

Points limit is typically 2000 for Strike Force games.`;

      const result = parseMissionPack(markdown, sourceUrl);

      const missionParamsRule = result.rules.find(r => r.category === 'mission_parameters');
      expect(missionParamsRule).toBeDefined();
      expect(missionParamsRule?.content).toContain('battle size');
    });

    it('extracts Muster Armies rules', () => {
      const markdown = `### Muster Armies

Players select their armies according to the agreed points limit.

Each army must be battle-forged and follow all army construction rules.`;

      const result = parseMissionPack(markdown, sourceUrl);

      const armyRule = result.rules.find(r => r.category === 'army_construction');
      expect(armyRule).toBeDefined();
      expect(armyRule?.content).toContain('points limit');
    });

    it('extracts Deploy Armies rules', () => {
      const markdown = `### Deploy Armies

Players alternate deploying units in their deployment zones.

The player who finishes first chooses whether to go first or second.`;

      const result = parseMissionPack(markdown, sourceUrl);

      const deployRule = result.rules.find(r => r.category === 'deployment');
      expect(deployRule).toBeDefined();
      expect(deployRule?.content).toContain('deployment zones');
    });

    it('extracts Terrain Layouts rules', () => {
      const markdown = `### Terrain Layouts

Use the terrain layout maps provided for competitive play.

Each layout is designed for balanced gameplay.`;

      const result = parseMissionPack(markdown, sourceUrl);

      const terrainRule = result.rules.find(r => r.category === 'terrain_layouts');
      expect(terrainRule).toBeDefined();
      expect(terrainRule?.content).toContain('terrain layout');
    });

    it('skips rules with content under 50 characters', () => {
      const markdown = `### Short Section

Tiny.`;

      const result = parseMissionPack(markdown, sourceUrl);

      expect(result.rules).toHaveLength(0);
    });

    it('truncates content to 5000 characters', () => {
      const longContent = 'A'.repeat(6000);
      const markdown = `### Chapter Approved Battles

${longContent}`;

      const result = parseMissionPack(markdown, sourceUrl);

      const rule = result.rules.find(r => r.category === 'battle_sequence');
      expect(rule).toBeDefined();
      expect(rule!.content.length).toBeLessThanOrEqual(5000);
    });
  });

  describe('integration', () => {
    it('parses a complete mission pack with all sections', () => {
      const markdown = `# Chapter Approved 2024

## Primary Mission deck

Primary Mission

CONTROL THE CENTER

Dominate the middle of the battlefield.

SECOND BATTLE ROUND ONWARDS
Score 4VP if you control the center objective.

## Secondary Mission deck

Secondary Mission

BEHIND ENEMY LINES

Get units into the enemy deployment zone.

Score 4VP at end of turn if one unit is wholly within enemy zone.

## Challenger deck

Challenger

DARING STRIKE

Launch a bold assault.

**WHEN:** Start of your Charge phase.

**EFFECT:** One unit can declare a charge even if it Advanced.

### Chapter Approved Battles

This section explains the rules for Chapter Approved battles including setup and victory conditions.`;

      const result = parseMissionPack(markdown, sourceUrl, 'chapter_approved');

      expect(result.missions).toHaveLength(1);
      expect(result.secondaryObjectives).toHaveLength(1);
      expect(result.gambits).toHaveLength(1);
      expect(result.rules.length).toBeGreaterThanOrEqual(1);

      expect(result.missions[0]?.name).toBe('Control The Center');
      expect(result.secondaryObjectives[0]?.name).toBe('Behind Enemy Lines');
      expect(result.gambits[0]?.name).toBe('Daring Strike');
    });

    it('handles empty markdown', () => {
      const result = parseMissionPack('', sourceUrl);

      expect(result.missions).toHaveLength(0);
      expect(result.secondaryObjectives).toHaveLength(0);
      expect(result.gambits).toHaveLength(0);
      expect(result.rules).toHaveLength(0);
    });
  });

  describe('slugify and toTitleCase (via parseMissionPack)', () => {
    it('converts mission name to slug', () => {
      const markdown = `## Primary Mission deck

Primary Mission

THE RITUAL

A mission about performing a ritual.`;

      const result = parseMissionPack(markdown, sourceUrl);

      expect(result.missions[0]?.slug).toBe('the-ritual');
    });

    it('converts CAPS to title case', () => {
      const markdown = `## Primary Mission deck

Primary Mission

PRIORITY TARGETS

Destroy key enemy assets.`;

      const result = parseMissionPack(markdown, sourceUrl);

      expect(result.missions[0]?.name).toBe('Priority Targets');
    });

    it('handles special characters in slugify', () => {
      const markdown = `## Secondary Mission deck

Secondary Mission

AREA DENIAL

Control areas of the battlefield.`;

      const result = parseMissionPack(markdown, sourceUrl);

      expect(result.secondaryObjectives[0]?.slug).toBe('area-denial');
    });
  });
});
