// PoE Companion – Sprache: die Oberfläche ist auf Deutsch geschrieben, auf Wunsch übersetzt diese Datei sie live ins Englische.
// Funktionsweise: jeder sichtbare Text wird nachgeschlagen (Zahlen → {n}, „Namen“ → {q}) und ersetzt.
const I18N = (() => {
  let lang = 'de';
  try { lang = localStorage.getItem('lang') || 'de'; } catch (e) {}
  const D = () => window.I18N_EN || {};
  // Sätze mit Namen darin, die nicht ins Wörterbuch passen
  const PAT = [
    [/^Lade Preise: (.+)$/, 'Loading prices: $1'],
    [/^Lade (.+) von pathofexile\.com…$/, 'Loading $1 from pathofexile.com…'],
    [/^Belohnung Akt (\d+): „([^“]+)“ bei (.+?)( · |$)/, 'Reward Act $1: "$2" from $3$4'],
    [/kaufen Akt (\d+) bei ([^.·]+)/g, 'buy in Act $1 from $2'],
    [/Am frühesten \(Akt (\d+)\) nur als ([^.]+)\./g, 'Earliest (Act $1) only as $2.'],
    [/^Akt (\d+) nur für (.+)$/, 'Act $1 only for $2'],
    [/^Angaben für deine Klasse \((.+?)\)\. Siosa \(Akt (\d+), Bibliothek\) und Lilly Roth \(ab Akt (\d+)\) verkaufen fast alle Gems an jede Klasse\.$/, 'Shown for your class ($1). Siosa (Act $2, library) and Lilly Roth (from Act $3) sell almost all gems to every class.'],
    [/^Kein Gem – diesen Skill gibt dir das Item „([^“]+)“(?: \(([^)]*)\))?(?: im Slot ([^.]+))?\. Solange du es trägst, hast du den Skill\. Kaufen: auf der Trade-Seite nach „([^“]+)“ suchen\.$/, (m, a, b, c, d) => `Not a gem – this skill comes from the item "${a}"${b ? ' (' + b + ')' : ''}${c ? ' in slot ' + c : ''}. As long as you wear it, you have the skill. To buy: search the trade site for "${d}".`],
    [/^Kein Gem – Monster explodieren durch einen Mod auf deinen Items(.*)$/, (m, a) => 'Not a gem – monsters explode because of a mod on your items' + a.replace('Beispiel-Mod:', 'Example mod:').replace(/„([^“]+)“/g, '"$1"')],
    [/^Kein Gem – kommt aus dem Skilltree(?:: „([^“]+)“)?( \(Aufstiegspunkt\))?\.$/, (m, a, b) => `Not a gem – comes from the skill tree${a ? ': "' + a + '"' : ''}${b ? ' (ascendancy point)' : ''}.`],
    [/^Kein normaler Gem – „([^“]+)“ kommt von einem Item oder Mod\..*$/, 'Not a regular gem – "$1" comes from an item or mod. Check the items in your guide (pobb.in) to see which one grants it.'],
    [/^Gibt es nicht bei Quests oder Händlern\. Auf der Trade-Seite nach dem Gem „([^“]+)“ suchen \(oder als Drop finden\)\.$/, 'Not available from quests or vendors. Search the trade site for the gem "$1" (or find it as a drop).'],
    [/^Quest bei (.+) abgegeben$/, 'Quest handed in to $1'],
    [/^Kampf gegen (.+)$/, 'Fight against $1'],
    [/^(\d+) Treffer$/, '$1 hits'],
    [/\bStrg\b/g, 'Ctrl'],
    [/^Spiel-Log: Gebiet: (.+)$/, 'Game log: area: $1'],
    [/^(★ )?Sockel bei (.+?) · (\d+) Notables(?:, (\d+) geskillt)?$/, (m, a, b, c, d) => `${a || ''}Socket near ${b === 'Mitte' ? 'centre' : b} · ${c} notables${d ? ', ' + d + ' allocated' : ''}`],
    [/^Seeds (\d+)–(\d+)( \(in 20er-Schritten\))? · Anführer: (.+?) oder (.+?) – der Anführer ändert nur den Keystone, die Notables hängen allein am Seed\.(.*)$/, (m, a, b, c, d, e, f) => `Seeds ${a}–${b}${c ? ' (in steps of 20)' : ''} · Leader: ${d.replace(/,/g, ',')} or ${e} – the leader only changes the keystone, notables depend on the seed alone.` + f.replace('Kleine Punkte verlieren ihre Werte.', 'Small points lose their stats.').replace(/Kleine Punkte: \+?(\d+) (Stärke|Geschick|Devotion), Attribut-Punkte \+?(\d+) (Stärke|Geschick|Devotion) zusätzlich\./, (x, n1, s1, n2) => `Small points: +${n1} ${({ Stärke: 'Strength', Geschick: 'Dexterity', Devotion: 'Devotion' })[s1]}, attribute points +${n2} more.`)],
    [/^(.+) – die stehen trotzdem beim Map-Check als gefährlich\.$/, (m, a) => a.split(', ').map(x => D()[x] || x).join(', ') + ' – they are still flagged as dangerous in the map check.'],
    [/^Path of Building: (.+)$/, (m, a) => 'Path of Building: ' + (D()[a] || a.replace(/^Lade (.+) von pathofexile\.com…$/, 'Loading $1 from pathofexile.com…'))],
    [/^(.+) · Lv (\d+) · Stufe wählen:$/, '$1 · Lv $2 · choose stage:'],
    [/^Dein Build: (.+)$/, (m, a) => 'Your build: ' + a.split(' · ').map(x => (D()['wichtig: ' + x] || x).replace(/^important: /, '')).join(' · ')],
    [/^Akt (\d+) · (\d+) %$/, 'Act $1 · $2 %'],
    [/^Was jede Zeile von (.+) bringt$/, 'What each line of $1 gives'],
    [/^Was du dafür abgibst \((.+)\)$/, 'What you give up ($1)'],
    [/^Beim Tausch fällt weg, was PoB nicht rechnet: (.+)$/, 'Lost when swapping, not calculated by PoB: $1'],
    [/^Nicht auf der Trade-Seite gefunden: (.+)$/, 'Not found on the trade site: $1'],
    [/^Sucht nach den Mods, die dir etwas bringen \(Werte ab ([\d.,]+) %\): (.+)$/, 'Searches for the mods that help you (values from $1 %): $2'],
    [/^poe\.ninja zeigt, welche Items andere (.+?) mit deinem Skill tragen\..*$/, 'poe.ninja shows which items other $1 players use with your skill. Add interesting items to the wish list below – PoB then calculates them for your build.'],
    [/^Gerechnet für deinen Build \((.+?)\): PoB setzt das Item ein.*$/, 'Calculated for your build ($1): PoB equips the item and then removes each line one by one. This works for every build PoB can load.'],
    [/^(.+) ist ein Item von Level (\d+) – du bist (\d+)\.$/, '$1 is a level $2 item – you are $3.'],
    [/^(.+?) – (.+?) töten → (.*)$/, (m, a, b, c) => `${a} – kill ${b} → ` + c.replace(/Passive-Punkte/g, 'passive points').replace(/Waffenset-Punkte/g, 'weapon set points')],
    [/^(.+?)\. Chance auf deine Wünsche – (.+)$/, (m, a, b) => (tr(a + '.') || a + '.') + ' Chance for your wanted mods – ' + b],
    [/^Das Omen setzt den Mod sicher auf die (Prefix|Suffix)-Seite\. Treffer, wenn einer dieser Mods kommt: (.+)\. Kommt Müll, wieder wie oben entfernen\.$/, (m, a, b) => `The omen puts the mod safely on the ${a.toLowerCase()} side. Success if one of these mods comes: ${b}. If junk comes, remove it again as above.`],
    [/^stärkt deinen Build \((.+)\)$/, 'strengthens your build ($1)'],
    [/^hilft etwas \((.+)\) – ersetzen, wenn Besseres kommt$/, 'helps a bit ($1) – replace it if something better comes'],
    [/^Die Perfect Essenz setzt genau diesen Mod und entfernt dafür einen anderen auf der (\w+)-Seite \(das Omen bestimmt die Seite\)\. (.*?) ?Zählt als dein einer gecrafteter Mod\.$/, (m, a, b) => `The Perfect essence sets exactly this mod and removes another one on the ${a.toLowerCase()} side (the omen picks the side). ` + b.replace('Sitzt dort nur Unnützes, ist es sicher.', 'Only useless mods sit there, so it is safe.').replace(/Mit (\d+) % trifft es einen unnützen Mod\./, '$1 % chance it hits a useless mod.') + ' Counts as your one crafted mod.'],
    [/^Das Omen setzt den neuen Mod sicher als (\w+)\. Kommt etwas Unnützes:.*$/, (m, a) => `The omen safely makes the new mod a ${a.toLowerCase()}. If something useless comes: take it off again with Annulment + the side's omen (or Chaos + Whittling if it has the lowest mod level) and try again.`],
    [/^Neuer (Prefix|Suffix) mit Katalysator-Bonus \((.+)\)$/, (m, a, b) => `New ${a.toLowerCase()} with catalyst bonus (${b})`],
    [/^Neuer (Prefix|Suffix) – einer dieser Mods$/, (m, a) => `New ${a.toLowerCase()} – one of these mods`],
    [/^(Prefix|Suffix) garantiert: „(.+)“$/, (m, a, b) => `${a} guaranteed: "${b}"`],
    [/^Abyss-Mod: „(.+)“$/, 'Abyss mod: "$1"'],
    [/^Zwei (Prefix|Suffix)e auf einmal$/, (m, a) => `Two ${a.toLowerCase()}es at once`],
    [/^Ring\/Amulett erst mit (.+?) auf 20 % Qualität bringen.*$/, (m, a) => `First bring the ring/amulet to 20 % quality with ${a}, then the Catalysing omen consumes the quality and makes matching mods much more likely on the next Exalted (about 5× according to the community – not official, chance estimated). Many ring guides do it this way.`],
    [/^Knochen aufs Item, im Well of Souls aus (\d+) Vorschlägen wählen\. (.+?) legt die Seite fest, Echoes würfelt die Vorschläge einmal neu(?:, (.+?) beschränkt auf die passende Lich-Gruppe)?\. Ist er Müll:.*$/, (m, a, b, c) => `Bone on the item, choose from ${a} options in the Well of Souls. ${b} fixes the side, Echoes rerolls the options once${c ? ', ' + c + ' limits it to the matching lich group' : ''}. If it's junk: Orb of Annulment + Omen of Light removes ONLY the abyss mod, then try again.`],
    [/^Ganz zum Schluss: Katalysator-Qualität verstärkt alle (.+?)-Mods auf Ringen\/Amuletten.*$/, 'At the very end: catalyst quality boosts all $1 mods on rings/amulets – cheaper and safer than Divine. Only do this AFTER the last Catalysing omen (the omen uses up the quality).'],
    [/^(.+) bis 20 %$/, '$1 to 20 %'],
    [/^Die (\d+) unnützen (Prefix|Suffix)e entfernen$/, (m, a, b) => `Remove the ${a} useless ${b.toLowerCase()}es`],
    [/^Basis kaufen: (.+) mit Itemlevel (\d+)\+$/, 'Buy base: $1 with item level $2+'],
    [/^Neuer (Prefix|Suffix): „(.+)“$/, (m, a, b) => `New ${a.toLowerCase()}: "${b}"`],
    [/^„(.+)“ gezielt als (Prefix|Suffix) holen$/, (m, a, b) => `Get "${a}" as a targeted ${b.toLowerCase()}`],
    [/^(.+?) \+ Omen of (\w+) Exaltation, Müll per Annulment \+ Omen of (\w+) Annulment$/, '$1 + Omen of $2 Exaltation, junk via Annulment + Omen of $3 Annulment'],
    [/^Erst mit Orb of Annulment \+ Omen of (\w+) Annulment einen (Prefix|Suffix) entfernen, dann (.+?) \+ Omen of \w+ Exaltation: .*?Mods mitspielen(?: und (.+?) erst ab Modlevel (\d+) würfelt)?\.$/, (m, a, b, c, d, e) => `First remove a ${b.toLowerCase()} with Orb of Annulment + Omen of ${a} Annulment, then ${c} + Omen of ${a} Exaltation: the new mod is guaranteed to land as a ${b.toLowerCase()}. Missed? Annulment + omen again, then retry. This is cheaper than chaos spam here because only ${b.toLowerCase()} mods are in play${d ? ' and ' + d + ' only rolls from mod level ' + e : ''}.`],
    [/^Deine anderen Wünsche liegen (alle auf der anderen Seite|teilweise auf derselben Seite, das Fracturing lohnt sich bei den Preisen aber nicht)\..*\((Prefix|Suffix)\).*$/, (m, a, b) => `Your other wanted mods are ${a.startsWith('alle') ? 'all on the other side' : 'partly on the same side, but fracturing isn\'t worth it at current prices'}. With the side omens you only remove mods on the other side there – the key mod (${b.toLowerCase()}) is never hit. That saves the expensive Fracturing Orb.`],
    [/^Das ist der seltenste deiner Wünsche \(Schlüssel-Mod\).* (\S+(?: \S+)? Chaos Orb) lässt nur Mods ab Modlevel (\d+) zu – hier billiger pro Treffer\.$/, 'This is the rarest of your wanted mods (key mod) – so it comes first. Each Chaos Orb removes a random mod and immediately rolls a new one. Ignore everything else, only watch for this mod. $1 only allows mods from mod level $2 – cheaper per hit here.'],
    [/^Das Omen setzt den neuen Mod sicher auf die (Prefix|Suffix)-Seite\. Kommt etwas anderes: Orb of Annulment \+ (.+?) entfernt wieder einen (?:Prefix|Suffix) – (.*) Dann nochmal\.$/, (m, a, b, c) => `The omen puts the new mod safely on the ${a.toLowerCase()} side. If something else comes: Orb of Annulment + ${b} removes a ${a.toLowerCase()} again – ` + c.replace('auf dieser Seite ist sonst nichts Wertvolles, also kein Risiko.', 'nothing else valuable is on this side, so no risk.').replace(/es kann dabei auch einen deiner guten Mods auf dieser Seite treffen \((\d+) % Risiko\), den holst du dann genauso zurück\./, 'it can also hit one of your good mods on this side ($1 % risk) – you get it back the same way.') + ' Then try again.'],
    [/^Die Perfect Essenz tauscht auf einem seltenen Item einen Mod gegen ihren festen Mod\. Das Omen sorgt dafür, dass sie den Müll-Platzhalter auf der (Prefix|Suffix)-Seite ersetzt – garantiert\. Zählt als dein einer gecrafteter Mod\.$/, (m, a) => `The Perfect essence swaps a mod on a rare item for its fixed mod. The omen makes sure it replaces the junk placeholder on the ${a.toLowerCase()} side – guaranteed. Counts as your one crafted mod.`],
    [/^Das ist ein Top-Item – zusammen etwa (.+?)\. Günstiger wird es, wenn du bei deinem schwersten Mod \(„(.+)“\) links eine Stufe niedriger wählst oder eine Basis kaufst, auf der er schon fraktiert ist\.$/, 'This is a top item – about $1 in total. It gets cheaper if you pick one tier lower for your hardest mod ("$2") on the left or buy a base that already has it fractured.'],
    [/^Level 1: Charakterlevel (\d+)(.*)$/, (m, a, b) => `Level 1: character level ${a}` + b.replace(/Stärke/g, 'Strength').replace(/Geschick/g, 'Dexterity').replace(/Intelligenz/g, 'Intelligence')],
    [/^Level (\d+): Charakterlevel (\S+)(.*)$/, (m, a, c, b) => `Level ${a}: character level ${c}` + b.replace(/Stärke/g, 'Strength').replace(/Geschick/g, 'Dexterity').replace(/Intelligenz/g, 'Intelligence')],
    [/^In PoE 2 gibt es keine Gem-Händler: Du schneidest den Gem aus einem „Uncut (Skill|Support) Gem“( ab Stufe \d+)? .*$/, (m, a, b) => `PoE 2 has no gem vendors: you cut the gem from an "Uncut ${a} Gem"${b ? b.replace('ab Stufe', ' of level') : ''} (right-click → choose gem). Uncut gems drop everywhere; if you're missing one, it's cheap at the Currency Exchange (Alva) or on the trade site.`],
    [/^Laut Spiel-Log ist (.+?) Level (\d+), dein Build-Link ist aber Level (\d+)\..*$/, 'According to the game log $1 is level $2, but your build link is level $3. The gems here come from the link. Export your character again in Path of Building 2 (pobb.in) and replace the link under "Profiles".'],
    [/^leer = Liga deines Charakters \((.+)\) · gilt nur für (PoE \d)$/, 'empty = your character\'s league ($1) · applies to $2 only'],
    [/^So geht die Schleife: .*? – deshalb „im Schnitt (\d+) Versuche“\. (.*)$/, (m, a, b) => `This is the loop: Exalted + omen → if it's the wanted mod, done. If not, remove it again and retry – hence "${a} attempts on average". ` + (tr(b) || b)],
    [/^Fracture daneben\? .*$/, 'Fracture missed? Three ways: (1) If the fractured mod is one of your wanted mods (e.g. life), just keep building – protect the key mod with the side omens instead of fracturing. (2) If it is worthless, the base is usually lost: new base, Alchemy + key mod again. (3) Often cheapest: buy a base that already has the key mod fractured (trade filter "Fractured").'],
    [/^Durchschnitt der (\d+) meistgehandelten Items \(gleich gewichtet, vor 7 Tagen = 100\): (.+)\. Über 100 = diese Items sind teurer geworden\.$/, 'Average of the $1 most traded items (equally weighted, 7 days ago = 100): $2. Above 100 = these items got more expensive.'],
    [/^Auf der (Prefix|Suffix)-Seite deines Schlüssel-Mods wird nichts mehr entfernt.*$/, (m, a) => `Nothing gets removed on the ${a.toLowerCase()} side of your key mod anymore – all further steps use side omens on the other side. The key mod can never be hit; that saves the expensive Fracturing Orb.`],
    [/^Auf der (Prefix|Suffix)-Seite wird später noch annulliert bzw\. getauscht – dabei könnte dein Schlüssel-Mod verloren gehen \(erwartet ([\d.,]+)× neu holen, ≈ (\d+) Ex\)\. Der Fracturing Orb macht einen von (\d+) Mods dauerhaft.*$/, (m, a, b, c, d) => `Later there will be annulling or swapping on the ${a.toLowerCase()} side – your key mod could get lost (expected ${b}× re-roll, ≈ ${c} Ex). The Fracturing Orb makes one of ${d} mods permanent: Annulment, Chaos and essences can't remove it afterwards. Go to exactly 4 mods – the fewer mods, the higher the chance.`],
    [/^Auf der (Prefix|Suffix)-Seite wird später noch annulliert, dabei kann dein Schlüssel-Mod getroffen werden \(erwartet ([\d.,]+)×\)\. Ihn dann neu zu holen kostet im Schnitt ≈ (\d+) Ex – weniger als Fracturing \(≈ (\S+) Ex\)\..*$/, (m, a, b, c, d) => `Later there will be annulling on the ${a.toLowerCase()} side, which can hit your key mod (expected ${b}×). Getting it again costs ≈ ${c} Ex on average – less than fracturing (≈ ${d} Ex). So continue without fracturing; if it's lost, just repeat the key step.`],
    [/^Die Schleife: (.+?) → ist es dein Mod, fertig\. Wenn nicht, entfernst du ihn wieder und versuchst es erneut – deshalb „im Schnitt (\d+) Versuche“\. Das Omen setzt den neuen Mod garantiert auf die (Prefix|Suffix)-Seite, damit die andere Seite unberührt bleibt\.(.*)$/, (m, a, b, c, d) => `The loop: ${a.replace(/\(vorher (\d+) % (.+?)\)/, '(first $1 % $2)')} → if it's your mod, done. If not, remove it again and retry – hence "${b} attempts on average". The omen guarantees the new mod goes to the ${c.toLowerCase()} side, so the other side stays untouched.` + d.replace(/ Katalysator-Qualität \+ Catalysing-Omen machen Mods mit dem Tag „(.+?)“ etwa (\d+)× wahrscheinlicher \(Wert aus der Community, nicht offiziell\)\./, ' Catalyst quality + Catalysing omen make mods with the tag "$1" about $2× more likely (community value, not official).')],
    [/^Ein Müll-Mod als (Prefix|Suffix) fraktiert$/, (m, a) => `A junk mod got fractured as ${a.toLowerCase()}`],
    [/^Isolation: Erst mit Orb of Annulment \+ Omen of (\w+) Annulment einen (Prefix|Suffix) entfernen, dann (.+?) \+ Omen of \w+ Exaltation – .*?mitspielen(?: und (.+?) erst ab Modlevel (\d+) würfelt)?\.$/, (m, a, b, c, d, e) => `Isolation: first remove a ${b.toLowerCase()} with Orb of Annulment + Omen of ${a} Annulment, then ${c} + Omen of ${a} Exaltation – the new mod is guaranteed to be a ${b.toLowerCase()}. Cheaper than chaos spam here because only ${b.toLowerCase()}es are in play${d ? ' and ' + d + ' only rolls from mod level ' + e : ''}.`],
    [/^Knochen aufs seltene Item, dann im Well of Souls \(oder mit dem Reveal\) aus (\d+) Vorschlägen wählen \((\d+) %\)\. Echoes würfelt die \d+ Vorschläge einmal neu \(zusammen (\d+) %\)\. Das Necromancy-Omen legt die Seite fest(?:, (.+?) beschränkt auf die passende Lich-Gruppe)?\. Nur ein Abyss-Mod pro Item\.$/, (m, a, b, c, d) => `Bone on the rare item, then choose from ${a} options in the Well of Souls (or via reveal) (${b} %). Echoes rerolls the ${a} options once (together ${c} %). The Necromancy omen fixes the side${d ? ', ' + d + ' limits it to the matching lich group' : ''}. Only one abyss mod per item.`],
    [/^Orb of Annulment \+ Omen of (\w+) Annulment entfernt einen (Prefix|Suffix)\. (.*) Dann wieder (.+?) \+ Omen\.$/, (m, a, b, c, d) => `Orb of Annulment + Omen of ${a} Annulment removes a ${b.toLowerCase()}. ` + c.replace('Auf dieser Seite sitzt nichts Ungeschütztes – kein Risiko.', 'Nothing unprotected sits on this side – no risk.').replace(/Es kann auch einen deiner (\d+) guten Mods treffen \((\d+) %\) – den holst du dann genauso zurück\. Sicherer: Wenn der Müll das niedrigste Modlevel hat, Chaos Orb \+ Omen of Whittling \+ (\w+) Erasure-Omen\./, 'It can also hit one of your $1 good mods ($2 %) – you get it back the same way. Safer: if the junk has the lowest mod level, Chaos Orb + Omen of Whittling + $3 Erasure omen.') + ` Then ${d} + omen again.`],
    [/^Platz schaffen: (\d+)× Müll als (Prefix|Suffix) entfernen$/, (m, a, b) => `Make room: remove ${a}× junk ${b.toLowerCase()}`],
    [/^Werte um bis zu 20 % erhöhen: (.+)$/, 'Raise values by up to 20 %: $1'],
    [/^Basis besorgen: (.+), Itemlevel (\d+)\+$/, 'Get the base: $1, item level $2+'],
    [/^Aus „Uncut (Skill|Support) Gem“ \(Stufe (\d+)\+\) schneiden$/, 'Cut from an "Uncut $1 Gem" (level $2+)'],
    [/^Auf der (Prefix|Suffix)-Seite brauchst du nichts mehr\. Ist sie voll, landet jeder neue Mod automatisch als (Prefix|Suffix) – und Fehlversuche tauschst du mit Chaos Orb \+ Omen of (\w+) Erasure.*$/, (m, a, b, c) => `You don't need anything else on the ${a.toLowerCase()} side. Once it is full, every new mod automatically lands as a ${b.toLowerCase()} – and you swap misses with Chaos Orb + Omen of ${c} Erasure (cheap) instead of removing them with Orb of Annulment + omen (expensive). Whatever lands here doesn't matter – ideally a bonus like resistance.`],
    [/^Außer fraktierten Mods sitzt nur Müll auf dem Item.*$/, 'Apart from fractured mods only junk is on the item – so you don\'t need expensive side omens: a normal Orb of Annulment is guaranteed to hit junk. Repeat until only the fractured mod is left.'],
    [/^Die Schleife: Erst ein Exalted Orb – die andere Seite ist voll, also landet der neue Mod automatisch als (Prefix|Suffix)\. Passt er nicht: (.+?) \+ Omen of (\w+) Erasure entfernt einen (?:Prefix|Suffix) und würfelt sofort einen neuen dazu\. Das wiederholst du – deshalb „im Schnitt (\d+) Versuche“\..*$/, (m, a, b, c, d) => `The loop: first one Exalted Orb – the other side is full, so the new mod automatically lands as a ${a.toLowerCase()}. If it doesn't fit: ${b} + Omen of ${c} Erasure removes a ${a.toLowerCase()} and immediately rolls a new one. Repeat – hence "${d} attempts on average". Cheaper than Annulment + omen, because each attempt only costs one Chaos Orb and one omen.`],
    [/^Die Schleife: (.+?) → ist es dein Mod, fertig\. Wenn nicht, entfernst du ihn wieder und versuchst es erneut – deshalb „im Schnitt (\d+) Versuche“\. Die andere Seite ist voll, darum landet der neue Mod auch ohne Omen garantiert als (Prefix|Suffix)\.(.*)$/, (m, a, b, c, d) => `The loop: ${a.replace(/\(vorher (\d+) % (.+?)\)/, '(first $1 % $2)')} → if it's your mod, done. If not, remove it again and retry – hence "${b} attempts on average". The other side is full, so the new mod is guaranteed to land as a ${c.toLowerCase()} even without an omen.` + d.replace(/ Katalysator-Qualität \+ Catalysing-Omen machen Mods mit dem Tag „(.+?)“ etwa (\d+)× wahrscheinlicher \(Wert aus der Community, nicht offiziell\)\./, ' Catalyst quality + Catalysing omen make mods with the tag "$1" about $2× more likely (community value, not official).')],
    [/^Einfach den nächsten (.+)\.$/, 'Just use the next $1.'],
    [/^Für den Abyss-Mod ist auf der (Prefix|Suffix)-Seite kein Platz mehr – ein Wunsch weniger auf dieser Seite\.$/, (m, a) => `There is no room left for the abyss mod on the ${a.toLowerCase()} side – pick one wanted mod less on that side.`],
    [/^Isolation mit Erasure: (?:(Prefix|Suffix)-Seite mit (\d+)× Exalted Orb \+ Omen of (\w+) Exaltation auffüllen, dann )?jeder (.+?) \+ Omen of (\w+) Erasure tauscht nur einen (Prefix|Suffix) aus\..*?(?: (\S+(?: \S+)? Chaos Orb) würfelt erst ab Modlevel (\d+)\.)?$/, (m, a, b, c, d, e, f, g, h) => `Isolation with Erasure: ${a ? `fill the ${a.toLowerCase()} side with ${b}× Exalted Orb + Omen of ${c} Exaltation, then ` : ''}each ${d} + Omen of ${e} Erasure swaps only one ${f.toLowerCase()}. Because the other side is full, the new mod always lands as a ${f.toLowerCase()} – so only the ${f.toLowerCase()} pool is in play, and each attempt only costs one Chaos Orb and one omen (Annulment omens are very expensive right now).${g ? ' ' + g + ' only rolls from mod level ' + h + '.' : ''}`],
    [/^(Orb of Annulment(?: \+ Omen of \w+ Annulment)?) entfernt ihn\. (.*) Dann wieder (.+?)\.$/, (m, a, b, c) => `${a} removes it. ` + b.replace('Auf dem Item sitzt sonst nichts Ungeschütztes – ein normaler Annulment reicht, kein Omen nötig.', 'Nothing else unprotected is on the item – a normal Annulment is enough, no omen needed.').replace(/Das Omen hält das Annulment auf der (Prefix|Suffix)-Seite\. /, (q, x) => `The omen keeps the Annulment on the ${x.toLowerCase()} side. `).replace('Dort sitzt nichts Ungeschütztes – kein Risiko.', 'Nothing unprotected is there – no risk.').replace(/Es kann auch einen deiner (\d+) guten Mods treffen \((\d+) %\) – den holst du dann genauso zurück\./, 'It can also hit one of your $1 good mods ($2 %) – you get it back the same way.') + ` Then ${c.replace(' + Omen', ' + omen')} again.`],
    [/^Platz schaffen: (\d+)× Müll entfernen$/, 'Make room: remove $1× junk'],
    [/^(Prefix|Suffix)-Seite auffüllen \((\d+)× beliebiger Mod\)$/, (m, a, b) => `Fill the ${a.toLowerCase()} side (${b}× any mod)`],
    [/^Wieder (.+?) \+ Omen of (\w+) Erasure – das tauscht den falschen (Prefix|Suffix) gegen einen neuen\.(?: Kann auch einen deiner guten Mods auf dieser Seite treffen \((\d+) %\)\.)?$/, (m, a, b, c, d) => `Again ${a} + Omen of ${b} Erasure – that swaps the wrong ${c.toLowerCase()} for a new one.${d ? ` Can also hit one of your good mods on this side (${d} %).` : ''}`],
    [/^Erst ein Exalted Orb – die andere Seite ist voll, also landet er garantiert als (Prefix|Suffix)\. Passt er nicht: Chaos Orb \+ Omen of (\w+) Erasure tauscht nur einen (?:Prefix|Suffix) aus.*$/, (m, a, b) => `First one Exalted Orb – the other side is full, so it is guaranteed to land as a ${a.toLowerCase()}. If it doesn't fit: Chaos Orb + Omen of ${b} Erasure swaps only one ${a.toLowerCase()} and rerolls immediately. Each attempt only costs one Chaos Orb and one omen – much cheaper than Annulment + omen.`],
    [/^Vorher den Müll-(Prefix|Suffix) mit (.+?) entfernen\. (.*)$/, (m, a, b, c) => `First remove the junk ${a.toLowerCase()} with ${b}. ` + (tr(c) || c)],
    [/^Die Kosten kommen vor allem von: (.+)\. Gerade teuer sind Omen wie Annulment-\/Erasure-Omen \(je ≈ (\S+) Divine\)\..*$/, (m, a, b) => `Most of the cost comes from: ${a}. Omens like Annulment/Erasure omens are expensive right now (≈ ${b} Divine each). Check trade first whether the finished item (or a base with the key mod fractured) is cheaper – or pick one tier lower on the left for the most expensive mods.`],
    [/^(.+) · von$/, '$1 · from'],
    [/^Stash-Tab „(.*)“(?: · Spalte (\d+), Zeile (\d+))?$/, (m, a, b, c) => `Stash tab "${a}"` + (b ? ` · column ${b}, row ${c}` : '')],
    [/^etwa (.+?) · $/, 'about $1 · '],
    [/^etwa (.+?) – unten steht der günstigere Weg\.$/, 'about $1 – the cheaper way is shown below.'],
    [/^braucht dann Charakterlevel (\d+)(.*)$/, (m, a, b) => `then needs character level ${a}` + b.replace(/Stärke/g, 'Strength').replace(/Geschick/g, 'Dexterity').replace(/Intelligenz/g, 'Intelligence')],
    [/^Aus „Uncut (Skill|Support) Gem“ \(Stufe (\d+)\+\) schneiden · ab Charakterlevel (\d+)$/, 'Cut from an "Uncut $1 Gem" (level $2+) · from character level $3'],
    [/^Spanne (.+) · $/, 'Range $1 · '],
    [/^\(Build-Link: Lv (\d+)\)$/, '(build link: lv $1)'],
    [/(\d+) % Qualität/g, '$1 % quality'],
    [/\(Qualität (\d+) %\)/g, '(quality $1 %)'],
    [/ · (\d+) % ~ · /g, ' · ~$1 % · '],
    [/^(.+?) mit Itemlevel (\d+) oder höher – nur dann können die hohen Stufen deiner Wunsch-Mods überhaupt kommen\..*$/, '$1 with item level $2 or higher – only then can the high tiers of your wanted mods roll at all. Best buy a few right away – with bad luck you start over with a new one.'],
    [/^Simuliert ([\d.,]+)-mal mit Liga-Preisen von poe\.ninja \((.+?)\)\..*$/, 'Simulated $1 times with league prices from poe.ninja ($2). Weights: community data from poe2db via the POE2_HTC project (AGPL3) – guide values, no guarantee.'],
  ];
  const DE = /[äöüÄÖÜß]|\b(und|oder|der|die|das|mit|von|für|nach|nicht|noch|ist|du|dein|deine|wird|kein|keine|Akt|Stufe|Gebiet|Schritt|Lade|Fehler|Bitte|Noch|aus|bei|auf|zu|im)\b/;
  const miss = new Set(); let sendT = 0;
  function melde(k) {
    if (miss.has(k) || k.length > 400 || (!DE.test(k) && !window.I18N_ALLE)) return;
    miss.add(k); clearTimeout(sendT);
    sendT = setTimeout(() => { try { fetch('/api/i18n/missing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([...miss]) }); } catch (e) {} }, 4000);
  }
  function tr(raw) {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (!t || !/[A-Za-zÄÖÜäöüß]/.test(t)) return null;
    const q = [], n = [];
    let k = t.replace(/„([^“]*)“/g, (m, a) => { q.push(a); return '{q}'; });
    k = k.replace(/[+\-−]?\d+(?:[.,]\d+)*/g, m => { n.push(m); return '{n}'; });
    let e = D()[k];
    if (e == null && /, /.test(t) && !/[.!?]$/.test(t)) {  // Aufzählung bekannter Begriffe
      const teile = t.split(/, | – /), ue = teile.map(x => D()[x] || D()[x.charAt(0).toUpperCase() + x.slice(1)]);
      if (ue.every(Boolean) && teile.length > 1) e = t.replace(/[^,–]+/g, x => { const y = x.trim(); const z = D()[y] || D()[y.charAt(0).toUpperCase() + y.slice(1)]; return x.replace(y, z ? z.charAt(0).toLowerCase() + z.slice(1) : y); });
    }
    if (e == null) {
      let out = t, hit = false;
      for (const [re, rep] of PAT) { re.lastIndex = 0; if (re.test(out)) { re.lastIndex = 0; out = out.replace(re, rep); hit = true; } }
      if (!hit) { melde(k); return null; }
      e = out;
    } else {
      let qi = 0, ni = 0;
      e = e.replace(/\{q\}/g, () => '"' + (q[qi++] || '') + '"').replace(/\{n\}/g, () => n[ni++] || '');
    }
    const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
    return lead + e + trail;
  }
  const SKIP = new Set(['SCRIPT', 'STYLE', 'CODE', 'TEXTAREA', 'TITLE']);
  const done = new WeakMap();
  function textNode(n) {
    const p = n.parentElement; if (!p || SKIP.has(p.tagName) || p.closest('.notr')) return;
    if (done.get(n) === n.nodeValue) return;
    const r = tr(n.nodeValue);
    if (r != null && r !== n.nodeValue) n.nodeValue = r;
    done.set(n, n.nodeValue);
  }
  function attrs(el) {
    for (const a of ['title', 'placeholder', 'aria-label']) {
      const v = el.getAttribute && el.getAttribute(a); if (!v) continue;
      const key = '_tr_' + a; if (el[key] === v) continue;
      const r = tr(v); if (r != null) el.setAttribute(a, r);
      el[key] = el.getAttribute(a);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) return textNode(root);
    if (root.nodeType !== 1 || SKIP.has(root.tagName)) return;
    attrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) textNode(n); else attrs(n); }
  }
  function start() {
    if (lang !== 'en' || !document.body) return;
    walk(document.body);
    new MutationObserver(ms => { for (const m of ms) {
      if (m.type === 'characterData') textNode(m.target);
      else if (m.type === 'attributes') attrs(m.target);
      else m.addedNodes.forEach(walk);
    } }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label'] });
  }
  // Kampagnen-Texte: fertige englische Fassung statt Übersetzung
  function kampagne() {
    if (lang !== 'en' || !window.CAMPAIGN || !window.CAMPAIGN_EN) return;
    CAMPAIGN.forEach((a, i) => { const e = CAMPAIGN_EN[i]; if (!e) return; a.tip = e.tip; a.title = e.title; a.steps.forEach((s, j) => { const x = e.steps[j]; if (x) { s.t = x.t; s.sub = x.sub; } }); });
  }
  // Einstellung aus dem Companion übernehmen; bei Wechsel Seite neu laden
  function pruefe(s) {
    const want = (s && s.settings && s.settings.lang) || 'de';
    if (want !== lang) { try { localStorage.setItem('lang', want); } catch (e) {} location.reload(); }
  }
  if (window.App && App.on) App.on(s => { if (s) pruefe(s); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
  if (lang === 'en') document.documentElement.lang = 'en';
  return { lang: () => lang, tr: t => (lang === 'en' ? (tr(t) || t) : t), kampagne, pruefe };
})();
