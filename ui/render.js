// PoE Companion – Darstellung von Item- und Map-Ergebnissen (Popup und Hub)
const Render = (() => {
  const { esc, num, full, pct, sgn, rarityColor, urteil, icon } = App;

  const DEF = [
    ['Life', 'Leben', 'abs'], ['EnergyShield', 'Energieschild', 'abs'], ['ManaUnreserved', 'Mana frei', 'abs'],
    ['Armour', 'Rüstung', 'abs'], ['Evasion', 'Ausweichen', 'abs'],
    ['EffectiveBlockChance', 'Block', 'pp'], ['EffectiveSpellBlockChance', 'Zauberblock', 'pp'], ['EffectiveSpellSuppressionChance', 'Spell Suppression', 'pp'],
    ['FireResist', 'Feuer-Resi', 'pp', 'fire'], ['ColdResist', 'Kälte-Resi', 'pp', 'cold'], ['LightningResist', 'Blitz-Resi', 'pp', 'light'], ['ChaosResist', 'Chaos-Resi', 'pp', 'chaos'],
    ['MovementSpeedMod', 'Laufgeschw.', 'mult'], ['Str', 'Stärke', 'abs'], ['Dex', 'Geschick', 'abs'], ['Int', 'Intelligenz', 'abs'],
    ['CritChance', 'Krit-Chance', 'pp'], ['Speed', 'Angriffe/Zauber pro s', 'dec'],
  ];
  const HITS = [['PhysicalMaximumHitTaken', 'Phys', 'phys'], ['FireMaximumHitTaken', 'Feuer', 'fire'], ['ColdMaximumHitTaken', 'Kälte', 'cold'],
    ['LightningMaximumHitTaken', 'Blitz', 'light'], ['ChaosMaximumHitTaken', 'Chaos', 'chaos']];

  function delta(o, n, art) {
    const d = n - o;
    if (art === 'mult') return Math.abs(d) < 0.005 ? null : sgn(d * 100, 0) + ' %';
    if (art === 'pp') return Math.abs(d) < 0.05 ? null : sgn(d, d % 1 ? 1 : 0) + ' %';
    if (art === 'dec') return Math.abs(d) < 0.005 ? null : sgn(d, 2);
    return Math.abs(d) < 0.5 ? null : sgn(d, 0);
  }

  function gauge(wert, label, sub) {
    const cls = wert > 0.05 ? 'pos' : wert < -0.05 ? 'neg' : 'zero';
    const w = Math.min(100, Math.abs(wert) * 2);
    return `<div class="gauge ${cls}"><div class="gv">${sgn(wert, 1)}<small>%</small></div><div class="gl">${label}</div>
      <div class="gb"><span class="mid"></span><i style="${wert >= 0 ? 'left:50%' : 'right:50%'};width:${w / 2}%"></i></div>${sub ? `<div class="gs">${sub}</div>` : ''}</div>`;
  }

  function resultCard(x, opts = {}) {
    const o = x.old, n = x.new;
    const dp = pct(o.dps, n.dps), de = pct(o.TotalEHP, n.TotalEHP), u = urteil(dp, de);
    const rows = [];
    for (const [k, l, art, el] of DEF) {
      const d = delta(o[k] || 0, n[k] || 0, art); if (!d) continue;
      const gut = (n[k] || 0) > (o[k] || 0);
      let extra = '';
      if (el) { const cap = 75; const w = n[k] || 0; extra = w >= cap ? '<span class="capok" title="gecappt">✓ 75</span>' : `<span class="capno" title="nicht gecappt">${Math.round(w)}%</span>`; if (el === 'chaos') extra = `<span class="${w >= 0 ? 'capok' : 'capno'}">${Math.round(w)}%</span>`; }
      rows.push(`<div class="dr ${gut ? 'g' : 'b'}"><span>${l}</span><b>${d}</b>${extra}</div>`);
    }
    const hits = HITS.map(([k, l, c]) => ({ l, c, v: pct(o[k] || 0, n[k] || 0), now: n[k] || 0 })).filter(h => Math.abs(h.v) >= 0.5);
    const hitHtml = hits.length ? `<div class="hits">${hits.map(h => `<span class="hit ${h.v > 0 ? 'g' : 'b'}"><i style="background:var(--${h.c})"></i>Max-Hit ${h.l} <b>${sgn(h.v, 0)}%</b></span>`).join('')}</div>` : '';
    const ort = x.jewel ? 'Juwel-Sockel' : x.slot;
    return `<div class="rc ${u.cls} pop">
      <div class="rc-h"><div><div class="rc-slot">${esc(ort)}</div><div class="rc-cur">statt <b>${esc(x.current || 'leer')}</b></div></div><span class="verdict ${u.cls}">${u.text}</span></div>
      <div class="gauges">${gauge(dp, 'Offensive', `${num(o.dps)} → ${num(n.dps)} DPS`)}${gauge(de, 'Defensive', `${num(o.TotalEHP)} → ${num(n.TotalEHP)} eHP`)}</div>
      ${rows.length ? `<div class="drs">${rows.join('')}</div>` : '<div class="nochg">Keine Änderung bei Leben, Schutz oder Resistenzen.</div>'}
      ${hitHtml}
    </div>`;
  }

  function itemHeader(d) {
    const tags = [];
    if (d.ilvl) tags.push(`<span class="chip">iLvl ${d.ilvl}</span>`);
    if (d.quality) tags.push(`<span class="chip">${d.quality}% Qualität</span>`);
    if (d.sockets) tags.push(`<span class="chip">${d.sockets} Sockel</span>`);
    if (d.corrupted) tags.push('<span class="chip bad">Korrumpiert</span>');
    const base = d.base && !String(d.name || '').includes(d.base) ? `<div class="ib">${esc(d.base)}</div>` : '';
    const e = d.price && d.price.schaetzung, dv = (d.price && d.price.divine) || 0;
    const kz = ((d.price && d.price.basis) || 'chaos') === 'exalted' ? ' ex' : ' c';
    if (e) tags.unshift(`<span class="chip est-chip" title="Geschätzter Marktwert">≈ ${dv && e.c >= dv * .8 ? (e.c / dv).toFixed(1).replace('.', ',') + ' div' : String(Math.round(e.c * 10) / 10).replace('.', ',') + kz}</span>`);
    if (d.rarity === 'UNIQUE' && d.name) tags.push(`<a class="chip wiki" href="https://www.poewiki.net/wiki/${encodeURIComponent(String(d.name).replace(/^Foulborn /, '').replace(/ /g, '_'))}" target="_blank" rel="noopener" title="Im PoE-Wiki nachlesen">Wiki</a>`);
    return `<div class="ih" style="--rc:${rarityColor(d.rarity)}"><div class="in">${esc(d.name || 'Item')}</div>${base}<div class="it">${tags.join('')}</div></div>`;
  }

  function warnings(d) {
    let h = '';
    if (d.reqFail && d.reqFail.length) h += `<div class="alert bad">${icon('warn', 16)}<div><b>Kannst du noch nicht tragen</b>${d.reqFail.map(r => `<div>${esc(r.what)}: brauchst ${r.need}, hast ${Math.round(r.have)}</div>`).join('')}</div></div>`;
    if (d.unsupported && d.unsupported.length) h += `<div class="alert warn">${icon('warn', 16)}<div><b>${d.unsupported.length} Mod${d.unsupported.length > 1 ? 's' : ''} rechnet PoB nicht mit</b>${d.unsupported.slice(0, 4).map(l => `<div>• ${esc(l)}</div>`).join('')}<div class="muted">Die Zahlen sind ohne diese Mods – das Item kann besser sein.</div></div></div>`;
    return h;
  }

  function modList(d) {
    if (!d.mods || !d.mods.length) return '';
    return `<details class="mods"><summary>Mods anzeigen (${d.mods.length})</summary>${d.mods.map(m => `<div class="mod ${m.k}${m.bad ? ' unsup' : ''}">${esc(m.t)}</div>`).join('')}</details>`;
  }

  // Marktpreis von der Trade-Seite, sortiert nach Ähnlichkeit zu deinem Item
  // Auswahl „wonach suchen?“: einzelne Mods und die Basis an- oder abwählen
  function picker(d, p, offen) {
    const A = p.auswahl; if (!A || !A.length) return '';
    const sel = p.sel ? new Set(p.sel.map(Number)) : null;
    const KIND = { impl: 'Implicit', craft: 'Crafted', frac: 'Fractured', enchant: 'Enchant' };
    return `<details class="pk"${offen ? ' open' : ''}><summary>${icon('search', 13)} Suche anpassen <span class="muted">– wähle, wonach gesucht wird</span></summary>
      <div class="pk-l">${A.map(m => `<label class="pk-m${m.ok ? '' : ' no'}"><input type="checkbox" data-pxm="${m.i}"${!m.ok ? ' disabled' : (sel ? sel.has(m.i) : true) ? ' checked' : ''}><span>${esc(m.t)}</span>${KIND[m.k] ? `<em>${KIND[m.k]}</em>` : ''}${m.ok ? '' : '<em class="x">nicht auf der Trade-Seite</em>'}</label>`).join('')}
        ${p.baseName ? `<label class="pk-m pk-b"><input type="checkbox" data-pxb${p.base ? ' checked' : ''}><span>Nur Basis <b>${esc(p.baseName)}</b></span><em>z. B. wegen Implicit</em></label>` : ''}</div>
      <div class="pk-f"><button class="btn small primary" data-pxgo="${d.t}">${icon('search', 13)} Mit Auswahl suchen</button><span class="muted">gesucht wird ab deinem Wert minus Toleranz (Einstellungen)</span></div></details>`;
  }
  if (!window.__pxBound) {
    window.__pxBound = true;
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-pxgo]'); if (!b) return;
      e.preventDefault();
      const box = b.closest('.pk'), sel = [...box.querySelectorAll('input[data-pxm]:checked')].map(i => +i.dataset.pxm), base = !!(box.querySelector('input[data-pxb]') || {}).checked;
      if (!sel.length && !base) { App.toast && App.toast('Mindestens einen Mod oder die Basis auswählen.'); return; }
      b.disabled = true; App.api('/api/price/custom', { t: b.dataset.pxgo, sel, base }).catch(() => {});
    });
  }

  const WAEHR = { chaos: 'Chaos', divine: 'Divine', alch: 'Alchemy', exalted: 'Exalted', chrome: 'Chromatic', fusing: 'Fusing', jew: "Jeweller's", alt: 'Alteration', chance: 'Chance',
    vaal: 'Vaal', regal: 'Regal', gcp: "Gemcutter's", mirror: 'Mirror', annul: 'Annulment', scour: 'Scouring', blessed: 'Blessed', chisel: 'Chisel', aug: 'Augmentation', transmute: 'Transmutation', wisdom: 'Wisdom' };
  function price(d) {
    const p = d.price; if (!p) return '';
    const dv = p.divine || 0;
    const E = p.einheit || 'Chaos', B = p.basis || 'chaos';  // PoE2: Preise in Exalted
    const wert = v => dv && v >= dv * .8 ? `${(v / dv).toFixed(v / dv >= 10 ? 1 : 2).replace('.', ',')} Divine` : v >= 10 ? `${Math.round(v)} ${E}` : `${v.toFixed(1).replace('.', ',')} ${E}`;
    if (p.busy) return `<div class="px"><div class="px-h"><b>Marktpreis</b><span class="muted"><span class="spin">${icon('refresh', 13)}</span> suche auf der Trade-Seite${p.sel ? ' mit deiner Auswahl' : ''} …</span></div><div class="px-sk"><i></i><i></i><i></i></div></div>`;
    if (p.error) return `<div class="px"><div class="px-h"><b>Marktpreis</b></div><div class="muted">${esc(p.error)}</div>${picker(d, p, true)}</div>`;
    const link = p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">Auf der Trade-Seite öffnen</a>` : '';
    const L = (p.prices || []).slice();
    if (!L.length) return `<div class="px"><div class="px-h"><b>Marktpreis</b>${link}</div><div class="muted">${p.sel ? 'Mit deiner Auswahl ist gerade nichts online. Nimm weniger Mods dazu.' : 'Gerade ist nichts Vergleichbares online. Wähle unten, worauf es dir ankommt – z. B. nur Leben und Stärke – und such gezielt danach.'}</div>${picker(d, p, true)}</div>`;
    // Einschätzung aus den ähnlichsten Angeboten
    const gut = L.filter(l => l.sim >= 70).sort((a, b) => a.chaos - b.chaos);
    // ohne Lockangebote: unteres Fünftel überspringen, bis etwa zur Mitte
    const bereich = gut.length ? [gut[Math.floor(gut.length * .2)].chaos, gut[Math.min(gut.length - 1, Math.floor(gut.length * .6))].chaos] : null;
    L.sort((a, b) => b.sim - a.sim || a.chaos - b.chaos);
    const zeig = L.slice(0, 30);
    const ang = (o, i) => {
      const w = WAEHR[o.currency] || o.currency;
      const ch = o.currency === B || o.currency === 'divine' ? '' : `<small>≈ ${wert(o.chaos)}</small>`;
      return `<div class="of${i >= 6 ? ' more' : ''}"><div class="of-p"><b>${esc(String(o.amount).replace('.', ','))}</b> ${esc(w)}${ch}</div>
        <div class="of-m"><div class="of-n">${esc(o.name || 'Angebot')}${o.ilvl ? `<span>Itemlevel ${o.ilvl}</span>` : ''}</div>
          <div class="of-s"><span class="sb2"><i style="width:${o.sim}%"></i></span>${o.sim} % ähnlich${o.of ? ` · ${o.hit}/${o.of} Mods` : ''}</div>
          ${(o.mods || []).length ? `<div class="of-x">${o.mods.map(m => `<div class="${m.my ? 'my' : ''}${m.k === 'impl' ? ' im' : ''}">${m.my ? '✓ ' : ''}${esc(m.t)}${m.tier ? `<em>${esc(m.tier.replace(/^[PS]/, 'T'))}</em>` : ''}</div>`).join('')}</div>` : ''}</div></div>`;
    };
    const IC = p.icons || {};
    const ico = (cur, n) => IC[cur] ? `<img class="cur" src="${esc(IC[cur])}" alt="" title="${esc(WAEHR[cur] || cur)}">` : `<span class="curt">${esc(WAEHR[cur] || cur)}</span>`;
    const inB = v => dv && v >= dv * .8 ? ['divine', v / dv] : [B, v];
    const zahl = v => v >= 100 ? String(Math.round(v)) : v >= 1 ? v.toFixed(1).replace('.', ',') : v.toFixed(2).replace('.', ',');
    const alter = z => { if (!z) return ''; const s = (Date.now() - Date.parse(z)) / 1000; return s < 3600 ? `vor ${Math.max(1, Math.round(s / 60))} Min.` : s < 86400 ? `vor ${Math.round(s / 3600)} Std.` : `vor ${Math.round(s / 86400)} Tagen`; };
    const est = p.schaetzung ? (() => { const e = p.schaetzung, SI = { gut: ['Hoch', 'viele sehr ähnliche Angebote'], grob: ['Mittel', 'wenige wirklich ähnliche Angebote'], unsicher: ['Niedrig', 'kaum Vergleichbares – lieber gezielt suchen'] }[e.sicher] || ['', ''];
      const [c, v] = inB(e.c), [cl, lo] = inB(e.lo), [ch, hi] = inB(e.hi);
      return `<div class="pv ${e.sicher}"><div class="pv-l">Geschätzter Wert</div><div class="pv-w">≈ ${zahl(v)} ${ico(c)}</div>
        ${e.nurBasis ? '<div class="pv-s">Keine eigenen Mods – das ist nur der Basiswert (billigstes Angebot)</div>' : ''}${e.kaumWert ? '<div class="pv-s">Kein ähnliches Angebot: alles am Markt ist deutlich besser. Realistisch nur der Mindestpreis – meist lohnt der Verkauf nicht.</div>' : ''}<div class="pv-s">${e.hi > e.lo * 1.08 ? `Spanne ${zahl(lo)}${cl !== ch ? ' ' + (WAEHR[cl] || cl) : ''}–${zahl(hi)} ${WAEHR[ch] || ch} · ` : ''}Zuverlässigkeit <b title="${SI[1]}">${SI[0]}</b></div></div>`; })() : '';
    const zeile = (o, i) => `<details class="pt-r${o.sim >= 70 ? ' gut' : ''}${i >= 8 ? ' more' : ''}"><summary>
        <span class="pt-p"><b>${esc(String(o.amount).replace('.', ','))}</b>× ${ico(o.currency)}</span>
        <span class="pt-i">${o.ilvl || '–'}</span><span class="pt-s"><i style="width:${o.sim}%"></i><em>${o.sim} %</em></span><span class="pt-z">${alter(o.zeit)}</span></summary>
        <div class="of-x">${(o.mods || []).map(m => `<div class="${m.my ? 'my' : ''}${m.k === 'impl' ? ' im' : ''}">${m.my ? '✓ ' : ''}${esc(m.t)}${m.tier ? `<em>${esc(m.tier.replace(/^[PS]/, 'T'))}</em>` : ''}</div>`).join('')}${o.konto ? `<div class="muted" style="margin-top:4px">${esc(o.konto)}</div>` : ''}</div></details>`;
    return `<div class="px"><div class="px-h"><b>Marktpreis</b><span class="muted">${p.total} online${p.ms ? ' · ' + (p.ms / 1000).toFixed(1).replace('.', ',') + ' s' : ''}</span>${link}</div>
      ${est}
      <div class="pt"><div class="pt-k"><span>Preis</span><span>iLvl</span><span>Ähnlich</span><span>Gelistet</span></div>${zeig.map(zeile).join('')}</div>
      ${L.length > 8 ? `<button class="btn small ghost pxall" data-pxall="1" data-txt="Alle ${zeig.length} Angebote zeigen">Alle ${zeig.length} Angebote zeigen</button>` : ''}
      ${p.sel ? `<div class="px-f muted">Gesucht mit ${p.sel.length} ausgewählten Mod${p.sel.length === 1 ? '' : 's'}${p.base ? ' und nur Basis ' + esc(p.baseName) : ''}.</div>` : ''}
      ${p.skipped && p.skipped.length ? `<div class="px-f muted">Nicht auf der Trade-Seite gefunden: ${p.skipped.map(esc).join(', ')}</div>` : ''}${picker(d, p, !bereich)}</div>`;
  }
  if (!window.__pxAll) {
    window.__pxAll = true;
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-pxall]'); if (!b) return;
      e.preventDefault(); const box = b.closest('.px'); box.classList.toggle('alle');
      b.textContent = box.classList.contains('alle') ? 'Weniger zeigen' : b.dataset.txt;
    });
  }

  // Präfixe/Suffixe: wie viele belegt, was frei ist und was dort am wahrscheinlichsten landet
  function affixe(d) {
    const a = d.affixe; if (!a || a.unbekannt) return '';
    const box = (n, mx) => Array.from({ length: mx }, (_, i) => `<i class="${i < n ? 'f' : ''}"></i>`).join('');
    const fp = a.max - a.p, fs = a.max - a.s, F = a.frei || {};
    const tipp = a.corrupted ? 'Korrumpiert – hier lässt sich nichts mehr ändern.'
      : a.rarity === 'MAGIC' ? (fp || fs ? `Mit einem <b>Orb of Augmentation</b> kommt ein zufälliger ${fp && fs ? 'Präfix oder Suffix' : fp ? 'Präfix' : 'Suffix'} dazu. Mit einem <b>Regal Orb</b> wird das Item selten und bekommt einen weiteren Mod.` : 'Beide Plätze belegt. Mit einem <b>Regal Orb</b> wird das Item selten und bekommt einen dritten Mod.')
      : (fp || fs ? (a.craft ? `Es ist schon ein Mod gecraftet. Freie Plätze füllst du mit einem <b>Exalted Orb</b> (zufällig).` : `Am <b>Crafting-Tisch</b> im Hideout kannst du einen ${fp && fs ? 'Präfix oder Suffix' : fp ? 'Präfix' : 'Suffix'} gezielt craften.`) : 'Alle sechs Plätze belegt.');
    const liste = (typ, label) => { const x = F[typ]; if (!x || !x.top || !x.top.length) return '';
      return `<details class="afx-l"${d.rarity === 'MAGIC' ? ' open' : ''}><summary>Mögliche ${label} (${x.anzahl})</summary>${x.top.map(m => `<div class="afx-m"><span class="afx-c"><i style="width:${Math.min(100, m.chance * 4)}%"></i></span><span class="afx-p">${m.chance.toFixed(1).replace('.', ',')} %</span><span class="afx-t">${esc(m.text || '')}</span></div>`).join('')}<div class="afx-n">Chance pro Versuch, jeweils mit der besten Stufe für Itemlevel ${esc(String(d.ilvl || ''))}.</div></details>`; };
    return `<div class="afx"><div class="afx-h"><b>${a.rarity === 'MAGIC' ? 'Magic' : 'Rare'}: Mod-Plätze</b>
        <span class="afx-s">Präfixe <span class="afx-b">${box(a.p, a.max)}</span> ${a.p}/${a.max}</span><span class="afx-s">Suffixe <span class="afx-b">${box(a.s, a.max)}</span> ${a.s}/${a.max}</span></div>
      <div class="afx-tip">${fp + fs ? `<b class="ok">${[fp && fp + ' Präfix' + (fp > 1 ? 'e' : ''), fs && fs + ' Suffix' + (fs > 1 ? 'e' : '')].filter(Boolean).join(' und ')} frei.</b> ` : ''}${tipp}</div>
      ${liste('Prefix', 'Präfixe')}${liste('Suffix', 'Suffixe')}</div>`;
  }

  function item(d) {
    if (d.vorab) return itemHeader(d) + price(d) + `<div class="pob-wait"><span class="spin">${icon('refresh', 14)}</span> Path of Building vergleicht das Item mit deiner Ausrüstung …</div>`;
    if (!d.results || !d.results.length) {
      if (d.jewel) return itemHeader(d) + `<div class="empty">${icon('gem', 40)}<div><b>Kein Juwel-Sockel geskillt</b>Sobald du einen Sockel im Tree hast, wird das Juwel automatisch verglichen.</div></div>`;
      return itemHeader(d) + affixe(d) + price(d) + `<div class="empty">${icon('item', 40)}<div><b>Kein Ausrüstungsteil</b>Dieses Item kann man nicht anlegen oder Path of Building erkennt es nicht.</div></div>`;
    }
    let res = d.results;
    const best = res[0];
    const head = d.jewel ? '<div class="sec">Beste Sockel in deinem Tree</div>' : (res.length > 1 ? '<div class="sec">Vergleich je Slot</div>' : '');
    return itemHeader(d) + warnings(d) + affixe(d) + price(d) + head + res.map(x => resultCard(x)).join('') + modList(d);
  }

  function map(d) {
    const h = d.head || {};
    const lv = { 3: ['bad', 'Gefährlich für deinen Build', 'Nicht laufen – oder die markierten Mods vorher wegrollen.'], 2: ['warn', 'Mit Vorsicht', 'Machbar, aber auf die markierten Mods achten.'],
      1: ['info', 'Machbar', 'Nichts, was deinen Build direkt kontert.'], 0: ['good', 'Sicher', 'Keine gefährlichen Mods erkannt.'] }[d.level || 0];
    const tier = h['Map Tier'];
    const stats = [['Item Quantity', 'Quantität'], ['Item Rarity', 'Seltenheit'], ['Monster Pack Size', 'Pack-Größe']]
      .filter(([k]) => h[k] != null).map(([k, l]) => `<div class="ms"><b>+${h[k]}%</b><span>${l}</span></div>`).join('');
    const SYM = { 3: '☠', 2: '!', 1: 'i', 0: '·' };
    const row = m => `<div class="mm l${m.level}"><span class="sv">${SYM[m.level]}</span><div><b>${esc(m.name)}</b>${m.forYou ? '<span class="fy">trifft deinen Build</span>' : ''}<div class="why">${esc(m.why)}</div><div class="ml">${esc(m.line)}</div></div></div>`;
    const krit = d.mods.filter(m => m.level >= 3 || m.forYou), vors = d.mods.filter(m => m.level === 2 && !m.forYou), rest = d.mods.filter(m => m.level < 2 && !m.forYou);
    return `<div class="mh"><div class="mt">${tier ? `<span class="tier">T${tier}</span>` : ''}<div><div class="in">${esc(d.name)}</div><div class="muted" style="font-size:12.5px">${d.mods.length + (d.other || []).length} Mods geprüft</div></div></div>${stats ? `<div class="mstats">${stats}</div>` : ''}</div>
      <div class="mapv ${lv[0]}"><span class="mvi">${icon(d.level >= 2 ? 'warn' : 'check', 22)}</span><div><b>${lv[1]}</b><div>${lv[2]}</div></div></div>
      ${krit.length ? `<div class="sec">Gefährlich für dich</div>${krit.map(row).join('')}` : ''}
      ${vors.length ? `<div class="sec">Vorsicht</div>${vors.map(row).join('')}` : ''}
      ${rest.length ? `<details class="mods"><summary>Harmlos für deinen Build (${rest.length})</summary>${rest.map(row).join('')}</details>` : ''}
      ${d.other && d.other.length ? `<details class="mods"><summary>Sonstige Mods (${d.other.length})</summary>${d.other.map(l => `<div class="mod">${esc(l)}</div>`).join('')}</details>` : ''}`;
  }

  function any(d) { return !d ? '' : d.kind === 'map' ? map(d) : item(d); }
  return { any, item, map, resultCard };
})();
