import React from 'react';
import { RuleText } from './RuleText';

export interface AbilityDescriptionProps {
  /** The raw description text to parse and render */
  description: string;
  /** Additional CSS class */
  className?: string;
}

/**
 * Renders ability description text with:
 * - Keyword brackets [LETHAL HITS] as styled badges with tooltips
 * - ALL-CAPS unit keywords (TYRANIDS, INFANTRY, etc.) as bold text
 * - Plain text rendered as-is
 *
 * This is a thin wrapper around the shared RuleText component.
 */
export function AbilityDescription({
  description,
  className = '',
}: AbilityDescriptionProps): React.ReactElement {
  return <RuleText text={description} className={`ability-description-parsed ${className}`} />;
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
