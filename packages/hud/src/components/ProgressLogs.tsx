import React, { useEffect, useRef } from 'react';
import type { ProgressLogEntry } from '../types';

interface ProgressLogsProps {
  logs: ProgressLogEntry[];
}

function getStatusClass(status: ProgressLogEntry['status']): string {
  switch (status) {
    case 'pending':
      return 'progress-log-pending';
    case 'in-progress':
      return 'progress-log-in-progress';
    case 'complete':
      return 'progress-log-complete';
    case 'error':
      return 'progress-log-error';
    default:
      return '';
  }
}

/**
 * Parse a progress message that may contain multi-line artifact data.
 * Format: "→ Stage 1: Load Faction Data (245ms)\n  → Loaded 47 units..."
 */
function parseProgressMessage(message: string): { header: string; summary?: string } {
  const lines = message.split('\n');
  const header = lines[0] || message;
  const summary = lines.length > 1 ? lines.slice(1).join('\n').trim() : undefined;
  return { header, summary };
}

export function ProgressLogs({ logs }: ProgressLogsProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest entry
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="progress-logs" ref={containerRef}>
      {logs.map((log) => {
        const { header, summary } = parseProgressMessage(log.message);

        return (
          <div
            key={log.id}
            className={`progress-log-entry ${getStatusClass(log.status)}`}
          >
            <div className="progress-log-header">{header}</div>
            {summary && (
              <div className="progress-log-summary">{summary}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
