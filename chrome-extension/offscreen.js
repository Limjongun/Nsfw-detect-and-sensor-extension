// offscreen.js - Runs in Offscreen Document (NOT Service Worker)
// Has full DOM access: Image, Canvas, etc.
// nsfwjs + model weights are bundled in lib/nsfwjs-bundle.js (fully offline)

'use strict';

// Get nsfwjs API from the bundle
// The bundle (IIFE) exposes window.nsfwjs via the wrapper we appended
function getNsfwjsLib() {
  if (window.nsfwjs && typeof window.nsfwjs.load === 'function') {
    return window.nsfwjs;
  }
  if (typeof nsfwShieldLib !== 'undefined') {
    var lib = nsfwShieldLib.default || nsfwShieldLib;
    if (lib && typeof lib.load === 'function') return lib;
  }
  throw new Error('nsfwjs not found - bundle may not have loaded correctly');
}

var nsfwModel = null;
var isLoading = false;

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

// tf.ready() was deprecated and REMOVED in TF.js 4.x+
// This polyfill safely handles both old and new TF.js versions
async function tfReady() {
  if (typeof tf === 'undefined') {
    throw new Error('TensorFlow.js (tf) is not loaded. Check that lib/tf.min.js is included.');
  }
  if (typeof tf.ready === 'function') {
    // TF.js < 4.x: await readiness
    return tf.ready();
  }
  // TF.js >= 4.x: ready() removed, backend registers synchronously
  // Just ensure a backend is set
  if (typeof tf.getBackend === 'function' && !tf.getBackend()) {
    if (typeof tf.setBackend === 'function') {
      await tf.setBackend('cpu');
    }
  }
  return Promise.resolve();
}

async function getModel() {
  if (nsfwModel) return nsfwModel;
  if (isLoading) {
    while (isLoading) await sleep(150);
    return nsfwModel;
  }
  isLoading = true;
  try {
    var lib = getNsfwjsLib();
    await tfReady();

    console.log("Checking globals before load:");
    console.log("globalThis.model:", !!globalThis['model']);
    console.log("globalThis.group1_shard1of1:", !!globalThis['group1_shard1of1']);
    console.log("window.group1_shard1of1:", !!window['group1_shard1of1']);

    // load() with no args uses the embedded MobileNetV2 model
    nsfwModel = await lib.load();
    console.log('[NSFW Shield Offscreen] Model loaded OK');
  } catch (err) {
    isLoading = false;
    throw err;
  }
  isLoading = false;
  return nsfwModel;
}

function sendProgress(percent, label) {
  chrome.runtime.sendMessage({ type: 'PROGRESS', percent: percent, label: label }).catch(function () { });
}

function tryLoadImage(src, withCors) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    if (withCors) img.crossOrigin = 'anonymous';

    var timer = setTimeout(function () {
      reject(new Error('Timeout'));
    }, 15000);

    img.onload = function () {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = function () {
      clearTimeout(timer);
      reject(new Error('Load error'));
    };
    img.src = src;
  });
}

async function classifyOneImage(src, model, threshold) {
  var NSFW_CATS = ['Porn', 'Hentai', 'Sexy'];

  async function runOnImg(img) {
    var canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 224;
    canvas.height = img.naturalHeight || img.height || 224;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    var predictions = await model.classify(canvas);
    var isNSFW = predictions.some(function (p) {
      return NSFW_CATS.indexOf(p.className) !== -1 && p.probability >= threshold;
    });
    return { src: src, isNSFW: isNSFW, predictions: predictions };
  }

  try {
    var img1 = await tryLoadImage(src, true);
    return await runOnImg(img1);
  } catch (e1) {
    try {
      var img2 = await tryLoadImage(src, false);
      return await runOnImg(img2);
    } catch (e2) {
      return { src: src, isNSFW: false, predictions: [], error: e2.message };
    }
  }
}

async function runClassification(images, threshold) {
  try {
    sendProgress(5, 'Loading AI model...');
    var model = await getModel();
    sendProgress(15, 'Model ready! Scanning ' + images.length + ' images...');

    var results = [];
    var BATCH = 2;

    for (var i = 0; i < images.length; i += BATCH) {
      var chunk = images.slice(i, i + BATCH);
      var chunkResults = await Promise.all(
        chunk.map(function (src) {
          return classifyOneImage(src, model, threshold);
        })
      );
      for (var k = 0; k < chunkResults.length; k++) {
        results.push(chunkResults[k]);
      }
      var done = Math.min(i + BATCH, images.length);
      var pct = 15 + Math.round((done / images.length) * 83);
      sendProgress(pct, 'Scanning ' + done + ' / ' + images.length + ' images...');
    }

    chrome.runtime.sendMessage({ type: 'SCAN_COMPLETE', results: results }).catch(function () { });

  } catch (err) {
    console.error('[NSFW Shield Offscreen] Error:', err);
    chrome.runtime.sendMessage({
      type: 'SCAN_ERROR',
      error: err.message || 'Unknown error'
    }).catch(function () { });
  }
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.type === 'DO_CLASSIFY') {
    runClassification(msg.images, msg.threshold);
    sendResponse({ ack: true });
    return false;
  }
});

console.log('[NSFW Shield Offscreen] Ready. nsfwjs available:', typeof window.nsfwjs);
