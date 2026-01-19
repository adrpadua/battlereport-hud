import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { EntityTooltip } from '@/components/Tooltip/EntityTooltip';
import { mcpClient } from '@/services/mcp-client';
import type { Unit, Stratagem, BattleReport } from '@/types/battle-report';
import type { EnhancedUnitData, EnhancedStratagemData } from '@/types/mcp-types';

let tooltipRoot: Root | null = null;
let tooltipContainer: HTMLElement | null = null;
let currentReport: BattleReport | null = null;

// Current enhanced data state
let currentEnhancedUnitData: EnhancedUnitData | null = null;
let currentEnhancedStratagemData: EnhancedStratagemData | null = null;
let pendingFetchTimeout: ReturnType<typeof setTimeout> | null = null;
// Track current entity to prevent race conditions
let currentEntityName: string | null = null;

// Max time to wait for MCP data before showing basic tooltip
const MCP_FETCH_TIMEOUT_MS = 500;

export function initTooltipManager(report: BattleReport): void {
  currentReport = report;

  // Create tooltip container if not exists
  if (!tooltipContainer) {
    tooltipContainer = document.createElement('div');
    tooltipContainer.id = 'battlereport-hud-tooltip';
    tooltipContainer.style.cssText = `
      position: fixed;
      z-index: 9999;
      pointer-events: none;
    `;
    document.body.appendChild(tooltipContainer);

    tooltipRoot = createRoot(tooltipContainer);
  }
}

export function showTooltip(
  entity: Unit | Stratagem,
  x: number,
  y: number
): void {
  if (!tooltipRoot || !currentReport) return;

  // Clear any pending fetch
  if (pendingFetchTimeout) {
    clearTimeout(pendingFetchTimeout);
    pendingFetchTimeout = null;
  }

  // Reset enhanced data and track current entity
  currentEnhancedUnitData = null;
  currentEnhancedStratagemData = null;
  currentEntityName = entity.name;

  // Determine if it's a unit or stratagem
  const isUnit = 'playerIndex' in entity && !('name' in entity && currentReport.stratagems.some(s => s.name === entity.name && s.playerIndex === (entity as Stratagem).playerIndex));

  const player = isUnit
    ? currentReport.players[(entity as Unit).playerIndex]
    : (entity as Stratagem).playerIndex !== undefined
      ? currentReport.players[(entity as Stratagem).playerIndex!]
      : undefined;

  // Render immediately with basic data
  renderTooltip(entity, player?.name, player?.faction, x, y);

  // Start fetching enhanced data from MCP if available
  if (mcpClient.available) {
    const faction = player?.faction;

    if (isUnit) {
      fetchEnhancedUnitData(entity as Unit, faction, x, y, player?.name);
    } else {
      fetchEnhancedStratagemData(entity as Stratagem, faction, x, y, player?.name);
    }
  }
}

async function fetchEnhancedUnitData(
  unit: Unit,
  faction: string | undefined,
  x: number,
  y: number,
  playerName: string | undefined
): Promise<void> {
  const entityNameAtStart = unit.name;
  // Set a timeout to ensure we don't wait too long
  let dataReceived = false;

  pendingFetchTimeout = setTimeout(() => {
    if (!dataReceived && currentEntityName === entityNameAtStart) {
      // Re-render with whatever we have
      renderTooltip(unit, playerName, faction, x, y);
    }
  }, MCP_FETCH_TIMEOUT_MS);

  try {
    const enhancedData = await mcpClient.fetchUnit(unit.name, faction);
    dataReceived = true;

    if (pendingFetchTimeout) {
      clearTimeout(pendingFetchTimeout);
      pendingFetchTimeout = null;
    }

    // Only update if this is still the current entity (prevent race condition)
    if (enhancedData && currentEntityName === entityNameAtStart) {
      currentEnhancedUnitData = enhancedData;
      renderTooltip(unit, playerName, faction, x, y);
    }
  } catch {
    // Silent failure - just show basic tooltip
    dataReceived = true;
  }
}

async function fetchEnhancedStratagemData(
  stratagem: Stratagem,
  faction: string | undefined,
  x: number,
  y: number,
  playerName: string | undefined
): Promise<void> {
  const entityNameAtStart = stratagem.name;
  // Set a timeout to ensure we don't wait too long
  let dataReceived = false;

  pendingFetchTimeout = setTimeout(() => {
    if (!dataReceived && currentEntityName === entityNameAtStart) {
      // Re-render with whatever we have
      renderTooltip(stratagem, playerName, faction, x, y);
    }
  }, MCP_FETCH_TIMEOUT_MS);

  try {
    const enhancedData = await mcpClient.fetchStratagem(stratagem.name, faction);
    dataReceived = true;

    if (pendingFetchTimeout) {
      clearTimeout(pendingFetchTimeout);
      pendingFetchTimeout = null;
    }

    // Only update if this is still the current entity (prevent race condition)
    if (enhancedData && currentEntityName === entityNameAtStart) {
      currentEnhancedStratagemData = enhancedData;
      renderTooltip(stratagem, playerName, faction, x, y);
    }
  } catch {
    // Silent failure - just show basic tooltip
    dataReceived = true;
  }
}

function renderTooltip(
  entity: Unit | Stratagem,
  playerName: string | undefined,
  playerFaction: string | undefined,
  x: number,
  y: number
): void {
  if (!tooltipRoot) return;

  tooltipRoot.render(
    React.createElement(EntityTooltip, {
      entity,
      playerName,
      playerFaction,
      x,
      y,
      visible: true,
      mcpAvailable: mcpClient.available,
      enhancedUnitData: currentEnhancedUnitData,
      enhancedStratagemData: currentEnhancedStratagemData,
    })
  );
}

export function hideTooltip(): void {
  if (!tooltipRoot) return;

  // Clear any pending fetch
  if (pendingFetchTimeout) {
    clearTimeout(pendingFetchTimeout);
    pendingFetchTimeout = null;
  }

  // Reset enhanced data
  currentEnhancedUnitData = null;
  currentEnhancedStratagemData = null;

  tooltipRoot.render(
    React.createElement(EntityTooltip, {
      entity: null,
      x: 0,
      y: 0,
      visible: false,
    })
  );
}

export function cleanupTooltipManager(): void {
  // Clear any pending fetch
  if (pendingFetchTimeout) {
    clearTimeout(pendingFetchTimeout);
    pendingFetchTimeout = null;
  }

  if (tooltipRoot) {
    tooltipRoot.unmount();
    tooltipRoot = null;
  }

  if (tooltipContainer) {
    tooltipContainer.remove();
    tooltipContainer = null;
  }

  currentReport = null;
  currentEnhancedUnitData = null;
  currentEnhancedStratagemData = null;
  currentEntityName = null;
}

/**
 * Manually trigger MCP health check
 * Useful when user knows server should be available
 */
export async function checkMcpConnection(): Promise<boolean> {
  return mcpClient.checkHealthNow();
}

/**
 * Clear MCP data cache
 */
export function clearMcpCache(): void {
  mcpClient.clearCache();
}
