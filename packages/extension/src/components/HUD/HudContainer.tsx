import React, { useEffect } from 'react';
import { useBattleStore } from '@/store/battle-store';
import { useSettingsStore } from '@/store/settings-store';
import { PlayerCard } from './PlayerCard';
import { LoadingState } from './LoadingState';
import { FactionSelector } from './FactionSelector';
import { FeedbackPanel } from './FeedbackPanel';

// Type for the global functions exposed by content script
declare global {
  interface Window {
    battleReportHudRefresh?: () => Promise<void>;
    battleReportStartExtraction?: () => Promise<void>;
    battleReportClearCache?: () => Promise<void>;
  }
}

export function HudContainer(): React.ReactElement {
  const {
    report,
    loading,
    error,
    isExpanded,
    toggleExpanded,
    reset,
    phase,
    statusMessage,
    hasPendingFeedback,
  } = useBattleStore();
  const { loadSettings } = useSettingsStore();

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleRefresh = async () => {
    // Use the forceRefresh function exposed by the content script
    // This clears cache and re-extracts without page reload
    if (window.battleReportHudRefresh) {
      await window.battleReportHudRefresh();
    } else {
      // Fallback to page reload
      reset();
      window.location.reload();
    }
  };

  const handleStartExtraction = async () => {
    if (window.battleReportStartExtraction) {
      await window.battleReportStartExtraction();
    }
  };

  const handleClearCache = async () => {
    if (window.battleReportClearCache) {
      await window.battleReportClearCache();
    }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {report && !loading && (
            <button
              className="header-refresh-button"
              onClick={(e) => {
                e.stopPropagation();
                handleClearCache();
              }}
              title="Clear cached AI response"
            >
              ×
            </button>
          )}
          {!loading && (
            <button
              className="header-refresh-button"
              onClick={(e) => {
                e.stopPropagation();
                handleRefresh();
              }}
              title="Re-extract battle report (clears cache)"
            >
              ↻
            </button>
          )}
          <span className={`hud-toggle ${isExpanded ? '' : 'collapsed'}`}>▼</span>
        </div>
      </div>

      <div className={`hud-content ${isExpanded ? '' : 'collapsed'}`}>
        {/* Idle state - show Extract button */}
        {phase === 'idle' && !error && (
          <div className="idle-state">
            <div style={{ marginBottom: '12px', color: '#888' }}>
              Ready to analyze this video
            </div>
            <button className="extract-button" onClick={handleStartExtraction}>
              Extract Battle Report
            </button>
          </div>
        )}

        {/* Loading states */}
        {(phase === 'extracting' || phase === 'ai-extracting') && (
          <LoadingState message={statusMessage} />
        )}

        {/* Faction selection */}
        {phase === 'faction-select' && <FactionSelector />}

        {/* Error state */}
        {(phase === 'error' || error) && (
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
                stratagems={report.stratagems}
              />
            ))}

            {/* Feedback panel for unknown/low-confidence entities */}
            {hasPendingFeedback && <FeedbackPanel />}

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
                      >
                        <span style={{ color: '#a855f7' }}>{stratagem.name}</span>
                        {stratagem.videoTimestamp !== undefined && (
                          <button
                            className="timestamp-button"
                            onClick={() => {
                              const video = document.querySelector('video');
                              if (video) video.currentTime = stratagem.videoTimestamp!;
                            }}
                            title="Jump to this moment in the video"
                          >
                            {Math.floor(stratagem.videoTimestamp / 60)}:{(stratagem.videoTimestamp % 60).toString().padStart(2, '0')}
                          </button>
                        )}
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
