import React from 'react';
import type { Unit, Stratagem } from '@/types/battle-report';
import type { EnhancedUnitData, EnhancedStratagemData } from '@/types/mcp-types';
import { ConfidenceBadge } from '../HUD/ConfidenceBadge';
import { McpBadge } from './McpBadge';
import { WeaponList } from './WeaponList';
import { AbilityList } from './AbilityList';

interface EntityTooltipProps {
  entity: Unit | Stratagem | null;
  playerName?: string;
  playerFaction?: string;
  x: number;
  y: number;
  visible: boolean;
  // Enhanced MCP data
  mcpAvailable?: boolean;
  enhancedUnitData?: EnhancedUnitData | null;
  enhancedStratagemData?: EnhancedStratagemData | null;
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

/** Stratagem details component */
function StratagemDetails({
  enhancedData,
}: {
  enhancedData: EnhancedStratagemData;
}): React.ReactElement {
  const containerStyle: React.CSSProperties = {
    marginTop: 10,
    padding: 8,
    background: '#1e1e1e',
    borderRadius: 6,
    borderLeft: '2px solid #a855f7',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: 2,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#ccc',
    lineHeight: 1.3,
  };

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        <div>
          <div style={labelStyle}>CP</div>
          <div style={{ ...valueStyle, color: '#fbbf24', fontWeight: 600 }}>
            {enhancedData.cpCost}
          </div>
        </div>
        <div>
          <div style={labelStyle}>Phase</div>
          <div style={valueStyle}>{enhancedData.phase}</div>
        </div>
        {enhancedData.detachment && (
          <div>
            <div style={labelStyle}>Detachment</div>
            <div style={valueStyle}>{enhancedData.detachment}</div>
          </div>
        )}
      </div>
      {enhancedData.effect && (
        <div>
          <div style={labelStyle}>Effect</div>
          <div
            style={{
              ...valueStyle,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {enhancedData.effect}
          </div>
        </div>
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
  mcpAvailable = false,
  enhancedUnitData,
  enhancedStratagemData,
}: EntityTooltipProps): React.ReactElement | null {
  if (!visible || !entity) {
    return null;
  }

  const isUnit = 'playerIndex' in entity && entity.playerIndex !== undefined;
  const unit = isUnit ? (entity as Unit) : null;
  const stratagem = !isUnit ? (entity as Stratagem) : null;

  // Position tooltip above cursor with offset
  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y - 10,
    transform: 'translate(-50%, -100%)',
    zIndex: 9999,
    maxWidth: 360,
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

  const hasMcpData = enhancedUnitData?.mcpFetched || enhancedStratagemData?.mcpFetched;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
          {mcpAvailable && <McpBadge available={hasMcpData ?? false} />}
        </div>
        <ConfidenceBadge level={entity.confidence} />
      </div>

      <div style={{ fontSize: 12, color: '#888' }}>
        {isUnit ? 'Unit' : 'Stratagem'}
        {playerFaction && <span> • {playerFaction}</span>}
        {unit?.pointsCost && <span> • {unit.pointsCost}pts</span>}
      </div>

      {playerName && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <span style={{ color: '#888' }}>Player: </span>
          <span style={{ color: '#fff' }}>{playerName}</span>
        </div>
      )}

      {/* Unit stats block */}
      {unit?.stats && <StatBlock unit={unit} />}

      {/* MCP-enhanced weapons for units */}
      {enhancedUnitData?.weapons && enhancedUnitData.weapons.length > 0 && (
        <WeaponList weapons={enhancedUnitData.weapons} />
      )}

      {/* MCP-enhanced abilities for units */}
      {enhancedUnitData?.abilities && enhancedUnitData.abilities.length > 0 && (
        <AbilityList abilities={enhancedUnitData.abilities} />
      )}

      {/* MCP-enhanced stratagem details */}
      {stratagem && enhancedStratagemData?.mcpFetched && (
        <StratagemDetails enhancedData={enhancedStratagemData} />
      )}

      {/* Keywords */}
      {unit?.keywords && unit.keywords.length > 0 && (
        <KeywordTags keywords={unit.keywords} />
      )}
    </div>
  );
}
