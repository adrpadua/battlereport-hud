// Minimal service worker to debug message passing
console.log('Battle Report HUD: Service worker loading...');

// Import handlers
import { handleMessage } from './message-handlers';
import { clearExpiredCache } from './cache-manager';

// Set up message listener FIRST before any async operations
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Battle Report HUD: Received message', message?.type);

  // Call the handler and return true to keep the channel open
  handleMessage(message, sender, sendResponse);

  // MUST return true synchronously to keep message channel open for async response
  return true;
});

console.log('Battle Report HUD: Message listener registered');

// Handle installation/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Battle Report HUD: Extension installed/updated', details.reason);
});

// Clean up expired cache on startup (async, won't block)
clearExpiredCache().catch(console.error);

// Set up periodic cache cleanup (every 24 hours)
chrome.alarms.create('cache-cleanup', { periodInMinutes: 24 * 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cache-cleanup') {
    clearExpiredCache().catch(console.error);
  }
});

console.log('Battle Report HUD: Service worker fully initialized');
