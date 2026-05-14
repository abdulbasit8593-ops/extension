// SnapQuery – Service Worker (background.js) v2
// Captures, crops, saves to Downloads, sends to OpenRouter/Gemini

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'CAPTURE_REGION') {
    handleCapture(msg, sender);
  }
});

async function handleCapture(msg, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  try {
    const { apiKey, model, prompt } = await storageGet(['apiKey', 'model', 'prompt']);

    if (!apiKey) {
      notify(tabId, '⚠ No API key — open the extension and go to Settings.');
      return;
    }

    notify(tabId, '📸 Capturing screenshot…');

    // 1. Capture full visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });

    notify(tabId, '✂️ Cropping region…');

    // 2. Crop to selected rectangle
    const croppedDataUrl = await cropImage(dataUrl, msg.rect, msg.dpr);

    // 3. Save to Downloads
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename   = `snapquery-${timestamp}.png`;
    await chrome.downloads.download({
      url:      croppedDataUrl,
      filename: filename,
      saveAs:   false   // saves silently to default Downloads folder
    });

    notify(tabId, `💾 Saved as ${filename} · Sending to Gemini…`);

    // 4. Call OpenRouter
    const base64 = croppedDataUrl.split(',')[1];
    const result  = await callOpenRouter({
      apiKey,
      model:  model  || 'google/gemini-2.0-flash-001',
      prompt: prompt || 'Describe what you see in this screenshot.',
      base64
    });

    notify(tabId, '✅ Done!');

    chrome.tabs.sendMessage(tabId, { type: 'SHOW_RESULT', content: result });

  } catch (err) {
    console.error('[SnapQuery]', err);
    notify(tabId, '❌ ' + err.message);
    chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_RESULT',
      content: 'Error: ' + err.message,
      isError: true
    });
  }
}

// ── Crop via OffscreenCanvas ──────────────────────────────────────────────
async function cropImage(dataUrl, rect, dpr) {
  const blob = await (await fetch(dataUrl)).blob();
  const bmp  = await createImageBitmap(blob);

  const sx = Math.round(rect.x * dpr);
  const sy = Math.round(rect.y * dpr);
  const sw = Math.round(rect.w * dpr);
  const sh = Math.round(rect.h * dpr);

  const csx = Math.max(0, Math.min(sx, bmp.width));
  const csy = Math.max(0, Math.min(sy, bmp.height));
  const csw = Math.min(sw, bmp.width  - csx);
  const csh = Math.min(sh, bmp.height - csy);

  const canvas = new OffscreenCanvas(csw, csh);
  canvas.getContext('2d').drawImage(bmp, csx, csy, csw, csh, 0, 0, csw, csh);

  const outBlob = await canvas.convertToBlob({ type: 'image/png' });
  return blobToDataUrl(outBlob);
}

function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onloadend = () => res(r.result);
    r.onerror   = rej;
    r.readAsDataURL(blob);
  });
}

// ── OpenRouter API call ───────────────────────────────────────────────────
async function callOpenRouter({ apiKey, model, prompt, base64 }) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  'https://snapquery-extension',
      'X-Title':       'SnapQuery'
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
          { type: 'text', text: prompt }
        ]
      }]
    })
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${txt}`);
  }

  const data    = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from API.');
  return content;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function notify(tabId, text) {
  chrome.tabs.sendMessage(tabId, { type: 'STATUS_UPDATE', text }).catch(() => {});
}

function storageGet(keys) {
  return new Promise(res => chrome.storage.local.get(keys, res));
}
