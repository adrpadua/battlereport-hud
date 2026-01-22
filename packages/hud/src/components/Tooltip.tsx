import React, { useState, useCallback, useRef } from 'react';

export interface TooltipProps {
  /** Content to show in the tooltip */
  content: React.ReactNode;
  /** The element that triggers the tooltip */
  children: React.ReactNode;
  /** Position of the tooltip relative to the trigger */
  position?: 'top' | 'bottom';
  /** Whether the tooltip is disabled */
  disabled?: boolean;
  /** Additional class names for the wrapper */
  className?: string;
  /** Delay before showing tooltip (ms) */
  delay?: number;
}

/**
 * Pure CSS tooltip component.
 * Shows content on hover with a small delay.
 */
export function Tooltip({
  content,
  children,
  position = 'top',
  disabled = false,
  className = '',
  delay = 200,
}: TooltipProps): React.ReactElement {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback(() => {
    if (disabled || !content) return;
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  }, [disabled, content, delay]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  }, []);

  if (disabled || !content) {
    return <>{children}</>;
  }

  return (
    <span
      className={`tooltip-wrapper ${className}`}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {isVisible && (
        <span className={`tooltip-content tooltip-content--${position}`}>
          {content}
          <span className="tooltip-arrow" />
        </span>
      )}
    </span>
  );
}
