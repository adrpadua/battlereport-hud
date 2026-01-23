import React, { useState, useCallback } from 'react';
import { useBattleStore } from '../store/battle-store';
import { PlayerCard } from './PlayerCard';
import { LoadingState } from './LoadingState';
import { FactionSelector } from './FactionSelector';
import { UnitDetailModal } from './UnitDetailModal';
import { UnitSearchModal } from './UnitSearchModal';
import { StratagemList } from './StratagemList';
import { saveCorrection } from '../utils/user-corrections';
import type { UnitDetailResponse } from '../types/unit-detail';
import type { UnitSearchResult } from '../types';

interface HudContainerProps {
  onRefresh?: () => void;
  onForceReExtract?: () => void;
  onStartExtraction?: () => void;
  onContinueWithFactions?: (factions: [string, string]) => void;
  onSeekToTimestamp?: (seconds: number) => void;
  onFetchUnitDetail?: (unitName: string, faction: string) => Promise<UnitDetailResponse>;
  onSearchUnits?: (query: string, faction: string) => Promise<UnitSearchResult[]>;
}

export function HudContainer({
  onRefresh,
  onForceReExtract,
  onStartExtraction,
  onContinueWithFactions,
  onSeekToTimestamp,
  onFetchUnitDetail,
  onSearchUnits,
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
    updateUnit,
  } = useBattleStore();

  const [detailModal, setDetailModal] = useState<{
    unitName: string;
    faction: string;
  } | null>(null);

  const [searchModal, setSearchModal] = useState<{
    unitName: string;
    faction: string;
    unitIndex: number;
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

  const handleSearchCorrection = (unitName: string, faction: string, unitIndex: number): void => {
    setSearchModal({ unitName, faction, unitIndex });
  };

  const handleCloseSearch = (): void => {
    setSearchModal(null);
  };

  const handleSelectCorrection = useCallback((correctedName: string): void => {
    if (!searchModal) return;

    // Save correction to localStorage for future use
    saveCorrection(searchModal.unitName, correctedName, searchModal.faction);

    // Update the unit in the store
    updateUnit(searchModal.unitIndex, {
      name: correctedName,
      isValidated: true,
      confidence: 'high',
      suggestedMatch: undefined,
    });

    // Close the modal
    setSearchModal(null);
  }, [searchModal, updateUnit]);

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
              {'{}'}
            </button>
          )}
          {report && onForceReExtract && !loading && (
            <button
              className="header-refresh-button"
              onClick={(e) => {
                e.stopPropagation();
                onForceReExtract();
              }}
              title="Force re-extract (bypass cache)"
            >
              ↻
            </button>
          )}
          {!loading && !report && (
            <button
              className="header-refresh-button"
              onClick={(e) => {
                e.stopPropagation();
                handleRefresh();
              }}
              title="Start over"
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
                onSearchCorrection={onSearchUnits ? handleSearchCorrection : undefined}
              />
            ))}

            {/* Stratagems without player assignment */}
            {report.stratagems.filter((s) => s.playerIndex === undefined)
              .length > 0 && (
              <div className="player-card">
                <StratagemList
                  stratagems={report.stratagems.filter((s) => s.playerIndex === undefined)}
                  onSeekToTimestamp={onSeekToTimestamp}
                />
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
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
                  }}
                  title="Copy to clipboard"
                >
                  ⧉
                </button>
                <button onClick={() => setShowJsonModal(false)}>×</button>
              </div>
            </div>
            <div className="json-modal-content">
              <pre>{JSON.stringify(report, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {searchModal && onSearchUnits && (
        <UnitSearchModal
          isOpen={true}
          initialQuery={searchModal.unitName}
          faction={searchModal.faction}
          onClose={handleCloseSearch}
          onSelect={handleSelectCorrection}
          onSearch={onSearchUnits}
        />
      )}
    </div>
  );
}
