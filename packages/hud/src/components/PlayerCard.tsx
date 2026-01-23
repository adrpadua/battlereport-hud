import React from 'react';
import type { Player, Stratagem, Enhancement } from '../types';
import { ConfidenceBadge } from './ConfidenceBadge';
import { FactionCard } from './FactionCard';
import { DetachmentCard } from './DetachmentCard';
import { UnitList } from './UnitList';
import { StratagemList } from './StratagemList';
import { EnhancementList } from './EnhancementList';

interface PlayerCardProps {
  player: Player;
  playerIndex: number;
  stratagems: Stratagem[];
  enhancements?: Enhancement[];
  onSeekToTimestamp?: (seconds: number) => void;
  onOpenDetail?: (unitName: string, faction: string) => void;
  onSearchCorrection?: (unitName: string, faction: string, unitIndex: number) => void;
}

export function PlayerCard({
  player,
  playerIndex,
  stratagems,
  enhancements = [],
  onSeekToTimestamp,
  onOpenDetail,
  onSearchCorrection,
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
        <div className="player-name">{player.name}</div>
        <ConfidenceBadge level={player.confidence} />
      </div>

      <FactionCard faction={player.faction} />

      {player.detachment && (
        <DetachmentCard
          detachmentName={player.detachment}
          faction={player.faction}
        />
      )}

      <UnitList playerIndex={playerIndex} playerFaction={player.faction} onSeekToTimestamp={onSeekToTimestamp} onOpenDetail={onOpenDetail} onSearchCorrection={onSearchCorrection} />
      <StratagemList stratagems={stratagems} playerIndex={playerIndex} onSeekToTimestamp={onSeekToTimestamp} />
      <EnhancementList enhancements={enhancements} playerIndex={playerIndex} onSeekToTimestamp={onSeekToTimestamp} />
    </div>
  );
}
