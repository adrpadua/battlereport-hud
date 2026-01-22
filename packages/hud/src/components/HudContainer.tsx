import React, { useState } from 'react';
import { useBattleStore } from '../store/battle-store';
import { PlayerCard } from './PlayerCard';
import { LoadingState } from './LoadingState';
import { FactionSelector } from './FactionSelector';
import { UnitDetailModal } from './UnitDetailModal';
import type { UnitDetailResponse } from '../types/unit-detail';

interface HudContainerProps {
  onRefresh?: () => void;
  onStartExtraction?: () => void;
  onContinueWithFactions?: (factions: [string, string]) => void;
  onSeekToTimestamp?: (seconds: number) => void;
  onFetchUnitDetail?: (unitName: string, faction: string) => Promise<UnitDetailResponse>;
}

export function HudContainer({
  onRefresh,
  onStartExtraction,
  onContinueWithFactions,
  onSeekToTimestamp,
  onFetchUnitDetail,
}: HudContainerProps): React.ReactElement {
  const {
    report,
    loading,
    error,
    isExpanded,
    toggleExpanded,
    reset,
    phase,
    statusMessage,
    progressLogs,
  } = useBattleStore();

  const [detailModal, setDetailModal] = useState<{
    unitName: string;
    faction: string;
  } | null>(null);

  const [showJsonModal, setShowJsonModal] = useState(false);

  const handleOpenDetail = (unitName: string, faction: string): void => {
    setDetailModal({ unitName, faction });
  };

  const handleCloseDetail = (): void => {
    setDetailModal(null);
  };

  const handleRefresh = (): void => {
    if (onRefresh) {
      onRefresh();
    } else {
      reset();
    }
  };

  const handleStartExtraction = (): void => {
    if (onStartExtraction) {
      onStartExtraction();
    }
  };

  const handleSeek = (seconds: number): void => {
    if (onSeekToTimestamp) {
      onSeekToTimestamp(seconds);
    }
  };

  const formatTimestamp = (seconds: number): string => {
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
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
          {report && (
            <button
              className="header-refresh-button"
              onClick={(e) => {
                e.stopPropagation();
                setShowJsonModal(true);
              }}
              title="View raw JSON response"
              style={{ fontSize: '11px' }}
            >
              { }
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
          <LoadingState message={statusMessage} progressLogs={progressLogs} />
        )}

        {/* Faction selection */}
        {phase === 'faction-select' && (
          <FactionSelector onContinue={onContinueWithFactions} />
        )}

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
                enhancements={report.enhancements}
                onSeekToTimestamp={onSeekToTimestamp}
                onOpenDetail={onFetchUnitDetail ? handleOpenDetail : undefined}
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
                      >
                        <span style={{ color: '#a855f7' }}>{stratagem.name}</span>
                        {stratagem.videoTimestamp !== undefined && onSeekToTimestamp && (
                          <button
                            className="timestamp-button"
                            onClick={() => handleSeek(stratagem.videoTimestamp!)}
                            title="Jump to this moment in the video"
                          >
                            {formatTimestamp(stratagem.videoTimestamp)}
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Enhancements without player assignment */}
            {report.enhancements && report.enhancements.filter((e) => e.playerIndex === undefined)
              .length > 0 && (
              <div className="player-card">
                <div className="section-title">Other Enhancements Mentioned</div>
                <div className="unit-list">
                  {report.enhancements
                    .filter((e) => e.playerIndex === undefined)
                    .map((enhancement, index) => (
                      <div
                        key={`enhancement-${index}`}
                        className="unit-item"
                      >
                        <span style={{ color: '#f59e0b' }}>{enhancement.name}</span>
                        {enhancement.pointsCost !== undefined && (
                          <span style={{ color: '#9ca3af', marginLeft: '4px' }}>
                            ({enhancement.pointsCost}pts)
                          </span>
                        )}
                        {enhancement.videoTimestamp !== undefined && onSeekToTimestamp && (
                          <button
                            className="timestamp-button"
                            onClick={() => handleSeek(enhancement.videoTimestamp!)}
                            title="Jump to this moment in the video"
                          >
                            {formatTimestamp(enhancement.videoTimestamp)}
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

      {detailModal && onFetchUnitDetail && (
        <UnitDetailModal
          unitName={detailModal.unitName}
          faction={detailModal.faction}
          onClose={handleCloseDetail}
          onFetch={onFetchUnitDetail}
        />
      )}

      {showJsonModal && report && (
        <div className="json-modal-overlay" onClick={() => setShowJsonModal(false)}>
          <div className="json-modal" onClick={(e) => e.stopPropagation()}>
            <div className="json-modal-header">
              <span>Raw AI Response</span>
              <button onClick={() => setShowJsonModal(false)}>×</button>
            </div>
            <div className="json-modal-content">
              <pre>{JSON.stringify(report, null, 2)}</pre>
            </div>
            <div className="json-modal-footer">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(report, null, 2));
                }}
              >
                Copy to Clipboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
