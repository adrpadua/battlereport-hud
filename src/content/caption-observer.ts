import type { BattleReport, Unit, Stratagem } from '@/types/battle-report';
import { matchEntity } from '@/utils/entity-matcher';

type TooltipCallback = (
  entity: Unit | Stratagem | null,
  x: number,
  y: number
) => void;

let observer: MutationObserver | null = null;
let currentReport: BattleReport | null = null;
let onTooltip: TooltipCallback | null = null;

export function startCaptionObserver(
  report: BattleReport,
  tooltipCallback: TooltipCallback
): void {
  currentReport = report;
  onTooltip = tooltipCallback;

  // Find caption container
  const captionContainer = document.querySelector('.ytp-caption-window-container');
  if (!captionContainer) {
    console.log('Battle Report HUD: Caption container not found');
    return;
  }

  // Clean up existing observer
  if (observer) {
    observer.disconnect();
  }

  // Create mutation observer
  observer = new MutationObserver(handleCaptionMutation);
  observer.observe(captionContainer, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Process existing captions
  processCaptions(captionContainer);
}

export function stopCaptionObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  currentReport = null;
  onTooltip = null;
}

function handleCaptionMutation(mutations: MutationRecord[]): void {
  for (const mutation of mutations) {
    if (mutation.type === 'childList' || mutation.type === 'characterData') {
      const container = document.querySelector('.ytp-caption-window-container');
      if (container) {
        processCaptions(container);
      }
    }
  }
}

function processCaptions(container: Element): void {
  if (!currentReport) return;

  const captionSegments = container.querySelectorAll('.ytp-caption-segment');

  captionSegments.forEach((segment) => {
    // Skip if already processed
    if (segment.hasAttribute('data-hud-processed')) return;
    segment.setAttribute('data-hud-processed', 'true');

    const text = segment.textContent || '';
    highlightEntities(segment, text);
  });
}

function highlightEntities(element: Element, text: string): void {
  if (!currentReport) return;

  // Build list of all entities to match
  const entities: Array<{ name: string; type: 'unit' | 'stratagem'; data: Unit | Stratagem }> = [
    ...currentReport.units.map((u) => ({ name: u.name, type: 'unit' as const, data: u })),
    ...currentReport.stratagems.map((s) => ({ name: s.name, type: 'stratagem' as const, data: s })),
  ];

  // Find matches in text
  const matches = matchEntity(text, entities);

  if (matches.length === 0) return;

  // Create highlighted HTML
  let html = text;
  // Sort matches by position (reverse order to maintain indices)
  matches.sort((a, b) => b.start - a.start);

  for (const match of matches) {
    const before = html.slice(0, match.start);
    const matched = html.slice(match.start, match.end);
    const after = html.slice(match.end);

    const spanClass = match.entity.type === 'unit' ? 'hud-unit-match' : 'hud-stratagem-match';
    html = `${before}<span class="${spanClass}" data-entity-name="${match.entity.name}">${matched}</span>${after}`;
  }

  element.innerHTML = html;

  // Add hover listeners
  const highlightedSpans = element.querySelectorAll('.hud-unit-match, .hud-stratagem-match');
  highlightedSpans.forEach((span) => {
    span.addEventListener('mouseenter', handleEntityHover);
    span.addEventListener('mouseleave', handleEntityLeave);
  });
}

function handleEntityHover(event: Event): void {
  if (!currentReport || !onTooltip) return;

  const target = event.target as HTMLElement;
  const entityName = target.getAttribute('data-entity-name');
  if (!entityName) return;

  // Find the entity data
  const unit = currentReport.units.find((u) => u.name === entityName);
  const stratagem = currentReport.stratagems.find((s) => s.name === entityName);
  const entity = unit || stratagem;

  if (entity) {
    const rect = target.getBoundingClientRect();
    onTooltip(entity, rect.left + rect.width / 2, rect.top);
  }
}

function handleEntityLeave(): void {
  if (onTooltip) {
    onTooltip(null, 0, 0);
  }
}

// Inject styles for caption highlights
export function injectCaptionStyles(): void {
  const styleId = 'battlereport-hud-caption-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .hud-unit-match {
      background: rgba(34, 197, 94, 0.3);
      border-radius: 2px;
      padding: 0 2px;
      cursor: pointer;
    }

    .hud-stratagem-match {
      background: rgba(168, 85, 247, 0.3);
      border-radius: 2px;
      padding: 0 2px;
      cursor: pointer;
    }

    .hud-unit-match:hover,
    .hud-stratagem-match:hover {
      filter: brightness(1.2);
    }
  `;
  document.head.appendChild(style);
}
