import React, { useState, useEffect } from 'react';
import { useBattleStore } from '@/store/battle-store';
import { useFeedbackStore } from '@/store/feedback-store';
import { FeedbackItemCard } from './FeedbackItemCard';

export function FeedbackPanel(): React.ReactElement | null {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const feedbackItems = useBattleStore((state) => state.feedbackItems);
  const resolveFeedback = useBattleStore((state) => state.resolveFeedback);
  const ignoreFeedback = useBattleStore((state) => state.ignoreFeedback);

  const addUserMapping = useFeedbackStore((state) => state.addUserMapping);
  const loadUserMappings = useFeedbackStore((state) => state.loadUserMappings);

  // Load user mappings on mount
  useEffect(() => {
    loadUserMappings();
  }, [loadUserMappings]);

  const pendingItems = feedbackItems.filter((item) => item.status === 'pending');

  if (pendingItems.length === 0) {
    return null;
  }

  const handleResolve = async (
    itemId: string,
    canonicalName: string,
    saveMapping: boolean,
    item: typeof feedbackItems[0]
  ) => {
    // Update the battle report
    resolveFeedback(itemId, canonicalName);

    // Save mapping if requested
    if (saveMapping) {
      await addUserMapping({
        id: `mapping-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        alias: item.originalToken.toLowerCase(),
        canonicalName,
        entityType: item.entityType,
        factionId: item.factionId,
        createdAt: Date.now(),
        usageCount: 1,
      });
    }
  };

  const handleIgnore = (itemId: string) => {
    ignoreFeedback(itemId);
  };

  return (
    <div className="feedback-panel">
      <div
        className="feedback-panel-header"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="feedback-panel-title">
          <span className="feedback-icon">?</span>
          <span>Unknown Entities</span>
          <span className="feedback-count">{pendingItems.length}</span>
        </div>
        <span className={`feedback-toggle ${isCollapsed ? 'collapsed' : ''}`}>
          ▼
        </span>
      </div>

      {!isCollapsed && (
        <div className="feedback-panel-content">
          <p className="feedback-panel-description">
            The following items couldn&apos;t be matched with high confidence.
            Help improve accuracy by selecting the correct match or ignoring them.
          </p>

          <div className="feedback-items-list">
            {pendingItems.map((item) => (
              <FeedbackItemCard
                key={item.id}
                item={item}
                onResolve={(canonicalName, saveMapping) =>
                  handleResolve(item.id, canonicalName, saveMapping, item)
                }
                onIgnore={() => handleIgnore(item.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
