import React, { useMemo } from 'react';
import { parseAbilityDescription, normalizeKeyword } from '../utils/text-parser';
import { KeywordBadge } from './KeywordBadge';
import { Tooltip } from './Tooltip';
import { getCachedKeywordDescription } from '../hooks/useKeywordDescription';

export interface AbilityDescriptionProps {
  /** The raw description text to parse and render */
  description: string;
  /** Additional CSS class */
  className?: string;
}

/**
 * Renders ability description text with:
 * - Keyword brackets [LETHAL HITS] as styled badges with tooltips
 * - Markdown links [text](url) as styled text (removes the URL)
 * - Plain text rendered as-is
 */
export function AbilityDescription({
  description,
  className = '',
}: AbilityDescriptionProps): React.ReactElement {
  const segments = useMemo(
    () => parseAbilityDescription(description),
    [description]
  );

  return (
    <span className={`ability-description-parsed ${className}`}>
      {segments.map((segment, index) => {
        switch (segment.type) {
          case 'text':
            return <span key={index}>{segment.content}</span>;

          case 'keyword': {
            const normalized = normalizeKeyword(segment.content);
            const desc = getCachedKeywordDescription(normalized);
            return (
              <KeywordBadge
                key={index}
                keyword={normalized}
                description={desc}
                inline
              />
            );
          }

          case 'unit-keyword':
            // Render ALL-CAPS unit keywords as bold text
            return (
              <strong key={index} className="ability-unit-keyword">
                {segment.content}
              </strong>
            );

          case 'link':
            // Render link text styled, without the actual URL
            // For wahapedia links, we just show the text
            return (
              <Tooltip
                key={index}
                content={segment.text}
                position="top"
              >
                <span className="ability-link-text">{segment.text}</span>
              </Tooltip>
            );

          default:
            return null;
        }
      })}
    </span>
  );
}

/**
 * Simpler version that just cleans up description without fancy rendering.
 * Useful for tooltips or places where we don't want complex markup.
 */
export function cleanDescription(description: string): string {
  if (!description) return '';

  let cleaned = description;

  // Remove markdown links but keep the text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove escaped brackets
  cleaned = cleaned.replace(/\\?\[([A-Z][A-Z\s\d+-]*)\]\\?/g, '[$1]');

  return cleaned;
}
