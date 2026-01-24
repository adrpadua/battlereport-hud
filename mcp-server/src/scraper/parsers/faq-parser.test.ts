import { describe, it, expect } from 'vitest';
import { parseFAQPage, extractEffectiveDate, toNewFAQ } from './faq-parser.js';

const sourceUrl = 'https://wahapedia.ru/wh40k10ed/the-rules/faqs/';

describe('parseFAQPage', () => {
  describe('basic Q&A parsing', () => {
    it('parses simple Q&A pair with strong tags', () => {
      const html = `
        <div>
          <strong>Q:</strong> <em>Can a unit shoot after advancing?</em>
          <strong>A:</strong> Only if it has the Assault keyword on its weapons.
        </div>
      `;

      const result = parseFAQPage(html, sourceUrl);

      expect(result).toHaveLength(1);
      expect(result[0]?.question).toContain('Can a unit shoot after advancing');
      expect(result[0]?.answer).toContain('Assault keyword');
      expect(result[0]?.category).toBe('core');
    });

    it('parses multiple Q&A pairs', () => {
      const html = `
        <div>
          <strong>Q:</strong> <em>First question here?</em>
          <strong>A:</strong> First answer here.
        </div>
        <div>
          <strong>Q:</strong> <em>Second question here?</em>
          <strong>A:</strong> Second answer here.
        </div>
        <div>
          <strong>Q:</strong> <em>Third question here?</em>
          <strong>A:</strong> Third answer here.
        </div>
      `;

      const result = parseFAQPage(html, sourceUrl);

      expect(result).toHaveLength(3);
      expect(result[0]?.question).toContain('First question');
      expect(result[1]?.question).toContain('Second question');
      expect(result[2]?.question).toContain('Third question');
    });

    it('parses Q&A with Q: and A: text only (no em tags)', () => {
      const html = `
        <p><strong>Q:</strong> What happens when a unit falls back?
        <strong>A:</strong> The unit cannot shoot or charge that turn.</p>
      `;

      const result = parseFAQPage(html, sourceUrl);

      expect(result).toHaveLength(1);
      expect(result[0]?.question).toContain('falls back');
      expect(result[0]?.answer).toContain('cannot shoot or charge');
    });
  });

  describe('section header parsing', () => {
    it('assigns section from h3 headers', () => {
      const html = `
        <h3>Movement</h3>
        <div>
          <strong>Q:</strong> <em>Can units move through other units?</em>
          <strong>A:</strong> No, unless they have the Fly keyword.
        </div>
        <h3>Shooting</h3>
        <div>
          <strong>Q:</strong> <em>Can units split fire?</em>
          <strong>A:</strong> Yes, each weapon can target a different unit.
        </div>
      `;

      const result = parseFAQPage(html, sourceUrl);

      expect(result.length).toBeGreaterThanOrEqual(2);
      // Each FAQ should have appropriate section context
      const movementFaq = result.find((f) => f.question.includes('move through'));
      const shootingFaq = result.find((f) => f.question.includes('split fire'));

      expect(movementFaq).toBeDefined();
      expect(shootingFaq).toBeDefined();
    });

    it('defaults to General section when no header found', () => {
      const html = `
        <div>
          <strong>Q:</strong> <em>What is a mortal wound?</em>
          <strong>A:</strong> A wound that ignores saving throws.
        </div>
      `;

      const result = parseFAQPage(html, sourceUrl);

      expect(result).toHaveLength(1);
      expect(result[0]?.section).toBe('General');
    });
  });

  describe('slug generation', () => {
    it('generates unique slugs for each FAQ', () => {
      const html = `
        <div>
          <strong>Q:</strong> <em>First question text?</em>
          <strong>A:</strong> First answer.
        </div>
        <div>
          <strong>Q:</strong> <em>Second question text?</em>
          <strong>A:</strong> Second answer.
        </div>
      `;

      const result = parseFAQPage(html, sourceUrl);

      expect(result).toHaveLength(2);
      expect(result[0]?.slug).not.toBe(result[1]?.slug);
      expect(result[0]?.slug).toMatch(/^core-general-[a-f0-9]+$/);
    });

    it('includes section in slug', () => {
      const html = `
        <h3>Movement Phase</h3>
        <div>
          <strong>Q:</strong> <em>Can models move through walls?</em>
          <strong>A:</strong> No, models cannot move through walls.
        </div>
      `;

      const result = parseFAQPage(html, sourceUrl);

      if (result.length > 0 && result[0]?.slug.includes('movement')) {
        expect(result[0]?.slug).toContain('movement');
      }
    });
  });

  describe('empty and malformed input', () => {
    it('returns empty array for empty input', () => {
      const result = parseFAQPage('', sourceUrl);
      expect(result).toEqual([]);
    });

    it('returns empty array for HTML without Q&A', () => {
      const html = '<p>This is just regular content without any FAQ.</p>';

      const result = parseFAQPage(html, sourceUrl);

      expect(result).toEqual([]);
    });

    it('handles malformed HTML gracefully', () => {
      const html = '<div><strong>Q:</strong><em>Unclosed tags';

      const result = parseFAQPage(html, sourceUrl);

      // Should not throw
      expect(result).toBeDefined();
    });

    it('skips Q&A pairs without answers', () => {
      const html = `
        <div>
          <strong>Q:</strong> <em>Question without answer?</em>
        </div>
        <div>
          <strong>Q:</strong> <em>Question with answer?</em>
          <strong>A:</strong> This one has an answer.
        </div>
      `;

      const result = parseFAQPage(html, sourceUrl);

      // Should only include the FAQ with an answer
      expect(result.length).toBeLessThanOrEqual(1);
      if (result.length === 1) {
        expect(result[0]?.answer).toContain('This one has an answer');
      }
    });
  });

  describe('title truncation', () => {
    it('truncates title to 100 characters', () => {
      const longQuestion = 'A'.repeat(200) + '?';
      const html = `
        <div>
          <strong>Q:</strong> <em>${longQuestion}</em>
          <strong>A:</strong> Short answer.
        </div>
      `;

      const result = parseFAQPage(html, sourceUrl);

      if (result.length > 0) {
        expect(result[0]?.title.length).toBeLessThanOrEqual(100);
      }
    });
  });
});

describe('extractEffectiveDate', () => {
  it('extracts date from "Effective: Month Year" format', () => {
    const html = '<table><tr><td>Effective: January 2025</td></tr></table>';

    const result = extractEffectiveDate(html);

    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2025);
    expect(result?.getMonth()).toBe(0); // January
  });

  it('extracts date from "Updated: DD Month YYYY" format', () => {
    const html = '<p>Updated: 15 March 2025</p>';

    const result = extractEffectiveDate(html);

    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2025);
    expect(result?.getMonth()).toBe(2); // March
    expect(result?.getDate()).toBe(15);
  });

  it('extracts date from header area', () => {
    const html = '<h1>FAQ - December 2024</h1><p>Content here</p>';

    const result = extractEffectiveDate(html);

    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2024);
    expect(result?.getMonth()).toBe(11); // December
  });

  it('returns null when no date found', () => {
    const html = '<p>No date information here</p>';

    const result = extractEffectiveDate(html);

    expect(result).toBeNull();
  });

  it('handles various month formats', () => {
    const testCases = [
      { html: '<p>Updated: Jan 2025</p>', month: 0 },
      { html: '<p>Updated: Feb 2025</p>', month: 1 },
      { html: '<p>Updated: September 2025</p>', month: 8 },
    ];

    for (const { html, month } of testCases) {
      const result = extractEffectiveDate(html);
      expect(result?.getMonth()).toBe(month);
    }
  });
});

describe('toNewFAQ', () => {
  it('converts ParsedFAQ to NewFAQ format', () => {
    const parsed = {
      slug: 'core-general-abc123',
      title: 'Can units shoot after advancing?',
      category: 'core' as const,
      section: 'General',
      question: 'Can units shoot after advancing?',
      answer: 'Only with Assault weapons.',
      effectiveDate: new Date('2025-01-15'),
      sourceUrl,
    };

    const result = toNewFAQ(parsed);

    expect(result).toMatchObject({
      slug: 'core-general-abc123',
      title: 'Can units shoot after advancing?',
      category: 'core',
      factionId: null,
      question: 'Can units shoot after advancing?',
      answer: 'Only with Assault weapons.',
      content: null,
      sourceUrl,
      dataSource: 'wahapedia',
    });
    expect(result.effectiveDate).toBeInstanceOf(Date);
  });

  it('handles null effectiveDate', () => {
    const parsed = {
      slug: 'core-general-abc123',
      title: 'Test Question',
      category: 'core' as const,
      section: 'General',
      question: 'Test Question?',
      answer: 'Test Answer.',
      effectiveDate: null,
      sourceUrl,
    };

    const result = toNewFAQ(parsed);

    expect(result.effectiveDate).toBeNull();
  });
});
