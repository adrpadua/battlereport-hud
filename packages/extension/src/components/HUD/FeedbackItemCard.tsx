import React, { useState } from 'react';
import type { FeedbackItem } from '@battlereport/shared/types';

interface FeedbackItemCardProps {
  item: FeedbackItem;
  onResolve: (canonicalName: string, saveMapping: boolean) => void;
  onIgnore: () => void;
}

export function FeedbackItemCard({
  item,
  onResolve,
  onIgnore,
}: FeedbackItemCardProps): React.ReactElement {
  const [customName, setCustomName] = useState('');
  const [saveMapping, setSaveMapping] = useState(true);
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleAcceptSuggestion = (name: string) => {
    onResolve(name, saveMapping);
  };

  const handleSubmitCustom = () => {
    if (customName.trim()) {
      onResolve(customName.trim(), saveMapping);
    }
  };

  if (item.status !== 'pending') {
    return (
      <div className="feedback-item feedback-item-resolved">
        <div className="feedback-item-header">
          <span className="feedback-original-token">{item.originalToken}</span>
          <span className="feedback-status-badge">
            {item.status === 'resolved' ? `Resolved to: ${item.resolvedTo}` : 'Ignored'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="feedback-item">
      <div className="feedback-item-header">
        <div className="feedback-item-info">
          <span className="feedback-entity-type">{item.entityType}</span>
          <span className="feedback-original-token">&quot;{item.originalToken}&quot;</span>
          <span className="feedback-confidence">
            ({Math.round(item.confidenceScore * 100)}% conf)
          </span>
        </div>
        {item.playerIndex !== undefined && (
          <span className="feedback-player-badge">P{item.playerIndex + 1}</span>
        )}
      </div>

      {item.transcriptContext && (
        <div className="feedback-context">
          <span className="feedback-context-label">Context:</span>
          <span className="feedback-context-text">&quot;...{item.transcriptContext}...&quot;</span>
        </div>
      )}

      {item.suggestions.length > 0 && (
        <div className="feedback-suggestions">
          <span className="feedback-suggestions-label">Suggestions:</span>
          <div className="feedback-suggestion-buttons">
            {item.suggestions.slice(0, 3).map((suggestion: { name: string; confidence: number }) => (
              <button
                key={suggestion.name}
                className="feedback-suggestion-btn"
                onClick={() => handleAcceptSuggestion(suggestion.name)}
                title={`${Math.round(suggestion.confidence * 100)}% match`}
              >
                {suggestion.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!showCustomInput ? (
        <div className="feedback-actions">
          <button
            className="feedback-custom-btn"
            onClick={() => setShowCustomInput(true)}
          >
            Enter custom name
          </button>
          <button className="feedback-ignore-btn" onClick={onIgnore}>
            Ignore
          </button>
        </div>
      ) : (
        <div className="feedback-custom-input-group">
          <input
            type="text"
            className="feedback-custom-input"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Enter correct name..."
            onKeyDown={(e) => e.key === 'Enter' && handleSubmitCustom()}
            autoFocus
          />
          <button
            className="feedback-submit-btn"
            onClick={handleSubmitCustom}
            disabled={!customName.trim()}
          >
            Apply
          </button>
          <button
            className="feedback-cancel-btn"
            onClick={() => setShowCustomInput(false)}
          >
            Cancel
          </button>
        </div>
      )}

      <label className="feedback-save-mapping">
        <input
          type="checkbox"
          checked={saveMapping}
          onChange={(e) => setSaveMapping(e.target.checked)}
        />
        <span>Remember this for future extractions</span>
      </label>
    </div>
  );
}
