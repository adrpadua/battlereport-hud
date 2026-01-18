import React from 'react';
import type { Unit } from '@/types/battle-report';
import { ConfidenceBadge } from './ConfidenceBadge';

interface UnitListProps {
  units: Unit[];
  playerIndex: number;
}

export function UnitList({ units, playerIndex }: UnitListProps): React.ReactElement | null {
  const playerUnits = units.filter((u) => u.playerIndex === playerIndex);

  if (playerUnits.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="section-title">Units ({playerUnits.length})</div>
      <div className="unit-list">
        {playerUnits.map((unit, index) => (
          <div key={`${unit.name}-${index}`} className="unit-item">
            <span className="unit-name">
              {unit.name}
              {unit.pointsCost && (
                <span style={{ color: '#888', marginLeft: '4px' }}>
                  ({unit.pointsCost}pts)
                </span>
              )}
            </span>
            <ConfidenceBadge level={unit.confidence} />
          </div>
        ))}
      </div>
    </div>
  );
}
