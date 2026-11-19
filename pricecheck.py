# PoE Companion – Preis-Check über die offizielle Trade-Seite (pathofexile.com/trade)
# Uniques & Currency: poe.ninja. Rare Items: Trade-Suche mit den Mods des Items (Werte mit einstellbarer Abweichung).
import re, json, time, statistics, threading, urllib.request, urllib.parse, urllib.error

from app_info import USER_AGENT as _UA
UA = {'User-Agent': _UA, 'Content-Type': 'application/json', 'Accept': 'application/json'}
_stats = {}   # Spiel -> {'t', 'map'}
_rates = {'t': 0, 'league': '', 'r': {}, 'spiel': ''}
SPIEL = 'poe1'   # wird vom Companion je nach Profil gesetzt


def api(teil):
    """Trade-API für das aktive Spiel: PoE1 /api/trade/…, PoE2 /api/trade2/… (Realm poe2 im Pfad)."""
    if SPIEL == 'poe2':
        teil = teil.replace('search/', 'search/poe2/', 1) if teil.startswith('search/') else teil
        return 'https://www.pathofexile.com/api/trade2/' + teil
    return 'https://www.pathofexile.com/api/trade/' + teil


def web(league, sid='', q=None):
    """Link zur Trade-Seite im Browser."""
    lg = urllib.parse.quote(league)
    pfad = ('trade2/search/poe2/' if SPIEL == 'poe2' else 'trade/search/') + lg + ('/' + sid if sid else '')
    return 'https://www.pathofexile.com/' + pfad + ('?q=' + urllib.parse.quote(json.dumps(q, separators=(',', ':'))) if q is not None else '')


def einheit():
    """Grundwährung für Preise: PoE1 Chaos, PoE2 Exalted."""
    return ('exalted', 'Exalted') if SPIEL == 'poe2' else ('chaos', 'Chaos')
_lock = threading.Lock()
_next = [0.0]

KAT = {'Rings': 'accessory.ring', 'Amulets': 'accessory.amulet', 'Belts': 'accessory.belt', 'Helmets': 'armour.helmet',
       'Body Armours': 'armour.chest', 'Gloves': 'armour.gloves', 'Boots': 'armour.boots', 'Shields': 'armour.shield',
       'Quivers': 'armour.quiver', 'Jewels': 'jewel', 'Abyss Jewels': 'jewel.abyss', 'Wands': 'weapon.wand',
       'Daggers': 'weapon.dagger', 'Rune Daggers': 'weapon.runedagger', 'Claws': 'weapon.claw', 'Sceptres': 'weapon.sceptre',
       'Staves': 'weapon.staff', 'Warstaves': 'weapon.warstaff', 'Bows': 'weapon.bow', 'One Hand Swords': 'weapon.onesword',
       'Two Hand Swords': 'weapon.twosword', 'One Hand Axes': 'weapon.oneaxe', 'Two Hand Axes': 'weapon.twoaxe',
       'One Hand Maces': 'weapon.onemace', 'Two Hand Maces': 'weapon.twomace', 'Thrusting One Hand Swords': 'weapon.onesword',
       'Flasks': 'flask', 'Life Flasks': 'flask', 'Mana Flasks': 'flask', 'Utility Flasks': 'flask',
       # PoE2
       'Quarterstaves': 'weapon.warstaff', 'Crossbows': 'weapon.crossbow', 'Spears': 'weapon.spear', 'Flails': 'weapon.flail',
       'Foci': 'armour.focus', 'Bucklers': 'armour.buckler', 'Charms': 'flask.charm', 'Talismans': 'weapon.talisman'}
KAT2 = {'Life Flasks': 'flask.life', 'Mana Flasks': 'flask.mana', 'Flasks': 'flask', 'Waystones': 'map.waystone', 'Tablet': 'map.tablet',
        'Jewels': 'jewel', 'Relics': 'sanctum.relic'}
LOKAL = ('weapon', 'armour')


_hits = {}   # Regel -> Liste der Zeitpunkte unserer Anfragen


def _wait_needed(rules):
    """Wartet nur, wenn eine Limit-Regel wirklich voll wäre – sonst sofort weiter."""
    now = time.time(); d = 0.0
    for key, (hits, period) in rules.items():
        ts = [t for t in _hits.get(key, []) if now - t < period]
        _hits[key] = ts
        if len(ts) >= hits - 1:
            d = max(d, period - (now - ts[0]) + .2)
    return d


_rules = {}


def _req(url, body=None, timeout=20):
    kind = 'search' if '/search/' in url else 'fetch' if '/fetch/' in url else 'data'
    with _lock:
        d = max(_wait_needed(_rules.get(kind, {})), _next[0] - time.time())
        if d > 0:
            time.sleep(d)
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(body).encode() if body else None, headers=UA), timeout=timeout)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                _next[0] = time.time() + int(e.headers.get('Retry-After') or 10)
            raise
        rules = {}
        for h in ('X-Rate-Limit-Ip', 'X-Rate-Limit-Account'):
            for i, rule in enumerate((r.headers.get(h) or '').split(',')):
                p = rule.split(':')
                if len(p) >= 2 and p[0].isdigit() and p[1].isdigit():
                    rules['%s%d' % (h, i)] = (int(p[0]), int(p[1]))
        if rules:
            _rules[kind] = rules
        for k in rules:
            _hits.setdefault(k, []).append(time.time())
        return json.loads(r.read().decode('utf-8'))


def vorladen(league):
    """Stat-Liste und Kurse schon beim Start holen – dann ist der erste Preis-Check schnell."""
    def job():
        try:
            stats(); rates(league)
        except Exception:
            pass
    threading.Thread(target=job, daemon=True).start()


def norm(t):
    return re.sub(r'[+-]?\d+(?:\.\d+)?', '#', t.strip()).replace('+#', '#').lower()


def stats():
    c = _stats.setdefault(SPIEL, {'t': 0, 'map': {}})
    if c['map'] and time.time() - c['t'] < 86400:
        return c['map']
    j = _req(api('data/stats'))
    m = {}
    for grp in j.get('result', []):
        for e in grp.get('entries', []):
            typ = e.get('type')
            txt = e.get('text', '')
            lokal = txt.endswith('(Local)')
            k = (typ, norm(txt.replace(' (Local)', '')))
            m.setdefault(k, {})['local' if lokal else 'global'] = e['id']
    c.update(t=time.time(), map=m)
    return m


def rates(league):
    """Kurse in Chaos (für die Preise der Angebote)."""
    if _rates['r'] and _rates['league'] == league and _rates.get('spiel') == SPIEL and time.time() - _rates['t'] < 1800:
        return _rates['r']
    q = urllib.parse.urlencode({'league': league, 'type': 'Currency'})
    j = json.loads(urllib.request.urlopen(urllib.request.Request('https://poe.ninja/%s/api/economy/exchange/current/overview?' % SPIEL + q, headers=UA), timeout=25).read())
    core = j.get('core') or {}
    f = 1.0
    if core.get('primary') and core.get('primary') != 'chaos':
        f = float((core.get('rates') or {}).get('chaos') or 1)
    r = {'chaos': 1.0}
    if core.get('primary'):
        r[core['primary']] = f
    for x in j.get('lines', []):
        if isinstance(x.get('primaryValue'), (int, float)):
            r[x.get('id')] = x['primaryValue'] * f
    b = einheit()[0]
    if b != 'chaos' and r.get(b):
        # in der Grundwährung des Spiels ausdrücken (PoE2: Exalted)
        g = r[b]
        r = {k: v / g for k, v in r.items()}
        r[b] = 1.0
    r['divine'] = r.get('divine') or 0
    _rates.update(t=time.time(), league=league, r=r, spiel=SPIEL)
    return r


def zahlen(t):
    v = [float(x) for x in re.findall(r'\d+(?:\.\d+)?', t)]
    return sum(v) / len(v) if v else None


KOPF = re.compile(r'^\{ (Implicit|Prefix|Suffix|Unique|Foulborn Unique|Crafted|Searing Exarch Implicit|Eater of Worlds Implicit|Corrupted Implicit|Enchant)?[^}]*\}\s*$')


def mods_aus_text(raw):
    """Mods direkt aus dem kopierten Item-Text (Strg+Alt+C): echte Werte statt Wertebereiche."""
    out, art = [], None
    for z in (raw or '').replace('\r', '').split('\n'):
        z = z.strip()
        if not z or z == '--------':
            art = None if z == '--------' else art
            continue
        m = KOPF.match(z)
        if m:
            k = (m.group(1) or '').lower()
            art = 'impl' if 'implicit' in k else 'enchant' if k == 'enchant' else 'craft' if k == 'crafted' else 'expl'
            if 'Crafted' in z or 'Master Crafted' in z:
                art = 'craft'
            continue
        if art is None or z.startswith('('):
            continue
        t = re.sub(r'(\d+(?:\.\d+)?)\((?:\d+(?:\.\d+)?)-(?:\d+(?:\.\d+)?)\)', r'\1', z)  # 28(20-30) -> 28
        t = re.sub(r'\s*\((crafted|fractured|implicit|enchant|rune|desecrated|augmented)\)$', '', t)
        out.append({'k': 'frac' if z.endswith('(fractured)') else art, 't': t})
    return out


# Texte, die im Spiel anders heißen als auf der Trade-Seite
ALIAS = {'#% to item rarity': '#% increased rarity of items found', '#% to item quantity': '#% increased quantity of items found'}


def finde_stat(m, typ, t):
    n = norm(t)
    for kand in (n, ALIAS.get(n), n.replace('#% to ', '#% increased ')):
        if not kand:
            continue
        for ty in ((typ, 'explicit', 'pseudo') if typ == 'fractured' else (typ, 'pseudo') if typ == 'explicit' else (typ,)):
            hit = m.get((ty, kand))
            if hit:
                return hit
    # unscharf: gleiche Wörter
    w = set(re.findall(r'[a-z]+', n))
    best, bw = None, 0.0
    for (ty, k), hit in m.items():
        if ty != typ:
            continue
        w2 = set(re.findall(r'[a-z]+', k))
        if not w2:
            continue
        j = len(w & w2) / len(w | w2)
        if j > bw and k.count('#') == n.count('#'):
            best, bw = hit, j
    return best if bw >= 0.85 else None


def query(item, tol, sel=None, base=False):
    """Baut die Trade-Suche aus dem Ergebnis des Item-Checks. sel = nur diese Mods (Index), base = nur diese Basis."""
    klasse = (item.get('klasse') or '').strip()
    kat = (KAT2.get(klasse) if SPIEL == 'poe2' else None) or KAT.get(klasse)
    m = stats()
    filt, unbekannt, paar = [], [], []
    mods = item.get('pmods') or item.get('mods', [])
    if sel is not None:
        mods = [x for i, x in enumerate(mods) if i in sel]
    for mod in mods:
        typ = {'impl': 'implicit', 'expl': 'explicit', 'craft': 'crafted', 'frac': 'fractured'}.get(mod.get('k'), 'explicit')
        if mod.get('k') == 'enchant':
            typ = 'enchant'
        t = mod.get('t', '')
        hit = finde_stat(m, typ, t)
        if not hit:
            unbekannt.append(t)
            continue
        sid = hit.get('local') if (kat and kat.split('.')[0] in LOKAL and 'local' in hit) else hit.get('global') or hit.get('local')
        v = zahlen(t)
        f = {'id': sid}
        paar.append((t, sid))
        if v is not None and v > 0:
            f['value'] = {'min': round(v * (1 - tol), 1)}
        filt.append(f)
    # Ab 4 Mods reicht es, wenn alle bis auf einen passen – sonst findet sich meist nichts
    grp = {'type': 'count', 'filters': filt, 'value': {'min': len(filt) - 1}} if len(filt) >= 4 else {'type': 'and', 'filters': filt}
    q = {'query': {'status': {'option': 'online'}, 'stats': [grp], 'filters': {}}, 'sort': {'price': 'asc'}}
    if kat:
        q['query']['filters']['type_filters'] = {'filters': {'category': {'option': kat}}}
    if base and item.get('base'):
        q['query']['type'] = item.get('base')
    if sel is not None:
        q['query']['stats'] = [{'type': 'and', 'filters': filt}]
    if item.get('rarity') == 'UNIQUE':
        q['query']['name'] = item.get('name')
        q['query']['type'] = item.get('base')
        q['query']['stats'] = [{'type': 'and', 'filters': []}]
    if item.get('corrupted'):
        q['query']['filters']['misc_filters'] = {'filters': {'corrupted': {'option': 'true'}}}
    item['_paar'] = paar
    return q, unbekannt


MARKUP = re.compile(r'\[([^\]|]+)\|([^\]]+)\]|\[([^\]]+)\]')


def clean(t):
    return MARKUP.sub(lambda m: m.group(2) or m.group(3) or m.group(1), t)


LOG = lambda m: None
_gezeigt = [False]


def _text(t):
    """Mod-Text aus einem Angebot – die Trade-Seite liefert mal Text, mal Objekte."""
    if isinstance(t, str):
        return t
    if isinstance(t, dict):
        for k in ('text', 'name', 'description', 'mod', 'value'):
            if isinstance(t.get(k), str) and t[k].strip():
                return t[k]
        for v in t.values():
            if isinstance(v, str) and re.search(r'[A-Za-z]', v) and ' ' in v:
                return v
    return ''


def angebot(listing):
    """Name und Mods eines Angebots, aufbereitet für die Anzeige."""
    it = listing.get('item') or {}
    if not _gezeigt[0]:
        _gezeigt[0] = True
        try:
            LOG('Trade-Angebot Beispiel: keys=%s explicit=%s ext=%s' % (sorted(it.keys()), json.dumps((it.get('explicitMods') or [])[:2])[:300],
                                                                     json.dumps((it.get('extended') or {}).get('hashes'))[:300]))
        except Exception:
            pass
    mods = []
    for k, art in (('enchantMods', 'enchant'), ('implicitMods', 'impl'), ('fracturedMods', 'frac'), ('explicitMods', 'expl'), ('craftedMods', 'craft')):
        for t in it.get(k) or []:
            tier = ''
            if isinstance(t, dict):
                for mm in t.get('mods') or []:
                    if isinstance(mm, dict) and mm.get('tier'):
                        tier = str(mm['tier'])
                        break
            t = clean(_text(t))
            if t:
                mods.append({'t': t, 'k': art, 'tier': tier})
    hashes = set()
    for lst in ((it.get('extended') or {}).get('hashes') or {}).values():
        for h in lst or []:
            if isinstance(h, (list, tuple)) and h and isinstance(h[0], str):
                hashes.add(h[0])
            elif isinstance(h, str):
                hashes.add(h)
    name = ' '.join(x for x in (clean(_text(it.get('name') or '')), clean(_text(it.get('typeLine') or it.get('baseType') or ''))) if x).strip()
    return {'name': name, 'ilvl': it.get('ilvl'), 'mods': mods, 'hashes': hashes, 'corrupted': bool(it.get('corrupted'))}


def aehnlich(paar, a):
    """Wie nah ist ein Angebot an deinem Item? Mod für Mod: Wert des Angebots / dein Wert (max. 100 %).
    Erkennt Mods über den Text oder – falls der fehlt – über die Stat-Kennung der Trade-Seite."""
    theirs = {}
    for m in a['mods']:
        theirs.setdefault(norm(m['t']), zahlen(m['t']))
    rs, treffer = [], []
    for t, sid in paar:
        v = zahlen(t)
        n = norm(t)
        w = theirs.get(n, theirs.get(ALIAS.get(n, '\0'), 'x'))
        if w == 'x':
            if sid and sid in a['hashes']:
                rs.append(0.9)
                treffer.append(t)
            else:
                rs.append(0.0)
            continue
        treffer.append(t)
        # beidseitig: deutlich BESSERE Werte beim Angebot machen es genauso unähnlich wie schlechtere (bessere Rolls = teurer)
        # quadriert: 50 statt 90 ist nur noch ~31 % ähnlich – schwache Rolls landen nicht mehr beim Preis starker Items
        rs.append(1.0 if (not v or w is None) else max(0.0, min(w, v) / max(w, v)) ** 2 if w > 0 else 0.0)
    return (round(sum(rs) / len(rs) * 100) if rs else 100), treffer


def schaetzen(listings):
    """Ein Preis, der am ehesten zu deinem Item passt: ähnliche Angebote zählen stärker, Lockangebote fliegen raus."""
    L = [l for l in listings if l.get('chaos')]
    if not L:
        return None
    gut = [l for l in L if l['sim'] >= 60]
    if not gut:
        # nichts wirklich Vergleichbares: alles am Markt ist besser als dein Item → realistisch nur der Mindestpreis
        ch = sorted(l['chaos'] for l in L)
        return {'c': round(ch[0], 2), 'lo': round(ch[0], 2), 'hi': round(ch[min(2, len(ch) - 1)], 2), 'sicher': 'unsicher',
                'n': len(L), 'best': max(l['sim'] for l in L), 'kaumWert': True}
    gut.sort(key=lambda l: l['chaos'])
    if len(gut) >= 5:
        # nur echte Lockangebote raus (weniger als ein Drittel des Medians) – sonst ist der billigste Vergleich der Marktpreis
        med = statistics.median(l['chaos'] for l in gut)
        gut = [l for l in gut if l['chaos'] >= med / 3] or gut
    w = [(l['sim'] / 100.0) ** 4 or 0.0001 for l in gut]
    tot = sum(w)

    def quantil(q):
        acc = 0.0
        for l, x in zip(gut, w):
            acc += x
            if acc >= tot * q:
                return l['chaos']
        return gut[-1]['chaos']
    sehr = len([l for l in L if l['sim'] >= 80])
    sicher = 'gut' if sehr >= 3 else 'grob' if (sehr >= 1 or len(gut) >= 3) else 'unsicher'
    # Angebote, die deinem Item ähnlich sind, enthalten oft BESSERE Werte (Ähnlichkeit ist nach oben gedeckelt).
    # Darum zählt das untere Drittel: so viel bekommst du realistisch – Müll-Items landen beim Mindestpreis.
    return {'c': round(quantil(.25), 2), 'lo': round(gut[0]['chaos'], 2), 'hi': round(quantil(.6), 2), 'sicher': sicher,
            'n': len(gut), 'best': max(l['sim'] for l in L)}


STUFEN = [100, 90, 80, 70, 60, 50, 0]


def mod_auswahl(item):
    """Liste für die Auswahl „wonach suchen?“ – mit Info, ob die Trade-Seite den Mod kennt."""
    m = stats()
    out = []
    for i, mod in enumerate(item.get('pmods') or item.get('mods', [])):
        typ = {'impl': 'implicit', 'expl': 'explicit', 'craft': 'crafted', 'frac': 'fractured', 'enchant': 'enchant'}.get(mod.get('k'), 'explicit')
        out.append({'i': i, 't': mod.get('t', ''), 'k': mod.get('k'), 'ok': bool(finde_stat(m, typ, mod.get('t', '')))})
    return out


def check(item, league, tol=0.15, sel=None, base=False):
    """Eine breite Suche, dann jedes Angebot mit deinem Item vergleichen und nach Ähnlichkeit einsortieren.
    Mit sel/base: genau die ausgewählten Mods (und auf Wunsch nur diese Basis)."""
    if not item.get('mods') and not item.get('pmods') and item.get('rarity') != 'UNIQUE':
        return {'error': 'Keine Mods zum Suchen gefunden.'}
    t0 = time.time()
    q, unbekannt = query(item, tol if sel is not None else 0.5, sel, base)  # ohne Auswahl breit suchen: bis 50 % der Werte
    filt = q['query']['stats'][0]['filters']
    if len(filt) >= 3 and sel is None:
        q['query']['stats'] = [{'type': 'count', 'filters': filt, 'value': {'min': max(1, len(filt) - 2)}}]
    lg = urllib.parse.quote(league)
    s = _req(api('search/' + lg), q)
    ids, total, sid = s.get('result', [])[:30], s.get('total', 0), s.get('id')
    out = {'total': total, 'url': web(league, sid) if sid else '', 'einheit': einheit()[1], 'basis': einheit()[0],
           'skipped': unbekannt, 'mods': len(filt), 'tiers': [], 'prices': [], 'auswahl': mod_auswahl(item),
           'sel': sel, 'base': bool(base), 'baseName': item.get('base', '')}
    if not ids:
        item.pop('_paar', None)
        out['ms'] = int((time.time() - t0) * 1000)
        return out
    r = rates(league)
    paar = item.get('_paar') or []
    item.pop('_paar', None)
    meine = {norm(t) for t, _ in paar}
    meine |= {ALIAS[x] for x in list(meine) if x in ALIAS}
    listings = []
    # bis zu 3 Abrufe à 10 Angebote, parallel zu den Limits
    for i in range(0, len(ids), 10):
        f = _req(api('fetch/%s?query=%s' % (','.join(ids[i:i + 10]), sid)))
        for x in f.get('result', []):
            p = ((x or {}).get('listing') or {}).get('price') or {}
            amt, cur = p.get('amount'), p.get('currency')
            if amt is None or cur not in r:
                continue
            a = angebot(x)
            sim, treffer = aehnlich(paar, a)
            # Angebote mit vielen zusätzlichen Mods sind mehr wert als dein Item – weniger ähnlich werten
            extra = len([m for m in a['mods'] if m['k'] in ('expl', 'frac', 'craft') and norm(m['t']) not in meine])
            sim = max(0, sim - 12 * extra)
            lst = (x or {}).get('listing') or {}
            listings.append({'amount': amt, 'currency': cur, 'chaos': round(amt * r[cur], 2), 'sim': sim, 'name': a['name'], 'ilvl': a['ilvl'],
                             'zeit': lst.get('indexed') or '', 'konto': ((lst.get('account') or {}).get('name') or '')[:24],
                             'mods': [dict(m, my=norm(m['t']) in meine) for m in a['mods']][:12],
                             'hit': len(treffer), 'of': len(paar)})
    for st in STUFEN:
        hi = 101 if st == 100 else 50 if st == 0 else st + 10
        grp = sorted((l for l in listings if st <= l['sim'] < hi or (st == 100 and l['sim'] >= 95)), key=lambda l: l['chaos'])
        if st == 90:
            grp = [l for l in grp if l['sim'] < 95]
        if grp:
            ch = [l['chaos'] for l in grp]
            out['tiers'].append({'sim': st, 'n': len(grp), 'min': ch[0], 'median': statistics.median(ch[:5]), 'offers': grp[:6]})
    out['prices'] = sorted(listings, key=lambda l: l['chaos'])
    out['schaetzung'] = schaetzen(listings)
    expl = [m for m in (item.get('pmods') or item.get('mods') or []) if m.get('k') in ('expl', 'frac', 'craft', None)]
    if listings and not expl and item.get('rarity') != 'UNIQUE':
        # Item ohne eigene Mods: wert ist nur die Basis – der Mindestpreis am Markt
        ch = sorted(l['chaos'] for l in listings)
        out['schaetzung'] = {'c': round(ch[0], 2), 'lo': round(ch[0], 2), 'hi': round(ch[min(len(ch) - 1, 4)], 2),
                             'sicher': 'grob', 'n': len(ch), 'best': 0, 'nurBasis': True}
    out['divine'] = r.get('divine') or 0
    out['ms'] = int((time.time() - t0) * 1000)
    return out


_uniq_cache = {}


def unique_preis(name, base, league):
    """Günstigster realistischer Preis eines Uniques am Markt (Median der 5 billigsten Online-Angebote), in der Grundwährung.
    Ergebnis 1 Stunde im Speicher – so bleibt es bei wenigen Abfragen."""
    k = (SPIEL, league, name)
    c = _uniq_cache.get(k)
    if c and time.time() - c[0] < 3600:
        return c[1]
    q = {'query': {'status': {'option': 'online'}, 'name': name}, 'sort': {'price': 'asc'}}
    if base:
        q['query']['type'] = base
    s = _req(api('search/' + urllib.parse.quote(league)), q)
    ids, sid = s.get('result', [])[:10], s.get('id')
    preis = None
    if ids:
        r = rates(league)
        f = _req(api('fetch/%s?query=%s' % (','.join(ids), sid)))
        werte = sorted(p['amount'] * r[p['currency']] for p in (((x or {}).get('listing') or {}).get('price') or {} for x in f.get('result', []))
                       if p.get('amount') is not None and p.get('currency') in r)
        if werte:
            werte = [w for w in werte if w >= statistics.median(werte[:5]) / 3] or werte   # Lockangebote raus
            preis = round(statistics.median(werte[:5]), 1)
    _uniq_cache[k] = (time.time(), preis)
    return preis
