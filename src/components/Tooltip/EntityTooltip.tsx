import React from 'react';
import type { Unit, Stratagem } from '@/types/battle-report';
import { ConfidenceBadge } from '../HUD/ConfidenceBadge';

interface EntityTooltipProps {
  entity: Unit | Stratagem | null;
  playerName?: string;
  playerFaction?: string;
  x: number;
  y: number;
  visible: boolean;
}

export function EntityTooltip({
  entity,
  playerName,
  playerFaction,
  x,
  y,
  visible,
}: EntityTooltipProps): React.ReactElement | null {
  if (!visible || !entity) {
    return null;
  }

  const isUnit = 'playerIndex' in entity && entity.playerIndex !== undefined;

  // Position tooltip above cursor with offset
  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y - 10,
    transform: 'translate(-50%, -100%)',
    zIndex: 9999,
    maxWidth: 300,
    background: '#242424',
    border: '1px solid #3a3a3a',
    borderRadius: 8,
    padding: 12,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
    pointerEvents: 'none',
    fontFamily: "'Roboto', 'YouTube Noto', Arial, sans-serif",
    fontSize: 14,
    color: '#e5e5e5',
  };

  return (
    <div style={style}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            color: isUnit ? '#22c55e' : '#a855f7',
          }}
        >
          {entity.name}
        </span>
        <ConfidenceBadge level={entity.confidence} />
      </div>

      <div style={{ fontSize: 12, color: '#888' }}>
        {isUnit ? 'Unit' : 'Stratagem'}
      </div>

      {playerName && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <span style={{ color: '#888' }}>Player: </span>
          <span style={{ color: '#fff' }}>{playerName}</span>
          {playerFaction && (
            <span style={{ color: '#888' }}> ({playerFaction})</span>
          )}
        </div>
      )}

      {isUnit && (entity as Unit).pointsCost && (
        <div style={{ marginTop: 4, fontSize: 13 }}>
          <span style={{ color: '#888' }}>Points: </span>
          <span style={{ color: '#fff' }}>{(entity as Unit).pointsCost}</span>
        </div>
      )}
    </div>
  );
}
