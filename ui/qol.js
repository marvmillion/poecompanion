// PoE Companion – Bedienkomfort: Einrichtung, Schnellsuche (Strg+K), Tastenkürzel, Modul-Status
const QOL = {};

// ---------------------------------------------------------------- Einrichtung
QOL.setup = () => {
  if (!S) return [];
  const p = activeProfile();
  return [
    { ok: !!p, t: 'Profil anlegen', d: 'Account und Charakter eintragen – oder einen pobb.in-Link.', go: '#profiles' },
    { ok: !!(S.char && S.char.sheet), t: 'Charakter geladen', d: S.status.error || 'Path of Building rechnet deinen Build durch.', go: '#profiles', wait: S.status.busy },
    { ok: !!(p && (p.guide || p.mode === 'link')), t: 'Guide hinterlegen', d: 'pobb.in-Link deines Guides – für Skilltree-Plan und Gem-Setups.', go: '#profiles', opt: true },
    { ok: !!(S.campaign && S.campaign.log), t: 'Spiel-Log gefunden', d: 'Nötig für Kampagnen-Guide und Map-Zähler. Pfad unter „Stash & Farming“ eintragen.', go: '#stash' },
    { ok: !!(S.farm && S.farm.hasSessid), t: 'POESESSID eintragen', d: 'Für Stash-Wert und Farming-Session.', go: '#stash', opt: true },
  ];
};
QOL.setupCard = () => {
  const L = QOL.setup(), need = L.filter(x => !x.ok && !x.opt);
  if (!L.length || (!need.length && !L.some(x => !x.ok))) return '';
  const done = L.filter(x => x.ok).length;
  let dismissed = false; try { dismissed = localStorage.getItem('setupHidden') === String(done); } catch (e) {}
  if (dismissed && !need.length) return '';
  const offen = L.filter(x => !x.ok);
  return `<div class="setup2"><div class="s2h"><b>Einrichtung</b><span class="s2n">${done} von ${L.length}</span><div class="s2bar"><i style="width:${done / L.length * 100}%"></i></div>
      <div class="s2ok">${L.filter(x => x.ok).map(x => `<span>${icon('check', 11)} ${esc(x.t)}</span>`).join('')}</div>
      ${!need.length ? `<button class="btn small ghost" id="setupHide">Ausblenden</button>` : ''}</div>
    ${offen.map(x => `<a class="s2o" href="${x.go}"><span class="sb">${x.wait ? '<span class="spin">' + icon('refresh', 12) + '</span>' : ''}</span><b>${esc(x.t)}${x.opt ? ' <small class="muted">optional</small>' : ''}</b><span class="muted">${esc(x.d)}</span><span class="s2go">Einrichten</span></a>`).join('')}</div>`;
};
document.addEventListener('click', e => {
  if (e.target.closest('#setupHide')) { try { localStorage.setItem('setupHidden', String(QOL.setup().filter(x => x.ok).length)); } catch (x) {} lastKey.home = null; renderView(true); }
});

// ---------------------------------------------------------------- Modul-Status in der Seitenleiste
QOL.status = () => {
  if (!S) return;
  const st = S.status, c = S.campaign, f = S.farm;
  const rows = [
    ['Path of Building', st.error ? 'err' : st.busy || !st.ready ? 'busy' : 'ok', st.error ? 'Fehler – Details in der Übersicht' : st.text, '#home'],
    ['Spiel-Log', c && c.log ? 'ok' : 'off', c && c.log ? (c.zone ? 'Gebiet: ' + c.zone : 'gefunden') : 'nicht gefunden', '#stash'],
    ['Stash', f && f.hasSessid ? (f.session && f.session.active ? 'live' : 'ok') : 'off', f && f.hasSessid ? (f.session && f.session.active ? 'Farming-Session läuft' : 'verbunden') : 'POESESSID fehlt', '#stash'],
  ];
  const kurz = { 'Path of Building': 'PoB', 'Spiel-Log': 'Log', Stash: 'Stash' };
  $('#stat').innerHTML = `<div class="mstrow">${rows.map(r => `<a class="mst2 ${r[1]}" href="${r[3]}" title="${esc(r[0] + ': ' + r[2])}"><span class="dot ${r[1]}"></span>${kurz[r[0]]}</a>`).join('')}</div>`
    + `<button class="kb" id="palBtn">${icon('search', 14)} Schnellsuche <span class="kbd">Strg</span><span class="kbd">K</span></button>`;
  $('#palBtn').onclick = QOL.open;
};
App.on(s => { if (s) setTimeout(QOL.status, 0); });

// ---------------------------------------------------------------- Schnellsuche
QOL.cmds = () => {
  const A = (a, b) => api(a, b);
  const f = S && S.farm, live = f && f.session && f.session.active;
  const L = NAV.filter(Boolean).map((n, i) => ({ t: n[1], d: 'Ansicht öffnen', k: String(i + 1), ic: n[2], run: () => location.hash = n[0] }));
  L.push(
    { t: 'Charakter neu laden', d: 'Holt deinen aktuellen Stand von pathofexile.com', ic: 'refresh', run: () => { A('/api/refresh', {}); toast('Lade Charakter neu …'); } },
    { t: live ? 'Farming-Session beenden' : 'Farming-Session starten', d: live ? 'Rechnet ab und speichert' : 'Stash als Nullpunkt merken', ic: 'bolt', run: () => A('/api/stash/action', { action: live ? 'stop' : 'start' }) },
    { t: 'Stash bewerten', d: 'Gesamtwert in Divine', ic: 'coin', run: () => { location.hash = 'stash'; A('/api/stash/action', { action: 'scan' }); } },
    { t: 'Kampagne: Schritt erledigt', d: 'Zum nächsten Quest-Schritt', ic: 'flag', run: () => A('/api/campaign', { action: 'next' }) },
    { t: 'Item-Popup öffnen', d: 'Overlay über dem Spiel', ic: 'item', run: () => A('/api/window', { name: 'item', action: 'open' }) },
    { t: 'Skilltree-Overlay öffnen', d: 'Overlay über dem Spiel', ic: 'tree', run: () => A('/api/window', { name: 'tree', action: 'open' }) },
    { t: 'Kampagnen-Overlay öffnen', d: 'Overlay über dem Spiel', ic: 'flag', run: () => A('/api/window', { name: 'quest', action: 'open' }) },
    { t: 'Farming-Overlay öffnen', d: 'Overlay über dem Spiel', ic: 'coin', run: () => A('/api/window', { name: 'farm', action: 'open' }) },
    { t: 'Fenster zurücksetzen', d: 'Alle Overlays an ihre Standardposition', ic: 'eye', run: () => A('/api/window', { action: 'reset' }).then(() => toast('Fenster zurückgesetzt.')) },
    { t: 'Item-Text einfügen und vergleichen', d: 'Aus der Zwischenablage', ic: 'paste', run: async () => { try { const t = await navigator.clipboard.readText(); if (t) { location.hash = 'items'; A('/api/compare', { text: t }); } } catch (e) { location.hash = 'items'; } } },
    { t: 'Tastenkürzel anzeigen', d: 'Alle Kürzel auf einen Blick', ic: 'key', run: QOL.keys },
  );
  (S && S.profiles.list || []).filter(p => p.id !== S.profiles.active).forEach(p => L.push({ t: 'Profil wechseln: ' + p.name, d: p.game === 'poe2' ? 'PoE 2' : 'PoE 1', ic: 'users', run: () => A('/api/profiles/activate', { id: p.id }) }));
  return L;
};
QOL.open = () => {
  if (document.querySelector('.pal-bg')) return;
  const w = document.createElement('div'); w.className = 'pal-bg';
  w.innerHTML = `<div class="pal pop"><div class="pin">${icon('search', 18)}<input id="palq" placeholder="Was möchtest du tun?" autocomplete="off"><span class="kbd">Esc</span></div><div class="pl" id="pall"></div></div>`;
  document.body.appendChild(w);
  const all = QOL.cmds(); let sel = 0, list = all;
  const draw = () => {
    $('#pall').innerHTML = list.map((c, i) => `<div class="pi${i === sel ? ' on' : ''}" data-i="${i}">${icon(c.ic, 17)}<span><b>${esc(c.t)}</b><small>${esc(c.d)}</small></span>${c.k ? `<span class="kbd">${c.k}</span>` : ''}</div>`).join('') || '<div class="muted" style="padding:14px">Nichts gefunden.</div>';
    const on = $('#pall .on'); if (on) on.scrollIntoView({ block: 'nearest' });
  };
  const close = () => { w.remove(); };
  const run = c => { close(); c && c.run(); };
  const q = $('#palq');
  q.oninput = () => { const t = q.value.toLowerCase().trim().split(/\s+/); list = all.filter(c => t.every(x => (c.t + ' ' + c.d).toLowerCase().includes(x))); sel = 0; draw(); };
  q.onkeydown = e => {
    if (e.key === 'ArrowDown') { sel = Math.min(list.length - 1, sel + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter') run(list[sel]);
    else if (e.key === 'Escape') close();
  };
  w.onclick = e => { if (e.target === w) close(); const it = e.target.closest('.pi'); if (it) run(list[+it.dataset.i]); };
  draw(); q.focus();
};

QOL.keys = () => {
  const st = S ? S.settings : {};
  const rows = [['Strg + K', 'Schnellsuche'], ['1 – 9', 'Ansichten wechseln'], [st.itemTrigger === 'copy' ? 'Strg + C' : String(st.hotkeyItem || 'ALT+C').replace(/\+/g, ' + ').replace('CTRL', 'Strg').replace('ALT', 'Alt').replace('SHIFT', 'Shift'), 'Item oder Map prüfen (Maus über dem Item)'],
    [st.hotkeyToggle, 'Alle Overlays ein/aus'], [st.hotkeyHub, 'Hub öffnen'], [st.hotkeyTree, 'Skilltree-Overlay'], [st.hotkeyQuest, 'Kampagnen-Overlay'], [st.hotkeyFarm, 'Farming-Overlay'],
    [st.hotkeyQuestNext, 'Kampagne: Schritt erledigt'], [st.hotkeyQuestPrev, 'Kampagne: Schritt zurück'], [st.hotkeyHideout, 'Ins Hideout (/hideout)'],
    [st.hotkeyChat1, st.chat1], [st.hotkeyChat2, st.chat2]].map(r => r[0] && r !== undefined ? [r[0] === String(r[0]) && /^[A-Z0-9+^]+$/.test(String(r[0])) ? App.keyName(r[0]) : r[0], r[1]] : r);
  App.ask('Tastenkürzel', { ok: 'Schließen', cancel: 'Einstellungen', detail: '' }).then(ok => { if (!ok) location.hash = 'settings'; });
  const m = document.querySelector('.modal .mt');
  if (m) m.insertAdjacentHTML('afterend', `<div class="keys">${rows.filter(r => r[0] && r[1]).map(r => `<span>${String(r[0]).split(' ').map(k => k === '+' || k === '–' ? k : `<span class="kbd">${esc(k)}</span>`).join(' ')}</span><span>${esc(r[1])}</span>`).join('')}</div>`);
};

document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || '')) || document.querySelector('.modal-bg,.pal-bg');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); QOL.open(); return; }
  if (typing || e.ctrlKey || e.altKey || e.metaKey) return;
  const n = parseInt(e.key, 10);
  const views = NAV.filter(Boolean);
  if (n >= 1 && n <= views.length) location.hash = views[n - 1][0];
  else if (e.key === '?') QOL.keys();
});
