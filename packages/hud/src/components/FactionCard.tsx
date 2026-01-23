import React, { useState, useEffect } from 'react';
import type { FactionDetails } from '../types';
import { RuleText } from './RuleText';
import { useExpandable } from '../hooks/useExpandable';

interface FactionCardProps {
  faction: string;
  totalPoints?: number;
}

export function FactionCard({
  faction,
  totalPoints,
}: FactionCardProps): React.ReactElement | null {
  const [factionDetails, setFactionDetails] = useState<FactionDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasExpandableContent = Boolean(
    factionDetails?.armyRuleEffect || factionDetails?.armyRule
  );
  const { isExpanded, headerProps, contentClassName } = useExpandable({ hasContent: hasExpandableContent });

  useEffect(() => {
    if (!faction) return;

    const fetchFaction = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `http://localhost:40401/api/factions/${encodeURIComponent(faction)}`
        );

        if (!response.ok) {
          if (response.status === 404) {
            setFactionDetails(null);
            return;
          }
          throw new Error(`Failed to fetch faction: ${response.status}`);
        }

        const data = await response.json();
        setFactionDetails(data.faction);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch faction');
      } finally {
        setIsLoading(false);
      }
    };

    fetchFaction();
  }, [faction]);

  // Don't render if no faction
  if (!faction) {
    return null;
  }

  // Get display values
  const ruleName = factionDetails?.armyRuleName || 'Army Rule';

  // Format points for display
  const pointsDisplay = totalPoints ? ` (${totalPoints} pts)` : '';

  return (
    <div className="faction-section">
      <div className="section-title">ARMY{pointsDisplay}</div>
      <div className="faction-card">
        <div
          className={`faction-card-header ${contentClassName} ${hasExpandableContent ? 'expandable' : ''}`}
          {...headerProps}
        >
          <div className="faction-card-info">
            <span className="faction-card-name">{factionDetails?.name || faction}</span>
            {hasExpandableContent && (
              <span className="faction-rule-label">{ruleName}</span>
            )}
          </div>
          <div className="faction-card-actions">
            {isLoading && <span className="faction-loading">...</span>}
            {hasExpandableContent && (
              <span className={`faction-expand-indicator ${isExpanded ? 'expanded' : ''}`}>
                ▼
              </span>
            )}
          </div>
        </div>

        {isExpanded && hasExpandableContent && (
          <div className="faction-details">
            {/* Lore text (italicized) */}
            {factionDetails?.armyRuleLore && (
              <div className="faction-rule-lore">
                {factionDetails.armyRuleLore.split(/\n\n+/).map((paragraph, index) => (
                  <p key={index} className="faction-lore-paragraph">
                    {paragraph}
                  </p>
                ))}
              </div>
            )}

            {/* Main rule effect */}
            {factionDetails?.armyRuleEffect && (
              <div className="faction-rule-text">
                {factionDetails.armyRuleEffect.split(/\n\n+/).map((paragraph, index) => (
                  <p key={index} className="faction-rule-paragraph">
                    <RuleText text={paragraph} />
                  </p>
                ))}
              </div>
            )}

            {/* Sub-abilities (e.g., Ka'tah Stances) */}
            {factionDetails?.armyRuleSubAbilities && factionDetails.armyRuleSubAbilities.length > 0 && (
              <div className="faction-sub-abilities">
                {factionDetails.armyRuleSubAbilities.map((subAbility, index) => (
                  <div key={index} className="faction-sub-ability">
                    <div className="sub-ability-name">{subAbility.name}</div>
                    {subAbility.lore && (
                      <div className="sub-ability-lore">{subAbility.lore}</div>
                    )}
                    {subAbility.effect && (
                      <div className="sub-ability-effect">
                        <RuleText text={subAbility.effect} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="faction-error">
            Unable to load faction details
          </div>
        )}
      </div>
    </div>
  );
}
