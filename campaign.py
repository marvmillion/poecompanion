# PoE Companion – Kampagnen-Guide: liest das Spiel-Log und schaltet die Schritte automatisch weiter
import os, re, json, time, threading
import stash

from pfad import BASE
ENTER = re.compile(r'\] : You have entered (.+?)\.\s*$')
LEVEL = re.compile(r'\] : (.+?) \((\w+)\) is now level (\d+)')
TOT = re.compile(r'\] : (\S+) has been slain\.')
SPRICHT = re.compile(r'\] ([A-Z][^:#@$&%<>\[\]]{1,60}): (.+)$')  # NPC- und Boss-Dialoge


WHISPER = re.compile(r'\] @(?:From|Von|De|Da|От) (?:<[^>]*> )?([^:]{1,40}): (.+)$')
KAUF = re.compile(r'buy your (.+?) listed for ([\d.,]+) (.+?) in ([^(.]+)(?:\(stash tab "(.*?)"; position: left (\d+), top (\d+)\))?', re.I)
TAUSCH = re.compile(r"(?:like to )?buy your ([\d.,]+) (.+?) for my ([\d.,]+) (.+?) in (.+?)\.", re.I)
SCENE = re.compile(r'\[SCENE\] Set Source \[(.+?)\]\s*$')  # PoE2 meldet Gebietswechsel so


def lade_route(game='poe1'):
    if game == 'poe2':
        t = open(os.path.join(BASE, 'ui', 'data', 'campaign_poe2.js'), encoding='utf-8').read()
        a = t.index('window.CAMPAIGN_POE2 = ') + len('window.CAMPAIGN_POE2 = ')
        b = t.index(';\nwindow.CAMPAIGN_POE2_EN')
    else:
        t = open(os.path.join(BASE, 'ui', 'data', 'campaign.js'), encoding='utf-8').read()
        a = t.index('window.CAMPAIGN = ') + len('window.CAMPAIGN = ')
        b = t.index(';\n\n// Passivpunkt')
    acts = json.loads(t[a:b])
    flat = []
    for act in acts:
        for s in act['steps']:
            flat.append({'act': act['act'], 'z': s['z'], 'k': s['k'], 'q': s.get('q', ''), 'kt': s.get('kt', ''), 'npc': s.get('npc', '')})
    return flat


class Campaign(threading.Thread):
    def __init__(self, S, lade, speichere, log):
        super().__init__(daemon=True)
        self.S, self.lade, self.speichere, self.log = S, lade, speichere, log
        self.spiel = self.game()
        self.flat = lade_route(self.spiel)
        self.all = self.lade('campaign.json', {})
        self.zone = ''
        self.level = None
        self.path = ''
        self.pos = 0

    def game(self):
        p = self.S.active_profile() or {}
        return 'poe2' if p.get('game') == 'poe2' else 'poe1'

    def spiel_pruefen(self):
        """Profil auf das andere Spiel gewechselt: Route und Spiel-Log umstellen."""
        g = self.game()
        if g != self.spiel:
            self.spiel = g
            self.flat = lade_route(g)
            self.path, self.checked = '', 0
            self.S.bump()

    # Fortschritt gehört zum aktiven Profil
    def mine(self):
        pid = self.S.profiles.get('active') or '_'
        return self.all.setdefault(pid, {'idx': 0, 'pp': {}, 'auto': True})

    def letztes_level(self):
        """Beim Start: letztes „is now level“ aus dem Ende des Spiel-Logs holen, damit das echte Level sofort bekannt ist."""
        try:
            size = os.path.getsize(self.path)
            p = self.S.active_profile() or {}
            namen = {x.strip().lower() for x in (p.get('char'), p.get('name'), ((self.S.char or {}).get('info') or {}).get('char')) if x}
            treffer = []
            with open(self.path, 'rb') as f:
                # von hinten in 8-MB-Stücken suchen (höchstens 64 MB), bis der eigene Charakter gefunden ist
                ende, schritt = size, 8 * 1024 * 1024
                while ende > 0 and size - ende < 64 * 1024 * 1024:
                    start = max(0, ende - schritt)
                    f.seek(start)
                    data = f.read(ende - start + 200).decode('utf-8', 'replace')
                    treffer = list(LEVEL.finditer(data)) + treffer
                    if any(m.group(1).strip().lower() in namen for m in treffer):
                        break
                    ende = start
            if treffer:
                eigene = [m for m in treffer if m.group(1).strip().lower() in namen]
                # eigener Charakter (Profilname) zuerst, sonst der Charakter mit dem höchsten Level im Log
                m = eigene[-1] if eigene else max(treffer, key=lambda x: int(x.group(3)))
                self.level = int(m.group(3))
                self.charName = m.group(1).strip()
            try:
                st = os.stat(self.path)
                self.log('Kampagne Level: Log %s (%.0f MB, geändert %s), Namen %s, eigene Treffer %s, alle zuletzt %s, gewählt %s Lv %s' % (
                    self.path, st.st_size / 1e6, time.strftime('%Y-%m-%d %H:%M', time.localtime(st.st_mtime)), sorted(namen),
                    [x.group(3) for x in eigene[-5:]] if treffer else [], [(x.group(1), x.group(3)) for x in treffer[-6:]],
                    getattr(self, 'charName', ''), getattr(self, 'level', '')))
            except Exception:
                pass
        except Exception as e:
            self.log('Kampagne Level: %s' % e)

    def fluestern(self, wer, text, zeit):
        """Eingehende Handelsanfragen (Flüstern) merken – nur anzeigen, nichts wird automatisch gesendet."""
        k, t = KAUF.search(text), TAUSCH.search(text)
        if not (k or t):
            return
        e = {'wer': wer, 'zeit': zeit, 'text': text[:300]}
        if k:
            e.update(item=k.group(1), preis=k.group(2), waehrung=k.group(3), liga=k.group(4).strip(), tab=k.group(5) or '', pos=[int(k.group(6)), int(k.group(7))] if k.group(6) else None)
        else:
            e.update(item='%s %s' % (t.group(1), t.group(2)), preis=t.group(3), waehrung=t.group(4), liga=t.group(5), tab='', pos=None)
        self.handel = ([e] + (getattr(self, 'handel', None) or []))[:15]
        self.S.bump()

    def public(self):
        m = self.mine()
        lv, fix = self.level, 0
        try:
            fix = int((self.S.active_profile() or {}).get('levelFix') or 0)
        except Exception:
            pass
        if fix and (not lv or lv < fix):
            lv = fix   # von dir eingetragen – das Log kennt nur ältere Level-Ups
        return {'splits': m.get('splits', {}), 'deaths': m.get('deaths', {}),
                'last': getattr(self, 'letzte', ''), 'idx': m['idx'], 'pp': m['pp'], 'auto': m.get('auto', True), 'zone': self.zone,
                'level': lv, 'levelFix': fix, 'charName': getattr(self, 'charName', ''), 'handel': getattr(self, 'handel', None) or [], 'log': bool(self.path), 'total': len(self.flat), 'spiel': self.spiel}

    def save(self):
        self.akt_zeit()
        self.speichere('campaign.json', self.all)
        self.S.bump()

    def akt_zeit(self):
        """Merkt sich, wann du einen Akt begonnen hast (für die Akt-Zeiten)."""
        m = self.mine()
        i = min(m['idx'], len(self.flat) - 1)
        if i < 0 or not self.flat:
            return
        act = str(self.flat[i]['act'])
        sp = m.setdefault('splits', {})
        if act not in sp and m['idx'] > 0:
            sp[act] = time.time()

    def gestorben(self):
        m = self.mine()
        if m['idx'] >= len(self.flat):
            return
        act = str(self.flat[min(m['idx'], len(self.flat) - 1)]['act'])
        d = m.setdefault('deaths', {})
        d[act] = d.get(act, 0) + 1
        self.speichere('campaign.json', self.all)
        self.S.bump()

    def action(self, b):
        m = self.mine()
        a = b.get('action')
        if a == 'next':
            m['idx'] = min(len(self.flat), m['idx'] + 1)
        elif a == 'prev':
            m['idx'] = max(0, m['idx'] - 1)
        elif a == 'set':
            m['idx'] = max(0, min(len(self.flat), int(b.get('idx', 0))))
        elif a == 'act':  # an den Anfang eines Akts springen
            act = int(b.get('act', 1))
            m['idx'] = next((i for i, s in enumerate(self.flat) if s['act'] == act), 0)
        elif a == 'reset':
            m['idx'] = 0
            m['pp'] = {}
            m['splits'] = {}
            m['deaths'] = {}
        elif a == 'auto':
            m['auto'] = bool(b.get('on'))
        elif a == 'pp':  # Passivpunkt manuell abhaken / zurücknehmen
            q = b.get('quest', '')
            if b.get('on') is None:
                m['pp'].pop(q, None)
            else:
                m['pp'][q] = bool(b.get('on'))
        self.save()

    def betreten(self, zone):
        self.zone = zone
        m = self.mine()
        if not m.get('auto', True):
            self.S.bump()
            return
        i0 = m['idx']
        # Vorwärts suchen (Städte kommen mehrfach vor – darum nur ein Fenster nach vorne)
        for i in range(max(0, i0 - 1), min(len(self.flat), i0 + 30)):
            if self.flat[i]['z'] == zone:
                m['idx'] = i + 1
                self.save()
                return
        self.S.bump()

    def spricht(self, wer):
        """Boss oder NPC spricht im Spiel: Guide springt mit.
        Boss-Dialog → zum Kampf-Schritt. Quest-NPC spricht bei einer Abgabe → Abgabe erledigt."""
        m = self.mine()
        if not m.get('auto', True):
            return
        i0 = m['idx']
        for i in range(i0, min(len(self.flat), i0 + 6)):
            st = self.flat[i]
            if st.get('npc') and (wer == st['npc'] or wer.startswith(st['npc'])):
                m['idx'] = i + 1
                self.letzte = 'Quest bei %s abgegeben' % wer
                self.save()
                return
            if st.get('kt') and (wer.startswith(st['kt']) or st['kt'].startswith(wer.split(',')[0])):
                if i > i0:
                    m['idx'] = i
                    self.letzte = 'Kampf gegen %s' % wer
                    self.save()
                return

    def run(self):
        while True:
            try:
                self.spiel_pruefen()
                if time.time() - getattr(self, 'checked', 0) > 60:
                    self.checked = time.time()
                    neu = stash.find_client_log(self.S.settings.get('clientLog2' if self.spiel == 'poe2' else 'clientLog', ''), self.spiel)
                    if neu and neu != self.path:
                        self.path = neu
                        self.pos = os.path.getsize(neu)
                        self.letztes_level()
                        self.S.bump()
                if not self.path or not os.path.isfile(self.path):
                    self.path = stash.find_client_log(self.S.settings.get('clientLog2' if self.spiel == 'poe2' else 'clientLog', ''), self.spiel)
                    self.pos = os.path.getsize(self.path) if self.path else 0
                    if self.path:
                        self.letztes_level()
                    if not self.path:
                        time.sleep(15)
                        continue
                    self.S.bump()
                size = os.path.getsize(self.path)
                if size < self.pos:
                    self.pos = 0
                if size > self.pos:
                    with open(self.path, 'rb') as f:
                        f.seek(self.pos)
                        data = f.read(size - self.pos)
                    self.pos = size
                    for line in data.decode('utf-8', 'replace').splitlines():
                        m = ENTER.search(line) or SCENE.search(line)
                        if m:
                            z = m.group(1).strip()
                            if z and z != '(null)' and z != self.zone:
                                self.betreten(z)
                            continue
                        m = LEVEL.search(line)
                        if m:
                            p = self.S.active_profile() or {}
                            namen = {x.strip().lower() for x in (p.get('char'), p.get('name')) if x}
                            if namen and getattr(self, 'charName', '').lower() in namen and m.group(1).strip().lower() not in namen:
                                continue   # ein anderer Charakter levelt – dein Level bleibt
                            self.level = int(m.group(3))
                            self.charName = m.group(1).strip()
                            self.S.bump()
                            continue
                        m = TOT.search(line)
                        if m:
                            self.gestorben()
                            continue
                        m = WHISPER.search(line)
                        if m:
                            self.fluestern(m.group(1).strip(), m.group(2).strip(), line[:19])
                            continue
                        m = SPRICHT.search(line)
                        if m:
                            self.spricht(m.group(1).strip())
            except Exception as e:
                self.log('Kampagne: %s' % e)
                time.sleep(5)
            time.sleep(1)
