import React from 'react';
import type { Stratagem } from '@/types/battle-report';
import { ConfidenceBadge } from './ConfidenceBadge';

interface StratagemListProps {
  stratagems: Stratagem[];
  playerIndex?: number;
}

export function StratagemList({
  stratagems,
  playerIndex,
}: StratagemListProps): React.ReactElement | null {
  const filteredStratagems =
    playerIndex !== undefined
      ? stratagems.filter((s) => s.playerIndex === playerIndex)
      : stratagems;

  if (filteredStratagems.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="section-title">Stratagems ({filteredStratagems.length})</div>
      <div className="unit-list">
        {filteredStratagems.map((stratagem, index) => (
          <div key={`${stratagem.name}-${index}`} className="unit-item">
            <span className="unit-name" style={{ color: '#a855f7' }}>
              {stratagem.name}
            </span>
            <ConfidenceBadge level={stratagem.confidence} />
          </div>
        ))}
      </div>
    </div>
  );
}
