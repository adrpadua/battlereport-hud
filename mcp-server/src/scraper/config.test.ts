import { describe, it, expect } from 'vitest';
import {
  WAHAPEDIA_URLS,
  WAHAPEDIA_BASE_URL,
  FACTION_SLUGS,
  SPACE_MARINE_CHAPTER_SLUGS,
  CHAOS_DAEMON_SUBFACTION_SLUGS,
  AELDARI_SUBFACTION_SLUGS,
  FACTION_SUBFACTIONS,
  detectContentType,
} from './config.js';

describe('WAHAPEDIA_BASE_URL', () => {
  it('should be the correct Wahapedia 10th edition URL', () => {
    expect(WAHAPEDIA_BASE_URL).toBe('https://wahapedia.ru/wh40k10ed');
  });
});

describe('WAHAPEDIA_URLS', () => {
  describe('factionBase', () => {
    it('generates correct faction URL', () => {
      expect(WAHAPEDIA_URLS.factionBase('space-marines')).toBe(
        'https://wahapedia.ru/wh40k10ed/factions/space-marines/'
      );
    });

    it('handles factions with special characters', () => {
      expect(WAHAPEDIA_URLS.factionBase('t-au-empire')).toBe(
        'https://wahapedia.ru/wh40k10ed/factions/t-au-empire/'
      );
    });
  });

  describe('chapterPage', () => {
    it('generates correct Space Marine chapter URL', () => {
      expect(WAHAPEDIA_URLS.chapterPage('space-wolves')).toBe(
        'https://wahapedia.ru/wh40k10ed/factions/space-marines/space-wolves'
      );
    });

    it('generates correct URL for blood-angels', () => {
      expect(WAHAPEDIA_URLS.chapterPage('blood-angels')).toBe(
        'https://wahapedia.ru/wh40k10ed/factions/space-marines/blood-angels'
      );
    });
  });

  describe('subfactionPage', () => {
    it('generates correct Chaos Daemons god URL', () => {
      expect(WAHAPEDIA_URLS.subfactionPage('chaos-daemons', 'khorne')).toBe(
        'https://wahapedia.ru/wh40k10ed/factions/chaos-daemons/khorne'
      );
    });

    it('generates correct Aeldari subfaction URL', () => {
      expect(WAHAPEDIA_URLS.subfactionPage('aeldari', 'ynnari')).toBe(
        'https://wahapedia.ru/wh40k10ed/factions/aeldari/ynnari'
      );
    });

    it('generates correct URL for any faction/subfaction combination', () => {
      expect(WAHAPEDIA_URLS.subfactionPage('test-faction', 'test-subfaction')).toBe(
        'https://wahapedia.ru/wh40k10ed/factions/test-faction/test-subfaction'
      );
    });
  });

  describe('datasheets', () => {
    it('generates correct datasheets URL', () => {
      expect(WAHAPEDIA_URLS.datasheets('necrons')).toBe(
        'https://wahapedia.ru/wh40k10ed/factions/necrons/datasheets'
      );
    });
  });

  describe('unitDatasheet', () => {
    it('generates correct unit datasheet URL', () => {
      expect(WAHAPEDIA_URLS.unitDatasheet('space-marines', 'Intercessor-Squad')).toBe(
        'https://wahapedia.ru/wh40k10ed/factions/space-marines/Intercessor-Squad'
      );
    });
  });
});

describe('FACTION_SLUGS', () => {
  it('contains all major Imperium factions', () => {
    expect(FACTION_SLUGS).toContain('space-marines');
    expect(FACTION_SLUGS).toContain('astra-militarum');
    expect(FACTION_SLUGS).toContain('adeptus-custodes');
    expect(FACTION_SLUGS).toContain('grey-knights');
  });

  it('contains all major Chaos factions', () => {
    expect(FACTION_SLUGS).toContain('chaos-space-marines');
    expect(FACTION_SLUGS).toContain('chaos-daemons');
    expect(FACTION_SLUGS).toContain('death-guard');
    expect(FACTION_SLUGS).toContain('thousand-sons');
  });

  it('contains all major Xenos factions', () => {
    expect(FACTION_SLUGS).toContain('aeldari');
    expect(FACTION_SLUGS).toContain('tyranids');
    expect(FACTION_SLUGS).toContain('necrons');
    expect(FACTION_SLUGS).toContain('orks');
    expect(FACTION_SLUGS).toContain('t-au-empire');
  });

  it('has the expected number of factions', () => {
    // 8 Imperium + 7 Chaos + 8 Xenos + 1 Unaligned = 24
    expect(FACTION_SLUGS.length).toBeGreaterThanOrEqual(20);
  });
});

describe('SPACE_MARINE_CHAPTER_SLUGS', () => {
  it('contains all first founding chapters', () => {
    expect(SPACE_MARINE_CHAPTER_SLUGS).toContain('ultramarines');
    expect(SPACE_MARINE_CHAPTER_SLUGS).toContain('imperial-fists');
    expect(SPACE_MARINE_CHAPTER_SLUGS).toContain('white-scars');
    expect(SPACE_MARINE_CHAPTER_SLUGS).toContain('raven-guard');
    expect(SPACE_MARINE_CHAPTER_SLUGS).toContain('salamanders');
    expect(SPACE_MARINE_CHAPTER_SLUGS).toContain('iron-hands');
  });

  it('contains major successor chapters', () => {
    expect(SPACE_MARINE_CHAPTER_SLUGS).toContain('blood-angels');
    expect(SPACE_MARINE_CHAPTER_SLUGS).toContain('dark-angels');
    expect(SPACE_MARINE_CHAPTER_SLUGS).toContain('space-wolves');
    expect(SPACE_MARINE_CHAPTER_SLUGS).toContain('black-templars');
  });

  it('contains Deathwatch', () => {
    expect(SPACE_MARINE_CHAPTER_SLUGS).toContain('deathwatch');
  });

  it('has 11 chapters total', () => {
    expect(SPACE_MARINE_CHAPTER_SLUGS.length).toBe(11);
  });
});

describe('CHAOS_DAEMON_SUBFACTION_SLUGS', () => {
  it('contains all four Chaos gods', () => {
    expect(CHAOS_DAEMON_SUBFACTION_SLUGS).toContain('khorne');
    expect(CHAOS_DAEMON_SUBFACTION_SLUGS).toContain('nurgle');
    expect(CHAOS_DAEMON_SUBFACTION_SLUGS).toContain('tzeentch');
    expect(CHAOS_DAEMON_SUBFACTION_SLUGS).toContain('slaanesh');
  });

  it('has exactly 4 gods', () => {
    expect(CHAOS_DAEMON_SUBFACTION_SLUGS.length).toBe(4);
  });
});

describe('AELDARI_SUBFACTION_SLUGS', () => {
  it('contains Ynnari', () => {
    expect(AELDARI_SUBFACTION_SLUGS).toContain('ynnari');
  });

  it('contains Harlequins', () => {
    expect(AELDARI_SUBFACTION_SLUGS).toContain('harlequins');
  });

  it('has 2 subfactions', () => {
    expect(AELDARI_SUBFACTION_SLUGS.length).toBe(2);
  });
});

describe('FACTION_SUBFACTIONS', () => {
  it('maps space-marines to chapter slugs', () => {
    expect(FACTION_SUBFACTIONS['space-marines']).toBe(SPACE_MARINE_CHAPTER_SLUGS);
  });

  it('maps chaos-daemons to god slugs', () => {
    expect(FACTION_SUBFACTIONS['chaos-daemons']).toBe(CHAOS_DAEMON_SUBFACTION_SLUGS);
  });

  it('maps aeldari to aeldari subfaction slugs', () => {
    expect(FACTION_SUBFACTIONS['aeldari']).toBe(AELDARI_SUBFACTION_SLUGS);
  });

  it('has 3 factions with subfactions', () => {
    expect(Object.keys(FACTION_SUBFACTIONS).length).toBe(3);
  });

  it('returns undefined for factions without subfactions', () => {
    expect(FACTION_SUBFACTIONS['necrons']).toBeUndefined();
    expect(FACTION_SUBFACTIONS['tyranids']).toBeUndefined();
  });
});

describe('detectContentType', () => {
  it('detects core rules', () => {
    expect(detectContentType('https://wahapedia.ru/wh40k10ed/the-rules/core-rules/')).toBe('core_rules');
  });

  it('detects quick start guide', () => {
    expect(detectContentType('https://wahapedia.ru/wh40k10ed/the-rules/quick-start-guide/')).toBe('quick_start');
  });

  it('detects crusade rules', () => {
    expect(detectContentType('https://wahapedia.ru/wh40k10ed/the-rules/crusade-rules/')).toBe('crusade_rules');
  });

  it('detects FAQs', () => {
    expect(detectContentType('https://wahapedia.ru/wh40k10ed/the-rules/faqs/')).toBe('faqs');
  });

  it('detects mission packs', () => {
    expect(detectContentType('https://wahapedia.ru/wh40k10ed/the-rules/leviathan/')).toBe('mission_pack');
    expect(detectContentType('https://wahapedia.ru/wh40k10ed/the-rules/pariah-nexus-battles/')).toBe('mission_pack');
    expect(detectContentType('https://wahapedia.ru/wh40k10ed/the-rules/chapter-approved-2025-26/')).toBe('mission_pack');
  });

  it('detects faction content', () => {
    expect(detectContentType('https://wahapedia.ru/wh40k10ed/factions/space-marines/')).toBe('faction');
    expect(detectContentType('https://wahapedia.ru/wh40k10ed/factions/chaos-daemons/khorne')).toBe('faction');
  });

  it('returns unknown for unrecognized URLs', () => {
    expect(detectContentType('https://example.com/')).toBe('unknown');
    expect(detectContentType('https://wahapedia.ru/other/')).toBe('unknown');
  });
});
