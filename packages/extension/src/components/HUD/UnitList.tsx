import React from 'react';
import { ConfidenceBadge } from './ConfidenceBadge';
import { useBattleStore } from '@/store/battle-store';

interface UnitListProps {
  playerIndex: number;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function seekToTimestamp(seconds: number): void {
  const video = document.querySelector('video');
  if (video) {
    video.currentTime = seconds;
  }
}

export function UnitList({ playerIndex }: UnitListProps): React.ReactElement | null {
  const acceptSuggestion = useBattleStore((state) => state.acceptSuggestion);
  const allUnits = useBattleStore((state) => state.report?.units ?? []);

  // Filter units for this player, with their original indices
  const playerUnitsWithIndex = allUnits
    .map((unit, index) => ({ unit, index }))
    .filter(({ unit }) => unit.playerIndex === playerIndex);

  if (playerUnitsWithIndex.length === 0) {
    return null;
  }

  const handleAcceptSuggestion = (unitIndex: number): void => {
    acceptSuggestion(unitIndex);
  };

  return (
    <div>
      <div className="section-title">Units ({playerUnitsWithIndex.length})</div>
      <div className="unit-list">
        {playerUnitsWithIndex.map(({ unit, index }) => (
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
              {unit.videoTimestamp !== undefined && (
                <button
                  onClick={() => seekToTimestamp(unit.videoTimestamp!)}
                  className="timestamp-button"
                  title="Jump to this moment in the video"
                >
                  {formatTimestamp(unit.videoTimestamp)}
                </button>
              )}
              <ConfidenceBadge level={unit.confidence} />
            </div>
            {/* Show suggestion for non-validated units */}
            {!unit.isValidated && unit.suggestedMatch && (
              <div className="unit-suggestion">
                <span className="suggestion-label">Did you mean:</span>
                <span className="suggestion-name">{unit.suggestedMatch.name}</span>
                <span className="suggestion-confidence">
                  ({Math.round(unit.suggestedMatch.confidence * 100)}% match)
                </span>
                <button
                  className="suggestion-accept-btn"
                  onClick={() => handleAcceptSuggestion(index)}
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
