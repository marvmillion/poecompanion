// PoE Companion – Aufstiegsklasse (Ascendancy) im Skilltree: welche Klasse, welche Punkte, in welchem Labyrinth
const Asc = {
  LABS: ['Normal Lab', 'Cruel Lab', 'Merciless Lab', 'Eternal Lab'],
  LVL: ['ab Level ~33', 'ab Level ~55', 'ab Level ~68', 'ab Level ~75'],
  ids(plan) { return (plan && plan.all || []).filter(id => ASC.nodes[id] && !ASC.nodes[id].st0); },
  info(state, idx) {
    if (!state || !window.ASC) return null;
    const plans = state.plans, plan = plans[idx], ids = this.ids(plan);
    if (!ids.length) return null;
    const have = new Set(state.have), cls = ASC.nodes[ids[0]].a;
    // Reihenfolge: was in früheren Stufen schon drin war, kommt zuerst
    const order = [], seen = new Set();
    for (let i = 0; i <= idx; i++) for (const id of this.ids(plans[i])) if (!seen.has(id) && ids.includes(id)) { seen.add(id); order.push({ id, stage: i }); }
    let pts = 0;
    const list = order.map(o => { pts++; return Object.assign(o, { lab: Math.min(3, Math.ceil(pts / 2) - 1), have: have.has(o.id), n: ASC.nodes[o.id] }); });
    const prev = idx > 0 ? new Set(this.ids(plans[idx - 1])) : new Set();
    return { cls, c: ASC.classes[cls], list, total: list.length, haveN: list.filter(x => x.have).length, neu: list.filter(x => !prev.has(x.id)) };
  },
  portrait(cls, size) {
    const c = ASC.classes[cls]; if (!c || !c.c) return '';
    const k = size / c.c[2], S = ASC.sheet;
    return `<span class="asc-p" style="width:${size}px;height:${size}px;background-image:url('${S.url}');background-size:${S.w * k}px ${S.h * k}px;background-position:${-c.c[0] * k}px ${-c.c[1] * k}px"></span>`;
  },
  nodeIcon(n, size) {
    if (!n.c) return `<span class="asc-i" style="width:${size}px;height:${size}px"></span>`;
    const k = size / n.c[2], S = ASC.skills;
    return `<span class="asc-i${n.nt ? ' nt' : ''}" style="width:${size}px;height:${size}px;background-image:url('/tree-assets/${S.f}');background-size:${S.w * k}px ${S.h * k}px;background-position:${-n.c[0] * k}px ${-n.c[1] * k}px"></span>`;
  },
  // Abschnitt für die Skilltree-Seitenleiste
  html(state, idx) {
    const a = this.info(state, idx); if (!a) return '';
    const offen = a.list.filter(x => !x.have);
    const next = offen[0] && Object.assign({}, offen[0], { n: (offen.find(x => x.n.nt) || offen[0]).n });
    const notables = a.list.filter(x => x.n.nt);
    return `<div class="asc">
      <div class="asc-h">${this.portrait(a.cls, 54)}<div><div class="asc-n">${esc(a.c ? a.c.name : a.cls)}</div><div class="muted" style="font-size:12.5px">${a.haveN} von ${a.total} Aufstiegspunkten</div></div></div>
      ${next ? `<div class="asc-next">${icon('flag', 15)}<div><b>${this.LABS[next.lab]}</b> <span class="muted">${this.LVL[next.lab]}</span><div>Als Nächstes: <span class="asc-k">${esc(next.n.n)}</span></div></div></div>` : `<div class="asc-next ok">${icon('check', 15)}<div>Alle Aufstiegspunkte dieser Stufe vergeben.</div></div>`}
      <div class="asc-l">${notables.map(x => `<div class="asc-r${x.have ? ' have' : ''}" title="${esc(x.n.st.join('\n'))}">${this.nodeIcon(x.n, 34)}<div><b>${esc(x.n.n)}</b><small>${this.LABS[x.lab]}${x.have ? ' · geskillt' : ''}</small></div></div>`).join('')}</div>
      <div class="muted" style="font-size:12px;margin-top:8px">Pro Labyrinth gibt es 2 Aufstiegspunkte. Kleine Punkte auf dem Weg zum nächsten Notable zählen mit.</div>
    </div>`;
  },
  // Eine Zeile für das kleine Tree-Overlay
  line(state, idx) {
    const a = this.info(state, idx); if (!a) return '';
    const offen = a.list.filter(x => !x.have);
    const next = offen[0] && Object.assign({}, offen[0], { n: (offen.find(x => x.n.nt) || offen[0]).n });
    return `<div class="ascline">${this.portrait(a.cls, 26)}<span><b>${esc(a.c ? a.c.name : a.cls)}</b> ${a.haveN}/${a.total}${next ? ` · ${this.LABS[next.lab]}: <span style="color:#e6c992">${esc(next.n.n)}</span>` : ' · fertig'}</span></div>`;
  },
};
