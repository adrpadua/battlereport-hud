import React from 'react';
import type { ProgressLogEntry } from '../types';
import { ProgressLogs } from './ProgressLogs';

interface LoadingStateProps {
  message?: string;
  progressLogs?: ProgressLogEntry[];
}

export function LoadingState({ message, progressLogs }: LoadingStateProps): React.ReactElement {
  // If we have progress logs, show them instead of the simple spinner
  if (progressLogs && progressLogs.length > 0) {
    return (
      <div className="loading-state">
        <div className="loading-state-header">
          <div className="loading-spinner-small" />
          <span>{message || 'Analyzing battle report...'}</span>
        </div>
        <ProgressLogs logs={progressLogs} />
      </div>
    );
  }

  // Fall back to simple spinner
  return (
    <div className="loading-state">
      <div className="loading-spinner" />
      <div>{message || 'Analyzing battle report...'}</div>
      <div style={{ fontSize: '12px', marginTop: '4px', color: '#666' }}>
        This may take a moment
      </div>
    </div>
  );
}
