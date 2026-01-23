import { useState, useCallback } from 'react';

interface UseExpandableOptions {
  hasContent: boolean;
  defaultExpanded?: boolean;
}

interface UseExpandableReturn {
  isExpanded: boolean;
  toggle: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  headerProps: {
    onClick: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    role: 'button' | undefined;
    tabIndex: number | undefined;
    'aria-expanded': boolean | undefined;
  };
  contentClassName: string;
}

export function useExpandable(options: UseExpandableOptions): UseExpandableReturn {
  const { hasContent, defaultExpanded = false } = options;
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggle = useCallback((): void => {
    if (hasContent) {
      setIsExpanded((prev) => !prev);
    }
  }, [hasContent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (hasContent && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        setIsExpanded((prev) => !prev);
      }
    },
    [hasContent]
  );

  const headerProps = {
    onClick: toggle,
    onKeyDown: handleKeyDown,
    role: hasContent ? ('button' as const) : undefined,
    tabIndex: hasContent ? 0 : undefined,
    'aria-expanded': hasContent ? isExpanded : undefined,
  };

  const contentClassName = isExpanded ? 'expanded' : '';

  return {
    isExpanded,
    toggle,
    handleKeyDown,
    headerProps,
    contentClassName,
  };
}
