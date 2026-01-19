import React from 'react';
import type { McpWeapon } from '@/types/mcp-types';

interface WeaponListProps {
  weapons: McpWeapon[];
}

const containerStyle: React.CSSProperties = {
  marginTop: 10,
  padding: 8,
  background: '#1e1e1e',
  borderRadius: 6,
  borderLeft: '2px solid #f59e0b',
};

const headerStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#f59e0b',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 6,
};

const weaponRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  fontSize: 11,
  marginBottom: 3,
};

const weaponNameStyle: React.CSSProperties = {
  color: '#fff',
  fontWeight: 500,
  minWidth: 80,
  flexShrink: 0,
};

const weaponStatsStyle: React.CSSProperties = {
  color: '#999',
  fontSize: 10,
};

const typeIconStyle = (type: 'ranged' | 'melee'): React.CSSProperties => ({
  fontSize: 9,
  padding: '1px 4px',
  borderRadius: 2,
  backgroundColor: type === 'ranged' ? '#2563eb22' : '#dc262622',
  color: type === 'ranged' ? '#60a5fa' : '#f87171',
  marginRight: 4,
});

export function WeaponList({ weapons }: WeaponListProps): React.ReactElement | null {
  if (weapons.length === 0) return null;

  // Separate ranged and melee weapons
  const rangedWeapons = weapons.filter((w) => w.type === 'ranged');
  const meleeWeapons = weapons.filter((w) => w.type === 'melee');

  const formatWeaponStats = (weapon: McpWeapon): string => {
    const parts: string[] = [];
    if (weapon.range) parts.push(weapon.range);
    if (weapon.attacks) parts.push(`A${weapon.attacks}`);
    if (weapon.skill) parts.push(`${weapon.type === 'ranged' ? 'BS' : 'WS'}${weapon.skill}`);
    if (weapon.strength) parts.push(`S${weapon.strength}`);
    if (weapon.ap) parts.push(`AP${weapon.ap}`);
    if (weapon.damage) parts.push(`D${weapon.damage}`);
    return parts.join(' ');
  };

  const renderWeapon = (weapon: McpWeapon, index: number) => (
    <div key={`${weapon.name}-${index}`} style={weaponRowStyle}>
      <span style={typeIconStyle(weapon.type)}>{weapon.type === 'ranged' ? 'R' : 'M'}</span>
      <span style={weaponNameStyle}>{weapon.name}</span>
      <span style={weaponStatsStyle}>{formatWeaponStats(weapon)}</span>
    </div>
  );

  // Show max 4 weapons to avoid tooltip overflow
  const displayWeapons = [...rangedWeapons.slice(0, 3), ...meleeWeapons.slice(0, 2)].slice(0, 4);
  const remainingCount = weapons.length - displayWeapons.length;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Weapons</div>
      {displayWeapons.map(renderWeapon)}
      {remainingCount > 0 && (
        <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
          +{remainingCount} more weapon{remainingCount > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
