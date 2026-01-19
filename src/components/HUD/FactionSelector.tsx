import React, { useState, useEffect } from 'react';
import { useBattleStore } from '@/store/battle-store';

// Type for the global continue function exposed by content script
declare global {
  interface Window {
    battleReportContinueWithFactions?: (factions: [string, string]) => Promise<void>;
  }
}

export function FactionSelector(): React.ReactElement {
  const { detectedFactions, selectedFactions, allFactions, setSelectedFactions } = useBattleStore();

  // Local state for the dropdowns
  const [player1Faction, setPlayer1Faction] = useState<string>(
    selectedFactions?.[0] ?? detectedFactions[0] ?? ''
  );
  const [player2Faction, setPlayer2Faction] = useState<string>(
    selectedFactions?.[1] ?? detectedFactions[1] ?? detectedFactions[0] ?? ''
  );

  // Update local state when detected factions change
  useEffect(() => {
    if (!player1Faction && detectedFactions[0]) {
      setPlayer1Faction(detectedFactions[0]);
    }
    if (!player2Faction && (detectedFactions[1] || detectedFactions[0])) {
      setPlayer2Faction(detectedFactions[1] ?? detectedFactions[0] ?? '');
    }
  }, [detectedFactions, player1Faction, player2Faction]);

  const handleContinue = async () => {
    if (!player1Faction || !player2Faction) {
      return;
    }

    setSelectedFactions([player1Faction, player2Faction]);

    if (window.battleReportContinueWithFactions) {
      await window.battleReportContinueWithFactions([player1Faction, player2Faction]);
    }
  };

  // Sort factions: detected first, then alphabetically
  const sortedFactions = [...allFactions].sort((a, b) => {
    const aDetected = detectedFactions.includes(a);
    const bDetected = detectedFactions.includes(b);
    if (aDetected && !bDetected) return -1;
    if (!aDetected && bDetected) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="faction-selector">
      <div className="faction-selector-header">
        Select Factions
      </div>

      {detectedFactions.length > 0 && (
        <div className="detected-factions">
          Detected: {detectedFactions.join(' vs ')}
        </div>
      )}

      <div className="faction-dropdowns">
        <div className="faction-dropdown-group">
          <label htmlFor="player1-faction">Player 1</label>
          <select
            id="player1-faction"
            value={player1Faction}
            onChange={(e) => setPlayer1Faction(e.target.value)}
            className="faction-select"
          >
            <option value="">Select faction...</option>
            {sortedFactions.map((faction) => (
              <option key={faction} value={faction}>
                {faction}
                {detectedFactions.includes(faction) ? ' *' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="faction-dropdown-group">
          <label htmlFor="player2-faction">Player 2</label>
          <select
            id="player2-faction"
            value={player2Faction}
            onChange={(e) => setPlayer2Faction(e.target.value)}
            className="faction-select"
          >
            <option value="">Select faction...</option>
            {sortedFactions.map((faction) => (
              <option key={faction} value={faction}>
                {faction}
                {detectedFactions.includes(faction) ? ' *' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        className="continue-button"
        onClick={handleContinue}
        disabled={!player1Faction || !player2Faction}
      >
        Continue
      </button>
    </div>
  );
}
