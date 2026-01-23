import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { UnitDetailResponse, UnitDetailWeapon, UnitDetailAbility, UnitDetailUnit } from '../types/unit-detail';
import { cleanAbilityName, parseWeaponAbilities, normalizeKeyword } from '../utils/text-parser';
import { KeywordBadge } from './KeywordBadge';
import { Tooltip } from './Tooltip';
import { AbilityDescription } from './AbilityDescription';
import { getCachedKeywordDescription, useKeywordDescriptions } from '../hooks/useKeywordDescription';

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

// Generic rule definitions that should be tooltips, not displayed as abilities
// These are core game rules that appear when hovering over terms in ability descriptions
const GENERIC_RULES = new Set([
  'hit roll',
  'hit roll (ranged attack)',
  'hit roll (melee attack)',
  'wound roll',
  'critical hit',
  'critical wound',
  'saving throw',
  'advance move',
  'advance',
  'fall back move',
  'fall back',
  'desperate escape test',
  'engagement range',
  'unmodified dice',
  'normal move',
  'charge move',
  'charge',
  'benefit of cover',
  'invulnerable save',
  'mortal wound',
  'mortal wounds',
  'battle-shock',
  'battle-shock test',
  'hazardous',
  'sustained hits',
  'lethal hits',
  'devastating wounds',
  'anti-',
  'torrent',
  'blast',
  'heavy',
  'rapid fire',
  'assault',
  'pistol',
  'melta',
  'lance',
  'twin-linked',
  'precision',
  'indirect fire',
  'ignores cover',
  'psychic',
  'extra attacks',
  'one shot',
  'designer\'s note',
  'example',
  'every model is equipped with',
]);

/**
 * Check if an ability name matches a generic rule that should be filtered out
 */
function isGenericRule(abilityName: string): boolean {
  const normalized = abilityName.toLowerCase().trim();

  // Direct match
  if (GENERIC_RULES.has(normalized)) return true;

  // Check for partial matches (e.g., "Anti-Infantry 4+")
  for (const rule of GENERIC_RULES) {
    if (normalized.startsWith(rule)) return true;
  }

  return false;
}

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

/**
 * Render weapon abilities as styled badges.
 */
function WeaponAbilitiesBadges({ abilities }: { abilities: string }): React.ReactElement {
  const parsed = parseWeaponAbilities(abilities);

  if (parsed.length === 0) {
    return <span>-</span>;
  }

  return (
    <span className="weapon-abilities-badges">
      {parsed.map((ability, index) => {
        const normalized = normalizeKeyword(ability);
        const description = getCachedKeywordDescription(normalized);
        return (
          <KeywordBadge
            key={`${ability}-${index}`}
            keyword={ability}
            description={description}
            variant="weapon"
            inline
          />
        );
      })}
    </span>
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
            <tr key={`${weapon.name}-${index}`}>
              <td className="weapon-name-cell">
                <span className="weapon-name">{weapon.name}</span>
                {weapon.abilities && (
                  <span className="weapon-abilities-inline">
                    <WeaponAbilitiesBadges abilities={weapon.abilities} />
                  </span>
                )}
              </td>
              <td>{weapon.range ?? '-'}</td>
              <td>{weapon.attacks ?? '-'}</td>
              <td>{weapon.skill ?? '-'}</td>
              <td>{weapon.strength ?? '-'}</td>
              <td>{weapon.ap ?? '-'}</td>
              <td>{weapon.damage ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AbilitiesPanel({ abilities }: { abilities: UnitDetailAbility[] }): React.ReactElement {
  // Filter out generic rule definitions - they're available as tooltips instead
  const filteredAbilities = abilities.filter(a => !isGenericRule(a.name));

  const coreAbilities = filteredAbilities.filter(a => a.type === 'core');
  const factionAbilities = filteredAbilities.filter(a => a.type === 'faction');
  const unitAbilities = filteredAbilities.filter(a => a.type === 'unit');
  const wargearAbilities = filteredAbilities.filter(a => a.type === 'wargear');

  // Extract individual faction ability names (splitting comma-separated values)
  const factionAbilityNames = factionAbilities.flatMap((ability) =>
    ability.name.split(/,\s*/).map(n => cleanAbilityName(n.trim()))
  );

  // Fetch descriptions for all faction abilities
  const { descriptions: factionDescriptions } = useKeywordDescriptions(factionAbilityNames);

  // Render an ability item with cleaned name and parsed description
  const renderAbilityItem = (ability: UnitDetailAbility) => {
    const cleanedName = cleanAbilityName(ability.name);
    return (
      <div key={ability.name} className="ability-item">
        <span className="ability-name">{cleanedName}</span>
        {ability.description && (
          <p className="ability-description">
            <AbilityDescription description={ability.description} />
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="unit-detail-abilities-section">
      <div className="unit-detail-section-title">Abilities</div>

      {coreAbilities.length > 0 && (
        <div className="abilities-group">
          <div className="abilities-group-label">Core</div>
          <div className="core-abilities-list">
            {coreAbilities.map((ability) => {
              const cleanedName = cleanAbilityName(ability.name);
              const description = ability.description ?? getCachedKeywordDescription(cleanedName);
              return (
                <Tooltip
                  key={ability.name}
                  content={description}
                  position="top"
                >
                  <span className={`core-ability-badge ${CORE_ABILITIES.has(cleanedName) ? 'known' : ''}`}>
                    {cleanedName}
                  </span>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}

      {factionAbilities.length > 0 && (
        <div className="abilities-group">
          <div className="abilities-group-label">Faction</div>
          <div className="faction-abilities-list">
            {factionAbilities.flatMap((ability) => {
              // Split comma-separated abilities into individual badges
              const names = ability.name.split(/,\s*/).map(n => cleanAbilityName(n.trim()));
              return names.map((name, idx) => {
                // Get description from hook results, or fall back to cached
                const description = factionDescriptions[name] ?? getCachedKeywordDescription(name);
                return (
                  <Tooltip
                    key={`${ability.name}-${idx}`}
                    content={description}
                    position="top"
                  >
                    <span className="faction-ability-badge">{name}</span>
                  </Tooltip>
                );
              });
            })}
          </div>
        </div>
      )}

      {unitAbilities.length > 0 && (
        <div className="abilities-group">
          <div className="abilities-group-label">Unit Abilities</div>
          {unitAbilities.map(renderAbilityItem)}
        </div>
      )}

      {wargearAbilities.length > 0 && (
        <div className="abilities-group">
          <div className="abilities-group-label">Wargear Abilities</div>
          {wargearAbilities.map(renderAbilityItem)}
        </div>
      )}
    </div>
  );
}

/**
 * Clean up composition text that may contain raw markdown table syntax
 */
function cleanCompositionText(text: string): { composition: string; extractedLeader: string | null } {
  let cleaned = text;
  let extractedLeader: string | null = null;

  // Extract LEADER section if embedded in composition
  const leaderMatch = cleaned.match(/LEADER\s+This model can be attached to the following units?:\s*([\s\S]*?)$/i);
  if (leaderMatch?.[1]) {
    extractedLeader = leaderMatch[1]
      .split(/[-•]/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .join('\n• ');
    if (extractedLeader) {
      extractedLeader = `This model can be attached to:\n• ${extractedLeader}`;
    }
    cleaned = cleaned.slice(0, leaderMatch.index).trim();
  }

  // Remove markdown table syntax
  cleaned = cleaned
    .replace(/\|\s*[-]+\s*\|/g, '') // Remove table separator rows (| --- |)
    .replace(/\|[^|]*\|[^|]*\|/g, '') // Remove table cells
    .replace(/\s*\|\s*/g, ' ') // Remove remaining pipes
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  return { composition: cleaned, extractedLeader };
}

/**
 * Parse leader info into structured data for display.
 * Handles concatenated unit names and separates the additional note.
 */
function parseLeaderInfo(text: string): { intro: string; units: string[]; note: string | null } {
  // Extract the intro text (e.g., "This model can be attached to:")
  let intro = 'This model can be attached to the following units:';
  let remaining = text;

  const introMatch = text.match(/^(This model can be attached to[^:]*:?)\s*/i);
  if (introMatch) {
    intro = introMatch[1].replace(/:$/, '') + ':';
    remaining = text.slice(introMatch[0].length);
  }

  // Check if already has bullet points or line breaks
  if (remaining.includes('•') || remaining.includes('\n')) {
    const lines = remaining.split(/[•\n]/).map(s => s.trim()).filter(s => s.length > 0);
    // Check if last line looks like additional note (starts with "You can" or contains "WARLORD")
    const noteIndex = lines.findIndex(line =>
      line.match(/^You can attach/i) || line.includes('WARLORD')
    );
    if (noteIndex !== -1) {
      const units = lines.slice(0, noteIndex);
      const note = lines.slice(noteIndex).join(' ');
      return { intro, units, note };
    }
    return { intro, units: lines, note: null };
  }

  let note: string | null = null;

  // First, extract the "You can attach..." note if present
  const noteMatch = remaining.match(/(You can attach[^]*$)/i);
  if (noteMatch) {
    note = noteMatch[1];
    remaining = remaining.slice(0, noteMatch.index).trim();
  }

  // Split concatenated unit names on camelCase boundaries (lowercase followed by uppercase)
  // e.g., "NeurogauntsTyrant GuardZoanthropes" → ["Neurogaunts", "Tyrant Guard", "Zoanthropes"]
  const splitOnCamelCase = remaining.replace(/([a-z])([A-Z])/g, '$1\n$2');
  const units = splitOnCamelCase
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  return { intro, units, note };
}

/**
 * Leader section with Wahapedia-style formatting.
 */
function LeaderSection({ leaderInfo }: { leaderInfo: string }): React.ReactElement {
  const { intro, units, note } = parseLeaderInfo(leaderInfo);

  return (
    <div className="unit-detail-leader-section">
      <div className="unit-detail-section-title">Leader</div>
      <div className="leader-content">
        <p className="leader-intro">{intro}</p>
        {units.length > 0 && (
          <ul className="leader-units-list">
            {units.map((unit, idx) => (
              <li key={idx} className="leader-unit-item">{unit}</li>
            ))}
          </ul>
        )}
        {note && (
          <p className="leader-note">{note}</p>
        )}
      </div>
    </div>
  );
}

function CompositionSection({ unit }: { unit: UnitDetailUnit }): React.ReactElement | null {
  if (!unit.composition && !unit.wargearOptions && !unit.leaderInfo && !unit.ledBy) {
    return null;
  }

  // Clean up composition text and extract embedded leader info if present
  const { composition: cleanedComposition, extractedLeader } = unit.composition
    ? cleanCompositionText(unit.composition)
    : { composition: '', extractedLeader: null };

  // Use extracted leader info only if unit.leaderInfo isn't already set
  const displayLeaderInfo = unit.leaderInfo ?? extractedLeader;

  return (
    <div className="unit-detail-composition-section">
      {cleanedComposition && (
        <div className="composition-group">
          <div className="composition-label">Unit Composition</div>
          <p className="composition-text">{cleanedComposition}</p>
        </div>
      )}

      {unit.wargearOptions && (
        <div className="composition-group">
          <div className="composition-label">Wargear Options</div>
          <p className="composition-text">{unit.wargearOptions}</p>
        </div>
      )}

      {displayLeaderInfo && (
        <LeaderSection leaderInfo={displayLeaderInfo} />
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
        <span className="keywords-list keywords-badges">
          {regularKeywords.map((keyword, index) => {
            const description = getCachedKeywordDescription(keyword);
            return (
              <KeywordBadge
                key={`${keyword}-${index}`}
                keyword={keyword}
                description={description}
                autoVariant
                inline
              />
            );
          })}
        </span>
      </div>
      {hasFactionKeyword && (
        <div className="keywords-row faction">
          <span className="keywords-label">Faction:</span>
          <span className="keywords-list">
            <KeywordBadge
              keyword={faction}
              variant="faction"
              inline
            />
          </span>
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

  // Filter out header rows that may have slipped through parsing
  const isValidWeapon = (w: { name: string }) => {
    const upperName = w.name.toUpperCase();
    return !['RANGED WEAPONS', 'MELEE WEAPONS', 'WEAPON', 'WEAPONS', 'RANGE'].includes(upperName) &&
           !upperName.includes('RANGED WEAPON') &&
           !upperName.includes('MELEE WEAPON');
  };

  const rangedWeapons = data?.weapons.filter(w => w.type === 'ranged' && isValidWeapon(w)) ?? [];
  const meleeWeapons = data?.weapons.filter(w => w.type === 'melee' && isValidWeapon(w)) ?? [];

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
              {/* Left Column: Weapons */}
              <div className="unit-detail-left-column">
                {rangedWeapons.length > 0 && (
                  <WeaponTable weapons={rangedWeapons} type="ranged" />
                )}
                {meleeWeapons.length > 0 && (
                  <WeaponTable weapons={meleeWeapons} type="melee" />
                )}
              </div>

              {/* Right Column: Abilities + Composition */}
              <div className="unit-detail-right-column">
                {data.abilities.length > 0 && (
                  <AbilitiesPanel abilities={data.abilities} />
                )}
                <CompositionSection unit={data.unit} />
              </div>
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
