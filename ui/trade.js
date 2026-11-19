// PoE Companion – Auswertung (pro Stunde / Tag / Quellen) und Handelspositionen für Hideout-Warrior
const Stats = {
  // Vermögen und Divine-Kurs über die Zeit (aus den Stash-Bewertungen)
  wirtschaft(F) {
    const H = (F.history || []).filter(x => x.length > 3 && (!F.scan || x[3] === F.scan.league));
    if (H.length < 2) return `<div class="card pad"><h3>Vermögen</h3><div class="muted">Sobald der Stash ein paar Mal bewertet wurde (passiert alle ${S.settings.stashAutoScan || 10} Minuten automatisch), siehst du hier, wie sich dein Vermögen und der Divine-Kurs entwickeln.</div></div>`;
    const pts = H.map(x => [x[0], x[1] / (x[2] || 1), x[2]]);
    const now = pts[pts.length - 1], t24 = now[0] - 86400;
    const start = pts.find(p => p[0] >= t24) || pts[0], tagStart = pts.find(p => Stats.tag(p[0]) === Stats.tag(now[0])) || pts[0];
    const d = (a, b) => b - a, f = v => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)).replace('.', ',');
    const W = 640, Hh = 150, x0 = pts[0][0], x1 = now[0] || 1;
    const line = (i, col) => { const vs = pts.map(p => p[i]), a = Math.min(...vs), b = Math.max(...vs);
      return `<path d="${pts.map((p, j) => (j ? 'L' : 'M') + ((p[0] - x0) / Math.max(1, x1 - x0) * (W - 10) + 5).toFixed(1) + ' ' + (Hh - 10 - (p[i] - a) / ((b - a) || 1) * (Hh - 24)).toFixed(1)).join(' ')}" fill="none" stroke="${col}" stroke-width="2.2"/>`; };
    const dHeute = d(tagStart[1], now[1]), dKurs = d(start[2], now[2]);
    return `<div class="card pad"><h3>Vermögen & Wirtschaft <span class="r muted">${esc(F.scan ? F.scan.league : '')}</span></h3>
      <div class="wk"><div><span>Stash-Wert</span><b>${f(now[1])} <small>div</small></b></div>
        <div><span>Heute</span><b class="${dHeute >= 0 ? 'good' : 'bad'}">${dHeute >= 0 ? '+' : ''}${f(dHeute)} <small>div</small></b></div>
        <div><span>1 Divine</span><b>${Math.round(now[2])} <small>c</small></b><small class="${dKurs >= 0 ? 'good' : 'bad'}">${dKurs >= 0 ? '+' : ''}${Math.round(dKurs)} c in 24 h</small></div>
        <div><span>Bewertungen</span><b>${H.length}</b><small>seit ${datum(pts[0][0])}</small></div></div>
      <svg viewBox="0 0 ${W} ${Hh}" style="width:100%;height:${Hh}px;margin-top:10px" preserveAspectRatio="none">${line(2, 'rgba(159,211,255,.55)')}${line(1, '#e6c992')}</svg>
      <div class="muted" style="font-size:12px"><span style="color:#e6c992">━</span> Stash-Wert in Divine &nbsp; <span style="color:#9fd3ff">━</span> Divine-Kurs in ${App.wl()} (sinkt der Kurs, steigt dein Wert in Divine)</div></div>`;
  },
  tag(t) { const d = new Date(t * 1000); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); },
  html(F) {
    const S0 = F.sessions.filter(h => h.tEnd && h.t0);
    const wirt = Stats.wirtschaft(F);
    if (!S0.length) return wirt + `<div class="card pad" style="margin-top:18px"><div class="empty">${icon('coin', 40)}<div><b>Noch keine Auswertung</b>Nach deiner ersten beendeten Session (Farming oder Handel) siehst du hier Gewinn pro Stunde, pro Tag und woher deine Currency kommt.</div></div></div>`;
    const div = h => h.divine || F.divine || 1;
    const P = h => h.profit / div(h), H = h => (h.tEnd - h.t0) / 3600;
    const heute = this.tag(Date.now() / 1000), S1 = S0.filter(h => this.tag(h.t0) === heute);
    const sum = (L, f) => L.reduce((a, h) => a + f(h), 0);
    const kpi = (L) => { const p = sum(L, P), h = sum(L, H); return { p, h, ph: h ? p / h : 0 }; };
    const k1 = kpi(S1), kA = kpi(S0);
    // letzte 7 Tage
    const days = [];
    for (let i = 6; i >= 0; i--) { const t = Date.now() / 1000 - i * 86400, key = this.tag(t); const L = S0.filter(h => this.tag(h.t0) === key); days.push({ t, p: sum(L, P), h: sum(L, H) }); }
    const max = Math.max(0.01, ...days.map(d => Math.abs(d.p)));
    // Quellen
    const agg = (k) => { const m = {}; for (const h of S0) for (const [n, v] of (h[k] || [])) m[n] = (m[n] || 0) + v / div(h); return Object.entries(m).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 10); };
    const gains = agg('gains'), costs = agg('costs');
    const gmax = Math.max(0.01, ...gains.map(x => x[1])), cmax = Math.max(0.01, ...costs.map(x => -x[1]));
    const best = S0.slice().sort((a, b) => (b.perHour / div(b)) - (a.perHour / div(a)))[0];
    const dv = v => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)).replace('.', ',');
    const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const farm = S0.filter(h => (h.mode || 'farm') === 'farm'), craft = S0.filter(h => h.mode === 'craft');
    const kf = kpi(farm), kc = kpi(craft);
    return wirt + `<div class="stk" style="margin-top:18px">
        <div class="card pad"><h3>Heute</h3><div class="big ${k1.p >= 0 ? 'good' : 'bad'}">${k1.p >= 0 ? '+' : ''}${dv(k1.p)} <small>div</small></div><div class="muted">${Farm.dauer(k1.h * 3600)} gespielt · ${dv(k1.ph)} div/h</div></div>
        <div class="card pad"><h3>Insgesamt</h3><div class="big ${kA.p >= 0 ? 'good' : 'bad'}">${kA.p >= 0 ? '+' : ''}${dv(kA.p)} <small>div</small></div><div class="muted">${S0.length} Sessions · ${Math.round(kA.h)} Std. · ${dv(kA.ph)} div/h</div></div>
        <div class="card pad"><h3>Farming vs. Handel</h3><div class="vs"><div><span>Farming</span><b>${dv(kf.ph)}</b><small>div/h, ${Math.round(kf.h * 10) / 10} Std.</small></div><div><span>Handel</span><b>${dv(kc.ph)}</b><small>div/h, ${Math.round(kc.h * 10) / 10} Std.</small></div></div></div>
        <div class="card pad"><h3>Beste Session</h3><div class="big good">${dv(best.perHour / div(best))} <small>div/h</small></div><div class="muted">${datum(best.t0)}, ${esc((best.top || []).slice(0, 2).join(', '))}</div></div>
      </div>
      <div class="grid2" style="margin-top:18px;align-items:start">
        <div class="card pad"><h3>Letzte 7 Tage <span class="r muted">Gewinn in Divine</span></h3>
          <div class="days">${days.map(d => `<div class="dc"><div class="dbar"><i class="${d.p >= 0 ? 'p' : 'n'}" style="height:${Math.abs(d.p) / max * 100}%"></i></div><b>${d.p ? dv(d.p) : '–'}</b><span>${wd[new Date(d.t * 1000).getDay()]}</span><small>${d.h ? (Math.round(d.h * 10) / 10) + ' h' : ''}</small></div>`).join('')}</div></div>
        <div class="card pad"><h3>Woher kommt deine Currency? <span class="r muted">alle Sessions</span></h3>
          ${gains.map(([n, v]) => `<div class="src"><span>${esc(n)}</span><div class="bar"><i style="width:${v / gmax * 100}%;background:linear-gradient(90deg,#3f7f6f,#7cc4a8)"></i></div><b class="good">+${dv(v)}</b></div>`).join('') || '<div class="muted">Noch keine Daten.</div>'}
          ${costs.length ? `<h3 style="margin-top:18px">Größte Kosten</h3>${costs.slice(0, 6).map(([n, v]) => `<div class="src"><span>${esc(n)}</span><div class="bar"><i style="width:${-v / cmax * 100}%;background:linear-gradient(90deg,#8f3a30,#d9584a)"></i></div><b class="bad">${dv(v)}</b></div>`).join('')}` : ''}
        </div>
      </div>`;
  },
};

const Ledger = {
  d: null, v: 0, sugg: [],
  async load() { try { this.d = await api('/api/ledger'); this.v++; lastKey.stash = null; if (view === 'stash') renderView(true); } catch (e) {} },
  html() {
    if (!this.d) { this.load(); return `<h3>Positionen</h3><div class="muted">Lade …</div>`; }
    const D = this.d.divine || 1, L = this.d.list;
    const row = e => {
      const paidD = e.paidC / (e.divAtBuy || D), nowD = e.valueC != null ? e.valueC / D : null;
      const g = nowD != null ? nowD - paidD : null, pc = g != null && paidD ? g / paidD * 100 : null;
      const f = v => v == null ? '–' : (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)).replace('.', ',');
      return `<tr class="${e.sold != null ? 'sold' : ''}"><td><b>${esc(e.item)}</b>${e.note ? `<small>${esc(e.note)}</small>` : ''}</td><td>${App.full(e.qty)}</td><td>${f(paidD)} div<small>${datum(e.t)}</small></td>
        <td>${e.sold != null ? 'verkauft ' + f(nowD) + ' div' : nowD != null ? f(nowD) + ' div' : '<span class="muted">kein Preis</span>'}${e.unit && e.sold == null ? `<small>${(e.unit < 10 ? e.unit.toFixed(2) : Math.round(e.unit))} c/Stück</small>` : ''}</td>
        <td class="${g == null ? '' : g >= 0 ? 'good' : 'bad'}"><b>${g == null ? '–' : (g >= 0 ? '+' : '') + f(g) + ' div'}</b>${pc != null ? `<small>${pc >= 0 ? '+' : ''}${Math.round(pc)} %</small>` : ''}</td>
        <td class="la">${e.sold == null ? `<button class="btn small" data-sell="${e.id}">Verkauft</button>` : ''}<button class="btn small ghost danger" data-ldel="${e.id}">${icon('trash', 13)}</button></td></tr>`;
    };
    const offen = L.filter(e => e.sold == null && e.valueC != null), zu = L.filter(e => e.sold != null);
    const sum = (A, f) => A.reduce((a, e) => a + f(e), 0);
    const uOffen = sum(offen, e => e.valueC / D - e.paidC / (e.divAtBuy || D)), uZu = sum(zu, e => e.sold / D - e.paidC / (e.divAtBuy || D));
    return `<h3>Positionen <span class="r muted">Spekulation & Großeinkäufe</span></h3>
      <div class="muted" style="font-size:13px;margin:-6px 0 12px">Trag ein, was du kaufst, um es später teurer zu verkaufen – z. B. „100 Chaos Orb für 0,6 Divine“. Der Companion bewertet es laufend mit den aktuellen poe.ninja-Preisen in Divine.</div>
      <div class="lform"><div class="lf1"><input id="lit" list="litl" placeholder="Item, z. B. Chaos Orb" autocomplete="off"><datalist id="litl"></datalist></div>
        <input id="lqty" type="number" min="0" step="any" placeholder="Menge">
        <input id="lpaid" type="number" min="0" step="any" placeholder="bezahlt">
        <select id="lcur"><option value="divine">Divine</option><option value="chaos">${App.wl()}</option></select>
        <input id="lnote" placeholder="Notiz (optional)">
        <button class="btn primary" id="ladd">${icon('plus', 15)} Hinzufügen</button></div>
      ${L.length ? `<div class="lsum"><div><span>Offen, nicht verkauft</span><b class="${uOffen >= 0 ? 'good' : 'bad'}">${uOffen >= 0 ? '+' : ''}${uOffen.toFixed(2).replace('.', ',')} div</b></div><div><span>Realisiert</span><b class="${uZu >= 0 ? 'good' : 'bad'}">${uZu >= 0 ? '+' : ''}${uZu.toFixed(2).replace('.', ',')} div</b></div><div><span>1 Divine</span><b>${Math.round(D)} ${App.wk()}</b></div></div>
        <table class="ftable ltab"><tr><th>Item</th><th>Menge</th><th>Einstand</th><th>Wert jetzt</th><th>Gewinn</th><th></th></tr>${L.slice().reverse().map(row).join('')}</table>`
        : '<div class="muted" style="padding:10px 0">Noch keine Positionen.</div>'}
      ${!this.d.pricesT ? '<div class="muted" style="font-size:12.5px;margin-top:8px">Preise werden geladen – das dauert beim ersten Mal ca. 30 Sekunden.</div>' : ''}`;
  },
  bind() {
    const it = $('#lit'); if (!it) return;
    let tmr;
    it.oninput = () => { clearTimeout(tmr); tmr = setTimeout(async () => { const r = await api('/api/prices/names?q=' + encodeURIComponent(it.value)); $('#litl').innerHTML = r.map(x => `<option value="${esc(x.n)}">${x.c} ${App.wk()}</option>`).join(''); }, 200); };
    $('#ladd').onclick = async () => {
      const item = it.value.trim(), qty = +$('#lqty').value, paid = +$('#lpaid').value;
      if (!item || !qty) return toast('Bitte Item und Menge eintragen.');
      this.d = await api('/api/ledger', { action: 'add', item, qty, paid, cur: $('#lcur').value, note: $('#lnote').value });
      this.v++; toast('Position gespeichert.'); lastKey.stash = null; renderView(true);
    };
    document.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => this.sellForm(b.dataset.sell, b));
    document.querySelectorAll('[data-ldel]').forEach(b => b.onclick = () => App.ask('Position löschen?', { ok: 'Löschen', danger: true }).then(async ok => { if (ok) { this.d = await api('/api/ledger', { action: 'delete', id: b.dataset.ldel }); this.v++; lastKey.stash = null; renderView(true); } }));
  },
  sellForm(id, btn) {
    const td = btn.closest('td');
    td.innerHTML = `<div class="sellf"><input type="number" step="any" min="0" placeholder="Erlös" style="width:90px"><select><option value="divine">div</option><option value="chaos">${App.wk()}</option></select><button class="btn small primary">OK</button></div>`;
    const [inp, sel, ok] = td.querySelectorAll('input,select,button'); inp.focus();
    ok.onclick = async () => { this.d = await api('/api/ledger', { action: 'sell', id, amount: +inp.value, cur: sel.value }); this.v++; lastKey.stash = null; renderView(true); };
  },
};
setInterval(() => { if (typeof view !== 'undefined' && view === 'stash' && stashTab === 'trade') Ledger.load(); }, 60000);

// ------------------------------------------------------------------ Börse: Kurse wie beim DAX
const Markt = {
  d: null, t: 0, sort: 'vol', dir: -1, typ: 'alle', q: '', open: null, laedt: false,
  TYP: { Currency: 'Currency', Fragment: 'Fragmente', Scarab: 'Scarabs', Essence: 'Essenzen', Fossil: 'Fossilien', Resonator: 'Resonatoren', Oil: 'Öle', DeliriumOrb: 'Delirium', Incubator: 'Inkubatoren', DivinationCard: 'Karten', Artifact: 'Artefakte', Omen: 'Omen', Tattoo: 'Tattoos', AllflameEmber: 'Glut', Runegraft: 'Runegrafts', KalguuranRune: 'Runen' },
  async load(force) {
    if (this.laedt || (!force && this.d && Date.now() - this.t < (this.d.loading ? 6e3 : this.d.error ? 60e3 : 5 * 60e3))) return;
    this.laedt = true;
    try { this.d = await api('/api/markt'); } catch (e) { this.d = { error: String(e), list: [] }; }
    this.t = Date.now();
    this.laedt = false; lastKey.stash = null; if (view === 'stash') renderView(true);
    if (this.d && this.d.loading) setTimeout(() => this.load(true), 6000);
  },
  // Kursreihe aus dem 7-Tage-Verlauf von poe.ninja (Prozentwerte → Preise)
  reihe(x) {
    const sp = (x.sp || []).filter(v => v != null); if (sp.length < 2) return null;
    const ref = 1 + sp[sp.length - 1] / 100;
    return sp.map(v => x.c * (1 + v / 100) / (ref || 1));
  },
  ch(x) { const r = this.reihe(x); if (r) return (r[r.length - 1] / r[0] - 1) * 100; return x.ch; },
  pc(v) { return v == null || !isFinite(v) ? '–' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0).replace('.', ',') + ' %'; },
  basis() { const e = (this.d && this.d.einheit) || 'Chaos'; return e + ' Orb'; },
  cv(c) { const K = (this.d && this.d.kurse) || {}, u = this.unit; if (!u || u === this.basis() || !K[u] || !K[u][this.basis()]) return c; return c / K[u][this.basis()]; },
  uk() { const u = this.unit && this.unit !== this.basis() && ((this.d || {}).kurse || {})[this.unit] ? this.unit : this.basis(); return ({ 'Chaos Orb': 'c', 'Exalted Orb': 'ex', 'Divine Orb': 'div' })[u] || App.wk(); },
  kursKarte(D) {
    const K = D.kurse || {}, z = v => v >= 100 ? App.full(Math.round(v)) : v >= 10 ? v.toFixed(1).replace('.', ',') : v.toFixed(3).replace('.', ','), kurz = { 'Chaos Orb': 'Chaos', 'Exalted Orb': 'Exalted', 'Divine Orb': 'Divine' };
    const paar = (a, b) => K[a] && K[a][b] ? `<div class="kx"><span>1 ${kurz[a]}</span><b>${z(K[a][b])} ${kurz[b]}</b></div>` : '';
    const namen = Object.keys(K).filter(n => kurz[n]);
    return `<div class="card pad frame kurse"><h3>Wechselkurse <span class="r muted">${esc(D.league)} · poe.ninja</span></h3>
      <div class="kxs">${paar('Divine Orb', 'Exalted Orb')}${paar('Divine Orb', 'Chaos Orb')}${paar('Exalted Orb', 'Chaos Orb')}${paar('Chaos Orb', 'Exalted Orb')}</div>
      <div class="kxu"><span>Preise anzeigen in</span><div class="seg">${namen.map(n => `<button class="${(this.unit || this.basis()) === n ? 'on' : ''}" data-mu="${esc(n)}">${kurz[n]}</button>`).join('')}</div></div></div>`;
  },
  preis(c) { return c >= 1000 ? App.full(Math.round(c)) : c >= 10 ? c.toFixed(1).replace('.', ',') : c >= 1 ? c.toFixed(2).replace('.', ',') : c.toFixed(3).replace('.', ','); },
  spark(r, w = 96, h = 26) {
    if (!r) return '<span class="muted">–</span>';
    const a = Math.min(...r), b = Math.max(...r), up = r[r.length - 1] >= r[0];
    const pts = r.map((v, i) => [(i / (r.length - 1) * (w - 4) + 2).toFixed(1), (h - 3 - (v - a) / ((b - a) || 1) * (h - 6)).toFixed(1)]);
    return `<svg class="spk" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="M${pts.map(p => p.join(' ')).join(' L')}" fill="none" stroke="${up ? '#7cc4a8' : '#e0675a'}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="2.2" fill="${up ? '#7cc4a8' : '#e0675a'}"/></svg>`;
  },
  // Großer Kurs-Chart mit Gitter, Fläche und Beschriftung
  chart(vals, labels, opt = {}) {
    if (!vals || vals.length < 2) return '<div class="muted">Noch zu wenig Kursdaten.</div>';
    const W = opt.w || 760, H = opt.h || 210, L = 8, R = 62, T = 12, B = 22;
    let a = Math.min(...vals), b = Math.max(...vals); const pad = (b - a) * .12 || b * .02 || 1; a -= pad; b += pad;
    const X = i => L + i / (vals.length - 1) * (W - L - R), Y = v => T + (1 - (v - a) / (b - a)) * (H - T - B);
    const up = vals[vals.length - 1] >= vals[0], col = up ? '#7cc4a8' : '#e0675a', id = 'g' + Math.random().toString(36).slice(2, 7);
    const line = vals.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
    const grid = [0, .25, .5, .75, 1].map(f => { const v = a + (b - a) * f, y = Y(v); return `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="rgba(195,154,91,.09)"/><text x="${W - R + 6}" y="${y + 4}" class="ax">${(opt.fmt || this.preis)(v)}</text>`; }).join('');
    const xl = (labels || []).map(([i, t]) => `<text x="${X(i)}" y="${H - 5}" class="ax" text-anchor="middle">${t}</text>`).join('');
    const base = opt.base != null ? `<line x1="${L}" x2="${W - R}" y1="${Y(opt.base)}" y2="${Y(opt.base)}" stroke="rgba(230,201,146,.35)" stroke-dasharray="3 4"/>` : '';
    const lx = X(vals.length - 1), ly = Y(vals[vals.length - 1]);
    return `<svg class="kchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
      ${grid}${base}<path d="${line} L${X(vals.length - 1)} ${H - B} L${L} ${H - B} Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="${lx}" cy="${ly}" r="3.5" fill="${col}"/><rect x="${W - R + 2}" y="${ly - 9}" width="${R - 4}" height="18" rx="3" fill="${col}"/><text x="${W - R + 6}" y="${ly + 4}" class="ax" style="fill:#0f0d0a;font-weight:700">${(opt.fmt || this.preis)(vals[vals.length - 1])}</text>${xl}</svg>`;
  },
  tage(n) { const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']; return Array.from({ length: n }, (_, i) => [i, i === n - 1 ? 'heute' : wd[new Date(Date.now() - (n - 1 - i) * 864e5).getDay()]]); },
  zeitLabels(ts) { if (ts.length < 2) return []; const n = 5; return Array.from({ length: n }, (_, k) => { const i = Math.round(k / (n - 1) * (ts.length - 1)); const d = new Date(ts[i] * 1000); return [i, d.getDate() + '.' + (d.getMonth() + 1) + '. ' + String(d.getHours()).padStart(2, '0') + ' Uhr']; }); },
  html() {
    this.load();
    const D = this.d;
    if (D && D.error) return `<div class="card pad"><div class="empty">${icon('chart', 40)}<div><b>Keine Kurse</b>${esc(D.error)}</div></div></div>`;
    if (!D || D.loading) return `<div class="card pad"><div class="empty">${icon('chart', 40)}<div><b>Kurse werden geladen</b>Der Companion holt gerade alle Preise von poe.ninja. Das dauert beim ersten Mal ca. 30 Sekunden.</div></div></div>`;
    const L = D.list.filter(x => x.n !== 'Chaos Orb'), dv = D.divine || 1;
    // Index: gleichgewichtet aus den 12 meistgehandelten Items
    const korb = L.filter(x => this.reihe(x)).slice(0, 12), reihen = korb.map(x => this.reihe(x)), n = Math.min(...reihen.map(r => r.length));
    const idx = reihen.length ? Array.from({ length: n }, (_, i) => 100 * reihen.reduce((a, r) => a + r[r.length - n + i] / r[r.length - n], 0) / reihen.length) : null;
    const idxCh = idx ? idx[idx.length - 1] - 100 : null;
    const mit = L.filter(x => x.vol > 0 && this.reihe(x)).map(x => [x, this.ch(x)]);
    const gew = mit.slice().sort((a, b) => b[1] - a[1]).slice(0, 5), verl = mit.slice().sort((a, b) => a[1] - b[1]).slice(0, 5);
    const tick = L.slice(0, 24).map(x => { const c = this.ch(x); return `<span class="tk"><b>${esc(x.n)}</b> ${this.preis(this.cv(x.c))} ${this.uk()} <i class="${c >= 0 ? 'good' : 'bad'}">${c >= 0 ? '▲' : '▼'} ${this.pc(c).replace(/^[+−]/, '')}</i></span>`; }).join('');
    const div = L.find(x => x.n === 'Divine Orb'), divR = div && this.reihe(div);
    const own = (D.divH || []).filter(p => p[1]);
    const mover = (A, cls) => A.map(([x, c]) => `<div class="mv" data-mk="${esc(x.n)}">${Farm.icon({ icon: x.ic }, 24)}<span class="mvn">${esc(x.n)}</span><b class="${cls}">${this.pc(c)}</b></div>`).join('') || '<div class="muted">–</div>';
    // Tabelle
    const typen = {}; for (const x of L) typen[x.typ] = (typen[x.typ] || 0) + 1;
    const chips = [['alle', 'Alle'], ['mine', 'Meine Positionen'], ...Object.keys(typen).sort((a, b) => typen[b] - typen[a]).slice(0, 8).map(t => [t, this.TYP[t] || t])];
    let rows = L.filter(x => this.typ === 'alle' || (this.typ === 'mine' ? x.mine : x.typ === this.typ)).filter(x => !this.q || x.n.toLowerCase().includes(this.q.toLowerCase()));
    const key = { n: x => x.n, c: x => x.c, ch: x => this.ch(x) ?? -1e9, vol: x => x.vol }[this.sort];
    rows.sort((a, b) => { const p = key(a), q = key(b); return (p > q ? 1 : p < q ? -1 : 0) * this.dir; });
    rows = rows.slice(0, 80);
    const th = (k, t, cls = '') => `<th class="${cls} srt${this.sort === k ? ' on' : ''}" data-ms="${k}">${t}${this.sort === k ? (this.dir < 0 ? ' ▾' : ' ▴') : ''}</th>`;
    const detail = x => {
      const r = this.reihe(x), h = (x.h || []);
      return `<tr class="mdet"><td colspan="6"><div class="grid2" style="align-items:start">
        <div><div class="mh">7 Tage <span class="muted">poe.ninja</span></div>${r ? this.chart(r, this.tage(r.length), { h: 170, w: 520 }) : '<div class="muted">Kein Verlauf.</div>'}</div>
        <div><div class="mh">Eigene Aufzeichnung <span class="muted">${h.length} Messpunkte</span></div>${h.length >= 3 ? this.chart(h.map(p => p[1]), this.zeitLabels(h.map(p => p[0])), { h: 170, w: 520 }) : '<div class="muted" style="padding:8px 0">Der Companion merkt sich ab jetzt bei jedem Preis-Update (ca. alle 30 Minuten) den Kurs. Nach ein paar Stunden siehst du hier einen eigenen, genaueren Verlauf.</div>'}</div>
      </div></td></tr>`;
    };
    const row = x => { const c = this.ch(x), o = this.open === x.n; return `<tr class="mrow${o ? ' o' : ''}${x.mine ? ' mine' : ''}" data-mk="${esc(x.n)}"><td><div class="mn">${Farm.icon({ icon: x.ic }, 28)}<div><b>${esc(x.n)}</b><small>${esc(this.TYP[x.typ] || x.typ || '')}${x.mine ? ' · in deinen Positionen' : ''}</small></div></div></td>
      <td class="nr"><b>${this.preis(this.cv(x.c))}</b> ${this.uk()}</td><td class="nr muted">${x.c >= dv * .05 ? (x.c / dv).toFixed(x.c / dv >= 10 ? 1 : 3).replace('.', ',') + ' div' : '–'}</td>
      <td class="nr"><span class="chip ${c == null ? '' : c >= 0 ? 'up' : 'dn'}">${this.pc(c)}</span></td><td>${this.spark(this.reihe(x))}</td><td class="nr muted">${x.vol ? App.full(Math.round(x.vol / dv)) + ' div' : '–'}</td></tr>${o ? detail(x) : ''}`; };
    return `<div class="tape" title="Meistgehandelte Items, Änderung über 7 Tage"><div class="tape-in">${tick}${tick}</div></div>${this.kursKarte(D)}
      <div class="grid2 mtop" style="align-items:stretch">
        <div class="card pad frame"><h3>Currency-Index <span class="r muted">${esc(D.league)}</span></h3>
          <div class="muted" style="font-size:12px;margin:-4px 0 8px">Durchschnitt der ${korb.length} meistgehandelten Items (gleich gewichtet, vor 7 Tagen = 100): ${korb.map(x => esc(x.n)).join(', ')}. Über 100 = diese Items sind teurer geworden.</div>
          <div class="ixh"><b>${idx ? idx[idx.length - 1].toFixed(1).replace('.', ',') : '–'}</b><span class="chip ${idxCh >= 0 ? 'up' : 'dn'}">${this.pc(idxCh)} in 7 Tagen</span></div>
          ${idx ? this.chart(idx, this.tage(idx.length), { h: 180, w: 560, base: 100, fmt: v => v.toFixed(1).replace('.', ',') }) : ''}
          <div class="muted" style="font-size:12px">Die 12 meistgehandelten Items, gleich gewichtet, vor 7 Tagen = 100. Gemessen in ${App.wl()}: steigt der Index, wird Currency gegenüber ${App.wl()} teurer.</div></div>
        <div class="card pad"><h3>Divine-Kurs <span class="r muted">in ${App.wl()}</span></h3>
          <div class="ixh"><b>${Math.round(dv)} ${App.wk()}</b>${divR ? `<span class="chip ${this.ch(div) >= 0 ? 'up' : 'dn'}">${this.pc(this.ch(div))} in 7 Tagen</span>` : ''}</div>
          ${own.length >= 6 ? this.chart(own.map(p => p[1]), this.zeitLabels(own.map(p => p[0])), { h: 180, w: 560, fmt: v => Math.round(v) + '' }) : divR ? this.chart(divR, this.tage(divR.length), { h: 180, w: 560, fmt: v => Math.round(v) + '' }) : '<div class="muted">Noch kein Verlauf.</div>'}
          <div class="muted" style="font-size:12px">Steigt der Divine-Kurs, lohnt es sich, ${App.wl()} in Divine zu tauschen, bevor es noch teurer wird – und umgekehrt.</div></div>
      </div>
      <div class="grid2 mtop" style="align-items:start">
        <div class="card pad"><h3>Gewinner <span class="r muted">7 Tage</span></h3>${mover(gew, 'good')}</div>
        <div class="card pad"><h3>Verlierer <span class="r muted">7 Tage</span></h3>${mover(verl, 'bad')}</div>
      </div>
      <div class="card pad mtop"><h3>Kurse <span class="r muted">Stand ${App.zeit(D.t)} · Klick auf eine Zeile öffnet den Chart</span></h3>
        <div class="mfil"><input id="mq" placeholder="Suchen, z. B. Scarab" value="${esc(this.q)}" autocomplete="off"><div class="mchips">${chips.map(([k, t]) => `<button class="${this.typ === k ? 'on' : ''}" data-mt="${esc(k)}">${esc(t)}</button>`).join('')}</div></div>
        <table class="ftable mtab"><tr>${th('n', 'Item')}${th('c', 'Kurs', 'nr')}<th class="nr">in Divine</th>${th('ch', '7 Tage', 'nr')}<th>Verlauf</th>${th('vol', 'Umsatz/Tag', 'nr')}</tr>${rows.map(row).join('') || '<tr><td colspan="6" class="muted">Nichts gefunden.</td></tr>'}</table></div>`;
  },
  bind() {
    const re = () => { lastKey.stash = null; renderView(true); };
    document.querySelectorAll('[data-ms]').forEach(t => t.onclick = () => { const k = t.dataset.ms; if (this.sort === k) this.dir *= -1; else { this.sort = k; this.dir = k === 'n' ? 1 : -1; } re(); });
    document.querySelectorAll('[data-mt]').forEach(b => b.onclick = () => { this.typ = b.dataset.mt; re(); });
    document.querySelectorAll('[data-mu]').forEach(b => b.onclick = () => { this.unit = b.dataset.mu; re(); });
    document.querySelectorAll('[data-mk]').forEach(r => r.onclick = () => { const n = r.dataset.mk; this.open = this.open === n ? null : n; if (r.classList.contains('mv')) { this.typ = 'alle'; this.q = n; } re(); });
    const q = $('#mq'); if (q) { let tm; q.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { this.q = q.value; re(); setTimeout(() => { const e = $('#mq'); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } }, 0); }, 250); }; }
  },
};

// ------------------------------------------------------------------ Farmstrategien: eigene Strategien mit echten Zahlen aus deinen Sessions
const Strat = {
  edit: null,
  stats(F, id) {
    const L = F.sessions.filter(h => h.strat === id && h.tEnd && h.t0), div = h => h.divine || F.divine || 1;
    const hrs = L.reduce((a, h) => a + (h.tEnd - h.t0) / 3600, 0), prof = L.reduce((a, h) => a + h.profit / div(h), 0);
    const earn = L.reduce((a, h) => a + (h.earned || 0) / div(h), 0), spent = L.reduce((a, h) => a + (h.spent || 0) / div(h), 0), maps = L.reduce((a, h) => a + (h.maps || 0), 0);
    return { n: L.length, hrs, ph: hrs ? prof / hrs : 0, eh: hrs ? earn / hrs : 0, sh: hrs ? spent / hrs : 0, maps, cpm: maps ? spent * (F.divine || 1) / maps : 0, mph: hrs ? maps / hrs : 0, last: L.length ? L[L.length - 1].t0 : 0, best: Math.max(0, ...L.map(h => h.perHour / div(h))) };
  },
  html(F) {
    const S0 = F.strategies || [], dv = v => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)).replace('.', ',');
    const list = S0.slice().sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || this.stats(F, b.id).ph - this.stats(F, a.id).ph);
    const ohne = F.sessions.filter(h => (h.mode || 'farm') === 'farm' && h.tEnd && !h.strat).slice(-8).reverse();
    const card = st => {
      const k = this.stats(F, st.id), on = F.strat === st.id;
      if (this.edit === st.id) return `<div class="card pad sc"><div class="sform"><input id="se_n" value="${esc(st.name)}" placeholder="Name"><input id="se_l" value="${esc(st.link || '')}" placeholder="Link (optional)"><textarea id="se_t" rows="3" placeholder="Notiz: Atlas-Tree, Scarabs, Ablauf …">${esc(st.note || '')}</textarea>
        <div class="row"><button class="btn small primary" data-sesave="${st.id}">Speichern</button><button class="btn small ghost" data-secancel>Abbrechen</button></div></div></div>`;
      return `<div class="card pad sc${on ? ' on' : ''}${st.fav ? ' fav' : ''}">
        <div class="sc-h"><button class="star${st.fav ? ' y' : ''}" data-sfav="${st.id}" title="${st.fav ? 'Kein Favorit mehr' : 'Als Favorit merken'}">★</button><div><b>${esc(st.name)}</b>${st.link ? `<a href="${esc(st.link)}" target="_blank" rel="noopener">${esc(st.link.replace(/^https?:\/\/(www\.)?/, '').slice(0, 46))}</a>` : ''}</div>
          ${on ? '<span class="chip up">nächste Session</span>' : ''}</div>
        ${st.note ? `<div class="sc-n">${esc(st.note)}</div>` : ''}
        ${k.n ? `<div class="sc-k"><div><span>pro Stunde</span><b class="${k.ph >= 0 ? 'good' : 'bad'}">${k.ph >= 0 ? '+' : ''}${dv(k.ph)}</b><small>div</small></div><div><span>Einnahmen/h</span><b>${dv(k.eh)}</b><small>div</small></div><div><span>Ausgaben/h</span><b class="bad">${dv(k.sh)}</b><small>div</small></div>
            <div><span>Maps/h</span><b>${k.mph.toFixed(1).replace('.', ',')}</b><small>${k.maps} gesamt</small></div><div><span>Kosten/Map</span><b>${Math.round(k.cpm)}</b><small>${App.wl()}</small></div><div><span>Gespielt</span><b>${(Math.round(k.hrs * 10) / 10).toString().replace('.', ',')}</b><small>Std., ${k.n} Session${k.n > 1 ? 's' : ''}</small></div></div>`
          : '<div class="muted sc-e">Noch keine Session mit dieser Strategie. Wähle sie als nächste Session und starte das Farming – die Zahlen kommen dann von selbst.</div>'}
        <div class="sc-f">${on ? `<button class="btn small ghost" data-spick="">Abwählen</button>` : `<button class="btn small primary" data-spick="${st.id}">${icon('bolt', 13)} Für nächste Session</button>`}
          <button class="btn small ghost" data-sedit="${st.id}">Bearbeiten</button><button class="btn small ghost danger" data-sdel="${st.id}">${icon('trash', 13)}</button>${k.last ? `<span class="muted">zuletzt ${datum(k.last)}</span>` : ''}</div></div>`;
    };
    return `<div class="card pad frame"><h3>Neue Strategie</h3>
        <div class="muted" style="font-size:13px;margin:-6px 0 12px">Leg deine Farmstrategien an, z. B. „T16 Essence + Harbinger“. Jede Farming-Session, die du mit einer Strategie startest, fließt in ihre Zahlen ein: Gewinn pro Stunde, Ausgaben, Maps pro Stunde. Ideen findest du bei <a href="https://wealthyexile.com/strategies/public" target="_blank" rel="noopener">Wealthy Exile</a> – Link einfach unten einfügen.</div>
        <div class="sform one"><input id="sn" placeholder="Name, z. B. Scarab-Farm Jungle Valley"><input id="sl" placeholder="Link (optional), z. B. wealthyexile.com/strategies/…"><input id="st" placeholder="Notiz (optional)"><button class="btn primary" id="sadd">${icon('plus', 15)} Speichern</button></div></div>
      ${list.length ? `<div class="sgrid">${list.map(card).join('')}</div>` : `<div class="card pad mtop"><div class="empty">${icon('flag', 40)}<div><b>Noch keine Strategien</b>Oben anlegen – danach siehst du hier, welche Strategie dir am meisten bringt.</div></div></div>`}
      ${ohne.length && list.length ? `<div class="card pad mtop"><h3>Sessions ohne Strategie <span class="r muted">nachträglich zuordnen</span></h3><table class="ftable">${ohne.map(h => `<tr><td>${datum(h.t0)}</td><td>${Farm.dauer(h.tEnd - h.t0)}</td><td>${h.maps} Maps</td><td class="${h.perHour >= 0 ? 'good' : 'bad'}">${Farm.dv(h.perHour, h.divine)} div/h</td>
          <td><select data-sassign="${h.t0}"><option value="">– Strategie wählen –</option>${list.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></td></tr>`).join('')}</table></div>` : ''}`;
  },
  bind() {
    const A = b => api('/api/strategy', b).then(r => { if (r && r.error) toast(r.error); lastKey.stash = null; });
    const on = (sel, f) => document.querySelectorAll(sel).forEach(e => e.onclick = () => f(e));
    const add = $('#sadd'); if (add) add.onclick = () => A({ action: 'add', name: $('#sn').value, link: $('#sl').value, note: $('#st').value }).then(() => { ['#sn', '#sl', '#st'].forEach(s => { const e = $(s); if (e) e.value = ''; }); });
    on('[data-sfav]', e => A({ action: 'fav', id: e.dataset.sfav }));
    on('[data-spick]', e => A({ action: 'pick', id: e.dataset.spick }).then(() => toast(e.dataset.spick ? 'Gilt für deine nächste Farming-Session.' : 'Abgewählt.')));
    on('[data-sdel]', e => App.ask('Strategie löschen?', { ok: 'Löschen', danger: true, detail: 'Die Sessions bleiben erhalten, nur die Zuordnung geht verloren.' }).then(ok => ok && A({ action: 'delete', id: e.dataset.sdel })));
    on('[data-sedit]', e => { this.edit = e.dataset.sedit; lastKey.stash = null; renderView(true); });
    on('[data-secancel]', () => { this.edit = null; lastKey.stash = null; renderView(true); });
    on('[data-sesave]', e => { const id = e.dataset.sesave; this.edit = null; A({ action: 'edit', id, name: $('#se_n').value, link: $('#se_l').value, note: $('#se_t').value }); });
    document.querySelectorAll('[data-sassign]').forEach(s => s.onchange = () => s.value && A({ action: 'assign', t0: s.dataset.sassign, id: s.value }));
  },
};
