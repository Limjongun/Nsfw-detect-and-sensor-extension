// content.js - Runs in the context of web pages
// Collects all visible images from the current page

(function() {
  'use strict';

  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.type === 'GET_IMAGES') {
      var images = collectImages();
      sendResponse({ images: images });
      return true;
    }
    if (msg.type === 'BLUR_IMAGES') {
      blurImages(msg.images);
      sendResponse({ ack: true });
      return true;
    }
  });

  function blurImages(nsfwUrls) {
    var urlSet = new Set(nsfwUrls);
    
    // Process img tags
    var imgTags = document.querySelectorAll('img');
    for (var i = 0; i < imgTags.length; i++) {
      var img = imgTags[i];
      var src = getAbsoluteUrl(img.src || img.currentSrc);
      if (src && urlSet.has(src)) {
        applyOverlay(img);
      }
    }

    // Process video tags (poster images)
    var videoTags = document.querySelectorAll('video');
    for (var k = 0; k < videoTags.length; k++) {
      var video = videoTags[k];
      var posterSrc = getAbsoluteUrl(video.poster);
      if (posterSrc && urlSet.has(posterSrc)) {
        applyOverlay(video);
      }
    }

    // Process background images
    var allEls = document.querySelectorAll('*');
    for (var j = 0; j < allEls.length; j++) {
      try {
        var style = window.getComputedStyle(allEls[j]);
        var bg = style.backgroundImage;
        if (bg && bg !== 'none') {
          var match = bg.match(/url\(["']?([^"')]+)["']?\)/);
          if (match) {
            var bsrc = getAbsoluteUrl(match[1]);
            if (bsrc && urlSet.has(bsrc)) {
              applyOverlay(allEls[j]);
            }
          }
        }
      } catch (e) { /* skip cross-origin errors */ }
    }
  }

  function applyOverlay(el) {
    // If already overlaid, skip
    if (el.dataset.nsfwBlurred) return;
    el.dataset.nsfwBlurred = 'true';

    // Blur the element itself
    el.style.filter = 'blur(15px)';

    // Find a positioning parent or wrap it if necessary
    // A simple approach is to put an absolute div over the element's bounding rect
    // But since the page can scroll, appending to body with absolute positioning requires update on scroll
    // Better: wrap the element if it's an img, or append a child if it's a container
    var wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.top = '0';
    wrapper.style.left = '0';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';
    wrapper.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
    wrapper.style.color = '#ff4d4d';
    wrapper.style.fontFamily = 'sans-serif';
    wrapper.style.fontWeight = 'bold';
    wrapper.style.fontSize = '16px';
    wrapper.style.zIndex = '999999';
    wrapper.style.borderRadius = window.getComputedStyle(el).borderRadius;
    wrapper.style.pointerEvents = 'none'; // let clicks pass through to the blurred image if needed

    // Logo & Text
    wrapper.innerHTML = `
      <div style="background: rgba(0,0,0,0.7); padding: 8px 12px; border-radius: 8px; text-align: center; border: 1px solid #ff4d4d;">
        <div style="font-size: 24px; margin-bottom: 4px;">🛡️</div>
        <div>NSFW detected</div>
      </div>
    `;

    // Wrap the original element in a container to position the overlay correctly
    var tagName = el.tagName.toLowerCase();
    if (tagName === 'img' || tagName === 'video') {
      var container = document.createElement('div');
      container.style.position = 'relative';
      container.style.display = window.getComputedStyle(el).display === 'inline' ? 'inline-block' : window.getComputedStyle(el).display;
      container.style.width = el.offsetWidth + 'px';
      container.style.height = el.offsetHeight + 'px';
      container.style.margin = window.getComputedStyle(el).margin;
      
      el.parentNode.insertBefore(container, el);
      container.appendChild(el);
      
      // Reset element margins since container has them now
      el.style.margin = '0';
      el.style.width = '100%';
      el.style.height = '100%';
      
      container.appendChild(wrapper);
    } else {
      // For divs with background images, we just make them relative and append the overlay
      var pos = window.getComputedStyle(el).position;
      if (pos === 'static') {
        el.style.position = 'relative';
      }
      el.appendChild(wrapper);
    }
  }

  function collectImages() {
    var MIN_SIZE = 80;
    var seen = new Set();
    var result = [];

    // Collect from <img> tags
    var imgTags = document.querySelectorAll('img');
    for (var i = 0; i < imgTags.length; i++) {
      var img = imgTags[i];
      var src = getAbsoluteUrl(img.src || img.currentSrc);
      if (!src || seen.has(src)) continue;
      var w = img.naturalWidth  || img.width  || img.offsetWidth;
      var h = img.naturalHeight || img.height || img.offsetHeight;
      if (w < MIN_SIZE || h < MIN_SIZE) continue;
      if (!isValidImageUrl(src)) continue;
      seen.add(src);
      result.push(src);
    }

    // Collect from <video> tags (poster images)
    var videoTags = document.querySelectorAll('video');
    for (var v = 0; v < videoTags.length; v++) {
      var video = videoTags[v];
      var posterSrc = getAbsoluteUrl(video.poster);
      if (posterSrc && !seen.has(posterSrc) && isValidImageUrl(posterSrc)) {
        var vw = video.videoWidth || video.offsetWidth;
        var vh = video.videoHeight || video.offsetHeight;
        if (vw >= MIN_SIZE && vh >= MIN_SIZE) {
          seen.add(posterSrc);
          result.push(posterSrc);
        }
      }
    }

    // Collect from CSS background-image
    var allEls = document.querySelectorAll('*');
    for (var j = 0; j < allEls.length; j++) {
      try {
        var style = window.getComputedStyle(allEls[j]);
        var bg = style.backgroundImage;
        if (bg && bg !== 'none') {
          var match = bg.match(/url\(["']?([^"')]+)["']?\)/);
          if (match) {
            var bsrc = getAbsoluteUrl(match[1]);
            if (bsrc && !seen.has(bsrc) && isValidImageUrl(bsrc)) {
              var rect = allEls[j].getBoundingClientRect();
              if (rect.width >= MIN_SIZE && rect.height >= MIN_SIZE) {
                seen.add(bsrc);
                result.push(bsrc);
              }
            }
          }
        }
      } catch (e) { /* skip cross-origin style errors */ }
    }

    return result.slice(0, 50);
  }

  function getAbsoluteUrl(src) {
    if (!src) return null;
    try {
      return new URL(src, document.baseURI).href;
    } catch (e) {
      return null;
    }
  }

  function isValidImageUrl(src) {
    if (!src) return false;
    var lower = src.toLowerCase().split('?')[0];
    // Exclude SVGs as they can't be processed by TensorFlow.js natively sometimes
    if (src.startsWith('data:image/svg') || lower.endsWith('.svg')) {
      return false;
    }
    // Accept anything else, because modern web apps (like Google/Yahoo Images)
    // often use dynamic URLs without .jpg/.png extensions (e.g. /th?id=OIP...)
    return true;
  }

})();
