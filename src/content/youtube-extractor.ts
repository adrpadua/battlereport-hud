import type { VideoData, Chapter, TranscriptSegment } from '@/types/youtube';

export function getVideoId(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

export function getVideoTitle(): string {
  // Try multiple selectors for robustness
  const selectors = [
    'h1.ytd-watch-metadata yt-formatted-string',
    'h1.ytd-video-primary-info-renderer yt-formatted-string',
    '#title h1 yt-formatted-string',
    'h1.title',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element?.textContent) {
      return element.textContent.trim();
    }
  }

  return document.title.replace(' - YouTube', '').trim();
}

export function getChannelName(): string {
  const selectors = [
    '#channel-name yt-formatted-string a',
    '#owner #channel-name a',
    'ytd-channel-name yt-formatted-string a',
    '#upload-info #channel-name a',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element?.textContent) {
      return element.textContent.trim();
    }
  }

  return 'Unknown Channel';
}

export function getDescription(): string {
  const selectors = [
    '#description-inline-expander yt-attributed-string',
    '#description yt-formatted-string',
    'ytd-text-inline-expander #plain-snippet-text',
    '#description-inner',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element?.textContent) {
      return element.textContent.trim();
    }
  }

  return '';
}

export function getChapters(): Chapter[] {
  const chapters: Chapter[] = [];

  // Try to get chapters from the chapter markers
  const chapterElements = document.querySelectorAll(
    'ytd-macro-markers-list-item-renderer'
  );

  chapterElements.forEach((el) => {
    const titleEl = el.querySelector('#details h4');
    const timeEl = el.querySelector('#time');

    if (titleEl?.textContent && timeEl?.textContent) {
      const timeStr = timeEl.textContent.trim();
      const startTime = parseTimeString(timeStr);

      chapters.push({
        title: titleEl.textContent.trim(),
        startTime,
      });
    }
  });

  // Fallback: parse chapters from description
  if (chapters.length === 0) {
    const description = getDescription();
    const chapterRegex = /(?:^|\n)(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)/g;
    let match;

    while ((match = chapterRegex.exec(description)) !== null) {
      const timeStr = match[1];
      const title = match[2];
      if (timeStr && title) {
        chapters.push({
          title: title.trim(),
          startTime: parseTimeString(timeStr),
        });
      }
    }
  }

  return chapters;
}

function parseTimeString(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) {
    return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  }
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

export async function getTranscript(): Promise<TranscriptSegment[]> {
  const segments: TranscriptSegment[] = [];

  // Try to open transcript panel
  const transcriptButton = await findTranscriptButton();
  if (!transcriptButton) {
    console.log('Battle Report HUD: Transcript button not found');
    return segments;
  }

  // Click to open transcript
  transcriptButton.click();

  // Wait for transcript to load
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Find and scrape transcript segments
  const segmentElements = document.querySelectorAll(
    'ytd-transcript-segment-renderer'
  );

  segmentElements.forEach((el) => {
    const textEl = el.querySelector('.segment-text');
    const timeEl = el.querySelector('.segment-timestamp');

    if (textEl?.textContent && timeEl?.textContent) {
      const timeStr = timeEl.textContent.trim();
      segments.push({
        text: textEl.textContent.trim(),
        startTime: parseTimeString(timeStr),
        duration: 0, // Duration not easily available from DOM
      });
    }
  });

  // Close transcript panel to restore UI
  const closeButton = document.querySelector(
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"] #visibility-button button'
  );
  if (closeButton instanceof HTMLElement) {
    closeButton.click();
  }

  return segments;
}

async function findTranscriptButton(): Promise<HTMLElement | null> {
  // First, try the "...more" button in the description to reveal transcript option
  const moreButton = document.querySelector(
    '#expand, tp-yt-paper-button#expand'
  );
  if (moreButton instanceof HTMLElement) {
    moreButton.click();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Look for "Show transcript" button
  const buttons = document.querySelectorAll(
    'ytd-video-description-transcript-section-renderer button, button[aria-label*="transcript" i]'
  );

  for (const btn of buttons) {
    if (btn instanceof HTMLElement) {
      return btn;
    }
  }

  // Fallback: look in menu
  const menuButton = document.querySelector(
    '#button-shape button[aria-label="More actions"]'
  );
  if (menuButton instanceof HTMLElement) {
    menuButton.click();
    await new Promise((resolve) => setTimeout(resolve, 300));

    const menuItems = document.querySelectorAll(
      'ytd-menu-service-item-renderer'
    );
    for (const item of menuItems) {
      if (item.textContent?.toLowerCase().includes('transcript')) {
        return item as HTMLElement;
      }
    }
  }

  return null;
}

export function getPinnedComment(): string | null {
  const pinnedSelector =
    'ytd-comment-thread-renderer:first-child #pinned-comment-badge';
  const pinnedBadge = document.querySelector(pinnedSelector);

  if (pinnedBadge) {
    const commentThread = pinnedBadge.closest('ytd-comment-thread-renderer');
    const contentEl = commentThread?.querySelector('#content-text');
    if (contentEl?.textContent) {
      return contentEl.textContent.trim();
    }
  }

  return null;
}

export async function extractVideoData(): Promise<VideoData | null> {
  const videoId = getVideoId();
  if (!videoId) {
    return null;
  }

  // Wait for page to be ready
  await waitForElement('h1.ytd-watch-metadata, h1.ytd-video-primary-info-renderer');

  const [transcript, chapters] = await Promise.all([
    getTranscript(),
    Promise.resolve(getChapters()),
  ]);

  return {
    videoId,
    title: getVideoTitle(),
    channel: getChannelName(),
    description: getDescription(),
    chapters,
    transcript,
    pinnedComment: getPinnedComment(),
  };
}

function waitForElement(
  selector: string,
  timeout = 10000
): Promise<Element | null> {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector(selector));
    }, timeout);
  });
}
