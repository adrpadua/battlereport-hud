import React from 'react';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message }: LoadingStateProps): React.ReactElement {
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
