// PoE Companion – Zähler, Feedback und privates Dashboard (Cloudflare Worker + KV)
// Einrichtung: siehe ../VEROEFFENTLICHEN.md, Abschnitt „Zähler und Feedback“.
// Bindings: KV-Namespace PC · Secrets: STATS_KEY (dein Passwort fürs Dashboard), DISCORD_WEBHOOK (optional) · Variable: REPO (z. B. name/poe-companion)

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' } });
const tag = (d = new Date()) => d.toISOString().slice(0, 10);
const monat = (d = new Date()) => d.toISOString().slice(0, 7);
const sauber = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n);

async function zaehle(env, key, art) {
  const z = JSON.parse((await env.PC.get(key)) || '{"n":0,"spiel":{},"v":{},"lang":{}}');
  z.n++;
  for (const [k, v] of Object.entries(art)) z[k][v] = (z[k][v] || 0) + 1;
  await env.PC.put(key, JSON.stringify(z));
}

async function ping(req, env) {
  const b = await req.json().catch(() => ({}));
  const id = sauber(b.id, 40);
  if (!/^[0-9a-f]{32}$/.test(id)) return json({ ok: false }, 400);
  const art = { spiel: b.spiel === 'poe2' ? 'poe2' : 'poe1', v: sauber(b.v, 12) || '?', lang: b.lang === 'en' ? 'en' : 'de' };
  const t = tag(), m = monat();
  if (!(await env.PC.get(`s:${t}:${id}`))) {
    await env.PC.put(`s:${t}:${id}`, '1', { expirationTtl: 3 * 86400 });
    await zaehle(env, `tag:${t}`, art);
  }
  if (!(await env.PC.get(`sm:${m}:${id}`))) {
    await env.PC.put(`sm:${m}:${id}`, '1', { expirationTtl: 40 * 86400 });
    await zaehle(env, `monat:${m}`, art);
  }
  if (!(await env.PC.get(`i:${id}`))) {
    await env.PC.put(`i:${id}`, t);
    await env.PC.put('installs', String(Number((await env.PC.get('installs')) || 0) + 1));
  }
  return json({ ok: true });
}

async function feedback(req, env) {
  const b = await req.json().catch(() => ({}));
  const id = sauber(b.id, 40), text = sauber(b.text, 4000).trim();
  if (!/^[0-9a-f]{32}$/.test(id) || text.length < 3) return json({ ok: false }, 400);
  const lim = `fl:${tag()}:${id}`, n = Number((await env.PC.get(lim)) || 0);
  if (n >= 10) return json({ ok: false, error: 'Zu viele Nachrichten heute' }, 429);
  await env.PC.put(lim, String(n + 1), { expirationTtl: 2 * 86400 });
  const fb = { t: new Date().toISOString(), art: sauber(b.art, 20), text, kontakt: sauber(b.kontakt, 100), bereich: sauber(b.bereich, 40),
               v: sauber(b.v, 12), spiel: sauber(b.spiel, 8), lang: sauber(b.lang, 4), log: sauber(b.log, 6000) };
  await env.PC.put(`fb:${Date.now()}:${id.slice(0, 6)}`, JSON.stringify(fb), { expirationTtl: 365 * 86400 });
  if (env.DISCORD_WEBHOOK) {
    const art = { fehler: '🐞 Fehler', idee: '💡 Idee', lob: '⭐ Lob' }[fb.art] || fb.art;
    const content = `**${art}** · v${fb.v} · ${fb.spiel} · ${fb.bereich}${fb.kontakt ? ' · von ' + fb.kontakt : ''}\n${text}`.slice(0, 1900);
    const body = { content, allowed_mentions: { parse: [] } };
    if (fb.log) body.content += '\n(Log im Dashboard)';
    await fetch(env.DISCORD_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  }
  return json({ ok: true });
}

async function stats(env) {
  const tage = [], heute = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(heute.getTime() - i * 86400000), k = tag(d);
    tage.push({ tag: k, ...(JSON.parse((await env.PC.get(`tag:${k}`)) || 'null') || { n: 0 }) });
  }
  const monate = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth() - i, 1)), k = monat(d);
    monate.push({ monat: k, ...(JSON.parse((await env.PC.get(`monat:${k}`)) || 'null') || { n: 0 }) });
  }
  const fbList = await env.PC.list({ prefix: 'fb:' });
  const fbs = [];
  for (const k of fbList.keys.slice(-50).reverse()) fbs.push(JSON.parse((await env.PC.get(k.name)) || '{}'));
  return { installs: Number((await env.PC.get('installs')) || 0), tage, monate, feedback: fbs, repo: env.REPO || '' };
}

const DASH = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PoE Companion · Zahlen</title>
<style>:root{--bg:#120e09;--p:#1c160f;--l:#4a3b24;--g:#c9a24a;--t:#e9dcc0;--d:#9d8f74}body{margin:0;background:var(--bg);color:var(--t);font:15px/1.5 Georgia,serif;padding:16px}
main{max-width:980px;margin:auto}h1{font-weight:600;color:var(--g);margin:6px 0 16px}h2{font-size:17px;color:var(--g);margin:0 0 10px}
.k{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:16px}.k div{background:var(--p);border:1px solid var(--l);padding:12px 14px}
.k span{display:block;color:var(--d);font-size:13px}.k b{font-size:28px}.c{background:var(--p);border:1px solid var(--l);padding:14px;margin-bottom:16px;overflow-x:auto}
.bars{display:flex;align-items:flex-end;gap:3px;height:140px}.bars i{flex:1;background:var(--g);min-height:1px;position:relative}.bars i:hover{background:#e8c66a}
.ax{display:flex;justify-content:space-between;color:var(--d);font-size:12px;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:14px}
td,th{padding:6px 8px;border-bottom:1px solid #2e2518;text-align:left;vertical-align:top}th{color:var(--d);font-weight:600}pre{white-space:pre-wrap;font-size:11px;color:var(--d);max-height:160px;overflow:auto}
</style></head><body><main><h1>PoE Companion · Zahlen</h1><div id="x">Lädt …</div></main><script>
const key=new URLSearchParams(location.search).get('key');const e=s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
fetch('stats?key='+encodeURIComponent(key)).then(r=>r.json()).then(async d=>{if(!d.tage){x.textContent='Kein Zugriff.';return}
let dl=0,rel=[];if(d.repo){try{rel=await (await fetch('https://api.github.com/repos/'+d.repo+'/releases')).json();for(const r of rel)for(const a of r.assets||[])dl+=a.download_count}catch(err){}}
const h=d.tage[d.tage.length-1]||{n:0},m=d.monate[d.monate.length-1]||{n:0},mx=Math.max(1,...d.tage.map(t=>t.n));
const sp=o=>Object.entries(o||{}).map(([k,v])=>e(k)+': '+v).join(' · ')||'–';
x.innerHTML='<div class="k"><div><span>Heute aktiv</span><b>'+h.n+'</b></div><div><span>Diesen Monat aktiv</span><b>'+m.n+'</b></div><div><span>Installationen gesamt</span><b>'+d.installs+'</b></div><div><span>Downloads (GitHub)</span><b>'+(d.repo?dl:'–')+'</b></div></div>'
+'<div class="c"><h2>Aktive Nutzer pro Tag (30 Tage)</h2><div class="bars">'+d.tage.map(t=>'<i style="height:'+(t.n/mx*100)+'%" title="'+t.tag+': '+t.n+'"></i>').join('')+'</div><div class="ax"><span>'+d.tage[0].tag+'</span><span>'+h.tag+'</span></div>'
+'<p style="color:var(--d);font-size:13px">Heute: '+sp(h.spiel)+' · Versionen '+sp(h.v)+' · Sprache '+sp(h.lang)+'</p></div>'
+'<div class="c"><h2>Monate</h2><table><tr><th>Monat</th><th>Aktiv</th><th>Spiel</th><th>Versionen</th></tr>'+d.monate.map(t=>'<tr><td>'+t.monat+'</td><td>'+t.n+'</td><td>'+sp(t.spiel)+'</td><td>'+sp(t.v)+'</td></tr>').join('')+'</table></div>'
+(rel.length?'<div class="c"><h2>Downloads je Version</h2><table>'+rel.map(r=>'<tr><td>'+e(r.tag_name)+'</td><td>'+(r.assets||[]).reduce((a,b)=>a+b.download_count,0)+'</td></tr>').join('')+'</table></div>':'')
+'<div class="c"><h2>Feedback (neueste 50)</h2><table><tr><th>Wann</th><th>Art</th><th>Nachricht</th></tr>'+d.feedback.map(f=>'<tr><td>'+e((f.t||'').slice(0,16).replace('T',' '))+'<br><small>v'+e(f.v)+' · '+e(f.spiel)+'</small></td><td>'+e(f.art)+'<br><small>'+e(f.bereich)+'</small></td><td>'+e(f.text)+(f.kontakt?'<br><small>von '+e(f.kontakt)+'</small>':'')+(f.log?'<pre>'+e(f.log)+'</pre>':'')+'</td></tr>').join('')+'</table></div>';
}).catch(()=>x.textContent='Fehler beim Laden.');</script></body></html>`;

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' } });
    if (req.method === 'POST' && u.pathname === '/ping') return ping(req, env);
    if (req.method === 'POST' && u.pathname === '/feedback') return feedback(req, env);
    const erlaubt = env.STATS_KEY && u.searchParams.get('key') === env.STATS_KEY;
    if (u.pathname === '/stats') return erlaubt ? json(await stats(env)) : json({ error: 'kein Zugriff' }, 403);
    if (u.pathname === '/dashboard') return erlaubt ? new Response(DASH, { headers: { 'content-type': 'text/html; charset=utf-8' } }) : new Response('Kein Zugriff', { status: 403 });
    return new Response('PoE Companion', { status: 200 });
  },
};
