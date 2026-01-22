import React from 'react';
import { UnitCell } from './UnitCell';
import { useBattleStore } from '../store/battle-store';

interface UnitListProps {
  playerIndex: number;
  onSeekToTimestamp?: (seconds: number) => void;
}

export function UnitList({ playerIndex, onSeekToTimestamp }: UnitListProps): React.ReactElement | null {
  const acceptSuggestion = useBattleStore((state) => state.acceptSuggestion);
  const allUnits = useBattleStore((state) => state.report?.units ?? []);

  // Filter units for this player, with their original indices
  const playerUnitsWithIndex = allUnits
    .map((unit, index) => ({ unit, index }))
    .filter(({ unit }) => unit.playerIndex === playerIndex);

  if (playerUnitsWithIndex.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="section-title">Units ({playerUnitsWithIndex.length})</div>
      <div className="unit-list">
        {playerUnitsWithIndex.map(({ unit, index }) => (
          <UnitCell
            key={`${unit.name}-${index}`}
            unit={unit}
            unitIndex={index}
            onSeekToTimestamp={onSeekToTimestamp}
            onAcceptSuggestion={acceptSuggestion}
          />
        ))}
      </div>
    </div>
  );
}
