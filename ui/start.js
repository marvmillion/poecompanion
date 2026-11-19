// Feedback-Knopf, Beta-/Update-Hinweise, GGG-Hinweis und Einrichtung beim ersten Start
(() => {
  const { api, esc, toast, icon } = App;
  let ST = null, wizSeite = 0, wizOffen = false, fbOffen = false;

  // ---------- Feedback (immer sichtbar, in jeder Ansicht)
  const knopf = document.createElement('button');
  knopf.id = 'fbbtn'; knopf.className = 'fb-btn'; knopf.title = 'Feedback senden: Fehler, Idee oder Lob';
  knopf.innerHTML = `${icon('chat', 16)}<span>Feedback</span>`;
  knopf.onclick = () => feedback();
  document.body.appendChild(knopf);

  function modal(html, cls) {
    const m = document.createElement('div');
    m.className = 'mo-bg'; m.innerHTML = `<div class="mo ${cls || ''}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(m);
    return m;
  }

  function feedback() {
    if (fbOffen) return; fbOffen = true;
    const A = (ST && ST.app) || {}, bereich = location.hash.slice(1) || 'home';
    const m = modal(`<div class="mo-h"><h3>Feedback</h3><button class="mo-x" aria-label="Schließen">×</button></div>
      <p class="mo-t">Was soll besser werden? Jede Nachricht kommt direkt beim Entwickler an${A.discord ? ` (Discord: <b>${esc(A.discord)}</b>)` : ''}.</p>
      <div class="fb-art">${[['fehler', 'Fehler'], ['idee', 'Idee / Wunsch'], ['lob', 'Lob']].map(([k, l], i) => `<label><input type="radio" name="fbart" value="${k}" ${i === 1 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <textarea id="fbtext" rows="6" placeholder="Beschreib kurz, was passiert ist oder was du dir wünschst …"></textarea>
      <div class="fb-z"><input id="fbkontakt" placeholder="Dein Discord-Name (optional, für Rückfragen)" autocomplete="off">
        <label class="fb-log"><input type="checkbox" id="fblog"><span>Letzte Log-Zeilen anhängen (hilft bei Fehlern)</span></label></div>
      <div class="mo-f"><span class="muted">Bereich: ${esc(bereich)} · Version ${esc(A.version || '')}</span><button class="btn primary" id="fbsend">Senden</button></div>`);
    const zu = () => { m.remove(); fbOffen = false; };
    m.querySelector('.mo-x').onclick = zu;
    m.onclick = e => { if (e.target === m) zu(); };
    m.querySelector('#fbtext').focus();
    m.querySelector('#fbsend').onclick = async () => {
      const b = { text: m.querySelector('#fbtext').value, kontakt: m.querySelector('#fbkontakt').value, log: m.querySelector('#fblog').checked,
                  art: (m.querySelector('input[name=fbart]:checked') || {}).value, bereich };
      const r = await api('/api/feedback', b).catch(() => ({ ok: false, error: 'Keine Verbindung zum Companion.' }));
      if (r.ok) { zu(); toast('Danke! Dein Feedback ist angekommen.'); return; }
      if (r.offline) {
        try { await navigator.clipboard.writeText(b.text); } catch (e) {}
        toast(r.discord ? `Senden ist noch nicht eingerichtet – Text kopiert. Schick ihn auf Discord an <b>${esc(r.discord)}</b>` : 'Senden ist noch nicht eingerichtet – Text kopiert.', 6000); zu(); return;
      }
      toast(esc(r.error || 'Senden fehlgeschlagen.'), 6000);
    };
  }

  // ---------- Hinweise oben (Beta, Update) und GGG-Hinweis unten in der Seitenleiste
  function hinweise() {
    const A = ST.app || {}, set = ST.settings || {};
    let leiste = document.getElementById('topinfo');
    if (!leiste) { leiste = document.createElement('div'); leiste.id = 'topinfo'; document.getElementById('main').prepend(leiste); }
    const teile = [];
    if (A.update && A.update.neu) teile.push(`<div class="ti ti-up">${icon('bolt', 15)}<span><b>Version ${esc(A.update.version)} ist da.</b> ${A.exe ? 'Mit einem Klick installieren – der Companion startet danach neu.' : 'Lade sie auf der Release-Seite herunter.'}</span>
      <button class="btn small primary" id="upgo" ${A.update.laedt ? 'disabled' : ''}>${A.update.laedt ? 'Lädt …' : A.exe ? 'Jetzt aktualisieren' : 'Zur Release-Seite'}</button></div>`);
    if (set.betaGesehen !== A.version) teile.push(`<div class="ti ti-beta">${icon('info', 15)}<span><b>Beta – der Companion ist noch im Aufbau.</b> Manches kann noch haken. Über den Knopf <b>Feedback</b> unten rechts landet jede Rückmeldung direkt beim Entwickler${A.discord ? `, oder schreib auf Discord an <b>${esc(A.discord)}</b>` : ''}.</span><button class="mo-x" id="betazu" aria-label="Ausblenden">×</button></div>`);
    const html = teile.join('');
    if (leiste.innerHTML !== html) leiste.innerHTML = html;
    const up = document.getElementById('upgo');
    if (up) up.onclick = () => { up.disabled = true; api('/api/update', {}).then(r => { if (r && r.error) toast(esc(r.error), 6000); }); };
    const bz = document.getElementById('betazu');
    if (bz) bz.onclick = () => api('/api/settings', { betaGesehen: A.version });
    const foot = document.querySelector('.side-foot');
    if (foot && !document.getElementById('gggh')) {
      const d = document.createElement('div'); d.id = 'gggh'; d.className = 'ggg-h';
      d.innerHTML = `Beta ${esc(A.version || '')} · Fan-Projekt, nicht mit Grinding Gear Games verbunden`;
      d.title = A.hinweis || ''; foot.appendChild(d);
    }
  }

  // ---------- Einrichtung beim ersten Start
  const SEITEN = [
    A => `<h3>Willkommen beim PoE Companion</h3>
      <p class="mo-t">Dein Begleiter für Path of Exile 1 und 2: Preis-Check per Taste, Skilltree-Overlay, Leveling-Hilfe, Crafting-Berater, Upgrades aus Path of Building und Stash-Wert.</p>
      <div class="wz-box beta">${icon('info', 16)}<div><b>Beta – noch im Aufbau.</b> Wenn etwas hakt oder du eine Idee hast: unten rechts auf <b>Feedback</b>${A.discord ? ` oder auf Discord an <b>${esc(A.discord)}</b>` : ''}.</div></div>
      <p class="wz-ggg">${esc(A.hinweis || '')}</p>`,
    (A, s) => `<h3>Sprache und Spiel</h3>
      <div class="wz-g"><label>Sprache<select id="wzlang"><option value="de" ${s.lang === 'de' ? 'selected' : ''}>Deutsch</option><option value="en" ${s.lang === 'en' ? 'selected' : ''}>English</option></select></label></div>
      <div class="wz-box">${icon('warn', 16)}<div><b>Wichtig im Spiel:</b><ul><li>Anzeigemodus <b>Windowed Fullscreen</b> (Fenster-Vollbild) – sonst liegen die Overlays hinter dem Spiel.</li><li>Spielsprache <b>Englisch</b> – Path of Building versteht nur englische Item-Texte.</li><li>Für deine Charaktere: PoE-Profil auf <b>öffentlich</b> stellen (pathofexile.com → Privacy Settings).</li></ul></div></div>`,
    (A, s) => `<h3>Die wichtigsten Tasten</h3>
      <table class="wz-t">${[['hotkeyItem', 'Preis-Check für das Item unter der Maus'], ['hotkeyCraft', 'Item in den Crafting-Berater schicken'], ['hotkeyHub', 'Dieses Fenster öffnen'], ['hotkeyTree', 'Skilltree-Overlay ein/aus'], ['hotkeyQuest', 'Leveling-Overlay ein/aus'], ['hotkeyToggle', 'Alle Overlays ein/aus'], ['hotkeyHideout', '/hideout in den Chat']].map(([k, l]) => `<tr><td><kbd>${esc(App.keyName ? App.keyName(s[k]) : s[k] || '–')}</kbd></td><td>${l}</td></tr>`).join('')}</table>
      <p class="mo-t muted">Jede Taste löst genau eine Aktion aus – so wie es Grinding Gear Games für Hilfsprogramme erlaubt. Ändern kannst du alles unter <b>Einstellungen</b>.</p>`,
    (A, s) => `<h3>Dein Charakter</h3>
      <p class="mo-t">Leg unter <b>Profile</b> ein Profil an – entweder mit deinem Account (<i>Name#1234</i>, dann lädt der Companion deine Charaktere) oder mit einem Path-of-Building-Link (pobb.in / poe.ninja).</p>
      <p class="mo-t">Beim ersten Laden holt sich der Companion einmalig <b>Path of Building</b> (ca. 650 MB). Das dauert je nach Leitung ein paar Minuten.</p>`,
    (A, s) => `<h3>Datenschutz</h3>
      <p class="mo-t">Damit der Entwickler sieht, wie viele den Companion nutzen, meldet er sich höchstens einmal am Tag mit einer <b>zufälligen Nummer</b>, der Version, dem Spiel und der Sprache. Keine Namen, keine Accounts, keine Dateien.</p>
      <label class="wz-ck"><input type="checkbox" id="wztel" ${s.telemetry !== false ? 'checked' : ''}><span>Anonym mitzählen (jederzeit in den Einstellungen abschaltbar)</span></label>
      <p class="mo-t muted">Feedback wird nur gesendet, wenn du es selbst abschickst. Deine POESESSID bleibt immer nur auf deinem PC.</p>`,
  ];

  function wizard() {
    if (wizOffen) return; wizOffen = true; wizSeite = 0;
    const m = modal('', 'wz');
    const zeichne = () => {
      const A = ST.app || {}, s = ST.settings || {};
      m.querySelector('.mo').innerHTML = `<div class="wz-p">${SEITEN.map((_, i) => `<i class="${i <= wizSeite ? 'on' : ''}"></i>`).join('')}</div>
        <div class="wz-c">${SEITEN[wizSeite](A, s)}</div>
        <div class="mo-f"><button class="btn ghost" id="wzback" ${wizSeite ? '' : 'style="visibility:hidden"'}>Zurück</button>
        <button class="btn primary" id="wznext">${wizSeite === SEITEN.length - 1 ? 'Los geht’s – Profil anlegen' : 'Weiter'}</button></div>`;
      const lang = m.querySelector('#wzlang'); if (lang) lang.onchange = () => api('/api/settings', { lang: lang.value });
      const tel = m.querySelector('#wztel'); if (tel) tel.onchange = () => api('/api/settings', { telemetry: tel.checked });
      m.querySelector('#wzback').onclick = () => { wizSeite = Math.max(0, wizSeite - 1); zeichne(); };
      m.querySelector('#wznext').onclick = async () => {
        if (wizSeite < SEITEN.length - 1) { wizSeite++; zeichne(); return; }
        await api('/api/settings', { erststart: false });
        m.remove(); wizOffen = false; location.hash = 'profiles';
      };
    };
    zeichne();
  }
  window.Einrichtung = { oeffnen: () => wizard(), feedback };

  App.on(s => {
    if (!s) return; ST = s;
    hinweise();
    if (s.settings && s.settings.erststart && !wizOffen) wizard();
  });
})();
