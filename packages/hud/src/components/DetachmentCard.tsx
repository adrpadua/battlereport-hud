import React, { useState, useEffect } from 'react';
import type { DetachmentDetails } from '../types';
import { RuleText } from './RuleText';
import {
  stripBattleSizeSuffix,
  stripFluffParagraphs,
} from '../utils/rule-text-parser';

interface DetachmentCardProps {
  detachmentName: string;
  faction: string;
}

export function DetachmentCard({
  detachmentName,
  faction,
}: DetachmentCardProps): React.ReactElement | null {
  const [isExpanded, setIsExpanded] = useState(false);
  const [detachment, setDetachment] = useState<DetachmentDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!detachmentName || !faction) return;

    const fetchDetachment = async () => {
      setIsLoading(true);
      setError(null);

      // Strip battle size suffix before querying
      const queryName = stripBattleSizeSuffix(detachmentName);

      try {
        const response = await fetch(
          `http://localhost:40401/api/detachments/${encodeURIComponent(queryName)}?faction=${encodeURIComponent(faction)}`
        );

        if (!response.ok) {
          if (response.status === 404) {
            setDetachment(null);
            return;
          }
          throw new Error(`Failed to fetch detachment: ${response.status}`);
        }

        const data = await response.json();
        setDetachment(data.detachment);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch detachment');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetachment();
  }, [detachmentName, faction]);

  // Don't render if no detachment name
  if (!detachmentName) {
    return null;
  }

  const handleHeaderClick = (): void => {
    if (detachment?.rule) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleHeaderKeyDown = (e: React.KeyboardEvent): void => {
    if (detachment?.rule && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setIsExpanded(!isExpanded);
    }
  };

  const hasExpandableContent = Boolean(detachment?.rule);

  return (
    <div className="detachment-section">
      <div className="section-title">DETACHMENT</div>
      <div className="detachment-card">
        <div
          className={`detachment-card-header ${isExpanded ? 'expanded' : ''} ${hasExpandableContent ? 'expandable' : ''}`}
          onClick={handleHeaderClick}
          onKeyDown={handleHeaderKeyDown}
          role={hasExpandableContent ? 'button' : undefined}
          tabIndex={hasExpandableContent ? 0 : undefined}
          aria-expanded={hasExpandableContent ? isExpanded : undefined}
        >
          <div className="detachment-card-info">
            <span className="detachment-name">{detachmentName}</span>
            {detachment?.ruleName && (
              <span className="detachment-rule-name">{detachment.ruleName}</span>
            )}
          </div>
          <div className="detachment-card-actions">
            {isLoading && <span className="detachment-loading">...</span>}
            {hasExpandableContent && (
              <span className={`detachment-expand-indicator ${isExpanded ? 'expanded' : ''}`}>
                ▼
              </span>
            )}
          </div>
        </div>

        {isExpanded && detachment?.rule && (
          <div className="detachment-details">
            <div className="detachment-rule-text">
              {stripFluffParagraphs(detachment.rule).split(/\n\n+/).map((paragraph, index) => (
                <p key={index} className="detachment-rule-paragraph">
                  <RuleText text={paragraph} />
                </p>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="detachment-error">
            Unable to load detachment details
          </div>
        )}
      </div>
    </div>
  );
}
