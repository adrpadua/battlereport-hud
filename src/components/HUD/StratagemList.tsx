import React from 'react';
import type { Stratagem } from '@/types/battle-report';
import { ConfidenceBadge } from './ConfidenceBadge';

interface StratagemListProps {
  stratagems: Stratagem[];
  playerIndex?: number;
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
            {stratagem.videoTimestamp !== undefined && (
              <button
                onClick={() => seekToTimestamp(stratagem.videoTimestamp!)}
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
