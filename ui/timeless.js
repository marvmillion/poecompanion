// PoE Companion – Timeless-Juwelen: was ein Seed in deinem Tree verändert, und welcher Seed das bringt, was du willst
const TL = {
  meta: null, typ: 1, sock: null, tab: 'sehen', seed: '', res: null, such: null, wants: {}, filter: '', nurMeine: true, laeuft: false,
  KLEIN: { 2: 'Kleine Punkte: +4 Stärke, Attribut-Punkte +2 Stärke zusätzlich', 3: 'Kleine Punkte: +4 Geschick, Attribut-Punkte +2 Geschick zusätzlich',
    4: 'Kleine Punkte: +5 Devotion, Attribut-Punkte +10 Devotion zusätzlich', 5: 'Kleine Punkte verlieren ihre Werte' },
  BOSS: { 1: 'Doryani, Xibaqua oder Ahuana', 2: 'Kaom, Rakiata oder Akoya', 3: 'Asenath, Nasima oder Balbala', 4: 'Avarius, Dominus oder Maxarius', 5: 'Cadiro, Victario oder Caspiro' },
  async post(b) { return api('/api/timeless', b); },
  async laden() {
    if (this.meta || this.laedt) return; this.laedt = true;
    const r = await this.post({ action: 'meta' }).catch(e => ({ error: String(e) }));
    this.laedt = false;
    if (r.error) { this.fehler = r.error; } else { this.meta = r; this.sock = this.sock || (r.sockets[0] && r.sockets[0].id); }
    lastKey.timeless = null; if (view === 'timeless') renderView(true);
  },
  T() { return this.meta && this.meta.types.find(t => t.id === this.typ); },
  async zeigeSeed(seed) {
    this.seed = seed; this.tab = 'sehen'; this.res = { busy: true }; this.render();
    this.res = await this.post({ action: 'seed', type: this.typ, seed: +seed, socket: this.sock }).catch(e => ({ error: String(e) }));
    this.render();
  },
  async suchen() {
    const wants = Object.entries(this.wants).map(([id, w]) => ({ id, w: w.w, min: w.min ? 1 : 0 }));
    if (!wants.length) { toast('Wähle mindestens einen Effekt aus der Liste.'); return; }
    this.such = { busy: true }; this.render();
    this.such = await this.post({ action: 'search', type: this.typ, socket: this.sock, wants, onlyAlloc: this.nurMeine }).catch(e => ({ error: String(e) }));
    this.render();
  },
  sockLabel(x) { return `${x.mine ? '★ ' : ''}Sockel bei ${x.ks || 'Mitte'} · ${x.notables} Notables${x.alloc ? `, ${x.alloc} geskillt` : ''}`; },
  karte(n) {
    const e = n.e, ersetzt = e && e.mode === 'ersetzt';
    return `<div class="tn${n.alloc ? ' al' : ''}${n.notable ? ' nb' : ''}">
      <div class="tn-h"><span class="tn-o${ersetzt ? ' x' : ''}">${esc(n.name)}</span>${n.alloc ? '<span class="tn-a">geskillt</span>' : ''}</div>
      ${e ? `<div class="tn-n">${ersetzt ? '→ ' : '+ '}<b>${esc(e.name || '')}</b></div><div class="tn-s">${(e.sd || []).map(l => `<div>${esc(l)}</div>`).join('')}</div>`
        : n.notable ? '<div class="tn-s muted">keine Änderung</div>' : `<div class="tn-s muted">${(n.orig || []).map(esc).join(' · ')}</div>`}</div>`;
  },
  html() {
    if (this.fehler && !this.meta) return `<div class="card pad"><div class="empty">${icon('gem', 40)}<div><b>Timeless-Juwelen nicht verfügbar</b>${esc(this.fehler)}</div></div></div>`;
    if (!this.meta) { this.laden(); return `<div class="card pad"><div class="empty"><span class="spin" style="color:var(--gold2)">${icon('refresh', 34)}</span><div><b>Lade Daten aus Path of Building …</b>Beim ersten Mal dauert das ein paar Sekunden.</div></div></div>`; }
    const T = this.T(), S0 = this.meta.sockets;
    const kopf = `<div class="card pad frame tl-k">
      <div class="tl-row"><span class="tl-l">Juwel</span><div class="tl-types">${this.meta.types.map(t => `<button class="${t.id === this.typ ? 'on' : ''}" data-typ="${t.id}">${esc(t.name)}</button>`).join('')}</div></div>
      <div class="tl-row"><span class="tl-l">Sockel</span><select id="tlsock">${S0.map(x => `<option value="${x.id}"${x.id === this.sock ? ' selected' : ''}>${esc(this.sockLabel(x))}</option>`).join('')}</select></div>
      <div class="tl-info">Seeds ${T.min}–${T.max}${this.typ === 5 ? ' (in 20er-Schritten)' : ''} · Anführer: ${this.BOSS[this.typ]} – der Anführer ändert nur den Keystone, die Notables hängen allein am Seed.${this.KLEIN[this.typ] ? ' ' + esc(this.KLEIN[this.typ]) + '.' : ''}</div>
      <div class="stabs tl-tabs"><button data-tab="sehen" class="${this.tab === 'sehen' ? 'on' : ''}">Seed ansehen</button><button data-tab="suchen" class="${this.tab === 'suchen' ? 'on' : ''}">Seed für meine Wünsche finden</button></div></div>`;
    let body = '';
    if (this.tab === 'sehen') {
      const R = this.res;
      body = `<div class="card pad"><div class="tl-seed"><label>Seed (die Zahl auf dem Juwel, z. B. 8056)<input id="tlseed" type="number" min="${T.min}" max="${T.max}" value="${esc(this.seed)}" placeholder="${T.min}–${T.max}"></label><button class="btn primary" id="tlgo">${icon('eye', 15)} Effekte anzeigen</button></div>
        ${!R ? '<div class="muted" style="margin-top:12px">Gib den Seed ein, dann siehst du für jeden Punkt im Radius, was der Juwel daraus macht. Deine geskillten Punkte stehen oben.</div>'
          : R.busy ? `<div class="muted" style="margin-top:12px"><span class="spin">${icon('refresh', 14)}</span> rechne …</div>`
          : R.error ? `<div class="alert bad" style="margin-top:12px">${icon('warn', 16)}<div>${esc(R.error)}</div></div>`
          : (() => { const N = R.nodes || [], mein = N.filter(n => n.alloc && (n.notable || n.e)), nb = N.filter(n => !n.alloc && n.notable), kl = N.filter(n => !n.notable && !n.alloc && n.e);
              return `<div class="tl-sum">${esc(T.name)} <b>${R.seed}</b> · ${N.filter(n => n.notable).length} Notables im Radius, davon ${N.filter(n => n.notable && n.alloc).length} geskillt <button class="btn small" data-copy="${esc(T.name + ' ' + R.seed)}">${icon('paste', 13)} Für die Trade-Suche kopieren</button></div>
                ${mein.length ? `<h3 class="tl-h">Deine geskillten Punkte</h3><div class="tn-g">${mein.map(n => this.karte(n)).join('')}</div>` : ''}
                ${nb.length ? `<h3 class="tl-h">Weitere Notables im Radius</h3><div class="tn-g">${nb.map(n => this.karte(n)).join('')}</div>` : ''}
                ${kl.length ? `<details class="tl-det"><summary>Kleine Punkte im Radius (${kl.length})</summary><div class="tn-g">${kl.map(n => this.karte(n)).join('')}</div></details>` : ''}`; })()}</div>`;
    } else {
      const f = this.filter.toLowerCase(), mods = T.mods.filter(m => !f || (m.name + ' ' + (m.sd || []).join(' ')).toLowerCase().includes(f));
      const gew = Object.keys(this.wants).length, Q = this.such;
      body = `<div class="grid2" style="align-items:start">
        <div class="card pad"><h3>Was willst du haben? <span class="r muted">${gew ? gew + ' gewählt' : 'Effekte anklicken'}</span></h3>
          <input id="tlf" placeholder="Suchen, z. B. double damage, life, crit" value="${esc(this.filter)}">
          <div class="tl-mods">${mods.slice(0, 120).map(m => { const w = this.wants[m.id]; return `<div class="tm${w ? ' on' : ''}" data-mod="${esc(m.id)}"><div class="tm-t"><b>${esc(m.name)}</b>${m.small ? '<em>kleiner Punkt</em>' : m.add ? '<em>Zusatz</em>' : ''}<div>${(m.sd || []).map(esc).join(' · ')}</div></div>
            ${w ? `<div class="tm-w" data-stop="1"><select data-w="${esc(m.id)}">${[1, 2, 3, 5].map(x => `<option value="${x}"${w.w === x ? ' selected' : ''}>Gewicht ${x}</option>`).join('')}</select><label><input type="checkbox" data-min="${esc(m.id)}"${w.min ? ' checked' : ''}> Pflicht</label></div>` : ''}</div>`; }).join('')}</div>
          ${mods.length > 120 ? '<div class="muted" style="font-size:12px;margin-top:6px">Mehr Einträge – Suchfeld benutzen.</div>' : ''}</div>
        <div class="card pad"><h3>Seed-Suche</h3>
          <label class="tl-chk"><input type="checkbox" id="tlmine"${this.nurMeine ? ' checked' : ''}> Nur Punkte, die ich schon geskillt habe</label>
          <div class="muted" style="font-size:12.5px;margin:6px 0 12px">Gewicht: wie wichtig dir ein Effekt ist. Pflicht: der Seed muss den Effekt mindestens einmal haben.</div>
          <button class="btn primary" id="tlsearch" ${Q && Q.busy ? 'disabled' : ''}>${icon('search', 15)} Passende Seeds suchen</button>
          ${!Q ? '' : Q.busy ? `<div class="muted" style="margin-top:12px"><span class="spin">${icon('refresh', 14)}</span> prüfe alle Seeds – das dauert bei Glorious Vanity bis zu einer Minute …</div>`
            : Q.error ? `<div class="alert bad" style="margin-top:12px">${icon('warn', 16)}<div>${esc(Q.error)}</div></div>`
            : `<div class="tl-sum" style="margin-top:14px">${Q.total} passende Seeds${Q.ms ? ', ' + (Q.ms / 1000).toFixed(1).replace('.', ',') + ' s' : ''}</div>
               <div class="tl-res">${(Q.results || []).map(x => `<div class="tr"><div class="tr-h"><b>${x.seed}</b><span class="tr-sc">${Math.round(x.score * 10) / 10} Punkte</span><button class="btn small" data-show="${x.seed}">Ansehen</button></div>
                 ${x.hits.map(h => `<div class="tr-l${h.alloc ? ' al' : ''}"><span>${esc(h.node)}</span>→ <b>${esc(h.name)}</b> <small>${esc((h.sd || []).join(' · '))}</small></div>`).join('')}</div>`).join('') || '<div class="muted">Kein Seed erfüllt alle Pflicht-Effekte. Pflicht abwählen oder anderen Sockel nehmen.</div>'}</div>`}</div></div>`;
    }
    return kopf + body;
  },
  render() { lastKey.timeless = null; if (view === 'timeless') renderView(true); },
  bind() {
    const q = s => document.querySelectorAll(s);
    q('[data-typ]').forEach(b => b.onclick = () => { this.typ = +b.dataset.typ; this.res = null; this.such = null; this.wants = {}; this.render(); });
    const so = $('#tlsock'); if (so) so.onchange = () => { this.sock = +so.value; this.res = null; this.such = null; this.render(); if (this.seed) this.zeigeSeed(this.seed); };
    q('[data-tab]').forEach(b => b.onclick = () => { this.tab = b.dataset.tab; this.render(); });
    const go = $('#tlgo'); if (go) go.onclick = () => { const v = $('#tlseed').value; if (v) this.zeigeSeed(v); };
    const si = $('#tlseed'); if (si) si.onkeydown = e => { if (e.key === 'Enter' && si.value) this.zeigeSeed(si.value); };
    const tf = $('#tlf'); if (tf) { let tm; tf.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { this.filter = tf.value; this.render(); setTimeout(() => { const e = $('#tlf'); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } }, 0); }, 250); }; }
    q('[data-mod]').forEach(d => d.onclick = e => { if (e.target.closest('[data-stop]')) return; const id = d.dataset.mod; if (this.wants[id]) delete this.wants[id]; else this.wants[id] = { w: 1, min: false }; this.render(); });
    q('[data-w]').forEach(s => s.onchange = () => { this.wants[s.dataset.w].w = +s.value; });
    q('[data-min]').forEach(c => c.onchange = () => { this.wants[c.dataset.min].min = c.checked; });
    const mi = $('#tlmine'); if (mi) mi.onchange = () => { this.nurMeine = mi.checked; };
    const sb = $('#tlsearch'); if (sb) sb.onclick = () => this.suchen();
    q('[data-show]').forEach(b => b.onclick = () => this.zeigeSeed(b.dataset.show));
    q('#timelessv [data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Kopiert.'); } catch (e) {} });
  },
};
function timeless(force) {
  const el = sec('timeless');
  const k = 'tl'; if (lastKey.timeless === k && !force) return; lastKey.timeless = k;
  if (S.char && S.char.sheet && S.char.sheet.game === 'poe2') {
    lastKey.timeless = null;
    el.innerHTML = `<div class="ph"><div><h1>Timeless-Juwelen</h1><div class="sub">Dieser Rechner funktioniert bisher nur mit Path of Exile 1. Wechsle unter „Profile & Freunde“ auf ein PoE1-Profil, um ihn zu nutzen.</div></div></div>`;
    return;
  }
  el.innerHTML = `<div id="timelessv"><div class="ph"><div><h1>Timeless-Juwelen</h1><div class="sub">Sieh dir an, was ein Timeless Jewel in deinem Tree verändert – oder lass dir den Seed suchen, der genau die Effekte bringt, die du willst.</div></div></div>${TL.html()}</div>`;
  TL.bind();
}
