/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExpandable } from './useExpandable';

describe('useExpandable', () => {
  describe('initial state', () => {
    it('should start collapsed by default', () => {
      const { result } = renderHook(() => useExpandable({ hasContent: true }));
      expect(result.current.isExpanded).toBe(false);
    });

    it('should start expanded when defaultExpanded is true', () => {
      const { result } = renderHook(() =>
        useExpandable({ hasContent: true, defaultExpanded: true })
      );
      expect(result.current.isExpanded).toBe(true);
    });

    it('should have empty contentClassName when collapsed', () => {
      const { result } = renderHook(() => useExpandable({ hasContent: true }));
      expect(result.current.contentClassName).toBe('');
    });

    it('should have "expanded" contentClassName when expanded', () => {
      const { result } = renderHook(() =>
        useExpandable({ hasContent: true, defaultExpanded: true })
      );
      expect(result.current.contentClassName).toBe('expanded');
    });
  });

  describe('toggle behavior', () => {
    it('should toggle expanded state when hasContent is true', () => {
      const { result } = renderHook(() => useExpandable({ hasContent: true }));

      act(() => {
        result.current.toggle();
      });

      expect(result.current.isExpanded).toBe(true);

      act(() => {
        result.current.toggle();
      });

      expect(result.current.isExpanded).toBe(false);
    });

    it('should not toggle when hasContent is false', () => {
      const { result } = renderHook(() => useExpandable({ hasContent: false }));

      act(() => {
        result.current.toggle();
      });

      expect(result.current.isExpanded).toBe(false);
    });
  });

  describe('keyboard handling', () => {
    it('should toggle on Enter key when hasContent is true', () => {
      const { result } = renderHook(() => useExpandable({ hasContent: true }));

      const event = {
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent;

      act(() => {
        result.current.handleKeyDown(event);
      });

      expect(event.preventDefault).toHaveBeenCalled();
      expect(result.current.isExpanded).toBe(true);
    });

    it('should toggle on Space key when hasContent is true', () => {
      const { result } = renderHook(() => useExpandable({ hasContent: true }));

      const event = {
        key: ' ',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent;

      act(() => {
        result.current.handleKeyDown(event);
      });

      expect(event.preventDefault).toHaveBeenCalled();
      expect(result.current.isExpanded).toBe(true);
    });

    it('should not toggle on other keys', () => {
      const { result } = renderHook(() => useExpandable({ hasContent: true }));

      const event = {
        key: 'Tab',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent;

      act(() => {
        result.current.handleKeyDown(event);
      });

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(result.current.isExpanded).toBe(false);
    });

    it('should not toggle when hasContent is false', () => {
      const { result } = renderHook(() => useExpandable({ hasContent: false }));

      const event = {
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent;

      act(() => {
        result.current.handleKeyDown(event);
      });

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(result.current.isExpanded).toBe(false);
    });
  });

  describe('headerProps', () => {
    it('should include accessibility props when hasContent is true', () => {
      const { result } = renderHook(() => useExpandable({ hasContent: true }));

      expect(result.current.headerProps.role).toBe('button');
      expect(result.current.headerProps.tabIndex).toBe(0);
      expect(result.current.headerProps['aria-expanded']).toBe(false);
    });

    it('should exclude accessibility props when hasContent is false', () => {
      const { result } = renderHook(() => useExpandable({ hasContent: false }));

      expect(result.current.headerProps.role).toBeUndefined();
      expect(result.current.headerProps.tabIndex).toBeUndefined();
      expect(result.current.headerProps['aria-expanded']).toBeUndefined();
    });

    it('should update aria-expanded when toggled', () => {
      const { result } = renderHook(() => useExpandable({ hasContent: true }));

      expect(result.current.headerProps['aria-expanded']).toBe(false);

      act(() => {
        result.current.toggle();
      });

      expect(result.current.headerProps['aria-expanded']).toBe(true);
    });

    it('should have onClick that calls toggle', () => {
      const { result } = renderHook(() => useExpandable({ hasContent: true }));

      act(() => {
        result.current.headerProps.onClick();
      });

      expect(result.current.isExpanded).toBe(true);
    });

    it('should have onKeyDown that handles keyboard events', () => {
      const { result } = renderHook(() => useExpandable({ hasContent: true }));

      const event = {
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent;

      act(() => {
        result.current.headerProps.onKeyDown(event);
      });

      expect(result.current.isExpanded).toBe(true);
    });
  });

  describe('hasContent changes', () => {
    it('should update headerProps when hasContent changes', () => {
      const { result, rerender } = renderHook(
        ({ hasContent }: { hasContent: boolean }) => useExpandable({ hasContent }),
        { initialProps: { hasContent: true } }
      );

      expect(result.current.headerProps.role).toBe('button');

      rerender({ hasContent: false });

      expect(result.current.headerProps.role).toBeUndefined();
    });
  });
});
