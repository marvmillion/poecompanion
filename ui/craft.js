// PoE Companion – Crafting-Berater (PoE 2): Basis wählen, Wunsch-Mods anklicken, Plan mit Chancen und Kosten
const CR = {
  base: '', ilvl: 82, stufe: 'normal', budget: 40, filt: 'normal', sort: 'wert', pool: null, laedt: false, wunsch: {}, plan: null, planLaedt: false, wahl: 'rezept', rune: '', serle: false, astrid: false, aldur: false, sug: [], hilfe: false, essenz: true, echo: true, item: null, itemT: null, paste: false, weg: { billig: null, stark: null },
  QUELLE: { normal: 'Normal', desecrated: 'Abyss', essence: 'Nur Essenz', perfect_essence: 'Perfect Essenz' },
  async ladePool() {
    if (!this.base) return;
    this.laedt = true; this.pool = null; this.plan = null; this.render();
    try { this.pool = await api(`/api/craft/pool?base=${encodeURIComponent(this.base)}&ilvl=${this.ilvl}&stufe=${this.stufe}&rune=${this.rune}`); if (!this.pool.rune) this.rune = ''; } catch (e) { this.pool = { error: String(e) }; }
    this.laedt = false; this.render();
    if (Object.keys(this.wunsch).length) this.rechne();
  },
  async rechne() {
    const w = Object.entries(this.wunsch).map(([id, minIl]) => ({ id, minIl }));
    if (!w.length) { this.plan = null; this.render(); return; }
    this.planLaedt = true; this.render();
    try { this.plan = await api('/api/craft/plan', { base: this.base, ilvl: this.ilvl, wunsch: w, opt: { stufe: this.stufe, budget: this.budget, essenz: this.essenz, echo: this.echo, rune: this.rune, serle: this.serle, astrid: this.astrid, aldur: this.aldur,
      wegBillig: this.weg.billig, wegStark: this.weg.stark, start: this.item && this.item.basis === this.base ? { rar: this.item.rar, mods: this.item.mods.map(m => ({ id: m.id, il: m.il, fx: m.fx, q: m.q, f: m.f, seite: m.seite })) } : null } }); } catch (e) { this.plan = { error: String(e) }; }
    this.planLaedt = false; this.render();
    if (this.item) this.ladeItem(null, true);
  },
  // Item aus dem Spiel (Crafting-Taste) oder eingefügter Text: Basis übernehmen, Mods anzeigen, alle Möglichkeiten
  async ladeItem(text, nurMoeglich) {
    try {
      const r = await api('/api/craft/item', { text: text || (this.item && this.item.text) || '', wunsch: Object.keys(this.wunsch) });
      if (r.error) { this.itemFehler = r.error; this.render(); return; }
      r.text = text || r.text || (this.item && this.item.text) || ''; this.itemFehler = null;
      const neu = !this.item || this.item.basis !== r.basis || this.item.text !== r.text;
      this.item = r;
      if (!nurMoeglich && neu) { this.base = r.basis; this.ilvl = r.ilvl; this.paste = false; this.weg = { billig: null, stark: null }; await this.ladePool(); }
      else this.render();
    } catch (e) { this.itemFehler = String(e); this.render(); }
  },
  // Build-Vorschlag: die Mods mit dem meisten Nutzen laut Path of Building (pro Seite höchstens die freien Plätze)
  score(w) { return w ? w.dps + w.ehp * .6 + (w.speed || 0) * .5 : -1; },
  vorschlag() {
    const P = this.pool; if (!P || !P.mods) return;
    const I = this.item && this.item.basis === this.base ? this.item : null;
    const bleibt = I ? I.mods.filter(m => m.fx || m.q === 'genesis' || m.q === 'desecrated' || (m.id in this.wunsch)) : [];
    const frei = { p: 3 - bleibt.filter(m => m.seite === 'p').length, s: 3 - bleibt.filter(m => m.seite === 's').length };
    const fam = new Set(bleibt.map(m => m.f || ((P.mods.find(x => x.id === m.id) || {}).familie)));
    this.wunsch = {};
    for (const sd of ['p', 's']) {
      const L = P.mods.filter(m => (m.quelle === 'normal' || m.quelle === 'rune') && m.seite === sd && m.wert && this.score(m.wert) > .3 && !fam.has(m.familie))
        .sort((a, b) => this.score(b.wert) - this.score(a.wert)).slice(0, Math.max(0, frei[sd]));
      L.forEach(m => { this.wunsch[m.id] = m.stufen && m.stufen.length > 1 ? m.stufen[Math.min(1, m.stufen.length - 1)].il : 0; });
    }
    if (I) I.mods.filter(m => !m.extern && this.score((P.mods.find(x => x.id === m.id) || {}).wert) > .3).forEach(m => { if (!(m.id in this.wunsch)) this.wunsch[m.id] = 0; });
    this.vorschlagInfo = Object.keys(this.wunsch).length ? null : 'Path of Building findet auf dieser Basis keinen Mod, der deinem Build messbar hilft.';
    this.rechne();
  },
  // So sieht das Ziel-Item aus: vorhandene Mods + gewählte Wunsch-Mods, im Stil der Item-Box im Spiel
  vorschau() {
    const P = this.pool; if (!P || !P.basis) return '';
    const I = this.item && this.item.basis === this.base ? this.item : null;
    const ids = Object.keys(this.wunsch); if (!ids.length && !I) return '';
    const byId = id => P.mods.find(m => m.id === id);
    const zeilen = { p: [], s: [] };
    if (I) I.mods.forEach(m => zeilen[m.seite] && zeilen[m.seite].push({ t: m.text.replace(/\(\d+(?:\.\d+)?-\d+(?:\.\d+)?\)/g, ''), k: m.fx ? 'fx' : m.q === 'genesis' ? 'gen' : m.q === 'desecrated' ? 'aby' : m.q === 'essence' ? 'ess' : (m.id in this.wunsch ? 'ok' : 'alt'), q: m.quelle }));
    ids.forEach(id => { if (I && I.mods.some(m => m.id === id)) return; const m = byId(id); if (!m) return; const st = (m.stufen || []).find(t => t.il === +this.wunsch[id]) || (m.stufen || [])[0];
      zeilen[m.seite].push({ t: (st ? st.text : m.text), k: 'ziel', q: st && +this.wunsch[id] ? 'ab Stufe Lv ' + st.il : '' }); });
    const zz = z => `<div class="iv-l ${z.k}">${esc(z.t).replace(/\n/g, '<br>')}${z.k === 'ziel' ? `<i>Ziel${z.q ? ' · ' + esc(z.q) : ''}</i>` : z.k === 'fx' ? '<i>fraktiert</i>' : z.k === 'gen' ? '<i>Genesis</i>' : z.k === 'aby' ? '<i>Abyss</i>' : z.k === 'ess' ? '<i>gecraftet</i>' : z.k === 'alt' ? '<i>unnötig</i>' : ''}</div>`;
    const rar = I ? I.rar : (ids.length > 2 ? 'rare' : 'magic');
    const box = this.itemBox({ basis: P.basis.n, rar, ilvl: this.ilvl, implicits: I ? I.implicits : [], korrupt: false },
      zeilen.p.map(zz).join('') + zeilen.s.map(zz).join(''), 'Ziel-Item');
    return box.replace(/<\/div><\/div>$/, `<div class="iv-foot"><span>${zeilen.p.length}/3 Prefixe</span><span>${zeilen.s.length}/${this.serle ? 4 : 3} Suffixe</span></div></div></div>`);
  },
  art(base) {
    if (!this._art) { this._art = {}; fetch('/ui/data/baseart_poe2.json').then(r => r.json()).then(j => { this._art = j; this.render(); }).catch(() => {}); }
    const p = this._art[base]; return p ? 'https://cdn.poe2db.tw/image/' + p + '.webp' : '';
  },
  sauber(t) { return String(t || '').replace(/\(\d+(?:\.\d+)?-\d+(?:\.\d+)?\)/g, ''); },
  // Item-Box im Stil des Spiels, mit dem offiziellen Item-Bild
  itemBox(I, zeilen, titel) {
    const bild = this.art(I.basis);
    return `<div class="iv iv-${I.rar}"><div class="iv-h"><b>${esc(titel || I.basis)}</b>${titel ? `<span>${esc(I.basis)}</span>` : ''}</div>
      ${bild ? `<div class="iv-art"><img src="${esc(bild)}" alt="${esc(I.basis)}" onerror="this.parentNode.remove()"></div>` : ''}
      <div class="iv-b"><div class="iv-meta">Itemlevel <b>${I.ilvl}</b>${I.korrupt ? ' · <span class="bad">Corrupted</span>' : ''}</div>
      ${I.implicits && I.implicits.length ? `<div class="iv-sep"></div>${I.implicits.map(x => `<div class="iv-l imp">${esc(this.sauber(x.text))}</div>`).join('')}` : ''}
      <div class="iv-sep"></div>${zeilen || '<div class="iv-l alt">keine Mods</div>'}</div></div>`;
  },
  itemKarte() {
    const I = this.item, taste = (S.settings && S.settings.hotkeyCraft) || 'ALT+X';
    const kopf = `<div class="ik-kopf"><h3>Dein Item</h3><span class="muted">Im Spiel mit der Maus aufs Item zeigen und <kbd>${esc(taste)}</kbd> drücken</span></div>`;
    const einf = `<div class="cr-paste">${this.paste ? `<textarea id="crpt" rows="6" placeholder="Item-Text hier einfügen (im Spiel Strg+Alt+C, dann hier Strg+V)"></textarea><div style="display:flex;gap:8px;margin-top:6px"><button class="btn small primary" id="crpo">Übernehmen</button><button class="btn small ghost" id="crpc">Abbrechen</button></div>` : `<button class="btn small ghost" id="crpb">${icon('item', 13)} Item-Text einfügen</button>${I ? ' <button class="btn small ghost" id="crpx">Item entfernen</button>' : ''}`}</div>`;
    if (!I) return `<div class="card pad cr-item">${kopf}${this.itemFehler ? `<div class="u-warn"><span>${esc(this.itemFehler)}</span></div>` : '<div class="muted" style="font-size:12.5px">Noch kein Item. Mit der Taste holst du ein Item aus dem Spiel – der Berater sagt dir dann, welche Mods bleiben, welche weg sollen und was für deinen Build drauf muss.</div>'}${einf}</div>`;
    const V = I.plan || {}, VM = V.mods || I.mods;
    const U = { behalten: ['ok', 'Behalten'], ok: ['mid', 'Okay'], weg: ['bad', 'Weg damit'], fest: ['fx', 'Fraktiert'], unklar: ['unk', '?'] };
    const zeilen = VM.map(m => { const u = U[m.urteil] || null;
      return `<div class="iv-l ${m.urteil === 'weg' ? 'weg' : m.q === 'genesis' ? 'gen' : m.q === 'desecrated' ? 'aby' : m.fx ? 'fx' : ''}" title="${esc(m.grund || '')}">${esc(this.sauber(m.text))}${u ? `<em class="u-${u[0]}">${u[1]}</em>` : ''}</div>`; }).join('');
    const box = this.itemBox(I, zeilen, ({ rare: 'Seltenes Item', magic: 'Magisches Item', normal: 'Weißes Item' })[I.rar] || '');
    const dv = I.divine || (this.plan || {}).divine;
    const [wegKarte, einkauf] = this.wegHtml(V, I.icons, dv, I.preise, 'Dein Weg zum besseren Item');
    const MOL = I.moeglich || [];
    const MO = MOL.length ? `<details class="cr-more"${this.alleMo ? ' open' : ''}><summary>Alle ${MOL.length} Crafting-Möglichkeiten für dieses Item</summary><ul class="cr-mos">${MOL.map(o => `<li class="cr-mo ${o.art || ''}"><b>${esc(o.t)}</b>${o.preis ? `<em>${this.ex(o.preis, dv)}</em>` : ''}<span>${esc(o.d)}</span></li>`).join('')}</ul></details>` : '';
    return `<div class="card pad cr-item">${kopf}<div class="ik-grid"><div class="ik-links">${box}${(I.unbekannt || []).length ? `<div class="muted" style="font-size:11.5px;margin-top:6px">Nicht erkannt: ${I.unbekannt.map(esc).join(' · ')}</div>` : ''}
      ${!I.erweitert && I.mods.length ? '<div class="muted" style="font-size:11.5px;margin-top:6px">Tipp: mit Strg+Alt+C kopiert sehe ich Prefix/Suffix und Stufen genau.</div>' : ''}${einkauf}${einf}</div>
      <div>${wegKarte}${MO}</div></div></div>`;
  },
  wegHtml(V, icons, dv, preise, titel) {
    const chip = (l, v, k) => v == null ? '' : `<span class="st-chip ${k || ''}"><small>${l}</small>${v}</span>`;
    const ART = { an: 'Platz schaffen', ex: 'Mod hinzufügen', ess: 'Garantiert per Essenz', abyss: 'Abyss', div: 'Fertig machen', base: 'Basis', start: 'Start', chaos: 'Schlüssel-Mod', frac: 'Absichern', info: 'Hinweis' };
    const IC = icons || {};
    // „Exalted Orb + Omen of X“ → Teile mit Anzahl; „20 × Esh's Catalyst (…)“ → 20 Stück
    const teile = (wie, versuche) => String(wie || '').split(/\s+\+\s+|\s+·\s+oder:\s+/).map(t => {
      const m = t.match(/^(\d+)\s*×\s*(.+?)(\s*\(.*\))?$/), n = (m ? m[2] : t).replace(/\s*\((\d+)×\)$/, '').replace(/\s*bis 20 %$/, '').trim();
      const mal = m ? +m[1] : (t.match(/\((\d+)×\)$/) || [])[1] || 1;
      return { n, mal: +mal, ges: Math.max(1, Math.round(+mal * (m ? 1 : (versuche || 1)))) };
    }).filter(t => t.n);
    const orb = (x, gross) => `<span class="cy${gross ? ' g' : ''}" title="${esc(x.n)}">${IC[x.n] ? `<img src="${esc(IC[x.n])}" alt="">` : '<i></i>'}<span>${esc(x.n)}</span>${x.mal > 1 ? `<b>×${x.mal}</b>` : ''}</span>`;
    const steps = (V.schritte || []).filter(x => !x.alt || this.zeigAlt);
    const bedarf = new Map();
    steps.filter(x => x.art !== 'div').forEach(x => { teile(x.wie, x.versuche).forEach(t => { const b = bedarf.get(t.n) || { n: t.n, anz: 0 }; b.anz += t.ges; bedarf.set(t.n, b); });
      (x.extra || []).forEach(e => { const b = bedarf.get(e.n) || { n: e.n, anz: 0 }; b.anz += e.anz; bedarf.set(e.n, b); }); });
    const pr = n => (preise || {})[n];
    const wegKarte = V.schritte ? `<div class="ik-weg"><div class="ik-wh"><b>${esc(titel)}</b>${V.summe ? `<span>gesamt etwa <b>${this.ex(V.summe, dv)}</b></span>` : ''}</div>
      ${V.urteil ? `<div class="ik-urteil">${esc(V.urteil)}</div>` : ''}
      ${V.regeln ? `<details class="ik-regeln"><summary>Grundregeln beim Craften (Patch 0.5)</summary><ul>${V.regeln.map(r => `<li>${esc(r)}</li>`).join('')}</ul></details>` : ''}
      ${(V.schritte || []).some(x => x.slots) ? `<div class="sl-leg"><span>Rechts bei jedem Schritt: so sieht dein Item danach aus</span>${[['key', 'Schlüssel-Mod'], ['frac', 'fraktiert'], ['ess', 'Essenz'], ['gut', 'Wunsch-Mod'], ['abyss', 'Abyss'], ['muell', 'Müll'], ['frei', 'frei']].map(([k, t]) => `<em><i class="sl ${k}"></i>${t}</em>`).join('')}</div>` : ''}
      <ol class="ik-steps">${steps.map((x, i) => `<li class="ik-s ${x.art}${x.alt ? ' alt' : ''}"><div class="ik-n">${i + 1}</div><div class="ik-c">
        <div class="ik-t"><span class="ik-art">${ART[x.art] || ''}</span><b>${esc(x.titel)}</b></div>
        <div class="ik-cy">${teile(x.wie, x.versuche).map(t => orb(t, false)).join('<em class="ik-plus">+</em>')}</div>
        <div class="ik-kurz">${x.chance != null ? `<span class="${x.chance >= 50 ? 'g' : x.chance >= 15 ? 'm' : 'r'}">${String(x.chance).replace('.', ',')} %${x.geschaetzt ? ' ~' : ''}</span> ${esc(x.chanceText || 'Chance pro Versuch')}` : ''}${x.versuche != null && x.versuche > 1 ? ` · im Schnitt ${String(x.versuche).replace('.', ',')} Versuche` : ''}${x.meist ? ` (meist ${x.meist}, bei Pech ${x.pech})` : ''}${x.kosten ? ` · <b>${this.ex(x.kosten, dv)}</b>` : ''}${x.risiko ? ' · <span class="r">kann einen guten Mod treffen</span>' : ''}</div>
        ${x.wenn && x.wenn.length ? `<div class="ik-wenn"><span class="ik-wl">Was jetzt?</span>${x.wenn.map(w => `<div class="${w.ok ? 'ok' : 'nein'}"><i>${w.ok ? '✓' : '↺'}</i><b>${esc(w.fall)}</b><span>${esc(w.dann)}</span></div>`).join('')}</div>` : ''}
        ${x.ziele ? `<div class="ik-ziele">${x.ziele.map(z => `<span>${esc(z.text.split('\n')[0])}${this.wertChip(z.wert)}</span>`).join('')}</div>` : ''}
        <details class="ik-mehr"><summary>Warum so – und was, wenn es schiefgeht?</summary><div class="ik-warum">${esc(x.warum)}</div>
          ${x.planB ? `<div class="ik-planb"><b>Plan B</b> ${esc(x.planB)}</div>` : ''}
          ${x.alternativen && x.alternativen.length ? `<div class="ik-alt"><b>Andere Wege:</b> ${x.alternativen.map(a => `<span>${esc(a.wie)} · ${String(a.chance).replace('.', ',')} %${a.geschaetzt ? ' ~' : ''}${a.kosten ? ' · ' + this.ex(a.kosten, dv) : ''}</span>`).join('')}</div>` : ''}</details>
      </div>${x.slots ? this.slotBild(x.slots) : ''}</li>`).join('')}</ol>
      ${(V.schritte || []).some(x => x.alt) ? `<button class="btn small ghost" id="cralt">${this.zeigAlt ? 'Alternativen ausblenden' : 'Alternativen mit Perfect-Orbs zeigen'}</button>` : ''}</div>` : '';
    const einkauf = bedarf.size ? `<div class="ik-bedarf"><h4>Das brauchst du</h4>${[...bedarf.values()].map(b => `<div class="ib">${IC[b.n] ? `<img src="${esc(IC[b.n])}" alt="">` : '<i></i>'}<span>${esc(b.n)}</span><b>~${b.anz}×</b></div>`).join('')}
      <div class="muted" style="font-size:11px;margin-top:6px">Ungefähr, mit Fehlversuchen. Kaufen am einfachsten im Currency Exchange (Alva im Hideout).</div></div>` : '';
    return [wegKarte, einkauf];
  },
  slotBild(sl) {
    const T = { key: 'Schlüssel-Mod', frac: 'fraktiert', ess: 'Essenz', gut: 'Wunsch-Mod', abyss: 'Abyss', muell: 'Müll', frei: 'frei' };
    const reihe = (l, a) => `<div class="sl-r"><small>${l}</small>${a.map(x => `<i class="sl ${x.k}" title="${esc((x.t && x.t !== '?' ? x.t + ' – ' : '') + T[x.k])}"></i>`).join('')}</div>`;
    return `<div class="sl-box" title="So sieht dein Item nach diesem Schritt aus">${reihe('Prefix', sl.p || [])}${reihe('Suffix', sl.s || [])}</div>`;
  },
  ex(v, dv) {
    if (v == null) return '–';
    return dv && v >= dv * .8 ? (v / dv).toFixed(1).replace('.', ',') + ' Divine' : Math.round(v) + ' Exalted';
  },
  wertChip(w) {
    if (!w) return '';
    const t = [];
    if (Math.abs(w.dps) >= .1) t.push(`<span class="${w.dps > 0 ? 'good' : 'bad'}">${w.dps > 0 ? '+' : ''}${String(w.dps).replace('.', ',')} % DPS</span>`);
    if (Math.abs(w.ehp) >= .1) t.push(`<span class="${w.ehp > 0 ? 'good' : 'bad'}">${w.ehp > 0 ? '+' : ''}${String(w.ehp).replace('.', ',')} % eHP</span>`);
    if (Math.abs(w.speed) >= .5) t.push(`<span class="good">+${String(w.speed).replace('.', ',')} % Tempo</span>`);
    return t.length ? `<span class="cr-w">${t.join(' ')}</span>` : (w.nb ? '<span class="cr-w muted">PoB rechnet es nicht</span>' : '<span class="cr-w muted">bringt deinem Build nichts Messbares</span>');
  },
  zeile(m) {
    const an = m.id in this.wunsch, mi = this.wunsch[m.id];
    const ch = m.quelle === 'normal' || m.quelle === 'rune' ? `<span class="cr-c" title="Chance pro Exalted Orb mit passendem Omen (ohne Omen: ${String(m.chance).replace('.', ',')} %)">${String(m.chanceOmen).replace('.', ',')} %</span>`
      : m.quelle === 'desecrated' ? `<span class="cr-c ab" title="Chance, dass der Mod unter den 3 Vorschlägen im Well of Souls ist (mit Omen of Abyssal Echoes: ${String(m.chanceEcho).replace('.', ',')} %)">${String(m.chanceOmen).replace('.', ',')} %</span>`
      : '<span class="cr-c es">garantiert</span>';
    const ess = (m.essenz || []).filter(e => e.stufe !== 'PERFECT').slice(-1)[0];
    return `<div class="cr-m${an ? ' an' : ''}" data-id="${esc(m.id)}">
      <div class="cr-mt"><span class="cr-x">${an ? icon('check', 13) : ''}</span><div><div class="cr-tx">${esc(m.text).replace(/\n/g, '<br>')}</div>
        <div class="cr-sub">${ch}${m.quelle === 'rune' ? `<span class="cr-rn" title="Kommt nur mit der Rune im Sockel. Das Spawn-Gewicht dieser Mods ist nicht öffentlich – die Chance ist geschätzt.">Rune · geschätzt</span>` : ''}${ess ? `<span class="cr-e" title="Garantiert per ${esc(ess.name)}: ${esc(ess.text || '')}">✦ ${esc(ess.name)}</span>` : ''}${this.wertChip(m.wert)}</div></div></div>
      ${an && m.stufen && m.stufen.length > 1 ? `<label class="cr-st">Mindeststufe <select data-st="${esc(m.id)}">${m.stufen.map(t => `<option value="${t.il}"${+mi === t.il ? ' selected' : ''}>${esc(t.text.split('\n')[0])} (ab Lv ${t.il})</option>`).join('')}<option value="0"${!+mi ? ' selected' : ''}>egal welche Stufe</option></select></label>` : ''}
    </div>`;
  },
  einPlan(R, dv, liga) {
    if (R.error) return `<div class="u-warn" style="margin-top:10px"><span>${esc(R.error)}</span></div>`;
    const v = R.verbrauch || {};
    const z = (k, l) => v[k] && v[k].schnitt ? `<div><span>${l}</span><b>${String(v[k].schnitt).replace('.', ',')}</b><small>meist ${v[k].median}, Pech ${v[k].p90}</small></div>` : '';
    const ex = R.stufe === 'perfect' ? 'Perfect Exalted' : R.stufe === 'greater' ? 'Greater Exalted' : 'Exalted', N = R.waehrung || {};
    return `<div class="cr-erf ${R.erfolg >= 80 ? 'ok' : R.erfolg >= 40 ? 'mid' : 'low'}"><b>${String(R.erfolg).replace('.', ',')} %</b><span>Erfolgschance mit höchstens ${R.budget} ${ex}/Chaos${R.rune ? ' · mit ' + esc(R.rune) : ''}</span></div>
      <div class="cr-top2">${String(R.top || 0).replace('.', ',')} % der fertigen Items haben alle Wunsch-Mods in den zwei höchsten Stufen${R.stufe === 'perfect' ? ' – Perfect Exalted schließt niedrige Stufen aus.' : ' – für bessere Werte lohnt sich „Viel Invest“.'}</div>
      ${R.kosten && R.kosten.median > 0 ? `<div class="cr-k"><span>Kosten, wenn es klappt</span><b>${this.ex(R.kosten.median, dv)}</b><small>meist · bei Pech bis ${this.ex(R.kosten.p90, dv)}${R.preiseFehlen && R.preiseFehlen.length ? ' · ohne Preis für: ' + R.preiseFehlen.map(esc).join(', ') : ''}</small></div>` : '<div class="muted" style="font-size:12px;margin-top:8px">Kosten: Preise von poe.ninja gerade nicht verfügbar.</div>'}
      <div class="cr-v">${z('trans', N.trans || 'Transmutation')}${z('aug', N.aug || 'Augmentation')}${z('regal', N.regal || 'Regal')}${z('essenz', R.essenz || 'Essenz')}${z('exalt', N.exalt || ex)}${z('omenEx', 'Exaltation-Omen')}${z('chaos', N.chaos || 'Chaos Orb')}${z('omenEr', 'Erasure-Omen')}${z('annul', 'Orb of Annulment')}${z('omenAn', 'Annulment-Omen')}${z('perfEss', R.perfEssenz || 'Perfect Essenz')}${z('omenCr', 'Crystallisation-Omen')}${z('neu', 'Neue Basen')}${z('rune', R.rune ? R.rune : 'Runen')}${z('knochen', 'Abyss-Knochen')}${z('echo', 'Abyssal Echoes')}</div>
      ${R.varianten ? `<div class="cr-var"><div class="cr-vh">${R.ziel === 'stark' ? 'Sicherster Weg' : 'Günstigster Weg'}: <b>${esc(R.variante)}</b></div>
        <table>${R.varianten.map(x => `<tr class="${x.name === R.variante ? 'on' : ''}" data-weg="${esc(x.key || '')}" title="Klicken: Anleitung für diesen Weg anzeigen"><td>${esc(x.name)}${x.community ? ' <span class="cr-cm">Community-Methode</span>' : ''}</td><td class="nr">${String(x.erfolg).replace('.', ',')} %</td><td class="nr">${x.proErfolg > 0 ? this.ex(x.proErfolg, dv) : '–'}</td></tr>`).join('')}</table>
        <div class="muted" style="font-size:11px;margin-top:4px">Spalten: Erfolgschance · durchschnittliche Kosten pro fertigem Item (Fehlversuche eingerechnet). Klick auf eine Zeile zeigt die Anleitung für genau diesen Weg.</div></div>` : ''}
      ${R.preisInfo && Object.keys(R.preisInfo).length ? `<div class="muted" style="font-size:11.5px;margin-top:8px">Preise: ${Object.entries(R.preisInfo).map(([k, x]) => esc(k) + ' ' + String(x).replace('.', ',') + ' Ex').join(' · ')}</div>` : ''}
      <h4 style="margin:14px 0 8px">So gehst du vor</h4>
      <ol class="cr-steps">${(R.schritte || []).map(s => `<li><b>${esc(s.t)}${s.anz ? `<em class="cr-anz">meist ${s.anz}×</em>` : ''}</b><span>${esc(s.d)}</span>${s.tipp ? `<small class="cr-tp">${esc(s.tipp)}</small>` : ''}</li>`).join('')}</ol>
      ${R.geschaetzt ? '<div class="cr-hint" style="margin-top:10px"><span>Runen-Mods: Ihr Spawn-Gewicht ist nicht öffentlich. Gerechnet wird mit einem geschätzten mittleren Gewicht – die Prozente sind ein Richtwert.</span></div>' : ''}
      <div class="muted" style="font-size:11.5px;margin-top:10px">Simuliert ${R.laeufe}-mal mit Liga-Preisen von poe.ninja (${esc(liga || '')}). Gewichte: Community-Daten von poe2db über das Projekt POE2_HTC (AGPL-3.0) – Richtwerte, keine Garantie.</div>`;
  },
  html() {
    const P = this.pool;
    const sug = this.sug.length ? `<div class="cr-sug">${this.sug.map(b => `<button data-b="${esc(b.n)}"><b>${esc(b.n)}</b><span>${esc(b.cl)} · ab Level ${b.lv}</span></button>`).join('')}</div>` : '';
    let mods = '';
    if (this.laedt) mods = `<div class="wy-l"><span class="spin">${icon('refresh', 14)}</span> Lade Mods${S.char ? ' und rechne, was jeder Mod deinem Build bringt' : ''} …</div>`;
    else if (P && P.error) mods = `<div class="muted">${esc(P.error)}</div>`;
    else if (P) {
      const L = P.mods.filter(m => this.filt === 'normal' ? (m.quelle === 'normal' || m.quelle === 'rune') : this.filt === 'abyss' ? m.quelle === 'desecrated' : m.quelle === 'essence' || m.quelle === 'perfect_essence');
      const sortiere = a => a.slice().sort((x, y) => this.sort === 'wert' && (x.wert || y.wert) ? ((y.wert ? y.wert.dps + y.wert.ehp * .6 : -99) - (x.wert ? x.wert.dps + x.wert.ehp * .6 : -99)) : ((y.chanceOmen || 0) - (x.chanceOmen || 0)));
      const sp = s => sortiere(L.filter(m => m.seite === s)).map(m => this.zeile(m)).join('') || '<div class="muted" style="font-size:12.5px">keine</div>';
      mods = `<div class="cr-tabs"><div class="seg" data-cf="filt">${[['normal', 'Normale Mods'], ['abyss', 'Abyss (Desecrated)'], ['essenz', 'Nur per Essenz']].map(([k, l]) => `<button class="${this.filt === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="seg" data-cf="sort">${[['wert', 'Nach Nutzen für deinen Build'], ['chance', 'Nach Chance']].map(([k, l]) => `<button class="${this.sort === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div></div>
        ${P.buildWert === true ? `<div class="cr-vs"><button class="btn small primary" id="crvs">${icon('bolt', 13)} Für meinen Build vorschlagen</button><span>wählt die Mods, die laut Path of Building deinem Build am meisten bringen${this.item && this.item.basis === this.base ? ' – passend zu den freien Plätzen deines Items' : ''}</span></div>${this.vorschlagInfo ? `<div class="cr-hint"><span>${esc(this.vorschlagInfo)}</span></div>` : ''}` : ''}
        ${P.buildWert === false ? `<div class="cr-hint">${icon('eye', 13)}<span>Mit einem aktiven PoE2-Profil zeigt jeder Mod zusätzlich, wie viel DPS und eHP er deinem Build bringt.</span></div>` : ''}
        <div class="cr-cols"><div><h4>Prefixe <small>max. 3</small></h4>${sp('p')}</div><div><h4>Suffixe <small>max. 3</small></h4>${sp('s')}</div></div>`;
    } else mods = `<div class="empty">${icon('item', 40)}<div><b>Erst eine Basis wählen</b>Tipp den Namen ein, z. B. „Rope Cuffs“, „Ruby Ring“ oder „Sacrificial Mantle“.</div></div>`;
    const D = this.plan;
    let plan = '';
    if (this.planLaedt) plan = `<div class="wy-l"><span class="spin">${icon('refresh', 14)}</span> Rechne zwei Wege durch: günstig und mit viel Invest …</div>`;
    else if (D && D.error) plan = `<div class="u-warn"><span>${esc(D.error)}</span></div>`;
    else if (D && D.billig) {
      const dv = D.divine, W = [['billig', 'Simulation: Low Budget', 'tausende Zufalls-Crafts mit normalen Orbs und deinem Höchstbudget'], ['stark', 'Simulation: Viel Invest', 'dasselbe mit Perfect-Orbs – höhere Chance, Top-Stufen']];
      const kachel = ([k, l, d]) => { const R = D[k] || {}; const ok = !R.error;
        return `<button class="cr-wk${this.wahl === k ? ' on' : ''}" data-wahl="${k}"><span class="cr-wl">${l}</span><small>${d}</small>
          ${ok ? `<b class="${R.erfolg >= 80 ? 'ok' : R.erfolg >= 40 ? 'mid' : 'low'}">${String(R.erfolg).replace('.', ',')} %</b><span class="cr-wz">${R.kosten && R.kosten.median > 0 ? 'meist ' + this.ex(R.kosten.median, dv) : 'Kosten unbekannt'}</span><span class="cr-wz">Top-Stufen: ${String(R.top || 0).replace('.', ',')} %</span>` : `<span class="cr-wz">nicht möglich</span>`}</button>`; };
      const RZ = D.rezept || {};
      const rk2 = `<button class="cr-wk${this.wahl === 'rezept' ? ' on' : ''}" data-wahl="rezept"><span class="cr-wl">Community-Weg</span><small>so craften es die Guides: Alchemy → Schlüssel-Mod → sichern → Omen</small>
        ${RZ.error ? '<span class="cr-wz">nicht möglich</span>' : `<b class="ok">empfohlen</b><span class="cr-wz">${RZ.summe ? 'etwa ' + this.ex(RZ.summe, dv) : 'Kosten unbekannt'}</span><span class="cr-wz">kein Neuanfang nötig</span>`}</button>`;
      let inhalt;
      if (this.wahl === 'rezept') {
        if (RZ.error) inhalt = `<div class="u-warn"><span>${esc(RZ.error)}</span></div>`;
        else {
          const [wk, ek] = this.wegHtml(RZ, D.icons, dv, D.preise, 'So craftest du es – Schritt für Schritt');
          const teuer = dv && RZ.summe > dv * 50;
          inhalt = `${teuer ? `<div class="cr-hint" style="margin-top:10px"><span>Das ist ein Top-Item – zusammen etwa ${this.ex(RZ.summe, dv)}. Günstiger wird es, wenn du bei deinem schwersten Mod („${esc(RZ.schluessel || '')}“) links eine Stufe niedriger wählst oder eine Basis kaufst, auf der er schon fraktiert ist.</span></div>` : ''}
            ${(RZ.hinweise || []).map(h => `<div class="u-warn" style="margin-top:8px"><span>${esc(h)}</span></div>`).join('')}
            ${RZ.vergleich ? `<div class="cr-vgl">Durchgerechnet: <b>mit Fracturing</b> etwa ${this.ex(RZ.vergleich.mit, dv)} · <b>ohne Fracturing</b> etwa ${this.ex(RZ.vergleich.ohne, dv)} – unten steht der günstigere Weg.</div>` : ''}
            <div class="cr-rz">${wk}${ek}</div>
            <div class="muted" style="font-size:11.5px;margin-top:8px">Zahlen aus den Spawn-Gewichten (poe2db / POE2_HTC) und Liga-Preisen von poe.ninja (${esc(D.liga || '')}): „im Schnitt“, „meist“ = die Hälfte schafft es bis dahin, „bei Pech“ = 9 von 10 schaffen es bis dahin.</div>`;
        }
      } else inhalt = this.einPlan(D[this.wahl] || {}, dv, D.liga);
      const simAn = this.zeigSim || this.wahl !== 'rezept';
      plan = `<div class="cr-wege${simAn ? '' : ' eins'}">${rk2}${simAn ? W.map(kachel).join('') : ''}</div>
        <button class="btn small ghost cr-simt" id="crsim">${simAn ? 'Simulation ausblenden' : 'Für Profis: Zufalls-Simulation (Low Budget / Viel Invest) zeigen'}</button>` + inhalt;
    } else plan = `<div class="muted" style="font-size:13px">Klick oben die Mods an, die du haben willst. Hier erscheint dann der Community-Weg Schritt für Schritt – mit Chance, Kosten, Einkaufsliste und was du tust, wenn etwas schiefgeht.</div>`;
    const anz = Object.keys(this.wunsch).length;
    const rk = P && !P.error && P.runen ? `<div class="card pad cr-runen"><h3>Runen im Sockel <span class="r muted">optional · vor dem ersten Orb einsetzen</span></h3>
      <div class="cr-rr">${P.runen.length ? `<label class="f">Mod-Pool erweitern</label><div class="seg" data-cf="rune"><button class="${!this.rune ? 'on' : ''}" data-v="">Keine</button>${P.runen.map(r => `<button class="${this.rune === r.id ? 'on' : ''}" data-v="${esc(r.id)}" title="${esc(r.kurz)}">${esc(r.n)} <small>${esc(r.pool)}</small></button>`).join('')}</div>` : '<span class="muted" style="font-size:12.5px">Für diese Item-Art gibt es keine Pool-Rune (nur Handschuhe, Helm, Stiefel, Brust und Waffen).</span>'}</div>
      ${this.rune ? `<div class="cr-hint" style="margin:8px 0 0"><span><b>${esc((P.runen.find(r => r.id === this.rune) || {}).n || '')}</b>: ${esc((P.runen.find(r => r.id === this.rune) || {}).kurz || '')} können jetzt mitrollen – in der Mod-Liste mit „Rune“ markiert. Die Rune kostet pro Basis eine, lässt sich nicht entfernen, und ihr Mod-Gewicht ist geschätzt.</span></div>` : ''}
      <div class="cr-opt" style="margin-top:8px"><label title="+1 Suffix Modifier allowed – braucht einen eigenen Sockel"><input type="checkbox" id="crse"${this.serle ? ' checked' : ''}> Serle's Triumph (4. Suffix)</label>
        <label title="Can have 1 additional Crafted Modifier – braucht einen eigenen Sockel"><input type="checkbox" id="cras"${this.astrid ? ' checked' : ''}> Astrid's Creativity (2 gecraftete Mods)</label>
        ${P.waffe ? `<label title="Passion/Breath/Ire of Aldur verwandeln alle Element-Mods in ein Element"><input type="checkbox" id="cral"${this.aldur ? ' checked' : ''}> Aldur-Rune (Element-Mods umwandeln)</label>` : ''}</div></div>` : '';
    return `
    <div class="card pad cr-top">
      <div class="cr-b"><label class="f">1 · Basis</label><div style="position:relative"><input id="crb" value="${esc(this.base)}" placeholder="Basis suchen, z. B. Rope Cuffs" autocomplete="off">${sug}</div></div>
      <div class="cr-i"><label class="f">Itemlevel</label><input id="cri" type="number" min="1" max="86" value="${this.ilvl}"></div>
      <div class="cr-s"><label class="f" title="Gilt für die Prozent-Chancen in der Mod-Liste. Der Plan rechnet immer beide Wege.">Chancen für</label><div class="seg" data-cf="stufe">${[['normal', 'Normal'], ['greater', 'Greater'], ['perfect', 'Perfect']].map(([k, l]) => `<button class="${this.stufe === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div></div>
      <button class="btn small ghost" id="crh">${icon('flag', 13)} Was ist was?</button>
    </div>
    ${this.hilfe ? `<div class="card pad cr-help"><div><b>Prefix / Suffix</b>Jedes seltene Item hat höchstens 3 Prefixe (meist Leben, Schaden, Verteidigung) und 3 Suffixe (meist Resistenzen, Attribute, Tempo).</div>
      <div><b>Exalted Orb</b>Fügt einem seltenen Item einen zufälligen Mod hinzu. Greater/Perfect lassen nur höhere Modstufen zu (ab Modlevel 35/50).</div>
      <div><b>Omen</b>Rechtsklick aktiviert es, die nächste passende Währung wird verändert: Sinistral = nur Prefix, Dextral = nur Suffix.</div>
      <div><b>Essenz</b>Macht ein magisches Item selten und setzt einen bestimmten Mod garantiert. Zählt als der eine gecraftete Mod.</div>
      <div><b>Abyss (Desecrated)</b>Knochen (Rib für Rüstung, Collarbone für Schmuck, Jawbone für Waffen) auf ein seltenes Item, dann im Well of Souls einen von 3 Mods wählen. Nur einer pro Item.</div>
      <div><b>Greater / Perfect Orbs</b>Gleiche Wirkung, aber nur hohe Modstufen: Transmutation und Augmentation ab Modlevel 44 (Greater) / 70 (Perfect), Regal, Exalted und Chaos ab 35 / 50. Teuer, dafür kaum Müll-Mods.</div>
      <div><b>Chaos Orb + Erasure-Omen</b>Chaos entfernt einen zufälligen Mod und würfelt sofort einen neuen. Mit Omen of Sinistral/Dextral Erasure wird nur ein Prefix bzw. Suffix entfernt, Omen of Whittling nimmt den Mod mit dem niedrigsten Level.</div>
      <div><b>Runen mit neuem Mod-Pool</b>Kolr's Hunt (Handschuhe: Marksman), Katla's Gloom (Handschuhe: Decay), Vorana's Carnage (Helm: Berserking), Uhtred's Sidereus (Stiefel: Chronomancy), Medved's Tending (Brust: Soul), Thrud's Might (Waffe: Destruction). Vor dem Craften in einen Sockel setzen, nicht mehr entfernbar.</div>
      <div><b>Weitere Crafting-Runen</b>Serle's Triumph: 4. Suffix. Astrid's Creativity: 2 gecraftete Mods. Passion/Breath/Ire/Betrayal of Aldur: Element-Mods einer Waffe umwandeln. Cadigan's Epiphany: Handschuh-Sockel werden zum Juwelen-Sockel. Masterwork Rune: wertet eine Rune auf.</div>
      <div><b>Perfect Essenz & Alloys</b>Auf seltenen Items: entfernt einen Mod und setzt einen festen. Omen of Sinistral/Dextral Crystallisation legt fest, auf welcher Seite entfernt wird. Die 13 Alloys (z. B. Swift, Prismatic, Sovereign) arbeiten genauso und zählen als gecrafteter Mod.</div>
      <div><b>Absichern</b>Fracturing Orb macht einen zufälligen Mod dauerhaft (ab 4 Mods). Hinekora's Lock zeigt vorher das Ergebnis des nächsten Orbs. Divine Orb würfelt nur die Werte neu.</div>
      <div><b>Katalysatoren (Ringe, Amulette)</b>20 Stück = 20 % Qualität, verstärken alle Mods ihrer Art (Esh's = Blitz, Xoph's = Feuer, Tul's = Kälte, Flesh = Leben, Sibilant = Zauber, Reaver = Angriff …). Mit Omen of Catalysing Exaltation verbraucht der nächste Exalted die Qualität und bringt viel öfter einen Mod dieser Art.</div>
      <div><b>Omen of Greater Exaltation</b>Der nächste Exalted fügt ZWEI Mods hinzu – mit Sinistral/Dextral beide auf derselben Seite.</div>
      <div><b>Abyss gezielt</b>Omen of Light: Annulment entfernt nur den Abyss-Mod. Omen of the Liege / Sovereign / Blackblooded legen bei Schmuck und Waffen die Lich-Gruppe fest – weniger Auswahl, höhere Chance.</div>
      <div><b>Omen of Sanctification</b>Divine setzt alle Werte auf 80–120 % – danach ist das Item gesperrt. Nur ganz am Ende.</div>
      <div><b>Vaal Orb</b>Corruption: kann einen Bonus bringen, das Item aber auch verschlechtern. Endgültig – immer der letzte Schritt.</div></div>` : ''}
    ${this.itemKarte()}
    ${rk}
    <div class="cr-grid">
      <div class="card pad"><h3>2 · Wunsch-Mods ${anz ? `<span class="r muted">${anz} gewählt · <a href="#" id="crx">alle abwählen</a></span>` : ''}</h3>${mods}</div>
      <div class="cr-rechts">${this.vorschau()}</div>
    </div>
    <div class="card pad frame cr-plan cr-planvoll"><h3>3 · Dein Plan</h3>
        <div class="cr-opt"><label><input type="checkbox" id="cre"${this.essenz ? ' checked' : ''}> Essenz nutzen, wenn möglich</label><label><input type="checkbox" id="crec"${this.echo ? ' checked' : ''}> Omen of Abyssal Echoes</label>
          <label>Höchstens <input id="crbu" type="number" min="5" max="300" value="${this.budget}" style="width:64px"> Exalted/Chaos pro Weg</label></div>
        ${plan}</div>`;
  },
  render() {
    const el = sec('craft'); if (!el || view !== 'craft') return;
    const fokus = document.activeElement && document.activeElement.id, pos = fokus === 'crb' ? document.activeElement.selectionStart : null;
    el.innerHTML = `<div class="ph"><div><h1>Crafting-Berater</h1><div class="sub">Für Path of Exile 2: Basis wählen, Wunsch-Mods anklicken – der Companion zeigt dir Schritt für Schritt, wie du am sichersten hinkommst, wie oft es klappt und was es kostet.</div></div></div>${this.html()}`;
    this.bind();
    if (fokus) { const i = document.getElementById(fokus); if (i) { i.focus(); if (pos != null && i.setSelectionRange) i.setSelectionRange(pos, pos); } }
  },
  bind() {
    const sim = document.getElementById('crsim');
    if (sim) sim.onclick = () => { this.zeigSim = !(this.zeigSim || this.wahl !== 'rezept'); if (!this.zeigSim) this.wahl = 'rezept'; this.render(); };
    const el = sec('craft');
    const inp = el.querySelector('#crb');
    let tm;
    inp.oninput = () => { clearTimeout(tm); tm = setTimeout(async () => { this.sug = inp.value.length >= 2 ? await api('/api/craft/basen?q=' + encodeURIComponent(inp.value)).catch(() => []) : []; this.base = inp.value; this.render(); }, 180); };
    inp.onkeydown = e => { if (e.key === 'Enter' && this.sug[0]) { this.base = this.sug[0].n; this.sug = []; this.wunsch = {}; this.ladePool(); } };
    el.onclick = e => {
      const b = e.target.closest('[data-b]');
      if (b) { this.base = b.dataset.b; this.sug = []; this.wunsch = {}; this.ladePool(); return; }
      const f = e.target.closest('[data-cf] button');
      if (f) { const k = f.parentNode.dataset.cf; this[k] = f.dataset.v; if (k === 'stufe' || k === 'rune') { if (k === 'rune') for (const id in this.wunsch) if (id.startsWith('Rune_')) delete this.wunsch[id]; this.ladePool(); } else this.render(); return; }
      const wk = e.target.closest('[data-wahl]');
      if (wk) { this.wahl = wk.dataset.wahl; this.render(); return; }
      if (e.target.closest('#crh')) { this.hilfe = !this.hilfe; this.render(); return; }
      if (e.target.closest('#crvs')) { this.vorschlag(); return; }
      if (e.target.closest('#cralt')) { this.zeigAlt = !this.zeigAlt; this.render(); return; }
      const wg = e.target.closest('[data-weg]');
      if (wg) { this.weg[this.wahl] = wg.dataset.weg; this.rechne(); return; }
      if (e.target.closest('#crpb')) { this.paste = true; this.render(); setTimeout(() => { const t = document.getElementById('crpt'); if (t) t.focus(); }, 0); return; }
      if (e.target.closest('#crpc')) { this.paste = false; this.render(); return; }
      if (e.target.closest('#crpx')) { this.item = null; this.itemFehler = null; this.rechne(); return; }
      if (e.target.closest('#crpo')) { const t = document.getElementById('crpt'); if (t && t.value.trim()) this.ladeItem(t.value.trim()); return; }
      if (e.target.closest('#crx')) { e.preventDefault(); this.wunsch = {}; this.plan = null; this.render(); return; }
      if (e.target.closest('select,label')) return;
      const m = e.target.closest('.cr-m');
      if (m) {
        const id = m.dataset.id;
        if (id in this.wunsch) delete this.wunsch[id];
        else { const mod = this.pool.mods.find(x => x.id === id); this.wunsch[id] = mod && mod.stufen && mod.stufen.length > 1 ? mod.stufen[Math.min(1, mod.stufen.length - 1)].il : 0; }
        this.rechne();
      }
    };
    el.querySelectorAll('[data-st]').forEach(s => s.onchange = () => { this.wunsch[s.dataset.st] = +s.value; this.rechne(); });
    const il = el.querySelector('#cri'); if (il) il.onchange = () => { this.ilvl = Math.max(1, Math.min(86, +il.value || 82)); this.ladePool(); };
    const bu = el.querySelector('#crbu'); if (bu) bu.onchange = () => { this.budget = Math.max(5, Math.min(300, +bu.value || 40)); this.rechne(); };
    const es = el.querySelector('#cre'); if (es) es.onchange = () => { this.essenz = es.checked; this.rechne(); };
    const ec = el.querySelector('#crec'); if (ec) ec.onchange = () => { this.echo = ec.checked; this.rechne(); };
    [['#crse', 'serle'], ['#cras', 'astrid'], ['#cral', 'aldur']].forEach(([sel, k]) => { const c = el.querySelector(sel); if (c) c.onchange = () => { this[k] = c.checked; this.render(); this.rechne(); }; });
  },
};

// Crafting-Taste im Spiel: neues Item kommt über den Status an → Crafting öffnen und Item laden
App.on(s => {
  const ci = s && s.craftItem; if (!ci || ci.t === CR.itemT) return;
  const frisch = ci.t > Date.now() / 1000 - 30; CR.itemT = ci.t;
  if (!frisch) return;
  if (location.hash !== '#craft') location.hash = '#craft';
  CR.ladeItem('');
});

function craft(force) {
  if (lastKey.craft && !force) return;
  lastKey.craft = 1;
  CR.render();
}
