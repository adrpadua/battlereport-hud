/**
 * Extraction state machine hook.
 *
 * States: idle → fetching → faction-select → extracting → complete
 *                                                     ↘ error
 */

import { useState, useCallback } from 'react';
import { useBattleStore, type TranscriptSegment } from '@battlereport/hud';
import { api, type FetchVideoResponse } from '../services/api';

export type ExtractionStep = 'idle' | 'fetching' | 'faction-select' | 'extracting' | 'complete' | 'error';

interface ExtractionState {
  step: ExtractionStep;
  error: string | null;
  videoData: FetchVideoResponse | null;
}

export function useExtraction() {
  const [state, setState] = useState<ExtractionState>({
    step: 'idle',
    error: null,
    videoData: null,
  });

  const battleStore = useBattleStore();

  /**
   * Start the extraction process by fetching video data.
   */
  const fetchVideo = useCallback(async (url: string) => {
    setState({ step: 'fetching', error: null, videoData: null });
    battleStore.startExtraction();
    battleStore.setPhase('extracting', 'Fetching video data...');

    try {
      const data = await api.fetchVideo(url);

      setState({ step: 'faction-select', error: null, videoData: data });
      battleStore.setDetectedFactions(data.detectedFactions, data.allFactions);
      battleStore.setPhase('faction-select');

      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch video';
      setState({ step: 'error', error: message, videoData: null });
      battleStore.setError(message);
      throw error;
    }
  }, [battleStore]);

  /**
   * Continue extraction with selected factions.
   */
  const extractWithFactions = useCallback(async (
    url: string,
    factions: [string, string],
    transcript?: TranscriptSegment[]
  ) => {
    setState(prev => ({ ...prev, step: 'extracting', error: null }));
    battleStore.setPhase('ai-extracting', 'Extracting battle report...');
    battleStore.setSelectedFactions(factions);

    try {
      const report = await api.extractBattleReport(url, factions, transcript);

      setState(prev => ({ ...prev, step: 'complete' }));
      battleStore.setReport(report, state.videoData?.videoId || '');

      return report;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to extract battle report';
      setState(prev => ({ ...prev, step: 'error', error: message }));
      battleStore.setError(message);
      throw error;
    }
  }, [battleStore, state.videoData?.videoId]);

  /**
   * Reset to initial state.
   */
  const reset = useCallback(() => {
    setState({ step: 'idle', error: null, videoData: null });
    battleStore.reset();
  }, [battleStore]);

  return {
    ...state,
    fetchVideo,
    extractWithFactions,
    reset,
  };
}
