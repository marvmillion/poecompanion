# Datenschutz – PoE Companion

**Kurz:** Der Companion läuft auf deinem PC. Deine Daten bleiben dort. Nur zwei Dinge gehen an den Entwickler – und beide kannst du steuern.

## 1. Anonymer Nutzerzähler (abschaltbar)
Höchstens einmal am Tag sendet der Companion an den Server des Entwicklers (Cloudflare Worker):
- eine **zufällige Installations-Nummer** (beim ersten Start erzeugt, ohne Bezug zu dir oder deinem Account),
- die **Programmversion**, das **Spiel** (PoE 1 oder 2) und die **Sprache** (de/en).

Keine Namen, keine Accounts, keine Charaktere, keine Dateien. Der Server speichert daraus Tages- und Monatszählungen. Damit niemand doppelt gezählt wird, merkt er sich die Nummer bis zu 40 Tage; für die Gesamtzahl der Installationen bleibt die Nummer mit dem Datum des ersten Starts gespeichert. Ein Rückschluss auf dich ist damit nicht möglich.
Deine IP-Adresse sieht technisch der Anbieter Cloudflare beim Verbindungsaufbau; der Companion speichert sie nicht.
**Abschalten:** Einstellungen → Über den Companion → „Anonym mitzählen“.

## 2. Feedback (nur wenn du es abschickst)
Über den Knopf **Feedback** schickst du selbst eine Nachricht. Sie enthält deinen Text, die Art (Fehler/Idee/Lob), die Ansicht, Version, Spiel und – nur wenn du es angibst – deinen Discord-Namen und die letzten Log-Zeilen (Windows-Benutzername darin wird entfernt). Feedback wird bis zu 12 Monate gespeichert und an den Entwickler weitergeleitet.

## 3. Was nie gesendet wird
- deine **POESESSID** (bleibt nur in `data/secret.json` auf deinem PC und geht ausschließlich an pathofexile.com),
- deine Profile, Stash-Daten, Einstellungen.

## Andere Dienste, die der Companion direkt anspricht
pathofexile.com (Charaktere, Trade-Suche), poe.ninja (Preise), GitHub (Updates, Path of Building), pobb.in/poe.ninja (Build-Links). Dort gelten deren Datenschutzregeln.

Fragen: über den Feedback-Knopf oder auf Discord an den Entwickler.
