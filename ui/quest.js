// PoE Companion – Kampagnen-Guide (Hub-Ansicht)
const Q = {
  // Akt-Zeiten und Tode, aus dem Spiel-Log
  splits(c, curAct) {
    const sp = c.splits || {}, de = c.deaths || {}, acts = Object.keys(sp).map(Number).sort((a, b) => a - b);
    if (!acts.length) return `<div class="card pad" style="margin-top:18px"><h3>Akt-Zeiten</h3><div class="muted" style="font-size:13px">Sobald du mit dem Guide spielst, misst der Companion, wie lange du pro Akt brauchst und wie oft du stirbst – praktisch, um beim nächsten Charakter schneller zu sein.</div></div>`;
    const u = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };
    const now = Date.now() / 1000, rows = acts.map((a, i) => { const t1 = acts[i + 1] ? sp[acts[i + 1]] : (a === curAct ? now : null); return { a, d: t1 ? t1 - sp[a] : null, tod: de[a] || 0, live: !acts[i + 1] && a === curAct }; });
    const max = Math.max(1, ...rows.map(r => r.d || 0)), tot = rows.reduce((x, r) => x + (r.d || 0), 0), tode = Object.values(de).reduce((a, b) => a + b, 0);
    return `<div class="card pad" style="margin-top:18px"><h3>Akt-Zeiten <span class="r muted">gesamt ${u(tot)}${tode ? ' · ☠ ' + tode : ''}</span></h3>
      ${rows.map(r => `<div class="spl${r.live ? ' live' : ''}"><span class="sa">${Q.akt(r.a)}</span><div class="sb"><i style="width:${(r.d || 0) / max * 100}%"></i></div><b>${r.d != null ? u(r.d) : '–'}</b><span class="sd">${r.tod ? '☠ ' + r.tod : ''}</span></div>`).join('')}</div>`;
  },
  akt(n) { const a = CAMPAIGN.find(x => x.act === +n); return (a && a.short) || 'Akt ' + n; },
  flat: (() => { const f = []; CAMPAIGN.forEach(a => a.steps.forEach(s => f.push(Object.assign({ act: a.act }, s)))); return f; })(),
  tag(k) { return k === 'pp' ? `<span class="qtag pp">★ Passivpunkt</span>` : k === 'boss' ? `<span class="qtag boss">Boss</span>` : k === 'trial' ? `<span class="qtag trial">Aufstieg</span>` : ''; },
  ppDone(c, q) {
    if (c.pp && q in c.pp) return !!c.pp[q];
    return Q.flat.some((s, i) => s.k === 'pp' && s.q === q && i < c.idx);
  },
  actOf(i) { return (Q.flat[Math.min(i, Q.flat.length - 1)] || {}).act || 10; },
};
// Erklärungen für Einsteiger – passend zum aktuellen Schritt
Q.hints = t => {
  const h = [];
  if (t.includes('<w>')) h.push(['◈', 'Wegpunkt', 'Die leuchtenden Steinkreise. Einmal berührt, kannst du später von jedem Wegpunkt oder aus der Stadt dorthin teleportieren.']);
  if (t.includes('<d>')) h.push(['↗', 'Richtung', 'Der Pfeil zeigt die Himmelsrichtung auf der Karte (oben = Norden). Mit Tab blendest du die große Karte ein.']);
  if (t.includes('<l>')) h.push(['⟲', 'Ausloggen', 'Schnellster Weg in die Stadt: Esc → „Charakterauswahl“ und wieder einloggen. Du startest dann in der Stadt.']);
  if (t.includes('<k>')) h.push(['⚔', 'Boss', 'Vor dem Kampf Flaschen auffüllen. Stirbst du, startest du am letzten Wegpunkt bzw. Checkpoint.']);
  if (t.includes('<t>')) h.push(['✦', 'Aufstiegsprüfung', 'Ein Gang mit Fallen. Am Ende eine Plakette anklicken – sie schaltet später das Labyrinth frei.']);
  if (/Abgeben|Sprich mit/.test(t)) h.push(['!', 'Quest abgeben', 'Personen mit Ausrufezeichen über dem Kopf ansprechen. Belohnungen (z. B. Gems) im Fenster auswählen.']);
  if (/Passivpunkt|qtag pp/.test(t)) h.push(['★', 'Passivpunkt', 'Diese Quest gibt einen zusätzlichen Skillpunkt. Nicht auslassen!']);
  return h;
};
Q.nextZone = idx => { for (let i = idx; i < Q.flat.length; i++) if (Q.flat[i].z && Q.flat[i].e) return Q.flat[i].z; return ''; };
Q.arrow = s => { const m = (s.t + s.sub.join(' ')).match(/<d>(.)<\/d>/); return m ? m[1] : ''; };
let questAct = null;
function quest(force) {
  const el = sec('quest'), c = S.campaign;
  if (!c) { el.innerHTML = ''; return; }
  const key = 'q' + JSON.stringify([c, questAct, S.settings.questHints]);
  if (lastKey.quest === key && !force) return; lastKey.quest = key;
  const idx = c.idx, curAct = Q.actOf(idx), showAct = questAct || curAct;
  const A = CAMPAIGN.find(a => a.act === showAct);
  let base = 0; for (const a of CAMPAIGN) { if (a.act === showAct) break; base += a.steps.length; }
  const done = Math.min(idx, Q.flat.length), pct = done / Q.flat.length * 100;
  const ppList = PASSIVE_QUESTS.map(([act, name, hint, pts]) => ({ act, name, hint, pts, ok: Q.ppDone(c, name) }));
  const ppHave = ppList.filter(p => p.ok).reduce((a, p) => a + p.pts, 0), ppAll = ppList.reduce((a, p) => a + p.pts, 0);
  const cur = Q.flat[idx], nx = Q.flat.slice(idx + 1, idx + 3);
  const fertig = idx >= Q.flat.length;
  el.innerHTML = `<div class="ph"><div><h1>Kampagne</h1><div class="sub">Schritt für Schritt durch ${window.SPIEL === 'poe2' ? 'Akt 1–4 und die Interludes von PoE 2' : 'Akt 1–10'}. Der Companion liest im Spiel-Log mit und springt automatisch weiter, sobald du ein neues Gebiet betrittst.</div></div>
      <div class="act"><button class="btn" id="qov">${icon('pin', 16)} Als Overlay</button></div></div>
    <div class="card pad"><div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div><div class="cls">Fortschritt · ${Q.akt(curAct)}</div><div style="font:700 26px var(--sans);margin-top:4px">${Math.round(pct)} %<span class="muted" style="font-size:14px;font-weight:500"> · Schritt ${Math.min(idx + 1, Q.flat.length)} von ${Q.flat.length}</span></div></div>
      <div style="margin-left:auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span class="qzone">${c.log ? `${icon('map', 14)} Du bist in: <b>${esc(c.zone || '–')}</b>${c.level ? ' · Level ' + c.level : ''}` : `${icon('warn', 14)} Spiel-Log nicht gefunden – Pfad in „Stash & Farming → Einstellungen“ eintragen`}</span>
        <span class="set" style="border:0;padding:0;gap:8px"><span class="muted" style="font-size:12.5px">Automatisch weiter</span><div class="sw ${c.auto ? 'on' : ''}" id="qauto"></div></span>
      </div></div>
      <div class="prog" style="margin-top:14px"><i style="width:${pct}%"></i></div>
      <div class="qacts">${CAMPAIGN.map(a => { const first = Q.flat.findIndex(s => s.act === a.act), last = first + a.steps.length; return `<span data-act="${a.act}" class="${a.act === showAct ? 'on' : ''}${idx >= last ? ' done' : ''}">${Q.akt(a.act)}</span>`; }).join('')}</div>
    </div>
    <div class="qw" style="margin-top:18px">
      <div class="card pad"><h3>${esc(A.title)} <span class="r"><button class="btn small ghost" id="qjump">Hier anfangen</button></span></h3>
        ${A.tip ? `<div class="qtip">${icon('bolt', 16)}<div>${esc(A.tip)}</div></div>` : ''}
        ${S.settings.questHints !== false ? `<details class="basics"><summary>${icon('flag', 15)} Erste Schritte – so liest du die Liste</summary><div class="bg">
          <div><b class="qs"><z>Blau</z></b> sind Gebiete. „Geh weiter nach …“ heißt: den Ausgang in dieses Gebiet suchen. Der Companion springt automatisch weiter, sobald du es betrittst.</div>
          <div><b class="qs"><w>Wegpunkt</w></b> immer anklicken, wenn du einen siehst – dann kannst du später per Teleport zurück. Die Wegpunkt-Karte öffnet sich, wenn du einen anklickst.</div>
          <div><b class="qs"><d>↗</d></b> Richtungspfeile beziehen sich auf die Karte (Tab). Oben ist Norden.</div>
          <div><b class="qs"><k>Rot</k></b> sind Bosse und wichtige Gegner, <b class="qs"><q>Gold</q></b> Quests. Belohnungen holst du in der Stadt bei der Person mit dem Ausrufezeichen ab.</div>
          <div><span class="qtag pp">★ Passivpunkt</span> Diese Quests geben einen extra Skillpunkt – nie auslassen.</div>
          <div><b>Klick auf einen Schritt</b> setzt deinen Fortschritt dorthin, falls du etwas anders gemacht hast.</div></div></details>` : ''}
        <div class="qlist">${A.steps.map((s, j) => { const i = base + j; const zone = s.e && s.z; return `<div class="qrow ${zone ? 'zone ' : ''}${i < idx ? 'done' : ''}${i === idx ? ' cur' : ''}${s.k === 'pp' ? ' pp' : ''}" data-i="${i}"><div class="qn">${i < idx ? '✓' : j + 1}</div><div class="qb qs">${s.t} ${Q.tag(s.k)}${s.sub.length ? `<div class="qsub">${s.sub.map(x => `<div>${x}</div>`).join('')}</div>` : ''}</div></div>`; }).join('')}</div>
      </div>
      <div class="qnow">
        <div class="card pad frame"><h3>Jetzt <span class="r muted">${Q.akt(curAct)}</span></h3>
          ${fertig ? `<div class="donebox">${icon('check', 30)}<div style="margin-top:8px">Kampagne geschafft! Ab in die Maps.</div></div>` : `<div class="wg">
            <div class="wg-a">${Q.arrow(cur) || icon('flag', 26)}</div>
            <div><div class="wg-z">${esc(c.zone || 'Gebiet unbekannt')}</div><div class="muted" style="font-size:12.5px">${Q.nextZone(idx) && Q.nextZone(idx) !== c.zone ? 'Weiter nach: <b style="color:#9fd3ff">' + esc(Q.nextZone(idx)) + '</b>' : 'Hier erledigen'}</div></div>
          </div>
          <div class="big qs">${cur.t} ${Q.tag(cur.k)}</div>${cur.sub.length ? `<div class="qsub muted" style="font-size:13px;margin-bottom:8px">${cur.sub.map(x => `<div class="qs">› ${x}</div>`).join('')}</div>` : ''}
          ${S.settings.questHints !== false && Q.hints(cur.t + cur.sub.join(' ') + Q.tag(cur.k)).length ? `<div class="hints">${Q.hints(cur.t + cur.sub.join(' ') + Q.tag(cur.k)).map(h => `<div class="hint1"><span class="hs">${h[0]}</span><div><b>${h[1]}</b> ${h[2]}</div></div>`).join('')}</div>` : ''}
          ${nx.map(s => `<div class="nx qs"><span>Danach:</span> ${s.t}</div>`).join('')}`}
          <div style="display:flex;gap:8px;margin-top:12px;align-items:center"><button class="btn small" id="qprev">Zurück</button><label class="muted" style="font-size:12.5px;display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="qhint" style="width:auto" ${S.settings.questHints !== false ? 'checked' : ''}> Einsteiger-Tipps</label><button class="btn small primary" id="qnext" style="margin-left:auto">Erledigt</button></div>
        </div>
        <div class="card pad" style="margin-top:18px"><h3>Passivpunkte <span class="r"><b style="color:var(--gold2)">${ppHave}</b><span class="muted"> / ${ppAll}</span></span></h3>
          <div class="prog" style="margin:-4px 0 10px"><i style="width:${ppHave / ppAll * 100}%"></i></div>
          ${ppList.map(p => `<div class="qpp ${p.ok ? 'ok' : ''}" data-q="${esc(p.name)}" data-ok="${p.ok ? 1 : 0}"><div class="bx">${p.ok ? icon('check', 13) : ''}</div><span class="qa">A${p.act}</span><div class="qt">${esc(p.name)}<small>${esc(p.hint)}</small></div><span class="pts">+${p.pts}</span></div>`).join('')}
          <div class="muted" style="font-size:12px;margin-top:10px">Wird automatisch abgehakt, wenn du den Schritt hinter dir hast. Klick zum manuellen Abhaken. Im Spiel prüfst du es mit <b>/passives</b> im Chat.</div>
        </div>
        ${Q.splits(c, curAct)}
        <div style="text-align:right;margin-top:10px"><button class="btn small ghost danger" id="qreset">Fortschritt zurücksetzen</button></div>
      </div>
    </div>`;
  const C = b => api('/api/campaign', b);
  $('#qnext').onclick = () => C({ action: 'next' });
  $('#qprev').onclick = () => C({ action: 'prev' });
  $('#qjump').onclick = () => { C({ action: 'act', act: showAct }); questAct = null; };
  $('#qauto').onclick = () => C({ action: 'auto', on: !c.auto });
  $('#qhint').onchange = e => api('/api/settings', { questHints: e.target.checked });
  $('#qreset').onclick = () => App.ask('Kampagnen-Fortschritt zurücksetzen?', { ok: 'Zurücksetzen', danger: true, detail: 'Gilt nur für das aktive Profil. Passivpunkt-Haken werden auch entfernt.' }).then(ok => ok && C({ action: 'reset' }));
  $('#qov').onclick = () => api('/api/window', { name: 'quest', action: 'open' }).then(r => { if (!r.win) toast('Das Overlay gibt es nur in der Windows-App.'); });
  el.querySelectorAll('.qacts span').forEach(s => s.onclick = () => { questAct = +s.dataset.act === curAct ? null : +s.dataset.act; quest(true); });
  el.querySelectorAll('.qrow').forEach(r => r.onclick = () => C({ action: 'set', idx: +r.dataset.i }));
  el.querySelectorAll('.qpp').forEach(r => r.onclick = () => C({ action: 'pp', quest: r.dataset.q, on: r.dataset.ok !== '1' }));
  const curEl = el.querySelector('.qrow.cur'); if (curEl && force) curEl.scrollIntoView({ block: 'center' });
}
