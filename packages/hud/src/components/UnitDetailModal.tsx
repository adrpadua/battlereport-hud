import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { UnitDetailResponse, UnitDetailWeapon, UnitDetailAbility, UnitDetailUnit } from '../types/unit-detail';

interface UnitDetailModalProps {
  unitName: string;
  faction: string;
  onClose: () => void;
  onFetch: (unitName: string, faction: string) => Promise<UnitDetailResponse>;
}

// Core abilities that get badge styling
const CORE_ABILITIES = new Set([
  'Deadly Demise',
  'Deep Strike',
  'Feel No Pain',
  'Fights First',
  'Firing Deck',
  'Hover',
  'Infiltrators',
  'Leader',
  'Lone Operative',
  'Scouts',
  'Stealth',
]);

function UnitDetailHeader({ unit }: { unit: UnitDetailUnit }): React.ReactElement {
  const statItems = [
    { label: 'M', value: unit.stats.movement ?? '-' },
    { label: 'T', value: unit.stats.toughness?.toString() ?? '-' },
    { label: 'SV', value: unit.stats.save ?? '-' },
    { label: 'W', value: unit.stats.wounds?.toString() ?? '-' },
    { label: 'LD', value: unit.stats.leadership?.toString() ?? '-' },
    { label: 'OC', value: unit.stats.objectiveControl?.toString() ?? '-' },
  ];

  return (
    <div className="unit-detail-header">
      <div className="unit-detail-title-row">
        <h2 className="unit-detail-name">{unit.name}</h2>
        <div className="unit-detail-badges">
          {unit.isEpicHero && <span className="unit-detail-badge epic-hero">Epic Hero</span>}
          {unit.isBattleline && <span className="unit-detail-badge battleline">Battleline</span>}
        </div>
      </div>
      <div className="unit-detail-faction">{unit.faction}</div>

      <div className="unit-detail-stats">
        {statItems.map((stat) => (
          <div key={stat.label} className="unit-detail-stat">
            <span className="unit-detail-stat-label">{stat.label}</span>
            <span className="unit-detail-stat-value">{stat.value}</span>
          </div>
        ))}
      </div>

      {unit.stats.invulnerableSave && (
        <div className="unit-detail-invuln">
          {unit.stats.invulnerableSave} Invulnerable Save
        </div>
      )}
    </div>
  );
}

function WeaponTable({
  weapons,
  type
}: {
  weapons: UnitDetailWeapon[];
  type: 'ranged' | 'melee'
}): React.ReactElement {
  const title = type === 'ranged' ? 'Ranged Weapons' : 'Melee Weapons';
  const skillHeader = type === 'ranged' ? 'BS' : 'WS';

  return (
    <div className="unit-detail-weapons-section">
      <div className="unit-detail-section-title">{title}</div>
      <table className="unit-detail-weapons-table">
        <thead>
          <tr>
            <th>Weapon</th>
            <th>Range</th>
            <th>A</th>
            <th>{skillHeader}</th>
            <th>S</th>
            <th>AP</th>
            <th>D</th>
          </tr>
        </thead>
        <tbody>
          {weapons.map((weapon, index) => (
            <React.Fragment key={`${weapon.name}-${index}`}>
              <tr>
                <td className="weapon-name">{weapon.name}</td>
                <td>{weapon.range ?? '-'}</td>
                <td>{weapon.attacks ?? '-'}</td>
                <td>{weapon.skill ?? '-'}</td>
                <td>{weapon.strength ?? '-'}</td>
                <td>{weapon.ap ?? '-'}</td>
                <td>{weapon.damage ?? '-'}</td>
              </tr>
              {weapon.abilities && (
                <tr className="weapon-abilities-row">
                  <td colSpan={7} className="weapon-abilities">
                    [{weapon.abilities}]
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AbilitiesPanel({ abilities }: { abilities: UnitDetailAbility[] }): React.ReactElement {
  const coreAbilities = abilities.filter(a => a.type === 'core');
  const factionAbilities = abilities.filter(a => a.type === 'faction');
  const unitAbilities = abilities.filter(a => a.type === 'unit');
  const wargearAbilities = abilities.filter(a => a.type === 'wargear');

  return (
    <div className="unit-detail-abilities-section">
      <div className="unit-detail-section-title">Abilities</div>

      {coreAbilities.length > 0 && (
        <div className="abilities-group">
          <div className="abilities-group-label">Core</div>
          <div className="core-abilities-list">
            {coreAbilities.map((ability) => (
              <span
                key={ability.name}
                className={`core-ability-badge ${CORE_ABILITIES.has(ability.name) ? 'known' : ''}`}
                title={ability.description ?? undefined}
              >
                {ability.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {factionAbilities.length > 0 && (
        <div className="abilities-group">
          <div className="abilities-group-label">Faction</div>
          {factionAbilities.map((ability) => (
            <div key={ability.name} className="ability-item">
              <span className="ability-name">{ability.name}</span>
              {ability.description && (
                <p className="ability-description">{ability.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {unitAbilities.length > 0 && (
        <div className="abilities-group">
          <div className="abilities-group-label">Unit Abilities</div>
          {unitAbilities.map((ability) => (
            <div key={ability.name} className="ability-item">
              <span className="ability-name">{ability.name}</span>
              {ability.description && (
                <p className="ability-description">{ability.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {wargearAbilities.length > 0 && (
        <div className="abilities-group">
          <div className="abilities-group-label">Wargear Abilities</div>
          {wargearAbilities.map((ability) => (
            <div key={ability.name} className="ability-item">
              <span className="ability-name">{ability.name}</span>
              {ability.description && (
                <p className="ability-description">{ability.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompositionSection({ unit }: { unit: UnitDetailUnit }): React.ReactElement | null {
  if (!unit.composition && !unit.wargearOptions && !unit.leaderInfo && !unit.ledBy) {
    return null;
  }

  return (
    <div className="unit-detail-composition-section">
      {unit.composition && (
        <div className="composition-group">
          <div className="composition-label">Unit Composition</div>
          <p className="composition-text">{unit.composition}</p>
        </div>
      )}

      {unit.wargearOptions && (
        <div className="composition-group">
          <div className="composition-label">Wargear Options</div>
          <p className="composition-text">{unit.wargearOptions}</p>
        </div>
      )}

      {unit.leaderInfo && (
        <div className="composition-group">
          <div className="composition-label">Leader</div>
          <p className="composition-text">{unit.leaderInfo}</p>
        </div>
      )}

      {unit.ledBy && (
        <div className="composition-group">
          <div className="composition-label">Can be led by</div>
          <p className="composition-text">{unit.ledBy}</p>
        </div>
      )}
    </div>
  );
}

function KeywordsFooter({
  keywords,
  faction
}: {
  keywords: string[];
  faction: string
}): React.ReactElement {
  // Faction keyword is typically in all caps
  const factionKeyword = faction.toUpperCase();
  const regularKeywords = keywords.filter(k => k.toUpperCase() !== factionKeyword);
  const hasFactionKeyword = keywords.some(k => k.toUpperCase() === factionKeyword);

  return (
    <div className="unit-detail-keywords-footer">
      <div className="keywords-row">
        <span className="keywords-label">Keywords:</span>
        <span className="keywords-list">
          {regularKeywords.join(', ')}
        </span>
      </div>
      {hasFactionKeyword && (
        <div className="keywords-row faction">
          <span className="keywords-label">Faction:</span>
          <span className="keywords-list faction-keyword">{faction}</span>
        </div>
      )}
    </div>
  );
}

export function UnitDetailModal({
  unitName,
  faction,
  onClose,
  onFetch,
}: UnitDetailModalProps): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<UnitDetailResponse | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await onFetch(unitName, faction);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch unit details');
    } finally {
      setLoading(false);
    }
  }, [unitName, faction, onFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const rangedWeapons = data?.weapons.filter(w => w.type === 'ranged') ?? [];
  const meleeWeapons = data?.weapons.filter(w => w.type === 'melee') ?? [];

  const modalContent = (
    <div
      className="unit-detail-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="unit-detail-title"
    >
      <div
        className="unit-detail-modal"
        onClick={e => e.stopPropagation()}
      >
        <button
          className="unit-detail-close"
          onClick={onClose}
          aria-label="Close modal"
        >
          &times;
        </button>

        {loading && (
          <div className="unit-detail-loading">
            <div className="unit-detail-spinner" />
            <span>Loading datasheet...</span>
          </div>
        )}

        {error && (
          <div className="unit-detail-error">
            <div className="unit-detail-error-icon">!</div>
            <div className="unit-detail-error-message">{error}</div>
            <button className="unit-detail-retry" onClick={fetchData}>
              Try Again
            </button>
          </div>
        )}

        {data && !loading && !error && (
          <>
            <UnitDetailHeader unit={data.unit} />

            <div className="unit-detail-content">
              {rangedWeapons.length > 0 && (
                <WeaponTable weapons={rangedWeapons} type="ranged" />
              )}
              {meleeWeapons.length > 0 && (
                <WeaponTable weapons={meleeWeapons} type="melee" />
              )}

              {data.abilities.length > 0 && (
                <AbilitiesPanel abilities={data.abilities} />
              )}

              <CompositionSection unit={data.unit} />
            </div>

            {data.keywords.length > 0 && (
              <KeywordsFooter keywords={data.keywords} faction={data.unit.faction} />
            )}
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
