// PoE Companion – Hub
const { api, esc, num, full, pct, sgn, icon, gemChip, rarityColor, zeit, datum, toast } = App;
const $ = s => document.querySelector(s);
const sec = v => document.querySelector(`section[data-v="${v}"]`);
let S = null, view = location.hash.slice(1) || 'home', tv = null, stage = null, selHist = null, formOpen = null, lastKey = {};

const NAV = [
  ['home', 'Übersicht', 'home'], ['quest', 'Kampagne', 'flag'], ['tree', 'Skilltree', 'tree'], ['level', 'Gems', 'gem'],
  ['upgrades', 'Upgrades', 'up'], ['craft', 'Crafting', 'bolt'], ['items', 'Item-Check', 'item'], ['maps', 'Map-Check', 'map'], ['timeless', 'Timeless-Juwelen', 'gem'], ['stash', 'Stash & Farming', 'coin'], null, ['profiles', 'Profile & Freunde', 'users'], ['settings', 'Einstellungen', 'gear'], ['help', 'Anleitung', 'flag'],
];

function nav() {
  const t = S && S.tree, p = t && t.plans[curStage()];
  const offen = p ? p.steps.flat().length + p.remove.length : 0;
  $('#nav').innerHTML = NAV.filter(n => !(n && n[0] === 'timeless' && App.spiel() === 'poe2')).map(n => n ? `<a href="#${n[0]}" class="${view === n[0] ? 'on' : ''}">${icon(n[2], 19)}<span>${n[1]}</span>${n[0] === 'tree' && t ? `<span class="badge${offen ? ' w' : ''}">${offen ? offen : '✓'}</span>` : ''}</a>` : '<div class="sep"></div>').join('');
}
window.addEventListener('hashchange', () => { view = location.hash.slice(1) || 'home'; show(); });

function show() {
  document.querySelectorAll('section').forEach(s => { const an = s.dataset.v === view; if (an && !s.classList.contains('on')) s.scrollTop = 0; s.classList.toggle('on', an); });
  nav(); renderView(true);
}

function sidebar() {
  const p = activeProfile(), c = S.char && S.char.sheet;
  $('#prof').innerHTML = p ? `<div class="av">${esc((p.name || '?')[0].toUpperCase())}</div><div style="min-width:0"><div class="pn">${esc(p.name)}</div><div class="ps">${c ? `Lv ${c.level} ${esc(c.class)}` : p.mode === 'link' ? 'Guide-Build' : esc(p.account)}</div></div>`
    : `<div class="av">+</div><div><div class="pn">Profil anlegen</div><div class="ps">Account & Charakter</div></div>`;
  const st = S.status;
  $('#stat').innerHTML = `<span class="dot ${st.error ? 'err' : st.busy ? 'busy' : ''}"></span><span>${esc(st.error ? 'Fehler – siehe Hinweis' : st.text)}</span>`;
}
$('#prof').onclick = () => location.hash = 'profiles';

const activeProfile = () => S && S.profiles.list.find(p => p.id === S.profiles.active);
const curStage = () => { const t = S && S.tree; if (!t) return 0; const s = stage ?? S.settings.treeStage; return (s != null && s < t.plans.length) ? s : t.sel; };

App.on(s => {
  if (!s) { $('#stat').innerHTML = '<span class="dot err"></span><span>Dienst beendet</span>'; return; }
  S = s;
  if (s.settings && s.settings.hubGoto) { const g = s.settings.hubGoto; api('/api/settings', { hubGoto: '' }); if (location.hash !== '#' + g) { location.hash = g; return; } }
  sidebar(); nav(); renderView(false);
});
App.start();
document.querySelector('.mark').innerHTML = '<img src="logo.svg" alt="">';

function renderView(force) {
  if (!S) return;
  const key = JSON.stringify([S.rev]);
  ({ home, quest, tree, level, upgrades, craft, items, maps, timeless, stash, profiles, settings, help })[view]?.(force);
}

function needProfile(el) {
  el.innerHTML = `<div class="empty" style="height:80vh">${icon('users', 46)}<div><b>Noch kein Profil</b>Leg ein Profil mit deinem PoE-Account und Charakter an.<br><br><a class="btn primary" href="#profiles">${icon('plus', 16)} Profil anlegen</a></div></div>`;
}
function loading(el, text) {
  el.innerHTML = `<div class="empty" style="height:80vh"><span class="spin" style="color:var(--gold2)">${icon('refresh', 40)}</span><div><b>${esc(text || S.status.text)}</b>Path of Building rechnet deinen Build durch …</div></div>`;
}
function errorBox() {
  return S.status.error ? `<div class="alert bad pop" style="margin-bottom:18px">${icon('warn', 16)}<div><b>Hinweis</b>${esc(S.status.error)} <a href="#" onclick="api('/api/dismiss-error',{});return false" style="margin-left:8px">schließen</a></div></div>` : '';
}

// ------------------------------------------------------------------ Übersicht
function buildTips(c) {
  const t = [];
  const cap = (v, m) => (m && m > 0 ? m : 75);
  for (const [k, l] of [['fire', 'Feuer'], ['cold', 'Kälte'], ['light', 'Blitz']]) {
    const m = cap(c[k], c[k + 'Max']);
    if (c[k] < m) t.push(['bad', `${l}-Resistenz nicht gecappt: ${Math.round(c[k])}% von ${m}% – dir fehlen ${Math.round(m - c[k])}%.`]);
  }
  if (c.chaos < 0) t.push(['warn', `Chaos-Resistenz ist negativ (${Math.round(c.chaos)}%). Gegen Chaos-Schaden bist du anfällig.`]);
  const hits = [['Phys', c.hitPhys], ['Feuer', c.hitFire], ['Kälte', c.hitCold], ['Blitz', c.hitLight], ['Chaos', c.hitChaos]];
  const min = hits.reduce((a, b) => a[1] < b[1] ? a : b);
  const pool = c.life + c.es;
  if (c.level >= 80 && min[1] < pool * 0.9) t.push(['warn', `Schwächster Max-Hit: ${min[0]} mit ${full(min[1])}. Das ist deine größte Schwachstelle.`]);
  if (c.level >= 70 && pool < 5000) t.push(['warn', `Leben + ES zusammen nur ${full(pool)}. Für Maps ab Tier 10 sind 5.000+ empfehlenswert.`]);
  if (c.move < 1.2 && c.level >= 30) t.push(['warn', 'Kaum Laufgeschwindigkeit. Stiefel mit 25–30% Movement Speed machen das Spielen deutlich angenehmer.']);
  if (c.manaFree < 30 && c.mana > 0) t.push(['warn', `Nur ${Math.round(c.manaFree)} Mana frei. Achte darauf, dass deine Skills genug Mana haben.`]);
  if (c.suppress > 0 && c.suppress < 100) t.push(['warn', `Spell Suppression bei ${Math.round(c.suppress)}% – erst bei 100% voll wirksam.`]);
  if (!t.length) t.push(['good', 'Keine offensichtlichen Lücken gefunden. Resistenzen gecappt, Schutz solide.']);
  return t;
}

function home(force) {
  const el = sec('home');
  if (!S.profiles.list.length) return needProfile(el);
  const c = S.char && S.char.sheet, info = S.char && S.char.info;
  if (!c) return S.status.error ? (el.innerHTML = errorBox() + `<a class="btn" href="#profiles">Profil prüfen</a>`) : loading(el);
  const k = 'home' + S.rev; if (lastKey.home === k && !force) return; lastKey.home = k;
  const resRow = (l, v, m, col) => { m = m > 0 ? m : 75; const w = Math.max(0, Math.min(100, (v + 60) / (m + 60) * 100)); return `<div class="resr"><span>${l}</span><div class="bar"><i style="width:${w}%;background:linear-gradient(90deg,color-mix(in srgb,${col} 45%,#000),${col})"></i><span class="cap" style="left:${(m + 60) / (m + 60) * 100 - .5}%"></span></div><b style="color:${v >= m ? 'var(--text)' : 'var(--bad)'}">${Math.round(v)}%</b></div>`; };
  const hits = [['Phys', c.hitPhys, 'var(--phys)'], ['Feuer', c.hitFire, 'var(--fire)'], ['Kälte', c.hitCold, 'var(--cold)'], ['Blitz', c.hitLight, 'var(--light)'], ['Chaos', c.hitChaos, 'var(--chaos)']];
  const hmax = Math.max(...hits.map(h => h[1]), 1);
  const t = S.tree, p = t && t.plans[curStage()];
  let lvHtml = `<div class="muted">Kein Guide hinterlegt. Unter <a href="#profiles">Profile</a> einen pobb.in-Link eintragen, dann zeigt dir der Companion jeden nächsten Skillpunkt.</div>`;
  if (p) {
    const total = p.target.length || 1, have = p.target.filter(x => t.have.includes(x)).length;
    const nextId = p.steps[0] && p.steps[0][p.steps[0].length - 1];
    lvHtml = `<div style="display:flex;justify-content:space-between;font-size:13px"><b>${esc(p.title)}</b><span class="muted">${have} / ${total} Punkte</span></div>
      <div class="prog" style="margin:10px 0"><i style="width:${have / total * 100}%"></i></div>
      ${nextId ? `<div class="nextstep"><div class="nico" id="nico"></div><div><div class="muted" style="font-size:11.5px;letter-spacing:.02em;font-family:var(--serif);font-size:13px">Als Nächstes</div><b style="font:700 16px var(--serif)">${esc(TREE.nodes[nextId].n)}</b><div class="muted" style="font-size:12.5px">${p.steps[0].length} Punkt${p.steps[0].length > 1 ? 'e' : ''} · noch ${p.steps.flat().length} insgesamt</div></div><a class="btn small" href="#tree" style="margin-left:auto">Zum Tree</a></div>` : `<div class="chip good">${icon('check', 14)} Stufe komplett geskillt</div>`}`;
  }
  const last = S.history[0];
  el.innerHTML = errorBox() + QOL.setupCard() + handelKarte() + `
  <div class="hero">
    <div class="card hero-main frame">
      <div class="cls">${esc(c.class)} · <span class="lvx" title="Level stimmt nicht? Klicken und dein echtes Level eintragen">Level <b id="lvx">${(S.campaign && S.campaign.level && activeProfile().mode === 'link') ? S.campaign.level : c.level}</b>${activeProfile().mode === 'link' ? ' <button class="lv-ed" id="lved" aria-label="Level korrigieren">' + icon('edit', 11) + '</button>' : ''}</span>${info.league ? ' · ' + esc(info.league) : ''}${(S.campaign && S.campaign.level && activeProfile().mode === 'link' && +S.campaign.level !== +c.level) ? ` <span class="muted" title="Dein Build-Link ist auf Level ${c.level} gerechnet">(Build-Link: Lv ${c.level})</span>` : ''}</div>
      <div class="cname">${esc(info.char || activeProfile().name)}</div>
      <div class="cmeta">${esc(activeProfile().mode === 'link' ? 'Guide-Build' : activeProfile().account)} · aktualisiert ${zeit(S.char.t)}</div>
      <div class="dpsbig"><span class="dl">Schaden pro Sekunde</span><b>${num(c.dps)}</b></div>
      <div class="skillpill">${icon('bolt', 15)} ${esc(c.skill || 'Hauptskill')}</div>
      ${typeof Asc !== 'undefined' && window.ASC ? `<div class="hp">${Asc.portrait(c.class, 132)}</div>` : ''}
      <div style="position:absolute;right:22px;top:22px;display:flex;gap:8px;z-index:2"><button class="btn small" id="rf">${icon('refresh', 15)} Aktualisieren</button></div>
    </div>
    <div class="kpis">
      <div class="card kpi"><div class="kl">${icon('shield', 15)} eHP</div><div class="kv">${num(c.ehp)}</div><div class="ks">Effektive Lebenspunkte</div></div>
      <div class="card kpi"><div class="kl">${icon('heart', 15)} Leben / ES</div><div class="kv">${full(c.life)}<span class="muted" style="font-size:18px"> / ${full(c.es)}</span></div><div class="ks">${full(c.manaFree)} Mana frei</div></div>
      <div class="card kpi"><div class="kl">${icon('sword', 15)} Treffer</div><div class="kv">${num(c.hit)}</div><div class="ks">${c.speed.toFixed(2)} / s · ${c.crit.toFixed(1)}% Krit</div></div>
      <div class="card kpi"><div class="kl">${icon('warn', 15)} Schwächster Max-Hit</div><div class="kv">${num(Math.min(...hits.map(h => h[1])))}</div><div class="ks">${hits.reduce((a, b) => a[1] < b[1] ? a : b)[0]}-Schaden</div></div>
    </div>
  </div>
  <div class="grid3">
    <div class="card pad"><h3>Resistenzen</h3><div class="res">${resRow('Feuer', c.fire, c.fireMax, 'var(--fire)')}${resRow('Kälte', c.cold, c.coldMax, 'var(--cold)')}${resRow('Blitz', c.light, c.lightMax, 'var(--light)')}${resRow('Chaos', c.chaos, c.chaosMax, 'var(--chaos)')}</div></div>
    <div class="card pad"><h3>Max-Hit pro Schadensart</h3><div class="res">${hits.map(h => `<div class="resr"><span>${h[0]}</span><div class="bar"><i style="width:${h[1] / hmax * 100}%;background:${h[2]}"></i></div><b>${num(h[1])}</b></div>`).join('')}</div></div>
    <div class="card pad"><h3>Verteidigung</h3><div class="kv2">
      <span>Rüstung</span><b>${full(c.armour)}</b><span>Ausweichen</span><b>${full(c.evasion)}</b>
      <span>Block / Zauberblock</span><b>${Math.round(c.block)}% / ${Math.round(c.spellBlock)}%</b>
      ${App.spiel() === 'poe2' ? '' : `<span>Spell Suppression</span><b>${Math.round(c.suppress)}%</b>`}
      <span>Leben-Regeneration</span><b>${full(c.lifeRegen)}/s</b>
      <span>Laufgeschwindigkeit</span><b>${sgn((c.move - 1) * 100, 0)}%</b></div></div>
  </div>
  ${Upg.html()}
  <div class="grid2">
    <div class="card pad"><h3>Build-Check <span class="r muted">automatische Hinweise</span></h3><div class="tips">${buildTips(c).map(([k, t]) => `<div class="tip ${k}">${icon(k === 'good' ? 'check' : 'warn', 16)}<div>${esc(t)}</div></div>`).join('')}</div></div>
    <div style="display:grid;gap:18px">
      <div class="card pad"><h3>Leveling-Fortschritt</h3>${lvHtml}</div>
      <div class="card pad"><h3>Zuletzt geprüft <span class="r"><a href="#items">alle anzeigen</a></span></h3>${last ? `<div style="display:flex;align-items:center;gap:12px"><div style="min-width:0"><div style="font:700 16px var(--serif);color:${rarityColor(last.rarity)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(last.name)}</div><div class="muted" style="font-size:12.5px">${esc(last.slot)} · ${datum(last.t)}</div></div><div style="margin-left:auto;text-align:right"><div class="${last.dps >= 0 ? 'good' : 'bad'}" style="font-weight:700">${sgn(last.dps)}% DPS</div><div class="${last.ehp >= 0 ? 'good' : 'bad'}" style="font-weight:700;font-size:13px">${sgn(last.ehp)}% eHP</div></div></div>` : `<div class="muted">Noch nichts geprüft. Im Spiel ${App.itemKey(S)} auf ein Item drücken.</div>`}</div>
    </div>
  </div>`;
  $('#rf').onclick = refresh;
  const lved = $('#lved');
  if (lved) lved.onclick = () => {
    const b = $('#lvx'); if (!b || b.querySelector('input')) return;
    b.innerHTML = `<input id="lvin" type="number" min="1" max="100" value="${esc(b.textContent)}" style="width:58px;padding:1px 4px;font:inherit">`;
    const i = $('#lvin'); i.focus(); i.select();
    const ok = async () => { const v = +i.value; if (v >= 1 && v <= 100) { await api('/api/profiles/level', { level: v }).catch(() => {}); if (S.campaign) S.campaign.level = v; } home(true); };
    i.onkeydown = e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') home(true); };
    i.onblur = ok;
  };
  el.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { try { navigator.clipboard.writeText(b.dataset.copy); b.classList.add('ok'); b.textContent = 'Kopiert – im Chat einfügen'; } catch (e) {} });
  if (p && p.steps[0] && tv) { const id = p.steps[0][p.steps[0].length - 1]; tv.cssIcon($('#nico'), tv.iconSheet(id), TREE.nodes[id].ic, 46); }
  else if (p && p.steps[0]) setTimeout(() => { ensureTree(); home(true); }, 50);
}

// Eingehende Handelsanfragen aus dem Spiel-Log – nur anzeigen und Chat-Befehle zum Einfügen kopieren, nichts wird automatisch gesendet
function handelKarte() {
  const H = ((S.campaign || {}).handel || []).slice(0, 5);
  if (!H.length) return '';
  return `<div class="card pad handel"><h3>Handelsanfragen <span class="r muted">aus dem Spiel-Log · ${H.length}</span></h3>
    ${H.map(h => `<div class="hd-r"><div class="hd-i"><b>${esc(h.item)}</b><span>${esc(h.preis)} ${esc(h.waehrung)} · von <b>${esc(h.wer)}</b> · ${esc(String(h.zeit).slice(11, 16))}</span>
      ${h.tab ? `<small>Stash-Tab „${esc(h.tab)}“${h.pos ? ` · Spalte ${h.pos[0]}, Zeile ${h.pos[1]}` : ''}</small>` : ''}</div>
      <div class="hd-b"><button class="btn small" data-copy="/invite ${esc(h.wer)}">Einladen kopieren</button><button class="btn small ghost" data-copy="@${esc(h.wer)} sold, sorry">„Verkauft“ kopieren</button></div></div>`).join('')}
    <div class="muted" style="font-size:11.5px;margin-top:6px">Klick kopiert den Chat-Befehl – im Spiel Enter drücken und einfügen. Der Companion sendet nichts selbst.</div></div>`;
}

// Nächste Upgrades (Kurzfassung auf der Übersicht; alles Weitere in der Ansicht „Upgrades“)
const Upg = {
  html() {
    UP.laden();
    const D = UP.d;
    if (!D || !D.list) return '';
    const L = D.list.slice(0, 4);
    const zeile = (v, i) => {
      const nr = `<span class="un">${i + 1}</span>`;
      if (v.art === 'leer') return `<div class="ui">${nr}<div class="ut"><b>${UP.slotName(v.slot)} ist leer</b><div class="ud">Da fehlt ein Item – selbst ein einfaches bringt Leben und Resistenzen.</div></div></div>`;
      if (v.art === 'alt') return `<div class="ui">${nr}<div class="ut"><b>${UP.slotName(v.slot)} ersetzen</b><div class="ud">${esc(v.cur || v.base)} ist ein Item von Level ${v.req} – du bist ${D.level}.</div></div></div>`;
      return `<div class="ui">${nr}<div class="ut"><b>${UP.slotName(v.slot)}: <span style="color:${rarityColor(v.rarity)}">${esc(v.name)}</span></b><span class="ug q-${v.art}">${UP.QUELLE[v.art] || ''}</span>
          <div class="ud">${v.cur ? 'statt ' + esc(v.cur) : 'Slot ist leer'}${v.preis ? ' · ab ' + UP.wert(v.preis) : ''}</div></div>
        <div class="uv"><div>${UP.plus(v.dps)} <small>DPS</small></div><div>${UP.plus(v.ehp)} <small>eHP</small></div></div></div>`;
    };
    return `<div class="card pad upg frame"><h3>Nächste Upgrades <span class="r muted">${D.laeuft ? `PoB rechnet … ${D.fertig} Items` : 'Guide, Uniques & Flasks in PoB gerechnet'}</span></h3>
      ${L.length ? `<div class="ul">${L.map(zeile).join('')}</div>` : '<div class="muted">Nichts gefunden, was spürbar besser ist als deine Ausrüstung.</div>'}
      <a class="btn small ghost" href="#upgrades" style="margin-top:10px">Alle Upgrades mit Details ansehen</a></div>`;
  },
};

async function refresh() {
  await api('/api/refresh', {});
  toast('Lade deinen Charakter neu …');
}

// ------------------------------------------------------------------ Skilltree
function ensureTree() {
  const el = sec('tree');
  if (tv) return;
  el.innerHTML = `<div class="tw"><div class="tcanvas"><canvas id="tcv"></canvas><div class="ttip" id="ttip"></div>
    <div class="ttool"><button class="btn small" id="tfocus">${icon('eye', 15)} Nächste Punkte</button><button class="btn small" id="tall">Ganzer Tree</button><button class="btn small" id="tpin">${icon('pin', 15)} Als Overlay anheften</button></div>
    <div class="tlegend"><span><i style="background:#c99d55"></i>geskillt</span><span><i style="background:#f0a050"></i>als Nächstes</span><span><i style="background:#6aa595"></i>geplant</span><span><i style="background:#cf4b3f"></i>umskillen</span><span><i style="background:#b48ad8"></i>Mastery wählen</span></div></div>
    <div class="tside"><div class="tside-h" id="thead"></div><div class="tlist" id="tlist"></div></div></div>`;
  tv = new TreeView($('#tcv'), $('#ttip'));
  $('#tfocus').onclick = () => tv.focusNext();
  $('#tall').onclick = () => { tv.fitTo(Object.keys(TREE.nodes).filter(k => TREE.nodes[k].t === 's'), 900, .2); };
  $('#tpin').onclick = () => api('/api/window', { name: 'tree', action: 'open' }).then(r => { if (!r.win) toast('Overlay-Fenster gibt es nur in der Windows-App.'); });
}

let treeT = null, checking = false;
function tree(force) {
  const el = sec('tree');
  if (!S.profiles.list.length) { tv = null; return needProfile(el); }
  if (!S.tree) {
    tv = null;
    if (S.status.busy || !S.char) return loading(el);
    el.innerHTML = `<div class="empty" style="height:100vh">${icon('tree', 46)}<div><b>Kein Guide hinterlegt</b>Trag in deinem Profil einen Guide ein (pobb.in-Link oder PoB-Code).<br>Dann zeigt dir der Companion jeden Skillpunkt in der richtigen Reihenfolge.<br><br><a class="btn primary" href="#profiles">Guide eintragen</a></div></div>`;
    return;
  }
  ensureTree();
  const t = S.tree, si = curStage(), p = t.plans[si];
  const neu = treeT !== t.t || force;
  tv.setPlan(t, si);
  if (neu && (treeT === null || force)) setTimeout(() => tv.focusNext(), 30);
  if (treeT !== null && treeT !== t.t && checking) { checking = false; }
  treeT = t.t;
  const fehlt = p.steps.flat().length, falsch = p.remove.length, mo = p.mast.filter(m => !m.hat).length;
  const doneStage = q => !q.steps.length && !q.remove.length && !q.mast.some(m => !m.hat);
  let chk;
  if (checking || (S.status.busy && S.status.ready)) chk = `<div class="chk busy"><span class="spin">${icon('refresh', 16)}</span> Lade deinen Charakter von pathofexile.com …</div>`;
  else if (!fehlt && !falsch && !mo) chk = `<div class="chk ok">${icon('check', 18)} <span>Alles richtig geskillt für <b>${esc(p.title)}</b></span><small>Stand ${zeit(t.t)}</small></div>`;
  else chk = `<div class="chk todo">${icon('warn', 18)} <span>${[fehlt && `<b>${fehlt}</b> fehlen`, falsch && `<b>${falsch}</b> falsch geskillt`, mo && `<b>${mo}</b> Mastery offen`].filter(Boolean).join(' · ')}</span><small>Stand ${zeit(t.t)}</small></div>`;
  $('#thead').innerHTML = `<div style="display:flex;align-items:center;gap:10px"><h2>Skilltree</h2><button class="btn small primary" id="tref" style="margin-left:auto">${icon('refresh', 15)} Aktualisieren</button></div>
    <div class="muted" style="font-size:12.5px;margin-top:4px">${esc(t.char.name)} · Lv ${t.char.level} · Stufe wählen:</div>
    <div class="stages">${t.plans.map((q, i) => `<span class="stg${i === si ? ' on' : ''}${doneStage(q) ? ' done' : ''}" data-i="${i}">${esc(q.title)}</span>`).join('')}</div>
    ${chk}
    <div class="tnums"><div><b style="color:#f0a050">${fehlt}</b><span>fehlen</span></div><div><b class="bad">${falsch}</b><span>umskillen</span></div><div><b style="color:#b48ad8">${mo}</b><span>Masteries</span></div></div>
    ${typeof Asc !== 'undefined' ? Asc.html(t, si) : ''}`;
  $('#tref').onclick = async () => { checking = true; tree(); await api('/api/refresh', {}); };
  document.querySelectorAll('.stg').forEach(b => b.onclick = () => { stage = +b.dataset.i; api('/api/settings', { treeStage: stage }); tree(true); tv.focusNext(); });
  const L = $('#tlist'); L.innerHTML = '';
  if (!fehlt && !falsch && !mo) L.innerHTML = `<div class="donebox">${icon('check', 30)}<div style="margin-top:8px">Diese Stufe ist komplett.<br><span class="muted" style="font-weight:400">Wähle oben die nächste Stufe.</span></div></div>`;
  if (p.steps.length) L.insertAdjacentHTML('beforeend', '<div class="lsec">Nächste Schritte</div>');
  p.steps.forEach((step, i) => {
    const id = step[step.length - 1], n = TREE.nodes[id];
    const d = document.createElement('div'); d.className = 'step' + (i === 0 ? ' first' : '');
    d.innerHTML = `<div class="num">${i + 1}</div><div class="sico ${n.t === 'k' ? 'k' : ''}"></div><div class="sst"><div class="n">${esc(n.n)}</div><div class="d">${esc((n.st || []).join(' · ') || (step.length > 1 ? 'Weg über ' + step.length + ' Punkte' : ''))}</div></div><div class="pts">+${step.length}</div>`;
    tv.cssIcon(d.querySelector('.sico'), tv.iconSheet(id), n.ic, n.t === 'k' ? 44 : 40);
    d.onclick = () => tv.fitTo(step, 500, .5);
    d.onmouseenter = () => { tv.hover = id; tv.dirty = true; };
    d.onmouseleave = () => { tv.hover = null; tv.dirty = true; };
    L.appendChild(d);
  });
  const mos = p.mast.filter(m => !m.hat);
  if (mos.length) {
    L.insertAdjacentHTML('beforeend', '<div class="lsec">Masteries wählen</div>');
    mos.forEach(m => { const n = TREE.nodes[m.node]; if (!n) return; const eff = (n.me && n.me[m.effect]) || [];
      const d = document.createElement('div'); d.className = 'step mst';
      d.innerHTML = `<div class="num">M</div><div class="sico"></div><div class="sst"><div class="n">${esc(n.n)}</div><div class="d">${esc(eff.join(' · '))}</div></div>`;
      tv.cssIcon(d.querySelector('.sico'), 'masteryActiveSelected', n.aa, 40); d.onclick = () => tv.fitTo([m.node], 500, .5); L.appendChild(d); });
  }
  if (p.remove.length) {
    L.insertAdjacentHTML('beforeend', '<div class="lsec">Umskillen – nicht im Guide</div>');
    p.remove.forEach(id => { const n = TREE.nodes[id]; if (!n) return;
      const d = document.createElement('div'); d.className = 'step rm';
      d.innerHTML = `<div class="num">−</div><div class="sico"></div><div class="sst"><div class="n">${esc(n.n)}</div><div class="d">${esc((n.st || []).join(' · '))}</div></div><div class="pts">−1</div>`;
      tv.cssIcon(d.querySelector('.sico'), tv.iconSheet(id, false), n.ic, 40); d.onclick = () => tv.fitTo([id], 500, .5); L.appendChild(d); });
  }
  tv.zeigeReihenfolge(L, t);
}

// ------------------------------------------------------------------ Item-Check
const fullCache = {};
let itemsLastT = null;
function items(force) {
  const el = sec('items');
  if (S.last && S.last.t !== itemsLastT) { if (itemsLastT !== null) selHist = null; itemsLastT = S.last.t; }
  // Standard-Auswahl: das zuletzt geprüfte Item
  const lastItem = S.last && S.last.kind !== 'map' ? S.last : null;
  if (selHist == null && !lastItem && S.history.length) selHist = 0;
  const sel = selHist != null && S.history[selHist];
  const full = sel ? (lastItem && Math.abs(lastItem.t - sel.t) < .01 ? lastItem : fullCache[sel.t]) : lastItem;
  const k = 'it' + (S.last && S.last.t) + JSON.stringify(S.last && S.last.price || '') + S.history.length + selHist + !!full; if (lastKey.items === k && !force) return; lastKey.items = k;
  const keepText = $('#paste') ? $('#paste').value : '';
  if (sel && !full) api('/api/history/item?t=' + sel.t).then(r => { if (r && r.results) { fullCache[sel.t] = r; lastKey.items = null; items(true); } });
  const fromHist = sel && !(lastItem && Math.abs(lastItem.t - sel.t) < .01);
  el.innerHTML = `<div class="ph"><div><h1>Item-Check</h1><div class="sub">${App.itemKey(S)} auf ein Item im Spiel – der Vergleich erscheint im Popup und hier. Offensive und Defensive rechnet Path of Building.</div></div>
    <div class="act"><button class="btn" id="opop">${icon('eye', 16)} Popup öffnen</button>${S.history.length ? `<button class="btn ghost danger" id="hclr">${icon('trash', 16)} Verlauf leeren</button>` : ''}</div></div>
    ${errorBox()}
    <div class="iw">
      <div class="card"><div style="padding:16px 18px 8px"><h3 style="margin:0">Verlauf <span class="r muted">${S.history.length || ''}</span></h3></div><div class="hl">${S.history.length ? S.history.map((h, i) => `<div class="hi${(sel ? i === selHist : i === 0 && lastItem) ? ' on' : ''}" data-i="${i}"><div style="min-width:0"><div class="n" style="color:${rarityColor(h.rarity)}">${esc(h.name)}</div><div class="m">${esc(h.slot || '')}, ${datum(h.t)}</div></div><div class="v"><div class="${h.dps > 0.05 ? 'good' : h.dps < -0.05 ? 'bad' : 'muted'}">${sgn(h.dps)}% DPS</div><div class="${h.ehp > 0.05 ? 'good' : h.ehp < -0.05 ? 'bad' : 'muted'}" style="font-size:12px">${sgn(h.ehp)}% eHP</div></div></div>`).join('') : '<div class="empty">' + icon('item', 34) + '<div><b>Noch leer</b>Geprüfte Items landen hier.</div></div>'}</div></div>
      <div>
        <div class="card detail" id="idet">${full ? (fromHist ? `<div class="histnote">${icon('refresh', 14)} Berechnet ${datum(full.t)} – <a href="#" id="recmp">mit deinem aktuellen Charakter neu berechnen</a></div>` : '') + Render.item(full)
          : sel ? `<div class="empty"><span class="spin">${icon('refresh', 30)}</span><div>Lade Vergleich …</div></div>`
          : `<div class="empty">${icon('paste', 44)}<div><b>Noch kein Item geprüft</b>Fahr im Spiel über ein Item und drück ${App.itemKey(S)}.<br>Oder füg den Itemtext unten ein.</div></div>`}</div>
        <div class="card pastebox"><h3>Itemtext einfügen <span class="r muted">z. B. von der Trade-Seite</span></h3><textarea id="paste" placeholder="Item Class: Rings&#10;Rarity: Rare&#10;…"></textarea><div style="margin-top:10px;display:flex;gap:8px"><button class="btn primary" id="pcmp">${icon('bolt', 16)} Vergleichen</button><span class="muted" style="font-size:12.5px;align-self:center">oder Strg+V hier und Strg+Enter</span></div></div>
      </div>
    </div>`;
  $('#paste').value = keepText;
  const go = () => { const t = $('#paste').value.trim(); if (!t) return toast('Bitte zuerst einen Itemtext einfügen.'); selHist = null; api('/api/compare', { text: t }); toast('Wird berechnet …'); };
  $('#pcmp').onclick = go;
  $('#paste').onkeydown = e => { if (e.key === 'Enter' && e.ctrlKey) go(); };
  $('#opop').onclick = () => api('/api/window', { name: 'item', action: 'open' }).then(r => { if (!r.win) toast('Das Popup gibt es nur in der Windows-App.'); });
  if ($('#hclr')) $('#hclr').onclick = () => App.ask('Verlauf leeren?', { ok: 'Leeren', danger: true, detail: 'Alle geprüften Items werden aus der Liste entfernt.' }).then(ok => { if (ok) { selHist = null; api('/api/history/clear', {}); } });
  if ($('#recmp')) $('#recmp').onclick = e => { e.preventDefault(); if (full && full.raw) { api('/api/compare', { text: full.raw }); selHist = null; toast('Wird neu berechnet …'); } };
  el.querySelectorAll('.hi').forEach(h => h.onclick = () => { selHist = +h.dataset.i; items(true); });
}

// ------------------------------------------------------------------ Map-Check
function maps(force) {
  const el = sec('maps');
  const k = 'mp' + (S.last && S.last.t) + (S.char && S.char.t); if (lastKey.maps === k && !force) return; lastKey.maps = k;
  const d = S.last && S.last.kind === 'map' ? S.last : null;
  el.innerHTML = `<div class="ph"><div><h1>Map-Check</h1><div class="sub">${App.itemKey(S)} auf eine ${S.char && S.char.sheet && S.char.sheet.game === 'poe2' ? 'Waystone' : 'Map'} zeigt, ob sie für deinen Build gefährlich ist. Unten legst du fest, welche Mods du nie laufen willst – daraus entsteht ein Suchtext für deinen Stash.</div></div></div>
    <div class="grid2" style="align-items:start">
      <div style="display:grid;gap:18px;align-content:start">
        <div class="card detail">${d ? Render.map(d) : `<div class="empty">${icon('map', 44)}<div><b>Noch keine Map geprüft</b>Im Spiel mit der Maus auf eine Map und ${App.itemKey(S)} drücken.</div></div>`}</div>
        <div class="card pad" id="vendor"></div>
      </div>
      <div class="card pad frame" id="such"><div class="muted">Lade …</div></div>
    </div>
    <div class="card pad" id="regeln" style="margin-top:18px"></div>`;
  MapRegeln.laden();
}
const VENDOR = [
  ['Laufgeschwindigkeit', '"movem"', 'Stiefel mit Movement Speed beim Händler'],
  ['3 Links', '"\\w-\\w-\\w"', 'Items mit mindestens 3 verbundenen Sockeln'],
  ['4 Links', '"\\w-\\w-\\w-\\w"', 'Items mit mindestens 4 verbundenen Sockeln'],
  ['Rot-Grün-Blau', '"r-g-b|r-b-g|g-r-b|g-b-r|b-r-g|b-g-r"', 'für das Chromatic-Rezept beim Händler'],
];
// PoE2: Suchtext-Baukasten für Händler (keine Sockel-Links in PoE2) – Basis-Art und Mods wählen, Regex entsteht automatisch
const VB = {
  def: '', mods: {}, oder: false,
  DEF: [['', 'egal'], ['ar', 'Rüstung'], ['ev', 'Ausweichen'], ['es', 'Energieschild'], ['ar+ev', 'Rüstung + Ausweichen'], ['ar+es', 'Rüstung + Energieschild'], ['ev+es', 'Ausweichen + Energieschild']],
  TXT: { ar: 'armour:', ev: 'evasion rating:', es: 'energy shield:' },
  MODS: [['ms', 'Laufgeschwindigkeit', '% increased movem', 10], ['life', 'Maximales Leben', ' to maximum life', 0], ['mana', 'Maximales Mana', ' to maximum mana', 0],
    ['res', 'Resistenzen', 'resistance', 0], ['spirit', 'Spirit', 'to spirit', 0], ['lvl', '+ Skill-Level', 'level of all', 0], ['as', 'Angriffstempo', 'attack speed', 0],
    ['cs', 'Zaubertempo', 'cast speed', 0], ['crit', 'Kritische Treffer', 'critical', 0], ['flat', 'Flacher Element-Schaden', 'adds \\d+ to \\d+ (fire|cold|light)', 0],
    ['phys', 'Physischer Schaden', 'physical damage', 0], ['rar', 'Seltenheit (Rarity)', 'rarity of items', 0], ['attr', 'Attribute', 'to (strength|dexterity|intelligence|all attributes)', 0],
    ['esp', '% Energieschild', 'increased energy shield', 0], ['regen', 'Leben-Regeneration', 'life regeneration', 0]],
  ab(n) { n = +n; if (!n || n <= 1) return '\\d+'; const z = Math.floor(n / 10), e = n % 10;
    if (n < 10) return `([${n}-9]|\\d\\d)`;
    return `(${z}[${e}-9]${z < 9 ? `|[${z + 1}-9]\\d` : ''}|\\d{3})`; },
  text() {
    const t = [];
    if (this.def) { const teile = this.def.split('+'); teile.forEach(k => t.push(this.TXT[k])); ['ar', 'ev', 'es'].filter(k => !teile.includes(k)).forEach(k => t.push('!' + this.TXT[k])); }
    const m = this.MODS.filter(x => this.mods[x[0]] != null).map(x => x[0] === 'ms' && +this.mods.ms > 1 ? this.ab(this.mods.ms) + x[2] : x[2]);
    if (this.oder && m.length > 1) t.push(m.join('|')); else t.push(...m);
    return t.map(x => `"${x}"`).join(' ');
  },
  html() {
    const tx = this.text(), lang = tx.length;
    return `<h3>Suchtext für Händler bauen <span class="r muted">PoE 2</span></h3>
      <div class="vb-z"><label class="f">Basis (Verteidigung)</label><div class="vb-chips">${this.DEF.map(([k, l]) => `<button class="${this.def === k ? 'on' : ''}" data-vbd="${k}">${l}</button>`).join('')}</div></div>
      <div class="vb-z"><label class="f">Mods, die drauf sein sollen</label><div class="vb-chips">${this.MODS.map(([k, l]) => `<button class="${this.mods[k] != null ? 'on' : ''}" data-vbm="${k}">${l}</button>`).join('')}</div>
        ${this.mods.ms != null ? `<label class="vb-ms">Laufgeschwindigkeit mindestens <input id="vbms" type="number" min="0" max="35" value="${this.mods.ms || 10}"> %</label>` : ''}
        <label class="vb-od"><input type="checkbox" id="vbod"${this.oder ? ' checked' : ''}><span>Es reicht einer der Mods (sonst müssen alle drauf sein)</span></label></div>
      ${tx ? MapRegeln.kop(tx) + `<div class="muted" style="font-size:11.5px">${lang} von 250 Zeichen · Beim Händler Strg+F, dann Strg+V – passende Items leuchten auf.</div>` : '<div class="muted" style="font-size:12.5px">Wähl oben Basis und Mods – der Suchtext entsteht automatisch.</div>'}`;
  },
  bind() {
    document.querySelectorAll('[data-vbd]').forEach(b => b.onclick = () => { this.def = b.dataset.vbd; MapRegeln.zeigen(); });
    document.querySelectorAll('[data-vbm]').forEach(b => b.onclick = () => { const k = b.dataset.vbm; if (this.mods[k] != null) delete this.mods[k]; else this.mods[k] = k === 'ms' ? 10 : 0; MapRegeln.zeigen(); });
    const ms = $('#vbms'); if (ms) ms.onchange = () => { this.mods.ms = Math.max(0, Math.min(35, +ms.value || 0)); MapRegeln.zeigen(); };
    const od = $('#vbod'); if (od) od.onchange = () => { this.oder = od.checked; MapRegeln.zeigen(); };
  },
};
const MapRegeln = {
  d: null,
  kop(t) { return `<div class="stx"><code>${esc(t)}</code><button class="btn small primary" data-copy="${esc(t)}">${icon('paste', 13)} Kopieren</button></div>`; },
  async laden() { try { this.d = await api('/api/suchtexte'); } catch (e) { return; } this.zeigen(); },
  speichern(patch) { return api('/api/settings', patch).then(() => this.laden()); },
  zeigen() {
    const d = this.d; if (!d || !$('#such')) return;
    const W = S.settings.mapWorte || {}, voll = d.len > d.limit * .9;
    $('#such').innerHTML = `<h3>Suchtext für deinen Stash <span class="r muted">im Spiel Strg+F, dann Strg+V</span></h3>
      ${d.text ? this.kop(d.text) : '<div class="muted" style="font-size:13px">Noch nichts zum Ausblenden gewählt.</div>'}
      ${d.text ? `<div class="cnt"><div class="cb"><i class="${voll ? 'w' : ''}" style="width:${Math.min(100, d.len / d.limit * 100)}%"></i></div><span>${d.len} von ${d.limit} Zeichen</span></div>` : ''}
      ${d.drin.length ? `<div class="stl"><b>Blendet aus:</b> ${d.drin.map(esc).join(', ')}</div>` : ''}
      ${d.rest.length ? `<div class="stl w"><b>Passt nicht mehr ins Suchfeld:</b> ${d.rest.map(esc).join(', ')} – die stehen trotzdem beim Map-Check als gefährlich.</div>` : ''}
      <div class="mw">
        <label${d.spiel === 'poe2' ? ' style="display:none"' : ''}>Mindest-Quantity<select id="mq">${[[0, 'egal'], [50, 'ab 50 %'], [70, 'ab 70 %'], [80, 'ab 80 %'], [100, 'ab 100 %']].map(([v, t]) => `<option value="${v}"${+(W.qty || 0) === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Zusätzlich ausblenden<input id="maus" placeholder="z. B. delirium, abyss" value="${esc(W.aus || '')}"></label>
        <label>Map muss enthalten<input id="mmuss" placeholder="z. B. harbinger, essence" value="${esc(W.muss || '')}"></label>
      </div>
      <div class="muted" style="font-size:12px;margin-top:6px">Wörter mit Komma trennen. Es reicht ein Teil des Mod-Textes, so wie er im Spiel auf Englisch steht.</div>`;
    const R = d.regeln, n = { aus: 0, warn: 0, egal: 0 }; R.forEach(r => n[r.wahl]++);
    const row = r => `<div class="mr m-${r.wahl}"><div class="mrt"><b>${esc(r.name)}</b>${r.grund ? `<span class="mfy" title="Deshalb empfohlen">wichtig: ${esc(r.grund)}</span>` : ''}
        <div class="mrd">${esc(r.why)}${r.eigen && r.wahl !== r.empf ? ` <a href="#" data-reset="${esc(r.name)}">Empfehlung: ${({ aus: 'ausblenden', warn: 'warnen', egal: 'egal' })[r.empf]}</a>` : ''}</div></div>
      <div class="seg3">${[['aus', 'Ausblenden'], ['warn', 'Warnen'], ['egal', 'Egal']].map(([v, t]) => `<button class="${r.wahl === v ? 'on ' + v : ''}" data-mw="${esc(r.name)}" data-v="${v}">${t}</button>`).join('')}</div></div>`;
    const sortiert = R.slice().sort((a, b) => ({ aus: 0, warn: 1, egal: 2 })[a.wahl] - ({ aus: 0, warn: 1, egal: 2 })[b.wahl] || b.stufe - a.stufe);
    $('#regeln').innerHTML = `<h3>Deine Map-Regeln <span class="r muted">${n.aus} ausgeblendet · ${n.warn} warnen · ${n.egal} egal</span></h3>
      <div class="mtop2">${d.grund.length ? `<div class="mb2">${icon('shield', 14)} Dein Build: ${d.grund.map(esc).join(' · ')}</div>` : '<div class="mb2 muted">Dein Build wird erkannt, sobald ein Charakter geladen ist.</div>'}
        <div class="mpre"><button class="btn small" data-pre="empf">Empfohlen für deinen Build</button><button class="btn small" data-pre="starter">Vorsichtig (Starter-Build)</button><button class="btn small ghost" data-pre="egal">Alles laufen</button></div></div>
      <div class="mleg"><span><i class="aus"></i><b>Ausblenden</b> – kommt in den Suchtext und gilt als gefährlich</span><span><i class="warn"></i><b>Warnen</b> – wird beim Map-Check markiert</span><span><i class="egal"></i><b>Egal</b> – wird nicht beachtet</span></div>
      <div class="mrs">${sortiert.map(row).join('')}</div>`;
    const wahl = () => Object.assign({}, S.settings.mapWahl || {});
    document.querySelectorAll('[data-mw]').forEach(b => b.onclick = () => { const w = wahl(); w[b.dataset.mw] = b.dataset.v; this.speichern({ mapWahl: w }); });
    document.querySelectorAll('[data-reset]').forEach(a => a.onclick = e => { e.preventDefault(); const w = wahl(); delete w[a.dataset.reset]; this.speichern({ mapWahl: w }); });
    document.querySelectorAll('[data-pre]').forEach(b => b.onclick = () => {
      const p = b.dataset.pre, w = {};
      if (p === 'starter') R.forEach(r => { w[r.name] = d.starter.includes(r.name) ? 'aus' : r.empf === 'aus' ? 'aus' : 'warn'; });
      if (p === 'egal') R.forEach(r => { w[r.name] = 'egal'; });
      this.speichern({ mapWahl: w }).then(() => toast({ empf: 'Empfehlung für deinen Build übernommen.', starter: 'Vorsichtige Auswahl übernommen.', egal: 'Alle Mods erlaubt.' }[p]));
    });
    let tm; const worte = () => { clearTimeout(tm); tm = setTimeout(() => this.speichern({ mapWorte: { qty: +$('#mq').value, aus: $('#maus').value, muss: $('#mmuss').value } }), 500); };
    $('#mq').onchange = worte; $('#maus').oninput = worte; $('#mmuss').oninput = worte;
    if (d.spiel === 'poe2' || App.spiel() === 'poe2') { $('#vendor').innerHTML = VB.html(); VB.bind(); }
    else $('#vendor').innerHTML = `<h3>Suchtexte für Händler</h3>${VENDOR.map(v => `<div class="stn">${esc(v[0])} <span class="muted">– ${esc(v[2])}</span></div>` + this.kop(v[1])).join('')}`;
    document.querySelectorAll('#such [data-copy], #vendor [data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Kopiert – im Spiel Strg+F, dann Strg+V.'); } catch (e) { toast('Kopieren ging nicht – Text markieren und Strg+C drücken.'); } });
  },
};

// ------------------------------------------------------------------ Profile
let form = null, chars = null;
function profiles(force) {
  const el = sec('profiles');
  if (formOpen) { if (force) profileForm(); return; }
  const k = 'pf' + JSON.stringify(S.profiles) + (S.char && S.char.t); if (lastKey.profiles === k && !force) return; lastKey.profiles = k;
  el.innerHTML = `<div class="ph"><div><h1>Profile & Freunde</h1><div class="sub">Jedes Profil ist ein Charakter. Freunde können hier ihren eigenen Account eintragen – auf ihrem PC oder zum Vergleichen auf deinem.</div></div></div>
    ${errorBox()}
    <div class="pgrid">${S.profiles.list.map(p => `<div class="card pc${p.id === S.profiles.active ? ' on' : ''}">
      <div class="top"><div class="av">${esc((p.name || '?')[0].toUpperCase())}</div><div style="min-width:0"><div class="pn">${esc(p.name)}</div><div class="pm">${p.game === 'poe2' ? '<b style="color:#7ee0ff">PoE 2</b> · ' : ''}${p.mode === 'link' ? 'Build-Link' : esc(p.account) + ' · ' + esc(p.char)}</div></div>${p.id === S.profiles.active ? '<span class="chip good" style="margin-left:auto">aktiv</span>' : ''}</div>
      <div class="pm">${p.guide || p.mode === 'link' ? icon('tree', 14) + ' Guide hinterlegt' : 'Kein Guide – Skilltree-Planer aus'}</div>
      <div class="row">${p.id !== S.profiles.active ? `<button class="btn small primary" data-act="${p.id}">Aktivieren</button>` : `<button class="btn small" data-rf="1">${icon('refresh', 14)} Neu laden</button>`}<button class="btn small" data-edit="${p.id}">Bearbeiten</button><button class="btn small ghost danger" data-del="${p.id}">${icon('trash', 14)}</button></div></div>`).join('')}
      <div class="card pc add" id="padd"><div>${icon('plus', 34)}<div style="margin-top:8px;font-weight:600">Profil hinzufügen</div><div class="muted" style="font-size:12.5px">eigener Charakter oder der eines Freundes</div></div></div>
    </div>`;
  $('#padd').onclick = () => { formOpen = { mode: 'char', realm: 'pc' }; chars = null; profileForm(); };
  el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => api('/api/profiles/activate', { id: b.dataset.act }).then(() => toast('Profil gewechselt – lade Charakter …')));
  el.querySelectorAll('[data-rf]').forEach(b => b.onclick = refresh);
  el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { formOpen = { ...S.profiles.list.find(p => p.id === b.dataset.edit) }; chars = null; profileForm(); });
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => App.ask('Profil löschen?', { ok: 'Löschen', danger: true, detail: 'Gespeicherter Kampagnen-Fortschritt dieses Profils bleibt erhalten, falls du es neu anlegst.' }).then(ok => ok && api('/api/profiles/delete', { id: b.dataset.del })));
  if (!S.profiles.list.length && !formOpen) { formOpen = { mode: 'char', realm: 'pc' }; profileForm(); }
}

function profileForm() {
  const el = sec('profiles'), f = formOpen;
  el.innerHTML = `<div class="ph"><div><h1>${f.id ? 'Profil bearbeiten' : 'Neues Profil'}</h1><div class="sub">${f.game === 'poe2' ? 'PoE 2: Build-Link aus Path of Building einfügen, Liga wählen – fertig.' : 'In drei Schritten: Account, Charakter, Guide.'}</div></div><div class="act"><button class="btn ghost" id="fx">Abbrechen</button></div></div>
  <div class="card form">
    <div class="seg" id="fgame"><button data-g="poe1" class="${f.game !== 'poe2' ? 'on' : ''}">Path of Exile 1</button><button data-g="poe2" class="${f.game === 'poe2' ? 'on' : ''}">Path of Exile 2</button></div>
    ${f.game === 'poe2' ? '' : `<div class="seg" id="fmode"><button data-m="char" class="${f.mode !== 'link' ? 'on' : ''}">Charakter von pathofexile.com</button><button data-m="link" class="${f.mode === 'link' ? 'on' : ''}">Build-Link / PoB-Code</button></div>`}
    ${f.game === 'poe2' ? `<div class="p2how"><b>So holst du deinen PoE2-Charakter</b>
      <ol><li>Öffne <b>Path of Building (PoE2)</b> → <b>Import/Export Build</b>.</li>
      <li>Unter <b>Character Import</b> mit pathofexile.com verbinden und deinen Charakter importieren.</li>
      <li>Unter <b>Export</b> auf <b>Generate</b> und den Link (pobb.in) kopieren.</li>
      <li>Hier einfügen. Neue Ausrüstung? Einfach neu exportieren und den Link ersetzen.</li></ol>
      <span class="muted">pathofexile.com gibt PoE2-Charaktere nicht öffentlich heraus – darum der Weg über Path of Building.</span></div>` : ''}
    <div id="fb"></div>
    <div style="display:flex;gap:10px;margin-top:22px;align-items:center"><button class="btn primary" id="fs">${icon('check', 16)} Speichern & laden</button><span class="muted" id="fmsg" style="font-size:12.5px"></span></div>
  </div>`;
  const body = () => {
    $('#fb').innerHTML = f.mode === 'link' ? `
      <label class="f">Name des Profils</label><input id="fname" value="${esc(f.name || '')}" placeholder="z. B. Penance Brand Guide">
      <label class="f">Build (pobb.in-, Mobalytics-, Maxroll-Link oder PoB-Code)</label><input id="flink" value="${esc(f.link || '')}" placeholder="https://pobb.in/…">
      <div class="hint">Der Item-Check vergleicht dann mit der Ausrüstung aus diesem Build.</div>
      ${f.game === 'poe2' ? `<label class="f">Liga (für Preise und Trade)</label><select id="fleague"><option value="${esc(f.league || '')}">${esc(f.league || 'wird geladen …')}</option></select>
      <label class="f">Guide für Skilltree & Gems (optional)</label><input id="fguide" value="${esc(f.guide || '')}" placeholder="pobb.in-/Maxroll-Link, gespeicherte Mobalytics-Seite (.html) – leer lassen, dann zählt dein Build">` : ''}` : `
      <div class="frow"><div><label class="f">1 · PoE-Account (mit #Nummer)</label><input id="facc" value="${esc(f.account || '')}" placeholder="Name#1234"></div>
      <div><label class="f">Region</label><select id="frealm"><option value="pc">PC</option><option value="poe2">PoE 2</option><option value="xbox">Xbox</option><option value="sony">PlayStation</option></select></div></div>
      <div class="hint">Den Account-Namen findest du auf pathofexile.com oben rechts. Das Profil muss öffentlich sein (Privacy Settings → „Hide Characters“ aus).</div>
      <label class="f">2 · Charakter</label><div style="display:flex;gap:8px"><input id="fchar" value="${esc(f.char || '')}" placeholder="Name des Charakters"><button class="btn" id="fload">Charaktere laden</button></div>
      <div class="charlist" id="clist"></div>
      <label class="f">3 · Guide für Skilltree & Gems (optional)</label><input id="fguide" value="${esc(f.guide || '')}" placeholder="pobb.in-/Maxroll-Link, gespeicherte Mobalytics-Seite (.html) oder PoB-Code">
      <div class="hint">Mit einem Guide zeigt dir der Companion jeden nächsten Skillpunkt, fehlende Gems und prüft, ob dein Tree stimmt.</div>
      <label class="f">Anzeigename</label><input id="fname" value="${esc(f.name || '')}" placeholder="z. B. Marvins Elementalist">`;
    if ($('#frealm')) $('#frealm').value = f.realm || 'pc';
    if ($('#fleague')) api('/api/ligen?spiel=poe2').then(L => {
      const sel = $('#fleague'); if (!sel || !Array.isArray(L)) return;
      const cur = f.league || L.find(x => !/Hardcore|HC |Standard/.test(x)) || L[0] || 'Standard';
      sel.innerHTML = L.map(x => `<option${x === cur ? ' selected' : ''}>${esc(x)}</option>`).join(''); f.league = cur;
    }).catch(() => {});
    if ($('#fload')) $('#fload').onclick = loadChars;
    drawChars();
  };
  const read = () => { for (const [k, id] of [['name', 'fname'], ['link', 'flink'], ['account', 'facc'], ['char', 'fchar'], ['guide', 'fguide'], ['realm', 'frealm'], ['league', 'fleague']]) if ($('#' + id)) f[k] = $('#' + id).value.trim(); };
  el.querySelectorAll('#fmode button').forEach(b => b.onclick = () => { read(); f.mode = b.dataset.m; el.querySelectorAll('#fmode button').forEach(x => x.classList.toggle('on', x === b)); body(); });
  el.querySelectorAll('#fgame button').forEach(b => b.onclick = () => { read(); f.game = b.dataset.g; if (f.game === 'poe2') f.mode = 'link'; profileForm(); });
  if (f.game === 'poe2') f.mode = 'link';
  $('#fx').onclick = () => { formOpen = null; lastKey.profiles = null; profiles(true); };
  $('#fs').onclick = async () => {
    read();
    if (f.mode === 'link' && !f.link) return $('#fmsg').textContent = 'Bitte einen Link oder Code eintragen.';
    if (f.mode !== 'link' && !(f.account && f.char)) return $('#fmsg').textContent = 'Bitte Account und Charakter angeben.';
    f.name = f.name || f.char || 'Guide-Build';
    await api('/api/profiles/save', { ...f, activate: true });
    formOpen = null; lastKey.profiles = null; toast('Gespeichert – lade Charakter …'); location.hash = 'home';
  };
  async function loadChars() {
    read(); if (!f.account) return $('#fmsg').textContent = 'Bitte zuerst den Account eintragen.';
    $('#fmsg').innerHTML = '<span class="spin">' + icon('refresh', 14) + '</span> Lade Charaktere …';
    const r = await api(`/api/chars?account=${encodeURIComponent(f.account)}&realm=${f.realm || 'pc'}`);
    if (r.error) { $('#fmsg').textContent = r.error; chars = null; } else { chars = r.sort((a, b) => b.level - a.level); $('#fmsg').textContent = `${chars.length} Charaktere gefunden – einen auswählen.`; }
    drawChars();
  }
  function drawChars() {
    if (!$('#clist')) return;
    $('#clist').innerHTML = (chars || []).map(c => `<div class="ci${c.name === ($('#fchar') && $('#fchar').value) ? ' on' : ''}" data-n="${esc(c.name)}"><b>${esc(c.name)}</b><span>Lv ${c.level} ${esc(c.class)} · ${esc(c.league || '')}</span></div>`).join('');
    document.querySelectorAll('.ci').forEach(c => c.onclick = () => { $('#fchar').value = c.dataset.n; if (!$('#fname').value) $('#fname').value = c.dataset.n; drawChars(); });
  }
  body();
}

// ------------------------------------------------------------------ Einstellungen
function settings(force) {
  const el = sec('settings');
  const k = 'st' + JSON.stringify(S.settings) + S.status.text + JSON.stringify(S.app || {}); if (lastKey.settings === k && !force) return; lastKey.settings = k;
  const st = S.settings;
  const keys = ['F1', 'F2', 'F3', 'F4', 'SHIFT+F4', 'F5', 'SHIFT+F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'MAUS4', 'MAUS5', '^', 'NUM0', 'NUM1', 'NUM2', 'NUM3', 'NUM+', 'NUM-', 'ALT+C', 'ALT+Q', 'ALT+X', 'ALT+V', 'ALT+1', 'ALT+2', 'CTRL+SHIFT+C', 'CTRL+ALT+C', 'CTRL+SPACE', 'CTRL+F8', 'CTRL+F9', 'CTRL+F10', 'ALT+F8', 'PAUSE', 'SCROLLLOCK', 'INSERT', 'HOME', 'END'];
  const sel = (id, v, aus) => { const cur = String(v || '').toUpperCase(), L0 = keys.includes(cur) || !cur ? keys : [cur, ...keys], L = aus ? ['', ...L0] : L0;
    return `<span class="hkw"><select data-k="${id}">${L.map(x => `<option value="${esc(x)}"${x === cur ? ' selected' : ''}>${x ? esc(App.keyName(x)) : '– aus –'}</option>`).join('')}</select><button class="btn small ghost" data-rec="${id}" title="Klicken, dann die gewünschte Taste drücken (auch Maus-Seitentaste)">Taste drücken</button></span>`; };
  el.innerHTML = `<div class="ph"><div><h1>Einstellungen</h1><div class="sub">Neue Tastenkürzel gelten sofort – der Companion startet dafür kurz neu.</div></div>
    <div class="act"><div class="lang notr" title="Sprache / Language"><span>Sprache / Language</span><div class="seg3">${[['de', 'Deutsch'], ['en', 'English']].map(([v, t]) => `<button class="${(st.lang || 'de') === v ? 'on egal' : ''}" data-lang="${v}">${t}</button>`).join('')}</div></div></div></div>
  <div class="grid2" style="align-items:start">
    <div class="card pad"><h3>Tastenkürzel</h3>
      <div class="set"><div><b>Overlays ein/aus</b><span>Item-Popup und Skilltree-Overlay</span></div>${sel('hotkeyToggle', st.hotkeyToggle)}</div>
      <div class="set"><div><b>Hub öffnen</b><span>dieses Fenster</span></div>${sel('hotkeyHub', st.hotkeyHub)}</div>
      <div class="set"><div><b>Skilltree-Overlay</b><span>kleines Tree-Fenster über dem Spiel</span></div>${sel('hotkeyTree', st.hotkeyTree)}</div>
      <div class="set"><div><b>Kampagnen-Overlay</b><span>aktueller Quest-Schritt über dem Spiel</span></div>${sel('hotkeyQuest', st.hotkeyQuest)}</div>
      <div class="set"><div><b>Kampagne: Schritt erledigt</b><span>springt im Guide weiter, ohne Maus</span></div>${sel('hotkeyQuestNext', st.hotkeyQuestNext || 'F4')}</div>
      <div class="set"><div><b>Kampagne: Schritt zurück</b><span>falls du zu weit gesprungen bist</span></div>${sel('hotkeyQuestPrev', st.hotkeyQuestPrev || 'SHIFT+F4')}</div>
      <div class="set"><div><b>Item ins Crafting (PoE 2)</b><span>Maus aufs Item im Spiel, Taste drücken – der Crafting-Berater übernimmt Basis und Mods</span></div>${sel('hotkeyCraft', st.hotkeyCraft || 'ALT+X')}</div>
      <div class="set sep2"><div><b>Ins Hideout</b><span>tippt <code>/hideout</code> in den Chat – nur wenn Path of Exile im Vordergrund ist</span></div>${sel('hotkeyHideout', st.hotkeyHideout, true)}</div>
      <div class="set"><div><b>Eigener Chat-Befehl 1</b><input class="chatin" data-chat="chat1" value="${esc(st.chat1 || '')}" placeholder="/kingsmarch"></div>${sel('hotkeyChat1', st.hotkeyChat1, true)}</div>
      <div class="set"><div><b>Eigener Chat-Befehl 2</b><input class="chatin" data-chat="chat2" value="${esc(st.chat2 || '')}" placeholder="/exit"></div>${sel('hotkeyChat2', st.hotkeyChat2, true)}</div>
      <div class="set"><div><b>Farming-Overlay</b><span>Timer und Gewinn pro Stunde über dem Spiel</span></div>${sel('hotkeyFarm', st.hotkeyFarm)}</div>
    </div>
    <div class="card pad"><h3>Item-Popup</h3>
      <div class="set"><div><b>Item-Check auslösen mit</b><span>Eigene Taste kollidiert nicht mit Preis-Checkern (z. B. Strg+D)</span></div>
        <div class="seg" style="margin:0" id="trig"><button data-t="hotkey" class="${st.itemTrigger !== 'copy' ? 'on' : ''}">Eigene Taste</button><button data-t="copy" class="${st.itemTrigger === 'copy' ? 'on' : ''}">Jedes Strg+C</button></div></div>
      ${st.itemTrigger !== 'copy' ? `<div class="set"><div><b>Taste für den Item-Check</b><span>Maus über ein Item im Spiel, dann diese Taste</span></div>${sel('hotkeyItem', st.hotkeyItem || 'ALT+C')}</div>` : ''}
      <div class="set"><div><b>Marktpreis suchen</b><span>sucht vergleichbare Angebote auf der Trade-Seite (PoE 1)</span></div><div class="sw ${st.priceCheck !== false ? 'on' : ''}" data-b="priceCheck"></div></div>
      <div class="set"><div><b>Abweichung der Mod-Werte</b><span>wie weit die Angebote unter den Werten deines Items liegen dürfen</span></div><div class="rng"><input type="range" min="5" max="30" step="5" value="${st.priceTolerance ?? 15}" data-r="priceTolerance"><output>${st.priceTolerance ?? 15} %</output></div></div>
      <div class="set"><div><b>Popup automatisch zeigen</b><span>Popup erscheint automatisch über dem Spiel</span></div><div class="sw ${st.popupOnCopy ? 'on' : ''}" data-b="popupOnCopy"></div></div>
      <div class="set"><div><b>Automatisch ausblenden nach</b><span>Sekunden, 0 = nie (Maus über dem Popup hält es offen)</span></div><input type="number" min="0" max="120" value="${st.popupAutoHide}" data-n="popupAutoHide"></div>
      <div class="set"><div><b>Fenster öffnen</b><span>falls du eins geschlossen hast</span></div><div style="display:flex;gap:8px"><button class="btn small" data-w="item">Item-Popup</button><button class="btn small" data-w="tree">Tree-Overlay</button><button class="btn small" data-w="farm">Farming</button><button class="btn small" data-w="quest">Kampagne</button></div></div>
      <div class="set"><div><b>Fenster verloren?</b><span>setzt alle Fenster auf ihre Standardposition</span></div><button class="btn small" id="wreset">Zurücksetzen</button></div>
    </div>
    <div class="card pad"><h3>Overlays</h3>
      <div class="set"><div><b>Deckkraft</b><span>wie stark die Overlays das Spiel verdecken</span></div><div class="rng"><input type="range" min="40" max="100" step="2" value="${st.overlayOpacity || 96}" data-r="overlayOpacity"><output>${st.overlayOpacity || 96} %</output></div></div>
      <div class="set"><div><b>Größe</b><span>Schrift und Inhalt aller Overlays</span></div><div class="rng"><input type="range" min="80" max="140" step="5" value="${st.overlayScale || 100}" data-r="overlayScale"><output>${st.overlayScale || 100} %</output></div></div>
      <div class="set"><div><b>Ohne Fensterrahmen</b><span>blendet die Browser-Titelleiste aus – die Overlays wirken wie ein Teil des Spiels. Verschieben über die Kopfzeile.</span></div><div class="sw ${st.framelessOverlays !== false ? 'on' : ''}" data-b="framelessOverlays"></div></div>
      <div class="set"><div><b>Item-Popup anheften</b><span>bleibt offen, bis du es mit ${esc(st.hotkeyToggle)} oder ✕ schließt</span></div><div class="sw ${st.popupPinned ? 'on' : ''}" data-b="popupPinned"></div></div>
    </div>
    <div class="card pad"><h3>Wichtig fürs Spiel</h3><div class="tips">
      <div class="tip">${icon('eye', 16)}<div>Spiel im Modus <b>„Windowed Fullscreen“</b> (randloses Fenster), sonst liegen die Overlays hinter dem Spiel.</div></div>
      <div class="tip">${icon('warn', 16)}<div>Spielsprache <b>Englisch</b> – Path of Building versteht nur englische Itemtexte.</div></div>
      <div class="tip">${icon('shield', 16)}<div>Erlaubt nach den Regeln von GGG: Der Companion liest nur Items, die du selbst per Taste kopierst. Chat-Befehle wie /hideout sendet er nur auf deinen Tastendruck – ein Tastendruck, eine Aktion.</div></div>
    </div></div>
    <div class="card pad"><h3>Über</h3><div class="kv2"><span>Version</span><b>${esc(S.version)}</b><span>Status</span><b>${esc(S.status.text)}</b><span>Path of Building</span><b>Community 2.67.2</b><span>Daten</span><b>Ordner „data“</b></div></div>
  </div>`;
  const A = S.app || {};
  el.insertAdjacentHTML('beforeend', `<div class="card pad" style="margin-top:16px"><h3>Über den Companion</h3>
    <div class="set"><div><b>Version ${esc(A.version || '')} (Beta)</b><span>${A.update && A.update.neu ? 'Version ' + esc(A.update.version) + ' ist verfügbar.' : A.repo ? 'Sucht alle 6 Stunden nach Updates.' : 'Update-Prüfung ist in dieser Fassung aus.'}</span></div><button class="btn small" id="updchk">Nach Updates suchen</button></div>
    <div class="set"><div><b>Anonym mitzählen</b><span>Höchstens einmal am Tag: zufällige Nummer, Version, Spiel, Sprache – keine Namen oder Accounts</span></div><div class="sw ${st.telemetry !== false ? 'on' : ''}" id="telsw" role="switch" tabindex="0" aria-checked="${st.telemetry !== false}"></div></div>
    <div class="set"><div><b>Feedback</b><span>Fehler, Ideen oder Lob direkt an den Entwickler${A.discord ? ' – Discord: ' + esc(A.discord) : ''}</span></div><button class="btn small" id="fbset">Feedback senden</button></div>
    <div class="set"><div><b>Einrichtung</b><span>Die Einführung vom ersten Start noch einmal ansehen</span></div><button class="btn small" id="wzset">Einrichtung öffnen</button></div>
    <p class="wz-ggg" style="margin-top:10px">${esc(A.hinweis || '')}</p></div>`);
  $('#updchk').onclick = () => api('/api/update', { pruefen: true }).then(() => toast('Update-Prüfung läuft …'));
  $('#telsw').onclick = () => api('/api/settings', { telemetry: st.telemetry === false });
  $('#fbset').onclick = () => window.Einrichtung && Einrichtung.feedback();
  $('#wzset').onclick = () => window.Einrichtung && Einrichtung.oeffnen();
  el.querySelectorAll('[data-chat]').forEach(i => { let tm; i.oninput = () => { clearTimeout(tm); tm = setTimeout(() => api('/api/settings', { [i.dataset.chat]: i.value.trim() }).then(() => toast('Chat-Befehl gespeichert.')), 600); }; });
  el.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { try { localStorage.setItem('lang', b.dataset.lang); } catch (e) {} api('/api/settings', { lang: b.dataset.lang }).then(() => location.reload()); });
  el.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => App.recordKey(b).then(k => { if (!k) return; api('/api/settings', { [b.dataset.rec]: k }); toast(App.keyName(k) + ' gespeichert – der Companion startet kurz neu.'); }));
  el.querySelectorAll('select[data-k]').forEach(s => s.onchange = () => { api('/api/settings', { [s.dataset.k]: s.value }); toast('Gespeichert – der Companion startet kurz neu.'); });
  el.querySelectorAll('#trig button').forEach(b => b.onclick = () => { api('/api/settings', { itemTrigger: b.dataset.t }); toast('Gespeichert – der Companion startet kurz neu.'); });
  el.querySelectorAll('[data-b]').forEach(s => s.onclick = () => { s.classList.toggle('on'); api('/api/settings', { [s.dataset.b]: s.classList.contains('on') }); });
  el.querySelectorAll('input[data-r]').forEach(r => { r.oninput = () => { r.nextElementSibling.textContent = r.value + ' %'; }; r.onchange = () => api('/api/settings', { [r.dataset.r]: +r.value }); });
  el.querySelectorAll('[data-n]').forEach(s => s.onchange = () => api('/api/settings', { [s.dataset.n]: Math.max(0, +s.value || 0) }));
  $('#wreset').onclick = () => api('/api/window', { action: 'reset' }).then(() => toast('Fenster zurückgesetzt.'));
  el.querySelectorAll('[data-w]').forEach(b => b.onclick = () => api('/api/window', { name: b.dataset.w, action: 'open' }).then(r => { if (!r.win) toast('Nur in der Windows-App verfügbar.'); }));
}


