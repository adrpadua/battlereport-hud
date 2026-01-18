import React from 'react';
import type { Unit } from '@/types/battle-report';
import { ConfidenceBadge } from './ConfidenceBadge';
import { useBattleStore } from '@/store/battle-store';

interface UnitListProps {
  units: Unit[];
  playerIndex: number;
}

export function UnitList({ units, playerIndex }: UnitListProps): React.ReactElement | null {
  const acceptSuggestion = useBattleStore((state) => state.acceptSuggestion);
  const allUnits = useBattleStore((state) => state.report?.units ?? []);
  const playerUnits = units.filter((u) => u.playerIndex === playerIndex);

  if (playerUnits.length === 0) {
    return null;
  }

  // Get the actual index in the full units array for a player unit
  const getUnitIndex = (unit: Unit): number => {
    return allUnits.findIndex(
      (u) => u.name === unit.name && u.playerIndex === unit.playerIndex
    );
  };

  const handleAcceptSuggestion = (unit: Unit): void => {
    const unitIndex = getUnitIndex(unit);
    if (unitIndex !== -1) {
      acceptSuggestion(unitIndex);
    }
  };

  return (
    <div>
      <div className="section-title">Units ({playerUnits.length})</div>
      <div className="unit-list">
        {playerUnits.map((unit, index) => (
          <div key={`${unit.name}-${index}`} className="unit-item-container">
            <div className="unit-item">
              <span className="unit-name">
                {unit.name}
                {unit.pointsCost && (
                  <span style={{ color: '#888', marginLeft: '4px' }}>
                    ({unit.pointsCost}pts)
                  </span>
                )}
                {unit.isValidated && (
                  <span style={{ color: '#4ade80', marginLeft: '4px' }} title="Validated against BSData">
                    ✓
                  </span>
                )}
              </span>
              <ConfidenceBadge level={unit.confidence} />
            </div>
            {/* Show suggestion for non-validated units with medium/low confidence */}
            {!unit.isValidated && unit.suggestedMatch && (
              <div className="unit-suggestion">
                <span className="suggestion-label">Did you mean:</span>
                <span className="suggestion-name">{unit.suggestedMatch.name}</span>
                <span className="suggestion-confidence">
                  ({Math.round(unit.suggestedMatch.confidence * 100)}% match)
                </span>
                <button
                  className="suggestion-accept-btn"
                  onClick={() => handleAcceptSuggestion(unit)}
                  title="Accept this suggestion"
                >
                  ✓ Accept
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
