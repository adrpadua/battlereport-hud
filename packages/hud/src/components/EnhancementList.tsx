import React from 'react';
import type { Enhancement } from '../types';
import { ConfidenceBadge } from './ConfidenceBadge';

interface EnhancementListProps {
  enhancements: Enhancement[];
  playerIndex?: number;
  onSeekToTimestamp?: (seconds: number) => void;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function EnhancementList({
  enhancements,
  playerIndex,
  onSeekToTimestamp,
}: EnhancementListProps): React.ReactElement | null {
  const filteredEnhancements =
    playerIndex !== undefined
      ? enhancements.filter((e) => e.playerIndex === playerIndex)
      : enhancements;

  if (filteredEnhancements.length === 0) {
    return null;
  }

  const handleSeek = (seconds: number): void => {
    if (onSeekToTimestamp) {
      onSeekToTimestamp(seconds);
    }
  };

  return (
    <div>
      <div className="section-title">Enhancements ({filteredEnhancements.length})</div>
      <div className="unit-list">
        {filteredEnhancements.map((enhancement, index) => (
          <div key={`${enhancement.name}-${index}`} className="unit-item">
            <span className="unit-name" style={{ color: '#f59e0b' }}>
              {enhancement.name}
            </span>
            {enhancement.pointsCost !== undefined && (
              <span className="points-cost" style={{ color: '#9ca3af', marginLeft: '4px' }}>
                ({enhancement.pointsCost}pts)
              </span>
            )}
            {enhancement.detachment && (
              <span className="detachment-tag" style={{ color: '#6b7280', marginLeft: '4px', fontSize: '0.85em' }}>
                [{enhancement.detachment}]
              </span>
            )}
            {enhancement.videoTimestamp !== undefined && onSeekToTimestamp && (
              <button
                onClick={() => handleSeek(enhancement.videoTimestamp!)}
                className="timestamp-button"
                title="Jump to this moment in the video"
              >
                {formatTimestamp(enhancement.videoTimestamp)}
              </button>
            )}
            <ConfidenceBadge level={enhancement.confidence} />
          </div>
        ))}
      </div>
    </div>
  );
}
