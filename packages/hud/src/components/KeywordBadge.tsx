import React from 'react';
import { Tooltip } from './Tooltip';
import { getKeywordVariant } from '../utils/text-parser';

export type KeywordVariant = 'weapon' | 'core' | 'faction' | 'unit';

export interface KeywordBadgeProps {
  /** The keyword text to display (e.g., "LETHAL HITS") */
  keyword: string;
  /** Optional description to show in tooltip */
  description?: string | null;
  /** Badge variant for styling */
  variant?: KeywordVariant;
  /** Whether to auto-detect variant from keyword */
  autoVariant?: boolean;
  /** Whether to show as inline (smaller, within text) */
  inline?: boolean;
}

/**
 * A styled badge for displaying Warhammer 40k keywords.
 * Shows tooltip with description on hover.
 */
export function KeywordBadge({
  keyword,
  description,
  variant,
  autoVariant = true,
  inline = false,
}: KeywordBadgeProps): React.ReactElement {
  // Determine variant: explicit, auto-detected, or default
  const resolvedVariant = variant ?? (autoVariant ? getKeywordVariant(keyword) : 'unit');

  const badge = (
    <span
      className={`keyword-badge keyword-badge--${resolvedVariant} ${inline ? 'keyword-badge--inline' : ''}`}
    >
      {keyword}
    </span>
  );

  if (description) {
    return (
      <Tooltip content={description} position="top">
        {badge}
      </Tooltip>
    );
  }

  return badge;
}

/**
 * Render multiple keywords as badges.
 */
export function KeywordBadgeList({
  keywords,
  descriptions = {},
  variant,
  inline = false,
}: {
  keywords: string[];
  descriptions?: Record<string, string | null>;
  variant?: KeywordVariant;
  inline?: boolean;
}): React.ReactElement {
  return (
    <span className="keyword-badge-list">
      {keywords.map((keyword, index) => (
        <KeywordBadge
          key={`${keyword}-${index}`}
          keyword={keyword}
          description={descriptions[keyword] ?? descriptions[keyword.toUpperCase()]}
          variant={variant}
          inline={inline}
        />
      ))}
    </span>
  );
}
