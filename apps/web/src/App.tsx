import React, { useRef, useState, useCallback } from 'react';
import { HudContainer, useBattleStore } from '@battlereport/hud';
import type { UnitDetailResponse, UnitSearchResult } from '@battlereport/hud';
import { VideoInput } from './components/VideoInput';
import { YouTubePlayer, type YouTubePlayerHandle } from './components/YouTubePlayer';
import { useExtraction } from './hooks/useExtraction';
import { api } from './services/api';

// Extract video ID from URL for player
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1] ?? null;
    }
  }

  return null;
}

function App(): React.ReactElement {
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const [currentUrl, setCurrentUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [lastFactions, setLastFactions] = useState<[string, string] | null>(null);

  const { step, videoData, fetchVideo, extractWithFactions, reset } = useExtraction();
  const { report } = useBattleStore();

  const handleAnalyze = useCallback(async (url: string) => {
    setCurrentUrl(url);
    const id = extractVideoId(url);
    setVideoId(id);

    try {
      await fetchVideo(url);
    } catch {
      // Error is handled in useExtraction
    }
  }, [fetchVideo]);

  const handleContinueWithFactions = useCallback(async (factions: [string, string]) => {
    if (!currentUrl || !videoData) return;

    setLastFactions(factions);
    try {
      await extractWithFactions(currentUrl, factions, videoData.transcript);
    } catch {
      // Error is handled in useExtraction
    }
  }, [currentUrl, videoData, extractWithFactions]);

  const handleRefresh = useCallback(() => {
    reset();
    setVideoId(null);
    setCurrentUrl('');
    setLastFactions(null);
  }, [reset]);

  const handleForceReExtract = useCallback(async () => {
    // Re-extract with cache bypass using current URL and factions
    if (!currentUrl || !videoData) return;

    // Use lastFactions if available, otherwise extract from cached report
    const factions = lastFactions ?? (report?.players?.length === 2
      ? [report.players[0].faction, report.players[1].faction] as [string, string]
      : null);

    if (!factions) return;

    try {
      await extractWithFactions(currentUrl, factions, videoData.transcript, true);
    } catch {
      // Error is handled in useExtraction
    }
  }, [currentUrl, lastFactions, videoData, report, extractWithFactions]);

  const handleStartExtraction = useCallback(() => {
    // For web app, this would re-trigger the URL submission
    // But we're already in a different flow, so this is handled by the form
  }, []);

  const handleSeekToTimestamp = useCallback((seconds: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(seconds);
    }
  }, []);

  const handleFetchUnitDetail = useCallback(async (unitName: string, faction: string): Promise<UnitDetailResponse> => {
    return api.getUnitDetail(unitName, faction);
  }, []);

  const handleSearchUnits = useCallback(async (query: string, faction: string): Promise<UnitSearchResult[]> => {
    return api.searchUnits(query, faction);
  }, []);

  const isLoading = step === 'fetching' || step === 'extracting';

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      {/* Header */}
      <header className="bg-hud-surface border-b border-hud-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span>⚔️</span>
            BattleReport HUD
          </h1>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* URL Input */}
        <div className="mb-6">
          <VideoInput
            onSubmit={handleAnalyze}
            isLoading={isLoading}
            disabled={step === 'faction-select'}
          />
        </div>

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column: YouTube Player */}
          <div>
            <YouTubePlayer
              ref={playerRef}
              videoId={videoId}
            />
            {videoData && (
              <div className="mt-4 p-4 bg-hud-surface rounded-lg border border-hud-border">
                <h2 className="font-semibold text-white mb-1">{videoData.title}</h2>
                <p className="text-hud-muted text-sm">{videoData.channel}</p>
              </div>
            )}
          </div>

          {/* Right column: HUD Panel */}
          <div className="hud-panel">
            <HudContainer
              onRefresh={handleRefresh}
              onForceReExtract={report ? handleForceReExtract : undefined}
              onStartExtraction={handleStartExtraction}
              onContinueWithFactions={handleContinueWithFactions}
              onSeekToTimestamp={handleSeekToTimestamp}
              onFetchUnitDetail={handleFetchUnitDetail}
              onSearchUnits={handleSearchUnits}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-hud-border mt-8">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-hud-muted text-sm">
          BattleReport HUD - Extract army lists from Warhammer 40k battle report videos
        </div>
      </footer>
    </div>
  );
}

export default App;
