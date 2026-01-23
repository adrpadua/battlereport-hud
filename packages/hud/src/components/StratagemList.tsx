import React from 'react';
import type { Stratagem } from '../types';
import { StratagemCard } from './StratagemCard';

interface StratagemListProps {
  stratagems: Stratagem[];
  playerIndex?: number;
  faction?: string;
  onSeekToTimestamp?: (seconds: number) => void;
}

export function StratagemList({
  stratagems,
  playerIndex,
  faction,
  onSeekToTimestamp,
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
      <div className="stratagem-list">
        {filteredStratagems.map((stratagem, index) => (
          <StratagemCard
            key={`${stratagem.name}-${index}`}
            stratagem={stratagem}
            faction={faction}
            onSeekToTimestamp={onSeekToTimestamp}
          />
        ))}
      </div>
    </div>
  );
}
