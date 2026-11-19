# PoE Companion – Stash-Wert & Farming-Session
# Preise: poe.ninja · Stash/Inventar: pathofexile.com (mit der POESESSID, die der Nutzer selbst einträgt)
import json, os, re, time, threading, urllib.request, urllib.parse, urllib.error, glob

from app_info import USER_AGENT as UA
from pfad import BASE
DATA = os.path.join(BASE, 'data')

EXCHANGE_TYPES = ['Currency', 'Fragment', 'DivinationCard', 'Scarab', 'Essence', 'Fossil', 'Resonator', 'Oil', 'DeliriumOrb',
                  'Artifact', 'Tattoo', 'Omen', 'Runegraft', 'AllflameEmber', 'DjinnCoin', 'Ducat', 'EnshroudingCrystal',
                  'Astrolabe', 'Thread']
EXCHANGE_TYPES_POE2 = ['Currency', 'Fragments', 'Abyss', 'UncutGems', 'LineageSupportGems', 'Essences', 'SoulCores',
                       'Idols', 'Runes', 'Ritual', 'Expedition', 'Delirium', 'Breach']
CURRENCY_TYPES = ['Currency', 'Fragment']
ITEM_TYPES = ['UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueFlask', 'UniqueJewel', 'UniqueRelic', 'UniqueTincture',
              'ForbiddenJewel', 'ShrineBelt', 'SkillGem', 'ImbuedGem', 'ClusterJewel', 'Map', 'BlightedMap', 'BlightRavagedMap',
              'UniqueMap', 'Invitation', 'Memory', 'IncursionTemple', 'ScryingOrb', 'Incubator', 'Vial',
              'Beast', 'Wombgift', 'Corpse', 'Viscera']


def log(msg):
    try:
        with open(os.path.join(DATA, 'app.log'), 'a', encoding='utf-8') as f:
            f.write(time.strftime('%Y-%m-%d %H:%M:%S ') + 'stash: ' + str(msg) + '\n')
    except Exception:
        pass


def http_json(url, cookie=None, timeout=30):
    h = {'User-Agent': UA, 'Accept': 'application/json'}
    if cookie:
        h['Cookie'] = 'POESESSID=' + cookie
    r = urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout)
    return json.loads(r.read().decode('utf-8')), r.headers


# ------------------------------------------------------------------ Preise

def spark(x):
    """7-Tage-Kursverlauf von poe.ninja (Prozent gegenüber dem ersten Tag). Feldnamen unterscheiden sich je nach Endpunkt."""
    for k in ('sparkline', 'sparkLine', 'receiveSparkLine', 'lowConfidenceSparkline', 'lowConfidenceReceiveSparkLine'):
        sp = x.get(k)
        if isinstance(sp, dict) and isinstance(sp.get('data'), list) and any(isinstance(d, (int, float)) for d in sp['data']):
            data = [round(float(d), 2) if isinstance(d, (int, float)) else None for d in sp['data']]
            ch = sp.get('totalChange')
            return data, round(float(ch), 2) if isinstance(ch, (int, float)) else None
    return None, None


class Prices:
    """Preisliste einer Liga. Schlüssel → Chaos-Wert."""

    def __init__(self, league, game='poe1'):
        self.league = league
        self.game = game
        self.t = 0
        self.simple = {}     # name -> chaos  (Currency, Karten, Essenzen, …)
        self.icons = {}
        self.uniques = {}    # name -> [(links, chaos)]
        self.gems = {}       # name -> [(level, quality, corrupted, chaos)]
        self.maps = {}       # (name, tier) -> chaos
        self.divine = 0
        self.fehler = []
        self.map_default = 0.0   # eigener Preis für Maps, die poe.ninja nicht führt
        self.markt = {}      # name -> {'c': chaos, 'vol': Handelsvolumen, 'sp': 7-Tage-Verlauf in %, 'ch': Änderung %, 'typ': Kategorie}
        self.einheit = 'Chaos'  # PoE 2: Exalted

    def _get(self, kind, typ):
        """poe.ninja hat die Kategorien auf zwei Endpunkte verteilt – beide probieren."""
        q = urllib.parse.urlencode({'league': self.league, 'type': typ})
        other = 'currency' if kind == 'item' else 'item'
        last = None
        for k in (kind,):
            try:
                j, _ = http_json('https://poe.ninja/poe1/api/economy/stash/current/%s/overview?%s' % (k, q))
                if isinstance(j, dict) and j.get('lines'):
                    return j
            except Exception as e:
                last = e
        self.fehler.append('%s: %s' % (typ, last or 'leer'))
        return {}

    @staticmethod
    def _val(x):
        for k in ('chaosEquivalent', 'chaosValue', 'primaryValue', 'value'):
            v = x.get(k)
            if isinstance(v, (int, float)):
                return float(v)
        r = x.get('receive') or {}
        if isinstance(r.get('value'), (int, float)):
            return float(r['value'])
        return 0.0

    def load(self, status=lambda t: None):
        self.fehler = []
        self.counts = {}
        g = 'poe2' if self.game == 'poe2' else 'poe1'
        ex_types = EXCHANGE_TYPES_POE2 if g == 'poe2' else EXCHANGE_TYPES
        for i, typ in enumerate(ex_types):
            status('Lade Preise: %s (%d/%d)' % (typ, i + 1, len(ex_types)))
            q = urllib.parse.urlencode({'league': self.league, 'type': typ})
            try:
                j, _ = http_json('https://poe.ninja/%s/api/economy/exchange/current/overview?' % g + q)
            except Exception as e:
                self.fehler.append('%s: %s' % (typ, e))
                continue
            core = j.get('core') or {}
            rates = core.get('rates') or {}
            faktor = 1.0
            if core.get('primary') and core.get('primary') != 'chaos':
                faktor = float(rates.get('chaos') or 0) or 1.0
            names = {x.get('id'): x for x in (j.get('items') or core.get('items') or [])}
            if core.get('primary') == 'divine':
                self.simple['Divine Orb'] = faktor
            self.counts[typ] = len(j.get('lines', []))
            for x in j.get('lines', []):
                meta = names.get(x.get('id')) or {}
                n = meta.get('name')
                v = x.get('primaryValue')
                if not n or not isinstance(v, (int, float)):
                    continue
                self.simple[n] = float(v) * faktor
                try:
                    sp, ch = spark(x)
                    vol = x.get('volumePrimaryValue')
                    self.markt[n] = {'c': round(float(v) * faktor, 4), 'vol': round(float(vol) * faktor) if isinstance(vol, (int, float)) else 0,
                                     'sp': sp, 'ch': ch, 'typ': typ}
                except Exception:
                    pass
                if meta.get('image'):
                    self.icons[n] = 'https://web.poecdn.com' + meta['image'] if meta['image'].startswith('/') else meta['image']
        for i, typ in enumerate(CURRENCY_TYPES if g == 'poe1' else []):
            status('Lade Preise: %s' % typ)
            j = self._get('currency', typ)
            self.counts[typ] = len(j.get('lines', []))
            det = {d.get('name'): d.get('icon') for d in j.get('currencyDetails', []) or j.get('items', []) if isinstance(d, dict)}
            for x in j.get('lines', []):
                n = x.get('currencyTypeName') or x.get('name') or x.get('id')
                if n and n not in self.simple:
                    self.simple[n] = self._val(x)
                    sp, ch = spark(x)
                    if sp and n not in self.markt:
                        self.markt[n] = {'c': round(self._val(x), 4), 'vol': 0, 'sp': sp, 'ch': ch, 'typ': typ}
                    if det.get(n):
                        self.icons[n] = det[n]
        for i, typ in enumerate(ITEM_TYPES if g == 'poe1' else []):
            status('Lade Preise: %s (%d/%d)' % (typ, i + 1, len(ITEM_TYPES)))
            j = self._get('item', typ)
            det = {d.get('name'): d.get('icon') for d in j.get('currencyDetails', []) if isinstance(d, dict)}
            self.counts[typ] = len(j.get('lines', []))
            for x in j.get('lines', []):
                if x.get('currencyTypeName'):
                    n = x['currencyTypeName']
                    self.simple.setdefault(n, self._val(x))
                    if det.get(n):
                        self.icons[n] = det[n]
                    continue
                n, v = x.get('name'), self._val(x)
                if not n:
                    continue
                if x.get('icon'):
                    self.icons.setdefault(n, x['icon'])
                if typ.startswith('Unique') and typ != 'UniqueMap':
                    if x.get('variant') and 'Relic' in str(x.get('variant')):
                        continue
                    self.uniques.setdefault(n, []).append((int(x.get('links') or 0), v))
                elif typ == 'SkillGem':
                    self.gems.setdefault(n, []).append((int(x.get('gemLevel') or 1), int(x.get('gemQuality') or 0), bool(x.get('corrupted')), v))
                elif typ in ('Map', 'BlightedMap', 'BlightRavagedMap', 'UniqueMap'):
                    self.maps[(n, int(x.get('mapTier') or 0))] = v
                    self.simple.setdefault(n, v)
                else:
                    self.simple.setdefault(n, v)
        if self.game != 'poe2' or 'Chaos Orb' not in self.simple:
            self.simple['Chaos Orb'] = 1.0
        self.einheit = 'Chaos'
        ex = self.simple.get('Exalted Orb') if self.game == 'poe2' else None
        if ex:
            # PoE 2 rechnet in Exalted: alle Preise auf Exalted umstellen
            f = 1.0 / ex
            self.simple = {k: v * f for k, v in self.simple.items()}
            self.simple['Exalted Orb'] = 1.0
            for k, m in self.markt.items():
                m['c'] = round(m['c'] * f, 4)
                m['vol'] = round(m['vol'] * f) if m.get('vol') else 0
            self.uniques = {k: [tuple(list(x[:-1]) + [x[-1] * f]) for x in v] for k, v in self.uniques.items()}
            self.gems = {k: [tuple(list(x[:-1]) + [x[-1] * f]) for x in v] for k, v in self.gems.items()}
            self.maps = {k: v * f for k, v in self.maps.items()}
            self.einheit = 'Exalted'
        self.divine = self.simple.get('Divine Orb') or 0
        self.t = time.time()
        log('Preise %s: %d einfach, %d Uniques, %d Gems, %d Maps, Divine=%.1f, Typen=%s, Fehler=%s' % (
            self.league, len(self.simple), len(self.uniques), len(self.gems), len(self.maps), self.divine, self.counts, self.fehler))
        if self.game == 'poe2' and not getattr(Prices, '_namen_geloggt', False):
            Prices._namen_geloggt = True
            log('Crafting-Namen: ' + ' | '.join('%s=%.2f' % (k, v) for k, v in sorted(self.simple.items())
                                              if re.search(r'Orb|Omen|Alloy|Flux|Rune|Hunt|Gloom|Carnage|Might|Tending|Sidereus|Creativity|Triumph|Aldur|Essence|Bone|Rib|Jawbone|Fractur|Lock', k)))
        return self

    # --- Preis eines Items aus der PoE-API
    def price(self, it):
        ft = it.get('frameType')
        name = it.get('name') or ''
        tl = it.get('typeLine') or ''
        base = it.get('baseType') or tl
        props = {p.get('name'): (p.get('values') or [[None]])[0][0] for p in it.get('properties', []) if p.get('values')}
        if ft == 3 or (ft == 9 and name):  # Unique / Relic
            lst = self.uniques.get(name)
            if not lst:
                return 0.0
            links = 0
            if it.get('sockets'):
                grp = {}
                for s in it['sockets']:
                    grp[s.get('group')] = grp.get(s.get('group'), 0) + 1
                links = max(grp.values())
            want = links if links >= 5 else 0
            cand = [v for l, v in lst if l == want] or [v for l, v in lst if l == 0] or [v for _, v in lst]
            return min(cand)
        if ft == 4:  # Gem
            lst = self.gems.get(tl) or self.gems.get(base)
            if not lst:
                return 0.0
            lvl = int(re.sub(r'\D', '', str(props.get('Level') or '1')) or 1)
            q = int(re.sub(r'\D', '', str(props.get('Quality') or '0')) or 0)
            cor = bool(it.get('corrupted'))
            best = None
            for gl, gq, gc, v in lst:
                if gc != cor or gl > lvl or gq > q:
                    continue
                score = (gl, gq)
                if best is None or score > best[0]:
                    best = (score, v)
            if best:
                return best[1]
            return min(v for *_, v in lst) if lvl >= 20 else 0.0
        if 'Map Tier' in props or (ft in (0, 1, 2) and tl.endswith(' Map')):
            if ft == 2:  # rare Maps kosten in etwa so viel wie normale
                pass
            tier = int(re.sub(r'\D', '', str(props.get('Map Tier') or '0')) or 0)
            v = self.maps.get((base, tier))
            if v is None:
                v = self.maps.get((base, 0))
            if v is None and base != 'Map':
                v = self.simple.get(base)
            if v is None or (ft in (0, 1, 2) and self.divine and v > self.divine * 3):
                # normale/magische/rare Maps sind nie mehrere Divine wert – dann eigener Map-Preis
                v = self.map_default
            return v
        for k in (tl, base, name):
            if k and k in self.simple:
                return self.simple[k]
        return 0.0


def item_key(it):
    ft = it.get('frameType')
    if ft == 3:
        return 'U:' + (it.get('name') or '') + '|' + (it.get('baseType') or '')
    if ft == 4:
        props = {p.get('name'): (p.get('values') or [[None]])[0][0] for p in it.get('properties', []) if p.get('values')}
        return 'G:%s|%s|%s' % (it.get('typeLine'), props.get('Level'), props.get('Quality'))
    props = {p.get('name'): (p.get('values') or [[None]])[0][0] for p in it.get('properties', []) if p.get('values')}
    if 'Map Tier' in props:
        return 'M:%s|%s' % (it.get('baseType') or it.get('typeLine'), props.get('Map Tier'))
    return 'S:' + (it.get('typeLine') or it.get('baseType') or '?')


def display_name(it):
    if it.get('frameType') == 3 and it.get('name'):
        return it['name']
    tl = it.get('typeLine') or it.get('baseType') or '?'
    props = {p.get('name'): (p.get('values') or [[None]])[0][0] for p in it.get('properties', []) if p.get('values')}
    if 'Map Tier' in props:
        return '%s (T%s)' % (it.get('baseType') or tl, re.sub(r'\D', '', str(props['Map Tier'])))
    if it.get('frameType') == 4 and props.get('Level'):
        return '%s %s' % (tl, re.sub(r'[^\d/]', '', str(props['Level'])) )
    return tl


# ------------------------------------------------------------------ pathofexile.com

class Limiter:
    """Hält sich an die Request-Limits von GGG (liest die X-Rate-Limit-Header)."""

    def __init__(self):
        self.next = 0
        self.gap = 1.6

    def wait(self):
        d = self.next - time.time()
        if d > 0:
            time.sleep(d)

    def update(self, headers):
        gap = 1.6
        for h in ('X-Rate-Limit-Account', 'X-Rate-Limit-Ip'):
            for rule in (headers.get(h) or '').split(','):
                p = rule.split(':')
                if len(p) >= 2 and p[0].isdigit() and p[1].isdigit() and int(p[0]):
                    gap = max(gap, int(p[1]) / int(p[0]) * 1.15)
        self.gap = gap
        self.next = time.time() + gap


LIM = Limiter()


class GGGError(Exception):
    pass


def ggg(path, params, sessid):
    url = 'https://www.pathofexile.com/character-window/' + path + '?' + urllib.parse.urlencode(params)
    for versuch in range(4):
        LIM.wait()
        try:
            j, h = http_json(url, sessid)
            LIM.update(h)
            if isinstance(j, dict) and j.get('error'):
                raise GGGError(j['error'].get('message') or str(j['error']))
            return j
        except urllib.error.HTTPError as e:
            if e.code == 429:
                ra = int(e.headers.get('Retry-After') or 60)
                log('Rate-Limit, warte %ds' % ra)
                LIM.next = time.time() + ra + 1
                continue
            if e.code in (401, 403):
                raise GGGError('POESESSID ungültig oder abgelaufen – bitte in den Einstellungen neu eintragen.')
            if e.code == 404:
                raise GGGError('Account oder Liga nicht gefunden.')
            raise GGGError('pathofexile.com antwortet mit Fehler %d' % e.code)
    raise GGGError('pathofexile.com ist gerade überlastet – später nochmal versuchen.')


def list_tabs(account, league, realm, sessid):
    j = ggg('get-stash-items', {'accountName': account, 'realm': realm, 'league': league, 'tabs': 1, 'tabIndex': 0}, sessid)
    tabs = []
    for t in j.get('tabs', []):
        c = t.get('colour') or {}
        tabs.append({'i': t.get('i'), 'id': t.get('id'), 'n': t.get('n'), 'type': t.get('type'),
                     'color': 'rgb(%d,%d,%d)' % (c.get('r', 120), c.get('g', 100), c.get('b', 60)),
                     'hidden': bool(t.get('hidden')), 'folder': t.get('type') == 'Folder'})
    return tabs


def tab_items(account, league, realm, sessid, idx):
    j = ggg('get-stash-items', {'accountName': account, 'realm': realm, 'league': league, 'tabs': 0, 'tabIndex': idx}, sessid)
    return j.get('items', [])


def char_items(account, char, realm, sessid):
    j = ggg('get-items', {'accountName': account, 'character': char, 'realm': realm}, sessid)
    return [it for it in j.get('items', []) if it.get('inventoryId') in ('MainInventory', 'ExpandedMainInventory')]


# ------------------------------------------------------------------ Snapshot

def aggregate(items_by_tab, prices):
    """→ {'items': {key: {n, q, c, icon}}, 'tabs': {name: chaos}, 'total': chaos}"""
    agg, tabs, total = {}, {}, 0.0
    for tab, items in items_by_tab.items():
        tv = 0.0
        for it in items:
            q = it.get('stackSize') or 1
            c = prices.price(it)
            k = item_key(it)
            a = agg.get(k)
            if not a:
                a = agg[k] = {'n': display_name(it), 'q': 0, 'c': c, 'icon': it.get('icon', ''), 'f': it.get('frameType', 0), 'tabs': {}}
            a['q'] += q
            a.setdefault('tabs', {})[tab] = a['tabs'].get(tab, 0) + q
            tv += c * q
        tabs[tab] = round(tv, 1)
        total += tv
    return {'items': agg, 'tabs': tabs, 'total': round(total, 1)}


def reprice(snap, prices_map):
    """Wert eines alten Snapshots mit aktuellen Einzelpreisen (damit Marktschwankungen kein Gewinn sind)."""
    return sum(v['q'] * prices_map.get(k, v['c']) for k, v in snap['items'].items())


# ------------------------------------------------------------------ Client.txt (Maps zählen)

TOWNS = {"Lioneye's Watch", 'The Forest Encampment', 'The Sarn Encampment', 'Highgate', "Overseer's Tower",
         'The Bridge Encampment', 'Oriath Docks', 'Oriath', 'Karui Shores', 'Kingsmarch', 'The Rogue Harbour',
         "The Menagerie", "Monastery of the Keepers", "Azurite Mine", "Aspirants' Plaza", "The Templar Laboratory",
         # PoE2
         'Clearfell Encampment', 'The Ardura Caravan', 'Ziggurat Encampment', 'The Ziggurat Refuge', 'Ziggurat Refuge',
         'Sanctum of Kalguur', 'The Clearfell Encampment'}


def find_client_log(custom='', game='poe1'):
    """Sucht das Spiel-Log. Gibt es mehrere (alte Installation, Steam-Bibliothek auf D:),
    gewinnt das zuletzt geschriebene."""
    if custom and os.path.isfile(custom):
        return custom
    name = 'Path of Exile 2' if game == 'poe2' else 'Path of Exile'
    rel = [r'\Program Files (x86)\Grinding Gear Games\%s\logs\Client.txt',
           r'\Program Files\Grinding Gear Games\%s\logs\Client.txt',
           r'\Program Files (x86)\Steam\steamapps\common\%s\logs\Client.txt',
           r'\Program Files\Steam\steamapps\common\%s\logs\Client.txt',
           r'\SteamLibrary\steamapps\common\%s\logs\Client.txt',
           r'\Steam\steamapps\common\%s\logs\Client.txt',
           r'\Games\%s\logs\Client.txt', r'\%s\logs\Client.txt',
           r'\Epic Games\PathOfExile\logs\Client.txt', r'\Epic Games\PathOfExile2\logs\Client.txt',
           r'\Daum Games\%s\logs\Client.txt']
    found = []
    for drive in 'CDEFGH':
        for r in rel:
            c = drive + ':' + (r % name if '%s' in r else r)
            if (game == 'poe2') != ('Path of Exile 2' in c or 'PathOfExile2' in c):
                continue
            try:
                if os.path.isfile(c):
                    found.append((os.path.getmtime(c), c))
            except OSError:
                pass
    doc = os.path.join(os.path.expanduser('~'), 'Documents', 'My Games', name, 'logs', 'Client.txt')
    if os.path.isfile(doc):
        found.append((os.path.getmtime(doc), doc))
    return max(found)[1] if found else ''


ENTER = re.compile(r'^(\d{4}/\d\d/\d\d \d\d:\d\d:\d\d).*?(?:\] : You have entered (.+?)\.|\[SCENE\] Set Source \[(.+?)\])\s*$')


class MapCounter:
    def __init__(self, path):
        self.path = path
        self.pos = os.path.getsize(path) if path and os.path.isfile(path) else 0
        self.maps = []          # [{'n': name, 't0': ts, 't1': ts}]
        self.cur = None
        self.last_zone = ''

    def poll(self):
        if not self.path or not os.path.isfile(self.path):
            return
        size = os.path.getsize(self.path)
        if size < self.pos:
            self.pos = 0
        if size == self.pos:
            return
        with open(self.path, 'rb') as f:
            f.seek(self.pos)
            data = f.read(size - self.pos)
        self.pos = size
        for line in data.decode('utf-8', 'replace').splitlines():
            if self.cur is not None and ' has been slain.' in line and '] : ' in line:
                self.cur['d'] = self.cur.get('d', 0) + 1
                continue
            m = ENTER.match(line)
            if not m:
                continue
            ts = time.mktime(time.strptime(m.group(1), '%Y/%m/%d %H:%M:%S'))
            zone = (m.group(2) or m.group(3) or '').strip()
            if not zone or zone == '(null)' or zone == self.last_zone and self.cur is not None:
                continue
            town = zone in TOWNS or 'Hideout' in zone or zone.endswith('Encampment')
            if self.cur:
                self.cur['t1'] = ts
            if town:
                self.cur = None
                self.last_zone = zone
                continue
            prev = self.maps[-1] if self.maps else None
            if prev and prev['n'] == zone and ts - prev['t1'] < 900:
                self.cur = prev  # zurück durchs Portal in dieselbe Map
            else:
                self.cur = {'n': zone, 't0': ts, 't1': ts}
                self.maps.append(self.cur)
            self.last_zone = zone

    def summary(self):
        cur = self.cur
        return {'cur': {'n': cur['n'], 't0': cur['t0'], 'd': cur.get('d', 0)} if cur else None,
                'deaths': sum(m.get('d', 0) for m in self.maps),
                'count': len(self.maps), 'last': self.maps[-1]['n'] if self.maps else '',
                'zone': self.last_zone, 'avg': round(sum(m['t1'] - m['t0'] for m in self.maps) / len(self.maps)) if self.maps else 0}


# ------------------------------------------------------------------ PoE2: Items per Strg+C erfassen
RAR_FT = {'Normal': 0, 'Magic': 1, 'Rare': 2, 'Unique': 3, 'Gem': 4, 'Currency': 5, 'Divination Card': 6, 'Quest': 8}


def parse_clip(text):
    """Item-Text aus der Zwischenablage → Item im Format der GGG-Stash-Daten (für Preis und Zählung)."""
    teile = [[z.strip() for z in t.strip().splitlines() if z.strip()] for t in re.split(r'\n-{4,}\n', text.replace('\r', ''))]
    if not teile or not teile[0]:
        return None
    kopf = teile[0]
    rar = next((z.split(':', 1)[1].strip() for z in kopf if z.startswith('Rarity:')), '')
    klasse = next((z.split(':', 1)[1].strip() for z in kopf if z.startswith('Item Class:')), '')
    namen = [z for z in kopf if not z.startswith(('Rarity:', 'Item Class:'))]
    if not namen:
        return None
    ft = RAR_FT.get(rar, 0)
    if 'Gem' in klasse and ft == 0:
        ft = 4
    it = {'frameType': ft, 'icon': '', 'properties': []}
    if ft in (2, 3) and len(namen) >= 2:
        it['name'], it['typeLine'], it['baseType'] = namen[0], namen[1], namen[1]
    else:
        it['name'], it['typeLine'], it['baseType'] = '', namen[0], namen[0]
    rest = '\n'.join('\n'.join(t) for t in teile[1:])
    m = re.search(r'^Stack Size:\s*([\d,.\s]+)', rest, re.M)
    it['stackSize'] = int(re.sub(r'\D', '', m.group(1).split('/')[0]) or 1) if m else 1
    for p in ('Level', 'Quality', 'Map Tier', 'Waystone Tier'):
        mm = re.search(r'^%s:\s*([^\n]+)' % p, rest, re.M)
        if mm:
            it['properties'].append({'name': 'Map Tier' if p == 'Waystone Tier' else p, 'values': [[mm.group(1).replace(' (augmented)', '').strip(), 0]]})
    it['corrupted'] = bool(re.search(r'^Corrupted$', rest, re.M))
    if ft in (1, 2) or (ft == 3 and klasse and 'Currency' not in klasse):
        it['_text'] = text[:4000]   # für den Marktcheck (Rares, Juwelen, Uniques ohne poe.ninja-Preis)
    return it
