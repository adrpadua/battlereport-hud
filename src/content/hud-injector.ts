import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { HudContainer } from '@/components/HUD/HudContainer';

let shadowRoot: ShadowRoot | null = null;
let reactRoot: Root | null = null;

const HUD_CONTAINER_ID = 'battlereport-hud-container';

export function injectHud(): void {
  // Don't inject if already present
  if (document.getElementById(HUD_CONTAINER_ID)) {
    return;
  }

  // Find the secondary column (right sidebar)
  const secondaryInner = document.querySelector('#secondary-inner');
  if (!secondaryInner) {
    console.log('Battle Report HUD: Secondary column not found, retrying...');
    setTimeout(injectHud, 1000);
    return;
  }

  // Create container
  const container = document.createElement('div');
  container.id = HUD_CONTAINER_ID;
  container.style.cssText = `
    margin-bottom: 16px;
    border-radius: 12px;
    overflow: hidden;
  `;

  // Create shadow DOM for style isolation
  shadowRoot = container.attachShadow({ mode: 'open' });

  // Inject styles into shadow DOM
  const styleSheet = document.createElement('style');
  styleSheet.textContent = getHudStyles();
  shadowRoot.appendChild(styleSheet);

  // Create React mount point
  const mountPoint = document.createElement('div');
  mountPoint.className = 'battlereport-hud-root';
  shadowRoot.appendChild(mountPoint);

  // Insert at the top of the secondary column
  secondaryInner.insertBefore(container, secondaryInner.firstChild);

  // Mount React app
  reactRoot = createRoot(mountPoint);
  reactRoot.render(React.createElement(HudContainer));

  console.log('Battle Report HUD: Injected successfully');
}

export function removeHud(): void {
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }

  const container = document.getElementById(HUD_CONTAINER_ID);
  if (container) {
    container.remove();
  }

  shadowRoot = null;
}

export function getShadowRoot(): ShadowRoot | null {
  return shadowRoot;
}

function getHudStyles(): string {
  return `
    .battlereport-hud-root {
      font-family: 'Roboto', 'YouTube Noto', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      color: #e5e5e5;
    }

    .hud-container {
      background: #1a1a1a;
      border: 1px solid #3a3a3a;
      border-radius: 12px;
      overflow: hidden;
    }

    .hud-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: #242424;
      border-bottom: 1px solid #3a3a3a;
      cursor: pointer;
    }

    .hud-header:hover {
      background: #2a2a2a;
    }

    .hud-title {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .hud-toggle {
      color: #aaa;
      transition: transform 0.2s;
    }

    .hud-toggle.collapsed {
      transform: rotate(-90deg);
    }

    .hud-content {
      padding: 16px;
      max-height: 500px;
      overflow-y: auto;
    }

    .hud-content.collapsed {
      display: none;
    }

    .player-card {
      background: #242424;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }

    .player-card:last-child {
      margin-bottom: 0;
    }

    .player-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .player-name {
      font-weight: 600;
      color: #fff;
    }

    .player-faction {
      color: #aaa;
      font-size: 13px;
    }

    .player-detachment {
      color: #888;
      font-size: 12px;
      margin-top: 2px;
    }

    .section-title {
      font-size: 12px;
      font-weight: 600;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      margin-top: 16px;
    }

    .unit-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .unit-item-container {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .unit-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      background: #2a2a2a;
      border-radius: 4px;
      font-size: 13px;
    }

    .unit-name {
      color: #e5e5e5;
    }

    .unit-suggestion {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px 4px 16px;
      background: rgba(234, 179, 8, 0.1);
      border: 1px solid rgba(234, 179, 8, 0.3);
      border-radius: 4px;
      font-size: 12px;
    }

    .suggestion-label {
      color: #888;
    }

    .suggestion-name {
      color: #eab308;
      font-weight: 500;
    }

    .suggestion-confidence {
      color: #666;
      font-size: 11px;
    }

    .suggestion-accept-btn {
      margin-left: auto;
      padding: 2px 8px;
      background: rgba(34, 197, 94, 0.2);
      border: 1px solid rgba(34, 197, 94, 0.4);
      border-radius: 4px;
      color: #22c55e;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .suggestion-accept-btn:hover {
      background: rgba(34, 197, 94, 0.3);
      border-color: rgba(34, 197, 94, 0.6);
    }

    .confidence-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 500;
    }

    .confidence-high {
      background: rgba(34, 197, 94, 0.2);
      color: #22c55e;
    }

    .confidence-medium {
      background: rgba(234, 179, 8, 0.2);
      color: #eab308;
    }

    .confidence-low {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      color: #888;
    }

    .loading-spinner {
      width: 24px;
      height: 24px;
      border: 2px solid #3a3a3a;
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 12px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error-state {
      padding: 16px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      color: #ef4444;
      font-size: 13px;
    }

    .empty-state {
      padding: 24px 16px;
      text-align: center;
      color: #888;
    }

    .idle-state {
      padding: 24px 16px;
      text-align: center;
    }

    .extract-button {
      padding: 12px 24px;
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
    }

    .extract-button:hover {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    }

    .extract-button:active {
      transform: translateY(0);
    }

    /* Faction Selector Styles */
    .faction-selector {
      padding: 16px;
    }

    .faction-selector-header {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 12px;
    }

    .detected-factions {
      font-size: 12px;
      color: #22c55e;
      margin-bottom: 16px;
      padding: 8px 12px;
      background: rgba(34, 197, 94, 0.1);
      border-radius: 6px;
      border: 1px solid rgba(34, 197, 94, 0.2);
    }

    .faction-dropdowns {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 16px;
    }

    .faction-dropdown-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .faction-dropdown-group label {
      font-size: 12px;
      color: #888;
      font-weight: 500;
    }

    .faction-select {
      padding: 8px 12px;
      background: #2a2a2a;
      border: 1px solid #3a3a3a;
      border-radius: 6px;
      color: #e5e5e5;
      font-size: 13px;
      cursor: pointer;
      transition: border-color 0.2s;
    }

    .faction-select:hover {
      border-color: #4a4a4a;
    }

    .faction-select:focus {
      outline: none;
      border-color: #3b82f6;
    }

    .continue-button {
      width: 100%;
      padding: 10px 16px;
      background: #22c55e;
      border: none;
      border-radius: 6px;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .continue-button:hover:not(:disabled) {
      background: #16a34a;
    }

    .continue-button:disabled {
      background: #3a3a3a;
      color: #666;
      cursor: not-allowed;
    }

    .refresh-button {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: #3a3a3a;
      border: none;
      border-radius: 6px;
      color: #fff;
      font-size: 13px;
      cursor: pointer;
      margin-top: 12px;
    }

    .refresh-button:hover {
      background: #4a4a4a;
    }

    .refresh-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .header-refresh-button {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid #3a3a3a;
      border-radius: 6px;
      color: #888;
      font-size: 16px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .header-refresh-button:hover {
      background: #3a3a3a;
      color: #fff;
    }

    .timestamp-button {
      padding: 2px 6px;
      background: rgba(168, 85, 247, 0.2);
      border: 1px solid rgba(168, 85, 247, 0.4);
      border-radius: 4px;
      color: #a855f7;
      font-size: 11px;
      font-family: monospace;
      cursor: pointer;
      transition: all 0.2s;
    }

    .timestamp-button:hover {
      background: rgba(168, 85, 247, 0.3);
      border-color: rgba(168, 85, 247, 0.6);
    }

    /* Scrollbar styles */
    ::-webkit-scrollbar {
      width: 6px;
    }

    ::-webkit-scrollbar-track {
      background: #1a1a1a;
    }

    ::-webkit-scrollbar-thumb {
      background: #3a3a3a;
      border-radius: 3px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: #4a4a4a;
    }
  `;
}
