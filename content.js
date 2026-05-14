// SnapQuery Content Script — v2
// Fix: listeners never double-attached; draw mode fully resets on every activation

(function () {
  'use strict';

  if (window.__snapqueryLoaded) return;
  window.__snapqueryLoaded = true;

  // ── State ────────────────────────────────────────────────────────────────
  let overlayEl, rectEl, labelEl, hintEl, confirmHintEl;
  let toastEl = null;
  let bottomBarEl = null;

  let isDrawing = false;
  let drawActive = false;
  let startX = 0, startY = 0;
  let savedRect = null;

  // ── Build / reuse DOM ────────────────────────────────────────────────────
  function ensureElements() {
    if (!document.getElementById('snapquery-overlay')) {
      overlayEl = document.createElement('div');
      overlayEl.id = 'snapquery-overlay';
      document.body.appendChild(overlayEl);
    } else { overlayEl = document.getElementById('snapquery-overlay'); }

    if (!document.getElementById('snapquery-rect')) {
      rectEl = document.createElement('div');
      rectEl.id = 'snapquery-rect';
      document.body.appendChild(rectEl);
    } else { rectEl = document.getElementById('snapquery-rect'); }

    if (!document.getElementById('snapquery-label')) {
      labelEl = document.createElement('div');
      labelEl.id = 'snapquery-label';
      document.body.appendChild(labelEl);
    } else { labelEl = document.getElementById('snapquery-label'); }

    if (!document.getElementById('snapquery-hint')) {
      hintEl = document.createElement('div');
      hintEl.id = 'snapquery-hint';
      hintEl.innerHTML = `<span>Click &amp; drag to select a region</span><span class="sq-esc"><kbd>Esc</kbd> cancel</span>`;
      document.body.appendChild(hintEl);
    } else { hintEl = document.getElementById('snapquery-hint'); }

    if (!document.getElementById('snapquery-confirm-hint')) {
      confirmHintEl = document.createElement('div');
      confirmHintEl.id = 'snapquery-confirm-hint';
      confirmHintEl.innerHTML = `⊹ Region set &mdash; press <kbd>Alt</kbd>+<kbd>Ctrl</kbd>+<kbd>S</kbd> to send`;
      document.body.appendChild(confirmHintEl);
    } else { confirmHintEl = document.getElementById('snapquery-confirm-hint'); }
  }

  // ── Enter draw mode ──────────────────────────────────────────────────────
  function enterDrawMode() {
    if (drawActive) {
      // Already in draw mode — allow re-drawing by tearing down first
      teardownDrawMode();
    }

    ensureElements();

    rectEl.style.display = 'none';
    labelEl.style.display = 'none';
    confirmHintEl.style.display = 'none';
    overlayEl.style.display = 'block';
    hintEl.style.display = 'flex';

    savedRect = null;  // reset so a fresh region is drawn
    isDrawing = false;
    drawActive = true;

    overlayEl.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onGlobalKey);
  }

  // ── Full teardown ─────────────────────────────────────────────────────────
  function teardownDrawMode() {
    drawActive = false;
    isDrawing = false;

    if (overlayEl) {
      overlayEl.removeEventListener('mousedown', onMouseDown);
      overlayEl.removeEventListener('mousemove', onMouseMove);
      overlayEl.removeEventListener('mouseup', onMouseUp);
      overlayEl.style.display = 'none';
    }
    document.removeEventListener('keydown', onGlobalKey);
    if (hintEl) hintEl.style.display = 'none';
  }

  function clearSelection() {
    savedRect = null;
    if (rectEl) rectEl.style.display = 'none';
    if (labelEl) labelEl.style.display = 'none';
    if (confirmHintEl) confirmHintEl.style.display = 'none';
  }

  // ── Mouse handlers ────────────────────────────────────────────────────────
  function onMouseDown(e) {
    if (e.button !== 0) return;
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;

    rectEl.style.left = startX + 'px';
    rectEl.style.top = startY + 'px';
    rectEl.style.width = '0';
    rectEl.style.height = '0';
    rectEl.style.display = 'block';
    labelEl.style.display = 'block';
    confirmHintEl.style.display = 'none';

    overlayEl.addEventListener('mousemove', onMouseMove);
    overlayEl.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    if (!isDrawing) return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);

    rectEl.style.left = x + 'px';
    rectEl.style.top = y + 'px';
    rectEl.style.width = w + 'px';
    rectEl.style.height = h + 'px';

    labelEl.textContent = `${Math.round(w)} \u00d7 ${Math.round(h)}`;
    labelEl.style.left = (x + w + 6) + 'px';
    labelEl.style.top = Math.max(y - 2, 2) + 'px';
  }

  function onMouseUp(e) {
    if (!isDrawing) return;
    isDrawing = false;
    overlayEl.removeEventListener('mousemove', onMouseMove);
    overlayEl.removeEventListener('mouseup', onMouseUp);

    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);

    if (w < 5 || h < 5) {
      clearSelection();
      teardownDrawMode();
      return;
    }

    savedRect = { x: x + window.scrollX, y: y + window.scrollY, w, h };

    // Position confirm hint below rect, clamped to viewport
    const hintTop = Math.min(y + h + 10, window.innerHeight - 44);
    confirmHintEl.style.left = x + 'px';
    confirmHintEl.style.top = hintTop + 'px';
    confirmHintEl.style.display = 'flex';

    // Hide the drawing overlay but keep rect + keydown listener alive
    overlayEl.style.display = 'none';
    hintEl.style.display = 'none';
    overlayEl.removeEventListener('mousedown', onMouseDown);
    // drawActive stays true; onGlobalKey stays attached
  }

  // ── Global keyboard handler (active only during draw mode) ───────────────
  function onGlobalKey(e) {
    if (e.key === 'Escape') {
      clearSelection();
      teardownDrawMode();
      return;
    }
    if (e.altKey && e.ctrlKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (savedRect) triggerCapture();
    }
  }

  // ── Always-on shortcut (reuses savedRect without redrawing) ──────────────
  document.addEventListener('keydown', function onPersistentShortcut(e) {
    if (e.altKey && e.ctrlKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      // Only act here when draw mode is NOT active (draw mode has its own handler)
      if (savedRect && !drawActive) {
        ensureElements();
        // Flash the rect so user sees what region is being captured
        rectEl.style.left    = (savedRect.x - window.scrollX) + 'px';
        rectEl.style.top     = (savedRect.y - window.scrollY) + 'px';
        rectEl.style.width   = savedRect.w + 'px';
        rectEl.style.height  = savedRect.h + 'px';
        rectEl.style.display = 'block';
        triggerCapture();
      }
    }
  });

  // ── Trigger capture ───────────────────────────────────────────────────────
  function triggerCapture() {
    if (!savedRect) return;

    if (rectEl) rectEl.style.display = 'none';
    if (labelEl) labelEl.style.display = 'none';
    if (confirmHintEl) confirmHintEl.style.display = 'none';

    const rectToSend = { ...savedRect };
    // Do NOT clearSelection() — preserve savedRect so shortcut can fire again
    teardownDrawMode();

    setTimeout(() => {
      chrome.runtime.sendMessage({
        type: 'CAPTURE_REGION',
        rect: rectToSend,
        dpr: window.devicePixelRatio || 1
      });
    }, 80);
  }

  // ── Status toast ──────────────────────────────────────────────────────────
  function showToast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'snapquery-toast';
      Object.assign(toastEl.style, {
        position: 'fixed', bottom: '20px', right: '20px',
        zIndex: '2147483646',
        background: 'rgba(223,223,225,0.95)',
        border: '1px solid #2a2a35',
        color: '#e8e8f0',
        fontFamily: 'monospace',
        fontSize: '12px',
        padding: '1px 1px',
        borderRadius: '10px',
        boxShadow: '0 4px 24px rgba(220,220,220,0.5)',
        maxWidth: '300px',
        lineHeight: '1',
        transition: 'opacity 0.3s',
        display: 'none'
      });
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.style.opacity = '1';
    toastEl.style.display = 'block';
  }

  function hideToast() {
    if (!toastEl) return;
    toastEl.style.opacity = '0';
    setTimeout(() => { if (toastEl) toastEl.style.display = 'none'; }, 300);
  }

  // ── Bottom bar ────────────────────────────────────────────────────────────
  function showBottomBar(content, isError, opacity) {
    const op = (opacity !== undefined && opacity !== null) ? opacity : 0.5;
    const textColor = 'rgba(0,0,0,' + op + ')';

    // Remove old bar and style tag each time so opacity is always live
    const oldBar   = document.getElementById('snapquery-bar');
    const oldStyle = document.getElementById('sq-bar-style');
    if (oldBar)   oldBar.remove();
    if (oldStyle) oldStyle.remove();

    // Strip ALL markdown to plain text so no child element inherits page styles
    const plain = content
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`([^`\n]+)`/g, '$1')
      .replace(/#+\s*/g, '')
      .replace(/\n+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const s = document.createElement('style');
    s.id = 'sq-bar-style';
    s.textContent = `
      #snapquery-bar {
        all: initial !important;
        position: fixed !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        z-index: 2147483647 !important;
        background: transparent !important;
        box-shadow: none !important;
        outline: none !important;
        border: none !important;
        border-top: 0.5px solid rgba(0,0,0,0.08) !important;
        display: block !important;
        height: 20px !important;
        max-height: 20px !important;
        min-height: 20px !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      }
      #snapquery-bar-body {
        all: initial !important;
        display: block !important;
        width: 100% !important;
        height: 20px !important;
        line-height: 20px !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        white-space: nowrap !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 9px !important;
        color: ${textColor} !important;
        background: transparent !important;
        box-shadow: none !important;
        border: none !important;
        outline: none !important;
        padding: 0 8px !important;
        box-sizing: border-box !important;
        cursor: default !important;
      }
      #snapquery-bar-body::-webkit-scrollbar { height: 2px !important; }
      #snapquery-bar-body::-webkit-scrollbar-track { background: transparent !important; }
      #snapquery-bar-body::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15) !important; border-radius: 1px !important; }
    `;
    document.head.appendChild(s);

    bottomBarEl = document.createElement('div');
    bottomBarEl.id = 'snapquery-bar';

    const bodyEl = document.createElement('div');
    bodyEl.id = 'snapquery-bar-body';
    bodyEl.textContent = plain;  // textContent only — zero HTML, zero tag bleed

    bottomBarEl.appendChild(bodyEl);
    document.body.appendChild(bottomBarEl);
  }

  // ── Message listener ──────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'START_DRAW') {
      enterDrawMode();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'STATUS_UPDATE') {
      showToast(msg.text);
    }
    if (msg.type === 'SHOW_RESULT') {
      hideToast();
      // Read opacity from storage so the bar always reflects current setting
      chrome.storage.local.get(['textOpacity'], (data) => {
        const op = (data.textOpacity !== undefined) ? data.textOpacity : 0.5;
        showBottomBar(msg.content, msg.isError, op);
      });
    }
  });

})();
