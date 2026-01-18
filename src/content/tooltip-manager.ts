import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { EntityTooltip } from '@/components/Tooltip/EntityTooltip';
import type { Unit, Stratagem, BattleReport } from '@/types/battle-report';

let tooltipRoot: Root | null = null;
let tooltipContainer: HTMLElement | null = null;
let currentReport: BattleReport | null = null;

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

  // Determine if it's a unit or stratagem
  const isUnit = 'playerIndex' in entity && !('name' in entity && currentReport.stratagems.some(s => s.name === entity.name && s.playerIndex === (entity as Stratagem).playerIndex));

  const player = isUnit
    ? currentReport.players[(entity as Unit).playerIndex]
    : (entity as Stratagem).playerIndex !== undefined
      ? currentReport.players[(entity as Stratagem).playerIndex!]
      : undefined;

  tooltipRoot.render(
    React.createElement(EntityTooltip, {
      entity,
      playerName: player?.name,
      playerFaction: player?.faction,
      x,
      y,
      visible: true,
    })
  );
}

export function hideTooltip(): void {
  if (!tooltipRoot) return;

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
  if (tooltipRoot) {
    tooltipRoot.unmount();
    tooltipRoot = null;
  }

  if (tooltipContainer) {
    tooltipContainer.remove();
    tooltipContainer = null;
  }

  currentReport = null;
}
