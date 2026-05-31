// popup.js - UI controller for NSFW Shield
'use strict';

var scanBtn         = document.getElementById('scanBtn');
var scanLabel       = document.getElementById('scanLabel');
var scanIcon        = document.getElementById('scanIcon');
var statusText      = document.getElementById('statusText');
var dot             = document.getElementById('dot');
var totalNum        = document.getElementById('totalNum');
var safeNum         = document.getElementById('safeNum');
var nsfwNum         = document.getElementById('nsfwNum');
var nsfwCard        = document.getElementById('nsfwCard');
var resultsList     = document.getElementById('resultsList');
var progressWrap    = document.getElementById('progressWrap');
var progressFill    = document.getElementById('progressFill');
var progressLabel   = document.getElementById('progressLabel');
var progressPct     = document.getElementById('progressPct');
var clearBtn        = document.getElementById('clearBtn');
var autoToggle      = document.getElementById('autoToggle');
var thresholdSlider = document.getElementById('thresholdSlider');
var thresholdVal    = document.getElementById('thresholdVal');

var results  = [];
var scanning = false;

// Load saved settings and previous results
chrome.storage.local.get(['threshold', 'autoScan', 'lastResults'], function(data) {
  if (data.threshold) {
    thresholdSlider.value = data.threshold;
    thresholdVal.textContent = data.threshold + '%';
  }
  if (data.autoScan) autoToggle.checked = data.autoScan;
  if (Array.isArray(data.lastResults) && data.lastResults.length > 0) {
    results = data.lastResults;
    renderResults();
    var nsfw = results.filter(function(r) { return r.isNSFW; }).length;
    setStatus(
      nsfw > 0 ? 'blocked' : 'safe',
      nsfw > 0 ? ('Warning: ' + nsfw + ' NSFW image(s) detected') : ('All ' + results.length + ' images are safe')
    );
  }
});

// Threshold slider
thresholdSlider.addEventListener('input', function() {
  thresholdVal.textContent = thresholdSlider.value + '%';
  chrome.storage.local.set({ threshold: thresholdSlider.value });
});

// Auto toggle
autoToggle.addEventListener('change', function() {
  chrome.storage.local.set({ autoScan: autoToggle.checked });
});

// Clear button
clearBtn.addEventListener('click', function() {
  results = [];
  chrome.storage.local.remove('lastResults');
  renderResults();
  setStatus('idle', 'Ready to scan');
});

// Listen for messages from offscreen/background
chrome.runtime.onMessage.addListener(function(msg) {
  if (msg.type === 'PROGRESS') {
    setProgress(msg.percent, msg.label);
    return false;
  }
  if (msg.type === 'SCAN_COMPLETE') {
    results = msg.results || [];
    chrome.storage.local.set({ lastResults: results });
    renderResults();
    
    var nsfwImages = results.filter(function(r) { return r.isNSFW; });
    var nsfw = nsfwImages.length;
    var safe = results.length - nsfw;
    
    if (nsfw > 0) {
      setStatus('blocked', 'Warning: ' + nsfw + ' NSFW image(s) detected!');
      
      // Send message to blur images on the active tab
      var nsfwUrls = nsfwImages.map(function(r) { return r.src; });
      chrome.tabs.query({ active: true, currentWindow: true }).then(function(tabs) {
        if (tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'BLUR_IMAGES', images: nsfwUrls }).catch(function(){});
        }
      });
      
    } else {
      setStatus('safe', 'All ' + safe + ' images are safe');
    }
    
    finishScan();
    return false;
  }
  if (msg.type === 'SCAN_ERROR') {
    setStatus('idle', 'Error: ' + (msg.error || 'Scan failed'));
    finishScan();
    return false;
  }
});

// Scan button
scanBtn.addEventListener('click', startScan);

async function startScan() {
  if (scanning) return;
  scanning = true;

  setScanState('scanning');
  setStatus('scanning', 'Getting page images...');
  progressWrap.classList.add('visible');
  setProgress(2, 'Getting page images...');

  try {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab  = tabs[0];

    if (!tab || !tab.id) throw new Error('Cannot access active tab');

    // Inject content script (safe if already injected)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    }).catch(function() {});

    // Get images from page
    var imgData;
    try {
      imgData = await chrome.tabs.sendMessage(tab.id, { type: 'GET_IMAGES' });
    } catch (e) {
      throw new Error('Cannot communicate with page. Try reloading the page first.');
    }

    if (!imgData || !imgData.images || imgData.images.length === 0) {
      setStatus('idle', 'No images found on this page');
      finishScan();
      return;
    }

    var images    = imgData.images;
    var threshold = parseFloat(thresholdSlider.value) / 100;

    setProgress(4, 'Found ' + images.length + ' images, starting AI...');
    setStatus('scanning', 'Scanning ' + images.length + ' images...');

    // Send to background -> offscreen for processing
    var ack = await chrome.runtime.sendMessage({
      type: 'CLASSIFY_IMAGES',
      images: images,
      threshold: threshold
    });

    if (ack && ack.error) throw new Error(ack.error);
    // Results will arrive via SCAN_COMPLETE message

  } catch (err) {
    console.error('[NSFW Shield] startScan error:', err);
    setStatus('idle', 'Error: ' + err.message);
    finishScan();
  }
}

function finishScan() {
  scanning = false;
  setScanState('idle');
  progressWrap.classList.remove('visible');
}

function renderResults() {
  var total = results.length;
  var nsfw  = results.filter(function(r) { return r.isNSFW; }).length;
  var safe  = total - nsfw;

  totalNum.textContent = total;
  safeNum.textContent  = safe;
  nsfwNum.textContent  = nsfw;
  if (nsfw > 0) {
    nsfwCard.classList.add('highlighted');
  } else {
    nsfwCard.classList.remove('highlighted');
  }

  if (total === 0) {
    resultsList.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon">&#128270;</div>' +
        '<div class="empty-text">Click "Scan This Page"<br>to start detecting images.</div>' +
      '</div>';
    return;
  }

  var sorted = results.slice().sort(function(a, b) {
    return (b.isNSFW ? 1 : 0) - (a.isNSFW ? 1 : 0);
  });

  resultsList.innerHTML = sorted.map(function(r) {
    var badge = r.isNSFW
      ? '<span class="result-badge badge-nsfw">&#x1F51E; NSFW</span>'
      : '<span class="result-badge badge-safe">&#x2705; SAFE</span>';

    var preds = (r.predictions || []).slice().sort(function(a, b) {
      return b.probability - a.probability;
    }).slice(0, 3);

    var chips = preds.map(function(p) {
      var pct = (p.probability * 100).toFixed(1);
      var danger = ['Porn', 'Hentai', 'Sexy'].indexOf(p.className) !== -1 && p.probability >= 0.3;
      return '<span class="score-chip' + (danger ? ' danger' : '') + '">' +
             escHtml(p.className) + ' ' + pct + '%</span>';
    }).join('');

    var errorChip = r.error
      ? '<span class="score-chip" title="' + escHtml(r.error) + '">&#9888;&#65039; skip</span>'
      : '';

    return '<div class="result-item ' + (r.isNSFW ? 'nsfw-item' : 'safe-item') + '">' +
      '<img class="result-thumb" src="' + escHtml(r.src) + '" crossorigin="anonymous" ' +
           'onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 ' +
           'width=%2242%22 height=%2242%22><rect width=%2242%22 height=%2242%22 fill=%22%231e2230%22/>' +
           '<text x=%2221%22 y=%2227%22 text-anchor=%22middle%22 fill=%22%2364748b%22 ' +
           'font-size=%2214%22>&#128444;</text></svg>\'">' +
      '<div class="result-info">' +
        '<div style="margin-bottom:4px">' + badge + '</div>' +
        '<div class="result-scores">' + chips + errorChip + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function setStatus(state, text) {
  statusText.textContent = text;
  dot.className = 'dot';
  if (state === 'scanning') dot.classList.add('scanning');
  else if (state === 'blocked') dot.classList.add('blocked');
  else if (state === 'safe')    dot.classList.add('active');
}

function setScanState(state) {
  if (state === 'scanning') {
    scanBtn.disabled      = true;
    scanIcon.textContent  = '\u23F3';
    scanLabel.textContent = 'Scanning...';
  } else {
    scanBtn.disabled      = false;
    scanIcon.textContent  = '\uD83D\uDD0D';
    scanLabel.textContent = 'Scan This Page';
  }
}

function setProgress(pct, label) {
  progressFill.style.width  = pct + '%';
  progressLabel.textContent = label || '';
  progressPct.textContent   = Math.round(pct) + '%';
}

function escHtml(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
