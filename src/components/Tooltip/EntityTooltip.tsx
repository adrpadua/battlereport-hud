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

/** Stat block component for unit characteristics */
function StatBlock({ unit }: { unit: Unit }): React.ReactElement | null {
  if (!unit.stats) return null;

  const statStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '4px 6px',
    background: '#1a1a1a',
    borderRadius: 4,
    minWidth: 32,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        marginTop: 8,
        padding: 6,
        background: '#2a2a2a',
        borderRadius: 6,
      }}
    >
      <div style={statStyle}>
        <span style={labelStyle}>M</span>
        <span style={valueStyle}>{unit.stats.movement}</span>
      </div>
      <div style={statStyle}>
        <span style={labelStyle}>T</span>
        <span style={valueStyle}>{unit.stats.toughness}</span>
      </div>
      <div style={statStyle}>
        <span style={labelStyle}>SV</span>
        <span style={valueStyle}>{unit.stats.save}</span>
      </div>
      <div style={statStyle}>
        <span style={labelStyle}>W</span>
        <span style={valueStyle}>{unit.stats.wounds}</span>
      </div>
      <div style={statStyle}>
        <span style={labelStyle}>LD</span>
        <span style={valueStyle}>{unit.stats.leadership}</span>
      </div>
      <div style={statStyle}>
        <span style={labelStyle}>OC</span>
        <span style={valueStyle}>{unit.stats.objectiveControl}</span>
      </div>
    </div>
  );
}

/** Keyword tags component */
function KeywordTags({ keywords }: { keywords: string[] }): React.ReactElement | null {
  if (keywords.length === 0) return null;

  // Show max 5 keywords
  const displayKeywords = keywords.slice(0, 5);
  const remaining = keywords.length - 5;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        marginTop: 8,
      }}
    >
      {displayKeywords.map((keyword) => (
        <span
          key={keyword}
          style={{
            fontSize: 10,
            padding: '2px 6px',
            background: '#333',
            borderRadius: 3,
            color: '#aaa',
          }}
        >
          {keyword}
        </span>
      ))}
      {remaining > 0 && (
        <span
          style={{
            fontSize: 10,
            padding: '2px 6px',
            color: '#666',
          }}
        >
          +{remaining} more
        </span>
      )}
    </div>
  );
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
  const unit = isUnit ? (entity as Unit) : null;

  // Position tooltip above cursor with offset
  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y - 10,
    transform: 'translate(-50%, -100%)',
    zIndex: 9999,
    maxWidth: 340,
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
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontWeight: 600,
              color: isUnit ? '#22c55e' : '#a855f7',
            }}
          >
            {entity.name}
          </span>
          {unit?.isValidated && (
            <span
              style={{
                fontSize: 10,
                padding: '1px 4px',
                background: '#166534',
                borderRadius: 3,
                color: '#86efac',
              }}
              title="Validated against BSData"
            >
              BSData
            </span>
          )}
        </div>
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

      {unit?.pointsCost && (
        <div style={{ marginTop: 4, fontSize: 13 }}>
          <span style={{ color: '#888' }}>Points: </span>
          <span style={{ color: '#fff' }}>{unit.pointsCost}</span>
        </div>
      )}

      {/* Unit stats block */}
      {unit?.stats && <StatBlock unit={unit} />}

      {/* Keywords */}
      {unit?.keywords && unit.keywords.length > 0 && (
        <KeywordTags keywords={unit.keywords} />
      )}
    </div>
  );
}
