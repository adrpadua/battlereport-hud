import React from 'react';
import { ConfidenceBadge } from './ConfidenceBadge';
import { stripUnitNameParentheses } from '../utils/text-parser';
import { useExpandable } from '../hooks/useExpandable';
import type { Unit, UnitStats } from '../types';

interface UnitCellProps {
  unit: Unit;
  unitIndex: number;
  playerFaction?: string;
  onSeekToTimestamp?: (seconds: number) => void;
  onAcceptSuggestion?: (unitIndex: number) => void;
  onOpenDetail?: (unitName: string, faction: string) => void;
  onSearchCorrection?: (unitName: string, faction: string, unitIndex: number) => void;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Core keywords that get special styling
const CORE_KEYWORDS = new Set([
  'Infantry',
  'Monster',
  'Vehicle',
  'Mounted',
  'Beast',
  'Swarm',
  'Character',
  'Epic Hero',
  'Battleline',
  'Dedicated Transport',
  'Psyker',
  'Fly',
  'Lone Operative',
  'Leader',
  'Grenades',
  'Scouts',
  'Stealth',
  'Deep Strike',
  'Infiltrators',
  'Towering',
]);

interface UnitStatGridProps {
  stats: UnitStats;
}

function UnitStatGrid({ stats }: UnitStatGridProps): React.ReactElement {
  const statItems = [
    { label: 'M', value: stats.movement },
    { label: 'T', value: stats.toughness.toString() },
    { label: 'SV', value: stats.save },
    { label: 'W', value: stats.wounds.toString() },
    { label: 'LD', value: stats.leadership },
    { label: 'OC', value: stats.objectiveControl.toString() },
  ];

  return (
    <div className="unit-stat-grid">
      {statItems.map((stat) => (
        <div key={stat.label} className="unit-stat">
          <span className="unit-stat-label">{stat.label}</span>
          <span className="unit-stat-value">{stat.value}</span>
        </div>
      ))}
    </div>
  );
}

interface KeywordTagsProps {
  keywords: string[];
}

function KeywordTags({ keywords }: KeywordTagsProps): React.ReactElement {
  return (
    <div className="unit-keywords">
      {keywords.map((keyword) => (
        <span
          key={keyword}
          className={`unit-keyword-tag ${CORE_KEYWORDS.has(keyword) ? 'core' : ''}`}
        >
          {keyword}
        </span>
      ))}
    </div>
  );
}

export function UnitCell({
  unit,
  unitIndex,
  playerFaction,
  onSeekToTimestamp,
  onAcceptSuggestion,
  onOpenDetail,
  onSearchCorrection,
}: UnitCellProps): React.ReactElement {
  const hasExpandableContent = Boolean(unit.stats || (unit.keywords && unit.keywords.length > 0));
  const { isExpanded, headerProps, contentClassName } = useExpandable({ hasContent: hasExpandableContent });

  const handleTimestampClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (onSeekToTimestamp && unit.videoTimestamp !== undefined) {
      onSeekToTimestamp(unit.videoTimestamp);
    }
  };

  const handleAcceptClick = (): void => {
    if (onAcceptSuggestion) {
      onAcceptSuggestion(unitIndex);
    }
  };

  const handleInfoClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (onOpenDetail && playerFaction) {
      onOpenDetail(unit.name, playerFaction);
    }
  };

  const handleSearchClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (onSearchCorrection && playerFaction) {
      onSearchCorrection(unit.name, playerFaction, unitIndex);
    }
  };

  return (
    <div className="unit-cell">
      <div
        className={`unit-cell-header ${contentClassName} ${hasExpandableContent ? 'expandable' : ''}`}
        {...headerProps}
      >
        <span className="unit-name">
          {stripUnitNameParentheses(unit.name)}
          {unit.pointsCost && (
            <span className="unit-points"> ({unit.pointsCost})</span>
          )}
          {unit.isValidated && (
            <span className="unit-validated" title="Validated against BSData">
              ✓
            </span>
          )}
        </span>
        <div className="unit-cell-actions">
          {onSearchCorrection && playerFaction && (
            <button
              onClick={handleSearchClick}
              className="unit-search-button"
              title="Correct unit name"
            >
              &#x270E;
            </button>
          )}
          {unit.isValidated && onOpenDetail && playerFaction && (
            <button
              onClick={handleInfoClick}
              className="unit-info-button"
              title="View full datasheet"
            >
              i
            </button>
          )}
          {unit.videoTimestamp !== undefined && onSeekToTimestamp && (
            <button
              onClick={handleTimestampClick}
              className="timestamp-button"
              title="Jump to this moment in the video"
            >
              {formatTimestamp(unit.videoTimestamp)}
            </button>
          )}
          <ConfidenceBadge level={unit.confidence} />
          {hasExpandableContent && (
            <span className={`unit-expand-indicator ${isExpanded ? 'expanded' : ''}`}>
              ▼
            </span>
          )}
        </div>
      </div>

      {isExpanded && hasExpandableContent && (
        <div className="unit-details">
          {unit.stats && <UnitStatGrid stats={unit.stats} />}
          {unit.keywords && unit.keywords.length > 0 && (
            <KeywordTags keywords={unit.keywords} />
          )}
        </div>
      )}

      {!unit.isValidated && unit.suggestedMatch && (
        <div className="unit-suggestion">
          <span className="suggestion-label">Did you mean:</span>
          <span className="suggestion-name">{unit.suggestedMatch.name}</span>
          <span className="suggestion-confidence">
            ({Math.round(unit.suggestedMatch.confidence * 100)}% match)
          </span>
          <button
            className="suggestion-accept-btn"
            onClick={handleAcceptClick}
            title="Accept this suggestion"
          >
            ✓ Accept
          </button>
        </div>
      )}
    </div>
  );
}
