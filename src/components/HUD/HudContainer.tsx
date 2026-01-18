import React, { useEffect } from 'react';
import { useBattleStore } from '@/store/battle-store';
import { useSettingsStore } from '@/store/settings-store';
import { PlayerCard } from './PlayerCard';
import { LoadingState } from './LoadingState';

export function HudContainer(): React.ReactElement {
  const { report, loading, error, isExpanded, toggleExpanded, reset } =
    useBattleStore();
  const { loadSettings } = useSettingsStore();

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleRefresh = () => {
    reset();
    // Trigger re-extraction by reloading the page
    window.location.reload();
  };

  return (
    <div className="hud-container">
      <div className="hud-header" onClick={toggleExpanded}>
        <div className="hud-title">
          <span>⚔️</span>
          <span>Battle Report HUD</span>
          {report && (
            <span style={{ fontSize: '12px', color: '#888' }}>
              {report.players.length} players, {report.units.length} units
            </span>
          )}
        </div>
        <span className={`hud-toggle ${isExpanded ? '' : 'collapsed'}`}>▼</span>
      </div>

      <div className={`hud-content ${isExpanded ? '' : 'collapsed'}`}>
        {loading && <LoadingState />}

        {error && (
          <div className="error-state">
            <div style={{ fontWeight: 600, marginBottom: '8px' }}>
              Error extracting battle report
            </div>
            <div>{error}</div>
            <button className="refresh-button" onClick={handleRefresh}>
              ↻ Try Again
            </button>
          </div>
        )}

        {!loading && !error && !report && (
          <div className="empty-state">
            <div style={{ marginBottom: '8px' }}>
              No battle report data found
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              This video may not be a Warhammer 40k battle report, or the
              analysis failed.
            </div>
            <button className="refresh-button" onClick={handleRefresh}>
              ↻ Retry Analysis
            </button>
          </div>
        )}

        {report && (
          <>
            {report.mission && (
              <div style={{ marginBottom: '12px', color: '#888' }}>
                Mission: <span style={{ color: '#fff' }}>{report.mission}</span>
                {report.pointsLimit && (
                  <span> ({report.pointsLimit} points)</span>
                )}
              </div>
            )}

            {report.players.map((player, index) => (
              <PlayerCard
                key={`player-${index}`}
                player={player}
                playerIndex={index}
                units={report.units}
                stratagems={report.stratagems}
              />
            ))}

            {/* Stratagems without player assignment */}
            {report.stratagems.filter((s) => s.playerIndex === undefined)
              .length > 0 && (
              <div className="player-card">
                <div className="section-title">Other Stratagems Mentioned</div>
                <div className="unit-list">
                  {report.stratagems
                    .filter((s) => s.playerIndex === undefined)
                    .map((stratagem, index) => (
                      <div
                        key={`strat-${index}`}
                        className="unit-item"
                        style={{ color: '#a855f7' }}
                      >
                        {stratagem.name}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
