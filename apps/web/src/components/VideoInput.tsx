import React, { useState, useCallback } from 'react';

interface VideoInputProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

// Validate YouTube URL patterns
function isValidYouTubeUrl(url: string): boolean {
  const patterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}/,
    /^https?:\/\/youtu\.be\/[a-zA-Z0-9_-]{11}/,
    /^https?:\/\/(www\.)?youtube\.com\/embed\/[a-zA-Z0-9_-]{11}/,
    /^https?:\/\/(www\.)?youtube\.com\/v\/[a-zA-Z0-9_-]{11}/,
  ];

  return patterns.some(pattern => pattern.test(url));
}

export function VideoInput({ onSubmit, isLoading, disabled }: VideoInputProps): React.ReactElement {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError('Please enter a YouTube URL');
      return;
    }

    if (!isValidYouTubeUrl(trimmedUrl)) {
      setError('Please enter a valid YouTube URL');
      return;
    }

    onSubmit(trimmedUrl);
  }, [url, onSubmit]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (error) {
      setError(null);
    }
  }, [error]);

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <input
            type="url"
            value={url}
            onChange={handleChange}
            placeholder="Enter YouTube video URL..."
            disabled={isLoading || disabled}
            className="w-full"
            aria-label="YouTube URL"
          />
          {error && (
            <div className="absolute -bottom-6 left-0 text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={isLoading || disabled || !url.trim()}
          className="btn-primary whitespace-nowrap"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Analyzing...
            </span>
          ) : (
            'Analyze'
          )}
        </button>
      </div>
    </form>
  );
}
