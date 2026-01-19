import React from 'react';
import type { ConfidenceLevel } from '@/types/battle-report';

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
}

export function ConfidenceBadge({ level }: ConfidenceBadgeProps): React.ReactElement {
  const className = `confidence-badge confidence-${level}`;

  return <span className={className}>{level}</span>;
}
