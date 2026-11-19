// PoE Companion – Gems im Stil des Spiels und die Ansicht „Leveling & Gems“
const Gems = {
  icons: {}, loaded: false, _f: [], info: {}, infoT: null,
  async loadInfo() {
    const t = S.char && S.char.t; if (!t || this.infoT === t) return; this.infoT = t;
    try { this.info = await api('/api/geminfo'); } catch (e) {}
  },
  async load(tries = 0) {
    try {
      const d = await api('/api/gemicons' + (App.spiel() === 'poe2' ? '?spiel=poe2' : '')); this.icons = d.icons || {}; this.loaded = true;
      if (Object.keys(this.icons).length) { lastKey.level = null; if (view === 'level') renderView(true); }
      else if (tries < 6) setTimeout(() => this.load(tries + 1), 10000);  // Bilder werden beim ersten Mal im Hintergrund geladen
    } catch (e) {}
  },
  icon(name) { return this.icons[name] || this.icons[name + ' Support'] || this.icons[name.replace(/ Support$/, '')] || ''; },
  col(g) { return g.color === 1 ? 'r' : g.color === 2 ? 'g' : g.color === 3 ? 'b' : 'w'; },
  // Gem in seiner Fassung: farbiger Sockel wie im Spiel, darin das Gem-Bild (oder ein geschliffener Stein als Ersatz)
  sock(g, size = 44) {
    const ic = this.icon(g.name);
    if (App.spiel() === 'poe2') { const f2 = g.from ? (this._f.push(g.from) - 1) : '';
      return `<span class="g2 ${this.col(g)}${g.have === false ? ' miss' : ''}${g.from ? ' fromitem' : ''}" style="width:${size}px;height:${size}px" data-gn="${esc(g.name)}" data-gl="${g.level || ''}" data-gf="${f2}">${ic ? `<img src="${esc(ic)}" alt="" loading="lazy" onerror="this.outerHTML='<i class=stone></i>'">` : '<i class="stone"></i>'}</span>`; }
    const inner = ic ? `<img src="${esc(ic)}" alt="" loading="lazy" onerror="this.outerHTML='<i class=stone></i>'">` : `<i class="stone"></i>`;
    const f = g.from ? (this._f.push(g.from) - 1) : '';
    return `<span class="sock ${this.col(g)}${g.support ? ' sup' : ''}${g.have === false ? ' miss' : ''}${g.from ? ' fromitem' : ''}" style="--s:${size}px" data-gn="${esc(g.name)}" data-gl="${g.level || ''}" data-gf="${f}">${inner}</span>`;
  },
  // Eine verlinkte Gruppe wie auf einem Item: Sockel mit Link-Stegen, darunter die Namen
  chain(grp, opts = {}) {
    if (App.spiel() === 'poe2') return this.chain2(grp, opts);
    const gems = grp.gems.filter(x => x.enabled !== false);
    const act = gems.filter(x => !x.support), sup = gems.filter(x => x.support), all = act.concat(sup).map(x => grp.from && !x.support ? Object.assign({}, x, { from: grp.from }) : x);
    const miss = all.filter(x => x.have === false).length;
    return `<div class="chain${grp.main ? ' main' : ''}">
      <div class="ch-h"><b>${esc(grp.slot || grp.label || 'Gruppe')}</b>${grp.main ? '<span class="chip warn" style="padding:1px 7px">Hauptskill</span>' : ''}
        ${miss ? `<span class="ch-miss">${miss} fehlt</span>` : opts.check ? `<span class="ch-ok">${icon('check', 13)}</span>` : ''}</div>
      <div class="ch-s">${all.map((x, i) => (i ? '<span class="lnk"></span>' : '') + this.sock(x, opts.size || 40)).join('')}</div>
      <div class="ch-n">${all.map(x => `<span class="${x.support ? 'sp' : 'ac'}${x.have === false ? ' miss' : ''}" data-gn="${esc(x.name)}" data-gl="${x.level || ''}" data-gf=""><i class="gd ${this.col(x)}"></i>${esc(x.name.replace(/ Support$/, ''))}${x.level ? `<small>${x.level}</small>` : ''}</span>`).join('')}</div>
    </div>`;
  },
  // PoE2: wie im Skill-Fenster – großer Skill-Gem, daneben seine Support-Plätze (keine Item-Sockel, keine Links)
  chain2(grp, opts = {}) {
    const gems = grp.gems.filter(x => x.enabled !== false);
    const act = gems.filter(x => !x.support), sup = gems.filter(x => x.support);
    const miss = gems.filter(x => x.have === false).length;
    const gem2 = (g, gross) => {
      const ic = this.icon(g.name), f = g.from ? (this._f.push(g.from) - 1) : '';
      return `<span class="g2 ${this.col(g)}${gross ? ' big' : ''}${g.have === false ? ' miss' : ''}${g.from ? ' fromitem' : ''}" data-gn="${esc(g.name)}" data-gl="${g.level || ''}" data-gf="${f}">${ic ? `<img src="${esc(ic)}" alt="" loading="lazy" onerror="this.outerHTML='<i class=stone></i>'">` : '<i class="stone"></i>'}${g.level && gross ? `<em>${g.level}</em>` : ''}</span>`;
    };
    const slots = Math.max(sup.length, act.length ? 2 : 0);
    return `<div class="chain c2${grp.main ? ' main' : ''}">
      <div class="ch-h"><b>${esc(grp.slot || grp.label || 'Skill')}</b>${grp.main ? '<span class="chip warn" style="padding:1px 7px">Hauptskill</span>' : ''}
        ${miss ? `<span class="ch-miss">${miss} fehlt</span>` : opts.check ? `<span class="ch-ok">${icon('check', 13)}</span>` : ''}</div>
      <div class="c2-row">${act.map(g => gem2(g, true)).join('')}<div class="c2-sup">${sup.map(g => gem2(g, false)).join('')}${'<span class="g2 leer"></span>'.repeat(Math.max(0, slots - sup.length))}</div></div>
      <div class="ch-n">${act.concat(sup).map(x => `<span class="${x.support ? 'sp' : 'ac'}${x.have === false ? ' miss' : ''}" data-gn="${esc(x.name)}" data-gl="${x.level || ''}" data-gf=""><i class="gd ${this.col(x)}"></i>${esc(x.name.replace(/ Support$/, ''))}${x.level ? `<small>${x.level}</small>` : ''}</span>`).join('')}</div>
    </div>`;
  },
};
Gems.load();

// Woher bekommt man ein Gem? (Quest-Belohnung / Händler je Akt und Klasse)
const ALLE = ['Marauder', 'Witch', 'Ranger', 'Duelist', 'Templar', 'Shadow', 'Scion'];
const NICHT_GEM = { 'On Kill Monster Explosion': 'Monster explodieren beim Töten – kein Gem, sondern ein Mod auf einem Item („Enemies you Kill … Explode“).', EnemyExplode: 'Monster explodieren beim Töten – kein Gem. Kommt von einem Item oder Aufstiegspunkt deines Guides (z. B. „Explode“-Mods).' };
Gems.base = () => { const c = S.char && S.char.sheet && S.char.sheet.class; return (window.ASC && ASC.classes[c] && ASC.classes[c].base) || c || ''; };
Gems.art = (base) => {
  if (!Gems._art) { Gems._art = {}; fetch('/ui/data/baseart_poe2.json').then(r => r.json()).then(j => { Gems._art = j; }).catch(() => {}); }
  const p = Gems._art[base]; return p ? 'https://cdn.poe2db.tw/image/' + p + '.webp' : '';
};
Gems.quelleHinweis = () => {
  const p = (typeof activeProfile === 'function' && activeProfile()) || {};
  if (p.mode !== 'link') return '';
  const C = S.campaign || {}, lvB = (S.char && ((S.char.sheet || {}).level || (S.char.info || {}).level)) || 0;
  if (C.level && lvB && Math.abs(C.level - lvB) >= 3) return `<div class="u-warn" style="margin:6px 0 10px"><span><b>Nicht dein aktueller Stand:</b> Laut Spiel-Log ist ${esc(C.charName || 'dein Charakter')} Level ${C.level}, dein Build-Link ist aber Level ${lvB}. Die Gems hier stammen aus dem Link. Exportier deinen Charakter in Path of Building 2 neu (pobb.in) und ersetz den Link unter „Profile“.</span></div>`;
  return `<div class="cr-hint" style="margin:6px 0 10px"><span>Diese Gems stammen aus deinem Build-Link (Path of Building) – pathofexile.com gibt PoE2-Charaktere nicht heraus. Hast du im Spiel etwas geändert, exportier den Build neu und ersetz den Link unter „Profile“.</span></div>`;
};
Gems.von = (f) => {
  if (!f) return null;
  if (f.kind === 'item') return { item: true, txt: `Kein Gem – diesen Skill gibt dir das Item „${f.name}“${f.base ? ' (' + f.base + (f.rarity === 'UNIQUE' ? ', Unique' : '') + ')' : ''}${f.slot ? ' im Slot ' + f.slot : ''}. Solange du es trägst, hast du den Skill. Kaufen: auf der Trade-Seite nach „${f.name}“ suchen.` };
  if (f.kind === 'explode') return { item: true, txt: 'Kein Gem – Monster explodieren durch einen Mod auf deinen Items' + (f.items && f.items.length ? ': ' + f.items.map(i => `„${i.name}“ (${i.base})`).join(', ') + '. Beispiel-Mod: ' + f.items[0].mod.replace(/^\{[^}]*\}/, '') : '.') };
  if (f.kind === 'tree') { const n = window.TREE && TREE.nodes[f.id]; return { item: true, txt: `Kein Gem – kommt aus dem Skilltree${n ? ': „' + n.n + '“' : ''}${n && n.asc ? ' (Aufstiegspunkt)' : ''}.` }; }
  return { item: true, txt: 'Kein Gem – kommt von „' + (f.name || '?') + '“.' };
};
Gems.stufe = (name) => {
  if (!Gems._st) { Gems._st = {}; fetch('/ui/data/gemstufe_poe2.json').then(r => r.json()).then(j => { Gems._st = j; lastKey.level = null; }).catch(() => {}); }
  const gi = Gems.info[name] || {}, st = Gems._st[name] || Gems._st[name.replace(/ Support$/, '')] || {};
  const t = gi.tier || st.t;
  return t ? { tier: t, lvl: gi.reqTier || null, att: gi.attTier || null } : null;
};
Gems.src = (name, from) => {
  const vo = Gems.von(from); if (vo) return { txt: vo.txt, warn: false, item: true };
  const nm = name.replace(/ Support$/, ''), d = window.GEMSRC && (GEMSRC[name] || GEMSRC[nm] || GEMSRC[nm + ' Support']);
  const gi = Gems.info[name];
  if (!d && gi && gi.gem === false) return { txt: `Kein normaler Gem – „${name}“ kommt von einem Item oder Mod. Im Guide (pobb.in) unter „Items“ nachsehen, welches Item ihn gibt.`, warn: true, item: true };
  if (App.spiel() === 'poe2' && !(gi && gi.gem === false)) {
    const sup = /Support$/.test(name) || (gi && gi.support);
    const sg = Gems.stufe(name);
    return { txt: `Aus „Uncut ${sup ? 'Support' : 'Skill'} Gem“${sg ? ` (Stufe ${sg.tier}+)` : ''} schneiden${sg && sg.lvl ? ` · ab Charakterlevel ${sg.lvl}` : ''}`,
      lang: `In PoE 2 gibt es keine Gem-Händler: Du schneidest den Gem aus einem „Uncut ${sup ? 'Support' : 'Skill'} Gem“${gi && gi.tier ? ` ab Stufe ${gi.tier}` : ''} (Rechtsklick → Gem auswählen). Uncut Gems droppen überall; fehlt dir einer, gibt es ihn günstig im Currency Exchange (Alva) oder auf der Trade-Seite.` };
  }
  if (!d) return { txt: NICHT_GEM[name] || `Gibt es nicht bei Quests oder Händlern. Auf der Trade-Seite nach dem Gem „${nm}“ suchen (oder als Drop finden).`, warn: true };
  const base = Gems.base();
  const kl = c => !c.length || c.length >= 7 ? 'alle Klassen' : c.join(', ');
  const fuer = c => !c.length || c.includes(base);
  const q = d.q.find(x => fuer(x[3])), v = d.v.find(x => fuer(x[3]));
  const out = [];
  if (q) out.push(`Belohnung Akt ${q[0]}: „${q[1]}“ bei ${q[2]}`);
  if (v) out.push(`kaufen Akt ${v[0]} bei ${v[2]}`);
  let warn = false;
  if (!q && !v) {
    const q0 = d.q[0], v0 = d.v[0];
    if (q0) out.push(`Akt ${q0[0]} nur für ${kl(q0[3])}`);
    if (v0) out.push(`kaufen Akt ${v0[0]} bei ${v0[2]} (${kl(v0[3])})`);
    warn = true;
  }
  const früh = d.q.concat(d.v).sort((a, b) => a[0] - b[0])[0];
  const klassenHinweis = früh && früh[3].length && früh[3].length < 7 && !früh[3].includes(base) ? `Am frühesten (Akt ${früh[0]}) nur als ${früh[3].join(' / ')}.` : '';
  return { txt: out.join(' · ') + (klassenHinweis ? '. ' + klassenHinweis : ''), warn, lvl: d.lvl };
};

let levelStage = null;
function level(force) {
  const el = sec('level');
  if (!S.profiles.list.length) return needProfile(el);
  if (!S.tree) return S.char ? (el.innerHTML = `<div class="ph"><div><h1>Gems</h1></div></div><div class="card pad"><div class="empty">${icon('gem', 40)}<div><b>Kein Guide hinterlegt</b>Mit einem pobb.in-Link deines Guides siehst du hier die Gem-Setups jeder Stufe und was dir noch fehlt.<br><br><a class="btn primary" href="#profiles">Guide eintragen</a></div></div></div>`) : loading(el);
  Gems.loadInfo().then(() => { if (Gems._ik !== Gems.infoT) { Gems._ik = Gems.infoT; lastKey.level = null; if (view === 'level') renderView(true); } });
  const k = 'lv' + S.tree.t + curStage() + levelStage + Object.keys(Gems.icons).length + (S.char && S.char.t) + Object.keys(Gems.info).length; if (lastKey.level === k && !force) return; lastKey.level = k;
  Gems._f = [];
  const t = S.tree, cur = curStage(), si = levelStage ?? cur, p = t.plans[si], gs = (t.gemsets || [])[si];
  const cg = (S.char ? S.char.gems : []).filter(g => g.gems.length);
  const prog = q => { const total = q.target.length || 1, have = q.target.filter(x => t.have.includes(x)).length; return [have, total]; };
  // Einkaufsliste: fehlende Gems der gewählten Stufe, ohne Doppelte
  const fehlt = new Map();
  if (gs) for (const g of gs.groups) if (g.enabled) for (const x of g.gems) if (x.enabled !== false && x.have === false && !fehlt.has(x.name)) fehlt.set(x.name, Object.assign({}, x, g.from && !x.support ? { from: g.from } : {}));
  const [h, tot] = prog(p);
  el.innerHTML = `<div class="ph"><div><h1>Gems</h1><div class="sub">Wähle eine Stufe deines Guides. Rot umrandete Gems fehlen dir noch.</div></div>
      <div class="act"><button class="btn" id="lref">${icon('refresh', 16)} Charakter neu laden</button></div></div>
    <div class="lsteps">${t.plans.map((q, i) => { const [a, b] = prog(q), g = (t.gemsets || [])[i];
      return `<button class="lst${i === si ? ' on' : ''}${i === cur ? ' cur' : ''}" data-i="${i}" title="${esc(q.title)}"><span class="n">${i + 1}</span><span class="tt">${esc(q.title.replace(/^\d+\)\s*/, ''))}</span>
        <span class="pb"><i style="width:${a / b * 100}%"></i></span>${g && g.missing ? `<span class="mm">${g.missing}</span>` : ''}</button>`; }).join('')}</div>
    <div class="lgrid">
      <div class="card pad">
        <h3>${esc(p.title)} ${si === cur ? '<span class="chip warn" style="margin-left:8px;vertical-align:2px">deine Stufe</span>' : ''}<span class="r"><a href="#tree" id="ltree">im Skilltree zeigen</a></span></h3>
        <div class="ltp"><div class="prog"><i style="width:${h / tot * 100}%"></i></div><span>${h} von ${tot} Punkten im Tree</span></div>
        ${gs ? `<div class="chains">${gs.groups.filter(g => g.enabled && g.gems.length).map(g => Gems.chain(g, { check: true, size: 50 })).join('')}</div>` : '<div class="muted">Für diese Stufe enthält der Guide keine Gems.</div>'}
      </div>
      <div style="display:grid;gap:18px;align-content:start">
        <div class="card pad"><h3>Einkaufsliste <span class="r muted">${fehlt.size ? fehlt.size + ' Gems' : ''}</span></h3>
          ${fehlt.size ? `<div class="buy">${[...fehlt.values()].map(x => { const q = Gems.src(x.name, x.from); return `<div class="bi">${Gems.sock(Object.assign({}, x, { have: true }), 40)}<div><b>${esc(x.name)}</b><small>${q.item ? 'vom Item' : x.support ? 'Support' : 'Skill'}${q.lvl ? ', ab Level ' + q.lvl : ''}</small><div class="gsrc${q.warn ? ' w' : ''}">${esc(q.txt)}</div></div></div>`; }).join('')}</div>
            <div class="muted" style="font-size:12.5px;margin-top:10px">Angaben für deine Klasse (${esc(Gems.base() || '–')}). Siosa (Akt 3, Bibliothek) und Lilly Roth (ab Akt 6) verkaufen fast alle Gems an jede Klasse.</div>`
          : `<div class="donebox" style="padding:18px 6px">${icon('check', 26)}<div style="margin-top:6px">Du hast alle Gems dieser Stufe.</div></div>`}
        </div>
      </div>
    </div>
    <div class="card pad" style="margin-top:18px"><h3>Deine Gems jetzt <span class="r muted">${S.char ? 'Stand ' + zeit(S.char.t) : ''}</span></h3>${Gems.quelleHinweis()}
      ${cg.length ? `<div class="chains two">${cg.sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0) || b.gems.length - a.gems.length).map(g => Gems.chain(g, { size: 42 })).join('')}</div>` : '<div class="muted">Keine Gems gefunden.</div>'}
    </div>`;
  $('#lref').onclick = refresh;
  $('#ltree').onclick = e => { e.preventDefault(); stage = si; api('/api/settings', { treeStage: si }); location.hash = 'tree'; setTimeout(() => tv && tv.focusNext(), 80); };
  el.querySelectorAll('.lst').forEach(b => b.onclick = () => { levelStage = +b.dataset.i === cur ? null : +b.dataset.i; level(true); });
}

// ------------------------------------------------------------------ Hover-Info: Quelle, Level 1→20, Qualität
Gems.tpl = s => s.replace(/\d+(?:\.\d+)?/g, '#');
Gems.diff = (a, b) => {
  const m = new Map((a || []).map(s => [Gems.tpl(s), s])), out = [];
  for (const s of b || []) {
    const t = Gems.tpl(s), x = m.get(t);
    if (x == null) { out.push(`<div class="gl nw">${esc(s)}<em>neu</em></div>`); continue; }
    if (x === s) { out.push(`<div class="gl same">${esc(s)}</div>`); continue; }
    const na = x.match(/\d+(?:\.\d+)?/g) || [], nb = s.match(/\d+(?:\.\d+)?/g) || [];
    let i = 0; const html = esc(t).replace(/#/g, () => { const p = na[i], q = nb[i]; i++; return p !== q ? `<span class="o">${p}</span>→<b>${q}</b>` : `<b>${q}</b>`; });
    const k = na.findIndex((p, j) => p !== nb[j]), pc = k >= 0 && +na[k] ? Math.round((+nb[k] / +na[k] - 1) * 100) : null;
    out.push(`<div class="gl ch">${html}${pc != null && isFinite(pc) ? `<em class="${pc >= 0 ? 'up' : 'dn'}">${pc >= 0 ? '+' : ''}${pc} %</em>` : ''}</div>`);
  }
  return out.join('');
};
Gems.tip = (el) => {
  const name = el.dataset.gn, i = Gems.info[name] || Gems.info[name.replace(/ Support$/, '')], f = el.dataset.gf ? Gems._f[+el.dataset.gf] : null;
  const q = Gems.src(name, f), col = el.classList.contains('r') ? '#e0675a' : el.classList.contains('g') ? '#8fd16b' : el.classList.contains('b') ? '#7fa8ff' : '#ddd';
  let h = `<div class="gt-h" style="color:${col}">${esc(name)}</div>`;
  if (i && i.tags) h += `<div class="gt-tags">${esc(i.tags)}</div>`;
  if (f && f.kind === 'item' && f.base) { const a = Gems.art(f.base);
    h += `<div class="gt-item${f.rarity === 'UNIQUE' ? ' u' : ''}">${a ? `<img src="${esc(a)}" alt="">` : ''}<div><b>${esc(f.name || '')}</b><small>${esc(f.base)}${f.rarity === 'UNIQUE' ? ' · Unique' : ''}</small>${f.rarity === 'UNIQUE' ? '<small>Droppt zufällig (Weltdrop) – am schnellsten auf der Trade-Seite kaufen.</small>' : ''}</div></div>`; }
  h += `<div class="gt-src${q.warn ? ' w' : ''}"><b>Woher?</b> ${esc(q.lang || q.txt)}</div>`;
  const sg = App.spiel() === 'poe2' ? Gems.stufe(name) : null;
  const at = a => a ? Object.entries(a).map(([k, v]) => `${v} ${({ Str: 'Stärke', Dex: 'Geschick', Int: 'Intelligenz' })[k]}`).join(' · ') : '';
  if (sg) {
    h += `<div class="gt-req"><b>Ab wann tragbar?</b><span>Frühestens als Gem-Level ${sg.tier} (aus einem Uncut Gem Stufe ${sg.tier} oder höher)</span>${sg.lvl ? `<span>braucht dann Charakterlevel ${sg.lvl}${sg.att ? ' · ' + at(sg.att) : ''}</span>` : ''}
      ${i && i.reqMax ? `<span>Level ${i.maxL || 20}: Charakterlevel ${i.reqMax}${i.attMax ? ' · ' + at(i.attMax) : ''}</span>` : ''}</div>`;
  } else if (i && (i.req1 != null || i.att)) {
    h += `<div class="gt-req"><b>Voraussetzungen</b><span>Level 1: Charakterlevel ${i.req1 ?? 1}${i.att ? ' · ' + at(i.att) : ''}</span><span>Level ${i.maxL || 20}: Charakterlevel ${i.reqMax ?? '?'}${i.attMax ? ' · ' + at(i.attMax) : ''}</span></div>`;
  }
  if (App.spiel() === 'poe2' && i && !i.support && i.gem) h += `<div class="gt-req"><b>Support-Plätze</b><span>1. und 2. Platz: hat jeder Skill-Gem</span><span>3. Platz: Lesser Jeweller's Orb</span><span>4. Platz: Greater Jeweller's Orb</span><span>5. Platz: Perfect Jeweller's Orb</span></div>`;
  if (i && (i.l1 || []).length + (i.lmax || []).length) {
    const kost = c => c ? `${c[1]} ${({ Mana: 'Mana', Life: 'Leben', ES: 'ES', ManaPercent: '% Mana', LifePercent: '% Leben' })[c[0]] || c[0]}` : '';
    h += `<div class="gt-sec">Level 1 → ${i.maxL || 20}${i.req1 != null ? ` <span>Charakterlevel ${i.req1} → ${i.reqMax}</span>` : ''}</div>`;
    if (i.c1 && i.cMax) h += `<div class="gl ch">Kosten <span class="o">${esc(kost(i.c1))}</span>→<b>${esc(kost(i.cMax))}</b></div>`;
    h += Gems.diff(i.l1, i.lmax);
  } else if (!q.item) h += `<div class="gt-sec muted">Werte werden nach dem Laden des Charakters berechnet.</div>`;
  if (i && (i.q20 || []).length) h += `<div class="gt-sec">Mit 20 % Qualität zusätzlich</div>${i.q20.map(s => `<div class="gl q">${esc(s)}</div>`).join('')}`;
  if (el.dataset.gl) h += `<div class="gt-f">Dein Gem: Level ${esc(el.dataset.gl)}</div>`;
  return h;
};
(() => {
  const tip = document.createElement('div'); tip.id = 'gtip'; document.body.appendChild(tip);
  let cur = null;
  document.addEventListener('mouseover', e => {
    const el = e.target.closest && e.target.closest('[data-gn]');
    if (el === cur) return; cur = el;
    if (!el) { tip.classList.remove('on'); return; }
    tip.innerHTML = Gems.tip(el); tip.classList.add('on');
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, hh = tip.offsetHeight;
    let x = r.right + 12, y = r.top - 8;
    if (x + w > innerWidth - 10) x = r.left - w - 12;
    if (y + hh > innerHeight - 10) y = Math.max(10, innerHeight - hh - 10);
    tip.style.left = Math.max(10, x) + 'px'; tip.style.top = y + 'px';
  });
})();
