# PoE Companion veröffentlichen – Schritt für Schritt

Alles ist vorbereitet. Du brauchst nur zwei kostenlose Konten (GitHub, Cloudflare) und etwa 30 Minuten.

---

## 1. Deine Angaben eintragen (2 Minuten)
Datei **`app_info.py`** öffnen (Rechtsklick → Bearbeiten) und eintragen:
- `DISCORD = '...'` → dein Discord-Name (erscheint im Programm für Feedback und als Kontakt gegenüber GGG).
- `DIENST = '...'` → kommt aus Schritt 3 (erst mal leer lassen).
- `REPO` musst du **nicht** eintragen – das macht GitHub beim Bauen automatisch.

---

## 2. GitHub: Konto, Repository, erste Version (15 Minuten)
1. Konto anlegen auf **github.com** (kostenlos). Tipp: Benutzername = so, wie das Projekt heißen soll.
2. **GitHub Desktop** installieren (desktop.github.com) und dich anmelden.
3. In GitHub Desktop: *File → Add local repository* → den Ordner mit dem Companion-Quelltext wählen
   (den Ordner, den ich dir als ZIP gegeben habe – **nicht** deinen Spiel-Ordner mit `data`).
   Es fragt „create a repository?“ → **Ja**. Name: `poe-companion`.
4. Unten links Zusammenfassung „Erste Version“ → **Commit to main** → oben **Publish repository**.
   Haken bei „Keep this code private“ **raus** (die AGPL-Lizenz verlangt offenen Quelltext).
5. Erste Version bauen lassen: auf github.com in deinem Repository → **Releases** → *Draft a new release*
   → *Choose a tag* → `v1.2.0` eintippen → *Create new tag* → Titel „PoE Companion 1.2.0 (Beta)“ → **Publish release**.
6. Nach ca. 5 Minuten (Reiter **Actions** zeigt den Fortschritt) hängt an der Release die Datei **`PoE-Companion.exe`**.
   Das ist der Download für alle. Link zum Teilen: `https://github.com/DEINNAME/poe-companion/releases/latest`

**Neue Version später:** Dateien ändern → in GitHub Desktop *Commit* + *Push* → neue Release mit höherem Tag (z. B. `v1.2.1`).
Alle Nutzer sehen dann im Programm „Version 1.2.1 ist da – Jetzt aktualisieren“.

---

## 3. Zähler und Feedback: Cloudflare Worker (10 Minuten, ohne Programmieren)
1. Konto auf **dash.cloudflare.com** anlegen (kostenlos, keine Kreditkarte nötig).
2. Links **Storage & Databases → Workers KV** → *Create* → Name `PC`.
3. Links **Workers & Pages** → *Create* → *Create Worker* → Name `poe-companion` → *Deploy*.
   Danach *Edit code* → den kompletten Inhalt von **`worker/worker.js`** einfügen (alten Code ersetzen) → *Deploy*.
4. Im Worker → **Settings → Bindings** → *Add* → *KV namespace* → Variable name `PC` → Namespace `PC` wählen.
5. **Settings → Variables and Secrets** → *Add*:
   - `STATS_KEY` (Typ *Secret*) → ein langes Passwort, nur für dich (z. B. 20 zufällige Zeichen).
   - `REPO` (Typ *Text*) → `DEINNAME/poe-companion` (für die Download-Zahlen).
   - `DISCORD_WEBHOOK` (Typ *Secret*, optional, siehe 4.).
6. Oben steht die Adresse deines Workers, z. B. `https://poe-companion.DEINNAME.workers.dev`.
   Diese in **`app_info.py`** bei `DIENST = '...'` eintragen → committen → neue Release (Schritt 2.5 mit neuem Tag).

**Deine Zahlen ansehen:** `https://poe-companion.DEINNAME.workers.dev/dashboard?key=DEIN_STATS_KEY`
→ heute/monatlich aktive Nutzer, Installationen, Downloads je Version, PoE 1/2, Versionen und alle Feedbacks.
Lesezeichen setzen – den Link nicht teilen (der Key ist dein Passwort).

---

## 4. Feedback direkt in deinen Discord (5 Minuten, empfohlen)
1. Eigenen Discord-Server anlegen (oder einen vorhandenen nehmen) → Kanal `#companion-feedback`.
2. Kanal-Einstellungen → **Integrationen → Webhooks → Neuer Webhook** → *Webhook-URL kopieren*.
3. In Cloudflare beim Worker als Secret `DISCORD_WEBHOOK` eintragen (Schritt 3.5).
Ab dann landet jedes Feedback sofort als Nachricht in diesem Kanal. Gleichzeitig steht alles im Dashboard.

---

## 5. Vor dem öffentlichen Post kurz prüfen
- [ ] `PoE-Companion.exe` auf einem PC **ohne Python** starten (Freund/Laptop): Einrichtung erscheint, Profil anlegen klappt.
- [ ] Feedback-Knopf testen → Nachricht kommt im Discord/Dashboard an.
- [ ] Dashboard zeigt „Heute aktiv: 1“.
- [ ] Preis-Check (Alt+C) und Overlays im Spiel testen.

## 6. Bekannt machen
Siehe die Tipps im Chat: Reddit (r/PathOfExile2, r/pathofexile – mit kurzem Video/GIF), Wiki-Tool-Listen, deutsche PoE-Discords,
kleine Streamer/YouTuber, am besten kurz vor oder zum Start einer neuen Liga.
