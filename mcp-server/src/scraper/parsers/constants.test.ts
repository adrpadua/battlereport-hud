import { describe, it, expect } from 'vitest';
import {
  SLUG_MAX_LENGTH,
  NAME_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  CATEGORY_MAX_LENGTH,
  CP_COST_MAX_LENGTH,
  PATH_MAX_LENGTH,
  SHORT_DESCRIPTION_MAX_LENGTH,
  MEDIUM_DESCRIPTION_MAX_LENGTH,
  LONG_CONTENT_MAX_LENGTH,
  RULE_CONTENT_MAX_LENGTH,
  FALLBACK_DESCRIPTION_MAX_LENGTH,
  MAX_LEADER_ATTACHMENTS,
  MIN_POINTS_COST,
  MAX_POINTS_COST,
  isValidPointsCost,
  truncate,
  truncateOrNull,
  truncateSlug,
  truncateName,
  truncateShortDescription,
  truncateMediumDescription,
} from './constants.js';

describe('constants', () => {
  describe('database field limits', () => {
    it('defines standard VARCHAR limits', () => {
      expect(SLUG_MAX_LENGTH).toBe(255);
      expect(NAME_MAX_LENGTH).toBe(255);
      expect(TITLE_MAX_LENGTH).toBe(255);
      expect(PATH_MAX_LENGTH).toBe(255);
    });

    it('defines category limit', () => {
      expect(CATEGORY_MAX_LENGTH).toBe(100);
    });

    it('defines CP cost limit', () => {
      expect(CP_COST_MAX_LENGTH).toBe(10);
    });
  });

  describe('text content limits', () => {
    it('defines description limits in ascending order', () => {
      expect(FALLBACK_DESCRIPTION_MAX_LENGTH).toBe(500);
      expect(SHORT_DESCRIPTION_MAX_LENGTH).toBe(1000);
      expect(MEDIUM_DESCRIPTION_MAX_LENGTH).toBe(2000);
      expect(LONG_CONTENT_MAX_LENGTH).toBe(3000);
      expect(RULE_CONTENT_MAX_LENGTH).toBe(5000);
    });
  });

  describe('parsing limits', () => {
    it('defines leader attachment limit', () => {
      expect(MAX_LEADER_ATTACHMENTS).toBe(10);
    });
  });

  describe('points cost bounds', () => {
    it('defines valid range', () => {
      expect(MIN_POINTS_COST).toBe(20);
      expect(MAX_POINTS_COST).toBe(500);
    });
  });
});

describe('isValidPointsCost', () => {
  it('returns true for valid points costs', () => {
    expect(isValidPointsCost(50)).toBe(true);
    expect(isValidPointsCost(100)).toBe(true);
    expect(isValidPointsCost(250)).toBe(true);
    expect(isValidPointsCost(500)).toBe(true);
  });

  it('returns true at boundary values', () => {
    expect(isValidPointsCost(MIN_POINTS_COST)).toBe(true);
    expect(isValidPointsCost(MAX_POINTS_COST)).toBe(true);
  });

  it('returns false below minimum', () => {
    expect(isValidPointsCost(19)).toBe(false);
    expect(isValidPointsCost(10)).toBe(false);
    expect(isValidPointsCost(0)).toBe(false);
    expect(isValidPointsCost(-1)).toBe(false);
  });

  it('returns false above maximum', () => {
    expect(isValidPointsCost(501)).toBe(false);
    expect(isValidPointsCost(1000)).toBe(false);
  });

  it('handles edge cases', () => {
    expect(isValidPointsCost(NaN)).toBe(false);
  });
});

describe('truncate', () => {
  it('returns original string if within limit', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('exact', 5)).toBe('exact');
  });

  it('truncates string exceeding limit', () => {
    expect(truncate('longer string', 6)).toBe('longer');
    expect(truncate('abcdefgh', 3)).toBe('abc');
  });

  it('handles empty string', () => {
    expect(truncate('', 10)).toBe('');
  });

  it('handles zero limit', () => {
    expect(truncate('any text', 0)).toBe('');
  });

  it('handles exact length', () => {
    expect(truncate('12345', 5)).toBe('12345');
  });
});

describe('truncateOrNull', () => {
  it('returns truncated string for valid input', () => {
    expect(truncateOrNull('test string', 4)).toBe('test');
  });

  it('returns null for empty string', () => {
    expect(truncateOrNull('', 10)).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(truncateOrNull('   ', 10)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(truncateOrNull(undefined, 10)).toBeNull();
  });

  it('returns null for null', () => {
    expect(truncateOrNull(null, 10)).toBeNull();
  });

  it('trims whitespace before checking', () => {
    expect(truncateOrNull('  test  ', 10)).toBe('test');
  });

  it('truncates after trimming', () => {
    expect(truncateOrNull('  longer text  ', 6)).toBe('longer');
  });
});

describe('truncateSlug', () => {
  it('truncates to SLUG_MAX_LENGTH', () => {
    const longSlug = 'a'.repeat(300);
    expect(truncateSlug(longSlug).length).toBe(SLUG_MAX_LENGTH);
  });

  it('preserves short slugs', () => {
    expect(truncateSlug('space-marines')).toBe('space-marines');
  });

  it('handles empty string', () => {
    expect(truncateSlug('')).toBe('');
  });
});

describe('truncateName', () => {
  it('truncates to NAME_MAX_LENGTH', () => {
    const longName = 'A'.repeat(300);
    expect(truncateName(longName).length).toBe(NAME_MAX_LENGTH);
  });

  it('preserves short names', () => {
    expect(truncateName('Intercessor Squad')).toBe('Intercessor Squad');
  });

  it('handles empty string', () => {
    expect(truncateName('')).toBe('');
  });
});

describe('truncateShortDescription', () => {
  it('truncates to SHORT_DESCRIPTION_MAX_LENGTH', () => {
    const longDesc = 'A'.repeat(1500);
    expect(truncateShortDescription(longDesc).length).toBe(SHORT_DESCRIPTION_MAX_LENGTH);
  });

  it('preserves short descriptions', () => {
    const shortDesc = 'This is a short description.';
    expect(truncateShortDescription(shortDesc)).toBe(shortDesc);
  });
});

describe('truncateMediumDescription', () => {
  it('truncates to MEDIUM_DESCRIPTION_MAX_LENGTH', () => {
    const longDesc = 'A'.repeat(2500);
    expect(truncateMediumDescription(longDesc).length).toBe(MEDIUM_DESCRIPTION_MAX_LENGTH);
  });

  it('preserves medium descriptions', () => {
    const medDesc = 'This is a medium-length description that fits within limits.';
    expect(truncateMediumDescription(medDesc)).toBe(medDesc);
  });
});
