import React, { useMemo } from 'react';
import type { Stratagem } from '../types';
import { StratagemCard } from './StratagemCard';

interface StratagemListProps {
  stratagems: Stratagem[];
  playerIndex?: number;
  faction?: string;
  onSeekToTimestamp?: (seconds: number) => void;
}

// Group stratagems by name and collect all timestamps
function groupStratagemsByName(stratagems: Stratagem[]): { stratagem: Stratagem; timestamps: number[] }[] {
  const groupMap = new Map<string, { stratagem: Stratagem; timestamps: number[] }>();

  for (const stratagem of stratagems) {
    const key = stratagem.name.toLowerCase();
    const existing = groupMap.get(key);

    if (existing) {
      // Add timestamp if present and not already included
      if (stratagem.videoTimestamp !== undefined) {
        existing.timestamps.push(stratagem.videoTimestamp);
      }
      // Keep the stratagem with the most data (validated preferred)
      if (stratagem.isValidated && !existing.stratagem.isValidated) {
        existing.stratagem = stratagem;
      }
    } else {
      groupMap.set(key, {
        stratagem,
        timestamps: stratagem.videoTimestamp !== undefined ? [stratagem.videoTimestamp] : [],
      });
    }
  }

  // Sort timestamps within each group and return as array
  return Array.from(groupMap.values()).map((group) => ({
    ...group,
    timestamps: group.timestamps.sort((a, b) => a - b),
  }));
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

  // Group stratagems by name, combining timestamps for duplicates
  const groupedStratagems = useMemo(
    () => groupStratagemsByName(filteredStratagems),
    [filteredStratagems]
  );

  if (groupedStratagems.length === 0) {
    return null;
  }

  // Count total uses (sum of all timestamps)
  const totalUses = groupedStratagems.reduce(
    (sum, group) => sum + Math.max(1, group.timestamps.length),
    0
  );

  return (
    <div>
      <div className="section-title">Stratagems ({totalUses})</div>
      <div className="stratagem-list">
        {groupedStratagems.map(({ stratagem, timestamps }) => (
          <StratagemCard
            key={stratagem.name}
            stratagem={stratagem}
            timestamps={timestamps}
            faction={faction}
            onSeekToTimestamp={onSeekToTimestamp}
          />
        ))}
      </div>
    </div>
  );
}
