import React from 'react';
import type { McpAbility } from '@/types/mcp-types';

interface AbilityListProps {
  abilities: McpAbility[];
}

const containerStyle: React.CSSProperties = {
  marginTop: 10,
  padding: 8,
  background: '#1e1e1e',
  borderRadius: 6,
  borderLeft: '2px solid #8b5cf6',
};

const headerStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#8b5cf6',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 6,
};

const abilityRowStyle: React.CSSProperties = {
  marginBottom: 6,
};

const abilityNameStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 11,
  fontWeight: 500,
  color: '#fff',
};

const abilityTypeStyle = (type: string): React.CSSProperties => {
  const colors: Record<string, { bg: string; text: string }> = {
    core: { bg: '#22c55e22', text: '#4ade80' },
    faction: { bg: '#3b82f622', text: '#60a5fa' },
    unit: { bg: '#f59e0b22', text: '#fbbf24' },
    wargear: { bg: '#ef444422', text: '#f87171' },
  };

  const defaultColor = { bg: '#f59e0b22', text: '#fbbf24' };
  const color = colors[type] ?? defaultColor;

  return {
    fontSize: 8,
    padding: '1px 4px',
    borderRadius: 2,
    backgroundColor: color.bg,
    color: color.text,
    textTransform: 'uppercase',
  };
};

const descriptionStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#888',
  marginTop: 2,
  lineHeight: 1.3,
  // Truncate long descriptions
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

export function AbilityList({ abilities }: AbilityListProps): React.ReactElement | null {
  if (abilities.length === 0) return null;

  // Prioritize faction and core abilities, then unit abilities
  const sortedAbilities = [...abilities].sort((a, b) => {
    const priority: Record<string, number> = { faction: 0, core: 1, unit: 2, wargear: 3 };
    return (priority[a.type] ?? 4) - (priority[b.type] ?? 4);
  });

  // Show max 3 abilities to avoid tooltip overflow
  const displayAbilities = sortedAbilities.slice(0, 3);
  const remainingCount = abilities.length - displayAbilities.length;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Abilities</div>
      {displayAbilities.map((ability, index) => (
        <div key={`${ability.name}-${index}`} style={abilityRowStyle}>
          <div style={abilityNameStyle}>
            <span style={abilityTypeStyle(ability.type)}>{ability.type}</span>
            <span>{ability.name}</span>
          </div>
          {ability.description && (
            <div style={descriptionStyle}>{ability.description}</div>
          )}
        </div>
      ))}
      {remainingCount > 0 && (
        <div style={{ fontSize: 10, color: '#666' }}>
          +{remainingCount} more abilit{remainingCount > 1 ? 'ies' : 'y'}
        </div>
      )}
    </div>
  );
}
