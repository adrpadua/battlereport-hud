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
  console.log('Battle Report HUD: Opening transcript panel...');
  transcriptButton.click();

  // Wait for transcript to load (longer wait for reliability)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Try multiple selectors for transcript segments (YouTube updates these)
  const segmentSelectors = [
    'ytd-transcript-segment-renderer',
    'ytd-transcript-segment-list-renderer ytd-transcript-segment-renderer',
    '[target-id="engagement-panel-searchable-transcript"] ytd-transcript-segment-renderer',
  ];

  let segmentElements: NodeListOf<Element> | null = null;
  for (const selector of segmentSelectors) {
    segmentElements = document.querySelectorAll(selector);
    if (segmentElements.length > 0) {
      console.log(`Battle Report HUD: Found ${segmentElements.length} transcript segments with selector: ${selector}`);
      break;
    }
  }

  if (!segmentElements || segmentElements.length === 0) {
    console.log('Battle Report HUD: No transcript segments found');
    // Log what we can see in the transcript panel for debugging
    const panel = document.querySelector('[target-id="engagement-panel-searchable-transcript"]');
    console.log('Battle Report HUD: Transcript panel exists:', !!panel);
    return segments;
  }

  segmentElements.forEach((el) => {
    // Try multiple selectors for text and timestamp
    const textEl = el.querySelector('.segment-text, .ytd-transcript-segment-renderer yt-formatted-string, yt-formatted-string.segment-text');
    const timeEl = el.querySelector('.segment-timestamp, .ytd-transcript-segment-renderer .segment-timestamp, [class*="timestamp"]');

    if (textEl?.textContent && timeEl?.textContent) {
      const timeStr = timeEl.textContent.trim();
      segments.push({
        text: textEl.textContent.trim(),
        startTime: parseTimeString(timeStr),
        duration: 0,
      });
    }
  });

  console.log(`Battle Report HUD: Extracted ${segments.length} transcript segments`);

  // Close transcript panel to restore UI
  const closeSelectors = [
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"] #visibility-button button',
    '[target-id="engagement-panel-searchable-transcript"] button[aria-label="Close"]',
    'ytd-engagement-panel-title-header-renderer button',
  ];

  for (const selector of closeSelectors) {
    const closeButton = document.querySelector(selector);
    if (closeButton instanceof HTMLElement) {
      closeButton.click();
      break;
    }
  }

  return segments;
}

async function findTranscriptButton(): Promise<HTMLElement | null> {
  console.log('Battle Report HUD: Looking for transcript button...');

  // First, try the "...more" button in the description to expand it
  const moreButtonSelectors = [
    '#expand',
    'tp-yt-paper-button#expand',
    '#description-inline-expander #expand',
    'ytd-text-inline-expander #expand',
    '#snippet #expand',
  ];

  for (const selector of moreButtonSelectors) {
    const moreButton = document.querySelector(selector);
    if (moreButton instanceof HTMLElement) {
      console.log('Battle Report HUD: Found expand button, clicking...');
      moreButton.click();
      await new Promise((resolve) => setTimeout(resolve, 800));
      break;
    }
  }

  // Look for "Show transcript" button in the expanded description
  const transcriptButtonSelectors = [
    'ytd-video-description-transcript-section-renderer button',
    'button[aria-label*="transcript" i]',
    'button[aria-label*="Transcript" i]',
    '#primary-button ytd-button-renderer button',
    'ytd-video-description-transcript-section-renderer ytd-button-renderer button',
    '[section-identifier="transcript"] button',
  ];

  for (const selector of transcriptButtonSelectors) {
    const buttons = document.querySelectorAll(selector);
    for (const btn of buttons) {
      if (btn instanceof HTMLElement) {
        const text = btn.textContent?.toLowerCase() || '';
        const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
        if (text.includes('transcript') || ariaLabel.includes('transcript') || btn.closest('[section-identifier="transcript"]')) {
          console.log('Battle Report HUD: Found transcript button via selector:', selector);
          return btn;
        }
      }
    }
  }

  // Try finding by text content
  const allButtons = document.querySelectorAll('button, ytd-button-renderer');
  for (const btn of allButtons) {
    if (btn.textContent?.toLowerCase().includes('show transcript')) {
      console.log('Battle Report HUD: Found transcript button by text content');
      return btn as HTMLElement;
    }
  }

  // Fallback: look in the "..." menu below the video
  console.log('Battle Report HUD: Trying menu fallback...');
  const menuButton = document.querySelector(
    '#button-shape button[aria-label="More actions"], ytd-menu-renderer button[aria-label="More actions"]'
  );
  if (menuButton instanceof HTMLElement) {
    menuButton.click();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const menuItems = document.querySelectorAll(
      'ytd-menu-service-item-renderer, tp-yt-paper-item'
    );
    for (const item of menuItems) {
      if (item.textContent?.toLowerCase().includes('transcript')) {
        console.log('Battle Report HUD: Found transcript in menu');
        return item as HTMLElement;
      }
    }

    // Close menu if we didn't find transcript
    menuButton.click();
  }

  console.log('Battle Report HUD: No transcript button found');
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

  const description = getDescription();

  console.log('Battle Report HUD: Extracted data summary:', {
    videoId,
    title: getVideoTitle(),
    descriptionLength: description.length,
    chaptersCount: chapters.length,
    transcriptSegments: transcript.length,
    transcriptPreview: transcript.slice(0, 3).map(s => s.text).join(' '),
  });

  return {
    videoId,
    title: getVideoTitle(),
    channel: getChannelName(),
    description,
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
