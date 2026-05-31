// background.js - Service Worker (Manifest V3)
// Only routes messages between popup and offscreen document.
// All heavy AI computation happens in offscreen.js

'use strict';

var offscreenCreating = false;

async function ensureOffscreen() {
  // Wait if already being created
  if (offscreenCreating) {
    await new Promise(function(r) { setTimeout(r, 500); });
    return;
  }

  // Check if offscreen document already exists
  var hasDoc = false;
  try {
    // Chrome 116+ API
    hasDoc = await chrome.offscreen.hasDocument();
  } catch (e1) {
    try {
      var contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      hasDoc = contexts.length > 0;
    } catch (e2) {
      hasDoc = false;
    }
  }

  if (hasDoc) return;

  offscreenCreating = true;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_SCRAPING'],
      justification: 'TF.js and NSFWJS need DOM (Canvas, Image) for image classification'
    });
  } catch (e) {
    // Might already exist (race condition), ignore
    console.warn('[NSFW Shield BG] createDocument error (may be ok):', e.message);
  } finally {
    offscreenCreating = false;
  }
}

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type !== 'CLASSIFY_IMAGES') return false;

  ensureOffscreen()
    .then(function() {
      return chrome.runtime.sendMessage({
        type: 'DO_CLASSIFY',
        images: msg.images,
        threshold: msg.threshold
      });
    })
    .then(function() {
      sendResponse({ ack: true });
    })
    .catch(function(err) {
      console.error('[NSFW Shield BG] Error:', err.message);
      // Notify popup of error
      chrome.runtime.sendMessage({
        type: 'SCAN_ERROR',
        error: err.message || 'Background error'
      }).catch(function() {});
      sendResponse({ error: err.message });
    });

  return true; // keep message channel open for async response
});

console.log('[NSFW Shield BG] Service worker started');
