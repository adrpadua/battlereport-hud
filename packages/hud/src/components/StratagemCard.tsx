import React, { useState, useEffect } from 'react';
import type { Stratagem, StratagemDetails } from '../types';
import { ConfidenceBadge } from './ConfidenceBadge';
import { RuleText } from './RuleText';
import { useExpandable } from '../hooks/useExpandable';

interface StratagemCardProps {
  stratagem: Stratagem;
  faction?: string;
  onSeekToTimestamp?: (seconds: number) => void;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function StratagemCard({
  stratagem,
  faction,
  onSeekToTimestamp,
}: StratagemCardProps): React.ReactElement {
  const [details, setDetails] = useState<StratagemDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use pre-validated data if available, otherwise fetch from API
  const hasPrevalidatedData = stratagem.isValidated && stratagem.effect;

  // Determine if we have expandable content (either from pre-validation or API fetch)
  const hasExpandableContent = Boolean(hasPrevalidatedData || details?.effect);
  const { isExpanded, headerProps, contentClassName } = useExpandable({ hasContent: hasExpandableContent });

  // Get display data - prefer pre-validated, fall back to API-fetched
  const displayCpCost = stratagem.cpCost || details?.cpCost;
  const displayPhase = stratagem.phase || details?.phase;
  const displayEffect = stratagem.effect || details?.effect;
  const displayDetachment = stratagem.detachment || details?.detachment;

  useEffect(() => {
    // Skip API fetch if we already have pre-validated data
    if (hasPrevalidatedData) {
      return;
    }

    if (!stratagem.name) return;

    const fetchDetails = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const factionParam = faction ? `?faction=${encodeURIComponent(faction)}` : '';
        const response = await fetch(
          `http://localhost:40401/api/stratagems/${encodeURIComponent(stratagem.name)}${factionParam}`
        );

        if (!response.ok) {
          if (response.status === 404) {
            setDetails(null);
            return;
          }
          throw new Error(`Failed to fetch stratagem: ${response.status}`);
        }

        const data = await response.json();
        setDetails(data.stratagem);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch stratagem');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [stratagem.name, faction, hasPrevalidatedData]);

  const handleSeek = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (onSeekToTimestamp && stratagem.videoTimestamp !== undefined) {
      onSeekToTimestamp(stratagem.videoTimestamp);
    }
  };

  return (
    <div className="stratagem-card">
      <div
        className={`stratagem-card-header ${contentClassName} ${hasExpandableContent ? 'expandable' : ''}`}
        {...headerProps}
      >
        <div className="stratagem-card-info">
          <span className="stratagem-name">{stratagem.name}</span>
          {stratagem.isValidated && (
            <span className="stratagem-validated" title="Validated against database">✓</span>
          )}
          {displayCpCost && (
            <span className="stratagem-cp-cost">{displayCpCost} CP</span>
          )}
        </div>
        <div className="stratagem-card-actions">
          {stratagem.videoTimestamp !== undefined && onSeekToTimestamp && (
            <button
              onClick={handleSeek}
              className="timestamp-button"
              title="Jump to this moment in the video"
            >
              {formatTimestamp(stratagem.videoTimestamp)}
            </button>
          )}
          <ConfidenceBadge level={stratagem.confidence} />
          {isLoading && <span className="stratagem-loading">...</span>}
          {hasExpandableContent && (
            <span className={`stratagem-expand-indicator ${isExpanded ? 'expanded' : ''}`}>
              ▼
            </span>
          )}
        </div>
      </div>

      {/* Show suggestion if not validated but has a suggested match */}
      {!stratagem.isValidated && stratagem.suggestedMatch && (
        <div className="stratagem-suggestion">
          <span className="suggestion-label">Did you mean:</span>
          <span className="suggestion-name">{stratagem.suggestedMatch.name}</span>
          <span className="suggestion-confidence">
            ({Math.round(stratagem.suggestedMatch.confidence * 100)}%)
          </span>
        </div>
      )}

      {isExpanded && (hasPrevalidatedData || details) && (
        <div className="stratagem-details">
          {displayPhase && (
            <div className="stratagem-meta">
              <span className="stratagem-phase">{displayPhase}</span>
              {displayDetachment && (
                <span className="stratagem-detachment">{displayDetachment}</span>
              )}
            </div>
          )}
          {details?.when && (
            <div className="stratagem-section">
              <span className="stratagem-section-label">When:</span>
              <span className="stratagem-section-text">
                <RuleText text={details.when} />
              </span>
            </div>
          )}
          {details?.target && (
            <div className="stratagem-section">
              <span className="stratagem-section-label">Target:</span>
              <span className="stratagem-section-text">
                <RuleText text={details.target} />
              </span>
            </div>
          )}
          {displayEffect && (
            <div className="stratagem-section">
              <span className="stratagem-section-label">Effect:</span>
              <span className="stratagem-section-text">
                <RuleText text={displayEffect} />
              </span>
            </div>
          )}
          {details?.restrictions && (
            <div className="stratagem-section stratagem-restrictions">
              <span className="stratagem-section-label">Restrictions:</span>
              <span className="stratagem-section-text">
                <RuleText text={details.restrictions} />
              </span>
            </div>
          )}
        </div>
      )}

      {error && !hasPrevalidatedData && (
        <div className="stratagem-error">
          Unable to load stratagem details
        </div>
      )}
    </div>
  );
}
