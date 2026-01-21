import React from 'react';
import type { Player, Stratagem, Enhancement } from '../types';
import { ConfidenceBadge } from './ConfidenceBadge';
import { UnitList } from './UnitList';
import { StratagemList } from './StratagemList';
import { EnhancementList } from './EnhancementList';

interface PlayerCardProps {
  player: Player;
  playerIndex: number;
  stratagems: Stratagem[];
  enhancements?: Enhancement[];
  onSeekToTimestamp?: (seconds: number) => void;
}

export function PlayerCard({
  player,
  playerIndex,
  stratagems,
  enhancements = [],
  onSeekToTimestamp,
}: PlayerCardProps): React.ReactElement {
  // Choose a color based on player index
  const playerColors = ['#3b82f6', '#ef4444']; // Blue, Red
  const accentColor = playerColors[playerIndex] || playerColors[0];

  return (
    <div
      className="player-card"
      style={{ borderLeft: `3px solid ${accentColor}` }}
    >
      <div className="player-header">
        <div>
          <div className="player-name">{player.name}</div>
          <div className="player-faction">{player.faction}</div>
          {player.detachment && (
            <div className="player-detachment">{player.detachment}</div>
          )}
        </div>
        <ConfidenceBadge level={player.confidence} />
      </div>

      <UnitList playerIndex={playerIndex} onSeekToTimestamp={onSeekToTimestamp} />
      <StratagemList stratagems={stratagems} playerIndex={playerIndex} onSeekToTimestamp={onSeekToTimestamp} />
      <EnhancementList enhancements={enhancements} playerIndex={playerIndex} onSeekToTimestamp={onSeekToTimestamp} />
    </div>
  );
}
