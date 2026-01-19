import React from 'react';
import type { Stratagem } from '../types';
import { ConfidenceBadge } from './ConfidenceBadge';

interface StratagemListProps {
  stratagems: Stratagem[];
  playerIndex?: number;
  onSeekToTimestamp?: (seconds: number) => void;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function StratagemList({
  stratagems,
  playerIndex,
  onSeekToTimestamp,
}: StratagemListProps): React.ReactElement | null {
  const filteredStratagems =
    playerIndex !== undefined
      ? stratagems.filter((s) => s.playerIndex === playerIndex)
      : stratagems;

  if (filteredStratagems.length === 0) {
    return null;
  }

  const handleSeek = (seconds: number): void => {
    if (onSeekToTimestamp) {
      onSeekToTimestamp(seconds);
    }
  };

  return (
    <div>
      <div className="section-title">Stratagems ({filteredStratagems.length})</div>
      <div className="unit-list">
        {filteredStratagems.map((stratagem, index) => (
          <div key={`${stratagem.name}-${index}`} className="unit-item">
            <span className="unit-name" style={{ color: '#a855f7' }}>
              {stratagem.name}
            </span>
            {stratagem.videoTimestamp !== undefined && onSeekToTimestamp && (
              <button
                onClick={() => handleSeek(stratagem.videoTimestamp!)}
                className="timestamp-button"
                title="Jump to this moment in the video"
              >
                {formatTimestamp(stratagem.videoTimestamp)}
              </button>
            )}
            <ConfidenceBadge level={stratagem.confidence} />
          </div>
        ))}
      </div>
    </div>
  );
}
