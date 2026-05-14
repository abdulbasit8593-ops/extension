// ── Tab switching ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ── Persist & restore prompt + settings ───────────────────────────────────
const promptEl   = document.getElementById('prompt');
const apiKeyEl   = document.getElementById('api-key');
const modelEl    = document.getElementById('model');
const statusArea = document.getElementById('status-area');
const statusText = document.getElementById('status-text');
const sliderEl   = document.getElementById('opacity-slider');
const sliderVal  = document.getElementById('opacity-value');
const previewTxt = document.getElementById('opacity-preview-text');

chrome.storage.local.get(['prompt', 'apiKey', 'model', 'textOpacity'], (data) => {
  if (data.prompt)  promptEl.value = data.prompt;
  if (data.apiKey)  apiKeyEl.value = data.apiKey;
  if (data.model)   modelEl.value  = data.model;

  const pct = (data.textOpacity !== undefined)
    ? Math.round(data.textOpacity * 100)
    : 50;
  sliderEl.value = pct;
  applyOpacityUI(pct);
});

promptEl.addEventListener('input', () => {
  chrome.storage.local.set({ prompt: promptEl.value });
});

// ── Opacity slider ─────────────────────────────────────────────────────────
function applyOpacityUI(pct) {
  sliderVal.textContent = pct + '%';
  const op = pct / 100;
  previewTxt.style.color = 'rgba(0,0,0,' + op + ')';
}

sliderEl.addEventListener('input', () => {
  const pct = parseInt(sliderEl.value, 10);
  applyOpacityUI(pct);
  chrome.storage.local.set({ textOpacity: pct / 100 });
});

// ── Toggle API key visibility ──────────────────────────────────────────────
document.getElementById('btn-toggle-key').addEventListener('click', () => {
  apiKeyEl.type = apiKeyEl.type === 'password' ? 'text' : 'password';
});

// ── Save settings ──────────────────────────────────────────────────────────
document.getElementById('btn-save').addEventListener('click', () => {
  chrome.storage.local.set({
    apiKey: apiKeyEl.value.trim(),
    model:  modelEl.value.trim() || 'google/gemini-2.0-flash-001'
  }, () => {
    const msg = document.getElementById('save-msg');
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 1800);
  });
});

// ── Draw selection ─────────────────────────────────────────────────────────
document.getElementById('btn-draw').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  chrome.storage.local.set({ prompt: promptEl.value });

  chrome.tabs.sendMessage(tab.id, { type: 'START_DRAW' }, (res) => {
    if (chrome.runtime.lastError) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }, () => {
        chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content.css']
        }, () => {
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { type: 'START_DRAW' });
          }, 100);
        });
      });
    }
  });

  window.close();
});

// ── Listen for status updates from background ──────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATUS') {
    statusArea.classList.remove('hidden');
    statusText.textContent = msg.text;
    if (msg.done) {
      setTimeout(() => statusArea.classList.add('hidden'), 3000);
    }
  }
});
