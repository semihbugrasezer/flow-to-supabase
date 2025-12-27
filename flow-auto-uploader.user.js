// ==UserScript==
// @name         Flow Auto Uploader (Vercel -> Supabase)
// @namespace    https://github.com/semihbugrasezer/flow-image-downloader
// @version      1.0.2
// @description  Automatically uploads new Flow images to Supabase via a Vercel API.
// @match        https://labs.google/fx/*/tools/flow/*
// @match        https://labs.google/fx/*/tools/flow/project/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  console.log('[Flow Auto Uploader] loaded', window.location.href);
  window.flowAutoUploaderLoaded = true;

  const API_URL = 'https://flow-image-downloader.vercel.app/api/upload-flow-images';
  const STORAGE_KEY = 'flow_auto_uploader_uploaded_urls';
  const MAX_STORED_URLS = 2000;
  const FLUSH_DELAY_MS = 2000;
  const IMAGE_EXT_REGEX = /\.(jpg|jpeg|png|webp)$/i;

  const state = {
    apiUrl: '',
    queue: new Set(),
    uploaded: new Set(),
    flushTimer: null,
    isUploading: false,
    statusEl: null
  };

  function loadUploadedSet() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Set();
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return new Set();
      return new Set(list.filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function saveUploadedSet() {
    const list = Array.from(state.uploaded);
    const trimmed = list.slice(-MAX_STORED_URLS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  }

  function ensureStatusEl() {
    if (state.statusEl) return;
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;bottom:20px;right:20px;background:rgba(17,24,39,0.92);color:#fff;padding:10px 14px;border-radius:10px;font-size:12px;z-index:999999;box-shadow:0 8px 24px rgba(0,0,0,0.25);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;';
    el.textContent = '⏳ Initializing...';
    const target = document.body || document.documentElement;
    if (!target) return;
    target.appendChild(el);
    state.statusEl = el;
  }

  function setStatus(text) {
    ensureStatusEl();
    state.statusEl.textContent = text;
  }

  function normalizeUrl(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url, window.location.href);
      return parsed.href;
    } catch {
      return '';
    }
  }

  function isFlowImage(url) {
    if (!url) return false;
    return (
      url.includes('storage.googleapis.com') ||
      url.includes('ai-sandbox') ||
      url.includes('videofx') ||
      url.includes('flow') ||
      IMAGE_EXT_REGEX.test(url)
    );
  }

  function collectFromElement(el) {
    const found = [];
    if (el.tagName === 'IMG') {
      const src = normalizeUrl(el.currentSrc || el.src || el.getAttribute('src'));
      if (isFlowImage(src)) found.push(src);
      const srcset = el.getAttribute('srcset');
      if (srcset) {
        const first = srcset.split(',')[0]?.trim().split(' ')[0];
        const srcsetUrl = normalizeUrl(first);
        if (isFlowImage(srcsetUrl)) found.push(srcsetUrl);
      }
    }

    const attrCandidates = ['data-src', 'data-url', 'data-image', 'data-original', 'data-img'];
    attrCandidates.forEach((attr) => {
      const val = normalizeUrl(el.getAttribute && el.getAttribute(attr));
      if (isFlowImage(val)) found.push(val);
    });

    if (el.dataset) {
      Object.keys(el.dataset).forEach((key) => {
        const val = normalizeUrl(el.dataset[key]);
        if (isFlowImage(val)) found.push(val);
      });
    }

    const style = window.getComputedStyle(el);
    const bgImage = style && style.backgroundImage;
    if (bgImage && bgImage !== 'none') {
      const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
      if (match && match[1]) {
        const bgUrl = normalizeUrl(match[1]);
        if (isFlowImage(bgUrl)) found.push(bgUrl);
      }
    }

    return found;
  }

  function enqueueUrls(urls) {
    let added = 0;
    urls.forEach((url) => {
      if (!url || state.uploaded.has(url)) return;
      if (!state.queue.has(url)) {
        state.queue.add(url);
        added += 1;
      }
    });
    if (added > 0) {
      setStatus(`🆕 Queued ${added} image(s)`);
      scheduleFlush();
    }
  }

  function scheduleFlush() {
    if (state.flushTimer) return;
    state.flushTimer = setTimeout(() => {
      state.flushTimer = null;
      flushQueue().catch(() => {});
    }, FLUSH_DELAY_MS);
  }

  async function flushQueue() {
    if (!state.apiUrl) return;
    if (state.isUploading) return;
    if (state.queue.size === 0) return;

    const batch = Array.from(state.queue);
    state.queue.clear();
    state.isUploading = true;
    setStatus(`📤 Uploading ${batch.length} image(s)...`);

    try {
      const response = await fetch(state.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: batch,
          compressQuality: 85,
          maxWidth: 1920,
          maxHeight: 1920
        })
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'API error');
      }

      batch.forEach((url) => state.uploaded.add(url));
      saveUploadedSet();
      setStatus(`✅ Uploaded ${result.successful}/${result.total}`);
    } catch (error) {
      batch.forEach((url) => state.queue.add(url));
      setStatus(`❌ Error: ${error.message}`);
    } finally {
      state.isUploading = false;
      if (state.queue.size > 0) {
        scheduleFlush();
      }
    }
  }

  function handleMutations(mutations) {
    const urls = [];
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        urls.push(...collectFromElement(node));
        node.querySelectorAll && node.querySelectorAll('*').forEach((child) => {
          urls.push(...collectFromElement(child));
        });
      });
      if (mutation.target instanceof Element) {
        urls.push(...collectFromElement(mutation.target));
      }
    });
    if (urls.length) {
      enqueueUrls(urls);
    }
  }

  function startObserver() {
    const observer = new MutationObserver(handleMutations);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'style']
    });
    return observer;
  }

  function initialScan() {
    const urls = [];
    document.querySelectorAll('img, [style]').forEach((el) => {
      urls.push(...collectFromElement(el));
    });
    if (urls.length) {
      enqueueUrls(urls);
    } else {
      setStatus('🟢 Auto upload active (waiting for images)');
    }
  }

  function boot() {
    state.apiUrl = API_URL;
    if (!state.apiUrl) {
      alert('Vercel API URL is not configured. Userscript stopped.');
      return;
    }
    state.uploaded = loadUploadedSet();
    ensureStatusEl();
    setStatus('🟢 Auto upload active');
    startObserver();
    initialScan();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
