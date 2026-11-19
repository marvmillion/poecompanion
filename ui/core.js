// PoE Companion – gemeinsame Funktionen für alle Fenster
const App = (() => {
  const listeners = [];
  let state = null, rev = 0, online = true;

  // Grundwährung: PoE 1 Chaos, PoE 2 Exalted (Preise kommen schon umgerechnet vom Companion)
  function spiel() { try { return localStorage.getItem('spiel') || 'poe1'; } catch (e) { return 'poe1'; } }
  function wk() { return spiel() === 'poe2' ? 'ex' : 'c'; }
  function wl() { return spiel() === 'poe2' ? 'Exalted' : 'Chaos'; }

  async function api(path, body) {
    const opt = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const r = await fetch(path, opt);
    return r.json();
  }

  // Externe Links (Trade, poe.ninja, Wiki …) im Standardbrowser von Windows öffnen – nicht im Companion-Fenster
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href) || /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(href)) return;
    e.preventDefault();
    api('/api/open', { url: href }).then(r => { if (!r || !r.ok) window.open(href, '_blank'); }).catch(() => window.open(href, '_blank'));
  }, true);

  async function loop() {
    // Long-Polling: der Dienst antwortet, sobald sich etwas ändert
    while (true) {
      try {
        const s = await api(`/api/state?wait=1&rev=${rev}`);
        online = true;
        if (s.boot && window.__boot && s.boot !== window.__boot) { location.reload(); return; }
        window.__boot = s.boot;
        // Spiel des aktiven Profils merken – Seiten mit spielabhängigen Daten (Kampagne) laden dann die richtige Version
        try {
          const ap = ((s.profiles || {}).list || []).find(p => p.id === (s.profiles || {}).active);
          const sp = ap && ap.game === 'poe2' ? 'poe2' : 'poe1';
          if ((localStorage.getItem('spiel') || 'poe1') !== sp) { localStorage.setItem('spiel', sp); if (window.CAMPAIGN_POE2 || window.TREE_POE2) { location.reload(); return; } }
        } catch (e) {}
        if (s.rev !== rev || !state) { rev = s.rev; state = s; listeners.forEach(f => { try { f(s); } catch (e) { console.error(e); } }); }
      } catch (e) {
        if (online) { online = false; state = null; rev = -1; listeners.forEach(f => f(null)); }
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  function on(fn) { listeners.push(fn); if (state) fn(state); }
  function start() { loop(); }

  const esc = t => String(t ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  function num(v, d = 0) {
    v = Number(v) || 0; const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(a >= 1e10 ? 1 : 2) + ' Mrd';
    if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 1 : 2) + ' Mio';
    if (a >= 1e4) return (v / 1e3).toFixed(1) + 'k';
    return v.toLocaleString('de-DE', { maximumFractionDigits: d });
  }
  const full = v => Math.round(Number(v) || 0).toLocaleString('de-DE');
  const pct = (a, b) => a ? (b - a) / Math.abs(a) * 100 : 0;
  const sgn = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const rarityColor = r => ({ UNIQUE: 'var(--unique)', RARE: 'var(--rare)', MAGIC: 'var(--magic)', NORMAL: 'var(--normal)', RELIC: '#82ad6a' }[String(r || '').toUpperCase()] || 'var(--text)');
  const zeit = t => new Date(t * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const datum = t => { const d = new Date(t * 1000), h = new Date(); return d.toDateString() === h.toDateString() ? zeit(t) : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + zeit(t); };

  function toast(text, ms = 2600) {
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = text; document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  // Bewertung eines Vergleichs: Offensive und Defensive zusammen
  function urteil(dp, de) {
    const s = (dp > 0.5 ? 1 : dp < -0.5 ? -1 : 0) + (de > 0.5 ? 1 : de < -0.5 ? -1 : 0);
    if ((dp > 0.5 && de < -0.5) || (dp < -0.5 && de > 0.5)) return { cls: 'mix', text: 'Abwägen' };
    return s > 0 ? { cls: 'up', text: 'Upgrade' } : s < 0 ? { cls: 'down', text: 'Schlechter' } : { cls: 'same', text: 'Gleichwertig' };
  }

  const I = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    tree: '<circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="18" r="2.2"/><circle cx="12" cy="13" r="2.2"/><path d="M12 7.2v3.6M10.4 14.6l-3.8 2M13.6 14.6l3.8 2"/>',
    gem: '<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M9 3l3 6 3-6M12 21L9 9M12 21l3-12"/>',
    item: '<path d="M14.5 3.5l6 6-11 11H3.5v-6z"/><path d="M12 6l6 6"/>',
    map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M15.5 14.2c3 .2 5.5 2.6 5.5 5.8"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-2.7-1.1l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 004.6 15H4.5a2 2 0 110-4h.1a1.6 1.6 0 001.1-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 0011 4.5V4.4a2 2 0 114 0v.1a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1A1.6 1.6 0 0019.5 11h.1a2 2 0 110 4z"/>',
    refresh: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
    pin: '<path d="M12 17v5"/><path d="M8 3h8l-1 7 3 3H6l3-3z"/>',
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    sword: '<path d="M14.5 3H21v6.5L10 20.5 3.5 14z"/><path d="M5 19l-2 2M8 16l-3 3"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M9 9.5c0-1.4 1.3-2 3-2s3 .8 3 2-1.4 1.8-3 2.3-3 .9-3 2.2 1.3 2 3 2 3-.6 3-2M12 5.5v2M12 16.5v2"/>',
    paste: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4.5V3h6v1.5"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
    key: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h1M10 10h1M14 10h1M18 10h0M7 14h10"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
    up: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
    pinOff: '<path d="M12 17v5"/><path d="M8 3h8l-1 7 3 3H6l3-3z"/><path d="M3 3l18 18"/>',
  };
  const icon = (n, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${I[n] || ''}</svg>`;

  // Gem-Chip
  function gemChip(g) {
    return `<span class="gem c${g.color || 0}${g.support ? ' sup' : ''}${g.have === false && g.enabled !== false ? ' miss' : ''}" title="${esc(g.name)}${g.level ? ' · Level ' + g.level : ''}${g.quality ? ' · ' + g.quality + '% Qualität' : ''}"><span class="o"></span>${esc(g.name)}${g.level ? ` <small>${g.level}</small>` : ''}</span>`;
  }

  // Bestätigung im Stil der App statt Browser-Dialog
  function ask(text, { ok = 'OK', cancel = 'Abbrechen', danger = false, detail = '' } = {}) {
    return new Promise(res => {
      const w = document.createElement('div'); w.className = 'modal-bg';
      w.innerHTML = `<div class="modal pop" role="dialog" aria-modal="true"><div class="mt">${esc(text)}</div>${detail ? `<div class="md">${esc(detail)}</div>` : ''}
        <div class="mb"><button class="btn ghost" data-r="0">${esc(cancel)}</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-r="1">${esc(ok)}</button></div></div>`;
      const done = v => { w.remove(); document.removeEventListener('keydown', key, true); res(v); };
      const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } if (e.key === 'Enter') { e.stopPropagation(); done(true); } };
      w.onclick = e => { if (e.target === w) done(false); const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); };
      document.addEventListener('keydown', key, true);
      document.body.appendChild(w); w.querySelector('[data-r="1"]').focus();
    });
  }

  // Taste für den Item-Check, lesbar formatiert
  function itemKey(s) {
    const st = s && s.settings || {};
    if (st.itemTrigger === 'copy') return '<span class="kbd">Strg</span> + <span class="kbd">C</span>';
    return String(st.hotkeyItem || 'ALT+C').split('+').map(k => `<span class="kbd">${esc(({ CTRL: 'Strg', ALT: 'Alt', SHIFT: 'Shift' })[k] || k)}</span>`).join(' + ');
  }

  // Tastennamen für Menschen
  function keyName(k) {
    const N = { CTRL: 'Strg', ALT: 'Alt', SHIFT: 'Shift', MAUS4: 'Maus-Seitentaste hinten', MAUS5: 'Maus-Seitentaste vorne', '^': 'Taste ^ (links neben 1)', SPACE: 'Leertaste', SCROLLLOCK: 'Rollen', INSERT: 'Einfg', HOME: 'Pos1', END: 'Ende', PAUSE: 'Pause' };
    return String(k || '').toUpperCase().split('+').filter(Boolean).map(x => N[x] || (x.startsWith('NUM') ? 'Num ' + x.slice(3) : x)).join(' + ');
  }
  function keyShort(k) { return keyName(k).replace('Maus-Seitentaste hinten', 'Maus 4').replace('Maus-Seitentaste vorne', 'Maus 5').replace('Taste ^ (links neben 1)', '^'); }
  // Taste aufnehmen: nächster Tastendruck oder Maus-Seitentaste wird übernommen
  function recordKey(btn) {
    return new Promise(res => {
      const alt = btn.textContent; btn.textContent = 'Jetzt Taste drücken … (Esc = abbrechen)'; btn.classList.add('rec');
      const MAP = { Backquote: '^', IntlBackslash: '^', Space: 'SPACE', Tab: 'TAB', Pause: 'PAUSE', ScrollLock: 'SCROLLLOCK', Insert: 'INSERT', Home: 'HOME', End: 'END', NumpadAdd: 'NUM+', NumpadSubtract: 'NUM-', NumpadMultiply: 'NUM*', NumpadDivide: 'NUM/' };
      const fertig = k => { removeEventListener('keydown', kd, true); removeEventListener('mousedown', md, true); btn.textContent = alt; btn.classList.remove('rec'); res(k); };
      const mods = e => [e.ctrlKey && 'CTRL', e.altKey && 'ALT', e.shiftKey && 'SHIFT'].filter(Boolean);
      const kd = e => {
        e.preventDefault(); e.stopPropagation();
        if (e.code === 'Escape') return fertig(null);
        if (/^(Control|Alt|Shift|Meta)/.test(e.code)) return;
        let k = MAP[e.code] || (/^F\d+$/.test(e.code) ? e.code : /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit\d$/.test(e.code) ? e.code.slice(5) : /^Numpad\d$/.test(e.code) ? 'NUM' + e.code.slice(6) : null);
        if (!k) return;
        fertig([...mods(e), k].join('+'));
      };
      const md = e => { if (e.button === 3 || e.button === 4) { e.preventDefault(); fertig([...mods(e), e.button === 3 ? 'MAUS4' : 'MAUS5'].join('+')); } };
      setTimeout(() => { addEventListener('keydown', kd, true); addEventListener('mousedown', md, true); }, 50);
    });
  }

  // Größe der Overlays (Einstellung „Größe“)
  function applyScale(s) {
    const z = s && s.settings && s.settings.overlayScale;
    document.body.style.zoom = z && z !== 100 ? z / 100 : '';
  }

  // Overlay-Fenster: Titelleiste ausblenden (Fensterbereich zuschneiden) und an der eigenen Kopfzeile ziehen
  function overlay(name) {
    const m = document.createElement('meta'); m.name = 'theme-color'; m.content = '#12100d'; document.head.appendChild(m);
    let frameless = null;
    const clip = () => api('/api/window', { name, action: 'clip', m: { ow: window.outerWidth, oh: window.outerHeight, iw: window.innerWidth, ih: window.innerHeight } }).catch(() => {});
    let lastM = '';
    window.addEventListener('resize', () => { clearTimeout(clip.t); clip.t = setTimeout(() => { const k = [window.outerWidth - window.innerWidth, window.outerHeight - window.innerHeight].join(); if (k !== lastM) { lastM = k; clip(); } }, 200); });
    on(s => { if (!s) return; const want = s.settings.framelessOverlays !== false; if (want !== frameless) { frameless = want; clip(); } });
    setTimeout(clip, 300);
    // „?“ in der Kopfzeile: öffnet die Anleitung im Hub
    const hilfe = () => { const top = document.querySelector('.top'), hb = document.getElementById('hub'); if (!top || !hb || document.getElementById('hilfe')) return;
      const b = document.createElement('button'); b.className = hb.className.replace(/\bgo\b/, ''); b.id = 'hilfe'; b.title = 'Anleitung'; b.textContent = '?'; b.style.font = '700 13px var(--sans)';
      b.onclick = () => api('/api/settings', { hubGoto: 'help' }).then(() => api('/api/window', { name: 'hub', action: 'open' }));
      hb.parentNode.insertBefore(b, hb); };
    document.addEventListener('DOMContentLoaded', hilfe); setTimeout(hilfe, 0);
    // Griff unten rechts: Fenstergröße ändern (der Windows-Rand ist weg)
    const g = document.createElement('div'); g.className = 'rgrip'; g.title = 'Größe ändern';
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(g));
    if (document.body) document.body.appendChild(g);
    g.addEventListener('pointerdown', e => {
      e.preventDefault(); g.setPointerCapture(e.pointerId);
      let lx = e.screenX, ly = e.screenY, aw = 0, ah = 0, raf = 0;
      const send = () => { raf = 0; if (aw || ah) { api('/api/window', { name, action: 'size', dw: aw, dh: ah }).catch(() => {}); aw = ah = 0; } };
      const mv = ev => { aw += ev.screenX - lx; ah += ev.screenY - ly; lx = ev.screenX; ly = ev.screenY; if (!raf) raf = requestAnimationFrame(send); };
      const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); send(); };
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
    });
    // Ziehen an der Kopfzeile
    document.addEventListener('pointerdown', e => {
      const h = e.target.closest('[data-drag]'); if (!h || e.target.closest('button,select,input,a')) return;
      let lx = e.screenX, ly = e.screenY, ax = 0, ay = 0, raf = 0, los = false; const x0 = e.screenX, y0 = e.screenY;
      if (e.detail > 1) return;  // Doppelklick: kein Ziehen (Maximieren übernimmt dblclick)
      h.setPointerCapture(e.pointerId);
      const send = () => { raf = 0; if (!los && Math.abs(lx - x0) + Math.abs(ly - y0) < 5) { ax = ay = 0; return; } los = true; if (ax || ay) { api('/api/window', { name, action: 'move', dx: ax, dy: ay }).catch(() => {}); ax = ay = 0; } };
      const mv = ev => { ax += ev.screenX - lx; ay += ev.screenY - ly; lx = ev.screenX; ly = ev.screenY; if (!raf) raf = requestAnimationFrame(send); };
      const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); send(); };
      h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up);
    });
  }

  return { spiel, wk, wl, keyName, keyShort, recordKey, overlay, api, on, start, esc, num, full, pct, sgn, rarityColor, zeit, datum, toast, urteil, icon, gemChip, ask, applyScale, itemKey, get state() { return state; } };
})();
