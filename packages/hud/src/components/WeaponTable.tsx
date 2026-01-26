import React, { useState } from 'react';
import type { WeaponProfile } from '../types';

interface WeaponTableProps {
  weapons: WeaponProfile[];
}

interface WeaponCategoryProps {
  title: string;
  weapons: WeaponProfile[];
  skillLabel: string;
}

function WeaponCategory({ title, weapons, skillLabel }: WeaponCategoryProps): React.ReactElement | null {
  const [isExpanded, setIsExpanded] = useState(false);

  if (weapons.length === 0) return null;

  return (
    <div className="weapon-category">
      <button
        className={`weapon-category-header ${isExpanded ? 'expanded' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <span className="weapon-category-title">{title}</span>
        <span className="weapon-category-count">({weapons.length})</span>
        <span className={`weapon-category-indicator ${isExpanded ? 'expanded' : ''}`}>
          ▼
        </span>
      </button>

      {isExpanded && (
        <div className="weapon-table-wrapper">
          <table className="weapon-table">
            <thead>
              <tr>
                <th className="weapon-col-name">Weapon</th>
                <th className="weapon-col-range">Range</th>
                <th className="weapon-col-attacks">A</th>
                <th className="weapon-col-skill">{skillLabel}</th>
                <th className="weapon-col-strength">S</th>
                <th className="weapon-col-ap">AP</th>
                <th className="weapon-col-damage">D</th>
              </tr>
            </thead>
            <tbody>
              {weapons.map((weapon, index) => (
                <tr key={`${weapon.name}-${index}`}>
                  <td className="weapon-col-name">
                    <span className="weapon-name">{weapon.name}</span>
                    {weapon.abilities && (
                      <span className="weapon-abilities">{weapon.abilities}</span>
                    )}
                  </td>
                  <td className="weapon-col-range">{weapon.range}</td>
                  <td className="weapon-col-attacks">{weapon.attacks}</td>
                  <td className="weapon-col-skill">{weapon.skill}</td>
                  <td className="weapon-col-strength">{weapon.strength}</td>
                  <td className="weapon-col-ap">{weapon.ap}</td>
                  <td className="weapon-col-damage">{weapon.damage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function WeaponTable({ weapons }: WeaponTableProps): React.ReactElement | null {
  if (!weapons || weapons.length === 0) return null;

  const rangedWeapons = weapons.filter(w => w.type === 'ranged');
  const meleeWeapons = weapons.filter(w => w.type === 'melee');

  return (
    <div className="weapon-tables">
      <WeaponCategory
        title="Ranged Weapons"
        weapons={rangedWeapons}
        skillLabel="BS"
      />
      <WeaponCategory
        title="Melee Weapons"
        weapons={meleeWeapons}
        skillLabel="WS"
      />
    </div>
  );
}
