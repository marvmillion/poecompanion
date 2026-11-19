function LK() { const p = (typeof activeProfile === 'function' && activeProfile()) || {}; return p.game === 'poe2' ? 'stashLeague2' : 'stashLeague'; }
// PoE Companion – Stash & Farming
const Farm = {
  dv(c, d, digits = 2) { d = d || 1; const v = c / d; return (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(digits)).replace('.', ','); },
  chaos(c) { return Math.abs(c) < 10 && c % 1 ? c.toFixed(1).replace('.', ',') : App.full(Math.round(c)); },
  dauer(sek) { sek = Math.max(0, Math.floor(sek)); const h = Math.floor(sek / 3600), m = Math.floor(sek / 60) % 60, s = sek % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); },
  icon(it, size = 34) {
    return it.icon ? `<img class="ficon" src="${App.esc(it.icon)}" width="${size}" height="${size}" loading="lazy" alt="">` : `<span class="ficon ph" style="width:${size}px;height:${size}px">${App.icon('coin', size * .55)}</span>`;
  },
  curve(pts, w = 640, h = 170) {
    if (!pts || pts.length < 2) return `<div class="empty" style="height:${h}px"><div><b>Kurve folgt</b>nach der ersten Abrechnung</div></div>`;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x1 = Math.max(...xs) || 1, y0 = Math.min(0, ...ys), y1 = Math.max(1, ...ys);
    const X = x => 8 + (x / x1) * (w - 16), Y = y => h - 18 - ((y - y0) / (y1 - y0 || 1)) * (h - 36);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
    const area = d + ` L${X(pts[pts.length - 1][0]).toFixed(1)} ${Y(0).toFixed(1)} L${X(0)} ${Y(0).toFixed(1)} Z`;
    const last = pts[pts.length - 1], up = last[1] >= 0;
    const col = up ? 'var(--good)' : 'var(--bad)';
    return `<svg viewBox="0 0 ${w} ${h}" class="fcurve" preserveAspectRatio="none">
      <defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${up ? '#7cc4a8' : '#ef5a4c'}" stop-opacity=".35"/><stop offset="1" stop-color="${up ? '#7cc4a8' : '#ef5a4c'}" stop-opacity="0"/></linearGradient></defs>
      <line x1="0" x2="${w}" y1="${Y(0)}" y2="${Y(0)}" stroke="rgba(255,255,255,.12)" stroke-dasharray="4 5"/>
      <path d="${area}" fill="url(#fg)"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round"/>
      ${pts.map(p => `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3" fill="${col}"/>`).join('')}
      <text x="${w - 8}" y="14" text-anchor="end" fill="var(--dim)" font-size="11">${Farm.dauer(x1)}</text></svg>`;
  },
  spark(hist, w = 300, h = 54) {
    if (!hist || hist.length < 2) return '';
    const pts = hist.slice(-40).map(x => x[1] / (x[2] || 1));
    const a = Math.min(...pts), b = Math.max(...pts);
    const d = pts.map((v, i) => (i ? 'L' : 'M') + (i / (pts.length - 1) * w).toFixed(1) + ' ' + (h - 4 - (v - a) / ((b - a) || 1) * (h - 8)).toFixed(1)).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="var(--gold)" stroke-width="2"/></svg>`;
  },
  wf: { q: '', tab: '', min: 0, verlauf: false },
  // Stash-Wert im Stil eines Truhen-Trackers: Verlauf, Aufteilung, Snapshot-Liste
  wert(F, sc, ohneAcc) {
    const esc = App.esc, poe2 = LK() === 'stashLeague2';
    const erf = poe2 ? Farm.erfKarte(F) : '';
    if (!sc) return erf + (poe2 ? '' :  `<div class="tk-leer">${App.icon('coin', 40)}<div><b>Noch kein Snapshot</b>${ohneAcc ? 'Dafür brauchst du ein Profil mit Account (nicht nur einen Build-Link) und deine POESESSID in den Einstellungen.' : 'Klick oben auf „Stash bewerten“ – das dauert je nach Anzahl Tabs bis zu einer Minute.'}</div></div>`);
    const dv = sc.divine || 1, W = Farm.wf;
    const H = (F.history || []).filter(h => !sc.league || !h[3] || h[3] === sc.league);
    // Verlauf
    const w = 560, h = 170, pts = H.map(x => [x[0], x[1] / (x[2] || dv)]);
    let chart = '<div class="tk-nd">Der Verlauf erscheint ab dem zweiten Snapshot.</div>';
    if (pts.length >= 2) {
      const t0 = pts[0][0], t1 = pts[pts.length - 1][0] || t0 + 1, ys = pts.map(p => p[1]), y0 = Math.min(...ys) * .96, y1 = Math.max(...ys) * 1.03 || 1;
      const X = t => 40 + (t - t0) / ((t1 - t0) || 1) * (w - 52), Y = v => h - 22 - (v - y0) / ((y1 - y0) || 1) * (h - 36);
      const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
      const grid = [0, .5, 1].map(f => { const v = y0 + (y1 - y0) * f; return `<line x1="40" x2="${w - 8}" y1="${Y(v)}" y2="${Y(v)}" class="tk-gl"/><text x="34" y="${Y(v) + 4}" text-anchor="end" class="tk-ax">${Farm.dv(v * dv, dv, 1)}</text>`; }).join('');
      const tag = t => new Date(t * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      chart = `<svg viewBox="0 0 ${w} ${h}" class="tk-svg">${grid}
        <path d="${d} L${X(t1)} ${h - 22} L${X(t0)} ${h - 22}Z" class="tk-fl"/><path d="${d}" class="tk-ln"/>
        <circle cx="${X(t1)}" cy="${Y(pts[pts.length - 1][1])}" r="3.5" class="tk-pt"/>
        <text x="40" y="${h - 5}" class="tk-ax">${tag(t0)}</text><text x="${w - 8}" y="${h - 5}" text-anchor="end" class="tk-ax">${tag(t1)}</text></svg>`;
    }
    const diff = H.length >= 2 ? (H[H.length - 1][1] - H[0][1]) / dv : 0;
    // Aufteilung (Donut) nach Tab
    const farben = ['#c9a24a', '#8a6a33', '#d9c38e', '#6f8f5b', '#4f7591', '#9b5a4a', '#7a6a9a', '#a07d3a', '#55524a'];
    const tabs = sc.tabs.slice(0, 8), rest = sc.tabs.slice(8).reduce((a, t) => a + t[1], 0), segs = rest > 0 ? [...tabs, ['Rest', rest]] : tabs;
    const tot = segs.reduce((a, t) => a + t[1], 0) || 1; let acc = 0;
    const R = 54, C = 2 * Math.PI * R;
    const donut = `<svg viewBox="0 0 140 140" class="tk-don"><circle cx="70" cy="70" r="${R}" fill="none" stroke="#1d1710" stroke-width="20"/>${segs.map((t, i) => { const l = t[1] / tot * C, o = acc; acc += l; return `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${farben[i % farben.length]}" stroke-width="20" stroke-dasharray="${l.toFixed(2)} ${(C - l).toFixed(2)}" stroke-dashoffset="${(-o).toFixed(2)}" transform="rotate(-90 70 70)"><title>${esc(t[0])}: ${Farm.dv(t[1], dv, 1)} div</title></circle>`; }).join('')}
      <text x="70" y="68" text-anchor="middle" class="tk-dv">${Farm.dv(sc.total, dv, 0)}</text><text x="70" y="84" text-anchor="middle" class="tk-ax">Divine</text></svg>`;
    const legende = segs.map((t, i) => `<div class="tk-lg"><i style="background:${farben[i % farben.length]}"></i><span>${esc(t[0])}</span><b>${Math.round(t[1] / tot * 100)} %</b></div>`).join('');
    // Liste
    const q = W.q.toLowerCase();
    const L = (sc.top || []).filter(x => (!q || x.n.toLowerCase().includes(q)) && (!W.tab || x.tab === W.tab) && x.sum / dv >= W.min);
    const verlauf = W.verlauf && H.length ? `<div class="tk-vl"><h4>Frühere Snapshots</h4>${H.slice(-15).reverse().map((x, i, A) => { const n = A[i + 1], d2 = n ? (x[1] - n[1]) / dv : 0; return `<div class="tk-vr"><span>${datum(x[0])}</span><b>${Farm.dv(x[1], x[2] || dv, 1)} div</b><em class="${d2 >= 0 ? 'good' : 'bad'}">${n ? (d2 >= 0 ? '+' : '') + Farm.dv(d2, 1, 1) : ''}</em></div>`; }).join('')}</div>` : '';
    return `${erf}<div class="tk">
      <div class="tk-g2">
        <div class="tk-p"><div class="tk-ph"><div><h4>Stash-Wert im Zeitverlauf</h4><span>Gesamtwert pro Snapshot in Divine</span></div><div class="tk-big">${Farm.dv(sc.total, dv, 1)} <small>div</small>${H.length >= 2 ? `<em class="${diff >= 0 ? 'good' : 'bad'}">${diff >= 0 ? '+' : ''}${Farm.dv(diff, 1, 1)}</em>` : ''}</div></div>${chart}</div>
        <div class="tk-p"><div class="tk-ph"><div><h4>Wertaufteilung</h4><span>Nach Stash-Tab im letzten Snapshot</span></div></div><div class="tk-dw">${donut}<div class="tk-lgw">${legende}</div></div></div>
      </div>
      ${Farm.vergleich(F, dv)}
      <div class="tk-p tk-list">
        <div class="tk-ph"><div><h4>Snapshot</h4><span>Erfasst ${datum(sc.t)} · ${App.full(sc.count)} Items · 1 Divine = ${Farm.chaos(dv)} ${App.wk()}</span></div><button class="btn small ${W.verlauf ? 'on' : ''}" id="tkvl">${W.verlauf ? 'Verlauf ausblenden' : 'Verlauf anzeigen'}</button></div>
        ${verlauf}
        <div class="tk-f"><input id="tkq" placeholder="Gegenstände suchen …" value="${esc(W.q)}" autocomplete="off">
          <select id="tkt"><option value="">Alle Tabs</option>${sc.tabs.map(t => `<option value="${esc(t[0])}" ${W.tab === t[0] ? 'selected' : ''}>${esc(t[0])}</option>`).join('')}</select>
          <select id="tkm">${[[0, 'Jeder Wert'], [0.1, 'ab 0,1 div'], [1, 'ab 1 div'], [10, 'ab 10 div']].map(([v, l]) => `<option value="${v}" ${+W.min === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <table class="tk-t"><thead><tr><th>Gegenstand</th><th>Tab</th><th>Anzahl</th><th>Einzelwert</th><th>Gesamtwert</th></tr></thead><tbody>
          ${L.slice(0, 150).map(x => `<tr><td><div class="tk-n">${Farm.icon(x, 26)}<span class="f${x.f}">${esc(x.n)}</span></div></td><td class="tk-tb">${esc(x.tab || '')}${x.ntab > 1 ? ` <small>+${x.ntab - 1}</small>` : ''}</td><td>${App.full(x.q)}</td><td>${Farm.chaos(x.c)} ${App.wk()}</td><td><b>${Farm.dv(x.sum, dv)}</b> <small>div</small></td></tr>`).join('') || `<tr><td colspan="5" class="tk-nd">Nichts gefunden.</td></tr>`}
        </tbody></table>
        ${(sc.rares || []).length ? `<div class="tk-rh"><h4>Rares, Juwelen & Uniques · Marktcheck</h4><span>Jedes Item einzeln mit dem Preis-Check geschätzt (ähnliche Angebote auf der Trade-Seite) · zusammen <b>${Farm.dv(sc.rares.reduce((a, r) => a + r.c, 0), dv, 1)} div</b></span></div>
        <table class="tk-t"><thead><tr><th>Gegenstand</th><th>Tab</th><th>Spanne</th><th>Sicherheit</th><th>Geschätzt</th></tr></thead><tbody>
          ${sc.rares.filter(x => (!q || (x.n + ' ' + (x.base || '')).toLowerCase().includes(q)) && (!W.tab || x.tab === W.tab)).slice(0, 100).map(x => `<tr><td><div class="tk-n"><span class="f${x.f}">${esc(x.n)}</span>${x.base && x.base !== x.n ? `<small>${esc(x.base)}</small>` : ''}</div></td><td class="tk-tb">${esc(x.tab)}</td><td>${x.lo != null ? Farm.chaos(x.lo) + '–' + Farm.chaos(x.hi) + ' ' + App.wk() : ''}</td><td><span class="tk-s ${esc(x.sicher || '')}">${esc({ gut: 'Hoch', grob: 'Mittel', unsicher: 'Niedrig' }[x.sicher] || x.sicher || '')}</span>${x.n_ang ? ` <small>${x.n_ang} Angebote</small>` : ''}</td><td>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener"><b>${Farm.chaos(x.c)} ${App.wk()}</b></a>` : `<b>${Farm.chaos(x.c)} ${App.wk()}</b>`}</td></tr>`).join('')}
        </tbody></table>` : ''}
        <div class="tk-hint">Bewertet werden Currency, Fragmente, Essenzen, Runen, Uniques, Gems und Maps nach poe.ninja. Rares, Juwelen und Uniques ohne festen Preis schätzt der Marktcheck einzeln, sobald du sie per Strg+C erfasst hast.</div>
      </div></div>`;
  },
  vg: { a: null, b: null, alle: false },
  // Vorher/Nachher: zwei Snapshots gegenüberstellen (z. B. vor und nach einer Breach-Runde)
  vergleich(F, dv) {
    const esc = App.esc, L = F.snaps || [];
    const kopf = `<div class="tk-ph"><div><h4>Vorher / Nachher</h4><span>Zwei Snapshots vergleichen – z. B. vor und nach einer Farm-Runde</span></div></div>`;
    if (L.length < 2) return `<div class="tk-p tk-vg">${kopf}<div class="tk-nd" style="text-align:left;padding:6px 0">So geht's: vor dem Farmen deine Tabs erfassen und <b>Snapshot speichern</b>. Nach der Runde nur die geänderten Tabs (z. B. Currency) neu erfassen und wieder speichern. Hier erscheint dann, was du verdient hast.${L.length ? ' Ein Snapshot ist schon da – es fehlt noch der zweite.' : ''}</div></div>`;
    const V = Farm.vg, n = L.length;
    const ia = V.a != null && V.a < n ? V.a : n - 2, ib = V.b != null && V.b < n ? V.b : n - 1;
    const A = L[ia], B = L[ib], d = B.dv || dv || 1;
    const zeit = t => new Date(t * 1000).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const opts = sel => L.map((s, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${zeit(s.t)} · ${Farm.dv(s.total, s.dv || d, 1)} div</option>`).join('');
    const namen = new Set([...Object.keys(A.items || {}), ...Object.keys(B.items || {})]);
    const diff = [...namen].map(nm => { const a = (A.items || {})[nm] || [0, 0], b = (B.items || {})[nm] || [0, a[1]]; const c = b[1] || a[1]; return { n: nm, a: a[0], b: b[0], dq: b[0] - a[0], dw: b[0] * (b[1] || 0) - a[0] * (a[1] || 0), c }; })
      .filter(x => Math.abs(x.dw) >= 0.5 || x.dq).sort((x, y) => Math.abs(y.dw) - Math.abs(x.dw));
    const gewinn = (B.total - A.total) / d, std = Math.max(1 / 60, (B.t - A.t) / 3600), proStd = gewinn / std;
    const plus = diff.filter(x => x.dw > 0).reduce((s, x) => s + x.dw, 0) / d, minus = diff.filter(x => x.dw < 0).reduce((s, x) => s + x.dw, 0) / d;
    const sz = v => `<span class="${v >= 0 ? 'good' : 'bad'}">${v >= 0 ? '+' : ''}${Farm.dv(v * d, d, 2)}</span>`;
    const zeigen = V.alle ? diff : diff.slice(0, 12);
    return `<div class="tk-p tk-vg">${kopf}
      <div class="tk-vgw"><label>Vorher <select id="vga">${opts(ia)}</select></label><span class="tk-pf">→</span><label>Nachher <select id="vgb">${opts(ib)}</select></label></div>
      <div class="tk-vgk">
        <div><span>Gewinn</span><b class="${gewinn >= 0 ? 'good' : 'bad'}">${gewinn >= 0 ? '+' : ''}${Farm.dv(gewinn * d, d, 2)} <small>div</small></b></div>
        <div><span>Dauer</span><b>${std >= 1 ? std.toFixed(1).replace('.', ',') + ' h' : Math.round(std * 60) + ' min'}</b></div>
        <div><span>Pro Stunde</span><b>${Farm.dv(proStd * d, d, 1)} <small>div/h</small></b></div>
        <div><span>Dazu / weg</span><b><span class="good">+${Farm.dv(plus * d, d, 1)}</span> / <span class="bad">${Farm.dv(minus * d, d, 1)}</span></b></div>
      </div>
      ${diff.length ? `<table class="tk-t"><thead><tr><th>Gegenstand</th><th>Vorher</th><th>Nachher</th><th>Änderung</th><th>Wert</th></tr></thead><tbody>
        ${zeigen.map(x => `<tr><td>${esc(x.n)}</td><td>${App.full(x.a)}</td><td>${App.full(x.b)}</td><td class="${x.dq >= 0 ? 'good' : 'bad'}">${x.dq > 0 ? '+' : ''}${App.full(x.dq)}</td><td>${sz(x.dw / d)} <small>div</small></td></tr>`).join('')}
        </tbody></table>${diff.length > 12 ? `<button class="btn small ghost" id="vgall" style="margin-top:8px">${V.alle ? 'Weniger zeigen' : 'Alle ' + diff.length + ' Änderungen zeigen'}</button>` : ''}`
        : '<div class="tk-nd">Zwischen diesen beiden Snapshots hat sich nichts geändert.</div>'}
      ${A.items && Object.keys(A.items).length < 3 ? '<div class="tk-hint">Ältere Snapshots enthalten noch keine Einzel-Items – der Vergleich wird ab dem nächsten Snapshot vollständig.</div>' : ''}
    </div>`;
  },
  erfKarte(F) {
    const esc = App.esc, E = F.erf || { tabs: {} }, tabs = Object.entries(E.tabs || {});
    const vorschlag = ['Currency', 'Essenzen', 'Omen', 'Runen & Soul Cores', 'Fragmente', 'Uniques', 'Dump'];
    return `<div class="tk-p tk-erf ${E.aktiv ? 'an' : ''}">
      <div class="tk-ph"><div><h4>Stash erfassen</h4><span>PoE 2 gibt den Stash nicht über pathofexile.com heraus – deshalb erfasst du ihn einmal selbst im Spiel.</span></div>
        <button class="btn ${E.aktiv ? '' : 'primary'}" id="erfgo">${E.aktiv ? 'Erfassung beenden' : 'Erfassung starten'}</button></div>
      <ol class="tk-steps"><li>Tab im Spiel öffnen und unten den passenden Namen wählen.</li><li>Mit der Maus über jedes Item fahren und <b>Strg+C</b> drücken. Ein kurzer Ton bestätigt jedes Item.</li><li>Fertig? <b>Snapshot speichern</b> – der Wert landet im Verlauf. Beim nächsten Mal nur die Tabs neu erfassen, die sich geändert haben.</li></ol>
      <div class="tk-erfz">
        <label>Aktueller Tab <input id="erftab" list="erftabs" value="${esc(E.tab || 'Currency')}" autocomplete="off"></label><datalist id="erftabs">${vorschlag.map(v => `<option value="${esc(v)}">`).join('')}</datalist>
        <div class="tk-chips">${tabs.length ? tabs.map(([k, v]) => `<span class="tk-chip ${k === E.tab ? 'on' : ''}" data-erftab="${esc(k)}">${esc(k)} <small>${v.n} Items</small><button data-erfweg="${esc(k)}" title="Tab leeren">×</button></span>`).join('') : '<span class="muted">Noch nichts erfasst.</span>'}</div>
      </div>
      <div class="tk-erff"><span class="tk-letzt">${E.aktiv ? (E.letzt ? 'Zuletzt: <b>' + esc(E.letzt) + '</b>' : 'Wartet auf Strg+C im Spiel …') : 'Während die Erfassung läuft, öffnet Strg+C kein Preis-Fenster.'}</span>
        <button class="btn small primary" id="erfsnap" ${tabs.length && !(F.status && F.status.busy) ? '' : 'disabled'}>Snapshot speichern</button></div></div>`;
  },
  rows(list, d, neg) {
    if (!list || !list.length) return `<div class="muted" style="padding:10px 2px">${neg ? 'Noch nichts verbraucht.' : 'Noch nichts dazugekommen.'}</div>`;
    return list.map(x => `<div class="frow2">${Farm.icon(x, 30)}<div class="fn"><b>${App.esc(x.n)}</b><span>${x.q > 0 ? '+' : ''}${App.full(x.q)} × ${Farm.chaos(x.c)} ${App.wk()}</span></div><div class="fv ${neg ? 'bad' : 'good'}">${x.sum > 0 ? '+' : ''}${Farm.dv(x.sum, d)}<small> div</small></div></div>`).join('');
  },
};

let stashTimer = null;
let stashTab = (() => { try { return localStorage.getItem('stashTab') || 'farm'; } catch (e) { return 'farm'; } })();
function stash(force) {
  const el = sec('stash'), F = S.farm;
  if (!F) { el.innerHTML = ''; return; }
  const p = activeProfile();
  const key = 'st' + stashTab + JSON.stringify([Ledger.v, F.ledger.length, F.sessions.length, F.status, F.hasSessid, F.tabs, F.scan && F.scan.t, F.erf, (F.snaps || []).length, F.session && [F.session.active, F.session.tLast, F.session.maps], F.sessions.length, F.logPath, F.strategies, F.strat, Strat.edit, S.settings.stashInterval, S.settings.stashInventory, S.settings.stashLeague, S.settings.stashLeague2, S.settings.stashMapPrice, S.settings.stashAutoScan, p && p.id]);
  if (lastKey.stash === key && !force) return; lastKey.stash = key;
  const keep = {}; el.querySelectorAll('input[id]').forEach(i => { if (i.type !== 'checkbox') keep[i.id] = i.value; });
  const ss = F.session, d = (ss && ss.divine) || F.divine || (F.scan && F.scan.divine) || 0;
  const st = F.status;
  const busyBar = st.busy ? `<div class="fbusy"><span class="spin">${icon('refresh', 15)}</span><span>${esc(st.text || 'Arbeite…')}</span><div class="bar"><i style="width:${Math.round((st.progress || 0) * 100)}%"></i></div></div>` : '';
  const err = st.error ? `<div class="alert bad pop">${icon('warn', 16)}<div><b>Hinweis</b>${esc(st.error)}</div></div>` : '';
  const ohneAcc = !p || p.mode === 'link';

  // ---- Session-Karte
  let sessHtml;
  const craft = ss && ss.mode === 'craft';
  if (!ss) {
    sessHtml = `<div class="fstart">
      <div class="fbig">${icon('bolt', 34)}</div>
      <div><h2>Farming-Session</h2><div class="muted">Drück <b>Start</b>, bevor du losfarmst. Der Companion merkt sich deinen Stash und dein Inventar als Nullpunkt und rechnet dann alle ${S.settings.stashInterval || 5} Minuten nach:<br>
      was du <b class="bad">ausgegeben</b> hast (Maps, Scarabs, Currency) und was du <b class="good">eingenommen</b> hast – als Gewinn pro Stunde in Divine.</div></div>
      <button class="btn primary big" id="fgo" ${(!F.hasSessid || ohneAcc || st.busy) ? 'disabled' : ''}>${icon('bolt', 18)} Session starten</button></div>`;
  } else {
    const live = ss.active;
    const mp = ss.maps || {}, n = mp.count || 0;
    const perMap = n ? ss.profit / n : 0, costMap = n ? ss.spent / n : 0;
    sessHtml = `<div class="fhead"><div><div class="cls">${live ? '<span class="livedot"></span> ' : ''}${craft ? 'Handels-Session' : 'Farming-Session'} ${live ? 'läuft' : 'beendet'}, ${esc(ss.league || '')}</div>
        <div class="ftime" id="ftime" data-t0="${ss.t0}" data-end="${ss.tEnd || ''}">${Farm.dauer((ss.tEnd || Date.now() / 1000) - ss.t0)}</div></div>
        <div class="fph ${ss.perHour >= 0 ? 'good' : 'bad'}"><b>${ss.perHour >= 0 ? '+' : ''}${Farm.dv(ss.perHour, d)}</b><span>Divine pro Stunde${live && Date.now() / 1000 - ss.t0 < 900 ? ' · vorläufig' : ''}</span><small>${ss.perHour >= 0 ? '+' : ''}${Farm.chaos(ss.perHour)} ${App.wl()}/h</small></div></div>
      <div class="fkpis">
        <div><span>Gewinn</span><b class="${ss.profit >= 0 ? 'good' : 'bad'}">${ss.profit >= 0 ? '+' : ''}${Farm.dv(ss.profit, d)} div</b><small>${Farm.chaos(ss.profit)} ${App.wk()}</small></div>
        <div><span>${craft ? 'Erhalten' : 'Einnahmen'}</span><b class="good">+${Farm.dv(ss.earned, d)} div</b><small>${Farm.chaos(ss.earned)} ${App.wk()}</small></div>
        <div><span>${craft ? 'Eingesetzt' : 'Ausgaben'}</span><b class="bad">−${Farm.dv(ss.spent, d)} div</b><small>${Farm.chaos(ss.spent)} ${App.wk()}</small></div>
        ${craft ? `<div><span>Stash jetzt</span><b>${Farm.dv(ss.value, d, 1)} div</b><small>Start ${Farm.dv(ss.startValue, d, 1)} div</small></div>
        <div><span>Rendite</span><b class="${ss.profit >= 0 ? 'good' : 'bad'}">${ss.spent ? (ss.profit / ss.spent * 100 >= 0 ? '+' : '') + Math.round(ss.profit / ss.spent * 100) + ' %' : '–'}</b><small>Gewinn / Einsatz</small></div>`
        : `<div><span>Maps</span><b>${n}</b><small>${mp.avg ? 'Ø ' + Farm.dauer(mp.avg) + ' pro Map' : ss.logFound ? 'warte auf erste Map' : 'Spiel-Log nicht gefunden'}</small></div>
        <div><span>Pro Map</span><b class="${perMap >= 0 ? 'good' : 'bad'}">${n ? (perMap >= 0 ? '+' : '') + Farm.chaos(perMap) + ' c' : '–'}</b><small>${n ? 'Kosten Ø ' + Farm.chaos(costMap) + ' c' : ''}</small></div>`}
      </div>
      <div class="fcurvebox">${Farm.curve(ss.curve)}</div>
      <div class="fbar2">
        ${live ? `<span class="muted" id="fnext" data-next="${Date.now() / 1000 + (ss.nextTick || 0)}">Nächste Abrechnung in …</span>
          <span class="muted">${mp.zone ? '· Zone: ' + esc(mp.zone) : ''}</span>
          <button class="btn small" id="ftick" style="margin-left:auto" ${st.busy ? 'disabled' : ''}>${icon('refresh', 15)} Jetzt abrechnen</button>
          <button class="btn small danger" id="fstop">${icon('x', 15)} Stop</button>`
        : `<span class="muted">Beendet ${datum(ss.tEnd)}</span><button class="btn small" id="freset" style="margin-left:auto">Schließen</button><button class="btn small primary" id="fgo" ${st.busy ? 'disabled' : ''}>${icon('bolt', 15)} Neue Session</button>`}
      </div>`;
  }

  // ---- Stash-Wert
  const sc = F.scan;
  const wertHtml = Farm.wert(F, sc, ohneAcc);

  // ---- Einstellungen
  const tabsHtml = F.tabs.length ? F.tabs.filter(t => !t.folder).map(t => `<label class="ftchip${t.on ? ' on' : ''}" style="--tc:${t.color}"><input type="checkbox" data-tab="${esc(t.id)}" ${t.on ? 'checked' : ''}><i></i>${esc(t.n)}${/Map|Unique/.test(t.type) ? ' <small>⚠</small>' : ''}</label>`).join('') : '<span class="muted">Tabs werden nach dem Speichern der POESESSID geladen.</span>';
  const setHtml = `<h3>Stash-Einstellungen</h3>
    <div class="set"><div><b>POESESSID</b><span>${F.hasSessid ? '<span class="good">gespeichert</span> – nur lokal auf deinem PC, wird nur an pathofexile.com geschickt' : 'nötig, damit der Companion deinen Stash lesen darf'}</span></div>
      <div style="display:flex;gap:8px"><input id="fsid" type="password" placeholder="${F.hasSessid ? '•••••••• (neu eintragen)' : '32 Zeichen einfügen'}" autocomplete="off" style="width:240px"><button class="btn small primary" id="fsidsave">Speichern</button>${F.hasSessid ? '<button class="btn small ghost danger" id="fsiddel" title="Löschen">' + icon('trash', 14) + '</button>' : ''}</div></div>
    <div class="set"><div><b>Liga</b><span>leer = Liga deines Charakters (${esc(LK() === 'stashLeague2' ? ((typeof activeProfile === 'function' && activeProfile()) || {}).league || (S.char && S.char.info && S.char.info.league) || '–' : (S.char && S.char.info && S.char.info.league || '–'))}) · gilt nur für ${LK() === 'stashLeague2' ? 'PoE 2' : 'PoE 1'}</span></div><input id="fleague" placeholder="automatisch" value="${esc(S.settings[LK()] || '')}" style="width:200px"></div>
    <div class="set"><div><b>Stash-Wert automatisch aktualisieren</b><span>alle X Minuten, 0 = aus (während einer Farming-Session rechnet die Session)</span></div><input id="fauto" type="number" min="0" max="120" value="${S.settings.stashAutoScan ?? 10}" style="width:90px"></div>
    <div class="set"><div><b>Abrechnung alle</b><span>Minuten (GGG erlaubt nur wenige Abrufe – 5 ist ein guter Wert)</span></div><input id="fint" type="number" min="2" max="60" value="${S.settings.stashInterval || 5}" style="width:90px"></div>
    <div class="set"><div><b>Preis für normale Maps</b><span>${App.wl()} pro Map – poe.ninja führt normale Maps nicht mehr, damit zählen deine Map-Kosten trotzdem</span></div><input id="fmap" type="number" min="0" step="0.5" value="${S.settings.stashMapPrice || 0}" style="width:90px"></div>
    <div class="set"><div><b>Inventar mitzählen</b><span>Loot im Rucksack zählt in der Session sofort mit</span></div><div class="sw ${S.settings.stashInventory !== false ? 'on' : ''}" id="finv"></div></div>
    <div class="set"><div><b>Spiel-Log (Maps zählen)</b><span>${F.logPath ? '<span class="good">gefunden:</span> ' + esc(F.logPath) : '<span class="warn">nicht gefunden</span> – Pfad zur Client.txt im PoE-Ordner „logs“ eintragen'}</span></div><input id="flog" placeholder="automatisch" value="${esc(S.settings.clientLog || '')}" style="width:240px"></div>
    <div style="margin-top:14px;display:flex;align-items:center;gap:10px"><b style="font-size:13.5px">Tabs</b><span class="muted" style="font-size:12px">Nur ausgewählte werden gelesen – weniger Tabs = schnellere Abrechnung. ⚠ = Map-/Unique-Tabs liefert GGG nur unvollständig.</span>
      <span style="margin-left:auto;display:flex;gap:6px"><button class="btn small ghost" id="fall">alle</button><button class="btn small ghost" id="fnone">keine</button><button class="btn small" id="ftabs">${icon('refresh', 14)} neu laden</button></span></div>
    <div class="ftabs">${tabsHtml}</div>`;

  // ---- frühere Sessions
  const sessTable = (mode) => {
    const hist = F.sessions.filter(h => (h.mode || 'farm') === mode).slice().reverse();
    if (!hist.length) return '';
    return `<div class="card pad" style="margin-top:18px"><h3>Frühere Sessions</h3><table class="ftable"><tr><th>Start</th><th>Dauer</th>${mode === 'farm' ? '<th>Maps</th>' : ''}<th>${mode === 'farm' ? 'Ausgaben' : 'Eingesetzt'}</th><th>Gewinn</th><th>pro Stunde</th><th>Top</th></tr>
    ${hist.map(h => `<tr><td>${datum(h.t0)}</td><td>${Farm.dauer(h.tEnd - h.t0)}</td>${mode === 'farm' ? `<td>${h.maps}</td>` : ''}<td class="bad">−${Farm.dv(h.spent, h.divine)}</td><td class="${h.profit >= 0 ? 'good' : 'bad'}">${h.profit >= 0 ? '+' : ''}${Farm.dv(h.profit, h.divine)} div</td><td class="${h.perHour >= 0 ? 'good' : 'bad'}"><b>${Farm.dv(h.perHour, h.divine)} div/h</b></td><td class="muted">${esc((h.top || []).join(', '))}</td></tr>`).join('')}</table></div>`;
  };
  const bilanz = ss && craft ? `<div class="grid2" style="margin-top:18px;align-items:start">
      <div class="card pad"><h3>Currency-Bilanz <span class="r muted">Stückzahl seit Start</span></h3>${(ss.currency || []).length ? `<div class="cbil">${ss.currency.map(x => `<div class="${x.q > 0 ? 'p' : 'n'}">${Farm.icon(x, 26)}<span>${esc(x.n)}</span><b>${x.q > 0 ? '+' : ''}${App.full(x.q)}</b><small>${x.sum > 0 ? '+' : ''}${Farm.dv(x.sum, d)} div</small></div>`).join('')}</div>` : '<div class="muted">Noch keine Veränderung – nach der nächsten Abrechnung siehst du hier, wie viel Chaos, Divine, Exalted usw. du eingesetzt oder bekommen hast.</div>'}</div>
      <div class="card pad"><h3>Ohne Marktpreis <span class="r muted">z. B. gecraftete Rares</span></h3>${(ss.unpriced || []).length ? ss.unpriced.map(x => `<div class="frow2">${Farm.icon(x, 26)}<div class="fn"><b>${esc(x.n)}</b><span>${x.q > 0 ? 'neu dazugekommen' : 'weg (verkauft oder verbraucht)'}</span></div><div class="fv">${x.q > 0 ? '+' : ''}${x.q}</div></div>`).join('') : '<div class="muted">Keine Items ohne Preis verändert.</div>'}
        <div class="muted" style="font-size:12px;margin-top:8px">Rares haben keinen festen Preis. Verkaufst du sie, zählt der Erlös automatisch als „erhalten“.</div></div></div>` : '';
  const gc = ss ? `<div class="grid2" style="margin-top:18px;align-items:start"><div class="card pad"><h3>${craft ? 'Erhalten' : 'Einnahmen'} <span class="r good">+${Farm.dv(ss.earned, d)} div</span></h3>${Farm.rows(ss.gains, d)}</div><div class="card pad"><h3>${craft ? 'Eingesetzt' : 'Ausgaben'} <span class="r bad">−${Farm.dv(ss.spent, d)} div</span></h3>${Farm.rows(ss.costs, d, true)}</div></div>` : '';
  const T = stashTab;
  const startCraft = `<div class="fstart"><div class="fbig">${icon('gem', 34)}</div><div><h2>Handels- & Crafting-Session</h2><div class="muted">Für Hideout-Warrior: Start merkt sich deinen Stash. Danach siehst du, was du beim Crafting, beim Händler, im Currency Exchange oder beim Handeln <b class="bad">eingesetzt</b> und <b class="good">erhalten</b> hast – und wie viel Gewinn pro Stunde dabei herauskommt.</div></div>
      <button class="btn primary big" id="fgoc" ${(!F.hasSessid || ohneAcc || st.busy) ? 'disabled' : ''}>${icon('gem', 18)} Session starten</button></div>`;
  let body = '';
  const mapLog = ss && !craft && (ss.mapList || []).length ? (() => {
    const L = ss.mapList.slice().reverse().slice(0, 40), dur = m => Math.max(0, (m.t1 || m.t0) - m.t0), max = Math.max(1, ...L.map(dur));
    return `<div class="card pad" style="margin-top:18px"><h3>Map-Protokoll <span class="r muted">${ss.mapList.length} Maps${(ss.maps && ss.maps.deaths) ? ' · ☠ ' + ss.maps.deaths : ''}</span></h3>
      ${L.map(m => `<div class="mlog"><span class="mt">${new Date(m.t0 * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span><span class="mn2">${esc(m.n)}</span><div class="mb"><i style="width:${dur(m) / max * 100}%"></i></div><b>${Farm.dauer(dur(m))}</b><span class="md">${m.d ? '☠ ' + m.d : ''}</span></div>`).join('')}</div>`; })() : '';
  if (T === 'farm') body = (craft ? `<div class="card pad"><div class="muted">Gerade läuft eine Handels-Session. <a href="#" data-st="trade">Zur Handels-Session</a></div></div>` : `<div class="card pad fsess frame">${sessHtml}</div>${gc}${mapLog}`) + sessTable('farm');
  else if (T === 'trade') body = `<div class="card pad fsess frame">${craft ? sessHtml : ss && ss.active ? '<div class="muted">Gerade läuft eine Farming-Session. Beende sie zuerst.</div>' : startCraft}</div>${craft ? bilanz + gc : ''}
      <div class="card pad" style="margin-top:18px" id="ledger">${Ledger.html()}</div>${sessTable('craft')}`;
  else if (T === 'markt') body = Markt.html();
  else if (T === 'strat') body = Strat.html(F);
  else if (T === 'stats') body = Stats.html(F);
  else if (T === 'wert') body = `<div class="card pad frame tk-kopf"><h3>Stash-Wert ${F.scan ? `<span class="r muted">${esc(F.scan.league || '')}</span>` : ''}</h3><div class="muted" style="font-size:12.5px;margin-top:-4px">Gesamtwert deines Stashs über die Zeit, aufgeteilt nach Tabs, mit jedem Gegenstand einzeln.</div></div>${wertHtml}`;
  else body = `<div class="card pad" id="fset">${setHtml}</div>`;
  const tabs = [['farm', 'Farming'], ['strat', 'Strategien'], ['trade', 'Handel & Crafting'], ['markt', 'Börse'], ['stats', 'Auswertung'], ['wert', 'Stash-Wert'], ['set', 'Einstellungen']];
  el.innerHTML = `<div class="ph"><div><h1>Stash & Farming</h1><div class="sub">Was ist dein Stash wert, und wie viel verdienst du pro Stunde wirklich – beim Mappen oder beim Handeln?</div></div>
      <div class="act"><button class="btn" id="fov">${icon('pin', 16)} Farming-Overlay</button>${LK() === 'stashLeague2' ? '' : `<button class="btn" id="fscan" ${(!F.hasSessid || ohneAcc || st.busy) ? 'disabled' : ''}>${icon('coin', 16)} Stash bewerten</button>`}</div></div>
    ${ohneAcc && LK() !== 'stashLeague2' ? `<div class="alert warn">${icon('warn', 16)}<div><b>Profil ohne Account</b>Dein Profil ist ein Build-Link. Damit die App deinen PoE-1-Stash lesen kann, trag in deinem Profil zusätzlich deinen Account-Namen ein. <a href="#profiles">Profil bearbeiten</a></div></div>` : ''}
    ${!F.hasSessid && !ohneAcc ? `<div class="alert warn">${icon('warn', 16)}<div><b>Einmalig einrichten</b>Trag unter „Einstellungen“ deine POESESSID ein: auf pathofexile.com einloggen → in Opera <b>opera://settings/cookies</b> → „Alle Cookies und Websitedaten“ → pathofexile → POESESSID → Inhalt kopieren.</div></div>` : ''}
    ${err}${busyBar}
    <div class="stabs">${tabs.map(t => `<button data-st="${t[0]}" class="${T === t[0] ? 'on' : ''}">${t[1]}${t[0] === 'trade' && craft && ss.active ? ' <span class="livedot"></span>' : t[0] === 'farm' && ss && !craft && ss.active ? ' <span class="livedot"></span>' : ''}</button>`).join('')}</div>
    ${body}`;
  el.querySelectorAll('[data-st]').forEach(b => b.onclick = e => { e.preventDefault(); stashTab = b.dataset.st; try { localStorage.setItem('stashTab', stashTab); } catch (x) {} stash(true); });
  if (T === 'trade') Ledger.bind();
  if (T === 'markt') Markt.bind();
  if (T === 'strat') Strat.bind();
  for (const k in keep) { const i = document.getElementById(k); if (i) i.value = keep[k]; }
  const A = a => api('/api/stash/action', { action: a }).then(r => { if (r && r.error) toast(r.error); });
  const on = (id, f) => { const e = document.getElementById(id); if (e) e.onclick = f; };
  on('fgo', () => A('start'));
  on('fgoc', () => A('start_craft'));
  on('fscan', () => A('scan'));
  const erfA = (b) => api('/api/stash/erf', b).then(r => { if (r && r.error) toast(r.error); }).catch(() => {});
  on('erfgo', () => erfA({ a: (F.erf && F.erf.aktiv) ? 'stop' : 'start', tab: ($('#erftab') || {}).value }));
  on('erfsnap', () => erfA({ a: 'snapshot' }));
  const erft = $('#erftab'); if (erft) erft.onchange = () => erfA({ a: 'tab', tab: erft.value });
  el.querySelectorAll('[data-erfweg]').forEach(x => x.onclick = ev => { ev.stopPropagation(); erfA({ a: 'leeren', tab: x.dataset.erfweg }); });
  el.querySelectorAll('[data-erftab]').forEach(x => x.onclick = () => erfA({ a: 'tab', tab: x.dataset.erftab }));
  const vga = $('#vga'), vgb = $('#vgb');
  if (vga) vga.onchange = () => { Farm.vg.a = +vga.value; stash(true); };
  if (vgb) vgb.onchange = () => { Farm.vg.b = +vgb.value; stash(true); };
  on('vgall', () => { Farm.vg.alle = !Farm.vg.alle; stash(true); });
  const tkq = $('#tkq'); if (tkq) { tkq.oninput = () => { Farm.wf.q = tkq.value; stash(true); const n = $('#tkq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }; }
  const tkt = $('#tkt'); if (tkt) tkt.onchange = () => { Farm.wf.tab = tkt.value; stash(true); };
  const tkm = $('#tkm'); if (tkm) tkm.onchange = () => { Farm.wf.min = +tkm.value; stash(true); };
  const tkvl = $('#tkvl'); if (tkvl) tkvl.onclick = () => { Farm.wf.verlauf = !Farm.wf.verlauf; stash(true); };
  on('ftick', () => A('tick'));
  on('fstop', () => App.ask('Session beenden?', { ok: 'Beenden und speichern', detail: 'Der Companion rechnet ein letztes Mal ab und speichert die Session unter „Frühere Sessions“.' }).then(ok => ok && A('stop')));
  on('freset', () => A('reset'));
  on('ftabs', () => A('tabs'));
  on('fov', () => api('/api/window', { name: 'farm', action: 'open' }).then(r => { if (!r.win) toast('Das Overlay gibt es nur in der Windows-App.'); }));
  on('fall', () => api('/api/stash/tabs', { all: true }));
  on('fnone', () => api('/api/stash/tabs', { all: false }));
  on('fsidsave', () => { const v = $('#fsid').value.trim(); if (!/^[0-9a-fA-F]{32}$/.test(v)) return toast('Die POESESSID besteht aus 32 Zeichen (0–9, a–f).'); api('/api/stash/secret', { poesessid: v }).then(() => { $('#fsid').value = ''; toast('Gespeichert – lade deine Tabs …'); }); });
  on('fsiddel', () => App.ask('POESESSID löschen?', { ok: 'Löschen', danger: true, detail: 'Stash-Wert und Farming funktionieren erst wieder, wenn du sie neu einträgst.' }).then(ok => ok && api('/api/stash/secret', { poesessid: '' })));
  on('finv', () => api('/api/settings', { stashInventory: !$('#finv').classList.contains('on') }));
  const chg = (id, k, f = v => v) => { const e = document.getElementById(id); if (e) e.onchange = () => api('/api/settings', { [k]: f(e.value.trim()) }).then(() => toast('Gespeichert.')); };
  chg('fleague', LK()); chg('fint', 'stashInterval', v => Math.max(2, Math.min(60, +v || 5))); chg('fauto', 'stashAutoScan', v => Math.max(0, Math.min(120, +v || 0))); chg('flog', 'clientLog'); chg('fmap', 'stashMapPrice', v => Math.max(0, +String(v).replace(',', '.') || 0));
  el.querySelectorAll('[data-tab]').forEach(c => c.onchange = () => api('/api/stash/tabs', { id: c.dataset.tab, on: c.checked }));
}

// Live-Uhr für Session-Dauer und Countdown
setInterval(() => {
  const t = document.getElementById('ftime');
  if (t && !t.dataset.end) t.textContent = Farm.dauer(Date.now() / 1000 - +t.dataset.t0);
  const n = document.getElementById('fnext');
  if (n) { const r = +n.dataset.next - Date.now() / 1000; n.textContent = r > 0 ? 'Nächste Abrechnung in ' + Farm.dauer(r) : 'Abrechnung läuft gleich …'; }
}, 1000);

show();
