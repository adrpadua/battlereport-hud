import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { UnitSearchResult, UnitSearchModalProps } from '../types';

export function UnitSearchModal({
  isOpen,
  onClose,
  initialQuery,
  faction,
  onSelect,
  onSearch,
}: UnitSearchModalProps): React.ReactElement | null {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<UnitSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  // Reset state when modal opens with new query
  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setSelectedIndex(0);
    }
  }, [isOpen, initialQuery]);

  // Debounced search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const searchResults = await onSearch(searchQuery, faction);
      setResults(searchResults);
      setSelectedIndex(0);
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [faction, onSearch]);

  // Effect to handle debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, performSearch]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          handleSelectResult(results[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  // Handle escape key at document level
  useEffect(() => {
    const handleDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleDocKeyDown);
    return () => document.removeEventListener('keydown', handleDocKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  const handleSelectResult = (result: UnitSearchResult) => {
    onSelect(result.name);
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  const modalContent = (
    <div
      className="unit-search-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="unit-search-title"
    >
      <div
        className="unit-search-modal"
        onClick={e => e.stopPropagation()}
      >
        <button
          className="unit-search-close"
          onClick={onClose}
          aria-label="Close modal"
        >
          &times;
        </button>

        <div className="unit-search-header">
          <h2 id="unit-search-title" className="unit-search-title">
            Search Units
          </h2>
          <p className="unit-search-faction">
            Searching in: <strong>{faction}</strong>
          </p>
        </div>

        <div className="unit-search-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="unit-search-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type to search units..."
            aria-label="Search units"
          />
          {loading && <div className="unit-search-spinner" />}
        </div>

        <div className="unit-search-results">
          {results.length === 0 && !loading && query.trim() && (
            <div className="unit-search-no-results">
              No units found matching "{query}"
            </div>
          )}

          {results.length === 0 && !loading && !query.trim() && (
            <div className="unit-search-hint">
              Start typing to search for units
            </div>
          )}

          {results.map((result, index) => (
            <button
              key={`${result.name}-${index}`}
              className={`unit-search-result ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleSelectResult(result)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="unit-search-result-name">{result.name}</span>
              <span className="unit-search-result-confidence">
                {Math.round(result.confidence * 100)}%
              </span>
            </button>
          ))}
        </div>

        <div className="unit-search-footer">
          <span className="unit-search-hint-text">
            Use <kbd>↑</kbd><kbd>↓</kbd> to navigate, <kbd>Enter</kbd> to select, <kbd>Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
