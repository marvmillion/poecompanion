// PoE Companion – Upgrades: Path of Building rechnet Guide-Items, alle passenden Uniques und Flasks gegen deine Ausrüstung
const UP = {
  d: null, t: null, laedt: false, filt: 'alle', slot: '', budget: 0, sort: 'score', offen: {}, wunschText: '', timer: null,
  SLOT: { 'Weapon 1': 'Waffe', 'Weapon 2': 'Zweithand', 'Helmet': 'Helm', 'Body Armour': 'Brust', 'Gloves': 'Handschuhe', 'Boots': 'Stiefel', 'Amulet': 'Amulett', 'Ring 1': 'Ring 1', 'Ring 2': 'Ring 2', 'Belt': 'Gürtel', 'Ring 3': 'Ring 3', 'Charm 1': 'Charm 1', 'Charm 2': 'Charm 2', 'Charm 3': 'Charm 3', 'Flask 1': 'Flask 1', 'Flask 2': 'Flask 2', 'Flask 3': 'Flask 3', 'Flask 4': 'Flask 4', 'Flask 5': 'Flask 5' },
  QUELLE: { guide: 'Aus deinem Guide', unique: 'Unique', flask: 'Flask', wunsch: 'Wunschliste' },
  slotName(s) { return this.SLOT[s] || s; },
  poe2() { return !!(S.char && S.char.sheet && S.char.sheet.game === 'poe2'); },
  async laden(force) {
    const t = S && S.char && S.char.t; if (!t || this.laedt) return;
    if (!force && this.t === t) return;
    this.laedt = true;
    try { this.d = await api('/api/upgrades'); this.t = t; } catch (e) {}
    this.laedt = false;
    clearTimeout(this.timer);
    if (!this.d || this.d.laeuft || !this.d.list) this.timer = setTimeout(() => this.laden(true), this.d && this.d.list ? 2500 : 1500);
    lastKey.home = null; lastKey.upgrades = null;
    if (view === 'home' || view === 'upgrades') renderView(true);
  },
  wert(c) {
    const dv = (S.farm && S.farm.divine) || 0;
    return c == null ? '' : dv && c >= dv * .8 ? (c / dv).toFixed(1).replace('.', ',') + ' Divine' : Math.round(c) + ' ' + App.wl();
  },
  plus(x, cls) { if (x == null) return ''; return `<span class="${x >= 0.05 ? 'good' : x <= -0.05 ? 'bad' : 'muted'}${cls ? ' ' + cls : ''}">${x > 0 ? '+' : ''}${String(x).replace('.', ',')} %</span>`; },
  trade(v) {
    const lg = (S.char && S.char.info && S.char.info.league) || 'Standard';
    const q = { query: { status: { option: 'online' }, name: v.name, type: v.base }, sort: { price: 'asc' } };
    return `https://www.pathofexile.com/${this.poe2() ? 'trade2/search/poe2' : 'trade/search'}/${encodeURIComponent(lg)}?q=${encodeURIComponent(JSON.stringify(q))}`;
  },
  ninja() {
    const i = (S.char && S.char.info) || {}, sh = (S.char && S.char.sheet) || {};
    const lg = String(i.league || 'Standard').toLowerCase().replace(/\s+/g, '');
    const p = new URLSearchParams(); if (sh.class) p.set('class', sh.class); if (i.skill || sh.skill) p.set('skills', i.skill || sh.skill);
    return `https://poe.ninja/${this.poe2() ? 'poe2' : 'poe1'}/builds/${encodeURIComponent(lg)}?${p}`;
  },
  liste() {
    const L = (this.d && this.d.list) || [], dv = (S.farm && S.farm.divine) || 0;
    let r = L.filter(v => v.art !== 'leer' && v.art !== 'alt');
    if (this.filt !== 'alle') r = r.filter(v => v.art === this.filt);
    if (this.slot) r = r.filter(v => v.slot.replace(/ \d$/, '') === this.slot);
    if (this.budget) r = r.filter(v => v.preis == null || v.preis <= this.budget * (this.budget > 10 ? 1 : dv || 150));
    if (this.sort === 'dps') r = [...r].sort((a, b) => b.dps - a.dps);
    if (this.sort === 'ehp') r = [...r].sort((a, b) => b.ehp - a.ehp);
    return r;
  },
  zeilen(lines, weg) {
    if (!lines || !lines.length) return '<div class="muted">keine Mods</div>';
    return lines.map(l => `<div class="ux ux-${l.k}${l.x ? ' nb' : ''}${weg && l.k === 'i' ? ' weg' : ''}">${l.k === 'i' ? '<i>Implicit</i>' : l.k === 'e' ? '<i>Enchant</i>' : l.k === 'r' ? '<i>Rune</i>' : ''}${esc(l.t)}${l.x ? ' <span class="ux-x" title="Path of Building kann diese Zeile nicht berechnen – sie fehlt in den Prozentwerten">nicht berechnet</span>' : ''}</div>`).join('');
  },
  karte(v, i) {
    const auf = !!this.offen[v.slot + v.name], selten = v.rarity === 'UNIQUE';
    const weg = (v.curLines || []).filter(l => l.k === 'i' || l.k === 'e'), nb = (v.curLines || []).filter(l => l.x);
    const hinweis = nb.length ? `<div class="u-warn">${icon('warn', 13)}<span>Dein aktuelles Item hat ${nb.length === 1 ? 'eine Wirkung' : nb.length + ' Wirkungen'}, die PoB nicht rechnet: <b>${nb.map(l => esc(l.t)).join(' · ')}</b> – die fällt beim Tausch weg.</span></div>` : '';
    return `<div class="uk${i === 0 ? ' top' : ''}${auf ? ' auf' : ''}" data-k="${esc(v.slot + v.name)}">
      <div class="uk-h">
        <span class="un">${i + 1}</span>
        <div class="ut"><div class="uk-n"><span class="uk-s">${this.slotName(v.slot)}</span><b style="color:${rarityColor(v.rarity)}">${esc(v.name)}</b><span class="ug q-${v.art}">${this.QUELLE[v.art] || v.art}</span></div>
          <div class="ud">${v.cur ? 'statt <span style="color:' + rarityColor(v.curRarity) + '">' + esc(v.cur) + '</span>' : 'Slot ist leer'}${v.alt ? ` (Level ${v.alt} – veraltet)` : ''}${v.req ? ` · ab Level ${v.req}` : ''}${v.preis ? ' · ab <b class="gold">' + this.wert(v.preis) + '</b>' : selten ? ' · Preis unbekannt' : ''}</div></div>
        <div class="uv"><div>${this.plus(v.dps)} <small>DPS</small></div><div>${this.plus(v.ehp)} <small>eHP</small></div>${v.ign != null && Math.abs(v.ign) >= 1 ? `<div class="u-ign">${this.plus(v.ign)} <small>Ignite</small></div>` : ''}${v.speed && Math.abs(v.speed) >= 1 ? `<div class="u-ign">${this.plus(v.speed)} <small>Tempo</small></div>` : ''}</div>
        <span class="uk-p">${icon('chev', 14)}</span>
      </div>
      ${(v.wPlus && v.wPlus.length) || (v.wMinus && v.wMinus.length) ? `<div class="u-eff">${(v.wPlus || []).map(w => `<span class="u-ef p" title="${esc(w.t)}">+ ${esc(w.name)}</span>`).join('')}${(v.wMinus || []).map(w => `<span class="u-ef m" title="${esc(w.t)}">− verliert ${esc(w.name)}</span>`).join('')}<span class="u-efh">Wirkung zählt in der Rangliste mit, auch wenn PoB sie nicht in DPS umrechnet</span></div>` : ''}
      ${v.typ === 'Flask' && auf ? `<div class="u-warn kurz u-info">${icon('eye', 13)}<span>PoB rechnet die Flask als dauerhaft aktiv. Im Spiel wirkt sie nur, solange sie läuft – vor allem Defensiv-Flasks sehen dadurch stärker aus, als sie sind. In der Rangliste ist das schon vorsichtig eingerechnet.</span></div>` : ''}
      ${nb.length && !auf && !(v.wMinus && v.wMinus.length) ? `<div class="u-warn kurz">${icon('warn', 13)}<span>Beim Tausch fällt weg, was PoB nicht rechnet: ${nb.map(l => esc(l.t)).join(' · ')}</span></div>` : ''}
      ${auf ? this.erklaerung(v, weg, hinweis, selten) : ''}
    </div>`;
  },
  wc: {}, wk: null, wkT: null, wkLaedt: false,
  async warumLaden(v) {
    const k = v.slot + '|' + v.name; if (this.wc[k]) return;
    this.wc[k] = { busy: true };
    this.wc[k] = await api('/api/upgrades/warum', { slot: v.slot, name: v.name }).catch(e => ({ error: String(e) }));
    lastKey.upgrades = null; if (view === 'upgrades') renderView(true);
  },
  fmt(x, art) {
    if (x == null) return '–';
    if (art === 'zahl') return Math.abs(x) >= 10000 ? num(x) : Math.round(x).toLocaleString('de-DE');
    if (art === 'pct' || art === 'res') return x.toFixed(1).replace('.', ',') + ' %';
    if (art === 'mult') return '×' + x.toFixed(2).replace('.', ',');
    return x.toFixed(2).replace('.', ',');
  },
  zeileBeitrag(z, max) {
    const haupt = Math.max(Math.abs(z.dps || 0), Math.abs(z.ehp || 0) * .6, Math.abs(z.speed || 0) * .8);
    const w = max ? Math.min(100, haupt / max * 100) : 0;
    const chip = (x, l) => x && Math.abs(x) >= 0.1 ? `<span class="${x > 0 ? 'good' : 'bad'}">${x > 0 ? '+' : ''}${String(x).replace('.', ',')} % ${l}</span>` : '';
    const werte = [chip(z.dps, 'DPS'), chip(z.ehp, 'eHP'), chip(z.speed, 'Tempo')].filter(Boolean).join(' ');
    return `<div class="wz${z.x ? ' nb' : ''}"><div class="wz-b" style="width:${w}%"></div>
      <div class="wz-t">${z.k === 'i' ? '<i>Implicit</i>' : z.k === 'e' ? '<i>Enchant</i>' : z.k === 'r' ? '<i>Rune</i>' : ''}${esc(z.t)}</div>
      <div class="wz-v">${werte || (z.x ? '' : '<span class="muted">±0</span>')}${z.x ? ' <span class="ux-x">nicht berechnet</span>' : ''}${z.wirkung ? ` <span class="u-ef p">${esc(z.wirkung)}</span>` : ''}</div></div>`;
  },
  erklaerung(v, weg, hinweis, selten) {
    const k = v.slot + '|' + v.name, W = this.wc[k];
    if (!W) this.warumLaden(v);
    const statisch = `<div class="uk-d">
        <div class="uk-c"><div class="uk-ch">Neu: ${esc(v.name)}</div>${this.zeilen(v.lines)}</div>
        <div class="uk-c alt"><div class="uk-ch">Bisher: ${esc(v.cur || '–')}</div>${this.zeilen(v.curLines, true)}</div>
        ${hinweis}
        <div class="uk-a">${selten ? `<a class="btn small" href="${this.trade(v)}" target="_blank" rel="noopener">${icon('search', 13)} Auf Trade suchen</a>` : ''}</div></div>`;
    if (!W || W.busy) return `<div class="wy-l"><span class="spin">${icon('refresh', 14)}</span> PoB nimmt das Item Zeile für Zeile auseinander …</div>${statisch}`;
    if (W.error) return `<div class="wy-l muted">${esc(W.error)}</div>${statisch}`;
    const nz = [...W.neuZeilen].sort((a, b) => (b.dps + b.ehp * .6) - (a.dps + a.ehp * .6));
    const cz = [...W.curZeilen].sort((a, b) => (b.dps + b.ehp * .6) - (a.dps + a.ehp * .6));
    const max = Math.max(1, ...[...nz, ...cz].map(z => Math.max(Math.abs(z.dps || 0), Math.abs(z.ehp || 0) * .6, Math.abs(z.speed || 0) * .8)));
    const diff = W.diff.slice(0, 14);
    return `<div class="wy">
      <div class="wy-i">${icon('eye', 13)}<span>Gerechnet für deinen Build${W.klasse ? ' (' + esc(W.klasse) + (W.skill ? ', ' + esc(W.skill) : '') + ')' : ''}: PoB setzt das Item ein und nimmt danach jede Zeile einzeln heraus. Das funktioniert so für jeden Build, den PoB laden kann.</span></div>
      ${diff.length ? `<div class="wy-h">Warum das so viel ausmacht</div><div class="wy-s">${diff.map(d => `<div class="wy-r"><span class="wy-n">${esc(d.label)}</span><span class="wy-a">${this.fmt(d.alt, d.art)}</span><span class="wy-p">→</span><span class="wy-b">${this.fmt(d.neu, d.art)}</span>${d.rel != null && d.art === 'zahl' ? `<span class="${d.neu >= d.alt ? 'good' : 'bad'}">${d.rel > 0 ? '+' : ''}${String(d.rel).replace('.', ',')} %</span>` : `<span class="${d.neu >= d.alt ? 'good' : 'bad'}">${d.neu >= d.alt ? '▲' : '▼'}</span>`}</div>`).join('')}</div>` : ''}
      <div class="wy-g">
        <div><div class="wy-h">Was jede Zeile von ${esc(v.name)} bringt</div>${nz.map(z => this.zeileBeitrag(z, max)).join('') || '<div class="muted">keine Mods</div>'}</div>
        <div><div class="wy-h">Was du dafür abgibst (${esc(v.cur || '–')})</div>${cz.map(z => this.zeileBeitrag(z, max)).join('') || '<div class="muted">Slot ist leer</div>'}
          ${weg.length ? `<div class="u-weg">Implicits deines aktuellen Items fallen beim Tausch weg – ist in allen Werten schon eingerechnet.</div>` : ''}</div>
      </div>
      ${hinweis}
      <div class="wy-t"><a class="btn small primary" href="${esc(W.trade)}" target="_blank" rel="noopener">${icon('search', 13)} Genau das auf Trade suchen</a>
        <span class="muted">${selten ? 'Sucht diesen Unique.' : W.tradeMods && W.tradeMods.length ? 'Sucht nach den Mods, die dir etwas bringen (Werte ab 90 %): ' + W.tradeMods.map(esc).join(' · ') : 'Keine Mod bringt dir messbar etwas – Suche nur nach dem Item-Typ.'}</span>
        ${v.art === 'wunsch' ? `<button class="btn small ghost" data-wweg="${esc(v.name)}">Von Wunschliste nehmen</button>` : ''}</div>
    </div>`;
  },
  async wkLaden(eigene) {
    const t = S.char && S.char.t; if (!t || this.wkLaedt || (this.wkT === t && !eigene)) return;
    this.wkLaedt = true;
    this.wk = await api('/api/wickerman', eigene ? { eigene } : {}).catch(e => ({ error: String(e) }));
    this.wkT = t; this.wkLaedt = false; lastKey.upgrades = null; if (view === 'upgrades') renderView(true);
  },
  wickerman() {
    if (this.poe2()) return '';
    this.wkLaden();
    const D = this.wk, TEIL = { 'Head': 'Kopf', 'Torso': 'Torso', 'Upper Limb': 'Arm', 'Lower Limb': 'Bein', '–': 'Ohne Platz' };
    const eigene = (S.settings && S.settings.wickerEigene) || [];
    let inhalt;
    if (!D || this.wkLaedt) inhalt = `<div class="wy-l"><span class="spin">${icon('refresh', 14)}</span> PoB rechnet die Viscera durch …</div>`;
    else if (D.error) inhalt = `<div class="muted">${esc(D.error)}</div>`;
    else inhalt = `<div class="vx-g">${Object.keys(TEIL).map(sl => {
      const L = D.liste.filter(x => x.slot === sl); if (!L.length) return '';
      return `<div class="vx-s"><div class="vx-sh">${TEIL[sl]}</div>${L.filter((x, i) => i < 5 || x.eigen).map((x, i) => `<div class="vx-r${i === 0 ? ' best' : ''}">
        <div class="vx-n">${esc(x.name)}${x.eigen ? ' <span class="ug q-wunsch">eigener</span>' : ''}</div>
        <div class="vx-t">${esc(x.text).replace(/\n/g, '<br>')}</div>
        <div class="vx-v">${Math.abs(x.dps) >= .1 ? this.plus(x.dps) + ' <small>DPS</small>' : ''} ${Math.abs(x.ehp) >= .1 ? this.plus(x.ehp) + ' <small>eHP</small>' : ''} ${Math.abs(x.speed) >= .5 ? this.plus(x.speed) + ' <small>Tempo</small>' : ''}
          ${!x.berechnet ? `<span class="ux-x" title="Path of Building kennt diesen Mod nicht oder nur teilweise">${x.teil ? 'teilweise berechnet' : 'nicht berechnet'}</span>` : ''}${(x.wirkung || []).map(w => ` <span class="u-ef p">${esc(w)}</span>`).join('')}
          ${!x.berechnet && !(x.wirkung || []).length && Math.abs(x.dps) < .1 ? '<span class="muted">selbst bewerten</span>' : ''}</div></div>`).join('')}</div>`;
    }).join('')}</div>`;
    return `<div class="card pad vx"><h3>Wickerman (Covens) – welche Viscera dir am meisten bringen</h3>
      <div class="muted" style="font-size:12.5px;margin:-6px 0 12px">Viscera geben deinem Charakter zusätzliche Mods – ein Platz pro Körperteil. PoB rechnet jeden Mod mit dem Höchstwert in deinen Build. Was PoB nicht kennt, bekommt Punkte für seine Wirkung oder musst du selbst bewerten. Du kannst jeden Mod aus dem Spiel unten selbst eintragen.</div>
      ${inhalt}
      <form id="wkf" class="vx-f"><select id="wks">${Object.entries(TEIL).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
        <input id="wkn" placeholder="Name (z. B. Engorged Eye)"><input id="wkt" placeholder="Mod-Text aus dem Spiel, z. B. 90% increased Armour from Equipped Helmet and Gloves"><button class="btn small primary">Rechnen</button></form>
      ${eigene.length ? `<div class="u-wl" style="margin-top:8px">${eigene.map((e, i) => `<span class="u-wc">${esc(e.name || e.text.slice(0, 30))}<button data-wkweg="${i}" title="entfernen">×</button></span>`).join('')}</div>` : ''}
    </div>`;
  },
  ms: null, msSlot: '', msLaedt: false,
  async modsLaden(slot) {
    this.msSlot = slot; this.msLaedt = true; this.ms = null; lastKey.upgrades = null; renderView(true);
    this.ms = await api('/api/upgrades/mods', { slot }).catch(e => ({ error: String(e) }));
    this.msLaedt = false; lastKey.upgrades = null; renderView(true);
  },
  besteMods() {
    const sl = Object.values((this.d && this.d.slots) || {}).filter(x => x.name && !/^(Flask|Charm)/.test(x.slot));
    if (!sl.length) return '';
    const M = this.ms;
    let inhalt = '';
    if (this.msLaedt) inhalt = `<div class="wy-l"><span class="spin">${icon('refresh', 14)}</span> PoB testet jeden möglichen Prefix und Suffix einzeln …</div>`;
    else if (M && M.error) inhalt = `<div class="muted">${esc(M.error)}</div>`;
    else if (M) inhalt = `<div class="muted" style="font-size:12.5px;margin-bottom:8px">Jeder Mod, der auf <b>${esc(M.base)}</b> rollen kann (beste Stufe für Itemlevel 82), einzeln in deinen Build gerechnet. Ganz oben steht, was am meisten bringt – darauf solltest du beim Kaufen oder Craften achten.</div>
      <div class="seg bm-sort">${[['dps', 'Mehr Schaden'], ['ehp', 'Mehr Verteidigung'], ['score', 'Gesamt']].map(([k, l]) => `<button data-mss="${k}" class="${(this.msSort || 'dps') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="bm-l">${M.mods.slice().filter(m => (this.msSort || 'dps') === 'score' || m[this.msSort || 'dps'] > 0.05).sort((a, b) => (b[this.msSort || 'dps'] - a[this.msSort || 'dps']) || (b.score - a.score)).slice(0, 24).map((m, i) => `<div class="bm-r"><span class="un">${i + 1}</span><div class="bm-t"><span class="bm-k ${m.typ === 'Prefix' ? 'p' : 's'}">${m.typ}</span>${(m.quelle === 'desecrated' ? '<span class="bm-k a">Abyss</span>' : m.quelle === 'genesis' ? '<span class="bm-k g" title="Nur über den Genesis-Baum (Breach, Wombgifts)">Genesis</span>' : /essence/.test(m.quelle) ? '<span class="bm-k e" title="Nur per Essenz">Essenz</span>' : '')}<span class="bm-x">${esc(m.text).replace(/\n/g, ' / ')}</span></div>
        <div class="bm-v">${Math.abs(m.dps) >= .1 ? this.plus(m.dps) + ' <small>DPS</small>' : ''} ${Math.abs(m.ehp) >= .1 ? this.plus(m.ehp) + ' <small>eHP</small>' : ''} ${Math.abs(m.speed) >= .5 ? this.plus(m.speed) + ' <small>Tempo</small>' : ''}${(m.wirkung || []).map(w => ` <span class="u-ef p">${esc(w)}</span>`).join('')}${!m.score && m.nb ? '<span class="ux-x">nicht berechnet</span>' : ''}${m.chance != null ? `<small class="muted"> · ${String(m.chance).replace('.', ',')} % pro Exalted mit Omen</small>` : ''}</div></div>`).join('')}</div>
      ${M.game === 'poe2' ? this.beispiele(M) : ''}
      ${M.game === 'poe2' ? `<button class="btn small" id="ms2cr" data-base="${esc(M.base)}" style="margin-top:10px">${icon('bolt', 13)} ${esc(M.base)} im Crafting-Berater planen</button>` : ''}`;
    else inhalt = '<div class="muted" style="font-size:12.5px">Slot wählen – dann rechnet PoB jeden möglichen Prefix und Suffix einzeln durch und zeigt, welche Mods dir am meisten bringen.</div>';
    return `<div class="card pad bm frame"><h3>Rare-Items: welche Mods dir am meisten bringen</h3>
      <div class="seg bm-s">${sl.map(x => `<button data-ms="${esc(x.slot)}" class="${this.msSlot === x.slot ? 'on' : ''}">${this.slotName(x.slot)}</button>`).join('')}</div>
      ${inhalt}</div>`;
  },
  // Beispiel-Items für den gewählten Slot: günstig, Top-Spieler, ideal für deinen Build
  beispiele(M) {
    if (!UP._top) { UP._top = {}; fetch('/ui/data/topgear_poe2.json').then(r => r.json()).then(j => { UP._top = j; lastKey.upgrades = null; renderView(true); }).catch(() => {}); }
    const key = this.msSort || 'dps', val = m => (key === 'score' ? m.score : m[key] + m.score * .01);
    const kand = M.mods.filter(m => m.quelle !== 'genesis' && val(m) > .05).sort((a, b) => val(b) - val(a));
    const rest = M.mods.filter(m => m.quelle !== 'genesis' && m.score > .05).sort((a, b) => b.score - a.score);
    const pick = (n, nurNormal) => {
      const out = [], zahl = { Prefix: 0, Suffix: 0 }, fam = new Set(); let ess = 0, aby = 0;
      for (const m of [...kand, ...rest]) {
        const f = m.familie || m.id;
        if (zahl[m.typ] >= n || fam.has(f) || out.includes(m)) continue;
        const istA = m.quelle === 'desecrated', istE = /essence/.test(m.quelle);
        if ((istA || istE) && nurNormal) continue;
        if (istA && aby >= 1) continue; if (istE && ess >= 1) continue;
        out.push(m); zahl[m.typ]++; fam.add(f); if (istA) aby++; if (istE) ess++;
      }
      return out.sort((a, b) => (a.typ === 'Prefix' ? 0 : 1) - (b.typ === 'Prefix' ? 0 : 1));
    };
    const stufe = (m, i) => { const st = m.stufen || []; if (!st.length) return { t: m.text, il: 0, n: '' }; const k = Math.min(i, st.length - 1); return { t: st[k].t, il: st[k].il, n: 'T' + (k + 1) }; };
    const bz = { Prefix: 0, Suffix: 0 }, budget = pick(2, true).map(m => ({ m, s: stufe(m, 1 + Math.min(1, bz[m.typ]++)) })), ideal = pick(3, false).map(m => ({ m, s: stufe(m, 0) }));
    this.bx = { budget: budget.map(x => ({ id: x.m.id, il: x.s.il })), ideal: ideal.map(x => ({ id: x.m.id, il: x.s.il })) };
    const summe = L => { const d = L.reduce((a, x) => a + (x.m.dps || 0), 0), e = L.reduce((a, x) => a + (x.m.ehp || 0), 0); return `${d >= .1 ? this.plus(d) + ' <small>DPS</small> ' : ''}${e >= .1 ? this.plus(e) + ' <small>eHP</small>' : ''}`; };
    const zeile = (t, cls, rechts) => `<div class="bx-m ${cls || ''}"><span>${esc(t).replace(/\n/g, '<br>')}</span>${rechts ? `<i>${rechts}</i>` : ''}</div>`;
    const modZeilen = L => L.map(({ m, s }) => zeile(s.t, m.quelle === 'desecrated' ? 'a' : /essence/.test(m.quelle) ? 'e' : '', (m.quelle === 'desecrated' ? 'Abyss · ' : /essence/.test(m.quelle) ? 'Essenz · ' : '') + (m.typ === 'Prefix' ? 'P' : 'S') + (s.n ? ' ' + s.n : ''))).join('');
    const tip = (titel, name, base, rar, inhalt) => `<div class="bx-it ${rar}"><div class="bx-h"><b>${esc(name)}</b><span>${esc(base)}</span></div><div class="bx-b">${inhalt}</div></div>`;
    const T0 = UP._top || {}, T = Object.assign({}, T0, window.I18N && I18N.lang() === 'en' && T0.quelleEn ? { quelle: T0.quelleEn } : {}), sk = String(((S.char && S.char.sheet) || {}).skill || ((S.char && S.char.info) || {}).skill || ''), kl = String(((S.char && S.char.sheet) || {}).class || '');
    const passt = T.passt && (sk.includes(T.passt.skill) || kl.includes(T.passt.klasse));
    const tg = passt && T.slots && T.slots[M.slot];
    const frei = n => n < 3 ? `<div class="bx-frei">${3 - n}× frei – mit Leben oder Resistenzen füllen</div>` : '';
    const zP = L => L.filter(x => x.m.typ === 'Prefix').length, zS = L => L.filter(x => x.m.typ === 'Suffix').length;
    return `<div class="bx-wrap"><h4 class="bx-t">Beispiel-Items für <span>${esc(this.slotName(M.slot))}</span></h4>
      <div class="bx-g">
        <div class="bx"><div class="bx-k">Low Budget</div><div class="bx-d">Die wichtigsten Mods mit T2–T3-Werten. Solche Items kosten auf dem Markt meist wenig oder lassen sich günstig craften.</div>
          ${tip('', 'Low-Budget-Beispiel', M.base, 'rare', modZeilen(budget) + `<div class="bx-frei">Rest frei – Leben oder Resistenzen sind hier ein guter Bonus</div>`)}
          <div class="bx-f">${summe(budget) ? 'Mit T1-Werten wären das ' + summe(budget) + ', mit diesen Stufen etwas weniger' : ''}</div>
          ${budget.length ? `<button class="btn small" data-bxcr="budget">${icon('bolt', 13)} So craftest du das</button>` : ''}</div>
        <div class="bx"><div class="bx-k">Endgame · Top-Spieler</div>
          ${tg ? `<div class="bx-d">So sieht das Item bei einem der stärksten Spieler mit deinem Build aus.</div>
            ${tip('', tg.name === 'Rare' ? 'Rare' : tg.name, tg.base, tg.rar === 'UNIQUE' ? 'unique' : 'rare', tg.mods.map(t => zeile(t, /\(Abyss\)/.test(t) ? 'a' : '')).join('') + (tg.extra || []).map(t => zeile(t, 'x')).join(''))}
            <div class="bx-f muted" title="${esc(T.quelle || '')}">Quelle: <span class="notr">${esc(T.quelle || '')}</span></div>`
          : `<div class="bx-d">Für diesen Slot und Build habe ich noch kein Top-Spieler-Item hinterlegt. Auf poe.ninja siehst du, was die besten Spieler tragen.</div><a class="btn small" href="${this.ninja()}" target="_blank" rel="noopener">${icon('chart', 13)} poe.ninja öffnen</a>`}</div>
        <div class="bx ideal"><div class="bx-k">Ideal für deinen Build</div><div class="bx-d">Die stärkste Kombination laut PoB: je Seite drei Mods mit T1, höchstens eine Essenz und ein Abyss-Mod.</div>
          ${tip('', 'Perfekter Prototyp', M.base, 'rare', modZeilen(ideal) + frei(Math.min(zP(ideal), zS(ideal))))}
          <div class="bx-f">${summe(ideal) ? 'Summe der Einzelwerte ' + summe(ideal) : ''}</div>
          ${ideal.length ? `<button class="btn small" data-bxcr="ideal">${icon('bolt', 13)} So craftest du das</button>` : ''}</div>
      </div></div>`;
  },
  ausruestung() {
    const sl = (this.d && this.d.slots) || {};
    const reihe = Object.values(sl).filter(x => x.name);
    if (!reihe.length) return '';
    return `<div class="card pad u-eq"><h3>Deine Ausrüstung – was jedes Teil bringt</h3>
      <div class="muted" style="font-size:12.5px;margin:-6px 0 10px">So viel DPS und eHP verlierst du, wenn die Mods dieses Teils (inklusive Implicits) fehlen würden. Kleine Werte = guter Platz für ein Upgrade.</div>
      <div class="u-eqg">${reihe.map(x => {
        const nb = (x.lines || []).filter(l => l.x), impl = (x.lines || []).filter(l => l.k === 'i');
        return `<div class="u-eqi"><div class="u-eqs">${this.slotName(x.slot)}</div><div class="u-eqn" style="color:${rarityColor(x.rarity)}">${esc(x.name)}</div>
          <div class="u-eqv">${this.plus(x.wert && x.wert.dps)} <small>DPS</small> ${this.plus(x.wert && x.wert.ehp)} <small>eHP</small></div>
          ${x.wert && x.wert.phys && Math.abs(x.wert.phys[1] - x.wert.phys[0]) >= 0.5 ? `<div class="u-eqc" title="Anteil Physical-Schaden an deinem Treffer: jetzt ${x.wert.phys[0]} %, ohne die Mods dieses Teils ${x.wert.phys[1]} %">Physical-Anteil ohne dieses Teil: ${String(x.wert.phys[1]).replace('.', ',')} % statt ${String(x.wert.phys[0]).replace('.', ',')} %</div>` : x.wert && x.wert.phys && (x.lines || []).some(l => /Physical Damage Converted/i.test(l.t)) ? `<div class="u-eqc">Umwandlung hier bringt kaum etwas: Dein Schaden ist auch ohne sie zu ${String(x.wert.fire[1]).replace('.', ',')} % Fire</div>` : ''}
          ${impl.length ? `<div class="u-eqm" title="${esc(impl.map(l => l.t).join('\n'))}">Implicit: ${esc(impl[0].t)}${impl.length > 1 ? ' +' + (impl.length - 1) : ''}</div>` : ''}
          ${nb.length ? `<div class="u-eqx" title="${esc(nb.map(l => l.t).join('\n'))}">${icon('warn', 11)} ${nb.length} nicht berechnet</div>` : ''}</div>`;
      }).join('')}</div></div>`;
  },
  html() {
    if (!S.char) return '';
    this.laden();
    const D = this.d;
    if (!D || !D.list) return `<div class="card pad"><div class="empty"><span class="spin" style="color:var(--gold2)">${icon('refresh', 34)}</span><div><b>Path of Building lädt deinen Charakter …</b>Danach dauert die Rechnung nur ein paar Sekunden. Beim nächsten Mal steht hier sofort das letzte Ergebnis.</div></div></div>`;
    const r = this.liste(), dringend = D.list.filter(v => v.art === 'leer' || v.art === 'alt');
    const chips = (name, opts, cur) => `<div class="seg" data-f="${name}">${opts.map(([k, l]) => `<button class="${String(cur) === String(k) ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>`;
    const slots = [...new Set(D.list.filter(v => v.slot).map(v => v.slot.replace(/ \d$/, '')))];
    const wl = (S.settings && S.settings.upgWunsch) || [];
    return `
    ${D.cache ? `<div class="card pad u-lauf"><span class="spin">${icon('refresh', 16)}</span><div><b>Letztes Ergebnis</b> – Path of Building rechnet gerade neu, die Liste aktualisiert sich gleich von selbst.</div></div>` : D.laeuft ? `<div class="card pad u-lauf"><span class="spin">${icon('refresh', 16)}</span><div><b>PoB rechnet alle passenden Uniques und Flasks durch …</b> ${D.fertig} Items gerechnet. Die Liste füllt sich laufend – der Item-Check funktioniert nebenbei weiter.</div><div class="u-bar"><i style="width:${Math.min(96, D.fertig / 9)}%"></i></div></div>` : ''}
    ${dringend.length ? `<div class="alert warn" style="margin-bottom:14px">${icon('warn', 16)}<div><b>Erst das hier</b>${dringend.map(v => v.art === 'leer' ? `${this.slotName(v.slot)} ist leer.` : `${this.slotName(v.slot)}: ${esc(v.cur || v.base)} ist von Level ${v.req} – ersetzen bringt viel.`).join(' ')}</div></div>` : ''}
    ${D.game === 'poe2' ? this.besteMods() : ''}
    <div class="card pad u-fl">
      ${chips('filt', [['alle', 'Alle'], ['guide', 'Guide'], ['unique', 'Uniques'], ...(D.game === 'poe2' ? [] : [['flask', 'Flasks']]), ['wunsch', 'Wunschliste']], this.filt)}
      ${chips('slot', [['', 'Alle Slots'], ...slots.map(s => [s, this.slotName(s)])], this.slot)}
      ${chips('budget', [[0, 'Jedes Budget'], [50, '≤ 50 ' + App.wl()], [1, '≤ 1 Divine'], [10, '≤ 10 Divine']], this.budget)}
      ${chips('sort', [['score', 'Bester Gesamtgewinn'], ['dps', 'Meiste DPS'], ['ehp', 'Meiste eHP']], this.sort)}
    </div>
    <div class="u-grid">
      <div class="u-list">${r.length ? r.slice(0, 40).map((v, i) => this.karte(v, i)).join('') : `<div class="card pad muted">${D.laeuft ? 'Noch nichts in dieser Auswahl – PoB rechnet noch.' : 'Nichts gefunden, was in dieser Auswahl spürbar besser ist als deine Ausrüstung.'}</div>`}</div>
      <div class="u-side">
        <div class="card pad"><h3>Wie gerechnet wird</h3><div class="u-how">
          <p>Jedes Item wird in Path of Building <b>in deinen Build eingesetzt</b> und komplett durchgerechnet – mit Implicits, Umwandlung (z. B. Physical zu Fire), Ignite, Auren und deinen Flasks (alle aktiv, wie im Mapping).</p>
          <p>Was dabei <b>wegfällt</b>, ist eingerechnet: Tauschst du Handschuhe mit Implicit, zählt der Verlust automatisch mit.</p>
          <p>Zeilen mit <span class="ux-x">nicht berechnet</span> kann PoB nicht beziffern. Wichtige Wirkungen wie <b>Ignite breitet sich aus</b> (bei Ignite-Builds) bekommen trotzdem Punkte in der Rangliste – wer sie verliert, rutscht nach unten.</p>
          <p>${D.game === 'poe2' ? `Neue Charms ersetzen deinen schwächsten Charm (${esc(this.slotName(D.charmSlot || 'Charm 1'))}), Life- und Mana-Flasks ihren eigenen Platz.` : `Neue Flasks ersetzen deine schwächste Nicht-Life-Flask (${esc(this.slotName(D.flaskSlot || 'Flask 5'))}).`}</p></div></div>
        <div class="card pad"><h3>Was spielen andere?</h3><div class="muted" style="font-size:12.5px;margin-bottom:10px">poe.ninja zeigt, welche Items andere ${esc((S.char.sheet && S.char.sheet.class) || '')}s mit deinem Skill tragen. Trag interessante Items unten in die Wunschliste ein – PoB rechnet sie dann für deinen Build.</div>
          <a class="btn small" href="${this.ninja()}" target="_blank" rel="noopener">${icon('chart', 13)} Auf poe.ninja ansehen</a></div>
        <div class="card pad"><h3>Wunschliste</h3><div class="muted" style="font-size:12.5px;margin-bottom:8px">Unique-Namen eintragen, z. B. Cinderswallow Urn oder Lost Unity.</div>
          <div class="u-wl">${wl.map(n => `<span class="u-wc">${esc(n)}<button data-wweg="${esc(n)}" title="entfernen">×</button></span>`).join('') || '<span class="muted">noch leer</span>'}</div>
          <form id="upwf" class="u-wf"><input id="upwi" list="upwdl" placeholder="Unique-Name …" autocomplete="off" value="${esc(this.wunschText)}"><datalist id="upwdl"></datalist><button class="btn small primary">Rechnen</button></form></div>
      </div>
    </div>
    ${D.game === 'poe2' ? '' : this.besteMods()}
    ${this.wickerman()}
    ${this.ausruestung()}`;
  },
  async wunsch(namen) {
    await api('/api/upgrades/wunsch', { namen }).catch(() => {});
    S.settings.upgWunsch = namen; toast('Wird in Path of Building gerechnet …');
    this.d && (this.d.laeuft = true); this.laden(true);
  },
  bind() {
    const el = sec('upgrades');
    el.onclick = e => {
      const f = e.target.closest('[data-f] button');
      if (f) { const k = f.parentNode.dataset.f, v = f.dataset.v; this[k] = (k === 'budget') ? +v : v; lastKey.upgrades = null; renderView(true); return; }
      const w = e.target.closest('[data-wweg]');
      if (w) { e.stopPropagation(); this.wunsch(((S.settings && S.settings.upgWunsch) || []).filter(n => n !== w.dataset.wweg)); return; }
      const ms = e.target.closest('[data-ms]');
      if (ms) { this.modsLaden(ms.dataset.ms); return; }
      const mss = e.target.closest('[data-mss]');
      if (mss) { this.msSort = mss.dataset.mss; lastKey.upgrades = null; renderView(true); return; }
      const bxc = e.target.closest('[data-bxcr]');
      if (bxc && this.bx && this.ms) { CR.base = this.ms.base; CR.wunsch = {}; (this.bx[bxc.dataset.bxcr] || []).forEach(x => { CR.wunsch[x.id] = x.il || 0; }); location.hash = 'craft'; setTimeout(() => CR.ladePool(), 50); return; }
      if (e.target.closest('#ms2cr')) { CR.base = e.target.closest('#ms2cr').dataset.base; CR.wunsch = {}; location.hash = 'craft'; setTimeout(() => CR.ladePool(), 50); return; }
      const wk = e.target.closest('[data-wkweg]');
      if (wk) { const L = [...((S.settings && S.settings.wickerEigene) || [])]; L.splice(+wk.dataset.wkweg, 1); S.settings.wickerEigene = L; this.wkLaden(L); return; }
      const h = e.target.closest('.uk-h');
      if (h && !e.target.closest('a,button')) { const k = h.parentNode.dataset.k; this.offen[k] = !this.offen[k]; lastKey.upgrades = null; renderView(true); }
    };
    const wf = el.querySelector('#wkf');
    if (wf) wf.onsubmit = e => {
      e.preventDefault(); const t = el.querySelector('#wkt').value.trim(); if (!t) return;
      const L = [...((S.settings && S.settings.wickerEigene) || []), { slot: el.querySelector('#wks').value, name: el.querySelector('#wkn').value.trim(), text: t }];
      S.settings.wickerEigene = L; toast('Wird in Path of Building gerechnet …'); this.wkLaden(L);
    };
    const fm = el.querySelector('#upwf'), inp = el.querySelector('#upwi');
    if (fm) fm.onsubmit = e => {
      e.preventDefault(); const n = inp.value.trim(); if (!n) return;
      this.wunschText = ''; this.wunsch([...new Set([...((S.settings && S.settings.upgWunsch) || []), n])]);
    };
    if (inp) inp.oninput = async () => {
      this.wunschText = inp.value; if (inp.value.length < 3) return;
      const r = await api('/api/prices/names?q=' + encodeURIComponent(inp.value)).catch(() => null);
      const dl = el.querySelector('#upwdl'); if (dl && r) dl.innerHTML = (Array.isArray(r) ? r : []).map(n => `<option value="${esc(n.n || n)}">`).join('');
    };
  },
};

function upgrades(force) {
  const el = sec('upgrades');
  if (!S.char) { lastKey.upgrades = null; return needProfile(el); }
  const k = JSON.stringify([UP.d && UP.d.t, UP.filt, UP.slot, UP.budget, UP.sort, UP.offen, (S.settings || {}).upgWunsch, S.char.t, Object.keys(UP.wc).length, UP.wk && UP.wk.t, UP.wkLaedt, UP.msSlot, UP.msLaedt, !!UP.ms]);
  if (lastKey.upgrades === k && !force) return;
  if (['upwi', 'wkt', 'wkn'].includes(document.activeElement && document.activeElement.id) && lastKey.upgrades !== null) return;
  lastKey.upgrades = k;
  const fokus = document.activeElement && document.activeElement.id === 'upwi';
  el.innerHTML = `<div class="ph"><div><h1>Upgrades</h1><div class="sub">Was dich als Nächstes am meisten stärker macht – jedes Item komplett in Path of Building gegen deine Ausrüstung gerechnet.</div></div></div>${UP.html()}`;
  UP.bind();
  if (fokus) { const i = el.querySelector('#upwi'); i && (i.focus(), i.setSelectionRange(i.value.length, i.value.length)); }
}
