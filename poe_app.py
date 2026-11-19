"""PoE Companion – Hintergrunddienst.

Startet Path of Building ohne Fenster, beobachtet die Zwischenablage (Strg+C im Spiel), stellt die
Oberfläche unter http://127.0.0.1:47811 bereit und verwaltet die Overlay-Fenster.
"""
import json, math, os, re, sys, time, uuid, queue, threading, traceback, subprocess, urllib.parse, urllib.error, urllib.request, mimetypes
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler


def _absturz(typ, wert, tb):
    """Fehler beim Start: nicht still verschwinden, sondern Bescheid sagen und alles in crash.log schreiben."""
    text = ''.join(traceback.format_exception(typ, wert, tb))
    try:
        import pfad
        ziel = os.path.join(pfad.DATA, 'crash.log')
    except Exception:
        ziel = os.path.join(os.path.dirname(os.path.abspath(sys.argv[0] or '.')), 'crash.log')
    try:
        with open(ziel, 'a', encoding='utf-8') as f:
            f.write(time.strftime('%Y-%m-%d %H:%M:%S ') + text + '\n')
    except Exception:
        pass
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, 'PoE Companion konnte nicht starten.\n\n%s\n\nDetails stehen in:\n%s\n\n'
                                         'Schick die Datei gern als Feedback, dann wird es behoben.' % (str(wert)[:300], ziel),
                                         'PoE Companion – Fehler', 0x10)
    except Exception:
        pass


sys.excepthook = _absturz

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pfad import BASE, DATA, EXE  # noqa: E402
import app_info  # noqa: E402
UI = os.path.join(BASE, 'ui')
PORT = int(os.environ.get('POE_PORT', '47811'))
IS_WIN = os.name == 'nt'
FAKE = os.environ.get('POE_FAKE')  # Pfad zu fixtures.json -> Testmodus ohne PoB
VERSION = app_info.VERSION
BOOT = str(int(time.time()))
os.makedirs(DATA, exist_ok=True)
sys.path.insert(0, BASE)
import guide, mapcheck, farm, campaign, stash, dienst  # noqa: E402


def log(msg):
    try:
        with open(os.path.join(DATA, 'app.log'), 'a', encoding='utf-8') as f:
            f.write(time.strftime('%Y-%m-%d %H:%M:%S ') + msg + '\n')
    except Exception:
        pass


def lade(name, default):
    try:
        return json.load(open(os.path.join(DATA, name), encoding='utf-8'))
    except Exception:
        return default


_SPEICHER_LOCK = threading.Lock()


def speichere(name, obj):
    # ein Schreiber zur Zeit; Windows sperrt Dateien kurz (Virenscanner, Indexer) – dann kurz warten und nochmal
    with _SPEICHER_LOCK:
        tmp = os.path.join(DATA, name + '.tmp')
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
        for i in range(6):
            try:
                os.replace(tmp, os.path.join(DATA, name))
                return
            except PermissionError:
                if i == 5:
                    raise
                time.sleep(0.15 * (i + 1))


def system_sprache():
    try:
        import ctypes
        return 'de' if (ctypes.windll.kernel32.GetUserDefaultUILanguage() & 0x3FF) == 0x07 else 'en'
    except Exception:
        return 'de'


DEFAULT_SETTINGS = {
    'telemetry': True, 'erststart': False, 'installId': '', 'pingTag': '', 'betaGesehen': '',
    'hotkeyToggle': 'F8', 'hotkeyHub': 'F9', 'hotkeyTree': 'F10',
    'popupAutoHide': 12, 'popupOnCopy': True, 'popupScale': 100, 'popupPinned': False, 'overlayOpacity': 96, 'overlayScale': 100,
    'mapDisabled': [], 'mapWahl': {}, 'mapWorte': {}, 'lang': 'de', 'hubGoto': '', 'treeStage': None, 'upgWunsch': [], 'wickerEigene': [],
    'windows': {}, 'hotkeyFarm': 'F7', 'hotkeyQuest': 'F6', 'hotkeyItem': 'ALT+C', 'hotkeyCraft': 'ALT+X', 'itemTrigger': 'hotkey', 'hotkeyQuestNext': 'F4', 'hotkeyQuestPrev': 'SHIFT+F4',
    'hotkeyHideout': 'F5', 'hotkeyChat1': '', 'chat1': '/kingsmarch', 'hotkeyChat2': '', 'chat2': '/exit',
    'questHints': True, 'framelessOverlays': True, 'priceCheck': True, 'priceTolerance': 15, 'stashInterval': 5, 'stashAutoScan': 10, 'stashInventory': True, 'stashMapPrice': 0, 'stashLeague': '', 'stashLeague2': '', 'clientLog': '',
}


# ---------------------------------------------------------------- Zustand mit Long-Polling

class Store:
    def __init__(self):
        self.cond = threading.Condition()
        self.rev = 1
        self.profiles = lade('profiles.json', {'active': None, 'list': []})
        gespeichert = lade('settings.json', {})
        self.settings = dict(DEFAULT_SETTINGS, **gespeichert)
        if 'lang' not in gespeichert:
            self.settings['lang'] = system_sprache()   # neue Nutzer: Sprache von Windows
        if not gespeichert:
            self.settings['erststart'] = True          # Einrichtung beim allerersten Start zeigen
        # Alt+N öffnet im Spiel den Shop – alte Quest-Tasten auf F5 umstellen
        if self.settings.get('hotkeyQuestNext') in ('ALT+N', 'F5'):  # F5 ist jetzt „Ins Hideout“
            self.settings['hotkeyQuestNext'] = 'F4'
        if self.settings.get('hotkeyQuestPrev') == 'SHIFT+F5':
            self.settings['hotkeyQuestPrev'] = 'SHIFT+F4'
        if self.settings.get('hotkeyQuestPrev') == 'ALT+B':
            self.settings['hotkeyQuestPrev'] = 'SHIFT+F5'
        self.history = lade('history.json', [])
        self.full = lade('history_full.json', {})
        self.status = {'text': 'Starte…', 'busy': True, 'error': '', 'ready': False}
        self.char = None      # Charakterbogen, Gems, Kurzinfo
        self.tree = None      # Plan aus dem Guide
        self.last = None      # letztes Ergebnis (Item oder Map)
        self.migrate_old()

    def migrate_old(self):
        """Übernimmt das Profil aus der alten Overlay-Version (config.json)."""
        if self.profiles['list']:
            return
        alt = lade(os.path.join('..', 'config.json'), {}) or {}
        p = alt.get('profil')
        if p:
            pid = uuid.uuid4().hex[:8]
            self.profiles = {'active': pid, 'list': [{
                'id': pid, 'name': p.get('char') or 'Mein Charakter', 'mode': p.get('mode', 'char'),
                'account': p.get('account', ''), 'char': p.get('char', ''), 'realm': 'pc',
                'link': p.get('link', ''), 'guide': p.get('guide', '')}]}
            speichere('profiles.json', self.profiles)

    def active_profile(self):
        for p in self.profiles['list']:
            if p['id'] == self.profiles.get('active'):
                return p
        return self.profiles['list'][0] if self.profiles['list'] else None

    def bump(self):
        with self.cond:
            self.rev += 1
            self.cond.notify_all()

    def set_status(self, text=None, busy=None, error=None, ready=None):
        if text is not None:
            self.status['text'] = text
        if busy is not None:
            self.status['busy'] = busy
        if error is not None:
            self.status['error'] = error
        if ready is not None:
            self.status['ready'] = ready
        self.bump()

    def snapshot(self):
        return {'rev': self.rev, 'version': VERSION, 'boot': BOOT, 'status': self.status, 'profiles': self.profiles,
                'settings': self.settings, 'char': self.char, 'tree': self.tree, 'last': self.last,
                'history': [{k: v for k, v in h.items() if k != 'raw'} for h in self.history[:40]],
                'mapRules': [[r[1], r[4]] for r in mapcheck.RULES],
                'farm': globals()['F'].snapshot_public() if globals().get('F') else None,
                'campaign': globals()['C'].public() if globals().get('C') else None,
                'craftItem': {'t': self.craft_item['t']} if getattr(self, 'craft_item', None) else None,
                'app': dienst.info(self.settings)}

    def wait(self, rev, timeout=25):
        with self.cond:
            if self.rev == rev:
                self.cond.wait(timeout)
            return self.snapshot()


S = Store()


# ---------------------------------------------------------------- Rechenkern-Thread

class FakeEngine:
    """Testmodus: liefert gespeicherte echte PoB-Ergebnisse."""

    def __init__(self, path):
        self.f = json.load(open(path, encoding='utf-8'))

    def load_character(self, *a):
        time.sleep(0.4)
        return dict(self.f['char'])

    def load_link(self, link):
        return dict(self.f['char'])

    def sheet(self):
        return self.f['sheet']

    def gems(self):
        return self.f['gems']

    def char_tree(self):
        return self.f['tree']

    def gem_colors(self, names):
        return self.f.get('colors', {})

    def upgrades(self, req):
        # Testdaten im Format der echten PoB-Rechnung
        alt = {'dps': 1000000, 'ehp': 30000, 'life': 4200, 'es': 0, 'ign': 700000, 'hit': 300000}
        def it(slot, name, base, dps, ehp, rar='UNIQUE', lines=None, typ='Gloves', req=60):
            return {'slot': slot, 'name': name, 'base': base, 'rarity': rar, 'typ': typ, 'req': req, 'cur': 'Damnation Grip', 'curRarity': 'RARE',
                    'neu': {'dps': alt['dps'] * (1 + dps / 100), 'ehp': alt['ehp'] * (1 + ehp / 100), 'life': 4200 + ehp * 10, 'ign': alt['ign'] * (1 + dps / 90)},
                    'lines': lines or [{'t': '+80 to maximum Life', 'k': 'm'}]}
        if req.get('mode') == 'warum':
            d = lambda f: {'FullDPS': 1e6 * f, 'TotalDPS': 3e5 * f, 'IgniteDPS': 7e5 * f, 'CritChance': 14.3, 'FireEffMult': 0.82 * f, 'FireDotEffMult': 0.8 * f, 'Life': 4200, 'TotalEHP': 30000 / f ** .2, 'FireResist': 76, 'ChaosResist': 2 + 30 * (f - 1)}
            return {'alt': d(1), 'neu': d(1.43), 'name': 'Morbid Grasp', 'base': 'Sorcerer Gloves', 'rarity': 'RARE', 'typ': 'Gloves',
                    'neuZeilen': [{'t': 'Inflict Fire Exposure on Hit, applying -11% to Fire Resistance', 'k': 'i', 'dps': 31.2, 'ehp': 0, 'speed': 0},
                                  {'t': 'Ignites you inflict spread to other Enemies within 1.2 metres', 'k': 'i', 'x': True, 'dps': 0, 'ehp': 0, 'speed': 0},
                                  {'t': 'Adds 9 to 15 Fire Damage to Attacks', 'k': 'm', 'dps': 0, 'ehp': 0, 'speed': 0},
                                  {'t': '+28 to maximum Life', 'k': 'm', 'dps': 0, 'ehp': 1.2, 'speed': 0},
                                  {'t': '+34% to Chaos Resistance', 'k': 'm', 'dps': 0, 'ehp': 4.1, 'speed': 0}],
                    'curZeilen': [{'t': '15% of Physical Damage Converted to Fire Damage', 'k': 'i', 'dps': 0.1, 'ehp': 0, 'speed': 0},
                                  {'t': 'While a Unique Enemy is in your Presence, Ignites you inflict spread to other Enemies within 1.6 metres', 'k': 'i', 'x': True, 'dps': 0, 'ehp': 0, 'speed': 0},
                                  {'t': '33% of Physical Damage Converted to Fire Damage', 'k': 'm', 'dps': 0.3, 'ehp': 0, 'speed': 0},
                                  {'t': '73% increased Armour and Energy Shield', 'k': 'm', 'dps': 0, 'ehp': 6.2, 'speed': 0}]}
        if req.get('mode') == 'modwert':
            import random as _r
            rr = _r.Random(len(req.get('mods') or []))
            return {'res': [{'id': m['id'], 'dps': rr.choice([0, 0, 0, 1.2, 3.4, 6.1, 9.8]), 'ehp': rr.choice([0, 0, 2.1, 4.5]), 'speed': 0, 'nb': []} for m in req.get('mods') or []]}
        if req.get('mode') == 'modpool':
            return {'base': 'Sorcerer Gloves', 'name': 'Damnation Grip', 'mods': [{'id': 'IncreasedLife7', 'typ': 'Prefix', 'lvl': 73, 'text': '+89 to maximum Life'},
                    {'id': 'FireResist8', 'typ': 'Suffix', 'lvl': 82, 'text': '+48% to Fire Resistance'}, {'id': 'AttackSpeed4', 'typ': 'Suffix', 'lvl': 76, 'text': '16% increased Attack Speed'}]}
        if req.get('mode') == 'mods':
            out = []
            for i, m in enumerate(req['mods']):
                calc = 'Double Damage' in m['text'] or 'Life' in m['text'] or 'Speed' in m['text']
                out.append({'id': m['id'], 'n': 1 if calc else 0, 'extra': [] if calc else [m['text']],
                            'neu': dict(alt, dps=alt['dps'] * (1.07 if 'Double' in m['text'] else 1), ehp=alt['ehp'] * (1.06 if 'Life' in m['text'] else 1)) if calc else None})
            return {'alt': alt, 'mods': out}
        if req.get('mode') == 'basis':
            cl = [{'t': '25% of Physical Damage Converted to Fire Damage', 'k': 'i'}, {'t': 'Ignites you inflict spread to other Enemies within 1.5 metres', 'k': 'i', 'x': True},
                  {'t': '+92 to maximum Life', 'k': 'm'}, {'t': '+38% to Fire Resistance', 'k': 'm'}]
            sl = [{'slot': 'Gloves', 'name': 'Damnation Grip', 'base': 'Sorcerer Gloves', 'rarity': 'RARE', 'typ': 'Gloves', 'sub': '', 'req': 72, 'lines': cl,
                   'ohne': {'dps': 860000, 'ehp': 28800}},
                  {'slot': 'Ring 1', 'name': 'Rune Loop', 'base': 'Coral Ring', 'rarity': 'RARE', 'typ': 'Ring', 'sub': '', 'req': 16, 'lines': [{'t': '+24 to maximum Life', 'k': 'i'}], 'ohne': {'dps': 1000000, 'ehp': 29500}},
                  {'slot': 'Flask 4', 'name': 'Quicksilver Flask', 'base': 'Quicksilver Flask', 'rarity': 'MAGIC', 'typ': 'Flask', 'sub': 'Utility', 'req': 4, 'lines': [], 'ohne': {'dps': 1000000, 'ehp': 30000}}]
            return {'alt': alt, 'slots': sl, 'guide': [dict(it('Gloves', 'Morbid Grasp', 'Sorcerer Gloves', 6.2, -3.1, 'RARE', lines=[{'t': 'Ignites you inflict spread to other Enemies within 1.2 metres', 'k': 'i', 'x': True}]), mods=[], i=0)]}
        t = req.get('typ')
        if t == 'FlaskMagic':
            return {'scan': [it('Flask 4', 'Alchemist\'s Diamond Flask', 'Diamond Flask', 4.1, 0, 'MAGIC', [{'t': '25% increased effect', 'k': 'm'}], 'Flask', 27)]}
        if t == 'Flask':
            return {'gesamt': 2, 'scan': [it('Flask 4', "Cinderswallow Urn", 'Silver Flask', 9.4, 1.2, lines=[{'t': 'Enemies Ignited by you during Effect take 10% increased Damage', 'k': 'm'}], typ='Flask'),
                                          it('Flask 4', "Oriath's End", 'Bismuth Flask', 2.4, 0, typ='Flask')]}
        if t == 'Ring':
            return {'gesamt': 1, 'scan': [dict(it('Ring 1', 'Polaric Devastation', 'Gold Ring', 14.8, 2.0, typ='Ring', req=48), cur='Rune Loop')]}
        if t == 'Wunsch':
            return {'scan': [dict(it('Amulet', 'Aul\'s Uprising', 'Onyx Amulet', 3.3, 6.0, typ='Amulet'), cur='Dread Beads')]}
        return {'gesamt': 0, 'scan': []}

    def compare(self, text):
        if 'Belt' in text:
            return self.f['cmp_belt']
        if 'Wand' in text:
            return self.f['cmp_wand']
        if 'Jewel' in text:
            return self.f['cmp_jewel_guide']
        return self.f['cmp_helmet']


class Worker(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.jobs = queue.Queue()
        self.engines = {}
        self.guide_cache = {}

    def game(self):
        p = S.active_profile() or {}
        return 'poe2' if p.get('game') == 'poe2' else 'poe1'

    def eng(self, game=None):
        game = game or self.game()
        if game not in self.engines:
            st = lambda t: S.set_status(text=t, busy=True)
            if FAKE:
                self.engines[game] = FakeEngine(FAKE)
            elif game == 'poe2':
                import engine2
                self.engines[game] = engine2.PoB2(status=st)
            else:
                import engine
                self.engines[game] = engine.PoB(status=st)
        return self.engines[game]

    @property
    def pob(self):
        return self.eng()

    def run(self):
        try:
            self.eng()
            S.set_status(text='Bereit', busy=False, ready=True)
            if S.active_profile():
                self.jobs.put(('load', None))
            if not FAKE and os.path.exists(os.path.join(DATA, 'selftest_poe2.txt')):
                self.jobs.put(('selftest2', None))  # nach dem Laden, nie gleichzeitig (PoB wechselt das Arbeitsverzeichnis)
        except Exception as e:
            log(traceback.format_exc())
            S.set_status(text='Path of Building konnte nicht starten', busy=False, error=str(e))
            return
        while True:
            art, wert = self.jobs.get()
            try:
                if art == 'load':
                    self.lade_profil()
                elif art == 'item':
                    self.item(wert)
                elif art == 'upgscan':
                    self.upg_scan(wert)
                elif art == 'upgpreise':
                    self.upg_preise(wert)
                elif art == 'selftest2':
                    try:
                        import selbsttest2   # nur in der Entwickler-Fassung vorhanden
                    except ImportError:
                        selbsttest2 = None
                    if selbsttest2:
                        selbsttest2.run(log, BASE, S.active_profile(), S.settings)
                elif art == 'pob':
                    req, antwort = wert
                    try:
                        antwort.put(self.pob.upgrades(req) if hasattr(self.pob, 'upgrades') else {'error': 'nicht verfügbar'})
                    except Exception as e:
                        log('PoB-Anfrage %s: %s' % (req.get('mode'), str(e)[:300]))
                        antwort.put({'error': str(e)[:200]})
                elif art in ('warum', 'wicker'):
                    args, antwort = wert
                    try:
                        antwort.put(self.warum(*args) if art == 'warum' else self.wickerman())
                    except Exception as e:
                        log(traceback.format_exc())
                        antwort.put({'error': str(e)[:200]})
                elif art == 'timeless':
                    req, antwort = wert
                    try:
                        if self.game() != 'poe1' or not hasattr(self.pob, 'timeless'):
                            antwort.put({'error': 'Timeless-Juwelen gibt es im Companion bisher nur für PoE 1.'})
                        elif not S.char:
                            antwort.put({'error': 'Bitte zuerst einen Charakter laden.'})
                        else:
                            t0 = time.time()
                            r = self.pob.timeless(req)
                            r['ms'] = int((time.time() - t0) * 1000)
                            antwort.put(r)
                    except Exception as e:
                        log(traceback.format_exc())
                        antwort.put({'error': str(e)[:200]})
            except Exception as e:
                log(traceback.format_exc())
                S.set_status(text='Fehler', busy=False, error=str(e).splitlines()[0][:220])

    def guide_xml(self, g):
        g = (g or '').strip()
        if not g:
            return None
        if g not in self.guide_cache:
            if FAKE:
                self.guide_cache[g] = self.pob.f['guide_xml']
            else:
                import engine
                code = engine.guide_code(g)
                self.guide_cache[g] = engine.code_to_xml(code)
        return self.guide_cache[g]

    FLASK_MAGIC = ['Diamond', 'Silver', 'Sulphur', 'Bismuth', 'Jade', 'Granite', 'Quicksilver', 'Basalt', 'Amethyst', 'Ruby', 'Sapphire', 'Topaz', 'Quartz', 'Stibnite', 'Aquamarine']

    def upgrades_rechnen(self, g, sheet):
        """Nächste Upgrades: Guide-Items, alle passenden Uniques und Flasks – jedes Item rechnet Path of Building komplett
        (Implicits, Umwandlung, Ignite, Flask-Wirkung) gegen deine aktuelle Ausrüstung."""
        S.upgrades = None
        if not hasattr(self.pob, 'upgrades'):
            return
        poe2 = self.game() == 'poe2'
        titel, items = '', []
        if g:
            stufe = None
            try:
                t = S.tree
                si = S.settings.get('treeStage')
                si = si if (t and si is not None and si < len(t['plans'])) else (t and t.get('sel'))
                stufe = t['plans'][si]['title'] if t and si is not None else None
            except Exception:
                stufe = None
            titel, items = guide.guide_items(self.guide_xml(g), stufe)
        t0 = time.time()
        r = self.pob.upgrades({'mode': 'basis', 'items': [{'slot': a, 'text': b, 'i': i} for i, (a, b) in enumerate(items)]})
        if r.get('error'):
            log('Upgrades: %s' % r['error'][:300])
            return
        alt, lvl = r['alt'], (sheet or {}).get('level') or 0
        def p(a, b):
            return round((b - a) / a * 100, 1) if a else 0.0
        slots = {}
        for x in r['slots']:
            o = x.get('ohne')
            x['wert'] = {'dps': p(o['dps'], alt['dps']) if o else 0, 'ehp': p(o['ehp'], alt['ehp']) if o else 0}
            if o and o.get('allHit') and alt.get('allHit'):
                # Anteil Physical/Fire am Treffer mit und ohne dieses Teil – zeigt, ob eine Umwandlung überhaupt noch etwas bewirkt
                x['wert']['phys'] = [round(alt['phys'] / alt['allHit'] * 100, 1), round(o['phys'] / o['allHit'] * 100, 1)]
                x['wert']['fire'] = [round(alt['fireHit'] / alt['allHit'] * 100, 1), round(o['fireHit'] / o['allHit'] * 100, 1)]
            x.pop('ohne', None)
            slots[x['slot']] = x
        # Flask, die am wenigsten bringt (Life/Mana-Flasks bleiben): dort wird jede neue Flask ausprobiert
        def schwaechster(pre, ausser=()):
            fl = [x for x in r['slots'] if x['slot'].startswith(pre)]
            leer = [x for x in fl if not x['name']]
            nutz = [x for x in fl if x['name'] and x.get('sub') not in ausser]
            return (leer[0] if leer else min(nutz, key=lambda x: x['wert']['dps'] + x['wert']['ehp'] * .6) if nutz else (fl[-1] if fl else {'slot': pre + ' 1'}))['slot']
        fslot = schwaechster('Flask', ('Life', 'Mana', 'Hybrid'))
        cslot = schwaechster('Charm') if poe2 else None
        typen = ['Gloves', 'Boots', 'Helmet', 'Body Armour', 'Amulet', 'Ring', 'Belt', 'Flask'] + (['Charm'] if poe2 else [])
        for w in ('Weapon 1', 'Weapon 2'):
            t = (slots.get(w) or {}).get('typ')
            if t and t not in typen:
                typen.append(t)
        U = {'set': titel, 't': time.time(), 'level': lvl, 'alt': alt, 'slots': slots, 'flaskSlot': fslot, 'charmSlot': cslot, 'game': self.game(), 'profil': (S.active_profile() or {}).get('id'),
             'guide': r['guide'], 'scan': {}, 'fertig': 0, 'gesamt': 0, 'laeuft': True, 'gen': time.time(),
             'quellen': {x['slot'] + '|' + x['name']: {'text': items[x['i']][1]} for x in r['guide'] if x.get('i') is not None and x['i'] < len(items)}}
        S.upgrades = U
        self.upg_liste()
        log('Upgrades: %d Guide-Items (%s), Flask zum Tauschen: %s, %d ms – starte Unique-Scan für %s; Basis DPS %.0f, Ignite %.0f, Treffer %.0f, Fire-Anteil %.0f%%, Ignite-Build=%s' % (
            len(r['guide']), titel, fslot, int((time.time() - t0) * 1000), ', '.join(typen), alt['dps'], alt.get('ign', 0), alt.get('hit', 0),
            (alt.get('fireHit', 0) / alt['allHit'] * 100) if alt.get('allHit') else 0, self.ignite_build(alt)))
        wunsch = [w.strip() for w in (S.settings.get('upgWunsch') or []) if w.strip()]
        auftraege = ([] if poe2 else [('FlaskMagic', 1)]) + [(t, 1) for t in typen] + ([('Wunsch', 1)] if wunsch else [])
        U['auftraege'] = auftraege
        self.jobs.put(('upgscan', U['gen']))

    def upg_scan(self, gen):
        U = S.upgrades
        if not U or U.get('gen') != gen or not U.get('auftraege'):
            return
        typ, von = U['auftraege'][0]
        req = {'mode': 'scan', 'typ': typ, 'von': von, 'n': 30, 'flaskSlot': U['flaskSlot'], 'charmSlot': U.get('charmSlot')}
        if typ == 'FlaskMagic':
            req['texte'] = ["Rarity: MAGIC\nAlchemist's %s Flask\nQuality: 20\n25%% increased effect\n33%% reduced Duration" % f for f in self.FLASK_MAGIC]
        if typ == 'Wunsch':
            req['namen'] = [w.strip() for w in (S.settings.get('upgWunsch') or []) if w.strip()]
        t0 = time.time()
        try:
            r = self.pob.upgrades(req)
        except Exception as e:
            log('Upgrade-Scan %s: %s' % (typ, e))
            r = {'scan': []}
        if r.get('error'):
            log('Upgrade-Scan %s: %s' % (typ, r['error'][:300]))
        if S.upgrades is not U:
            return
        for x in r.get('scan') or []:
            x['quelle'] = 'wunsch' if typ == 'Wunsch' else 'flask' if typ.startswith('Flask') else 'unique'
            if typ == 'FlaskMagic':
                t = next((t for t in req['texte'] if (x.get('base') or '#') in t), None)
                U.setdefault('quellen', {})[x['slot'] + '|' + x['name']] = {'text': t}
            else:
                U.setdefault('quellen', {})[x['slot'] + '|' + x['name']] = {'uname': x['name']}
            U['scan'][x['slot'] + '|' + x['name']] = x
        ges = r.get('gesamt') or 0
        U['auftraege'].pop(0)
        if typ not in ('FlaskMagic', 'Wunsch') and von + 30 <= ges:
            U['auftraege'].insert(0, (typ, von + 30))
        U['fertig'] += len(r.get('scan') or [])
        U['laeuft'] = bool(U['auftraege'])
        self.upg_liste()
        U['t'] = time.time()
        S.bump()
        if U['laeuft']:
            self.jobs.put(('upgscan', gen))
        else:
            if not U.get('preiseGeholt'):
                U['preiseGeholt'] = True
                self.jobs.put(('upgpreise', gen))
            log('Upgrade-Scan fertig: %d Items gerechnet, %d Vorschläge, zuletzt %s in %d ms' % (U['fertig'], len(U['list']), typ, int((time.time() - t0) * 1000)))
            log('Upgrade-Top: ' + ' | '.join('%s: %s (%s) DPS %+.1f%% eHP %+.1f%% statt %s' % (v['slot'], v.get('name') or v['art'], v['art'], v.get('dps', 0), v.get('ehp', 0), v.get('cur')) for v in U['list'][:15]))
            if not getattr(self, '_warum_test', False):  # einmal prüfen, dass Erklärung und Wickerman in PoB laufen
                self._warum_test = True
                try:
                    v = next((v for v in U['list'] if v.get('name')), None)
                    if v:
                        t1 = time.time(); w = self.warum(v['slot'], v['name'])
                        log('Erklär-Test %s: %s, %d Werte, %d/%d Zeilen, Trade-Mods %s, %d ms' % (v['name'], w.get('error') or 'ok', len(w.get('diff') or []), len(w.get('neuZeilen') or []), len(w.get('curZeilen') or []), w.get('tradeMods'), int((time.time() - t1) * 1000)))
                        log('Erklär-Test Zeilen: %s' % ' | '.join('%s DPS %s eHP %s' % (z['t'][:50], z.get('dps'), z.get('ehp')) for z in (w.get('neuZeilen') or [])[:8]))
                    t1 = time.time(); wk = self.wickerman()
                    log('Wickerman-Test: %s, %d ms, Top: %s' % (wk.get('error') or 'ok', int((time.time() - t1) * 1000), ' | '.join('%s DPS %s eHP %s berechnet=%s' % (x['name'], x['dps'], x['ehp'], x['berechnet']) for x in (wk.get('liste') or [])[:8])))
                except Exception:
                    log('Erklär-Test: ' + traceback.format_exc()[-500:])
            gl = U['slots'].get('Gloves') or {}
            log('Handschuhe aktuell: %s, Mods-Wert DPS %s%% eHP %s%%, Zeilen: %s' % (gl.get('name'), (gl.get('wert') or {}).get('dps'), (gl.get('wert') or {}).get('ehp'), ' / '.join(('[nicht berechnet] ' if l.get('x') else '') + ('[impl] ' if l['k'] == 'i' else '') + l['t'] for l in gl.get('lines') or [])))

    # Wirkungen, die Path of Building nicht in DPS/eHP umrechnet, die aber viel ausmachen. (Muster, Name, Punkte, Bedingung)
    EFFEKTE = [
        (r'Ignites? you inflict spread', 'Ignite breitet sich aus', 30, 'ignite'),
        (r'Ignites? .*spread|spread .*Ignite', 'Ignite breitet sich aus', 30, 'ignite'),
        (r'Burning Ground|Ignited Enemies .*explode|Enemies you Kill .*[Ee]xplode|[Ee]xplode .*Damage', 'Explosionen beim Töten (Clear)', 12, ''),
        (r'Culling Strike', 'Culling Strike', 6, ''),
        (r'[Cc]annot be (Frozen|Chilled|Shocked|Stunned)|[Ii]mmun(e|ity) to (Freeze|Chill|Shock|Curses|Ignite)', 'Schutz vor Ailments/Stun', 8, ''),
        (r'[Cc]orrupted Blood cannot|Maim', 'Schutz vor Bleed/Maim', 5, ''),
        (r'[Ll]eech|Recoup|Life Regeneration|Life Recovery', 'Erholung (Leech/Regen)', 4, ''),
        (r'[Aa]void|Suppress', 'Ausweichen/Suppress', 5, ''),
        (r'Rare Monster.*Modifiers|Shrine Buff', 'Buffs beim Töten von Rares', 6, ''),
        (r'Elusive|Phasing', 'Elusive/Phasing', 5, ''),
        (r'Endurance Charge|Frenzy Charge|Power Charge', 'Charges', 5, ''),
        (r'Pierce|Fork|Chain|additional Projectile', 'Projektile (Clear)', 4, ''),
        (r'Debilitate|Withered', 'Debuffs auf Gegner', 4, ''),
        (r'Eat a Soul|Onslaught', 'Tempo-Buffs', 4, ''),
    ]

    def ignite_build(self, alt):
        # Ignite-Build: nennenswerter Ignite-Schaden oder überwiegend Fire-Treffer (Elementalist kann mit allem igniten)
        fire = (alt.get('fireHit') or 0) / alt['allHit'] if alt.get('allHit') else 0
        return (alt.get('ign') or 0) > (alt.get('dps') or 1) * 0.1 or fire >= 0.5 or bool(S.settings.get('upgIgnite'))

    def wirkungen(self, lines, igniteBuild):
        out = []
        for l in lines or []:
            if not l.get('x'):
                continue
            for muster, name, pkt, bed in self.EFFEKTE:
                if bed == 'ignite' and not igniteBuild:
                    continue
                if re.search(muster, l['t']):
                    # Eldritch-Implicits mit Bedingung („While a Unique Enemy is in your Presence“) wirken nur bei Bossen: halb so viel wert
                    if re.search(r'Unique Enemy is in your Presence|Pinnacle Atlas Boss', l['t']):
                        name, pkt = name + ' (nur bei Bossen)', pkt // 2
                    if not any(o['name'] == name for o in out):
                        out.append({'name': name, 'pkt': pkt, 't': l['t']})
                    break
        return out

    KLASSE = {'Gloves': 'Gloves', 'Boots': 'Boots', 'Helmet': 'Helmets', 'Body Armour': 'Body Armours', 'Amulet': 'Amulets', 'Ring': 'Rings',
              'Belt': 'Belts', 'Charm': 'Charms', 'Quarterstaff': 'Quarterstaves', 'Crossbow': 'Crossbows', 'Spear': 'Spears', 'Focus': 'Foci', 'Buckler': 'Bucklers', 'Wand': 'Wands', 'Shield': 'Shields', 'Quiver': 'Quivers', 'Flask': 'Flasks', 'Dagger': 'Daggers', 'Claw': 'Claws',
              'Sceptre': 'Sceptres', 'Staff': 'Staves', 'Bow': 'Bows', 'One Handed Sword': 'One Hand Swords', 'Two Handed Sword': 'Two Hand Swords',
              'One Handed Axe': 'One Hand Axes', 'Two Handed Axe': 'Two Hand Axes', 'One Handed Mace': 'One Hand Maces', 'Two Handed Mace': 'Two Hand Maces',
              'Rune Dagger': 'Rune Daggers', 'Warstaff': 'Warstaves', 'Thrusting One Handed Sword': 'Thrusting One Hand Swords'}

    def trade_url(self, r, zeilen):
        """Trade-Suche für genau dieses Item: Uniques über den Namen, sonst über die Mods, die dir wirklich etwas bringen."""
        lg = ((S.char or {}).get('info') or {}).get('league') or 'Standard'
        import pricecheck
        pricecheck.SPIEL = self.game()
        if r.get('rarity') == 'UNIQUE':
            q = {'query': {'status': {'option': 'online'}, 'name': r['name'], 'type': r.get('base')}, 'sort': {'price': 'asc'}}
            gewaehlt = []
        else:
            ign = self.ignite_build(S.upgrades.get('alt') or {}) if S.upgrades else False
            sel, gewaehlt = [], []
            for i, z in enumerate(zeilen):
                wichtig = (z.get('dps') or 0) >= 0.5 or (z.get('ehp') or 0) >= 0.5 or (z.get('speed') or 0) >= 1 or self.wirkungen([z], ign)
                if wichtig and z.get('k') != 'e':
                    sel.append(i); gewaehlt.append(z['t'])
            item = {'klasse': self.KLASSE.get(r.get('typ'), ''), 'rarity': r.get('rarity'), 'base': r.get('base'),
                    'pmods': [{'k': 'impl' if z.get('k') == 'i' else 'expl', 't': z['t']} for z in zeilen]}
            try:
                q, unbekannt = pricecheck.query(item, 0.1, sel=sel, base=r.get('typ') in ('Flask', 'Charm'))
                gewaehlt = [t for t in gewaehlt if t not in unbekannt]
            except Exception as e:
                log('Trade-Link: %s' % e)
                q = {'query': {'status': {'option': 'online'}}, 'sort': {'price': 'asc'}}
        return pricecheck.web(lg, q=q), gewaehlt

    STATS = [('FullDPS', 'Gesamt-DPS', 'zahl'), ('TotalDPS', 'Treffer-DPS', 'zahl'), ('IgniteDPS', 'Ignite-DPS', 'zahl'), ('BleedDPS', 'Bleed-DPS', 'zahl'),
             ('PoisonDPS', 'Poison-DPS', 'zahl'), ('TotalDot', 'DoT-DPS', 'zahl'), ('ImpaleDPS', 'Impale-DPS', 'zahl'), ('AverageHit', 'Ø Treffer', 'zahl'),
             ('Speed', 'Angriffe/Zauber pro Sekunde', 'dez'), ('CritChance', 'Crit-Chance', 'pct'), ('CritMultiplier', 'Crit-Multiplikator', 'mult'),
             ('HitChance', 'Trefferchance', 'pct'), ('IgniteChanceOnHit', 'Ignite-Chance', 'pct'),
             ('FireEffMult', 'Fire-Schaden gegen Gegner-Resistenz', 'mult'), ('ColdEffMult', 'Cold-Schaden gegen Gegner-Resistenz', 'mult'),
             ('LightningEffMult', 'Lightning-Schaden gegen Gegner-Resistenz', 'mult'), ('PhysicalEffMult', 'Physical-Schaden gegen Gegner', 'mult'),
             ('ChaosEffMult', 'Chaos-Schaden gegen Gegner-Resistenz', 'mult'), ('FireDotEffMult', 'Fire-DoT (Ignite) gegen Gegner-Resistenz', 'mult'),
             ('Life', 'Leben', 'zahl'), ('EnergyShield', 'Energy Shield', 'zahl'), ('Mana', 'Mana', 'zahl'), ('Armour', 'Armour', 'zahl'), ('Evasion', 'Evasion', 'zahl'),
             ('TotalEHP', 'eHP', 'zahl'), ('FireResist', 'Fire-Res', 'res'), ('ColdResist', 'Cold-Res', 'res'), ('LightningResist', 'Lightning-Res', 'res'),
             ('ChaosResist', 'Chaos-Res', 'res'), ('BlockChance', 'Block', 'pct'), ('SpellBlockChance', 'Spell-Block', 'pct'),
             ('SpellSuppressionChance', 'Spell Suppression', 'pct'), ('MovementSpeedMod', 'Lauftempo', 'mult'), ('LifeRegenRecovery', 'Life-Regeneration', 'zahl'),
             ('Str', 'Stärke', 'zahl'), ('Dex', 'Geschick', 'zahl'), ('Int', 'Intelligenz', 'zahl')]

    def warum(self, slot, name):
        U = S.upgrades
        if not U:
            return {'error': 'Upgrades werden gerade noch gerechnet.'}
        qu = (U.get('quellen') or {}).get(slot + '|' + name)
        if not qu:
            return {'error': 'Für dieses Item gibt es keine Detail-Rechnung.'}
        r = self.pob.upgrades(dict(qu, mode='warum', slot=slot))
        if r.get('error'):
            return r
        diff = []
        for k, label, art in self.STATS:
            a, n = r['alt'].get(k), r['neu'].get(k)
            if a is None or n is None or abs(n - a) < 1e-9:
                continue
            rel = (n - a) / abs(a) * 100 if a else None
            if art in ('zahl',) and rel is not None and abs(rel) < 0.5:
                continue
            if art in ('pct', 'res') and abs(n - a) < 0.3:
                continue
            if art in ('mult', 'dez') and abs(n - a) < 0.005:
                continue
            diff.append({'k': k, 'label': label, 'art': art, 'alt': a, 'neu': n, 'rel': round(rel, 1) if rel is not None else None})
        ign = self.ignite_build(U.get('alt') or {})
        for z in r['neuZeilen'] + r['curZeilen']:
            for k in ('dps', 'ehp', 'speed'):
                if z.get(k) is not None:
                    z[k] = round(z[k], 1)
            w = self.wirkungen([z], ign)
            if w:
                z['wirkung'] = w[0]['name']
        url, gewaehlt = self.trade_url(r, r['neuZeilen'])
        return {'diff': diff, 'neuZeilen': r['neuZeilen'], 'curZeilen': r['curZeilen'], 'trade': url, 'tradeMods': gewaehlt,
                'skill': ((S.char or {}).get('sheet') or {}).get('skill') or ((S.char or {}).get('info') or {}).get('skill'),
                'klasse': ((S.char or {}).get('sheet') or {}).get('class')}

    # Wickerman (Covens of Umbra): Viscera geben deinem Charakter zusätzliche Mods. Bereiche (a-b) werden mit dem Höchstwert gerechnet.
    VISCERA = [
        ('Head', 'Goatman\'s Horn', 'Area Skills have (6-8)% chance to deal Double Damage'),
        ('Head', 'Greater General\'s Head', 'Gain (4-6)% of Maximum Life as Extra Maximum Energy Shield'),
        ('Head', 'Greater Ravenous Skull', '(16-24)% increased Damage if you have Consumed a corpse Recently'),
        ('Head', 'Greater Sirus\' Head', 'Enemies you Kill have a (5-10)% chance to Explode, dealing a tenth of their maximum Life as Damage of a Random Element'),
        ('Head', 'Greater Severed Rhoa Head', 'Every second, inflict Withered on Enemies within 6 metres for 5 seconds'),
        ('Head', 'Constrictor\'s Head', 'Skills fire an additional Projectile if you\'ve used a Movement Skill Recently'),
        ('Head', 'Greater Eater of Worlds\' Head', '+(5-10)% to Quality of all Skill Gems'),
        ('Head', 'Greater Bandit Rogue\'s Head', '(3-4)% increased Action Speed'),
        ('Head', 'Greater Incarnation of Fear\'s Head', 'Your Chaos Damage can Freeze'),
        ('Head', 'Greater Necromancer\'s Mask', 'Offerings you create also grant (15-20)% increased Damage'),
        ('Head', 'Pit Fighter\'s Helm', '(10-20)% chance to gain an Endurance Charge when you Block'),
        ('Head', 'Blazing Skull', 'When you Kill a Rare Monster, (20-30)% chance to gain one of its Modifiers for 10 seconds'),
        ('Head', 'Greater Engorged Eye', 'Corrupted Blood cannot be inflicted on you'),
        ('Torso', 'Greater Gemling Torso', '(30-35)% increased Energy Shield from Equipped Body Armour'),
        ('Torso', 'Greater Gladiator\'s Heart', '+(5-7) to Maximum Rage'),
        ('Torso', 'Greater Maven\'s Orrery', '+1 to maximum number of Sacred Wisps\n+1 to number of Sacred Wisps Summoned'),
        ('Torso', 'Distended Stomach', 'Eat a Soul when you Consume the corpse of a Rare Monster'),
        ('Upper Limb', 'Greater Warden\'s Arm', '(5-7)% more Maximum Life'),
        ('Upper Limb', 'Greater Inquisitor\'s Claw', '(15-20)% increased Effect of Withered'),
        ('Upper Limb', 'Greater Devourer\'s Antenna', 'Debilitate Enemies you Hit that are on Full Life for 4 seconds'),
        ('Upper Limb', 'Nightmarish Book of Depravity', '(2-3)% chance to gain an Endurance Charge on Hit'),
        ('Upper Limb', 'Artificial Appendage', '(15-20)% increased Area of Effect for Attacks'),
        ('Upper Limb', 'Ghostly Claw', '(8-12)% chance to gain Elusive on Kill'),
        ('Lower Limb', 'Skeletal Tail', 'Projectiles Pierce, Fork or Chain an additional time at random'),
        ('Lower Limb', 'Greater Skeletal Warrior\'s Leg', 'You and Allies within 5 metres deal 50 to 75 additional Cold Damage'),
        ('Lower Limb', 'Skeleton Wheel', '(10-12)% increased Attack and Cast Speed if you\'ve used a Movement Skill Recently'),
        ('Lower Limb', 'Greater Chitinous Leg', 'Enemies within 6 metres of corpses you spawned Recently have 100% reduced Life Regeneration Rate'),
    ]

    def wickerman(self):
        """Alle bekannten Viscera plus deine eigenen Einträge in PoB gegen deinen Build rechnen."""
        if self.game() == 'poe2':
            return {'error': 'poe2'}
        eigene = S.settings.get('wickerEigene') or []
        liste = [{'slot': a, 'name': b, 'text': c, 'eigen': False} for a, b, c in self.VISCERA] + \
                [{'slot': e.get('slot') or '–', 'name': e.get('name') or 'Eigener Mod', 'text': e.get('text', ''), 'eigen': True} for e in eigene]
        def hoch(t):
            return re.sub(r'\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\)', lambda m: m.group(2) if float(m.group(2)) >= float(m.group(1)) else m.group(1), t)
        r = self.pob.upgrades({'mode': 'mods', 'mods': [{'id': i, 'text': hoch(x['text'])} for i, x in enumerate(liste)]})
        if not getattr(self, '_wk_log', False):
            self._wk_log = True
            log('Wickerman roh: %s' % json.dumps(r)[:700])
        if r.get('error'):
            return {'error': r['error']}
        alt = r['alt']
        ign = self.ignite_build(alt)
        def p(a, b):
            return round((b - a) / a * 100, 1) if a else 0.0
        out = []
        for e in r['mods']:
            x = dict(liste[e['id']], id=e['id'])
            n = e.get('neu')
            x['dps'], x['ehp'] = (p(alt['dps'], n['dps']), p(alt['ehp'], n['ehp'])) if n else (0, 0)
            x['speed'] = round(((n.get('speed') or 0) - (alt.get('speed') or 0)) * 100, 1) if n and alt.get('speed') else 0
            x['berechnet'] = e['n'] > 0 and not e['extra']
            x['teil'] = e['n'] > 0 and bool(e['extra'])
            w = self.wirkungen([{'t': t, 'x': True} for t in e['extra']], ign)
            x['wirkung'] = [v['name'] for v in w]
            x['score'] = round(x['dps'] + x['ehp'] * 0.6 + x['speed'] * 0.8 + sum(v['pkt'] for v in w), 1)
            out.append(x)
        out.sort(key=lambda x: -x['score'])
        return {'liste': out, 't': time.time()}

    def upg_preise(self, gen):
        """Marktpreise der vorgeschlagenen Uniques holen (PoE2 über die Trade-Seite, PoE1 kommt von poe.ninja) und Budget setzen."""
        U = S.upgrades
        if not U or U.get('gen') != gen:
            return
        try:
            import pricecheck
            league = F.liga()
            pricecheck.SPIEL = self.game()
            r = pricecheck.rates(league) if league else {}
            U['divKurs'] = r.get('divine') or 0
            sc = (F.state.get('scan2') if self.game() == 'poe2' else F.state.get('scan')) or {}
            # Budget: halber Stash-Wert, mindestens 30 Divine – ohne Stash-Wert kein Limit
            U['budget'] = max(30, (sc.get('div') or 0) * 0.5) if sc.get('div') else 1e9
            U.setdefault('uPreise', {})
            if self.game() == 'poe2' and league:
                kandidaten = [v for v in U['list'] if v.get('rarity') == 'UNIQUE' and not v.get('preis') and v['name'] not in U['uPreise']][:10]
                for v in kandidaten:
                    try:
                        U['uPreise'][v['name']] = pricecheck.unique_preis(v['name'], v.get('base'), league)
                    except Exception as e:
                        log('Unique-Preis %s: %s' % (v['name'], str(e)[:120]))
                        break
            if S.upgrades is U:
                self.upg_liste()
                S.bump()
                log('Upgrade-Preise: %s, Budget %s div' % (', '.join('%s %s' % (k, v) for k, v in list(U['uPreise'].items())[:10]), round(U['budget']) if U['budget'] < 1e8 else 'offen'))
        except Exception as e:
            log('Upgrade-Preise: %s' % str(e)[:200])

    def upg_liste(self):
        """Aus allen Rechnungen die Vorschlagsliste bauen (bester Gewinn zuerst)."""
        U = S.upgrades
        alt, lvl, slots = U['alt'], U['level'], U['slots']
        def p(a, b):
            return round((b - a) / a * 100, 1) if a else 0.0
        vor = []
        alle = [dict(x, quelle='guide') for x in U['guide']] + list(U['scan'].values())
        gesehen = set()
        for x in sorted(alle, key=lambda x: x['quelle'] != 'guide'):
            if x['name'] == x.get('cur') or (x['slot'], x['name']) in gesehen:
                continue
            gesehen.add((x['slot'], x['name']))
            n = x['neu']
            dps, ehp = p(alt['dps'], n['dps']), p(alt['ehp'], n['ehp'])
            if x['quelle'] != 'wunsch' and dps < 2 and ehp < 4 and x.get('cur') and not self.wirkungen(x.get('lines'), self.ignite_build(alt)):
                continue
            if lvl and x.get('req', 0) > lvl + 8 and x['quelle'] != 'wunsch':
                continue
            if x['slot'] == 'Ring 3' and not (slots.get('Ring 3') or {}).get('name'):
                continue   # dritter Ring-Slot ist bei dir nicht freigeschaltet – dort hilft kein Ring
            if x['quelle'] != 'wunsch' and dps <= 0.5 and ehp <= 0.5 and not self.wirkungen(x.get('lines'), self.ignite_build(alt)):
                continue   # bringt rechnerisch nichts
            if x['quelle'] == 'unique' and x.get('typ') not in ('Flask', 'Charm'):
                # Uniques nur, wenn sie deinem Build spürbar helfen – kleine Rechen-Gewinne sind meist Zufall und passen nicht zum Build
                wk = sum(w['pkt'] for w in self.wirkungen(x.get('lines'), self.ignite_build(alt)))
                if not ((dps >= 5 and ehp > -5) or (ehp >= 10 and dps > -3) or wk >= 10):
                    continue
            c = slots.get(x['slot']) or {}
            preis = F.preis_von(x['name']) if x.get('rarity') == 'UNIQUE' else None
            if preis is None and x.get('rarity') == 'UNIQUE':
                preis = (U.get('uPreise') or {}).get(x['name'])
            c0 = slots.get(x['slot']) or {}
            ign_build = self.ignite_build(alt)
            plus_w = self.wirkungen(x.get('lines'), ign_build)
            minus_w = [w for w in self.wirkungen(c0.get('lines'), ign_build) if not any(w['name'] == v['name'] for v in plus_w)]
            plus_w = [w for w in plus_w if not any(w['name'] == v['name'] for v in self.wirkungen(c0.get('lines'), ign_build))]
            texte = ' | '.join(l.get('t', '') for l in x.get('lines') or [])
            if re.search(r'Has 1 Socket', texte) and re.search(r'Socketed', texte):
                # PoB steckt deinen Hauptskill gedanklich hinein – mit nur einem Sockel passen deine Links aber nicht
                minus_w = minus_w + [{'name': 'Nur 1 Sockel: deine verlinkten Gems passen nicht hinein', 'pkt': round(max(dps, 0) * 0.8), 't': 'Has 1 Socket'}]
            effekt = sum(w['pkt'] for w in plus_w) - sum(w['pkt'] for w in minus_w)
            speed = round(((n.get('speed') or 0) - (alt.get('speed') or 0)) * 100, 1) if n.get('speed') and alt.get('speed') else 0
            if x.get('typ') in ('Flask', 'Charm'):
                # PoB rechnet Flasks als dauerhaft aktiv – im Spiel laufen sie nur einen Teil der Zeit: deutlich vorsichtiger gewichten
                score = min(dps, 40) * 0.7 + min(ehp, 40) * 0.25
            else:
                score = dps + ehp * 0.6 + speed * 0.8 + (20 if not x.get('cur') else 0) + (3 if x['quelle'] == 'guide' else 0)
            score += effekt
            if preis and x.get('rarity') == 'UNIQUE':
                # Preis mitdenken: teure Items rutschen nach unten, alles über deinem Budget fliegt raus
                dv = (U.get('divKurs') or 0)
                pdiv = preis / dv if dv else 0
                if pdiv and pdiv > U.get('budget', 1e9):
                    continue
                score -= 7 * math.log10(1 + pdiv)
            if ehp < -8:
                score -= abs(ehp) * 0.5  # viel weniger Verteidigung ist selten ein echtes Upgrade
            vor.append({'art': x['quelle'], 'slot': x['slot'], 'name': x['name'], 'base': x.get('base'), 'rarity': x.get('rarity'), 'typ': x.get('typ'),
                        'cur': x.get('cur'), 'curRarity': x.get('curRarity'), 'dps': dps, 'ehp': ehp, 'life': round(n['life'] - alt['life']),
                        'ign': p(alt.get('ign', 0), n.get('ign', 0)) if alt.get('ign') else None, 'mods': x.get('mods') or [],
                        'lines': x.get('lines') or [], 'curLines': c.get('lines') or [], 'curWert': c.get('wert'),
                        'preis': preis, 'req': x.get('req'), 'score': round(score, 1), 'speed': speed, 'effekt': effekt,
                        'wPlus': plus_w, 'wMinus': minus_w})
        for sl, c in slots.items():
            if sl.startswith('Flask') or sl.startswith('Charm') or sl == 'Ring 3':
                continue
            if not c['name'] and sl == 'Weapon 2':
                continue   # Nebenhand leer ist bei vielen Builds Absicht (Zweihänder, Speer + nichts)
            if not c['name'] and not any(v['slot'] == sl for v in vor):
                vor.append({'art': 'leer', 'slot': sl, 'score': 50})
            elif c['rarity'] != 'UNIQUE' and c['req'] and lvl and c['req'] < lvl - 35:
                g0 = next((v for v in vor if v['slot'] == sl), None)
                if g0:
                    g0['alt'] = c['req']
                    g0['score'] += 8
                else:
                    vor.append({'art': 'alt', 'slot': sl, 'cur': c['name'], 'base': c['base'], 'req': c['req'], 'score': 6 + (lvl - c['req']) / 10})
        vor.sort(key=lambda v: -v['score'])
        U['list'] = vor[:80]
        if not U.get('laeuft'):
            try:
                speichere('upgrades_cache.json', {k: U.get(k) for k in ('set', 't', 'level', 'list', 'fertig', 'flaskSlot', 'charmSlot', 'game', 'slots', 'profil')})
            except Exception:
                pass

    def lade_profil(self):
        p = S.active_profile()
        if not p:
            return
        if p.get('mode') == 'link':
            S.set_status(text='Lade Build…', busy=True, error='')
            info = self.pob.load_link(p.get('link', ''))
            if p.get('league'):
                info = dict(info or {}, league=p['league'])  # Liga fürs Preis-Check und Trade (steht nicht im Build-Code)
        else:
            S.set_status(text='Lade %s von pathofexile.com…' % p.get('char'), busy=True, error='')
            info = self.pob.load_character(p.get('account', ''), p.get('char', ''), p.get('realm') or 'pc')
        sheet, gems = self.pob.sheet(), self.pob.gems()
        S.char = {'profile': p['id'], 'info': info, 'sheet': sheet, 'gems': gems, 't': time.time()}
        S.tree = None
        g = p.get('guide') or (p.get('link') if p.get('mode') == 'link' else '')
        if g:
            S.set_status(text='Berechne Skilltree-Plan…')
            xml = self.guide_xml(g)
            ct = self.pob.char_tree()
            names = set(x['name'] for s in guide.guide_skillsets(xml) for grp in s['groups'] for x in grp['gems'])
            colors = self.pob.gem_colors(names)
            meta = {'name': info.get('char') or p.get('name'), 'level': sheet.get('level'), 'cls': sheet.get('class'),
                    'base': ct.get('base') or sheet.get('base', '')}
            S.tree = guide.erstelle_state(xml, ct, meta, gems, colors, 'poe2' if self.game() == 'poe2' else '3_29')
            try:
                baum_reihenfolge_start(S.tree, ct, 'poe2' if self.game() == 'poe2' else '3_29')
            except Exception:
                log(traceback.format_exc())
            if self.game() == 'poe2':
                fehlt = [n for n in ct.get('nodes') or [] if n not in guide.lade_graph('poe2')['types']]
                log('PoE2-Skilltree: %d Punkte, %d nicht im Baum (%s)' % (len(ct.get('nodes') or []), len(fehlt), ', '.join(fehlt[:8])))
        try:  # Gem-Werte Level 1→20 und Qualität für die Hover-Infos
            alle = set(x['name'] for grp in gems for x in grp.get('gems', []))
            if g:
                alle |= set(x['name'] for s in guide.guide_skillsets(self.guide_xml(g)) for grp in s['groups'] for x in grp['gems'])
            S.geminfo = self.pob.gem_info(alle) if hasattr(self.pob, 'gem_info') else {}
        except Exception as e:
            log('Gem-Infos: %s' % e)
        try:
            self.upgrades_rechnen(g, sheet)
        except Exception as e:
            log('Upgrades: %s' % traceback.format_exc()[-600:])
        if not getattr(self, '_tl_test', False) and hasattr(self.pob, 'timeless') and self.game() == 'poe1':
            self._tl_test = True
            try:  # Selbsttest Timeless-Juwelen (nur einmal, Ergebnis im Protokoll)
                t0 = time.time()
                m = self.pob.timeless({'action': 'meta'})
                so = (m.get('sockets') or [{}])[0].get('id')
                r = self.pob.timeless({'action': 'seed', 'type': 1, 'seed': 4000, 'socket': so}) if so else {}
                n = r.get('nodes') or []
                log('Timeless-Test: %d Typen, %d Sockel, GV 4000 an %s: %d Punkte, %d mit Effekt, Beispiel=%s (%d ms)' % (
                    len(m.get('types') or []), len(m.get('sockets') or []), so, len(n), len([x for x in n if x.get('e')]),
                    json.dumps(next((x for x in n if x.get('e')), {}))[:240], int((time.time() - t0) * 1000)))
            except Exception as e:
                log('Timeless-Test Fehler: %s' % str(e)[:400])
        S.set_status(text='Aktuell', busy=False, error='')
        log('Profil geladen: %s' % p.get('name'))
        if not FAKE and S.settings.get('priceCheck', True):
            import pricecheck
            pricecheck.SPIEL = self.game()
            pricecheck.vorladen((info or {}).get('league') or 'Standard')

    def item(self, text):
        if mapcheck.is_map(text):
            r = mapcheck.check(text, (S.char or {}).get('sheet'), S.settings.get('mapDisabled'), S.settings.get('mapWahl'))
        else:
            if not S.char:
                S.set_status(error='Noch kein Charakter geladen – im Hub unter „Profile“ einrichten.')
                return
            S.set_status(text='Rechne…', busy=True)
            # Preis sofort starten (parallel zu Path of Building) und das Popup schon mit Name + Preissuche zeigen
            vor = self.vorab(text)
            r = self.pob.compare(text)
            if vor:
                r['price'] = vor.get('price') or {'busy': True}
                vor['_ziel'] = r
                for k in ('klasse', 'pmods'):
                    if vor.get(k):
                        r[k] = vor[k]
            r['kind'] = 'item'
            try:
                r['affixe'] = affix_analyse(text, r, self.pob)
            except Exception as e:
                log('Affixe: %s' % e)
        r['t'] = time.time()
        r['raw'] = text[:4000]
        S.last = r
        if r.get('kind') == 'item' and r.get('results'):
            kurz = {k: r[k] for k in ('name', 'base', 'rarity', 'type', 'jewel', 't', 'kind') if k in r}
            best = max(r['results'], key=lambda x: (x['new']['dps'] - x['old']['dps']))
            kurz['dps'] = pct(best['old']['dps'], best['new']['dps'])
            kurz['ehp'] = pct(best['old']['TotalEHP'], best['new']['TotalEHP'])
            kurz['slot'] = best['slot']
            kurz['raw'] = r['raw']
            S.history.insert(0, kurz)
            del S.history[60:]
            speichere('history.json', S.history)
            S.full[str(r['t'])] = r
            keep = {str(h['t']) for h in S.history}
            S.full = {k: v for k, v in S.full.items() if k in keep}
            speichere('history_full.json', S.full)
        S.set_status(text='Fertig', busy=False, error='')
        if S.settings.get('popupOnCopy', True):
            WM.show('item')
        if r.get('kind') == 'item' and S.settings.get('priceCheck', True) and not FAKE and not r.get('price'):
            m = re.search(r'^Item Class: (.+)$', text, re.M)
            r['klasse'] = m.group(1).strip() if m else ''
            try:
                import pricecheck
                pm = pricecheck.mods_aus_text(text)
                if pm:
                    r['pmods'] = pm
            except Exception as e:
                log('Mods aus Text: %s' % e)
            r['price'] = {'busy': True}
            S.bump()
            threading.Thread(target=self.preis, args=(r,), daemon=True).start()

    def vorab(self, text):
        """Schnellstart der Preissuche direkt aus dem Item-Text, noch bevor Path of Building fertig ist."""
        if not S.settings.get('priceCheck', True) or FAKE:
            return None
        try:
            import pricecheck
            zeilen = [z.strip() for z in text.splitlines()]
            rar = next((z.split(':', 1)[1].strip().upper() for z in zeilen if z.startswith('Rarity:')), '')
            i = next((k for k, z in enumerate(zeilen) if z.startswith('Rarity:')), 0)
            name = zeilen[i + 1] if len(zeilen) > i + 1 else ''
            base = zeilen[i + 2] if len(zeilen) > i + 2 and not zeilen[i + 2].startswith('--') else name
            m = re.search(r'^Item Class: (.+)$', text, re.M)
            v = {'kind': 'item', 'name': name, 'base': base, 'rarity': rar, 'klasse': m.group(1).strip() if m else '',
                 'corrupted': 'Corrupted' in zeilen, 'pmods': pricecheck.mods_aus_text(text), 't': time.time(), 'raw': text[:4000]}
            if not v['pmods'] and rar != 'UNIQUE':
                return None
            v['price'] = {'busy': True}
            S.last = dict(v, vorab=True)
            S.bump()
            if S.settings.get('popupOnCopy', True):
                WM.show('item')
            threading.Thread(target=self.preis, args=(v,), daemon=True).start()
            return v
        except Exception as e:
            log('Preis-Schnellstart: %s' % e)
            return None

    def preis(self, r, sel=None, base=False):
        import pricecheck
        pricecheck.LOG = log
        pricecheck.SPIEL = self.game()
        try:
            league = ((S.char or {}).get('info') or {}).get('league') or 'Standard'
            tol = max(0.0, min(0.5, float(S.settings.get('priceTolerance', 15)) / 100))
            r['price'] = pricecheck.check(r, league, tol, sel, base)
            pr = r['price']
            log('Preis %s: %s Treffer, %s Angebote, %d Stufen, Mods=%s, unbekannt=%s, Auswahl=%s, Basis=%s, %s' % (
                r.get('name'), pr.get('total'), len(pr.get('prices') or []), len(pr.get('tiers') or []), pr.get('mods'),
                pr.get('skipped'), sel, base, pr.get('error') or pr.get('url', '')))
        except urllib.error.HTTPError as e:
            try:
                body = e.read().decode('utf-8', 'replace')[:300]
            except Exception:
                body = ''
            log('Preis: Trade-Seite %d %s' % (e.code, body))
            r['price'] = {'error': 'Trade-Seite antwortet mit Fehler %d%s' % (e.code, ' – zu viele Anfragen, kurz warten' if e.code == 429 else ''),
                          'auswahl': (r.get('price') or {}).get('auswahl')}
        except Exception as e:
            log(traceback.format_exc())
            r['price'] = {'error': str(e)[:160]}
        ziel = r.pop('_ziel', None)
        if ziel is not None:
            ziel['price'] = r['price']
            r = ziel
        elif S.last is not None and S.last.get('vorab') and S.last.get('raw') == r.get('raw'):
            S.last['price'] = r['price']
        try:
            ic = icons_waehrung()
            if ic and isinstance(r.get('price'), dict):
                r['price']['icons'] = ic
        except Exception:
            pass
        S.full[str(r['t'])] = r
        try:
            speichere('history_full.json', S.full)
        except Exception:
            pass
        S.bump()


def affix_analyse(text, r, pob):
    """Präfixe/Suffixe zählen (aus dem kopierten Itemtext) und für freie Plätze die wahrscheinlichsten Mods heraussuchen."""
    rar = (r.get('rarity') or '').upper()
    if rar not in ('MAGIC', 'RARE') or r.get('jewel'):
        return None
    p = len(re.findall(r'^\{ (?:Master Crafted )?Prefix Modifier', text, re.M))
    s_ = len(re.findall(r'^\{ (?:Master Crafted )?Suffix Modifier', text, re.M))
    if not p and not s_ and '{ ' not in text:
        return {'unbekannt': True}
    mx = 1 if rar == 'MAGIC' else 3
    if 'Prefix Modifier' not in text and 'Suffix Modifier' not in text and re.search(r'^\{ ', text, re.M) is None:
        return {'unbekannt': True}
    craft = bool(re.search(r'^\{ Master Crafted', text, re.M))
    out = {'p': p, 's': s_, 'max': mx, 'rarity': rar, 'craft': craft, 'corrupted': bool(r.get('corrupted'))}
    typen = [t for t, n in (('Prefix', p), ('Suffix', s_)) if n < mx]
    m = re.search(r'^Item Level: (\d+)', text, re.M)
    ilvl = int(m.group(1)) if m else (r.get('ilvl') or 84)
    if typen and hasattr(pob, 'affixe') and r.get('base') and not out['corrupted']:
        texte = [x.get('t', '') for x in r.get('mods', []) if x.get('k') != 'impl']
        try:
            out['frei'] = pob.affixe({'base': r['base'], 'ilvl': ilvl, 'typen': typen, 'texte': texte})
        except Exception as e:
            log('Affix-Liste: %s' % e)
    return out


def pct(a, b):
    return round((b - a) / abs(a) * 100, 2) if a else 0.0


W = Worker()
F = farm.Farm(S, lade, speichere, log, fake=bool(FAKE))


def stash_marktpreis(text):
    """Marktcheck für ein erfasstes Stash-Item (Rare, Juwel, Unique ohne poe.ninja-Preis) – gleiche Schätzung wie der Preis-Check."""
    import pricecheck
    pricecheck.LOG = log
    pricecheck.SPIEL = F.spiel()
    zeilen = [z.strip() for z in text.splitlines()]
    i = next((k for k, z in enumerate(zeilen) if z.startswith('Rarity:')), 0)
    rar = zeilen[i].split(':', 1)[1].strip().upper() if zeilen and ':' in zeilen[i] else ''
    name = zeilen[i + 1] if len(zeilen) > i + 1 else ''
    base = zeilen[i + 2] if len(zeilen) > i + 2 and not zeilen[i + 2].startswith('--') else name
    m = re.search(r'^Item Class: (.+)$', text, re.M)
    v = {'kind': 'item', 'name': name, 'base': base, 'rarity': rar, 'klasse': m.group(1).strip() if m else '',
         'corrupted': 'Corrupted' in zeilen, 'pmods': pricecheck.mods_aus_text(text), 'raw': text[:4000]}
    if not v['pmods'] and rar != 'UNIQUE':
        return None
    tol = max(0.0, min(0.5, float(S.settings.get('priceTolerance', 15)) / 100))
    pr = pricecheck.check(v, F.liga(), tol)
    sc = pr.get('schaetzung') or {}
    if not sc.get('c'):
        return None
    return {'c': sc['c'], 'lo': sc.get('lo'), 'hi': sc.get('hi'), 'sicher': sc.get('sicher'), 'n': len(pr.get('prices') or []), 'url': pr.get('url', '')}


F.markt_preis = stash_marktpreis
C = campaign.Campaign(S, lade, speichere, log)


# ---------------------------------------------------------------- Windows: Zwischenablage, Hotkeys, Fenster

class WinAPI:
    def __init__(self):
        import ctypes
        from ctypes import wintypes
        self.c, self.w = ctypes, wintypes
        self.u = ctypes.windll.user32
        self.k = ctypes.windll.kernel32
        self.u.GetClipboardData.restype = ctypes.c_void_p
        self.k.GlobalLock.restype = ctypes.c_void_p
        self.k.GlobalLock.argtypes = [ctypes.c_void_p]
        self.k.GlobalUnlock.argtypes = [ctypes.c_void_p]
        self.u.GetWindowTextLengthW.argtypes = [wintypes.HWND]
        self.u.GetWindowTextW.argtypes = [wintypes.HWND, ctypes.c_wchar_p, ctypes.c_int]
        self.u.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint]
        self.u.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
        self.u.SetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_long]
        self.u.SetLayeredWindowAttributes.argtypes = [wintypes.HWND, wintypes.DWORD, ctypes.c_ubyte, wintypes.DWORD]
        self.g = ctypes.windll.gdi32
        self.g.CreateRectRgn.restype = wintypes.HANDLE
        self.u.SetWindowRgn.argtypes = [wintypes.HWND, wintypes.HANDLE, wintypes.BOOL]
        self.u.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
        self.u.IsWindowVisible.argtypes = [wintypes.HWND]
        self.u.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]

    def clip_seq(self):
        return self.u.GetClipboardSequenceNumber()

    def clip_text(self):
        for _ in range(5):
            if self.u.OpenClipboard(None):
                break
            time.sleep(0.05)
        else:
            return None
        try:
            h = self.u.GetClipboardData(13)  # CF_UNICODETEXT
            if not h:
                return None
            p = self.k.GlobalLock(h)
            if not p:
                return None
            try:
                return self.c.wstring_at(p)
            finally:
                self.k.GlobalUnlock(h)
        finally:
            self.u.CloseClipboard()

    def find(self, title):
        res = []
        cb_t = self.c.WINFUNCTYPE(self.c.c_bool, self.w.HWND, self.w.LPARAM)

        def cb(h, _):
            n = self.u.GetWindowTextLengthW(h)
            if n:
                buf = self.c.create_unicode_buffer(n + 1)
                self.u.GetWindowTextW(h, buf, n + 1)
                if buf.value == title:
                    res.append(h)
            return True
        self.u.EnumWindows(cb_t(cb), 0)
        if len(res) > 1:  # mehrere Fenster mit gleichem Titel: das sichtbare nehmen
            vis = [h for h in res if self.u.IsWindowVisible(h)]
            return (vis or res)[0]
        return res[0] if res else None

    def find_all(self, title):
        res = []
        cb_t = self.c.WINFUNCTYPE(self.c.c_bool, self.w.HWND, self.w.LPARAM)

        def cb(h, _):
            n = self.u.GetWindowTextLengthW(h)
            if n:
                buf = self.c.create_unicode_buffer(n + 1)
                self.u.GetWindowTextW(h, buf, n + 1)
                if buf.value == title:
                    res.append(h)
            return True
        self.u.EnumWindows(cb_t(cb), 0)
        return res

    def inhalt(self, h):
        """Rechteck der eigentlichen Webseite (Chromium-Kindfenster) – genau dort beginnt der Inhalt, unabhängig von der Titelleistenhöhe."""
        best = []
        cb_t = self.c.WINFUNCTYPE(self.c.c_bool, self.w.HWND, self.w.LPARAM)

        def cb(k, _):
            buf = self.c.create_unicode_buffer(64)
            self.u.GetClassNameW(k, buf, 64)
            if buf.value == 'Chrome_RenderWidgetHostHWND' and self.u.IsWindowVisible(k):
                r = self.rect(k)
                if r[2] > 50 and r[3] > 50:
                    best.append(r)
            return True
        self.u.EnumChildWindows(self.w.HWND(h), cb_t(cb), 0)
        return max(best, key=lambda r: r[2] * r[3]) if best else None

    def programm(self, h, ico, relaunch=''):
        """Edge-Fenster als eigenes Programm zeigen: eigenes Icon und eigener Eintrag in der Taskleiste
        (AppUserModelID statt der von Edge), dazu Name und Icon fürs Anheften."""
        c, w = self.c, self.w
        if not getattr(self, '_hicon', None):
            self.u.LoadImageW.restype = c.c_void_p
            self.u.LoadImageW.argtypes = [c.c_void_p, c.c_wchar_p, c.c_uint, c.c_int, c.c_int, c.c_uint]
            self._hicon = (self.u.LoadImageW(None, ico, 1, 48, 48, 0x10), self.u.LoadImageW(None, ico, 1, 16, 16, 0x10))
            self.u.SendMessageW.argtypes = [w.HWND, c.c_uint, c.c_void_p, c.c_void_p]
            self.u.SendMessageW.restype = c.c_void_p
            try:
                c.windll.ole32.CoInitialize(None)
            except Exception:
                pass
        big, small = self._hicon
        if big:
            self.u.SendMessageW(h, 0x80, c.c_void_p(1), c.c_void_p(big))
        if small:
            self.u.SendMessageW(h, 0x80, c.c_void_p(0), c.c_void_p(small))
        import uuid

        class PKEY(c.Structure):
            _fields_ = [('fmtid', c.c_ubyte * 16), ('pid', c.c_uint32)]

        class PROPVARIANT(c.Structure):
            _fields_ = [('vt', c.c_ushort), ('r1', c.c_ushort), ('r2', c.c_ushort), ('r3', c.c_ushort), ('val', c.c_void_p), ('pad', c.c_void_p)]
        fmt = (c.c_ubyte * 16).from_buffer_copy(uuid.UUID('9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3').bytes_le)
        iid = (c.c_ubyte * 16).from_buffer_copy(uuid.UUID('886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99').bytes_le)
        store = c.c_void_p()
        sh = c.windll.shell32
        sh.SHGetPropertyStoreForWindow.argtypes = [w.HWND, c.c_void_p, c.POINTER(c.c_void_p)]
        if sh.SHGetPropertyStoreForWindow(h, c.byref(iid), c.byref(store)) != 0 or not store:
            return False
        vt = c.cast(store, c.POINTER(c.POINTER(c.c_void_p))).contents
        SetValue = c.WINFUNCTYPE(c.c_long, c.c_void_p, c.c_void_p, c.c_void_p)(vt[6])
        Commit = c.WINFUNCTYPE(c.c_long, c.c_void_p)(vt[7])
        Release = c.WINFUNCTYPE(c.c_ulong, c.c_void_p)(vt[2])
        halten = []
        try:
            for pid, text in ((2, relaunch), (4, 'PoE Companion'), (3, ico + ',0'), (5, 'PoECompanion.App')):
                if not text:
                    continue
                buf = c.create_unicode_buffer(text)
                halten.append(buf)
                pv = PROPVARIANT(31, 0, 0, 0, c.cast(buf, c.c_void_p), None)  # VT_LPWSTR
                SetValue(store, c.byref(PKEY(fmt, pid)), c.byref(pv))
            Commit(store)
        finally:
            Release(store)
        return True

    def rect(self, h):
        r = self.w.RECT()
        self.u.GetWindowRect(h, self.c.byref(r))
        return [r.left, r.top, r.right - r.left, r.bottom - r.top]


def pob_frage(req, timeout=120):
    """PoB-Rechnung über die Warteschlange des Rechenkerns (nie parallel zu anderen Rechnungen)."""
    antwort = queue.Queue()
    W.jobs.put(('pob', (req, antwort)))
    try:
        return antwort.get(timeout=timeout)
    except queue.Empty:
        return {'error': 'Path of Building antwortet nicht – bitte gleich nochmal.'}


_craft_preise = {'t': 0, 'p': {}, 'liga': ''}


def baum_reihenfolge_start(tree, ct, version):
    """Lern-Reihenfolge für den Skilltree: Schritt für Schritt der Weg mit dem meisten Nutzen pro Punkt (Path of Building rechnet)."""
    import guide, hashlib
    if not tree or not tree.get('plans'):
        return
    graph = guide.lade_graph(version)
    adj, types = graph['adj'], graph['types']
    plan = tree['plans'][tree.get('sel') or 0]
    ziel = [n for n in plan['target'] if n in types]
    start = next((n for n in (ct.get('nodes') or []) if types.get(str(n)) == 's'), None) or next((n for n in ziel if types.get(n) == 's'), None)
    if not start or not ziel:
        return
    start = str(start)
    key = hashlib.md5((version + start + ','.join(sorted(ziel))).encode()).hexdigest()[:12]
    pfad = os.path.join(DATA, 'baum3_%s.json' % key)
    tree['reihenfolge'] = {'status': 'rechnet', 'schritte': []}
    if os.path.exists(pfad):
        try:
            tree['reihenfolge'] = json.load(open(pfad, encoding='utf-8'))
            return
        except Exception:
            pass

    def job():
        t0 = time.time()
        T = set(ziel) | {start}
        have, schritte, punkte = {start}, [], 0
        try:
            for _runde in range(200):
                rest = T - have
                if not rest:
                    break
                prev, dist, q = {}, {n: 0 for n in have}, list(have)
                while q:
                    nq = []
                    for a in q:
                        for b in adj.get(a, []):
                            if b in T and b not in dist:
                                dist[b] = dist[a] + 1
                                prev[b] = a
                                nq.append(b)
                    q = nq
                erreichbar = [n for n in rest if n in dist]
                if not erreichbar:
                    break
                kand = sorted([n for n in erreichbar if types.get(n) in ('n', 'k', 'j')], key=lambda n: dist[n])[:24] + \
                    sorted([n for n in erreichbar if types.get(n) == 'o'], key=lambda n: dist[n])[:12]  # kleine Schadens-/Lebenspunkte in der Nähe zuerst mitnehmen
                if not kand:
                    # nur noch kleine Punkte übrig: als ein Schritt „Restliche Punkte“ zusammenfassen
                    rest_wege = sorted(erreichbar, key=lambda n: dist[n])
                    punkte += len(rest)
                    schritte.append({'ziel': rest_wege[0], 'nodes': sorted(rest, key=lambda n: dist.get(n, 99)), 'dps': 0, 'ehp': 0, 'punkte': punkte, 'level': punkte + 1, 'rest': True})
                    have |= rest
                    break

                def weg(n):
                    w = []
                    while n not in have:
                        w.append(n)
                        n = prev[n]
                    return w[::-1]
                wege = {n: weg(n) for n in kand}
                r = pob_frage({'mode': 'baumwert', 'basis': sorted(have, key=int), 'kand': [{'key': n, 'nodes': wege[n]} for n in kand]}, 300)
                werte = {x['key']: x for x in (r.get('res') or [])}

                vd, ve = max(1e-9, r.get('vollDps') or 0), max(1e-9, r.get('vollEhp') or 0)

                def sc(n):
                    # Nutzen gemessen am fertigen Build (sonst zählen frühe Prozente auf fast 0 DPS zu viel) – pro Punkt
                    x = werte.get(n) or {}
                    return ((x.get('dpsAbs') or 0) / vd * 100 + (x.get('ehpAbs') or 0) / ve * 60) / max(1, len(wege[n]))
                best = max(kand, key=sc)
                x = werte.get(best) or {}
                punkte += len(wege[best])
                schritte.append({'ziel': best, 'nodes': wege[best], 'dps': round((x.get('dpsAbs') or 0) / vd * 100, 2), 'ehp': round((x.get('ehpAbs') or 0) / ve * 100, 2),
                                 'punkte': punkte, 'level': punkte + 1})
                have |= set(wege[best])
                tree['reihenfolge'] = {'status': 'rechnet', 'schritte': schritte}
                S.bump()
            erg = {'status': 'fertig', 'schritte': schritte, 'zeit': round(time.time() - t0)}
            tree['reihenfolge'] = erg
            json.dump(erg, open(pfad, 'w', encoding='utf-8'))
            log('Skilltree-Reihenfolge: %d Schritte, %d Punkte in %d s' % (len(schritte), punkte, time.time() - t0))
        except Exception:
            tree['reihenfolge'] = {'status': 'fehler', 'schritte': schritte}
            log('Skilltree-Reihenfolge: ' + traceback.format_exc()[-400:])
        S.bump()
    threading.Thread(target=job, daemon=True).start()


def craft_pool_wert(base, ilvl, stufe='normal', rune=None):
    """Mod-Pool einer Basis und – mit aktivem PoE2-Charakter – was jeder Mod deinem Build bringt (Path of Building)."""
    import crafting
    r = crafting.pool(base, ilvl, stufe, rune)
    if r.get('error'):
        return r
    if S.char and W.game() == 'poe2':
        key = (r['basis']['n'], ilvl, S.char.get('t'), r.get('rune'))
        cache = S.__dict__.setdefault('_modwert', {})
        if key not in cache:
            mods = [{'id': m['id'], 'text': m['text']} for m in r['mods'] if m['quelle'] in ('normal', 'rune', 'desecrated')]
            cache[key] = pob_frage({'mode': 'modwert', 'base': r['basis']['n'], 'ilvl': ilvl, 'slot': r['basis']['slot'], 'mods': mods})
        wv = {x['id']: x for x in (cache[key].get('res') or [])}
        for m in r['mods']:
            x = wv.get(m['id'])
            if x:
                m['wert'] = {'dps': round(x['dps'], 1), 'ehp': round(x['ehp'], 1), 'speed': round(x['speed'], 1), 'nb': bool(x.get('nb'))}
        r['buildWert'] = cache[key].get('error') or True
    else:
        r['buildWert'] = False
    return r


WAEHR_NAME = {'chaos': 'Chaos Orb', 'divine': 'Divine Orb', 'exalted': 'Exalted Orb', 'alch': 'Orb of Alchemy', 'annul': 'Orb of Annulment', 'regal': 'Regal Orb',
              'vaal': 'Vaal Orb', 'chance': 'Orb of Chance', 'mirror': 'Mirror of Kalandra', 'aug': 'Orb of Augmentation', 'transmute': 'Orb of Transmutation',
              'gcp': "Gemcutter's Prism", 'fusing': 'Orb of Fusing', 'chrome': 'Chromatic Orb', 'jew': "Jeweller's Orb", 'alt': 'Orb of Alteration', 'scour': 'Orb of Scouring',
              'blessed': 'Blessed Orb', 'chisel': "Cartographer's Chisel", 'wisdom': 'Scroll of Wisdom'}


def icons_waehrung():
    """Währungs-Symbole (poe.ninja) für die Preisanzeige im Item-Popup."""
    ic = dict(_craft_preise.get('icons') or {})
    try:
        ic.update(getattr(F.prices, 'icons', None) or {})
    except Exception:
        pass
    return {k: ic[n] for k, n in WAEHR_NAME.items() if ic.get(n)}


def craft_preise():
    """PoE2-Preise in Exalted (auch wenn gerade ein PoE1-Profil aktiv ist)."""
    p = S.active_profile() or {}
    liga = p.get('league') if p.get('game') == 'poe2' else ''
    if not liga:
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request('https://www.pathofexile.com/api/trade2/data/leagues',
                                                                      headers={'User-Agent': 'PoE-Companion/1.1 (local overlay)'}), timeout=15).read())
            liga = next((x['id'] for x in r.get('result') or [] if not re.search(r'Hardcore|HC |Standard', x['id'])), 'Standard')
        except Exception:
            liga = 'Standard'
    if _craft_preise['p'] and _craft_preise['liga'] == liga and time.time() - _craft_preise['t'] < 3600:
        return _craft_preise['p'], liga
    try:
        pr = stash.Prices(liga, 'poe2').load()
        _craft_preise.update(t=time.time(), p=dict(pr.simple, _divine=pr.divine), liga=liga, icons=dict(getattr(pr, 'icons', {}) or {}))
    except Exception as e:
        log('Crafting-Preise: %s' % e)
    return _craft_preise['p'], liga


def pythonw():
    """pythonw.exe startet ohne schwarzes Konsolenfenster."""
    d = os.path.dirname(sys.executable)
    for n in ('pythonw.exe', 'pyw.exe'):
        if os.path.isfile(os.path.join(d, n)):
            return os.path.join(d, n)
    return sys.executable


def start_befehl():
    return '"%s" "%s"' % (pythonw(), os.path.join(BASE, 'poe_app.py'))


def verknuepfungen():
    """Einmalig: Verknüpfung „PoE Companion“ mit eigenem Icon auf dem Desktop und im Startmenü."""
    marker = os.path.join(DATA, 'verknuepfung_v2.txt')
    if not IS_WIN or FAKE or os.path.exists(marker):
        return
    ico = os.path.join(BASE, 'ui', 'icon.ico')
    ps = ("$w = New-Object -ComObject WScript.Shell; "
          "foreach ($d in @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('Programs')) ''))) { "
          "$l = $w.CreateShortcut((Join-Path $d 'PoE Companion.lnk')); "
          "$l.TargetPath = '%s'; $l.Arguments = '\"%s\"'; $l.WorkingDirectory = '%s'; "
          "$l.IconLocation = '%s,0'; $l.Description = 'PoE Companion – Overlay und Helfer für Path of Exile 1 und 2'; $l.Save() }"
          ) % (pythonw().replace("'", "''"), os.path.join(BASE, 'poe_app.py').replace("'", "''"), BASE.replace("'", "''"), ico.replace("'", "''"))
    try:
        r = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', ps], capture_output=True, text=True, timeout=30,
                           creationflags=0x08000000)
        if r.returncode == 0:
            open(marker, 'w').write('1')
            log('Verknüpfung „PoE Companion“ auf Desktop und im Startmenü angelegt')
        else:
            log('Verknüpfung: %s' % (r.stderr or r.stdout)[:300])
    except Exception as e:
        log('Verknüpfung: %s' % e)


WIN = None
if IS_WIN and not FAKE:
    try:
        WIN = WinAPI()
    except Exception:
        log(traceback.format_exc())


class WindowManager:
    """Öffnet die Oberflächen als schlanke Edge-App-Fenster und hält Overlays über dem Spiel."""
    WINDOWS = {
        'hub': {'title': 'PoE Companion', 'url': '/ui/hub.html', 'size': (1320, 860), 'top': False, 'tool': False},
        'item': {'title': 'PoE Companion · Item-Check', 'url': '/ui/item.html', 'size': (440, 640), 'top': True, 'tool': True},
        'tree': {'title': 'PoE Companion · Skilltree', 'url': '/ui/tree.html', 'size': (520, 760), 'top': True, 'tool': True},
        'quest': {'title': 'PoE Companion · Kampagne', 'url': '/ui/quest.html', 'size': (360, 220), 'top': True, 'tool': True},
        'farm': {'title': 'PoE Companion · Farming', 'url': '/ui/farm.html', 'size': (330, 300), 'top': True, 'tool': True},
    }

    def __init__(self):
        self.hidden = set()
        self.hide_timer = None

    def edge(self):
        for exe in (os.path.expandvars(r'%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe'),
                    os.path.expandvars(r'%ProgramFiles%\Microsoft\Edge\Application\msedge.exe'),
                    os.path.expandvars(r'%ProgramFiles%\Google\Chrome\Application\chrome.exe'),
                    os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe')):
            if os.path.exists(exe):
                return exe
        return None

    def hwnd(self, name):
        return WIN.find(self.WINDOWS[name]['title']) if WIN else None

    def open(self, name):
        if not WIN:
            return False
        h = self.hwnd(name)
        if h:
            self.show(name, activate=True)
            return True
        cfg = self.WINDOWS[name]
        pos = S.settings.get('windows', {}).get(name)
        w, hgt = cfg['size']
        args = [self.edge(), '--app=http://127.0.0.1:%d%s' % (PORT, cfg['url']),
                '--user-data-dir=' + os.path.join(DATA, 'edge'), '--no-first-run', '--no-default-browser-check',
                '--disable-direct-composition',  # sonst ignoriert Edge den Fensterbereich und die Titelleiste bleibt sichtbar
                '--disable-features=msEdgeSidebarV2,msHubApps,msEdgeTranslate', '--window-size=%d,%d' % (pos[2], pos[3]) if pos else '--window-size=%d,%d' % (w, hgt)]
        if pos:
            args.append('--window-position=%d,%d' % (pos[0], pos[1]))
        if not args[0]:
            log('Kein Edge/Chrome gefunden')
            return False
        subprocess.Popen(args)
        threading.Thread(target=self._nachbereiten, args=(name,), daemon=True).start()
        return True

    def edge_neu_starten(self):
        """Einmalig: Edge-Fenster des Companions mit den neuen Startoptionen neu öffnen."""
        marker = os.path.join(DATA, 'edge_v2.txt')
        if not WIN or os.path.exists(marker):
            return
        offen = [n for n in self.WINDOWS if self.hwnd(n) and WIN.u.IsWindowVisible(self.hwnd(n))]
        ziel = os.path.join(DATA, 'edge').replace("'", "''")
        try:
            subprocess.run(['powershell', '-NoProfile', '-Command',
                            "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | Where-Object { $_.CommandLine -like '*%s*' } | "
                            "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" % ziel],
                           timeout=30, creationflags=0x08000000)
        except Exception as e:
            log('Edge-Neustart: %s' % e)
        open(marker, 'w').write('ok')
        time.sleep(2)
        log('Edge-Fenster neu geöffnet (ohne DirectComposition): %s' % offen)
        for n in (offen or ['hub']):
            self.open(n)
            time.sleep(1.2)

    def _nachbereiten(self, name):
        cfg = self.WINDOWS[name]
        for _ in range(60):
            h = self.hwnd(name)
            if h:
                time.sleep(0.3)
                self.place(name, h)
                if cfg['tool']:
                    ex = WIN.u.GetWindowLongW(h, -20)
                    WIN.u.SetWindowLongW(h, -20, (ex | 0x80) & ~0x40000)  # Toolwindow, nicht in der Taskleiste
                if cfg['top']:
                    WIN.u.SetWindowPos(h, -1, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0040)
                if name != 'hub':
                    self.apply_alpha(name)
                    self.frameless(name)
                return
            time.sleep(0.25)

    def place(self, name, h, default=False):
        cfg = self.WINDOWS[name]
        pos = None if default else S.settings.get('windows', {}).get(name)
        sw, sh = WIN.u.GetSystemMetrics(0), WIN.u.GetSystemMetrics(1)
        if pos and -20000 < pos[0] < sw * 3 and (name != 'hub' or (pos[2] >= 900 and pos[3] >= 600)):
            x, y, w, hh = pos
        else:
            w, hh = cfg['size']
            w, hh = min(w, sw - 40), min(hh, sh - 80)
            x = {'hub': (sw - w) // 2, 'item': sw - w - 30, 'tree': 30, 'farm': sw - w - 30, 'quest': 30}[name]
            y = {'hub': max(0, (sh - hh) // 2 - 20), 'item': 90, 'tree': 90, 'farm': sh - hh - 120, 'quest': sh - hh - 120}[name]
        WIN.u.SetWindowPos(h, -1 if cfg['top'] else 0, x, y, w, hh, 0x0010)

    def reset(self):
        """Alle Fenster auf Standardposition – falls eins verloren gegangen ist."""
        S.settings['windows'] = {}
        speichere('settings.json', S.settings)
        for n in self.WINDOWS:
            h = self.hwnd(n)
            if h:
                WIN.u.ShowWindow(h, 9)
                self.place(n, h, default=True)
                WIN.u.ShowWindow(h, 5)
                self.hidden.discard(n)

    def show(self, name, activate=False):
        if not WIN:
            return
        h = self.hwnd(name)
        if not h:
            if name == 'item':
                self.open('item')
            return
        WIN.u.ShowWindow(h, 5 if activate else 4)  # SW_SHOW / SW_SHOWNOACTIVATE
        if self.WINDOWS[name]['top']:
            WIN.u.SetWindowPos(h, -1, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0040)
        if activate:
            WIN.u.SetForegroundWindow(h)
        self.hidden.discard(name)
        if name == 'item':
            self._auto_hide()

    def hide(self, name):
        if not WIN:
            return
        h = self.hwnd(name)
        if h:
            WIN.u.ShowWindow(h, 0)
            self.hidden.add(name)

    def toggle_overlays(self):
        sichtbar = [n for n in ('item', 'tree', 'farm', 'quest') if self.hwnd(n) and n not in self.hidden]
        if sichtbar:
            for n in sichtbar:
                self.hide(n)
        else:
            for n in ('item', 'tree', 'farm', 'quest'):
                if self.hwnd(n):
                    self.show(n)

    def apply_alpha(self, only=None):
        """Deckkraft der Overlays (Einstellung „Deckkraft“)."""
        if not WIN:
            return
        a = max(40, min(100, int(S.settings.get('overlayOpacity') or 100)))
        for n in ([only] if only else ('item', 'tree', 'farm', 'quest')):
            h = self.hwnd(n)
            if not h:
                continue
            ex = WIN.u.GetWindowLongW(h, -20)
            if not ex & 0x80000:
                WIN.u.SetWindowLongW(h, -20, ex | 0x80000)
            WIN.u.SetLayeredWindowAttributes(h, 0, int(a * 255 / 100), 2)

    def _auto_hide(self):
        sek = int(S.settings.get('popupAutoHide') or 0)
        if self.hide_timer:
            self.hide_timer.cancel()
        if S.settings.get('popupPinned'):
            return
        if sek > 0:
            self.hide_timer = threading.Timer(sek, lambda: self.hide('item'))
            self.hide_timer.daemon = True
            self.hide_timer.start()

    def keep_alive(self):
        """Hält das Auto-Ausblenden an, solange die Maus über dem Popup ist."""
        if self.hide_timer:
            self.hide_timer.cancel()

    def resize(self, name, height):
        if not WIN:
            return
        h = self.hwnd(name)
        if h:
            x, y, w, _ = WIN.rect(h)
            height = max(90, min(int(height), 1300))
            WIN.u.SetWindowPos(h, -1 if self.WINDOWS[name]['top'] else 0, x, y, w, height, 0x0010 | 0x0004 * 0)

    def clip(self, name, m=None):
        """Edge zeichnet die Titelleiste selbst – darum schneiden wir sie per Fensterbereich weg.
        m = Maße aus der Seite (outer/inner in CSS-Pixeln). Ein Wächter setzt den Bereich neu, falls Edge ihn zurücksetzt."""
        if not WIN:
            return
        self.frameless(name)  # alte Stil-Änderung rückgängig machen
        caps = self.__dict__.setdefault('caps', {})
        if S.settings.get('framelessOverlays', True) is False:
            caps.pop(name, None)
            hw = self.hwnd(name)
            if hw:
                WIN.u.SetWindowRgn(hw, None, True)
            return
        if m and m.get('oh'):
            caps[name] = m
        self.clip_apply(name)

    def clip_rect(self, name, hw=None):
        """Bereich ohne Windows-Titelleiste. Maße kommen von Windows selbst (Titelleiste + Rahmen)."""
        hw = hw or self.hwnd(name)
        if not hw:
            return None, None
        x, y, w, h = WIN.rect(hw)
        gm = WIN.u.GetSystemMetrics
        pad = gm(92)                      # SM_CXPADDEDBORDER
        side = gm(32) + pad               # SM_CXSIZEFRAME
        top = gm(4) + gm(33) + pad        # SM_CYCAPTION + SM_CYSIZEFRAME
        rechts, unten = w - side, h - side
        cache = self.__dict__.setdefault('_inhalt', {})
        key = (hw, x, y, w, h)
        ir, t_alt = cache.get(key, (None, 0))
        if ir is None or time.time() - t_alt > 0.6:
            try:
                c = WIN.inhalt(hw)
            except Exception:
                c = None
            ir = (c[0] - x, c[1] - y, c[0] + c[2] - x, c[1] + c[3] - y) if c else False
            if c and not (0 <= ir[0] < 40 and 0 <= ir[1] < 80 and ir[2] <= w and ir[3] <= h):
                ir = False
            if len(cache) > 50:
                cache.clear()
            cache[key] = (ir, time.time())
        m = self.__dict__.get('caps', {}).get(name)
        if ir and ir[1] >= 10:
            side, top, rechts, unten = ir
        elif m and m.get('oh') and m.get('ow'):  # Maße aus der Seite, falls verfügbar (genauer bei Skalierung)
            sc = w / max(1.0, float(m['ow']))
            s2 = max(0.0, (float(m['ow']) - float(m['iw'])) / 2) * sc
            t2 = max(0.0, float(m['oh']) - float(m['ih'])) * sc - s2
            if t2 >= 10:
                side, top = s2, t2
                rechts, unten = w - s2, h - s2
        # Der Companion läuft ohne DPI-Bewusstsein: Fenstermaße sind „logisch“, der Fensterbereich aber in echten Pixeln.
        # Bei Windows-Skalierung (z. B. 125 %) deshalb hochrechnen – sonst bleibt oben ein Streifen der Leiste stehen.
        try:
            k = WIN.u.GetDpiForWindow(hw) / float(WIN.u.GetDpiForSystem() or 96)
        except Exception:
            k = 1.0
        if not (0.5 < k < 4):
            k = 1.0
        self.__dict__.setdefault('_logisch', {})[name] = (side, top, w - rechts, h - unten)
        return hw, (int(round(side * k)), int(round(top * k)), int(round(rechts * k)), int(round(unten * k)))

    def clip_apply(self, name, hw=None):
        hw, r = self.clip_rect(name, hw)
        if not r or r[1] <= 0 or r[2] <= r[0] or r[3] <= r[1]:
            return
        rg = WIN.g.CreateRectRgn(*r)
        WIN.u.SetWindowRgn(hw, rg, True)
        self.dwm_aus(hw)
        n = self.__dict__.setdefault('_clip_log', {})
        n[name] = n.get(name, 0) + 1
        if n[name] <= 2 or n[name] % 100 == 0:
            try:
                dp = (WIN.u.GetDpiForWindow(hw), WIN.u.GetDpiForSystem())
            except Exception:
                dp = None
            log('Titelleiste %s weg: Fenster %s, Bereich %s, DPI %s, sichtbar=%s, %d. Mal' % (name, hw, r, dp, bool(WIN.u.IsWindowVisible(hw)), n[name]))

    def dwm_farbe(self, hw, rand=True):
        """Windows-Titelleiste dunkel im Companion-Stil statt hellgrau/weiß (Windows 11)."""
        try:
            d = WIN.c.windll.dwmapi
            for attr, wert in ((20, 1), (35, 0x000D1113), (36, 0x009AD1EA)) + (((34, 0x0024313A),) if rand else ()):
                v = WIN.c.c_uint(wert)
                d.DwmSetWindowAttribute(WIN.w.HWND(hw), attr, WIN.c.byref(v), 4)
        except Exception as e:
            log('DWM-Farbe: %s' % e)

    def dwm_aus(self, hw):
        """Windows 11 zeichnet zusätzlich einen hellen Fensterrand (der weiße Strich oben) und Schatten – abschalten."""
        done = self.__dict__.setdefault('_dwm', set())
        if hw in done:
            return
        done.add(hw)
        self.dwm_farbe(hw, rand=False)
        try:
            d = WIN.c.windll.dwmapi
            v = WIN.c.c_uint(1)
            d.DwmSetWindowAttribute(WIN.w.HWND(hw), 2, WIN.c.byref(v), 4)            # DWMWA_NCRENDERING_POLICY = DISABLED
            v = WIN.c.c_uint(0xFFFFFFFE)
            d.DwmSetWindowAttribute(WIN.w.HWND(hw), 34, WIN.c.byref(v), 4)           # DWMWA_BORDER_COLOR = keiner
            v = WIN.c.c_uint(1)
            d.DwmSetWindowAttribute(WIN.w.HWND(hw), 33, WIN.c.byref(v), 4)           # keine runden Ecken
        except Exception as e:
            log('DWM: %s' % e)

    def clip_waechter(self):
        """Edge setzt den Fensterbereich bei Größenänderung oder Aktivierung zurück – sofort wieder anwenden."""
        if not WIN:
            return
        box = WIN.w.RECT()
        WIN.u.GetWindowRgnBox.argtypes = [WIN.w.HWND, WIN.c.POINTER(WIN.w.RECT)]
        WIN.u.IsZoomed.argtypes = [WIN.w.HWND]
        try:
            WIN.u.GetDpiForWindow.argtypes = [WIN.w.HWND]
        except Exception:
            pass
        cache, cache_t = {}, 0
        while True:
            time.sleep(0.04)
            try:
                if time.time() - cache_t > 1.5:  # Fenster-Liste nur ab und zu neu suchen
                    cache = {n: WIN.find_all(self.WINDOWS[n]['title']) for n in ('item', 'tree', 'farm', 'quest', 'hub')}
                    cache_t = time.time()
                    fertig = self.__dict__.setdefault('_programm', set())
                    for liste in cache.values():
                        for hw0 in liste:
                            if hw0 not in fertig:
                                fertig.add(hw0)
                                try:
                                    ok = WIN.programm(hw0, os.path.join(BASE, 'ui', 'icon.ico'), start_befehl())
                                    if len(fertig) <= 6:
                                        log('Programm-Fenster %s: eigenes Icon und Taskleisten-Eintrag %s' % (hw0, 'gesetzt' if ok else 'nicht möglich'))
                                except Exception as e:
                                    log('Programm-Fenster: %s' % e)
                    hub = self.hwnd('hub')
                    if hub and hub not in self.__dict__.setdefault('_hubfarbe', set()):
                        self._hubfarbe.add(hub)
                        self.dwm_farbe(hub)
                if S.settings.get('framelessOverlays', True) is False:
                    time.sleep(1)
                    continue
                for name, liste in cache.items():
                    for hw0 in liste:
                        if not WIN.u.IsWindowVisible(hw0):
                            continue
                        if WIN.u.IsZoomed(hw0):
                            # Maximieren (Doppelklick oder an den oberen Rand ziehen) bringt Edges Leiste zurück:
                            # stattdessen normal lassen und auf Bildschirmgröße ziehen
                            WIN.u.ShowWindow(hw0, 9)
                            if name == 'hub':
                                self.vollbild(name, hw0, an=True)
                            continue
                        if WIN.u.IsIconic(hw0):   # minimiert (160×28): nichts zuschneiden, sonst Endlosschleife
                            continue
                        hw, r = self.clip_rect(name, hw0)
                        if not r or r[2] <= r[0] or r[3] <= r[1]:
                            continue
                        typ = WIN.u.GetWindowRgnBox(hw, WIN.c.byref(box))
                        if typ in (0, 1) or (box.left, box.top, box.right, box.bottom) != r:
                            self.clip_apply(name, hw)
            except Exception as e:
                log('Wächter: %s' % e)
                time.sleep(5)

    def _voll_setzen(self, name, hw, wa):
        _, r = self.clip_rect(name, hw)
        side, top, rr, un = self._logisch.get(name) if r else (8, 31, 8, 8)
        ziel = (int(wa.left - side), int(wa.top - top), int((wa.right - wa.left) + side + rr), int((wa.bottom - wa.top) + top + un))
        if list(ziel) != list(WIN.rect(hw)):
            WIN.u.SetWindowPos(hw, 0, *ziel, 0x0004 | 0x0010)
        return side, top, rr, un

    def vollbild(self, name, hw=None, an=None):
        """„Maximieren“ ohne Windows-Maximieren: Fenster füllt den Arbeitsbereich des Bildschirms, die Leiste bleibt weg."""
        hw = hw or self.hwnd(name)
        if not hw:
            return
        c, w, u = WIN.c, WIN.w, WIN.u

        class MI(c.Structure):
            _fields_ = [('cbSize', w.DWORD), ('rcMonitor', w.RECT), ('rcWork', w.RECT), ('dwFlags', w.DWORD)]
        u.MonitorFromWindow.restype = w.HANDLE
        mon = u.MonitorFromWindow(w.HWND(hw), 2)
        mi = MI(); mi.cbSize = c.sizeof(MI)
        u.GetMonitorInfoW(w.HANDLE(mon), c.byref(mi))
        wa = mi.rcWork
        merk = self.__dict__.setdefault('_vorher', {})
        x, y, ww, hh = WIN.rect(hw)
        gross = abs(ww - (wa.right - wa.left)) < 40 and hh >= (wa.bottom - wa.top) - 10
        if an is None:
            an = not gross
        self.__dict__.setdefault('_voll', {})[name] = bool(an)
        if an:
            if not gross:
                merk[name] = (x, y, ww, hh)
            side, top, rr, un = self._voll_setzen(name, hw, wa)
            if not getattr(self, '_voll_nach', False):
                self._voll_nach = True

                def nach():
                    # Edge baut die Seite nach dem Größenwechsel verzögert neu auf – Lage danach noch einmal genau nachmessen
                    try:
                        for t in (0.15, 0.35, 0.8, 1.6):
                            time.sleep(t)
                            if not self.__dict__.get('_voll', {}).get(name):
                                break
                            self.__dict__.get('_inhalt', {}).clear()
                            self._voll_setzen(name, hw, wa)
                            self.clip_apply(name, hw)
                    finally:
                        self._voll_nach = False
                threading.Thread(target=nach, daemon=True).start()
            log('Vollbild %s: Arbeitsbereich %s, Rand links %s oben %s rechts %s unten %s' % (name, (wa.left, wa.top, wa.right, wa.bottom), side, top, rr, un))
        else:
            x0, y0, w0, h0 = merk.get(name) or (wa.left + 80, wa.top + 60, int((wa.right - wa.left) * .7), int((wa.bottom - wa.top) * .8))
            u.SetWindowPos(hw, 0, x0, y0, w0, h0, 0x0004 | 0x0010)
        self.clip_apply(name, hw)

    def frameless(self, name, on=None):
        """Frühere Version hat den Fensterstil geändert (half nicht gegen Edges eigene Titelleiste) – zurücksetzen."""
        if not WIN or name == 'hub':
            return
        hw = self.hwnd(name)
        if not hw:
            return
        st = WIN.u.GetWindowLongW(hw, -16) & 0xFFFFFFFF
        if st & 0x80000000 or not st & 0x00C00000:
            neu = (st | 0x00CF0000) & ~0x80000000 & 0xFFFFFFFF
            x, y, w, hh = WIN.rect(hw)
            WIN.u.SetWindowLongW(hw, -16, neu - (1 << 32) if neu >= (1 << 31) else neu)
            WIN.u.SetWindowPos(hw, 0, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0004 | 0x0010 | 0x0020)
            WIN.u.SetWindowPos(hw, 0, x, y, w, hh, 0x0004 | 0x0010)
            log('Fensterstil %s zurückgesetzt: %08X -> %08X' % (name, st, neu))

    def size(self, name, dw, dh):
        hw = self.hwnd(name)
        if not hw:
            return
        x, y, w, hh = WIN.rect(hw)
        w, hh = max(260, min(w + int(dw), 2400)), max(140, min(hh + int(dh), 1600))
        WIN.u.SetWindowPos(hw, 0, x, y, w, hh, 0x0004 | 0x0010)

    def move(self, name, dx, dy):
        hw = self.hwnd(name)
        if not hw:
            return
        if self.__dict__.get('_voll', {}).get(name):
            # Ziehen aus dem Vollbild: wie bei Windows auf die alte Größe zurück, Fenster unter dem Mauszeiger
            self.vollbild(name, hw, an=False)
            try:
                pt = WIN.w.POINT(); WIN.u.GetCursorPos(WIN.c.byref(pt))
                x, y, w, hh = WIN.rect(hw)
                side, top = (self.__dict__.get('_logisch', {}).get(name) or (8, 31))[:2]
                WIN.u.SetWindowPos(hw, 0, int(pt.x - w / 2), int(pt.y - top - 14), 0, 0, 0x0001 | 0x0004 | 0x0010)
                self.clip_apply(name, hw)
            except Exception:
                log(traceback.format_exc())
            return
        x, y, w, hh = WIN.rect(hw)
        WIN.u.SetWindowPos(hw, -1 if self.WINDOWS[name]['top'] else 0, x + int(dx), y + int(dy), 0, 0, 0x0001 | 0x0010)

    def merke_positionen(self):
        """Speichert alle paar Sekunden, wo die Fenster stehen."""
        while True:
            time.sleep(4)
            if not WIN:
                continue
            geaendert = False
            wins = S.settings.setdefault('windows', {})
            for n in self.WINDOWS:
                h = self.hwnd(n)
                if h and WIN.u.IsWindowVisible(h):
                    r = WIN.rect(h)
                    if r[2] > 100 and r[3] > 100 and r[0] > -20000 and wins.get(n) != r:
                        wins[n] = r
                        geaendert = True
            if geaendert:
                speichere('settings.json', S.settings)


WM = WindowManager()

VK = {'F%d' % i: 0x6F + i for i in range(1, 13)}
VK.update({'PAUSE': 0x13, 'SCROLLLOCK': 0x91, 'INSERT': 0x2D, 'HOME': 0x24, 'END': 0x23})
VK.update({chr(c): c for c in range(0x41, 0x5B)})
VK['SPACE'] = 0x20
VK.update({'NUM%d' % d: 0x60 + d for d in range(10)})
VK.update({'NUM*': 0x6A, 'NUM+': 0x6B, 'NUM-': 0x6D, 'NUM/': 0x6F, '^': 0xDC, 'TAB': 0x09})
MAUS = {'MAUS4': 0x05, 'MAUS5': 0x06}  # Seitentasten der Maus – RegisterHotKey kann die nicht, darum abfragen
VK.update({str(d): 0x30 + d for d in range(10)})


def hotkeys():
    if not WIN:
        return
    msg = WIN.w.MSG()
    belegt = {}
    MAUS_BELEGT.clear()
    for i, (key, aktion) in enumerate((('hotkeyToggle', 'toggle'), ('hotkeyHub', 'hub'), ('hotkeyTree', 'tree'), ('hotkeyFarm', 'farm'), ('hotkeyQuest', 'quest'), ('hotkeyItem', 'item'), ('hotkeyQuestNext', 'qnext'), ('hotkeyQuestPrev', 'qprev'),
                                             ('hotkeyHideout', 'hideout'), ('hotkeyChat1', 'chat1'), ('hotkeyChat2', 'chat2'), ('hotkeyCraft', 'craft')), 1):
        if aktion == 'item' and S.settings.get('itemTrigger', 'hotkey') != 'hotkey':
            continue
        name = str(S.settings.get(key) or '').upper()
        mods, vk = 0, None
        teile = name.split('+')
        for t in teile[:-1]:
            mods |= {'ALT': 1, 'CTRL': 2, 'STRG': 2, 'SHIFT': 4}.get(t.strip(), 0)
        if teile and teile[-1].strip() in MAUS:
            MAUS_BELEGT.append((mods, MAUS[teile[-1].strip()], aktion))
            continue
        vk = VK.get(teile[-1].strip()) if teile else None
        if vk and WIN.u.RegisterHotKey(None, i, mods | 0x4000, vk):
            belegt[i] = aktion
        elif vk:
            log('Hotkey %s ist schon belegt' % name)
    while WIN.u.GetMessageW(WIN.c.byref(msg), None, 0, 0) != 0:
        if msg.message == 0x0312:
            a = belegt.get(msg.wParam)
            if a == 'toggle':
                WM.toggle_overlays()
            elif a == 'hub':
                WM.open('hub')
            elif a in ('tree', 'farm', 'quest'):
                if WM.hwnd(a) and a not in WM.hidden:
                    WM.hide(a)
                else:
                    WM.open(a)
            elif a == 'item':
                threading.Thread(target=item_kopieren, daemon=True).start()
            elif a == 'craft':
                threading.Thread(target=item_kopieren, args=(True,), daemon=True).start()
            elif a in ('qnext', 'qprev'):
                C.action({'action': 'next' if a == 'qnext' else 'prev'})
            elif a in ('hideout', 'chat1', 'chat2'):
                threading.Thread(target=chat_befehl, args=(a,), daemon=True).start()


def chat_befehl(a):
    text = '/hideout' if a == 'hideout' else str(S.settings.get(a) or '').strip()
    if text:
        chat_senden(text)


def chat_senden(text):
    """Tippt einen Befehl in den Spiel-Chat (Enter, Text, Enter) – wie ein Makro in anderen Tools.
    Ein Tastendruck = eine Chat-Zeile, nur wenn Path of Exile im Vordergrund ist."""
    if not WIN:
        return
    c, w, u = WIN.c, WIN.w, WIN.u
    buf = c.create_unicode_buffer(128)
    u.GetForegroundWindow.restype = w.HWND
    u.GetWindowTextW(u.GetForegroundWindow(), buf, 128)
    if 'Path of Exile' not in buf.value:
        log('Chat-Befehl übersprungen: Spiel nicht im Vordergrund')
        return
    u.GetAsyncKeyState.restype = c.c_short
    for _ in range(25):  # warten, bis Strg/Alt/Shift losgelassen sind
        if not any(u.GetAsyncKeyState(k) & 0x8000 for k in (0x10, 0x11, 0x12)):
            break
        time.sleep(0.02)

    class KI(c.Structure):
        _fields_ = [('wVk', w.WORD), ('wScan', w.WORD), ('dwFlags', w.DWORD), ('time', w.DWORD), ('extra', c.c_size_t)]

    class MI(c.Structure):
        _fields_ = [('dx', w.LONG), ('dy', w.LONG), ('data', w.DWORD), ('flags', w.DWORD), ('time', w.DWORD), ('extra', c.c_size_t)]

    class U(c.Union):
        _fields_ = [('ki', KI), ('mi', MI)]

    class INPUT(c.Structure):
        _fields_ = [('type', w.DWORD), ('u', U)]

    def send(*ev):
        arr = (INPUT * len(ev))(*ev)
        u.SendInput(len(ev), arr, c.sizeof(INPUT))

    def taste(vk, up=False):
        return INPUT(1, U(ki=KI(vk, 0, 2 if up else 0, 0, 0)))

    def zeichen(ch, up=False):
        return INPUT(1, U(ki=KI(0, ord(ch), 0x0004 | (2 if up else 0), 0, 0)))  # KEYEVENTF_UNICODE

    send(taste(0x0D), taste(0x0D, True))
    time.sleep(0.05)
    for ch in text:
        send(zeichen(ch), zeichen(ch, True))
        time.sleep(0.004)
    time.sleep(0.03)
    send(taste(0x0D), taste(0x0D, True))
    log('Chat-Befehl gesendet: %s' % text)


MAUS_BELEGT = []


def maus_tasten():
    """Maus-Seitentasten als Kürzel – nur wenn das Spiel vorne ist (im Browser bleiben sie „Zurück/Vor“)."""
    if not WIN:
        return
    u, ctypes, wintypes = WIN.u, WIN.c, WIN.w
    u.GetAsyncKeyState.restype = ctypes.c_short
    u.GetForegroundWindow.restype = wintypes.HWND
    vorher = {}
    buf = ctypes.create_unicode_buffer(128)
    while True:
        time.sleep(0.04)
        if not MAUS_BELEGT:
            time.sleep(0.5)
            continue
        for mods, vk, aktion in list(MAUS_BELEGT):
            unten = bool(u.GetAsyncKeyState(vk) & 0x8000)
            if unten and not vorher.get((mods, vk)):
                m = (1 if u.GetAsyncKeyState(0x12) & 0x8000 else 0) | (2 if u.GetAsyncKeyState(0x11) & 0x8000 else 0) | (4 if u.GetAsyncKeyState(0x10) & 0x8000 else 0)
                u.GetWindowTextW(u.GetForegroundWindow(), buf, 128)
                if m == mods and 'Path of Exile' in buf.value:
                    if aktion in ('qnext', 'qprev'):
                        C.action({'action': 'next' if aktion == 'qnext' else 'prev'})
                    elif aktion in ('hideout', 'chat1', 'chat2'):
                        threading.Thread(target=chat_befehl, args=(aktion,), daemon=True).start()
                    elif aktion == 'item':
                        threading.Thread(target=item_kopieren, daemon=True).start()
                    elif aktion == 'toggle':
                        WM.toggle_overlays()
                    elif aktion in ('tree', 'farm', 'quest'):
                        (WM.hide if WM.hwnd(aktion) and aktion not in WM.hidden else WM.open)(aktion)
            vorher[(mods, vk)] = unten


ERWARTE = {'bis': 0.0}


def item_kopieren(craft=False):
    """Eigene Item-Check-Taste: kopiert das Item unter der Maus (wie Strg+C im Spiel) und prüft es.
    Crafting-Taste: kopiert mit Strg+Alt+C (erweitert: Prefix/Suffix, Stufen) und schickt das Item in den Crafting-Berater."""
    u = WIN.u
    for vk in (0x12, 0x10, 0x11):  # Alt, Shift, Strg loslassen (Win-Taste nicht – ein loses Win-Loslassen öffnet Start/Copilot)
        u.keybd_event(vk, 0, 2, 0)
    ERWARTE['bis'] = time.time() + 1.5
    ERWARTE['craft'] = craft
    u.keybd_event(0x11, 0, 0, 0)
    if craft:
        u.keybd_event(0x12, 0, 0, 0)
    u.keybd_event(0x43, 0, 0, 0)
    time.sleep(0.03)
    u.keybd_event(0x43, 0, 2, 0)
    if craft:
        u.keybd_event(0x12, 0, 2, 0)
    u.keybd_event(0x11, 0, 2, 0)


def clipboard_watch():
    if not WIN:
        return
    last = WIN.clip_seq()
    while True:
        time.sleep(0.2)
        try:
            seq = WIN.clip_seq()
            if seq == last:
                continue
            last = seq
            t = WIN.clip_text() or ''
            # PoE2-Stash-Erfassung: jedes mit Strg+C kopierte Item zählt in den gewählten Tab, kein Preis-Popup
            if (F.state.get('erf') or {}).get('aktiv') and time.time() - (F.state['erf'].get('seit') or 0) > 900:
                F.state['erf']['aktiv'] = False   # 15 Minuten nichts erfasst: Erfassung beendet sich selbst
                log('Stash-Erfassung nach 15 Minuten ohne Item beendet')
                F.bump()
            if (F.state.get('erf') or {}).get('aktiv') and F.spiel() == 'poe2' and time.time() >= ERWARTE['bis'] \
                    and (t.startswith('Item Class:') or t.startswith('Rarity:')):
                # nur echtes Strg+C im Spiel – deine Preis- und Crafting-Tasten (Alt+C, Alt+X) laufen ganz normal weiter
                if F.erfassen(t):
                    try:
                        import winsound
                        winsound.MessageBeep(0x40)
                    except Exception:
                        pass
                continue
            # Im Tasten-Modus nur reagieren, wenn unsere eigene Taste kopiert hat –
            # so lösen andere Tools (z. B. ein Preis-Checker auf Strg+D) kein Popup aus
            eigen = time.time() < ERWARTE['bis']
            if S.settings.get('itemTrigger', 'hotkey') == 'hotkey' and not eigen:
                continue
            ERWARTE['bis'] = 0
            if ERWARTE.get('craft') and (t.startswith('Item Class:') or t.startswith('Rarity:')):
                ERWARTE['craft'] = False
                S.craft_item = {'t': time.time(), 'text': t}
                S.bump()
                WM.open('hub')
                log('Crafting: Item aus der Zwischenablage übernommen')
            elif t.startswith('Item Class:') or t.startswith('Rarity:'):
                W.jobs.put(('item', t))
            elif t.startswith('Gegenstandsklasse') or t.startswith('Seltenheit:'):
                S.set_status(error='Deutscher Itemtext erkannt – Path of Building versteht nur Englisch. '
                                   'Bitte die Spielsprache auf Englisch stellen.')
                WM.show('item')
        except Exception:
            log(traceback.format_exc())


# ---------------------------------------------------------------- HTTP-Schnittstelle

TREE_ASSETS = None


def tree_assets_dir():
    global TREE_ASSETS
    if TREE_ASSETS is None:
        for root in (BASE, os.path.dirname(BASE)):
            for d in sorted(os.listdir(root)) if os.path.isdir(root) else []:
                p = os.path.join(root, d, 'src', 'TreeData', '3_29')
                if d.startswith('PathOfBuilding-') and os.path.isdir(p):
                    TREE_ASSETS = p
    return TREE_ASSETS


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *a):
        pass

    def _send(self, code, body=b'', ctype='application/json; charset=utf-8', extra=None):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        try:
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass  # Fenster wurde geschlossen oder neu geladen, während die Antwort unterwegs war

    def json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode('utf-8'))

    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception:
            return {}

    def do_OPTIONS(self):
        self._send(204, extra={'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                               'Access-Control-Allow-Headers': 'Content-Type',
                               'Access-Control-Allow-Private-Network': 'true'})

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = dict(urllib.parse.parse_qsl(u.query))
        try:
            if u.path in ('/', '/ui', '/ui/'):
                return self._send(302, extra={'Location': '/ui/hub.html'})
            if u.path == '/api/state':
                rev = int(q.get('rev') or 0)
                return self.json(S.wait(rev) if q.get('wait') else S.snapshot())
            if u.path == '/api/ledger':
                if not F.prices and F.state['hasSessid'] is not None and not F.state['status']['busy']:
                    try:
                        F.who()
                        F.jobs.put('prices')
                    except Exception:
                        pass
                return self.json(F.ledger_public())
            if u.path == '/api/suchtexte':
                return self.json(dict(mapcheck.suchtext((S.char or {}).get('sheet'), S.settings.get('mapWahl'), S.settings.get('mapWorte'), spiel=W.game()), spiel=W.game()))
            if u.path == '/api/upgrades':
                U = getattr(S, 'upgrades', None) or {}
                if not U.get('list'):
                    # Noch nicht gerechnet: letztes Ergebnis zeigen, bis das neue fertig ist
                    c = lade('upgrades_cache.json', {})
                    if c.get('list') and c.get('profil') == (S.active_profile() or {}).get('id'):
                        return self.json(dict(c, laeuft=True, cache=True, fertig=0))
                    return self.json({'laeuft': True, 'warte': True})
                return self.json({k: U.get(k) for k in ('set', 't', 'level', 'list', 'fertig', 'laeuft', 'flaskSlot', 'charmSlot', 'game', 'slots')} if U else {})
            if u.path == '/api/geminfo':
                return self.json(getattr(S, 'geminfo', {}) or {})
            if u.path == '/api/markt':
                return self.json(F.markt())
            if u.path == '/api/prices/names':
                return self.json(F.namen(q.get('q', '')))
            if u.path == '/api/history/item':
                t = q.get('t', '')
                hit = S.full.get(t) or next((v for k, v in S.full.items() if abs(float(k) - float(t or 0)) < .01), None)
                return self.json(hit or {})
            if u.path == '/api/gemicons':
                import gemicons
                if q.get('spiel') == 'poe2':
                    if not FAKE:
                        gemicons.aktualisiere2(log)
                    return self.json(gemicons.lade2())
                info = (S.char or {}).get('info') or {}
                if not FAKE:
                    gemicons.aktualisiere(info.get('league') or 'Standard', log)
                return self.json(gemicons.lade())
            if u.path == '/api/craft/basen':
                import crafting
                return self.json(crafting.basen(q.get('q', ''), 40))
            if u.path == '/api/craft/pool':
                import crafting
                ilvl = int(q.get('ilvl') or 82)
                return self.json(craft_pool_wert(q.get('base', ''), ilvl, q.get('stufe') or 'normal', q.get('rune') or None))
            if u.path == '/api/ligen':
                # Aktuelle Ligen von der Trade-Seite (für PoE2-Profile, deren Liga nicht im Build-Code steht)
                spiel = 'poe2' if q.get('spiel') == 'poe2' else 'poe1'
                c = getattr(S, '_ligen', {}).get(spiel)
                if not c or time.time() - c[0] > 3600:
                    try:
                        url = 'https://www.pathofexile.com/api/%s/data/leagues' % ('trade2' if spiel == 'poe2' else 'trade')
                        r = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'PoE-Companion/1.1 (local overlay)'}), timeout=15).read())
                        c = (time.time(), [x['id'] for x in r.get('result') or [] if x.get('id')])
                        S.__dict__.setdefault('_ligen', {})[spiel] = c
                    except Exception as e:
                        log('Ligen: %s' % e)
                        c = (0, ['Standard'])
                return self.json(c[1])
            if u.path == '/api/chars':
                import engine
                if FAKE:
                    return self.json([{'name': 'Feuerftze', 'level': 91, 'class': 'Elementalist', 'league': 'Covens'},
                                      {'name': 'Testchar', 'level': 12, 'class': 'Witch', 'league': 'Standard'}])
                try:
                    return self.json(engine.list_characters(q.get('account', ''), q.get('realm') or 'pc'))
                except Exception as e:
                    return self.json({'error': str(e)}, 400)
            if u.path.startswith('/ui/'):
                return self.datei(os.path.join(UI, *u.path[4:].split('/')))
            if u.path.startswith('/tree-assets/'):
                d = tree_assets_dir()
                if d:
                    return self.datei(os.path.join(d, os.path.basename(u.path)))
            self._send(404, b'{}')
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            log(traceback.format_exc())
            self.json({'error': str(e)}, 500)

    def datei(self, pfad):
        pfad = os.path.normpath(pfad)
        if not (pfad.startswith(UI) or (tree_assets_dir() and pfad.startswith(tree_assets_dir()))) or not os.path.isfile(pfad):
            return self._send(404, b'{}')
        typ = 'image/webp' if pfad.endswith('.webp') else (mimetypes.guess_type(pfad)[0] or 'application/octet-stream')
        if typ.startswith('text/') or typ in ('application/javascript', 'application/json'):
            typ += '; charset=utf-8'
        data = open(pfad, 'rb').read()
        self._send(200, data, typ, {'Cache-Control': 'max-age=3600' if '/tree-assets/' in self.path or 'tree_3_29' in pfad or '/tree2/' in self.path else 'no-store'})

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        b = self.body()
        try:
            if u.path == '/api/campaign':
                C.action(b)
                return self.json({'ok': True})
            if u.path == '/api/ledger':
                F.ledger_action(b)
                return self.json(F.ledger_public())
            if u.path == '/api/stash/secret':
                F.set_secret(b.get('poesessid', ''))
                if b.get('poesessid'):
                    F.jobs.put('tabs')
                return self.json({'ok': True})
            if u.path == '/api/stash/erf':
                return self.json(F.erf_aktion(b))
            if u.path == '/api/stash/action':
                a = b.get('action')
                if a == 'reset':
                    F.reset_session()
                elif a in ('tabs', 'scan', 'start', 'start_craft', 'stop', 'tick', 'prices'):
                    if F.state['status']['busy'] and a != 'stop':
                        return self.json({'ok': False, 'error': 'Läuft gerade schon etwas.'})
                    F.status(busy=True, error='', text='Wird gestartet…')
                    F.jobs.put(a)
                return self.json({'ok': True})
            if u.path in ('/api/upgrades/warum', '/api/wickerman'):
                if not S.char:
                    return self.json({'error': 'Bitte zuerst einen Charakter laden.'})
                if u.path == '/api/wickerman' and b.get('eigene') is not None:
                    S.settings['wickerEigene'] = [{'slot': str(e.get('slot', ''))[:20], 'name': str(e.get('name', ''))[:60], 'text': str(e.get('text', ''))[:400]}
                                                 for e in b['eigene'] if str(e.get('text', '')).strip()][:20]
                    speichere('settings.json', S.settings)
                antwort = queue.Queue()
                if u.path == '/api/upgrades/warum':
                    W.jobs.put(('warum', ((str(b.get('slot', '')), str(b.get('name', ''))), antwort)))
                else:
                    W.jobs.put(('wicker', ((), antwort)))
                try:
                    return self.json(antwort.get(timeout=120))
                except queue.Empty:
                    return self.json({'error': 'Path of Building antwortet nicht – bitte gleich nochmal.'})
            if u.path == '/api/craft/item':
                # Item aus der Zwischenablage (Crafting-Taste) oder eingefügter Text: lesen + alle Möglichkeiten
                import crafting
                txt = b.get('text') or (getattr(S, 'craft_item', None) or {}).get('text', '')
                info = crafting.item_lesen(txt)
                if info.get('error'):
                    return self.json(info)
                pr, liga = craft_preise()
                info['moeglich'] = crafting.moeglichkeiten(info, b.get('wunsch') or [], pr)
                info['text'] = txt
                # Build-Wert der Mods auf dem Item + Verbesserungs-Plan (was bleibt, was weg, was drauf, mit Kosten)
                pool = craft_pool_wert(info['basis'], info['ilvl'], 'normal', None)
                if S.char and W.game() == 'poe2' and info['mods']:
                    import re as _re
                    mods = [{'id': m['id'], 'text': _re.sub(r'\(\d+(?:\.\d+)?-\d+(?:\.\d+)?\)', '', m['text'])} for m in info['mods']]
                    key = (info['basis'], tuple(x['text'] for x in mods), S.char.get('t'))
                    cache = S.__dict__.setdefault('_itemwert', {})
                    if key not in cache:
                        cache[key] = pob_frage({'mode': 'modwert', 'base': info['basis'], 'ilvl': info['ilvl'], 'slot': pool['basis']['slot'], 'mods': mods})
                    wv = {x['id']: x for x in (cache[key].get('res') or [])}
                    for m in info['mods']:
                        x = wv.get(m['id'])
                        if x:
                            m['wert'] = {'dps': round(x['dps'], 1), 'ehp': round(x['ehp'], 1), 'speed': round(x['speed'], 1), 'nb': bool(x.get('nb'))}
                info['buildWert'] = pool.get('buildWert')
                info['plan'] = crafting.verbessern(info, pool, pr)
                ic = _craft_preise.get('icons') or {}
                info['icons'] = {n: ic[n] for n in ic if any(n in (x.get('wie') or '') for x in (info['plan'] or {}).get('schritte', []))}
                info['divine'] = pr.get('_divine') or 0
                return self.json(info)
            if u.path == '/api/craft/plan':
                import crafting
                pr, liga = craft_preise()
                o = dict(b.get('opt') or {})
                ilvl, wunsch = int(b.get('ilvl') or 82), b.get('wunsch') or []
                # Zwei Wege: Low Budget (normale Exalted, günstigster Plan) und Viel Invest (Perfect Exalted, höchste Erfolgschance, bessere Stufen)
                bb = crafting.daten()['basis'].get((b.get('base') or '').lower()) or {}
                if str(bb.get('k', '')).startswith('Jewels'):
                    billig = stark = {'error': 'Für Juwelen gibt es nur den Community-Weg.'}
                else:
                    billig = crafting.plan(b.get('base', ''), ilvl, wunsch, dict(o, stufe='normal', ziel='billig', weg=o.get('wegBillig')), pr)
                    if billig.get('error'):
                        return self.json(billig)
                    stark = crafting.plan(b.get('base', ''), ilvl, wunsch, dict(o, stufe='perfect', ziel='stark', weg=o.get('wegStark')), pr)
                try:
                    rz = crafting.rezept(b.get('base', ''), ilvl, wunsch, pr, stufe=o.get('stufe') or 'normal')
                except Exception:
                    log('Crafting-Rezept: ' + traceback.format_exc()[-400:])
                    rz = {'error': 'Der Community-Weg konnte nicht berechnet werden.'}
                ic = _craft_preise.get('icons') or {}
                wie = ' '.join((x.get('wie') or '') + ' ' + ' '.join(e['n'] for e in x.get('extra') or []) for x in rz.get('schritte', []))
                return self.json({'billig': billig, 'stark': stark, 'rezept': rz, 'liga': liga, 'divine': pr.get('_divine') or 0,
                                  'icons': {n: ic[n] for n in ic if n in wie}, 'preise': {n: pr[n] for n in pr if isinstance(pr[n], (int, float)) and n in wie}})
            if u.path == '/api/upgrades/mods':
                # Beste Mods für einen Slot: jeden möglichen Prefix/Suffix (beste Stufe) einzeln in PoB testen
                if not S.char:
                    return self.json({'error': 'Bitte zuerst einen Charakter laden.'})
                slot = str(b.get('slot', ''))
                U = getattr(S, 'upgrades', None) or {}
                cur = (U.get('slots') or {}).get(slot) or {}
                ilvl = int(b.get('ilvl') or 82)
                if W.game() == 'poe2':
                    import crafting
                    base = cur.get('base') or ''
                    pl = crafting.pool(base, ilvl)
                    klasse = 'ring' if 'Ring' in slot else 'amulet' if 'Amulet' in slot else 'belt' if 'Belt' in slot else ''
                    if pl.get('error') and not klasse:
                        return self.json({'error': 'Für %s gibt es noch keine Crafting-Daten.' % (base or slot)})
                    # Normale Mods, Abyss (desecrated) und Essenz-Mods aus dem Crafting-Pool
                    mods = [{'id': m['id'], 'text': m['text'], 'typ': 'Prefix' if m['seite'] == 'p' else 'Suffix', 'quelle': m['quelle'],
                             'chance': m.get('chanceOmen'), 'familie': m.get('familie'),
                             'stufen': [{'t': t['text'], 'il': t['il']} for t in (m.get('stufen') or [])[:5]]}
                            for m in (pl.get('mods') or []) if m['quelle'] in ('normal', 'desecrated', 'essence', 'perfect_essence')]
                    # Genesis-Baum (Breach) für Ringe, Amulette, Gürtel – mit Höchstwert
                    if klasse:
                        try:
                            gk = json.load(open(os.path.join(BASE, 'ui', 'data', 'genesis_klassen.json'), encoding='utf-8'))
                            for e in json.load(open(os.path.join(BASE, 'ui', 'data', 'mods_poe2_alle.json'), encoding='utf-8')):
                                if e[2] != 'genesis' or klasse not in gk.get(e[0], []):
                                    continue
                                t, i = e[6], 0
                                while '#' in t and i < len(e[7]):
                                    v = e[7][i][1]
                                    t = t.replace('#', str(int(v)) if float(v).is_integer() else str(v), 1)
                                    i += 1
                                mods.append({'id': 'G:' + e[0], 'text': t, 'typ': 'Prefix' if e[1] == 'p' else 'Suffix', 'quelle': 'genesis'})
                        except Exception:
                            log('Genesis-Mods: ' + traceback.format_exc()[-300:])
                else:
                    mp = pob_frage({'mode': 'modpool', 'slot': slot, 'ilvl': ilvl})
                    if mp.get('error'):
                        return self.json({'error': 'Kein Item in diesem Slot.' if mp['error'] == 'leer' else mp['error']})
                    base = mp['base']
                    mods = [{'id': m['id'], 'text': m['text'], 'typ': m['typ'], 'quelle': 'normal'} for m in mp['mods']]
                r = pob_frage({'mode': 'modwert', 'base': base, 'ilvl': ilvl, 'slot': slot, 'mods': mods}, 180)
                if r.get('error'):
                    return self.json(r)
                wv = {x['id']: x for x in r.get('res') or []}
                out = []
                ign = W.ignite_build(U.get('alt') or {}) if U.get('alt') else False
                for m in mods:
                    x = wv.get(m['id'])
                    if not x:
                        continue
                    w = W.wirkungen([{'t': t, 'x': True} for t in x.get('nb') or []], ign)
                    sc = x['dps'] + x['ehp'] * .6 + x['speed'] * .8 + sum(v['pkt'] for v in w) * .5
                    out.append(dict(m, dps=round(x['dps'], 1), ehp=round(x['ehp'], 1), speed=round(x['speed'], 1), score=round(sc, 1),
                                    wirkung=[v['name'] for v in w], nb=bool(x.get('nb'))))
                out.sort(key=lambda m: -m['score'])
                return self.json({'slot': slot, 'base': base, 'cur': cur.get('name'), 'mods': out[:40], 'game': W.game()})
            if u.path == '/api/upgrades/wunsch':
                S.settings['upgWunsch'] = [str(x)[:80] for x in (b.get('namen') or []) if str(x).strip()][:30]
                speichere('settings.json', S.settings)
                U = getattr(S, 'upgrades', None)
                if U and S.settings['upgWunsch']:
                    U['auftraege'] = (U.get('auftraege') or []) + [('Wunsch', 1)]
                    if not U.get('laeuft'):
                        U['laeuft'] = True
                        W.jobs.put(('upgscan', U['gen']))
                return self.json({'ok': True})
            if u.path == '/api/strategy':
                return self.json(F.strat_action(b))
            if u.path == '/api/stash/tabs':
                for t in F.state['tabs']:
                    if 'all' in b:
                        t['on'] = bool(b['all']) and not t['folder']
                    elif t['id'] == b.get('id'):
                        t['on'] = bool(b.get('on'))
                F.persist()
                S.bump()
                return self.json({'ok': True})
            if u.path == '/api/open':
                url = str(b.get('url', ''))
                if not re.match(r'^https?://[^\s"<>]+$', url) or len(url) > 8000:
                    return self.json({'ok': False})
                try:
                    if IS_WIN:
                        os.startfile(url)  # Standardbrowser (z. B. Opera)
                    else:
                        import webbrowser
                        webbrowser.open(url)
                    return self.json({'ok': True})
                except Exception as e:
                    log('Link öffnen: %s' % e)
                    return self.json({'ok': False})
            if u.path == '/api/refresh':
                W.jobs.put(('load', None))
                return self.json({'ok': True})
            if u.path == '/api/timeless':
                antwort = queue.Queue()
                req = {k: b.get(k) for k in ('action', 'type', 'seed', 'socket', 'sockets', 'wants', 'onlyAlloc') if b.get(k) is not None}
                if req.get('sockets'):
                    req['sockets'] = [int(x) for x in req['sockets']][:4]
                for k in ('type', 'seed', 'socket'):
                    if req.get(k) is not None:
                        req[k] = int(req[k])
                W.jobs.put(('timeless', (req, antwort)))
                try:
                    return self.json(antwort.get(timeout=180))
                except queue.Empty:
                    return self.json({'error': 'Die Suche hat zu lange gedauert – weniger Sockel oder Mods wählen.'})
            if u.path == '/api/price/custom':
                t = str(b.get('t', ''))
                r = S.last if S.last and str(S.last.get('t')) == t else (S.full.get(t) or next((v for k, v in S.full.items() if abs(float(k) - float(t or 0)) < .01), None))
                if not r:
                    return self.json({'error': 'Item nicht mehr gefunden – bitte neu kopieren.'})
                if not r.get('pmods') and r.get('raw'):
                    import pricecheck
                    r['pmods'] = pricecheck.mods_aus_text(r['raw'])
                if not r.get('klasse'):
                    m = re.search(r'^Item Class: (.+)$', r.get('raw', ''), re.M)
                    r['klasse'] = m.group(1).strip() if m else ''
                alt = r.get('price') or {}
                log('Eigene Preissuche: %s, Auswahl=%s, Basis=%s' % (r.get('name'), b.get('sel'), b.get('base')))
                r['price'] = {'busy': True, 'auswahl': alt.get('auswahl'), 'sel': b.get('sel'), 'base': bool(b.get('base'))}
                S.bump()
                threading.Thread(target=W.preis, args=(r, [int(i) for i in (b.get('sel') or [])] if b.get('sel') is not None else None, bool(b.get('base'))), daemon=True).start()
                return self.json({'ok': True})
            if u.path == '/api/i18n/missing':  # fehlende Übersetzungen sammeln, um sie nachzutragen
                try:
                    alt = lade('i18n_missing.json', [])
                    neu = [x for x in b if isinstance(x, str) and x not in alt][:200] if isinstance(b, list) else []
                    if neu:
                        speichere('i18n_missing.json', (alt + neu)[-2000:])
                except Exception:
                    pass
                return self.json({'ok': True})
            if u.path == '/api/compare':
                if b.get('text'):
                    W.jobs.put(('item', b['text']))
                return self.json({'ok': True})
            if u.path == '/api/profiles/save':
                p = {k: str(b.get(k) or '').strip() for k in ('id', 'name', 'mode', 'account', 'char', 'realm', 'link', 'guide', 'game', 'league')}
                p['mode'] = p['mode'] or 'char'
                p['realm'] = p['realm'] or 'pc'
                p['game'] = 'poe2' if p.get('game') == 'poe2' else 'poe1'
                if p['game'] == 'poe2' and p['realm'] == 'pc':
                    p['realm'] = 'poe2'
                if p['game'] == 'poe2':
                    p['mode'] = 'link'  # PoE2-Charaktere gibt pathofexile.com nicht öffentlich heraus
                alt = next((x for x in S.profiles['list'] if x['id'] == p['id']), None) if p['id'] else None
                if alt and alt.get('levelFix'):
                    p['levelFix'] = alt['levelFix']
                if not p['id']:
                    p['id'] = uuid.uuid4().hex[:8]
                    S.profiles['list'].append(p)
                else:
                    S.profiles['list'] = [p if x['id'] == p['id'] else x for x in S.profiles['list']]
                if b.get('activate') or not S.profiles.get('active'):
                    S.profiles['active'] = p['id']
                    W.jobs.put(('load', None))
                speichere('profiles.json', S.profiles)
                S.bump()
                return self.json({'ok': True, 'id': p['id']})
            if u.path == '/api/profiles/level':
                p = S.active_profile()
                if p:
                    try:
                        lv = int(b.get('level') or 0)
                    except Exception:
                        lv = 0
                    p['levelFix'] = lv if 1 <= lv <= 100 else 0
                    speichere('profiles.json', S.profiles)
                    S.bump()
                return self.json({'ok': True})
            if u.path == '/api/profiles/activate':
                S.profiles['active'] = b.get('id')
                speichere('profiles.json', S.profiles)
                S.char, S.tree = None, None
                S.bump()
                W.jobs.put(('load', None))
                return self.json({'ok': True})
            if u.path == '/api/profiles/delete':
                S.profiles['list'] = [x for x in S.profiles['list'] if x['id'] != b.get('id')]
                if S.profiles.get('active') == b.get('id'):
                    S.profiles['active'] = S.profiles['list'][0]['id'] if S.profiles['list'] else None
                    S.char, S.tree = None, None
                    if S.profiles['active']:
                        W.jobs.put(('load', None))
                speichere('profiles.json', S.profiles)
                S.bump()
                return self.json({'ok': True})
            if u.path == '/api/feedback':
                return self.json(dienst.feedback(b, S.settings, speichere, F.spiel()))
            if u.path == '/api/update':
                if b.get('pruefen'):
                    dienst.update_pruefen(log)
                    S.bump()
                    return self.json({'ok': True})
                try:
                    return self.json(dienst.update_installieren(log))
                except Exception as e:
                    dienst.STAND['laedt'] = False
                    return self.json({'ok': False, 'error': 'Update fehlgeschlagen: %s' % str(e)[:150]})
            if u.path == '/api/settings':
                for k, v in b.items():
                    if k in DEFAULT_SETTINGS and k != 'windows':
                        S.settings[k] = v
                speichere('settings.json', S.settings)
                S.bump()
                if any(k.startswith('hotkey') or k == 'itemTrigger' for k in b) and WIN:
                    threading.Timer(0.6, neustart).start()
                if 'overlayOpacity' in b:
                    threading.Thread(target=WM.apply_alpha, daemon=True).start()
                if b.get('popupPinned') is False:
                    WM._auto_hide()
                return self.json({'ok': True})
            if u.path == '/api/history/clear':
                S.history = []
                S.full = {}
                speichere('history.json', S.history)
                speichere('history_full.json', S.full)
                S.bump()
                return self.json({'ok': True})
            if u.path == '/api/window':
                name, aktion = b.get('name', 'hub'), b.get('action', 'open')
                if aktion == 'reset':
                    WM.reset()
                elif name in WM.WINDOWS:
                    if aktion == 'open':
                        WM.open(name)
                    elif aktion == 'hide':
                        WM.hide(name)
                    elif aktion == 'keep':
                        WM.keep_alive()
                    elif aktion == 'resize':
                        WM.resize(name, b.get('height', 600))
                    elif aktion == 'clip':
                        WM.clip(name, b.get('m'))
                    elif aktion == 'size':
                        WM.size(name, b.get('dw', 0), b.get('dh', 0))
                    elif aktion == 'move':
                        WM.move(name, b.get('dx', 0), b.get('dy', 0))
                    elif aktion == 'min' and WIN:
                        hw = WM.hwnd(name)
                        if hw:
                            WIN.u.ShowWindow(hw, 6)
                    elif aktion == 'max' and WIN:
                        WM.vollbild(name)
                return self.json({'ok': True, 'win': bool(WIN)})
            if u.path == '/api/dismiss-error':
                S.set_status(error='')
                return self.json({'ok': True})
            self.json({'error': 'unbekannt'}, 404)
        except Exception as e:
            log(traceback.format_exc())
            self.json({'error': str(e)}, 500)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False


def neu_starten():
    args = [a for a in sys.argv[1:] if a != '--restart'] + ['--restart']
    if EXE:
        subprocess.Popen([sys.executable] + args, cwd=BASE)
    else:
        subprocess.Popen([sys.executable, os.path.join(BASE, 'poe_app.py')] + args, cwd=BASE)
    os._exit(0)


def neustart():
    log('Neustart für neue Tastenkürzel')
    neu_starten()


def selbst_update():
    """Startet den Companion neu, sobald neue Programmdateien da sind (Updates ohne Klicken)."""
    if EXE:
        return   # die .exe aktualisiert sich über GitHub (siehe update_pruefen)

    def stand():
        return {f: os.path.getmtime(os.path.join(BASE, f)) for f in os.listdir(BASE) if f.endswith('.py')}
    alt = stand()
    while True:
        time.sleep(4)
        try:
            neu = stand()
        except Exception:
            continue
        if neu != alt:
            time.sleep(3)  # warten, bis alle Dateien geschrieben sind
            if S.status.get('busy'):
                time.sleep(10)
            log('Neue Version erkannt – starte neu')
            neu_starten()


def main():
    if '--restart' in sys.argv:
        time.sleep(2.5)
    srv = None
    for versuch in range(8 if '--restart' in sys.argv else 1):
        try:
            srv = Server(('127.0.0.1', PORT), Handler)
            break
        except OSError:
            time.sleep(1)
    if srv is None:
        # Läuft schon: nur den Hub nach vorne holen
        try:
            import urllib.request
            req = urllib.request.Request('http://127.0.0.1:%d/api/window' % PORT, data=b'{"name":"hub"}',
                                         headers={'Content-Type': 'application/json'})
            urllib.request.urlopen(req, timeout=3)
        except Exception:
            pass
        return
    log('Start (Version %s, Testmodus=%s)' % (VERSION, bool(FAKE)))
    W.start()
    F.start()
    C.start()
    for fn in (clipboard_watch, hotkeys, maus_tasten, WM.merke_positionen, WM.clip_waechter, WM.edge_neu_starten, selbst_update, verknuepfungen):
        threading.Thread(target=fn, daemon=True).start()
    if not FAKE:
        threading.Thread(target=dienst.hintergrund, args=(S, speichere, F.spiel, log), daemon=True).start()
    if WIN and '--no-window' not in sys.argv and '--restart' not in sys.argv:
        WM.open('hub')
    srv.serve_forever()


if __name__ == '__main__':
    main()
