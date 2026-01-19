import React from 'react';

interface McpBadgeProps {
  available: boolean;
}

const badgeStyle = (available: boolean): React.CSSProperties => ({
  fontSize: 9,
  padding: '1px 4px',
  borderRadius: 3,
  backgroundColor: available ? '#1e3a5f' : '#3a3a3a',
  color: available ? '#38bdf8' : '#666',
  marginLeft: 4,
});

export function McpBadge({ available }: McpBadgeProps): React.ReactElement {
  return (
    <span style={badgeStyle(available)} title={available ? 'Enhanced data from MCP server' : 'MCP server unavailable'}>
      MCP
    </span>
  );
}
