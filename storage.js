/* Shared JSONBin-backed storage for The Atlas.
   All pages read/write one JSON blob (same shape as the old `lt_data`
   localStorage object). localStorage is kept as an offline cache/fallback
   so the app still works if JSONBin is unreachable or not configured yet. */

// ── Paste your JSONBin details here ──
// Create a free bin at https://jsonbin.io, then fill these in.
const JSONBIN_BIN_ID = '';   // e.g. '65f1a2b3c4d5e6f7a8b9c0d1'
const JSONBIN_API_KEY = '';  // your X-Master-Key

(function (global) {
  const CFG_KEY = 'atlas_jsonbin_cfg';
  const CACHE_KEY = 'lt_data';

  function getConfig() {
    if (JSONBIN_BIN_ID && JSONBIN_API_KEY) {
      return { binId: JSONBIN_BIN_ID, apiKey: JSONBIN_API_KEY };
    }
    try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; }
    catch { return {}; }
  }
  function setConfig(cfg) { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }
  function isConfigured() {
    const c = getConfig();
    return !!(c.binId && c.apiKey);
  }
  function getCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; }
    catch { return {}; }
  }
  function setCache(data) { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); }

  async function load() {
    const cfg = getConfig();
    if (!cfg.binId || !cfg.apiKey) {
      setStatus('local', 'Not connected to JSONBin — using this device only.');
      return getCache();
    }
    try {
      const res = await fetch(`https://api.jsonbin.io/v3/b/${cfg.binId}/latest`, {
        headers: { 'X-Master-Key': cfg.apiKey, 'X-Bin-Meta': 'false' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setCache(data);
      setStatus('ok', 'Synced with JSONBin.');
      return data && typeof data === 'object' ? data : {};
    } catch (e) {
      console.warn('AtlasStorage: load from JSONBin failed, using local cache.', e);
      setStatus('error', 'Could not reach JSONBin — showing last saved data on this device.');
      return getCache();
    }
  }

  let saveTimer = null;
  function save(data) {
    setCache(data);
    const cfg = getConfig();
    if (!cfg.binId || !cfg.apiKey) return Promise.resolve();
    clearTimeout(saveTimer);
    return new Promise((resolve) => {
      saveTimer = setTimeout(async () => {
        try {
          const res = await fetch(`https://api.jsonbin.io/v3/b/${cfg.binId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': cfg.apiKey },
            body: JSON.stringify(data)
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          setStatus('ok', 'Synced with JSONBin.');
        } catch (e) {
          console.warn('AtlasStorage: save to JSONBin failed.', e);
          setStatus('error', 'Could not save to JSONBin — kept on this device only.');
        }
        resolve();
      }, 400);
    });
  }

  // ── Status pill + settings modal (injected into every page) ──
  function setStatus(kind, msg) {
    const el = document.getElementById('atlas-sync-status');
    if (!el) return;
    el.textContent = kind === 'ok' ? '● Synced' : kind === 'error' ? '● Sync error' : '○ Local only';
    el.title = msg || '';
    el.className = 'atlas-sync-status ' + kind;
  }

  function injectUI() {
    const style = document.createElement('style');
    style.textContent = `
      .atlas-sync-status{font-size:0.62rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-left:auto;flex-shrink:0;white-space:nowrap;cursor:default;}
      .atlas-sync-status.ok{color:#8ab88a;}
      .atlas-sync-status.error{color:#d98a6a;}
      .atlas-settings-btn{background:none;border:1px solid rgba(255,255,255,0.2);color:#faf7f2;font-family:inherit;font-size:0.72rem;letter-spacing:0.08em;text-transform:uppercase;padding:0.4rem 0.7rem;border-radius:2rem;cursor:pointer;white-space:nowrap;flex-shrink:0;-webkit-tap-highlight-color:transparent;}
      .atlas-settings-btn:hover{background:rgba(255,255,255,0.12);}
      .atlas-modal-overlay{position:fixed;inset:0;background:rgba(26,24,20,0.65);display:flex;align-items:center;justify-content:center;z-index:500;opacity:0;pointer-events:none;transition:opacity 0.2s;}
      .atlas-modal-overlay.open{opacity:1;pointer-events:all;}
      .atlas-modal{background:#faf7f2;color:#1a1814;border-radius:8px;padding:1.8rem;width:100%;max-width:420px;margin:0 1rem;font-family:'DM Sans',system-ui,sans-serif;}
      .atlas-modal h3{font-family:'Playfair Display',Georgia,serif;font-size:1.3rem;font-weight:400;margin-bottom:0.5rem;}
      .atlas-modal p{font-size:0.82rem;color:#7a7165;line-height:1.5;margin-bottom:1.2rem;}
      .atlas-modal label{font-size:0.65rem;letter-spacing:0.1em;text-transform:uppercase;color:#7a7165;display:block;margin-bottom:0.4rem;}
      .atlas-modal input{width:100%;background:#f5f0e8;border:1px solid #ddd3c0;border-radius:4px;font-family:inherit;font-size:0.88rem;color:#1a1814;padding:0.65rem 0.85rem;outline:none;margin-bottom:1rem;min-height:44px;box-sizing:border-box;}
      .atlas-modal input:focus{border-color:#5a7a5b;}
      .atlas-modal-actions{display:flex;gap:0.6rem;justify-content:flex-end;flex-wrap:wrap;}
      .atlas-modal-actions button{font-family:inherit;font-size:0.8rem;padding:0.55rem 1.1rem;border-radius:2rem;cursor:pointer;min-height:44px;-webkit-tap-highlight-color:transparent;}
      .atlas-btn-cancel{background:transparent;border:1px solid #ddd3c0;color:#7a7165;}
      .atlas-btn-clear{background:transparent;border:1px solid #b85a40;color:#8b3a2a;margin-right:auto;}
      .atlas-btn-save{background:#1a1814;border:1px solid #1a1814;color:#faf7f2;}
      .atlas-modal-link{font-size:0.75rem;color:#2a4a6a;}
    `;
    document.head.appendChild(style);

    const nav = document.querySelector('.site-nav');
    const baked = !!(JSONBIN_BIN_ID && JSONBIN_API_KEY);
    if (nav) {
      const status = document.createElement('span');
      status.id = 'atlas-sync-status';
      status.className = 'atlas-sync-status local';
      status.textContent = '○ Local only';
      nav.appendChild(status);

      // When Bin ID/API key are hardcoded in storage.js, the settings modal
      // is redundant (it would always be overridden), so skip the button.
      if (!baked) {
        const btn = document.createElement('button');
        btn.className = 'atlas-settings-btn';
        btn.textContent = '⚙ Sync';
        btn.onclick = openSettings;
        nav.appendChild(btn);
      }
    }

    const overlay = document.createElement('div');
    overlay.className = 'atlas-modal-overlay';
    overlay.id = 'atlas-settings-overlay';
    overlay.innerHTML = `
      <div class="atlas-modal">
        <h3>Connect JSONBin</h3>
        <p>Create a free bin at <span class="atlas-modal-link">jsonbin.io</span>, then paste its Bin ID and your X-Master-Key below. Data syncs to that bin instead of staying only on this device.</p>
        <label for="atlas-bin-id">Bin ID</label>
        <input id="atlas-bin-id" placeholder="e.g. 65f1a2b3c4d5e6f7a8b9c0d1" autocomplete="off"/>
        <label for="atlas-api-key">X-Master-Key</label>
        <input id="atlas-api-key" placeholder="Your JSONBin API key" autocomplete="off"/>
        <div class="atlas-modal-actions">
          <button class="atlas-btn-clear" onclick="AtlasStorage.clearConfig()">Disconnect</button>
          <button class="atlas-btn-cancel" onclick="AtlasStorage.closeSettings()">Cancel</button>
          <button class="atlas-btn-save" onclick="AtlasStorage.saveSettings()">Save & sync</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSettings(); });

    const cfg = getConfig();
    if (cfg.binId) document.getElementById('atlas-bin-id').value = cfg.binId;
    if (cfg.apiKey) document.getElementById('atlas-api-key').value = cfg.apiKey;
    if (isConfigured()) setStatus('ok', 'Configured — will sync with JSONBin.');
  }

  function openSettings() {
    const cfg = getConfig();
    document.getElementById('atlas-bin-id').value = cfg.binId || '';
    document.getElementById('atlas-api-key').value = cfg.apiKey || '';
    document.getElementById('atlas-settings-overlay').classList.add('open');
  }
  function closeSettings() {
    document.getElementById('atlas-settings-overlay').classList.remove('open');
  }
  async function saveSettings() {
    const binId = document.getElementById('atlas-bin-id').value.trim();
    const apiKey = document.getElementById('atlas-api-key').value.trim();
    if (!binId || !apiKey) { alert('Please enter both a Bin ID and an API key.'); return; }
    setConfig({ binId, apiKey });
    closeSettings();
    // Push whatever is currently cached locally up to the newly-connected bin,
    // then reload the page so every script picks up the synced copy.
    await save(getCache());
    location.reload();
  }
  function clearConfig() {
    if (!confirm('Disconnect from JSONBin? Data will stay on this device only from now on.')) return;
    localStorage.removeItem(CFG_KEY);
    closeSettings();
    setStatus('local', 'Not connected to JSONBin — using this device only.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUI);
  } else {
    injectUI();
  }

  global.AtlasStorage = {
    load, save, getConfig, setConfig, isConfigured,
    openSettings, closeSettings, saveSettings, clearConfig
  };
})(window);
