/**
 * FAQ Parser for Wahapedia FAQ pages.
 *
 * Parses FAQ Q&A pairs from Wahapedia's FAQ page format.
 * The page contains sections (General, Movement, etc.) with Q&A pairs.
 */

import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import type { NewFAQ } from '../../db/schema.js';
import { slugify, cleanText } from './utils.js';

export interface ParsedFAQ {
  slug: string;
  title: string;
  category: string;
  section: string;
  question: string;
  answer: string;
  effectiveDate: Date | null;
  sourceUrl: string;
}

/**
 * Generate a unique slug for an FAQ entry.
 * Uses the section name and MD5 hash of the question to ensure uniqueness.
 */
function generateFaqSlug(section: string, question: string): string {
  const hash = createHash('md5').update(question).digest('hex').slice(0, 8);
  const sectionSlug = slugify(section);
  return `core-${sectionSlug}-${hash}`;
}

/**
 * Extract the effective date from the FAQ page.
 * Wahapedia typically displays this at the top in a table or header.
 */
export function extractEffectiveDate(html: string): Date | null {
  const $ = cheerio.load(html);

  // Look for date patterns in the page
  // Common formats: "Effective: January 2025", "Updated: 15 January 2025", etc.
  const datePatterns = [
    /effective[:\s]+(\d{1,2}[\s/-]?\w+[\s/-]?\d{4})/i,
    /updated[:\s]+(\d{1,2}[\s/-]?\w+[\s/-]?\d{4})/i,
    /version[:\s]+.*?(\d{1,2}[\s/-]?\w+[\s/-]?\d{4})/i,
    /(\w+\s+\d{4})/i, // Month Year format
    /(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i, // DD/MM/YYYY or similar
  ];

  // Check table cells first (Wahapedia often puts metadata in tables)
  const tableText = $('table').first().text();
  for (const pattern of datePatterns) {
    const match = tableText.match(pattern);
    if (match?.[1]) {
      const parsed = parseDate(match[1]);
      if (parsed) return parsed;
    }
  }

  // Check page header area
  const headerText = $('h1, h2, .header, .title').text();
  for (const pattern of datePatterns) {
    const match = headerText.match(pattern);
    if (match?.[1]) {
      const parsed = parseDate(match[1]);
      if (parsed) return parsed;
    }
  }

  // Search in body text near the top
  const bodyText = $('body').text().slice(0, 2000);
  for (const pattern of datePatterns) {
    const match = bodyText.match(pattern);
    if (match?.[1]) {
      const parsed = parseDate(match[1]);
      if (parsed) return parsed;
    }
  }

  return null;
}

/**
 * Parse a date string into a Date object.
 */
function parseDate(dateStr: string): Date | null {
  const cleaned = dateStr.trim();

  // Try standard date parsing
  const date = new Date(cleaned);
  if (!isNaN(date.getTime())) {
    return date;
  }

  // Try parsing "Month Year" format
  const monthYearMatch = cleaned.match(/(\w+)\s+(\d{4})/);
  if (monthYearMatch) {
    const monthStr = monthYearMatch[1];
    const year = parseInt(monthYearMatch[2]!, 10);
    const monthIndex = getMonthIndex(monthStr!);
    if (monthIndex !== -1) {
      return new Date(year, monthIndex, 1);
    }
  }

  // Try parsing "DD Month YYYY" format
  const dayMonthYearMatch = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (dayMonthYearMatch) {
    const day = parseInt(dayMonthYearMatch[1]!, 10);
    const monthStr = dayMonthYearMatch[2];
    const year = parseInt(dayMonthYearMatch[3]!, 10);
    const monthIndex = getMonthIndex(monthStr!);
    if (monthIndex !== -1) {
      return new Date(year, monthIndex, day);
    }
  }

  return null;
}

/**
 * Get month index (0-11) from month name.
 */
function getMonthIndex(monthStr: string): number {
  const months: Record<string, number> = {
    january: 0, jan: 0,
    february: 1, feb: 1,
    march: 2, mar: 2,
    april: 3, apr: 3,
    may: 4,
    june: 5, jun: 5,
    july: 6, jul: 6,
    august: 7, aug: 7,
    september: 8, sep: 8, sept: 8,
    october: 9, oct: 9,
    november: 10, nov: 10,
    december: 11, dec: 11,
  };
  return months[monthStr.toLowerCase()] ?? -1;
}

/**
 * Parse FAQ page HTML and extract Q&A pairs.
 */
export function parseFAQPage(html: string, sourceUrl: string): ParsedFAQ[] {
  const $ = cheerio.load(html);
  const faqs: ParsedFAQ[] = [];
  const effectiveDate = extractEffectiveDate(html);

  // Wahapedia FAQ structure typically has:
  // - Section headers as <h3> or similar
  // - Q&A pairs with <strong>Q:</strong> and <strong>A:</strong>

  const body = $('body');

  // Parse Q&A pairs
  // Look for patterns like: Q: question text A: answer text

  // Strategy 1: Look for Q:/A: markers in strong tags
  const qElements = $('strong, b').filter((_, el) => {
    const text = $(el).text().trim().toUpperCase();
    return text === 'Q:' || text === 'Q';
  });

  qElements.each((_, qEl) => {
    const $q = $(qEl);

    // Get the question text - it's typically in an <em> or <i> tag after Q:
    let questionText = '';
    const nextSibling = $q.next();
    if (nextSibling.is('em, i')) {
      questionText = cleanText(nextSibling.text());
    } else {
      // Question might be inline text after Q:
      const parent = $q.parent();
      const parentText = cleanText(parent.text());
      const qIndex = parentText.indexOf('Q:');
      const aIndex = parentText.indexOf('A:');
      if (qIndex !== -1 && aIndex !== -1 && aIndex > qIndex) {
        questionText = cleanText(parentText.slice(qIndex + 2, aIndex));
      } else if (qIndex !== -1) {
        // No A: in same parent, get text until end or next element
        questionText = cleanText(parentText.slice(qIndex + 2));
      }
    }

    if (!questionText) return;

    // Find the closest section header before this Q:
    let foundSection = 'General';
    $q.prevAll('h1, h2, h3, h4, h5, h6').each((_, hEl) => {
      const text = cleanText($(hEl).text());
      if (text.length > 1 && text.length < 100 && !text.startsWith('Q:')) {
        foundSection = text;
        return false; // Stop at first found header
      }
    });

    // Also check parent's previous siblings
    if (foundSection === 'General') {
      $q.parent().prevAll('h1, h2, h3, h4, h5, h6').each((_, hEl) => {
        const text = cleanText($(hEl).text());
        if (text.length > 1 && text.length < 100 && !text.startsWith('Q:')) {
          foundSection = text;
          return false;
        }
      });
    }

    // Find the answer - look for A: marker following the question
    let answerText = '';
    const $parent = $q.parent();
    const aMarker = $parent.find('strong, b').filter((_, el) => {
      const text = $(el).text().trim().toUpperCase();
      return text === 'A:' || text === 'A';
    });

    if (aMarker.length > 0) {
      // Get text after A: marker
      const $a = $(aMarker.first());
      const aNext = $a.next();
      if (aNext.length) {
        answerText = cleanText(aNext.text());
      } else {
        // Answer might be inline
        const parentText = cleanText($parent.text());
        const aIndex = parentText.toUpperCase().indexOf('A:');
        if (aIndex !== -1) {
          answerText = cleanText(parentText.slice(aIndex + 2));
        }
      }
    } else {
      // Try to find A: in next sibling element
      const nextEl = $parent.next();
      const nextText = cleanText(nextEl.text());
      if (nextText.toUpperCase().startsWith('A:')) {
        answerText = cleanText(nextText.slice(2));
      }
    }

    // Only add if we have both question and answer
    if (questionText && answerText) {
      faqs.push({
        slug: generateFaqSlug(foundSection, questionText),
        title: questionText.slice(0, 100),
        category: 'core',
        section: foundSection,
        question: questionText,
        answer: answerText,
        effectiveDate,
        sourceUrl,
      });
    }
  });

  // Strategy 2: If no Q&A found with strategy 1, try parsing text blocks
  if (faqs.length === 0) {
    // Get all text content and look for Q:/A: patterns
    const bodyText = cleanText(body.text());

    // Split by Q: to find questions
    const parts = bodyText.split(/(?=Q:)/i);

    for (const part of parts) {
      if (!part.toUpperCase().startsWith('Q:')) continue;

      // Find Q: and A: in this part
      const aIndex = part.toUpperCase().indexOf('A:');
      if (aIndex === -1) continue;

      const questionText = cleanText(part.slice(2, aIndex));
      const answerText = cleanText(part.slice(aIndex + 2));

      // Find next Q: or end of text for answer boundary
      const nextQIndex = answerText.toUpperCase().indexOf('Q:');
      const finalAnswer = nextQIndex !== -1
        ? cleanText(answerText.slice(0, nextQIndex))
        : answerText;

      if (questionText && finalAnswer) {
        faqs.push({
          slug: generateFaqSlug('General', questionText),
          title: questionText.slice(0, 100),
          category: 'core',
          section: 'General',
          question: questionText,
          answer: finalAnswer,
          effectiveDate,
          sourceUrl,
        });
      }
    }
  }

  return faqs;
}

/**
 * Convert ParsedFAQ to NewFAQ for database insertion.
 */
export function toNewFAQ(parsed: ParsedFAQ): Omit<NewFAQ, 'id'> {
  return {
    slug: parsed.slug,
    title: parsed.title,
    category: parsed.category,
    factionId: null, // Core FAQs have no faction
    question: parsed.question,
    answer: parsed.answer,
    content: null, // Q&A format, not freeform content
    effectiveDate: parsed.effectiveDate,
    sourceUrl: parsed.sourceUrl,
    dataSource: 'wahapedia' as const,
  };
}
