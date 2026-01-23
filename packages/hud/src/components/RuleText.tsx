import React, { useMemo } from 'react';
import { KeywordBadge } from './KeywordBadge';
import { getCachedKeywordDescription } from '../hooks/useKeywordDescription';

export type RuleSegment =
  | { type: 'text'; content: string }
  | { type: 'keyword'; keyword: string }
  | { type: 'unit-keyword'; content: string };

/**
 * Parse plain text to extract ALL-CAPS unit keywords (like TYRANIDS, INFANTRY).
 * Matches words of 2+ uppercase letters, including hyphenated words.
 */
function parseUnitKeywordsInText(text: string): RuleSegment[] {
  if (!text) return [];

  const segments: RuleSegment[] = [];

  // Pattern to match ALL-CAPS words (2+ chars, may include hyphens)
  // Matches: TYRANIDS, INFANTRY, BATTLE-SHOCKED, etc.
  const unitKeywordPattern = /\b([A-Z][A-Z-]+(?:\s+[A-Z][A-Z-]+)*)\b/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = unitKeywordPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'unit-keyword', content: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}

// Known concatenated keyword mappings
const KEYWORD_MAPPINGS: Record<string, string> = {
  SUSTAINEDHITS: 'SUSTAINED HITS',
  LETHALHITS: 'LETHAL HITS',
  DEVASTATINGWOUNDS: 'DEVASTATING WOUNDS',
  RAPIDFIRE: 'RAPID FIRE',
  IGNORESCOVER: 'IGNORES COVER',
  INDIRECTFIRE: 'INDIRECT FIRE',
  ONESHOT: 'ONE SHOT',
  FEELNOPAIN: 'FEEL NO PAIN',
  DEADLYDEMISE: 'DEADLY DEMISE',
  DEEPSTRIKE: 'DEEP STRIKE',
  FIGHTSFIRST: 'FIGHTS FIRST',
  LONEOPERATIVE: 'LONE OPERATIVE',
  FIRINGDECK: 'FIRING DECK',
  TWINLINKED: 'TWIN-LINKED',
  EXTRAATTACKS: 'EXTRA ATTACKS',
  ANTIVEHICLE: 'ANTI-VEHICLE',
  ANTIINFANTRY: 'ANTI-INFANTRY',
  ANTIMONSTER: 'ANTI-MONSTER',
  ANTITITAN: 'ANTI-TITAN',
  ANTIFLY: 'ANTI-FLY',
};

/**
 * Normalize concatenated keyword names.
 * e.g., "SUSTAINEDHITS1" -> "SUSTAINED HITS 1"
 */
function normalizeKeywordName(keyword: string): string {
  const match = keyword.match(/^([A-Z]+)(\d+.*)?$/);
  if (!match) return keyword;

  const base = match[1];
  const suffix = match[2] || '';

  const normalized = KEYWORD_MAPPINGS[base] || base;
  return suffix ? `${normalized} ${suffix}` : normalized;
}

/**
 * Parse rule text into segments of plain text, keywords, and unit keywords.
 *
 * Handles:
 * - Markdown links [text](url) -> plain text
 * - Markdown images ![alt](url) -> removed
 * - Markdown bold **text** -> plain text
 * - Escaped keyword brackets \[KEYWORD\] -> keyword badge
 * - Regular keyword brackets [KEYWORD] -> keyword badge
 * - ALL-CAPS unit keywords -> bold text
 */
export function parseRuleText(text: string): RuleSegment[] {
  let processed = text;

  // Remove image markdown
  processed = processed.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
  // Convert markdown links [text](url) to plain text (url can be empty)
  processed = processed.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Convert markdown bold to plain text
  processed = processed.replace(/\*\*([^*]+)\*\*/g, '$1');
  // Remove table markdown formatting
  processed = processed.replace(/^\|[-:\s|]+\|$/gm, '');
  processed = processed.replace(/^\s*\|.*\|\s*$/gm, '');
  // Clean up excessive newlines
  processed = processed.replace(/\n{3,}/g, '\n\n');

  // Parse for keyword brackets: \[KEYWORD\] or [KEYWORD]
  const keywordPattern = /\\?\[([A-Z][A-Z0-9\s+-]*)\\?\]/g;
  const segments: RuleSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = keywordPattern.exec(processed)) !== null) {
    // Add text before the keyword (parse for unit keywords)
    if (match.index > lastIndex) {
      const textContent = processed.slice(lastIndex, match.index);
      segments.push(...parseUnitKeywordsInText(textContent));
    }
    // Add the keyword badge
    const normalized = normalizeKeywordName(match[1]);
    segments.push({ type: 'keyword', keyword: normalized });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text (parse for unit keywords)
  if (lastIndex < processed.length) {
    segments.push(...parseUnitKeywordsInText(processed.slice(lastIndex)));
  }

  return segments;
}

export interface RuleTextProps {
  /** The raw text to parse and render */
  text: string;
  /** Additional CSS class */
  className?: string;
}

/**
 * Renders rule text with:
 * - Keyword brackets [KEYWORD] as styled badges with tooltips
 * - ALL-CAPS unit keywords (TYRANIDS, INFANTRY, etc.) as bold text
 * - Plain text rendered as-is
 */
export function RuleText({ text, className = '' }: RuleTextProps): React.ReactElement {
  const segments = useMemo(() => parseRuleText(text), [text]);

  return (
    <span className={className}>
      {segments.map((segment, index) => {
        switch (segment.type) {
          case 'text':
            return <span key={index}>{segment.content}</span>;

          case 'keyword': {
            const desc = getCachedKeywordDescription(segment.keyword);
            return (
              <KeywordBadge
                key={index}
                keyword={segment.keyword}
                description={desc}
                inline
              />
            );
          }

          case 'unit-keyword':
            return (
              <strong key={index} className="rule-unit-keyword">
                {segment.content}
              </strong>
            );

          default:
            return null;
        }
      })}
    </span>
  );
}
