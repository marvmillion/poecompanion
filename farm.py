# PoE Companion – Hintergrund-Thread für Stash-Wert und Farming-Session
import os, json, time, queue, threading, traceback, random
import stash

SECRET = 'secret.json'


class Farm(threading.Thread):
    def __init__(self, S, lade, speichere, log, fake=False):
        super().__init__(daemon=True)
        self.S, self.lade, self.speichere, self.log, self.fake = S, lade, speichere, log, fake
        self.jobs = queue.Queue()
        self.prices = None
        self.tabs = []
        self.base = None        # Snapshot beim Start der Session
        self.counter = None
        self.next_tick = 0
        self.lock = threading.Lock()
        st = self.lade('farm.json', {})
        self.state = {
            'status': {'busy': False, 'text': '', 'error': '', 'progress': 0},
            'hasSessid': bool(self.secret()) or fake,
            'league': '', 'divine': 0, 'pricesT': 0,
            'tabs': st.get('tabs', []),
            'tabsLeague': st.get('tabsLeague'),
            'scan': st.get('scan'),
            'history': st.get('history', []),
            'scan2': st.get('scan2'),
            'snaps': st.get('snaps', []),
            'snaps2': st.get('snaps2', []),
            'history2': st.get('history2', []),
            'erf': dict({'tab': 'Currency', 'tabs': {}, 'letzt': '', 'n': 0}, **{k: v for k, v in (st.get('erf') or {}).items() if k != 'aktiv'}, aktiv=False),
            'session': None,
            'sessions': st.get('sessions', []),
            'ledger': st.get('ledger', []),
            'strategies': st.get('strategies', []),
            'strat': st.get('strat'),
            'logPath': '',
        }
        for ks, kn in (('scan', 'snaps'), ('scan2', 'snaps2')):
            sc = self.state.get(ks)
            if sc and not self.state[kn] and sc.get('top'):
                # ersten Vergleichsstand aus dem letzten Snapshot übernehmen
                self.state[kn] = [{'t': int(sc.get('t') or 0), 'total': sc.get('total'), 'dv': sc.get('divine'), 'league': sc.get('league'),
                                   'items': {x['n']: [x['q'], x['c']] for x in sc['top']}}]
        # laufende Session nach Neustart wiederherstellen
        sess = st.get('session')
        if sess and sess.get('active'):
            self.state['session'] = sess
            self.base = st.get('base')

    # -------------------------------------------------- Hilfen
    def secret(self):
        return (self.lade(SECRET, {}) or {}).get('poesessid', '')

    def set_secret(self, v):
        v = (v or '').strip()
        self.speichere(SECRET, {'poesessid': v})
        self.state['hasSessid'] = bool(v)
        self.bump()

    def bump(self):
        self.S.bump()

    def status(self, text=None, busy=None, error=None, progress=None):
        st = self.state['status']
        if text is not None: st['text'] = text
        if busy is not None: st['busy'] = busy
        if error is not None: st['error'] = error
        if progress is not None: st['progress'] = progress
        self.bump()

    def persist(self):
        s = self.state
        self.speichere('farm.json', {'tabs': s['tabs'], 'tabsLeague': s.get('tabsLeague'), 'scan': s['scan'], 'history': s['history'][-500:],
                                     'scan2': s.get('scan2'), 'history2': s.get('history2', [])[-500:], 'erf': s.get('erf'),
                                     'snaps': s.get('snaps', []), 'snaps2': s.get('snaps2', []),
                                     'session': s['session'], 'base': self.base if s['session'] and s['session'].get('active') else None,
                                     'sessions': s['sessions'][-200:], 'ledger': s['ledger'], 'strategies': s['strategies'], 'strat': s.get('strat')})

    def log_pfad(self):
        g = 'poe2' if (self.S.active_profile() or {}).get('game') == 'poe2' else 'poe1'
        return self.S.settings.get('clientLog2' if g == 'poe2' else 'clientLog', ''), g

    def spiel(self):
        return 'poe2' if (self.S.active_profile() or {}).get('game') == 'poe2' else 'poe1'

    def liga(self):
        """Liga des aktiven Spiels: PoE1 und PoE2 sind getrennt (eigene Einstellung, eigener Charakter)."""
        p = self.S.active_profile() or {}
        info = (self.S.char or {}).get('info') or {}
        if self.spiel() == 'poe2':
            return (self.S.settings.get('stashLeague2') or p.get('league') or info.get('league') or '').strip()
        return (self.S.settings.get('stashLeague') or info.get('league') or '').strip()

    def who(self):
        p = self.S.active_profile() or {}
        league = self.liga()
        if not league:
            # Charakter noch nicht geladen: nicht einfach „Standard“ nehmen, sonst landen falsche Liga und Preise im Stash-Wert
            raise stash.GGGError('Warte, bis dein Charakter geladen ist – erst dann ist klar, welche Liga gelesen wird.')
        return p.get('account', ''), p.get('char', ''), p.get('realm') or 'pc', league

    def _falsche_liga(self):
        """Stash-Wert stammt aus einer anderen Liga als der aktuelle Charakter – neu bewerten."""
        sc = self.state.get('scan') or {}
        lg = self.liga()
        return bool(sc and lg and sc.get('league') and sc['league'] != lg and time.time() - getattr(self, 'last_auto', 0) > 60)

    def snapshot_public(self):
        s = dict(self.state)
        if self.spiel() == 'poe2':
            s['scan'], s['history'] = s.get('scan2'), s.get('history2') or []
            s['snaps'] = s.get('snaps2') or []
        s.pop('snaps2', None)
        e = s.get('erf') or {}
        s['erf'] = {'aktiv': e.get('aktiv'), 'tab': e.get('tab'), 'letzt': e.get('letzt'), 'n': e.get('n', 0),
                    'tabs': {k: {'n': len(v), 'q': sum(x.get('stackSize') or 1 for x in v.values())} for k, v in (e.get('tabs') or {}).items()}}
        if s['session'] and s['session'].get('active'):
            s['session'] = dict(s['session'], nextTick=max(0, int(self.next_tick - time.time())))
        return s

    # -------------------------------------------------- Thread
    def run(self):
        self.state['logPath'] = stash.find_client_log(*self.log_pfad())
        if self.state['session'] and self.state['session'].get('active'):
            self.counter = stash.MapCounter(self.state['logPath'])
            self.counter.maps = self.state['session'].get('mapList', [])
            self.next_tick = time.time() + 20
        while True:
            try:
                art = self.jobs.get(timeout=2)
            except queue.Empty:
                art = None
            try:
                sess = self.state['session']
                if sess and sess.get('active'):
                    if self.counter:
                        before = len(self.counter.maps)
                        self.counter.poll()
                        if len(self.counter.maps) != before or self.counter.last_zone != sess.get('maps', {}).get('zone'):
                            sess['maps'] = self.counter.summary()
                            sess['mapList'] = self.counter.maps[-300:]
                            self.bump()
                    iv = max(1, int(self.S.settings.get('stashInterval') or 5)) * 60
                    if art is None and time.time() >= self.next_tick:
                        art = 'tick'
                else:
                    # Stash-Wert automatisch aktualisieren (Einstellung, Standard alle 10 Minuten)
                    auto = int(self.S.settings.get('stashAutoScan') or 0)
                    if art is None and auto > 0 and self.spiel() != 'poe2' and self.state['hasSessid'] and not self.state['status']['busy'] and (self.S.char or self.S.settings.get('stashLeague')) \
                            and (time.time() - max((self.state.get('scan') or {}).get('t', 0), getattr(self, 'last_auto', 0)) >= auto * 60
                                 or self._falsche_liga()):
                        self.last_auto = time.time()
                        art = 'scan'
                if art == 'tabs':
                    self.load_tabs()
                elif art == 'scan':
                    self.scan()
                elif art == 'erfsnap':
                    self.erf_snapshot()
                elif art == 'start':
                    self.start_session()
                elif art == 'start_craft':
                    self.start_session('craft')
                elif art == 'prices':
                    self.ensure_prices(self.who()[3])
                    self.bump()
                elif art == 'tick':
                    self.tick()
                elif art == 'stop':
                    self.stop_session()
            except stash.GGGError as e:
                self.status(text='', busy=False, error=str(e), progress=0)
                if self.state['session'] and self.state['session'].get('active'):
                    self.next_tick = time.time() + 120
            except Exception as e:
                self.log(traceback.format_exc())
                self.status(text='', busy=False, error='Fehler: ' + str(e).splitlines()[0][:200], progress=0)
                if self.state['session'] and self.state['session'].get('active'):
                    self.next_tick = time.time() + 120

    # -------------------------------------------------- Datenquellen
    def need(self):
        if (self.S.active_profile() or {}).get('game') == 'poe2':
            raise stash.GGGError('Den PoE2-Stash gibt pathofexile.com über diese Schnittstelle nicht heraus (sie liefert nur PoE1). '
                                 'Börse, Preise und der Map-Zähler funktionieren für PoE2 trotzdem.')
        acc, char, realm, league = self.who()
        if not acc:
            raise stash.GGGError('Für den Stash brauchst du ein Profil mit PoE-Account (nicht nur einen Guide-Build).')
        sid = self.secret()
        if not sid and not self.fake:
            raise stash.GGGError('Bitte zuerst deine POESESSID unten in den Stash-Einstellungen eintragen.')
        return acc, char, realm, league, sid

    def ensure_prices(self, league):
        if self.prices and self.prices.league == league and getattr(self.prices, 'game', 'poe1') == self.spiel() and time.time() - self.prices.t < 1800:
            self.prices.map_default = float(self.S.settings.get('stashMapPrice') or 0)
            return self.prices
        if self.fake:
            self.prices = FakePrices(league)
        else:
            self.prices = stash.Prices(league, 'poe2' if (self.S.active_profile() or {}).get('game') == 'poe2' else 'poe1').load(lambda t: self.status(text=t))
            if not self.prices.divine:
                raise stash.GGGError('poe.ninja liefert keine Preise für die Liga „%s“. Liga-Name in den Stash-Einstellungen prüfen.' % league)
        self.prices.map_default = float(self.S.settings.get('stashMapPrice') or 0)
        self.state['league'], self.state['divine'], self.state['pricesT'] = league, self.prices.divine, self.prices.t
        try:
            self.kurs_merken()
        except Exception as e:
            self.log('Kurse: %s' % e)
        return self.prices

    # -------------------------------------------------- Börse: eigener Kursverlauf
    def kurs_merken(self):
        """Speichert bei jedem Preis-Update die Kurse der meistgehandelten Items (eigene Historie über Wochen)."""
        p = self.prices
        if not p or not getattr(p, 'markt', None) or self.fake:
            return
        K = self.lade('kurse.json', {})
        L = K.setdefault(p.league, [])
        if L and p.t - L[-1][0] < 20 * 60:
            return
        top = sorted(p.markt.items(), key=lambda kv: -(kv[1].get('vol') or 0))[:80]
        namen = {n for n, _ in top} | {e['item'] for e in self.state['ledger']} | {'Divine Orb'}
        L.append([round(p.t), round(p.divine, 2), {n: round(p.simple[n], 4) for n in namen if n in p.simple}])
        K[p.league] = L[-1500:]
        self.speichere('kurse.json', K)

    def markt(self):
        p = self.prices
        lg = self.liga()
        if p and (p.league != lg or getattr(p, 'game', 'poe1') != self.spiel()):
            p = None   # Kurse stammen aus der anderen Liga / dem anderen Spiel – nicht mischen
        if not p or not getattr(p, 'markt', None):
            fehl = getattr(self, '_markt_fehler', None)
            if fehl and fehl[0] == lg and time.time() - fehl[1] < 300:
                return {'error': 'poe.ninja liefert keine Kurse für die Liga „%s“. Liga-Name in den Stash-Einstellungen prüfen.' % lg, 'list': []}
            if not lg:
                return {'error': 'Keine Liga eingestellt – in den Stash-Einstellungen die Liga eintragen.', 'list': []}
            if not getattr(self, '_markt_laedt', False):
                if lg:
                    self._markt_laedt = True
                    def los():
                        try:
                            self.ensure_prices(lg)
                            if not getattr(self.prices, 'markt', None):
                                self._markt_fehler = (lg, time.time())
                            self.S.bump()
                        except Exception as e:
                            self._markt_fehler = (lg, time.time())
                            self.log('Börse: %s' % e)
                        finally:
                            self._markt_laedt = False
                    threading.Thread(target=los, daemon=True).start()
            return {'loading': True, 'list': []}
        K = (self.lade('kurse.json', {}) or {}).get(p.league, [])
        mine = {e['item'] for e in self.state['ledger'] if e.get('sold') is None}
        out = []
        for n, m in p.markt.items():
            h = [[t, x[n]] for t, _, x in K if n in x]
            out.append({'n': n, 'c': m['c'], 'vol': m.get('vol') or 0, 'sp': m.get('sp'), 'ch': m.get('ch'), 'typ': m.get('typ'),
                        'ic': p.icons.get(n, ''), 'h': h[-400:], 'mine': n in mine})
        out.sort(key=lambda x: -x['vol'])
        # Wechselkurse Divine / Exalted / Chaos – alles in der Basis-Währung von poe.ninja umgerechnet
        e = getattr(p, 'einheit', 'Chaos')
        wert = {'Divine Orb': p.divine, e + (' Orb' if e in ('Chaos', 'Exalted') else ''): 1.0}
        for n in ('Chaos Orb', 'Exalted Orb', 'Divine Orb'):
            if n not in wert and p.simple.get(n):
                wert[n] = p.simple[n]
        kurse = {a: {b: round(wert[a] / wert[b], 3) for b in wert if b != a and wert[b]} for a in wert if wert[a]}
        return {'league': p.league, 'divine': p.divine, 't': p.t, 'einheit': e, 'kurse': kurse, 'list': out[:250],
                'divH': [[t, d] for t, d, _ in K][-400:]}

    def load_tabs(self):
        acc, char, realm, league, sid = self.need()
        self.status(text='Lade Stash-Tabs…', busy=True, error='')
        tabs = FAKE_TABS if self.fake else stash.list_tabs(acc, league, realm, sid)
        old = {t['id']: t.get('on', True) for t in self.state['tabs']}
        for t in tabs:
            t['on'] = old.get(t['id'], not t['folder'] and t['type'] not in ('MapStash', 'UniqueStash'))
        self.state['tabs'] = tabs
        self.state['league'] = league
        self.state['tabsLeague'] = league
        self.persist()
        self.status(text='', busy=False)

    def fetch(self, with_inventory):
        acc, char, realm, league, sid = self.need()
        if not self.state['tabs'] or self.state.get('tabsLeague') != league:
            self.load_tabs()
        prices = self.ensure_prices(league)
        tabs = [t for t in self.state['tabs'] if t.get('on') and not t['folder']]
        by_tab = {}
        n = len(tabs) + (1 if with_inventory and char else 0)
        for i, t in enumerate(tabs):
            self.status(text='Lese Tab „%s“ (%d/%d)…' % (t['n'], i + 1, n), busy=True, progress=i / max(n, 1))
            by_tab[t['n']] = fake_items(t, self) if self.fake else stash.tab_items(acc, league, realm, sid, t['i'])
        if with_inventory and char:
            self.status(text='Lese Inventar…', progress=(n - 1) / n)
            by_tab['Inventar'] = fake_inv(self) if self.fake else stash.char_items(acc, char, realm, sid)
        snap = stash.aggregate(by_tab, prices)
        return snap, prices

    # -------------------------------------------------- Stash-Wert
    def scan(self):
        snap, prices = self.fetch(with_inventory=False)
        self.scan_speichern(snap, prices, 'scan', 'history')

    def scan_speichern(self, snap, prices, k_scan, k_hist):
        top = sorted((v for v in snap['items'].values() if v['c'] > 0), key=lambda v: -v['q'] * v['c'])[:400]
        dv = prices.divine or 1
        self.state[k_scan] = {'t': time.time(), 'total': snap['total'], 'div': round(snap['total'] / dv, 2),
                              'tabs': sorted(([k, v] for k, v in snap['tabs'].items()), key=lambda x: -x[1]),
                              'top': [{'n': v['n'], 'q': v['q'], 'c': round(v['c'], 2), 'sum': round(v['q'] * v['c'], 1), 'icon': v['icon'], 'f': v['f'],
                                      'tab': max((v.get('tabs') or {'': 1}).items(), key=lambda x: x[1])[0], 'ntab': len(v.get('tabs') or {})} for v in top],
                              'count': sum(v['q'] for v in snap['items'].values()), 'divine': dv, 'league': prices.league}
        H = self.state.setdefault(k_hist, [])
        if H and (len(H[-1]) <= 3 or H[-1][3] != prices.league):
            H[:] = []  # neue Liga (oder alte Einträge ohne Liga): Verlauf neu beginnen
        H.append([int(time.time()), snap['total'], dv, prices.league])
        # Item-Stand je Snapshot merken (für Vorher/Nachher), höchstens 30 pro Spiel
        SN = self.state.setdefault('snaps' + ('2' if k_scan == 'scan2' else ''), [])
        if SN and SN[-1].get('league') != prices.league:
            SN[:] = []
        SN.append({'t': int(time.time()), 'total': round(snap['total'], 1), 'dv': dv, 'league': prices.league,
                  'items': {v['n']: [v['q'], round(v['c'], 2)] for v in snap['items'].values() if v['c'] > 0}})
        del SN[:-30]
        self.persist()
        self.status(text='', busy=False, error='', progress=1)

    # -------------------------------------------------- PoE2: Stash per Strg+C erfassen
    def erf_aktion(self, b):
        e = self.state['erf']
        a = b.get('a')
        if a == 'start':
            e['aktiv'] = True
            e['seit'] = time.time()
            e['tab'] = (str(b.get('tab') or e.get('tab') or 'Currency').strip()[:40]) or 'Currency'
        elif a == 'stop':
            e['aktiv'] = False
        elif a == 'tab':
            e['tab'] = (str(b.get('tab') or '').strip()[:40]) or e['tab']
        elif a == 'leeren':
            t = b.get('tab')
            if t:
                e['tabs'].pop(t, None)
            else:
                e['tabs'] = {}
            e['n'] = sum(len(v) for v in e['tabs'].values())
        elif a == 'snapshot':
            if not e['tabs']:
                return {'ok': False, 'error': 'Noch nichts erfasst.'}
            if self.state['status']['busy']:
                return {'ok': False, 'error': 'Läuft gerade schon etwas.'}
            self.status(busy=True, error='', text='Bewerte erfasste Items…')
            self.jobs.put('erfsnap')
        self.persist()
        self.bump()
        return {'ok': True}

    def erfassen(self, text):
        it = stash.parse_clip(text)
        if not it:
            return False
        e = self.state['erf']
        e['seit'] = time.time()
        tab = e['tabs'].setdefault(e['tab'], {})
        key = stash.item_key(it)
        if it.get('_text') and it['frameType'] in (1, 2):
            key += '#' + str(abs(hash(it['_text'])) % 10 ** 8)   # jedes Rare ist ein eigenes Item
        tab[key] = it   # gleiches Item im gleichen Tab: letzte Kopie zählt (doppelt kopieren schadet nicht)
        e['letzt'] = '%s × %s' % (stash.display_name(it), it.get('stackSize') or 1)
        e['n'] = sum(len(v) for v in e['tabs'].values())
        if time.time() - getattr(self, '_erf_t', 0) > 5:
            self._erf_t = time.time()
            self.persist()
        self.bump()
        return True

    def erf_snapshot(self):
        league = self.liga()
        if not league:
            raise stash.GGGError('Liga unbekannt – bitte in den Stash-Einstellungen eintragen.')
        prices = self.ensure_prices(league)
        for v in self.state['erf']['tabs'].values():
            for it in v.values():
                if not it.get('icon'):
                    it['icon'] = prices.icons.get(stash.display_name(it)) or prices.icons.get(it.get('typeLine') or '') or ''
        tabs = self.state['erf']['tabs']
        snap = stash.aggregate({k: list(v.values()) for k, v in tabs.items()}, prices)
        # Rares, Juwelen und Uniques ohne festen Preis: einzeln über den Marktcheck schätzen
        mp = self.state['erf'].setdefault('mp', {})
        offen = [(tn, k, it) for tn, v in tabs.items() for k, it in v.items() if it.get('_text') and not (it['frameType'] == 3 and prices.price(it))]
        rares = []
        for i, (tn, k, it) in enumerate(offen):
            c = mp.get(k)
            if not c or time.time() - c.get('t', 0) > 6 * 3600:
                self.status(text='Marktcheck %d/%d: %s' % (i + 1, len(offen), it.get('name') or it.get('typeLine')), busy=True, progress=i / max(1, len(offen)))
                try:
                    c = dict(self.markt_preis(it['_text']) or {}, t=time.time()) if getattr(self, 'markt_preis', None) else None
                except Exception as ex:
                    self.log('Stash-Marktcheck %s: %s' % (it.get('typeLine'), str(ex)[:160]))
                    c = None
                if c:
                    mp[k] = c
            if not c:
                continue
            wert = float(c.get('c') or 0)
            rares.append({'n': it.get('name') or it.get('typeLine'), 'base': it.get('baseType'), 'tab': tn, 'f': it['frameType'], 'c': round(wert, 1),
                          'lo': c.get('lo'), 'hi': c.get('hi'), 'sicher': c.get('sicher'), 'n_ang': c.get('n'), 'url': c.get('url', '')})
            snap['total'] += wert
            snap['tabs'][tn] = snap['tabs'].get(tn, 0) + wert
        for k in [k for k in mp if not any(k in v for v in tabs.values())]:
            mp.pop(k, None)
        self.scan_speichern(snap, prices, 'scan2', 'history2')
        self.state['scan2']['rares'] = sorted(rares, key=lambda r: -r['c'])
        if self.state.get('snaps2'):
            it = self.state['snaps2'][-1]['items']
            for r in rares:
                n = r['n'] + (' (' + r['base'] + ')' if r.get('base') and r['base'] != r['n'] else '')
                q0 = it.get(n, [0, r['c']])[0]
                it[n] = [q0 + 1, r['c']]
        self.persist()

    # -------------------------------------------------- Farming-Session
    def start_session(self, mode='farm'):
        self.status(text='Erfasse Startwert…', busy=True, error='')
        snap, prices = self.fetch(with_inventory=self.S.settings.get('stashInventory', True))
        self.base = {k: [v['q'], v['n'], v['icon'], v['f']] for k, v in snap['items'].items()}
        self.state['logPath'] = stash.find_client_log(*self.log_pfad())
        self.counter = stash.MapCounter(self.state['logPath'])
        now = time.time()
        self.state['session'] = {'active': True, 't0': now, 'tLast': now, 'startValue': snap['total'],
                                 'value': snap['total'], 'earned': 0, 'spent': 0, 'profit': 0, 'perHour': 0,
                                 'divine': prices.divine, 'curve': [[0, 0]], 'gains': [], 'costs': [],
                                 'maps': self.counter.summary(), 'mapList': [], 'league': prices.league,
                                 'logFound': bool(self.state['logPath']), 'mode': mode,
                                 'strat': self.state.get('strat') if mode == 'farm' else None}
        self.next_tick = now + max(1, int(self.S.settings.get('stashInterval') or 5)) * 60
        self.persist()
        self.status(text='', busy=False, progress=1)

    def tick(self):
        sess = self.state['session']
        if not sess or not sess.get('active'):
            return
        self.next_tick = time.time() + max(1, int(self.S.settings.get('stashInterval') or 5)) * 60
        snap, prices = self.fetch(with_inventory=self.S.settings.get('stashInventory', True))
        pm = {k: v['c'] for k, v in snap['items'].items()}
        diffs, ohne = [], []
        for k in set(self.base) | set(snap['items']):
            q0 = self.base.get(k, [0])[0]
            now = snap['items'].get(k)
            q1 = now['q'] if now else 0
            dq = q1 - q0
            if not dq:
                continue
            c = pm.get(k)
            if c is None:  # komplett verbraucht -> Preis neu bestimmen
                c = self._price_by_key(k, prices)
            meta = now or {'n': self.base[k][1], 'icon': self.base[k][2], 'f': self.base[k][3]}
            if c > 0:
                diffs.append({'n': meta['n'], 'q': dq, 'c': round(c, 2), 'sum': round(dq * c, 1), 'icon': meta['icon'], 'f': meta['f']})
            else:
                ohne.append({'n': meta['n'], 'q': dq, 'icon': meta['icon'], 'f': meta['f']})
        earned = sum(d['sum'] for d in diffs if d['sum'] > 0)
        spent = -sum(d['sum'] for d in diffs if d['sum'] < 0)
        now = time.time()
        hrs = max((now - sess['t0']) / 3600, 5 / 60)
        profit = earned - spent
        sess.update({'tLast': now, 'value': snap['total'], 'earned': round(earned, 1), 'spent': round(spent, 1),
                     'profit': round(profit, 1), 'perHour': round(profit / hrs, 1), 'divine': prices.divine,
                     'gains': sorted([d for d in diffs if d['sum'] > 0], key=lambda d: -d['sum'])[:40],
                     'costs': sorted([d for d in diffs if d['sum'] < 0], key=lambda d: d['sum'])[:40],
                     'unpriced': sorted(ohne, key=lambda d: -abs(d['q']))[:30],
                     'currency': sorted([d for d in diffs if d['f'] == 5], key=lambda d: -abs(d['sum']))[:20]})
        sess['curve'].append([int(now - sess['t0']), round(profit, 1)])
        if self.counter:
            self.counter.poll()
            sess['maps'] = self.counter.summary()
            sess['mapList'] = self.counter.maps[-300:]
        self.persist()
        self.status(text='', busy=False, error='', progress=1)

    def _price_by_key(self, k, prices):
        typ, rest = k[0], k[2:]
        if typ == 'S':
            return prices.simple.get(rest, 0.0)
        if typ == 'M':
            n, t = rest.split('|')
            try:
                t = int(''.join(ch for ch in t if ch.isdigit()) or 0)
            except Exception:
                t = 0
            return prices.maps.get((n, t)) or prices.maps.get((n, 0)) or prices.simple.get(n) or prices.map_default
        if typ == 'U':
            lst = prices.uniques.get(rest.split('|')[0])
            return min(v for _, v in lst) if lst else 0.0
        return 0.0

    def stop_session(self):
        sess = self.state['session']
        if not sess:
            return
        if sess.get('active'):
            try:
                self.tick()
            except Exception as e:
                self.log('Letzte Abrechnung fehlgeschlagen: %s' % e)
            sess['active'] = False
            sess['tEnd'] = time.time()
            kurz = {k: sess.get(k) for k in ('t0', 'tEnd', 'earned', 'spent', 'profit', 'perHour', 'divine', 'league')}
            kurz['maps'] = (sess.get('maps') or {}).get('count', 0)
            kurz['top'] = [g['n'] for g in sess.get('gains', [])[:3]]
            kurz['gains'] = [[g['n'], g['sum']] for g in sess.get('gains', [])[:20]]
            kurz['costs'] = [[g['n'], g['sum']] for g in sess.get('costs', [])[:20]]
            kurz['mode'] = sess.get('mode', 'farm')
            kurz['strat'] = sess.get('strat')
            self.state['sessions'].append(kurz)
        self.base = None
        self.persist()
        self.status(text='', busy=False)

    def preis_von(self, name):
        p = self.prices
        if not p:
            return None
        if name in p.simple:
            return p.simple[name]
        lst = p.uniques.get(name)
        if lst:
            return min(v for _, v in lst)
        return None

    def ledger_public(self):
        d = (self.prices.divine if self.prices else 0) or self.state.get('divine') or 0
        out = []
        for e in self.state['ledger']:
            x = dict(e)
            now = self.preis_von(e['item'])
            if e.get('sold') is not None:
                x['valueC'] = e['sold']
            elif now is not None:
                x['valueC'] = round(now * e['qty'], 1)
            x['unit'] = now
            out.append(x)
        return {'list': out, 'divine': d, 'pricesT': self.prices.t if self.prices else 0}

    def ledger_action(self, b):
        a = b.get('action')
        L = self.state['ledger']
        d = (self.prices.divine if self.prices else 0) or self.state.get('divine') or 0
        def chaos(amount, cur):
            return float(amount) * (d if cur == 'divine' else 1.0)
        if a == 'add':
            L.append({'id': str(int(time.time() * 1000)), 't': time.time(), 'item': b['item'].strip(), 'qty': float(b.get('qty') or 1),
                      'paidC': round(chaos(b.get('paid') or 0, b.get('cur')), 1), 'divAtBuy': d, 'note': (b.get('note') or '')[:120]})
        elif a == 'sell':
            for e in L:
                if e['id'] == b.get('id'):
                    e['sold'] = round(chaos(b.get('amount') or 0, b.get('cur')), 1)
                    e['tSold'] = time.time()
        elif a == 'delete':
            self.state['ledger'] = [e for e in L if e['id'] != b.get('id')]
        self.persist()
        self.bump()

    # -------------------------------------------------- Farmstrategien
    def strat_action(self, b):
        a, L = b.get('action'), self.state['strategies']
        sid = b.get('id')
        if a == 'add':
            name = (b.get('name') or '').strip()[:80]
            link = (b.get('link') or '').strip()[:300]
            if not name and link:
                import re
                m = re.search(r'/strategies/\d+/([^/?#]+)', link)
                name = (m.group(1).replace('_', ' ').strip().capitalize() if m else link)[:80]
            if not name:
                return {'error': 'Bitte einen Namen eingeben.'}
            L.append({'id': str(int(time.time() * 1000)), 'name': name, 'link': link, 'note': (b.get('note') or '')[:400],
                      'fav': bool(b.get('fav')), 't': time.time()})
        elif a == 'edit':
            for e in L:
                if e['id'] == sid:
                    for k in ('name', 'link', 'note'):
                        if k in b:
                            e[k] = str(b[k])[:400]
        elif a == 'fav':
            for e in L:
                if e['id'] == sid:
                    e['fav'] = not e.get('fav')
        elif a == 'delete':
            self.state['strategies'] = [e for e in L if e['id'] != sid]
            if self.state.get('strat') == sid:
                self.state['strat'] = None
        elif a == 'pick':  # Strategie für die nächste (oder laufende) Session
            self.state['strat'] = sid or None
            ss = self.state.get('session')
            if ss and ss.get('active') and ss.get('mode', 'farm') == 'farm':
                ss['strat'] = sid or None
        elif a == 'assign':  # frühere Session nachträglich zuordnen
            for h in self.state['sessions']:
                if abs((h.get('t0') or 0) - float(b.get('t0') or 0)) < 1:
                    h['strat'] = sid or None
        self.persist()
        self.bump()
        return {'ok': True}

    def namen(self, q):
        p = self.prices
        if not p:
            return []
        q = q.lower().strip()
        alle = list(p.simple.items()) + [(n, min(v for _, v in l)) for n, l in p.uniques.items()]
        hits = [(n, v) for n, v in alle if q in n.lower()]
        hits.sort(key=lambda x: (not x[0].lower().startswith(q), len(x[0])))
        return [{'n': n, 'c': round(v, 2)} for n, v in hits[:12]]

    def reset_session(self):
        self.state['session'] = None
        self.base = None
        self.persist()
        self.bump()


# ------------------------------------------------------------------ Testmodus

class FakePrices(stash.Prices):
    def __init__(self, league):
        super().__init__(league)
        self.simple = {'Chaos Orb': 1, 'Divine Orb': 182, 'Exalted Orb': 14, 'Orb of Alchemy': .3, 'Orb of Fusing': .4,
                       'Vaal Orb': .8, 'Gilded Ambush Scarab': 6, 'Polished Divination Scarab': 3.5, 'The Apothecary': 9800,
                       'Rain of Chaos': .2, 'Essence of Hysteria': 3, 'Mirror Shard': 3600, 'Awakened Sextant': 2}
        self.maps = {('Cemetery Map', 16): 4, ('Strand Map', 16): 6}
        rnd = random.Random(7)
        self.markt = {}
        for i, (n, c) in enumerate(self.simple.items()):
            sp, v = [], 0
            for _ in range(7):
                sp.append(round(v, 2)); v += rnd.uniform(-6, 6)
            self.markt[n] = {'c': c, 'vol': rnd.randint(50, 5000) * 180, 'sp': sp, 'ch': sp[-1], 'typ': ['Currency', 'Scarab', 'Fragment'][i % 3]}
        self.divine = 182
        self.t = time.time()


FAKE_TABS = [{'i': 0, 'id': 'a', 'n': 'Currency', 'type': 'CurrencyStash', 'color': 'rgb(200,160,60)', 'hidden': False, 'folder': False},
             {'i': 1, 'id': 'b', 'n': 'Dump 1', 'type': 'QuadStash', 'color': 'rgb(120,80,200)', 'hidden': False, 'folder': False},
             {'i': 2, 'id': 'c', 'n': 'Maps', 'type': 'PremiumStash', 'color': 'rgb(80,160,90)', 'hidden': False, 'folder': False}]


def _it(tl, q=1, ft=5, **kw):
    d = {'typeLine': tl, 'baseType': tl, 'stackSize': q, 'frameType': ft, 'icon': ''}
    d.update(kw)
    return d


def fake_items(t, farm):
    k = len(farm.state['session']['curve']) if farm.state.get('session') else 0
    if t['n'] == 'Currency':
        return [_it('Chaos Orb', 1400 + 90 * k), _it('Divine Orb', 31 + k // 2), _it('Exalted Orb', 22), _it('Orb of Alchemy', 400 - 20 * k), _it('Vaal Orb', 60)]
    if t['n'] == 'Dump 1':
        return [_it('Gilded Ambush Scarab', max(0, 40 - 4 * k)), _it('Polished Divination Scarab', 25 + k), _it('The Apothecary', 1 if k > 2 else 0, 6),
                _it('Rain of Chaos', 30 + 5 * k, 6), _it('Essence of Hysteria', 12), _it('Awakened Sextant', 4)]
    return [_it('Cemetery Map', max(0, 30 - 3 * k), 0, properties=[{'name': 'Map Tier', 'values': [['16', 0]]}]),
            _it('Strand Map', 8 + k, 0, properties=[{'name': 'Map Tier', 'values': [['16', 0]]}])]


def fake_inv(farm):
    return [_it('Chaos Orb', random.randint(5, 40)), _it('Mirror Shard', 1 if random.random() < .1 else 0)]
