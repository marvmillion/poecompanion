// PoE Companion – Anleitung: alles Schritt für Schritt erklärt, mit deinen echten Tasten
function help(force) {
  const el = sec('help');
  const st = S.settings || {}, k = x => `<span class="kbd">${esc(App.keyShort(x) || '–')}</span>`;
  const key = 'help' + JSON.stringify([st.hotkeyItem, st.hotkeyHub, st.hotkeyToggle, st.hotkeyQuest, st.hotkeyQuestNext, st.hotkeyHideout, st.lang]);
  if (lastKey.help === key && !force) return; lastKey.help = key;
  const K = [[st.hotkeyHub || 'F9', 'Hub öffnen'], [st.hotkeyToggle || 'F8', 'Alle Overlays ein/aus'], [st.itemTrigger === 'copy' ? 'CTRL+C' : (st.hotkeyItem || 'ALT+C'), 'Item oder Map prüfen'],
    [st.hotkeyQuest || 'F6', 'Kampagnen-Overlay'], [st.hotkeyQuestNext || 'F4', 'Kampagne: Schritt erledigt'], [st.hotkeyQuestPrev || 'SHIFT+F4', 'Kampagne: Schritt zurück'],
    [st.hotkeyHideout || 'F5', 'Ins Hideout (/hideout)'], [st.hotkeyFarm || 'F7', 'Farming-Overlay'], [st.hotkeyTree || 'F10', 'Skilltree-Overlay'], ['CTRL+K', 'Schnellsuche im Hub']];
  const T = [
    ['start', 'Erste Schritte', 'flag', [
      ['Spiel richtig einstellen', 'In Path of Exile unter Optionen → Grafik den Modus <b>Windowed Fullscreen</b> wählen. Sonst liegen die Overlays hinter dem Spiel. Die Spielsprache muss <b>Englisch</b> sein.'],
      ['Profil anlegen', `Unter <a href="#profiles">Profile & Freunde</a> deinen Account-Namen mit #Nummer eintragen (oben rechts auf pathofexile.com) und deinen Charakter wählen. Das Profil muss öffentlich sein.`],
      ['Guide hinterlegen', 'Den pobb.in-Link deines Build-Guides ins Profil eintragen. Dann zeigt dir der Companion jeden nächsten Skillpunkt, fehlende Gems und die nächsten Item-Upgrades.'],
      ['Stash verbinden (optional)', `Für Stash-Wert und Farming brauchst du deine POESESSID. Sie steht unter <a href="#stash">Stash & Farming</a> → Einstellungen. Sie bleibt nur auf deinem PC.`]]],
    ['item', 'Item-Check', 'item', [
      ['Item prüfen', `Im Spiel mit der Maus über ein Item fahren und ${k(st.hotkeyItem || 'ALT+C')} drücken. Das Popup zeigt, wie viel DPS und eHP du in jedem passenden Slot gewinnst oder verlierst.`],
      ['Preis', 'Darunter steht der <b>geschätzte Wert</b> und die ähnlichsten Angebote der Trade-Seite. „sicher“, „grob“ oder „unsicher“ sagt dir, wie verlässlich die Schätzung ist.'],
      ['Gezielt suchen', 'Unter „Suche anpassen“ hakst du nur die Mods an, die dir wichtig sind – z. B. nur Leben und Stärke – und auf Wunsch die Basis.'],
      ['Magic und Rare', 'Bei blauen und gelben Items siehst du, wie viele Präfixe und Suffixe frei sind und welche Mods dort am wahrscheinlichsten landen.']]],
    ['craft', 'Crafting (PoE 2)', 'bolt', [
      ['Basis und Wünsche', 'Unter <a href="#craft">Crafting</a> die Basis eintippen (z. B. „Azure Amulet“ oder „Emerald“ für Juwelen) und die gewünschten Mods anklicken. „Für meinen Build vorschlagen“ wählt die Mods, die laut Path of Building am meisten bringen.'],
      ['Community-Weg', 'Der Plan folgt dem Ablauf der Guides: Alchemy → schwersten Mod zuerst (Chaos oder Exalted + Omen) → absichern (Fracturing) → Müll entfernen → Essenz → restliche Mods mit Seiten-Omen → Abyss → Werte veredeln. Mit und ohne Fracturing wird durchgerechnet, der günstigere Weg steht oben.'],
      ['Was jetzt?', 'Jeder Schritt sagt dir, was du bei Erfolg tust und was bei einem Fehlschlag – z. B. wenn der Fracturing Orb den falschen Mod trifft. Rechts siehst du, wie dein Item danach aussieht (Prefix- und Suffix-Plätze).'],
      ['Eigenes Item', `Mit der Maus über ein Item im Spiel und ${k(st.hotkeyCraft || 'ALT+X')} drücken – der Berater übernimmt Basis und Mods und sagt dir, was bleiben und was weg soll.`]]],
    ['maps', 'Map-Check', 'map', [
      ['Map prüfen', `Gleiche Taste ${k(st.hotkeyItem || 'ALT+C')} über einer Map. Rot heißt: für deinen Build gefährlich.`],
      ['Regeln festlegen', 'Unter <a href="#maps">Map-Check</a> stellst du für jeden Mod ein: <b>Ausblenden</b>, <b>Warnen</b> oder <b>Egal</b>. „Empfohlen für deinen Build“ füllt alles passend vor.'],
      ['Suchtext nutzen', 'Den Suchtext kopieren, im Stash <span class="kbd">Strg</span>+<span class="kbd">F</span> drücken und einfügen – Maps mit schlechten Mods verschwinden aus der Ansicht.']]],
    ['quest', 'Kampagne', 'flag', [
      ['Overlay öffnen', `${k(st.hotkeyQuest || 'F6')} zeigt den aktuellen Schritt über dem Spiel.`],
      ['Läuft von selbst', 'Der Companion liest das Spiel-Log: neues Gebiet, Boss-Dialog oder Quest-Abgabe schalten automatisch weiter.'],
      ['Per Taste weiter', `Alles andere hakst du mit ${k(st.hotkeyQuestNext || 'F4')} ab, ${k(st.hotkeyQuestPrev || 'SHIFT+F4')} geht zurück.`],
      ['XP-Anzeige', 'Grün: volle Erfahrung. Orange oder rot: du bist zu hoch oder zu niedrig für das Gebiet – weiterziehen.']]],
    ['tree', 'Skilltree und Gems', 'tree', [
      ['Nächste Punkte', `Unter <a href="#tree">Skilltree</a> siehst du deinen Baum und die nächsten Punkte in der richtigen Reihenfolge. ${k(st.hotkeyTree || 'F10')} zeigt das kleine Tree-Overlay.`],
      ['Stufe wählen', 'Oben wählst du die Stufe deines Guides, z. B. „Act 1-3“ oder „Endgame“.'],
      ['Gems', 'Unter <a href="#level">Gems</a> stehen deine Setups und eine Einkaufsliste mit Akt und Händler. Maus über ein Gem zeigt Herkunft und Werte von Level 1 bis 20.']]],
    ['timeless', 'Timeless-Juwelen', 'gem', [
      ['Seed ansehen', 'Juwel und Sockel wählen, die Zahl vom Juwel eingeben – du siehst, was aus jedem Punkt im Radius wird.'],
      ['Seed finden', 'Gewünschte Effekte anklicken, z. B. „Double Damage“, und suchen lassen. Die besten Seeds stehen oben.']]],
    ['stash', 'Stash und Farming', 'coin', [
      ['Session starten', `Vor dem Farmen „Session starten“ drücken oder ${k(st.hotkeyFarm || 'F7')} fürs Overlay. Der Companion rechnet regelmäßig nach, was du verdient und ausgegeben hast.`],
      ['Strategien', 'Lege Farmstrategien an und starte Sessions damit – so siehst du, welche dir pro Stunde am meisten bringt.'],
      ['Handel & Börse', 'Für Hideout-Warrior: Handels-Session, Positionen für Spekulation und Kurse mit 7-Tage-Verlauf.']]],
    ['ov', 'Overlays anpassen', 'eye', [
      ['Verschieben und Größe', 'Overlays an der Kopfzeile ziehen. Die Größe änderst du am Griff unten rechts.'],
      ['Ein- und ausblenden', `${k(st.hotkeyToggle || 'F8')} blendet alle Overlays aus und wieder ein.`],
      ['Aussehen', 'Deckkraft, Größe und Sprache stellst du unter <a href="#settings">Einstellungen</a> ein.'],
      ['Ins Hideout', `${k(st.hotkeyHideout || 'F5')} schreibt /hideout in den Chat. Zwei eigene Chat-Befehle kannst du in den Einstellungen festlegen.`]]],
    ['hilfe', 'Wenn etwas nicht klappt', 'warn', [
      ['Overlays liegen hinter dem Spiel', 'Im Spiel auf <b>Windowed Fullscreen</b> umstellen.'],
      ['Item-Check reagiert nicht', 'Taste in den Einstellungen prüfen – manche Tasten belegt das Spiel selbst. Mit „Taste drücken“ kannst du jede Taste oder eine Maus-Seitentaste wählen.'],
      ['Charakter lädt nicht', 'Auf pathofexile.com unter Privacy Settings „Hide Characters“ ausschalten und im Hub „Aktualisieren“ drücken.'],
      ['Stash zeigt nichts', 'Die POESESSID läuft nach einiger Zeit ab. Neu eintragen unter Stash & Farming → Einstellungen.'],
      ['Ein Fenster ist verschwunden', 'Einstellungen → „Fenster verloren?“ → Zurücksetzen.']]],
  ];
  el.innerHTML = `<div class="ph"><div><h1>Anleitung</h1><div class="sub">Alles, was der Companion kann – kurz erklärt, mit deinen aktuellen Tasten.</div></div></div>
    <div class="hl-grid"><div class="card pad hl-keys frame"><h3>Deine Tasten</h3>${K.map(([a, b]) => `<div class="hl-k">${k(a)}<span>${esc(b)}</span></div>`).join('')}<a class="btn small ghost" href="#settings" style="margin-top:12px">Tasten ändern</a></div>
      <div class="hl-toc">${T.map(t => `<a href="#" data-hl="${t[0]}">${icon(t[2], 16)}<span>${esc(t[1])}</span></a>`).join('')}</div></div>
    ${T.map(t => `<div class="card pad hl-sec" id="hl-${t[0]}"><h3>${icon(t[2], 16)} ${esc(t[1])}</h3><ol class="hl-steps">${t[3].map(([a, b]) => `<li><b>${esc(a)}</b><div>${b}</div></li>`).join('')}</ol></div>`).join('')}`;
  el.querySelectorAll('[data-hl]').forEach(a => a.onclick = e => { e.preventDefault(); const z = document.getElementById('hl-' + a.dataset.hl); if (z) z.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}
