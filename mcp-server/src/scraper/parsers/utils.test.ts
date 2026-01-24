import { describe, it, expect } from 'vitest';
import {
  slugify,
  toTitleCase,
  normalizeText,
  normalizeKeywords,
  dedupeKeywords,
  DeduplicationTracker,
  detectPhase,
  detectRuleCategory,
  CONCATENATION_FIXES,
  KEYWORD_FIXES,
} from './utils.js';

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

  it('handles numbers', () => {
    expect(slugify('Space Marines 2.0')).toBe('space-marines-2-0');
  });

  it('handles Unicode characters', () => {
    // Non-ASCII characters are removed (replaced with nothing/hyphen)
    expect(slugify('Ældar Forces')).toBe('ldar-forces');
  });
});

describe('toTitleCase', () => {
  it('converts uppercase to title case', () => {
    expect(toTitleCase('ASSAULT INTERCESSORS')).toBe('Assault Intercessors');
  });

  it('converts lowercase to title case', () => {
    expect(toTitleCase('space marines')).toBe('Space Marines');
  });

  it('handles mixed case', () => {
    expect(toTitleCase('SpAcE mArInEs')).toBe('Space Marines');
  });

  it('handles single word', () => {
    expect(toTitleCase('TYRANIDS')).toBe('Tyranids');
  });

  it('handles empty string', () => {
    expect(toTitleCase('')).toBe('');
  });

  it('handles single character words', () => {
    expect(toTitleCase('A B C')).toBe('A B C');
  });

  it('preserves single character at start', () => {
    expect(toTitleCase('x-wing')).toBe('X-wing');
  });
});

describe('normalizeText', () => {
  it('fixes concatenated weapon abilities', () => {
    expect(normalizeText('blastpsychic')).toBe('[BLAST], [PSYCHIC]');
  });

  it('fixes ignores cover torrent concatenation', () => {
    expect(normalizeText('ignorescovertorrent')).toBe('[IGNORES COVER], [TORRENT]');
  });

  it('fixes core ability concatenations', () => {
    expect(normalizeText('deepstrike')).toBe('Deep Strike');
    expect(normalizeText('feelnopain')).toBe('Feel No Pain');
    expect(normalizeText('fightsfirst')).toBe('Fights First');
  });

  it('fixes faction ability concatenations', () => {
    expect(normalizeText('oathofmoment')).toBe('Oath of Moment');
    expect(normalizeText('shadowinthewarp')).toBe('Shadow in the Warp');
  });

  it('adds spaces at camelCase boundaries', () => {
    expect(normalizeText('DeadlyDemise')).toBe('Deadly Demise');
    expect(normalizeText('PowerSword')).toBe('Power Sword');
  });

  it('fixes "inthe" concatenations when at word boundary', () => {
    // The pattern uses word boundaries - "inthe" must be a standalone word
    expect(normalizeText('go inthe space')).toBe('go in the space');
  });

  it('fixes "ofthe" concatenations when at word boundary', () => {
    expect(normalizeText('power ofthe machine')).toBe('power of the machine');
  });

  it('fixes "tothe" concatenations when at word boundary', () => {
    expect(normalizeText('run tothe end')).toBe('run to the end');
  });

  it('fixes "fromthe" concatenations when at word boundary', () => {
    expect(normalizeText('taken fromthe enemy')).toBe('taken from the enemy');
  });

  it('handles text with no concatenations', () => {
    expect(normalizeText('Normal text here')).toBe('Normal text here');
  });

  it('is case insensitive for fixes', () => {
    expect(normalizeText('DEEPSTRIKE')).toBe('Deep Strike');
    expect(normalizeText('DeepStrike')).toBe('Deep Strike');
  });
});

describe('normalizeKeywords', () => {
  it('fixes concatenated faction keywords', () => {
    expect(normalizeKeywords('HERETICASTARTES unit')).toBe('HERETIC ASTARTES unit');
    expect(normalizeKeywords('ADEPTUSASTARTES model')).toBe('ADEPTUS ASTARTES model');
  });

  it('fixes concatenated weapon abilities', () => {
    expect(normalizeKeywords('LETHALHITS')).toBe('LETHAL HITS');
    expect(normalizeKeywords('SUSTAINEDHITS')).toBe('SUSTAINED HITS');
    expect(normalizeKeywords('DEVASTATINGWOUNDS')).toBe('DEVASTATING WOUNDS');
  });

  it('fixes concatenated core abilities', () => {
    expect(normalizeKeywords('DEEPSTRIKE')).toBe('DEEP STRIKE');
    expect(normalizeKeywords('FIGHTSFIRST')).toBe('FIGHTS FIRST');
    expect(normalizeKeywords('LONEOPERATIVE')).toBe('LONE OPERATIVE');
  });

  it('handles multiple keywords in text', () => {
    const input = 'HERETICASTARTES INFANTRY with LETHALHITS';
    const expected = 'HERETIC ASTARTES INFANTRY with LETHAL HITS';
    expect(normalizeKeywords(input)).toBe(expected);
  });

  it('preserves text without concatenated keywords', () => {
    expect(normalizeKeywords('Normal text')).toBe('Normal text');
  });

  it('handles word boundaries correctly', () => {
    // The pattern uses word boundaries \b, so it should match HERETICASTARTES at word boundaries
    // "HERETICASTARTES unit" has word boundary after HERETICASTARTES
    expect(normalizeKeywords('HERETICASTARTES unit')).toBe('HERETIC ASTARTES unit');
  });
});

describe('dedupeKeywords', () => {
  it('removes repeated multi-word phrases', () => {
    expect(dedupeKeywords('HERETIC ASTARTESHERETIC ASTARTES')).toBe('HERETIC ASTARTES');
  });

  it('removes multiple repetitions of phrases', () => {
    expect(dedupeKeywords('ADEPTUS ASTARTESADEPTUS ASTARTESADEPTUS ASTARTES'))
      .toBe('ADEPTUS ASTARTES');
  });

  it('removes repeated single words', () => {
    expect(dedupeKeywords('INFANTRYINFANTRYINFANTRY')).toBe('INFANTRY');
  });

  it('removes three+ repetitions of single words', () => {
    // The regex requires 2+ repetitions (so 3+ total occurrences)
    expect(dedupeKeywords('VEHICLEVEHICLEVEHICLE')).toBe('VEHICLE');
  });

  it('preserves non-repeated text', () => {
    expect(dedupeKeywords('INFANTRY VEHICLE')).toBe('INFANTRY VEHICLE');
  });

  it('handles empty string', () => {
    expect(dedupeKeywords('')).toBe('');
  });
});

describe('DeduplicationTracker', () => {
  describe('case-insensitive mode (default)', () => {
    it('tracks seen values', () => {
      const tracker = new DeduplicationTracker();
      tracker.add('Test');
      expect(tracker.has('test')).toBe(true);
      expect(tracker.has('TEST')).toBe(true);
    });

    it('addIfNew returns true for new values', () => {
      const tracker = new DeduplicationTracker();
      expect(tracker.addIfNew('First')).toBe(true);
      expect(tracker.addIfNew('Second')).toBe(true);
    });

    it('addIfNew returns false for duplicate values', () => {
      const tracker = new DeduplicationTracker();
      tracker.addIfNew('Test');
      expect(tracker.addIfNew('test')).toBe(false);
      expect(tracker.addIfNew('TEST')).toBe(false);
    });

    it('tracks size correctly', () => {
      const tracker = new DeduplicationTracker();
      expect(tracker.size).toBe(0);
      tracker.add('One');
      expect(tracker.size).toBe(1);
      tracker.add('Two');
      expect(tracker.size).toBe(2);
      tracker.add('one'); // Duplicate
      expect(tracker.size).toBe(2);
    });

    it('clear removes all tracked values', () => {
      const tracker = new DeduplicationTracker();
      tracker.add('One');
      tracker.add('Two');
      tracker.clear();
      expect(tracker.size).toBe(0);
      expect(tracker.has('One')).toBe(false);
    });
  });

  describe('case-sensitive mode', () => {
    it('distinguishes case when case-sensitive', () => {
      const tracker = new DeduplicationTracker(true);
      tracker.add('Test');
      expect(tracker.has('Test')).toBe(true);
      expect(tracker.has('test')).toBe(false);
      expect(tracker.has('TEST')).toBe(false);
    });

    it('addIfNew is case-sensitive', () => {
      const tracker = new DeduplicationTracker(true);
      expect(tracker.addIfNew('Test')).toBe(true);
      expect(tracker.addIfNew('test')).toBe(true); // Different case = new value
      expect(tracker.addIfNew('Test')).toBe(false); // Same case = duplicate
    });
  });
});

describe('detectPhase', () => {
  it('detects command phase', () => {
    expect(detectPhase('During your Command phase')).toBe('command');
    expect(detectPhase('At the start of the command phase')).toBe('command');
  });

  it('detects movement phase', () => {
    expect(detectPhase('In the Movement phase')).toBe('movement');
    expect(detectPhase('Your Movement phase')).toBe('movement');
  });

  it('detects shooting phase', () => {
    expect(detectPhase('Your Shooting phase')).toBe('shooting');
    expect(detectPhase('During the Shooting phase')).toBe('shooting');
  });

  it('detects charge phase', () => {
    expect(detectPhase('Charge phase')).toBe('charge');
    expect(detectPhase('In the Charge phase')).toBe('charge');
  });

  it('detects fight phase', () => {
    expect(detectPhase('During the Fight phase')).toBe('fight');
    expect(detectPhase('Your Fight phase')).toBe('fight');
  });

  it('returns any for unknown phase', () => {
    expect(detectPhase('Any time')).toBe('any');
    expect(detectPhase('At the start of your turn')).toBe('any');
  });

  it('returns any for empty string', () => {
    expect(detectPhase('')).toBe('any');
  });

  it('is case insensitive', () => {
    expect(detectPhase('SHOOTING PHASE')).toBe('shooting');
    expect(detectPhase('shooting phase')).toBe('shooting');
  });

  it('handles phase mentioned in context', () => {
    expect(detectPhase('When an enemy unit shoots in the Shooting phase')).toBe('shooting');
  });
});

describe('detectRuleCategory', () => {
  describe('phase detection', () => {
    it('detects command phase', () => {
      expect(detectRuleCategory('The Command Phase')).toBe('command_phase');
    });

    it('detects movement phase', () => {
      expect(detectRuleCategory('Movement Phase Rules')).toBe('movement_phase');
    });

    it('detects shooting phase', () => {
      expect(detectRuleCategory('Shooting Phase')).toBe('shooting_phase');
    });

    it('detects charge phase', () => {
      expect(detectRuleCategory('Charge Phase')).toBe('charge_phase');
    });

    it('detects fight phase', () => {
      expect(detectRuleCategory('The Fight Phase')).toBe('fight_phase');
    });
  });

  describe('combat mechanics', () => {
    it('detects combat from attacks', () => {
      expect(detectRuleCategory('Making Attacks')).toBe('combat');
    });

    it('detects combat from hit roll', () => {
      expect(detectRuleCategory('The Hit Roll')).toBe('combat');
    });

    it('detects combat from wound roll', () => {
      expect(detectRuleCategory('Wound Roll Rules')).toBe('combat');
    });
  });

  describe('other categories', () => {
    it('detects morale', () => {
      expect(detectRuleCategory('Morale Tests')).toBe('morale');
      expect(detectRuleCategory('Battle-shock Tests')).toBe('morale');
    });

    it('detects transports', () => {
      expect(detectRuleCategory('Transport Capacity')).toBe('transports');
    });

    it('detects terrain', () => {
      expect(detectRuleCategory('Terrain Rules')).toBe('terrain');
      expect(detectRuleCategory('Cover Rules')).toBe('terrain');
    });

    it('detects psychic', () => {
      expect(detectRuleCategory('Psychic Powers')).toBe('psychic');
      expect(detectRuleCategory('Psyker Units')).toBe('psychic');
    });

    it('detects stratagems', () => {
      expect(detectRuleCategory('Using Stratagems')).toBe('stratagems');
    });

    it('detects objectives', () => {
      expect(detectRuleCategory('Objective Markers')).toBe('objectives');
      expect(detectRuleCategory('Victory Points')).toBe('objectives');
    });

    it('detects deployment', () => {
      expect(detectRuleCategory('Deployment Zone')).toBe('deployment');
      expect(detectRuleCategory('Reserves Rules')).toBe('deployment');
    });

    it('detects units', () => {
      expect(detectRuleCategory('Unit Profiles')).toBe('units');
      expect(detectRuleCategory('Reading a Datasheet')).toBe('units');
    });

    it('detects weapons', () => {
      expect(detectRuleCategory('Weapon Profiles')).toBe('weapons');
      expect(detectRuleCategory('Wargear Options')).toBe('weapons');
    });

    it('detects abilities', () => {
      expect(detectRuleCategory('Core Abilities')).toBe('abilities');
    });

    it('detects keywords', () => {
      expect(detectRuleCategory('Keyword Rules')).toBe('keywords');
    });

    it('detects leaders', () => {
      expect(detectRuleCategory('Leader Characters')).toBe('leaders');
      expect(detectRuleCategory('Attached Models')).toBe('leaders');
    });

    it('defaults to general for unknown categories', () => {
      expect(detectRuleCategory('Random Section Title')).toBe('general');
      expect(detectRuleCategory('Introduction')).toBe('general');
    });
  });
});

describe('CONCATENATION_FIXES constant', () => {
  it('contains weapon ability fixes', () => {
    expect(CONCATENATION_FIXES['blastpsychic']).toBe('[BLAST], [PSYCHIC]');
  });

  it('contains core ability fixes', () => {
    expect(CONCATENATION_FIXES['deepstrike']).toBe('Deep Strike');
  });
});

describe('KEYWORD_FIXES constant', () => {
  it('contains faction keyword fixes', () => {
    expect(KEYWORD_FIXES['HERETICASTARTES']).toBe('HERETIC ASTARTES');
  });

  it('contains weapon ability fixes', () => {
    expect(KEYWORD_FIXES['LETHALHITS']).toBe('LETHAL HITS');
  });
});
