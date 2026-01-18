import React from 'react';

export function LoadingState(): React.ReactElement {
  return (
    <div className="loading-state">
      <div className="loading-spinner" />
      <div>Analyzing battle report...</div>
      <div style={{ fontSize: '12px', marginTop: '4px', color: '#666' }}>
        Extracting army lists and unit information
      </div>
    </div>
  );
}
