/**
 * Extraction state machine hook.
 *
 * States: idle → fetching → faction-select → extracting → complete
 *                                                     ↘ error
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useBattleStore, type TranscriptSegment } from '@battlereport/hud';
import { api, type FetchVideoResponse, type StageArtifact } from '../services/api';
import {
  FETCH_PROGRESS_STEPS,
  EXTRACT_PROGRESS_STEPS,
  type ProgressStep,
} from '../constants/progress-steps';

export type ExtractionStep = 'idle' | 'fetching' | 'faction-select' | 'extracting' | 'complete' | 'error';

interface ExtractionState {
  step: ExtractionStep;
  error: string | null;
  videoData: FetchVideoResponse | null;
}

interface ScheduledLog {
  timerId: ReturnType<typeof setTimeout>;
  logId: string | null;
}

/**
 * Get status for progress log from artifact status.
 */
function getLogStatus(artifact: StageArtifact): 'pending' | 'in-progress' | 'complete' | 'error' {
  switch (artifact.status) {
    case 'running':
      return 'in-progress';
    case 'completed':
      return 'complete';
    case 'failed':
      return 'error';
    default:
      return 'pending';
  }
}

/**
 * Format duration for display.
 */
function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Build progress message from artifact.
 */
function buildProgressMessage(artifact: StageArtifact): string {
  const duration = artifact.durationMs ? ` (${formatDuration(artifact.durationMs)})` : '';
  const statusIcon = artifact.status === 'completed' ? '✓' : artifact.status === 'failed' ? '✗' : '→';

  // Stage names to friendly labels
  const stageLabels: Record<string, string> = {
    'cache-hit': 'Cache Hit',
    'load-factions': 'Load Faction Data',
    'llm-preprocess': 'LLM Preprocessing',
    'pattern-preprocess': 'Pattern Preprocessing',
    'ai-assignment': 'AI Assignment',
    'build-result': 'Build Result',
    'prepare-prompt': 'Prepare Prompt',
    'ai-extraction': 'AI Extraction',
    'parse-response': 'Parse Response',
    'build-report': 'Build Report',
    'validate-units': 'Validate Units',
  };

  const label = stageLabels[artifact.name] || artifact.name;

  // Special handling for cache-hit (stage 0)
  if (artifact.name === 'cache-hit') {
    return `${statusIcon} ${label}${duration}\n  → ${artifact.summary}`;
  }

  if (artifact.status === 'completed') {
    return `${statusIcon} Stage ${artifact.stage}: ${label}${duration}\n  → ${artifact.summary}`;
  } else if (artifact.status === 'failed') {
    return `${statusIcon} Stage ${artifact.stage}: ${label} - ${artifact.error || 'Failed'}`;
  } else {
    return `${statusIcon} Stage ${artifact.stage}: ${label}...`;
  }
}

export function useExtraction() {
  const [state, setState] = useState<ExtractionState>({
    step: 'idle',
    error: null,
    videoData: null,
  });

  const battleStore = useBattleStore();
  const scheduledLogsRef = useRef<ScheduledLog[]>([]);

  /**
   * Clear all pending progress timers
   */
  const clearProgressTimers = useCallback(() => {
    for (const scheduled of scheduledLogsRef.current) {
      clearTimeout(scheduled.timerId);
    }
    scheduledLogsRef.current = [];
  }, []);

  /**
   * Schedule progress steps to appear sequentially (used for fetch phase)
   */
  const scheduleProgressSteps = useCallback((steps: ProgressStep[]) => {
    clearProgressTimers();

    for (const step of steps) {
      const timerId = setTimeout(() => {
        const logId = battleStore.addProgressLog(step.message, 'in-progress');
        // Find the scheduled log entry and update with the logId
        const scheduled = scheduledLogsRef.current.find(s => s.timerId === timerId);
        if (scheduled) {
          scheduled.logId = logId;
        }
      }, step.delay);

      scheduledLogsRef.current.push({ timerId, logId: null });
    }
  }, [battleStore, clearProgressTimers]);

  /**
   * Complete all in-progress logs and clear timers
   */
  const completeAllProgressSteps = useCallback(() => {
    clearProgressTimers();

    // Mark all in-progress logs as complete
    const logs = battleStore.progressLogs;
    for (const log of logs) {
      if (log.status === 'in-progress') {
        battleStore.updateProgressLog(log.id, { status: 'complete' });
      }
    }
  }, [battleStore, clearProgressTimers]);

  /**
   * Mark all in-progress logs as error
   */
  const errorAllProgressSteps = useCallback(() => {
    clearProgressTimers();

    // Mark any in-progress log as error
    const logs = battleStore.progressLogs;
    for (const log of logs) {
      if (log.status === 'in-progress') {
        battleStore.updateProgressLog(log.id, { status: 'error' });
      }
    }
  }, [battleStore, clearProgressTimers]);

  /**
   * Add progress logs from extraction artifacts.
   */
  const addArtifactLogs = useCallback((artifacts: StageArtifact[]) => {
    // Sort artifacts by stage number
    const sortedArtifacts = [...artifacts].sort((a, b) => a.stage - b.stage);

    for (const artifact of sortedArtifacts) {
      const message = buildProgressMessage(artifact);
      const status = getLogStatus(artifact);
      battleStore.addProgressLog(message, status);
    }
  }, [battleStore]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearProgressTimers();
    };
  }, [clearProgressTimers]);

  /**
   * Start the extraction process by fetching video data.
   */
  const fetchVideo = useCallback(async (url: string) => {
    setState({ step: 'fetching', error: null, videoData: null });
    battleStore.startExtraction();
    battleStore.setPhase('extracting', 'Fetching video data...');

    // Schedule fetch progress steps (video fetching doesn't have artifacts yet)
    scheduleProgressSteps(FETCH_PROGRESS_STEPS);

    try {
      const data = await api.fetchVideo(url);

      // Complete all progress logs
      completeAllProgressSteps();

      setState({ step: 'faction-select', error: null, videoData: data });
      battleStore.setDetectedFactions(data.detectedFactions, data.allFactions);
      battleStore.setPhase('faction-select');

      return data;
    } catch (error) {
      errorAllProgressSteps();
      battleStore.addProgressLog('Failed to fetch video data', 'error');

      const message = error instanceof Error ? error.message : 'Failed to fetch video';
      setState({ step: 'error', error: message, videoData: null });
      battleStore.setError(message);
      throw error;
    }
  }, [battleStore, scheduleProgressSteps, completeAllProgressSteps, errorAllProgressSteps]);

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
    battleStore.clearProgressLogs();

    // Schedule extraction progress steps for user feedback during async operation
    scheduleProgressSteps(EXTRACT_PROGRESS_STEPS);

    try {
      const response = await api.extractBattleReport(url, factions, transcript);

      // Clear the initial message
      battleStore.clearProgressLogs();

      // Add artifact-based progress logs if available
      if (response.artifacts && response.artifacts.length > 0) {
        addArtifactLogs(response.artifacts);
      }

      battleStore.addProgressLog('Extraction complete!', 'complete');

      setState(prev => ({ ...prev, step: 'complete' }));
      battleStore.setReport(response, state.videoData?.videoId || '');

      return response;
    } catch (error) {
      errorAllProgressSteps();
      battleStore.addProgressLog('Extraction failed', 'error');

      const message = error instanceof Error ? error.message : 'Failed to extract battle report';
      setState(prev => ({ ...prev, step: 'error', error: message }));
      battleStore.setError(message);
      throw error;
    }
  }, [battleStore, state.videoData?.videoId, addArtifactLogs, errorAllProgressSteps, scheduleProgressSteps, completeAllProgressSteps]);

  /**
   * Reset to initial state.
   */
  const reset = useCallback(() => {
    clearProgressTimers();
    setState({ step: 'idle', error: null, videoData: null });
    battleStore.reset();
  }, [battleStore, clearProgressTimers]);

  return {
    ...state,
    fetchVideo,
    extractWithFactions,
    reset,
  };
}
