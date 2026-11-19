// PoE Companion – Skilltree-Darstellung mit den Original-Grafiken aus Path of Building
class TreeView {
  constructor(canvas, tip, opts = {}) {
    this.cv = canvas; this.tip = tip; this.opt = opts;
    this.T = window.TREE; this.N = this.T.nodes;
    this.view = { s: .06, x: 0, y: 0 };
    this.sets = { have: new Set(), first: new Set(), next: new Set(), remove: new Set(), target: new Set() };
    this.plan = null; this.state = null; this.hover = null; this.drag = null; this.dirty = true;
    this.IMG = {};
    for (const k in this.T.sheets) this.img(this.T.sheets[k].f);
    this.p2 = this.T.game === 'poe2' && !!this.T.sheets.icA;
    this.BG = this.p2 ? { complete: false } : this.img('background-3.png');
    this.t0 = performance.now();
    this.bind();
    new ResizeObserver(() => { this.dirty = true; }).observe(canvas);
    this.moveT = 0; this.vel = null; this.zt = null; this.lastT = performance.now(); this.lastAnim = 0;
    // Zeichenschleife: beim Bewegen schnell und schlicht, im Stillstand mit allen Effekten; Puls-Animation nur ~20 Bilder/s
    const loop = t => {
      const dt = Math.min(48, t - this.lastT); this.lastT = t;
      this.step(dt);
      const mv = this.moving();
      if (this.wasMoving && !mv) this.dirty = true;
      this.wasMoving = mv;
      const anim = (this.sets.first.size || this.rfSt || (this.rf && this.rf.length)) && !mv && t - this.lastAnim > 50;
      if (this.dirty || anim) { if (anim) this.lastAnim = t; this.dirty = false; this.draw(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  moving() { return performance.now() - this.moveT < 170; }
  bewegt() { this.moveT = performance.now(); this.dirty = true; }
  // Weiches Zoomen und Nachgleiten nach dem Loslassen
  step(dt) {
    const v = this.view;
    if (this.zt) {
      const z = this.zt, ns = v.s + (z.s - v.s) * Math.min(1, dt / 70);
      v.x += z.mx / v.s; v.y += z.my / v.s; v.s = Math.abs(ns - z.s) / z.s < .003 ? z.s : ns; v.x -= z.mx / v.s; v.y -= z.my / v.s;
      if (v.s === z.s) this.zt = null;
      this.bewegt();
    }
    if (this.fly && !this.drag) {
      const f = this.fly, k = Math.min(1, dt / 110);
      v.x += (f.x - v.x) * k; v.y += (f.y - v.y) * k; v.s *= Math.pow(f.s / v.s, k);
      if (Math.abs(f.x - v.x) * v.s < .5 && Math.abs(f.y - v.y) * v.s < .5 && Math.abs(f.s / v.s - 1) < .004) { v.x = f.x; v.y = f.y; v.s = f.s; this.fly = null; }
      this.bewegt();
    }
    if (this.vel && !this.drag) {
      v.x -= this.vel.x * dt / v.s; v.y -= this.vel.y * dt / v.s;
      const k = Math.pow(.9, dt / 16); this.vel.x *= k; this.vel.y *= k;
      if (Math.hypot(this.vel.x, this.vel.y) < .02) this.vel = null;
      this.bewegt();
    }
  }

  img(f) {
    if (!this.IMG[f]) { const i = new Image(); i.onload = () => { this.dirty = true; }; i.src = f.startsWith('/') ? f : '/tree-assets/' + f; this.IMG[f] = i; }
    return this.IMG[f];
  }
  sprite(sheet, key) { const s = this.T.sheets[sheet]; if (!s) return null; const c = s.c[key]; return c ? { im: this.IMG[s.f], c } : null; }

  // Icon als CSS-Hintergrund (für Listen)
  cssIcon(el, sheet, key, size) {
    const sp = this.sprite(sheet, key);
    if (!sp) {  // PoE2: Symbol ohne Grafik – farbiger Punkt passend zum Typ
      const aktiv = /Active|Selected|Connected/.test(sheet), k = /keystone/.test(sheet) ? '#8a7a5e' : /notable/.test(sheet) ? '#c99d55' : '#6e604a';
      el.style.backgroundImage = `radial-gradient(circle, ${aktiv ? '#e9c56a' : '#2a2620'} 0 38%, ${k} 40% 52%, transparent 54%)`;
      el.style.backgroundSize = '100% 100%'; el.style.backgroundPosition = 'center'; return;
    }
    const s = this.T.sheets[sheet], k = size / sp.c[2];
    el.style.backgroundImage = `url("${s.f.startsWith('/') ? s.f : '/tree-assets/' + s.f}")`;
    el.style.backgroundSize = `${s.w * k}px ${s.h * k}px`;
    el.style.backgroundPosition = `${-sp.c[0] * k}px ${-sp.c[1] * k}px`;
  }
  iconSheet(id, active = true) { if (this.p2) return active ? 'icA' : 'icI'; const t = this.N[id].t; return (t === 'k' ? 'keystone' : t === 'n' ? 'notable' : 'normal') + (active ? 'Active' : 'Inactive'); }

  setPlan(state, idx) {
    this.state = state; this.plan = state && state.plans[idx];
    const p = this.plan;
    this.sets.have = new Set(state ? state.have : []);
    this.sets.target = new Set(p ? p.target : []);
    this.sets.remove = new Set(p ? p.remove : []);
    this.sets.next = new Set(p ? p.steps.flat() : []);
    this.sets.first = new Set(p && p.steps[0] ? p.steps[0] : []);
    // Aufstiegsklasse für die Anzeige oben rechts
    this.asc = null;
    if (window.ASC && typeof Asc !== 'undefined' && state) { const a = Asc.info(state, idx); if (a) this.asc = { a, plan: new Set(a.list.map(x => x.id)), next: (a.list.find(x => !x.have) || {}).id }; }
    this.dirty = true;
  }

  focusNext() {
    const s = this.sets;
    this.fitTo(s.first.size ? [...s.first] : s.next.size ? [...s.next] : s.remove.size ? [...s.remove] : [...s.have]);
  }

  fitTo(ids, pad = 650, maxS = .42) {
    ids = ids.filter(id => this.N[id]); if (!ids.length) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const id of ids) { const n = this.N[id]; x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
    const W = this.cv.clientWidth || 600, H = this.cv.clientHeight || 400;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const ts = Math.min(W / (x1 - x0), H / (y1 - y0), maxS), tx = (x0 + x1) / 2, ty = (y0 + y1) / 2;
    if (!this.everDrawn || matchMedia('(prefers-reduced-motion: reduce)').matches) { this.view.s = ts; this.view.x = tx; this.view.y = ty; this.dirty = true; return; }
    this.zt = null; this.vel = null; this.fly = { x: tx, y: ty, s: ts }; this.bewegt();  // sanft hinfliegen
  }

  P(x, y) { const v = this.view; return [(x - v.x) * v.s + this.cv.clientWidth / 2, (y - v.y) * v.s + this.cv.clientHeight / 2]; }
  vis(X, Y, m = 80) { return X > -m && Y > -m && X < this.cv.clientWidth + m && Y < this.cv.clientHeight + m; }

  drawSprite(c, sheet, key, X, Y, mult = 1, half = false) {
    const sp = this.sprite(sheet, key); if (!sp || !sp.im || !sp.im.complete || !sp.im.naturalWidth) return false;
    const [sx, sy, sw, sh] = sp.c, w = sw * this.view.s * 1.33 * mult, h = sh * this.view.s * 1.33 * mult;
    if (half) {
      c.drawImage(sp.im, sx, sy, sw, sh, X - w, Y - h * 2, w * 2, h * 2);
      c.save(); c.translate(X, Y); c.scale(1, -1); c.drawImage(sp.im, sx, sy, sw, sh, -w, -h * 2, w * 2, h * 2); c.restore();
    } else c.drawImage(sp.im, sx, sy, sw, sh, X - w, Y - h, w * 2, h * 2);
    return true;
  }

  st(id) {
    if (this.rfSt) return this.rfSt[id] || (this.rfStart === id ? 'have' : 'no');
    const s = this.sets;
    if (s.remove.has(id)) return 'rm';
    if (s.have.has(id)) return 'have';
    if (s.first.has(id)) return 'first';
    if (s.next.has(id)) return 'plan';
    return 'no';
  }

  draw() {
    const cv = this.cv, T = this.T, N = this.N;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fast = this.moving(); this.everDrawn = true;
    c.imageSmoothingQuality = fast ? 'low' : 'high';
    if (this.BG.complete && this.BG.naturalWidth) { if (!this.pat) this.pat = c.createPattern(this.BG, 'repeat'); c.fillStyle = this.pat; } else c.fillStyle = '#07090b';
    c.fillRect(0, 0, W, H);
    if (this.p2) this.drawBg2(c);
    c.globalAlpha = .92;
    for (const [gx, gy, key] of T.groups) { const [X, Y] = this.P(gx, gy); if (!this.vis(X, Y, 320)) continue; this.drawSprite(c, 'groupBackground', key, X, Y, 1, key === 'PSGroupBackground3'); }
    c.globalAlpha = 1;
    const lw = Math.max(1.4, 24 * this.view.s);
    const now = performance.now() - this.t0, pulse = .55 + .45 * Math.sin(now / 360);
    const lines = { no: [], plan: [], rm: [], have: [], first: [] };
    for (const [a, b, eo] of T.edges) {
      const A = N[a], B = N[b];
      const [ax, ay] = this.P(A.x, A.y), [bx, by] = this.P(B.x, B.y);
      if (!this.vis(ax, ay, 420) && !this.vis(bx, by, 420)) continue;
      const sa = this.st(a), sb = this.st(b); let s = 'no';
      const on = x => x === 'have' || x === 'first' || x === 'plan';
      if (on(sa) && on(sb)) s = (sa === 'first' || sb === 'first') ? 'first' : (sa === 'plan' || sb === 'plan') ? 'plan' : 'have';
      if (sa === 'rm' || sb === 'rm') s = ((sa === 'rm' || sa === 'have') && (sb === 'rm' || sb === 'have')) ? 'rm' : 'no';
      if ((A.t === 's' || B.t === 's') && s === 'no') continue;
      lines[s].push([A, B, eo]);
    }
    const path = L => {
      c.beginPath();
      for (const [A, B, eo] of L) {
        if (eo && T.radii[Math.abs(eo)]) {  // PoE2: gebogene Verbindung zwischen Gruppen (wie im Spiel)
          const r0 = T.radii[Math.abs(eo)], dx = B.x - A.x, dy = B.y - A.y, dist = Math.hypot(dx, dy);
          if (dist < r0 * 2 && dist > 0) {
            const perp = Math.sqrt(r0 * r0 - dist * dist / 4) * (eo > 0 ? 1 : -1);
            const cx = A.x + dx / 2 + perp * (dy / dist), cy = A.y + dy / 2 - perp * (dx / dist);
            const a1 = Math.atan2(A.y - cy, A.x - cx); let d = Math.atan2(B.y - cy, B.x - cx) - a1;
            while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
            const [X, Y] = this.P(cx, cy), [ax, ay] = this.P(A.x, A.y);
            c.moveTo(ax, ay); c.arc(X, Y, r0 * this.view.s, a1, a1 + d, d < 0); continue;
          }
        }
        if (A.g === B.g && A.o === B.o && A.o > 0) {
          const r0 = T.radii[A.o], cx = A.x - r0 * Math.sin(A.a), cy = A.y + r0 * Math.cos(A.a);
          let d = B.a - A.a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          const [X, Y] = this.P(cx, cy), r = r0 * this.view.s, s0 = A.a - Math.PI / 2;
          c.moveTo(X + r * Math.cos(s0), Y + r * Math.sin(s0)); c.arc(X, Y, r, s0, s0 + d, d < 0);
        } else { const [ax, ay] = this.P(A.x, A.y), [bx, by] = this.P(B.x, B.y); c.moveTo(ax, ay); c.lineTo(bx, by); }
      }
    };
    // Linien in Schichten: dunkler Unterbau, farbiger Kern, heller Grat – wie gravierte Metallbahnen
    const STYLE = {
      no:    { under: 'rgba(0,0,0,.55)', core: '#4a3f2e', w: .5 },
      plan:  { under: 'rgba(0,0,0,.6)', core: '#6aa595', w: .8, dash: [1.3, .9] },
      rm:    { under: 'rgba(0,0,0,.6)', core: '#cf4b3f', w: .8, dash: [.7, .7] },
      have:  { under: 'rgba(0,0,0,.65)', core: '#c99d55', w: 1, ridge: 'rgba(255,236,190,.55)', glow: 'rgba(233,197,106,.35)' },
      first: { under: 'rgba(0,0,0,.65)', core: '#f0a050', w: 1.05, ridge: 'rgba(255,230,190,.8)', glow: `rgba(240,160,80,${.35 + .4 * pulse})`, march: true },
    };
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const k of ['no', 'plan', 'rm', 'have', 'first']) {
      const L = lines[k]; if (!L.length) continue;
      const S = STYLE[k], w = lw * S.w;
      path(L);
      c.setLineDash([]); c.strokeStyle = S.under; c.lineWidth = w + Math.max(2, lw * .55); c.stroke();
      if (S.glow && !fast) { c.shadowBlur = 14; c.shadowColor = S.glow; }
      c.strokeStyle = S.core; c.lineWidth = w;
      if (S.dash) c.setLineDash(S.dash.map(x => x * lw * 1.6));
      if (S.march) { c.setLineDash([lw * 2.2, lw * 1.2]); c.lineDashOffset = -now / 28; }
      c.stroke(); c.shadowBlur = 0; c.setLineDash([]); c.lineDashOffset = 0;
      if (S.ridge && lw > 2.2 && !fast) { c.strokeStyle = S.ridge; c.lineWidth = Math.max(.8, w * .22); c.stroke(); }
    }
    c.shadowBlur = 0;
    const FR = { o: ['PSSkillFrame', 'PSSkillFrameActive', 'PSSkillFrameHighlighted'], n: ['NotableFrameUnallocated', 'NotableFrameAllocated', 'NotableFrameCanAllocate'],
      k: ['KeystoneFrameUnallocated', 'KeystoneFrameAllocated', 'KeystoneFrameCanAllocate'], j: ['JewelFrameUnallocated', 'JewelFrameAllocated', 'JewelFrameCanAllocate'] };
    const SIZE = { o: 53, n: 77, k: 112, j: 77, m: 86, s: 60, a: 40 };
    const start = 'center' + ((this.state && this.state.char && this.state.char.base) || '').toLowerCase();
    const labels = [];
    const mast = this.plan ? this.plan.mast : [];
    const haveM = (this.state && this.state.haveMast) || {};
    for (const id in N) {
      const n = N[id]; const [X, Y] = this.P(n.x, n.y); if (!this.vis(X, Y, 130)) continue;
      const s = this.st(id), on = s === 'have', want = s === 'first' || s === 'plan';
      if (this.p2) { this.drawNode2(c, id, n, X, Y, s, on, want, fast, pulse, labels); continue; }
      const vek = !this.T.sheets.frame;  // PoE2 ohne Grafiken: Punkte selbst zeichnen
      if (n.t === 's') {
        if (vek) { const R = 130 * this.view.s, mine = this.sets.have.has(id); c.lineWidth = Math.max(1.5, R * .12); c.strokeStyle = mine ? '#e9c56a' : '#4a3f2e'; c.fillStyle = mine ? 'rgba(233,197,106,.12)' : 'rgba(20,17,13,.8)'; c.beginPath(); c.arc(X, Y, R, 0, 7); c.fill(); c.stroke();
          if (this.view.s > .03) { c.fillStyle = mine ? '#ecd39d' : '#7d6f58'; c.font = `600 ${Math.max(10, Math.min(18, R * .32))}px Inter, sans-serif`; c.textAlign = 'center'; c.fillText((n.cls || []).join(' / '), X, Y + 4); } continue; }
        this.drawSprite(c, 'startNode', this.sets.have.has(id) ? start : 'PSStartNodeBackgroundInactive', X, Y); continue; }
      if (n.t === 'm') {
        const m = mast.find(q => q.node === id), ok = haveM[id];
        if (ok) { this.drawSprite(c, 'masteryActiveEffect', n.fx, X, Y); this.drawSprite(c, 'masteryActiveSelected', n.aa, X, Y); }
        else this.drawSprite(c, m ? 'masteryConnected' : 'masteryInactive', n.ia, X, Y) || this.drawSprite(c, 'mastery', n.ic, X, Y);
        if (m && !ok) { c.strokeStyle = '#b48ad8'; c.lineWidth = 2.5; c.setLineDash([5, 4]); c.beginPath(); c.arc(X, Y, SIZE.m * this.view.s * .6, 0, 7); c.stroke(); c.setLineDash([]); }
        continue;
      }
      const r = SIZE[n.t] * this.view.s / 2;
      const fokus = this.plan && s === 'no';
      if (fokus) c.globalAlpha = .5;
      if ((want || s === 'rm') && (!fast || s === 'first')) {
        const g = c.createRadialGradient(X, Y, r * .3, X, Y, r * 2.3);
        const cc = s === 'rm' ? '207,75,63' : s === 'first' ? '240,160,80' : '106,165,149';
        g.addColorStop(0, `rgba(${cc},${s === 'first' ? .55 * pulse + .22 : .38})`); g.addColorStop(1, `rgba(${cc},0)`);
        c.fillStyle = g; c.beginPath(); c.arc(X, Y, r * 2.3, 0, 7); c.fill();
      }
      if (vek) {
        const rr = n.t === 'a' ? r * .8 : r * .62;
        const fill = on ? '#c99d55' : want ? '#4f8f80' : s === 'rm' ? '#7a2f28' : n.t === 'k' ? '#2a2620' : n.t === 'n' ? '#211d17' : '#17140f';
        const ring = on ? '#ffe2a0' : want ? '#9fd8c8' : n.t === 'k' ? '#8a7a5e' : n.t === 'n' ? '#6e604a' : n.t === 'j' ? '#7aa2c8' : n.t === 'a' ? '#5a4f40' : '#4a3f2e';
        c.fillStyle = fill; c.strokeStyle = ring; c.lineWidth = Math.max(1, rr * (n.t === 'k' || n.t === 'n' ? .28 : .2));
        c.beginPath();
        if (n.t === 'j') { c.moveTo(X, Y - rr); c.lineTo(X + rr, Y); c.lineTo(X, Y + rr); c.lineTo(X - rr, Y); c.closePath(); }
        else c.arc(X, Y, rr, 0, 7);
        c.fill(); c.stroke();
        if (n.t === 'k' && !fast) { c.beginPath(); c.arc(X, Y, rr * 1.25, 0, 7); c.lineWidth = Math.max(1, rr * .1); c.stroke(); }
        c.globalAlpha = 1;
        if (s === 'rm') { c.strokeStyle = '#cf4b3f'; c.lineWidth = 2.5; c.setLineDash([4, 3]); c.beginPath(); c.arc(X, Y, r * 1.1, 0, 7); c.stroke(); c.setLineDash([]); }
        if (s === 'first') { c.strokeStyle = `rgba(240,160,80,${.5 + .5 * pulse})`; c.lineWidth = 2; c.beginPath(); c.arc(X, Y, r * (1.18 + .08 * pulse), 0, 7); c.stroke(); }
        if (id === this.hover) { c.strokeStyle = '#fff3d6'; c.lineWidth = 1.5; c.beginPath(); c.arc(X, Y, r * 1.15, 0, 7); c.stroke(); }
        if ((n.t === 'n' || n.t === 'k') && (fast ? (s === 'first' || s === 'rm') : (s === 'first' || s === 'rm' || id === this.hover || this.view.s > .38))) labels.push([X, Y - r - 7, n.n, s]);
        continue;
      }
      if (n.t !== 'j') {
        if (fast) this.drawSprite(c, this.iconSheet(id, on || want), n.ic, X, Y);
        else { c.save(); c.beginPath(); c.arc(X, Y, r * (n.t === 'k' ? .78 : .74), 0, 7); c.clip(); this.drawSprite(c, this.iconSheet(id, on || want), n.ic, X, Y); c.restore(); }
      }
      const fr = FR[n.t] || FR.o;
      this.drawSprite(c, 'frame', on ? fr[1] : want ? fr[2] : fr[0], X, Y);
      c.globalAlpha = 1;
      if (s === 'rm') { c.strokeStyle = '#cf4b3f'; c.lineWidth = 2.5; c.setLineDash([4, 3]); c.beginPath(); c.arc(X, Y, r * 1.1, 0, 7); c.stroke(); c.setLineDash([]); }
      if (s === 'first') { c.strokeStyle = `rgba(240,160,80,${.5 + .5 * pulse})`; c.lineWidth = 2; c.beginPath(); c.arc(X, Y, r * (1.18 + .08 * pulse), 0, 7); c.stroke(); }
      if (id === this.hover) { c.strokeStyle = '#fff3d6'; c.lineWidth = 1.5; c.beginPath(); c.arc(X, Y, r * 1.15, 0, 7); c.stroke(); }
      if ((n.t === 'n' || n.t === 'k') && (fast ? (s === 'first' || s === 'rm') : (s === 'first' || s === 'rm' || id === this.hover || this.view.s > .38))) labels.push([X, Y - r - 7, n.n, s]);
      this.ordnungsNummer(c, id, X, Y, r);
    }
    if (!this.vig || this.vig.w !== W || this.vig.h !== H) {  // Vignette nur bei Größenänderung neu berechnen
      const o = document.createElement('canvas'); o.width = W; o.height = H; const oc = o.getContext('2d');
      const vg = oc.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .25, W / 2, H / 2, Math.max(W, H) * .78);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.7)'); oc.fillStyle = vg; oc.fillRect(0, 0, W, H);
      this.vig = { o, w: W, h: H };
    }
    c.drawImage(this.vig.o, 0, 0, W, H);
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const PRIO = { first: 0, rm: 1, plan: 2, have: 3, no: 4 }, placed = [];
    labels.sort((a, b) => PRIO[a[3]] - PRIO[b[3]]);
    // Beschriftung wie im Spiel: keine Kästen, nur Kapitälchen mit Schatten; wichtige Punkte mit feiner Goldlinie
    for (const [X, Y, t, st] of labels) {
      const big = st === 'first' || st === 'rm';
      c.font = `600 ${big ? 13 : 12}px Cinzel, "Spectral SC", Georgia, serif`;
      const w = c.measureText(t).width, h = 16, x0 = X - w / 2 - 6, y0 = Y - h + 2;
      if (placed.some(q => x0 < q[2] + 4 && x0 + w + 12 > q[0] && y0 < q[3] + 2 && y0 + h + 2 > q[1])) continue;
      placed.push([x0, y0, x0 + w + 12, y0 + h]);
      const col = st === 'first' ? '#ffd9a8' : st === 'rm' ? '#f6b0a8' : st === 'plan' ? '#bfe3d8' : st === 'have' ? '#f0dcaa' : '#cbbd9f';
      c.lineJoin = 'round'; c.lineWidth = 4; c.strokeStyle = 'rgba(5,4,3,.92)'; c.strokeText(t, X, Y - 2);
      c.shadowColor = 'rgba(0,0,0,.9)'; c.shadowBlur = 6; c.fillStyle = col; c.fillText(t, X, Y - 2); c.shadowBlur = 0;
      if (big || st === 'have') {
        const lc = st === 'first' ? 'rgba(240,160,80,.9)' : st === 'rm' ? 'rgba(207,75,63,.9)' : 'rgba(201,157,85,.55)';
        const gr = c.createLinearGradient(X - w / 2, 0, X + w / 2, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, lc); gr.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gr; c.fillRect(X - w / 2, Y + 1, w, 1.2);
      }
    }
    this.drawMini(c, W, H);
    this.drawAsc(c, W, H);
  }

  // Lern-Reihenfolge (Path of Building): Liste unter dem Baum + Nummern an den Zielknoten
  // Leveling-Ansicht: zeigt den Baum so, wie er nach Schritt k aussieht (k = 0 → aus)
  setRf(k) {
    const R = this.rf; if (!R || !k) { this.rfSt = null; this.rfK = 0; this.dirty = true; if (this._play) { clearInterval(this._play); this._play = 0; } return; }
    k = Math.max(1, Math.min(R.length, k)); this.rfK = k; const m = {};
    R.forEach((x, i) => { if (i < k - 1) x.nodes.forEach(n => m[n] = 'have'); else if (i === k - 1) x.nodes.forEach(n => m[n] = 'first'); });
    if (this.state && this.state.have) { const st = this.state.have.find(n => this.N[n] && this.N[n].t === 's'); if (st) this.rfStart = st; }
    this.rfSt = m; this.dirty = true;
    this.fitTo(R[k - 1].nodes, 700, .32);
  }
  zeigeReihenfolge(L, t) {
    const R = t && t.reihenfolge; this.ordnung = {};
    if (!R) return;
    this.rf = R.schritte || [];
    const lv = (t.char && +t.char.level) || 0;
    (R.schritte || []).forEach((x, i) => { this.ordnung[x.ziel] = i + 1; });
    this.dirty = true;
    const box = document.createElement('div'); box.className = 'rf-box';
    const kopf = `<div class="lsec">Reihenfolge zum Leveln <span class="rf-q">berechnet mit Path of Building</span></div>
      <div class="rf-hint">So skillst du von Anfang an: immer der nächste Schritt mit dem meisten Nutzen pro Punkt für deinen Build. Die Zahl im Kreis steht auch im Baum am Ziel-Knoten.${R.status === 'rechnet' ? ' <b>Wird gerade berechnet …</b>' : ''}</div>`;
    const N = (R.schritte || []).length, k = this.rfK || 0, cur = k ? R.schritte[k - 1] : null;
    box.innerHTML = kopf + (N ? `<div class="rf-ctl"><button class="btn small ${k ? 'ghost' : 'primary'}" data-rf="an">${k ? 'Normale Ansicht' : '▶ Leveling-Ansicht'}</button>
      ${k ? `<button class="btn small ghost" data-rf="-1">◀</button><input type="range" min="1" max="${N}" value="${k}" data-rf="r"><button class="btn small ghost" data-rf="+1">▶</button><button class="btn small ${this._play ? 'primary' : 'ghost'}" data-rf="play" title="Automatisch Schritt für Schritt abspielen">${this._play ? '⏸ Stopp' : '⏵ Abspielen'}</button>
      <span class="rf-lv">Schritt ${k}/${N} · <b>Level ${cur.level}</b></span>` : '<span class="rf-lv">Zeigt den Baum Schritt für Schritt, wie er bei jedem Level aussehen soll.</span>'}</div>` : '');
    box.querySelectorAll('[data-rf]').forEach(el => {
      const a = el.dataset.rf;
      if (a === 'r') el.oninput = () => { this.setRf(+el.value); this.zeigeReihenfolgeNeu(); };
      else if (a === 'play') el.onclick = () => this.abspielen();
      else el.onclick = () => { this.setRf(a === 'an' ? (this.rfK ? 0 : 1) : this.rfK + (+a)); this.zeigeReihenfolgeNeu(); };
    });
    this._rfL = L; this._rfT = t;
    let vorher = 0;
    (R.schritte || []).forEach((x, i) => {
      const n = this.N[x.ziel]; if (!n) return;
      const von = vorher + 2, bis = x.punkte + 1; vorher = x.punkte;
      const jetzt = lv && lv >= von && lv <= bis + 1;
      const d = document.createElement('div'); d.className = 'step rf' + (jetzt ? ' first' : '') + (lv && bis < lv ? ' rf-alt' : '');
      const w = [x.dps >= .05 ? `+${String(x.dps.toFixed(1)).replace('.', ',')} % vom End-DPS` : '', x.ehp >= .05 ? `+${String(x.ehp.toFixed(1)).replace('.', ',')} % vom End-eHP` : ''].filter(Boolean).join(' · ');
      d.innerHTML = `<div class="num">${i + 1}</div><div class="sico${n.t === 'k' ? ' k' : ''}"></div><div class="sst"><div class="n">${x.rest ? 'Restliche kleine Punkte' : App.esc(n.n)}</div>
        <div class="d">${von === bis ? 'Level ' + bis : 'Level ' + von + '–' + bis} · ${x.nodes.length} Punkt${x.nodes.length > 1 ? 'e' : ''}${w ? ' · <b class="rf-w">' + w + '</b>' : ''}</div></div>`;
      this.cssIcon(d.querySelector('.sico'), this.iconSheet(x.ziel), n.ic, 36);
      d.onclick = () => { this.setRf(i + 1); this.zeigeReihenfolgeNeu(); };
      d.onmouseenter = () => { this.hover = x.ziel; this.dirty = true; }; d.onmouseleave = () => { this.hover = null; this.dirty = true; };
      if (this.rfK === i + 1) d.classList.add('first');
      box.appendChild(d);
    });
    if (!(R.schritte || []).length && R.status === 'rechnet') box.insertAdjacentHTML('beforeend', '<div class="muted" style="font-size:12px;padding:6px 2px">Path of Building rechnet die beste Reihenfolge – das dauert beim ersten Mal etwa eine Minute.</div>');
    L.appendChild(box);
  }
  abspielen() {
    if (this._play) { clearInterval(this._play); this._play = 0; this.zeigeReihenfolgeNeu(); return; }
    if (!this.rfK || this.rfK >= this.rf.length) this.setRf(1);
    this._play = setInterval(() => {
      if (!this.rfK || this.rfK >= this.rf.length) { clearInterval(this._play); this._play = 0; }
      else this.setRf(this.rfK + 1);
      this.zeigeReihenfolgeNeu();
    }, 1800);
    this.zeigeReihenfolgeNeu();
  }
  zeigeReihenfolgeNeu() { const b = this._rfL && this._rfL.querySelector('.rf-box'); if (b) b.remove(); if (this._rfL) this.zeigeReihenfolge(this._rfL, this._rfT); }
  ordnungsNummer(c, id, X, Y, r) {
    const k = this.ordnung && this.ordnung[id]; if (!k || this.view.s < .05) return;
    const rr = Math.max(8, Math.min(13, r * .45)), x = X + r * .8, y = Y - r * .8;
    c.fillStyle = '#120f0a'; c.strokeStyle = '#e9c56a'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, rr, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#ffe2a0'; c.font = `700 ${Math.round(rr * 1.05)}px Inter, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(k), x, y + .5); c.textBaseline = 'alphabetic';
  }

  // ---------- PoE2: Original-Grafiken aus Path of Building PoE2
  spr2(c, sheet, key, X, Y, half, alpha = 1) {
    const S = this.T.sheets[sheet]; if (!S) return false;
    const k = S.alias ? S.alias[key] : key, cc = k && S.c[k]; if (!cc) return false;
    const im = this.img(S.f); if (!im.complete || !im.naturalWidth) return false;
    const h = half * this.view.s; if (alpha !== 1) c.globalAlpha = alpha;
    c.drawImage(im, cc[0], cc[1], cc[2], cc[3], X - h, Y - h, h * 2, h * 2); if (alpha !== 1) c.globalAlpha = 1;
    return true;
  }
  big2(c, key, x, y, half, alpha = 1) {
    const f = this.T.big && this.T.big[key]; if (!f) return;
    const im = this.img(f); if (!im.complete || !im.naturalWidth) return;
    const [X, Y] = this.P(x, y), h = half * this.view.s;
    if (!this.vis(X, Y, h + 40)) return;
    c.globalAlpha = alpha; c.drawImage(im, X - h, Y - h, h * 2, h * 2); c.globalAlpha = 1;
  }
  // Mitte (Klassenbild + Baumkrone) und alle Aufstiegs-Kreise – der eigene hell, die anderen gedimmt
  // Deinen Aufstieg (Bild + Punkte) in die Mitte des Baums verschieben – Bögen bleiben richtig, weil sie aus den Punkten berechnet werden
  ascMitte(k, own) {
    const key = own ? own.n : '';
    if (this._ascMitte === key) return;
    const N = this.T.nodes;
    if (this._ascVers) { for (const [id, dx, dy] of this._ascVers) { N[id].x += dx; N[id].y += dy; } }
    this._ascVers = [];
    if (own && k) {
      const dx = own.x - k.x, dy = own.y - k.y;
      for (const id in N) { const n = N[id]; if (n.as === own.n) { n.x -= dx; n.y -= dy; this._ascVers.push([id, dx, dy]); } }
    }
    this._ascMitte = key; this.dirty = true;
  }
  drawBg2(c) {
    const ch = (this.state && this.state.char) || {}, base = ch.base || '', asc = ch.cls || ch.class || ch.asc || '';
    const K = this.T.klassen || [], k = K.find(q => q.n === base) || K.find(q => (q.asc || []).some(a => a.n === asc));
    const own = k && (k.asc || []).find(a => a.n === asc);
    this.ascMitte(k, own);
    if (k) { this.big2(c, own ? own.img : k.img, k.x, k.y, own ? own.r : k.r, own ? 1 : .9); this.big2(c, 'BGTree', k.x, k.y, k.bg); }
    else this.big2(c, 'BGTree', 0, 0, 2000);
    // die anderen Aufstiege bleiben außen (gedimmt) – deiner sitzt in der Mitte
    for (const kk of K) for (const a of kk.asc || []) if (!own || a.n !== own.n) this.big2(c, a.img, a.x, a.y, a.r, .3);
  }
  // Klassennamen am Startpunkt als kleines Messingschild (wie die Beschriftungen im Spiel)
  klassenSchild(c, namen, X, Y, mine, ch) {
    if (!namen.length) return;
    const fs = Math.max(10, Math.min(15, 260 * this.view.s * .11));
    c.save();
    c.font = `600 ${fs}px Cinzel, "Spectral SC", Georgia, serif`;
    const txt = namen.map(x => x.toUpperCase());
    const w = Math.max(...txt.map(t => c.measureText(t).width)) + fs * 2.2, zh = fs * 1.35, h = zh * txt.length + fs * .7;
    const x0 = X - w / 2, y0 = Y;
    const g = c.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, mine ? 'rgba(52,40,22,.92)' : 'rgba(22,18,13,.85)'); g.addColorStop(1, mine ? 'rgba(28,21,12,.92)' : 'rgba(12,10,8,.85)');
    c.fillStyle = g; c.fillRect(x0, y0, w, h);
    c.strokeStyle = mine ? '#d9b871' : 'rgba(150,120,70,.55)'; c.lineWidth = 1; c.strokeRect(x0 + .5, y0 + .5, w - 1, h - 1);
    c.strokeStyle = mine ? 'rgba(217,184,113,.35)' : 'rgba(150,120,70,.2)'; c.strokeRect(x0 + 3.5, y0 + 3.5, w - 7, h - 7);
    // kleine Rauten an den Seiten
    c.fillStyle = mine ? '#e9cf8f' : 'rgba(170,140,90,.7)';
    for (const sx of [x0, x0 + w]) { c.beginPath(); c.moveTo(sx, y0 + h / 2 - 4); c.lineTo(sx + 4, y0 + h / 2); c.lineTo(sx, y0 + h / 2 + 4); c.lineTo(sx - 4, y0 + h / 2); c.closePath(); c.fill(); }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    txt.forEach((t, i) => {
      const meine = (ch.base || '').toUpperCase() === t;
      c.fillStyle = meine ? '#fff0c8' : mine ? '#e3c98d' : '#a8977a';
      c.fillText(t, X, y0 + fs * .35 + zh * (i + .5));
    });
    c.restore();
  }
  drawNode2(c, id, n, X, Y, s, on, want, fast, pulse, labels) {
    const asc = !!n.as, t = n.t;
    const ch = (this.state && this.state.char) || {};
    if (asc && (ch.cls || ch.class) && n.as !== (ch.cls || ch.class) && s === 'no') c.globalAlpha = .45;
    if (t === 's') {
      const mine = this.sets.have.has(id);
      this.spr2(c, 'fr', 'PSStartNodeBackgroundInactive', X, Y, 130, mine ? 1 : .6);

      c.globalAlpha = 1; return;
    }
    if (t === 'x') { this.spr2(c, 'fr', 'AscendancyMiddle', X, Y, 50); c.globalAlpha = 1; return; }
    // Größen wie in Path of Building PoE2 (halbe Breite in Baum-Einheiten)
    const icon = t === 'k' ? 82 : t === 'n' ? 54 : t === 'j' ? 0 : 37;
    const frame = t === 'k' ? 120 : t === 'j' ? 76 : t === 'n' ? (asc ? 100 : 80) : (asc ? 80 : 54);
    const fokus = this.plan && s === 'no' && !asc;
    if (fokus) c.globalAlpha = .55;
    const r = frame * this.view.s * .8;
    if ((want || s === 'rm') && (!fast || s === 'first')) {
      const g = c.createRadialGradient(X, Y, r * .3, X, Y, r * 2.1);
      const cc = s === 'rm' ? '207,75,63' : s === 'first' ? '240,160,80' : '106,165,149';
      g.addColorStop(0, `rgba(${cc},${s === 'first' ? .55 * pulse + .22 : .38})`); g.addColorStop(1, `rgba(${cc},0)`);
      c.fillStyle = g; c.beginPath(); c.arc(X, Y, r * 2.1, 0, 7); c.fill();
    }
    if (icon) {
      if (fast) this.spr2(c, on || want ? 'icA' : 'icI', n.ic, X, Y, icon);
      else { c.save(); c.beginPath(); c.arc(X, Y, icon * this.view.s * .98, 0, 7); c.clip(); this.spr2(c, on || want ? 'icA' : 'icI', n.ic, X, Y, icon); c.restore(); }
    }
    const fr = n.ov ? n.ov : t === 'k' ? ['KeystoneFrameUnallocated', 'KeystoneFrameAllocated', 'KeystoneFrameCanAllocate']
      : t === 'n' ? ['NotableFrameUnallocated', 'NotableFrameAllocated', 'NotableFrameCanAllocate']
      : t === 'j' ? ['JewelFrameUnallocated', 'JewelFrameAllocated', 'JewelFrameCanAllocate'] : ['PSSkillFrame', 'PSSkillFrameActive', 'PSSkillFrameHighlighted'];
    this.spr2(c, 'fr', on ? fr[1] : want ? fr[2] : fr[0], X, Y, frame);
    c.globalAlpha = 1;
    if (s === 'rm') { c.strokeStyle = '#cf4b3f'; c.lineWidth = 2.5; c.setLineDash([4, 3]); c.beginPath(); c.arc(X, Y, r * 1.05, 0, 7); c.stroke(); c.setLineDash([]); }
    if (s === 'first') { c.strokeStyle = `rgba(240,160,80,${.5 + .5 * pulse})`; c.lineWidth = 2; c.beginPath(); c.arc(X, Y, r * (1.12 + .08 * pulse), 0, 7); c.stroke(); }
    if (id === this.hover) { c.strokeStyle = '#fff3d6'; c.lineWidth = 1.5; c.beginPath(); c.arc(X, Y, r * 1.1, 0, 7); c.stroke(); }
    if ((t === 'n' || t === 'k') && (fast ? (s === 'first' || s === 'rm') : (s === 'first' || s === 'rm' || id === this.hover || this.view.s > .38))) labels.push([X, Y - r - 7, n.n, s]);
    this.ordnungsNummer(c, id, X, Y, r);
  }

  // Aufstiegsbaum oben rechts – im Stil des offiziellen Passive-Trees (Klassenbild, Rahmen, Verbindungen)
  drawAsc(c, W, H) {
    const A = this.asc; if (!A || this.opt.noAsc || W < 520) return;
    if (!this.ASCIMG && ASC.sheet) { this.ASCIMG = new Image(); this.ASCIMG.onload = () => { this.dirty = true; }; this.ASCIMG.src = ASC.sheet.url; }
    const cls = A.a.cls, ids = Object.keys(ASC.nodes).filter(k => ASC.nodes[k].a === cls && ASC.nodes[k].x != null);
    if (!ids.length) return;
    const R = Math.min(118, W * .14), cx = W - R - 18, cy = R + 18;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const id of ids) { const n = ASC.nodes[id]; x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, k = (R - 20) / Math.max(1, Math.hypot((x1 - x0) / 2, (y1 - y0) / 2));
    c.save();
    c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fillStyle = 'rgba(8,7,6,.92)'; c.fill();
    c.clip();
    const cc = ASC.classes[cls], im = this.ASCIMG;
    if (cc && cc.c && im && im.complete && im.naturalWidth) { c.globalAlpha = .55; c.drawImage(im, cc.c[0], cc.c[1], cc.c[2], cc.c[3], cx - R, cy - R, R * 2, R * 2); c.globalAlpha = 1; }
    const P = n => [cx + (n.x - mx) * k, cy + (n.y - my) * k];
    const st = id => A.a.list.find(x => x.id === id);
    for (const [a, b] of ASC.edges[cls] || []) {
      const na = ASC.nodes[a], nb = ASC.nodes[b];
      const sa = st(a), sb = st(b), haveA = (sa && sa.have) || na.st0, haveB = (sb && sb.have) || nb.st0;
      const planA = A.plan.has(a) || na.st0, planB = A.plan.has(b) || nb.st0;
      c.strokeStyle = haveA && haveB ? '#c99d55' : planA && planB ? '#6aa595' : 'rgba(90,78,58,.8)';
      c.lineWidth = haveA && haveB ? 3 : planA && planB ? 2.4 : 1.6;
      if (planA && planB && !(haveA && haveB)) c.setLineDash([5, 4]);
      c.beginPath(); const [x1, y1] = P(na), [x2, y2] = P(nb); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.setLineDash([]);
    }
    const S = ASC.skills, sk = this.IMG[S.f] || this.img(S.f);
    for (const id of ids) {
      const n = ASC.nodes[id], [x, y] = P(n), s = st(id), have = (s && s.have) || n.st0, plan = A.plan.has(id);
      const r = n.st0 ? 9 : n.nt ? 13 : 7.5;
      if (n.st0) { this.ascFrame(c, 'AscendancyMiddle', x, y, 13); continue; }
      if (n.c && sk.complete && sk.naturalWidth) {
        c.save(); c.beginPath(); c.arc(x, y, r * .8, 0, 7); c.clip();
        if (!have) c.filter = plan ? 'brightness(.85)' : 'grayscale(1) brightness(.45)';
        c.drawImage(sk, n.c[0], n.c[1], n.c[2], n.c[3], x - r, y - r, r * 2, r * 2); c.restore();
      }
      const fr = (n.nt ? 'AscendancyFrameLarge' : 'AscendancyFrameSmall') + (have ? 'Allocated' : plan ? 'CanAllocate' : 'Normal');
      if (!this.ascFrame(c, fr, x, y, r * 1.45)) { c.strokeStyle = have ? '#c99d55' : plan ? '#6aa595' : '#4a3f2e'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke(); }
      if (id === A.next) { c.strokeStyle = '#f0a050'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r + 5 + 1.5 * Math.sin(performance.now() / 300), 0, 7); c.stroke(); }
    }
    c.restore();
    c.strokeStyle = 'rgba(195,154,91,.7)'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,.8)'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, R + 1.5, 0, 7); c.stroke();
    c.textAlign = 'center'; c.font = '600 13px "Spectral SC", Georgia, serif';
    const label = (cc ? cc.name : cls) + '  ' + A.a.haveN + '/' + A.a.total;
    const w = c.measureText(label).width + 20;
    c.fillStyle = 'rgba(12,10,8,.95)'; c.fillRect(cx - w / 2, cy + R - 10, w, 20);
    c.fillStyle = '#c99d55'; c.fillRect(cx - w / 2, cy + R - 10, w, 1.5); c.fillRect(cx - w / 2, cy + R + 8.5, w, 1.5);
    c.fillStyle = '#ecd39d'; c.fillText(label, cx, cy + R + 4);
  }
  ascFrame(c, key, x, y, r) {
    const f = ASC.frames && ASC.frames[key], im = this.ASCIMG;
    if (!f || !im || !im.complete || !im.naturalWidth) return false;
    c.drawImage(im, f[0], f[1], f[2], f[3], x - r, y - r, r * 2, r * 2); return true;
  }

  // Übersichtskarte unten rechts: ganzer Tree, Plan und aktueller Ausschnitt
  drawMini(c, W, H) {
    if (this.opt.noMini || W < 520) return;
    const B = this.T.bounds, size = Math.min(170, W * .22), pad = 12;
    const sx = size / (B[2] - B[0]), sy = size / (B[3] - B[1]), k = Math.min(sx, sy);
    const mw = (B[2] - B[0]) * k, mh = (B[3] - B[1]) * k, x0 = W - mw - pad, y0 = H - mh - pad;
    this.mini = { x0, y0, k, B, mw, mh };
    if (!this.miniBase || this.miniBase.k !== k) {
      const o = document.createElement('canvas'); o.width = mw * 2; o.height = mh * 2; const oc = o.getContext('2d'); oc.scale(2, 2);
      oc.fillStyle = 'rgba(150,128,95,.55)';
      for (const id in this.N) { const n = this.N[id]; if (n.t === 'm') continue; oc.fillRect((n.x - B[0]) * k - .6, (n.y - B[1]) * k - .6, 1.2, 1.2); }
      this.miniBase = { k, o };
    }
    c.fillStyle = 'rgba(10,8,6,.82)'; c.fillRect(x0 - 6, y0 - 6, mw + 12, mh + 12);
    c.strokeStyle = 'rgba(195,154,91,.45)'; c.lineWidth = 1; c.strokeRect(x0 - 6.5, y0 - 6.5, mw + 13, mh + 13);
    c.drawImage(this.miniBase.o, x0, y0, mw, mh);
    const dot = (ids, col, r) => { c.fillStyle = col; for (const id of ids) { const n = this.N[id]; if (n) c.fillRect(x0 + (n.x - B[0]) * k - r / 2, y0 + (n.y - B[1]) * k - r / 2, r, r); } };
    dot(this.sets.have, '#c99d55', 1.8); dot(this.sets.next, '#6aa595', 2); dot(this.sets.remove, '#cf4b3f', 2.4); dot(this.sets.first, '#f0a050', 3);
    const v = this.view, vw = this.cv.clientWidth / v.s, vh = this.cv.clientHeight / v.s;
    const rx = x0 + (v.x - vw / 2 - B[0]) * k, ry = y0 + (v.y - vh / 2 - B[1]) * k;
    c.save(); c.beginPath(); c.rect(x0 - 6, y0 - 6, mw + 12, mh + 12); c.clip();
    c.strokeStyle = '#e6c992'; c.lineWidth = 1.2; c.strokeRect(rx, ry, vw * k, vh * k); c.restore();
  }
  rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  bind() {
    const cv = this.cv;
    cv.addEventListener('wheel', e => {
      e.preventDefault(); const f = Math.pow(1.0018, -Math.max(-300, Math.min(300, e.deltaY))), r = cv.getBoundingClientRect();
      const mx = e.clientX - r.left - cv.clientWidth / 2, my = e.clientY - r.top - cv.clientHeight / 2;
      const base = this.zt ? this.zt.s : this.view.s;
      this.zt = { s: Math.max(.012, Math.min(1.3, base * f)), mx, my }; this.vel = null; this.fly = null; this.bewegt();
    }, { passive: false });
    cv.addEventListener('pointerdown', e => {
      const m = this.mini, r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      if (m && mx > m.x0 - 6 && my > m.y0 - 6 && mx < m.x0 + m.mw + 6 && my < m.y0 + m.mh + 6) {
        this.view.x = m.B[0] + (mx - m.x0) / m.k; this.view.y = m.B[1] + (my - m.y0) / m.k; this.dirty = true; this.miniDrag = true; cv.setPointerCapture(e.pointerId); return;
      }
      this.vel = null; this.zt = null; this.fly = null;
      this.drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y, lx: e.clientX, ly: e.clientY, lt: performance.now(), sx: 0, sy: 0 }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      if (this.miniDrag) { const m = this.mini, r = cv.getBoundingClientRect(); this.view.x = m.B[0] + (e.clientX - r.left - m.x0) / m.k; this.view.y = m.B[1] + (e.clientY - r.top - m.y0) / m.k; this.dirty = true; return; }
      if (this.drag) {
        const d = this.drag, t = performance.now(), dt = Math.max(1, t - d.lt);
        d.sx = d.sx * .6 + (e.clientX - d.lx) / dt * .4; d.sy = d.sy * .6 + (e.clientY - d.ly) / dt * .4; d.lx = e.clientX; d.ly = e.clientY; d.lt = t;
        this.view.x = d.vx - (e.clientX - d.x) / this.view.s; this.view.y = d.vy - (e.clientY - d.y) / this.view.s; this.bewegt(); return;
      }
      const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      let best = null, bd = 1e9;
      for (const id in this.N) { const n = this.N[id]; if (n.t === 's') continue; const [X, Y] = this.P(n.x, n.y); const d = (X - mx) ** 2 + (Y - my) ** 2; if (d < bd) { bd = d; best = id; } }
      const hit = best && bd < ((this.p2 ? 60 : 42) * this.view.s + 8) ** 2 ? best : null;
      if (hit !== this.hover) { this.hover = hit; this.dirty = true; }
      if (!this.tip) return;
      if (hit) {
        const n = this.N[hit]; let st = n.st || [];
        if (n.t === 'm') { const m = this.plan && this.plan.mast.find(q => q.node === hit); st = m && n.me ? (n.me[m.effect] || []) : ['Mastery – Effekt im Spiel wählen']; }
        const s = this.st(hit);
        const tag = { have: ['geskillt', '#ecd39d'], first: ['als Nächstes', '#ffd2a3'], plan: ['geplant', '#b5ddd2'], rm: ['umskillen', '#f6b0a8'], no: ['', ''] }[s];
        this.tip.innerHTML = `<b>${App.esc(n.n)}</b>${tag[0] ? `<em style="color:${tag[1]}">${tag[0]}</em>` : ''}${st.map(x => `<div>${App.esc(x)}</div>`).join('')}`;
        this.tip.style.display = 'block';
        const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
        this.tip.style.left = Math.min(mx + 16, cv.clientWidth - tw - 8) + 'px';
        this.tip.style.top = Math.min(my + 16, cv.clientHeight - th - 8) + 'px';
      } else this.tip.style.display = 'none';
    });
    cv.addEventListener('pointerup', () => {
      const d = this.drag;
      if (d && performance.now() - d.lt < 80 && Math.hypot(d.sx, d.sy) > .15) this.vel = { x: d.sx, y: d.sy };
      this.drag = null; this.miniDrag = false; });
    cv.addEventListener('pointerleave', () => { if (this.tip) this.tip.style.display = 'none'; this.hover = null; this.dirty = true; });
    cv.addEventListener('dblclick', () => this.focusNext());
  }
}
