"""PoE Companion – Crafting-Berater für Path of Exile 2.

Rechnet mit den Mod-Gewichten pro Stufe (Daten: POE2_HTC, AGPL-3.0, Werte von poe2db; Runen-Mods: RePoE) aus, wie
wahrscheinlich ein gewünschter Mod mit welcher Methode kommt, und simuliert anfängerfreundliche Pläne (Runen, Essenzen,
Greater/Perfect-Währung, Exalted mit Omen, Annulment, Chaos mit Erasure-Omen, Perfect Essenz, Abyss-Knochen) tausendfach,
um Erfolgschance, Verbrauch und Kosten zu schätzen.
"""
import bisect, collections, json, math, os, random, re, statistics

from pfad import BASE
_D = {}

# Mindest-Modlevel der stärkeren Währungen (Stand 0.5): Exalted/Regal/Chaos 35/50, Transmutation/Augmentation 44/70
STUFE = {'normal': 0, 'greater': 35, 'perfect': 50}
STUFE_TRANS = {'normal': 0, 'greater': 44, 'perfect': 70}
NAMEN = {'normal': '', 'greater': 'Greater ', 'perfect': 'Perfect '}
KNOCHEN = {'Body_Armours': 'Rib', 'Helmets': 'Rib', 'Gloves': 'Rib', 'Boots': 'Rib', 'Shields': 'Rib', 'Bucklers': 'Rib', 'Foci': 'Rib',
           'Rings': 'Collarbone', 'Amulets': 'Collarbone', 'Quivers': 'Jawbone', 'Jewels': 'Cranium'}
WAFFEN = {'Bows', 'Crossbows', 'OneHand_Maces', 'TwoHand_Maces', 'Quarterstaves', 'Spears', 'Staves', 'Wands', 'Sceptres'}
ELEMENTE = ('Fire', 'Cold', 'Lightning')


def daten():
    if not _D:
        d = json.load(open(os.path.join(BASE, 'ui', 'data', 'craft_poe2.json'), encoding='utf-8'))
        gesehen, basen = set(), []
        for b in d['basen']:
            if b['n'] not in gesehen:
                gesehen.add(b['n'])
                basen.append(b)
        d['basen'] = basen
        d['basis'] = {b['n'].lower(): b for b in basen}
        d.setdefault('runen', {})
        _D.update(d)
    return _D


def name(stufe, orb):
    """Währungsname je Stufe: name('perfect', 'Orb of Transmutation') → 'Perfect Orb of Transmutation'."""
    return NAMEN.get(stufe, '') + orb


def text(mod, tier):
    """Mod-Text mit dem Höchstwert der Stufe, z. B. „+# to maximum Life“ → „+89 to maximum Life“."""
    werte = [r[1] for r in tier[3]]
    t, i = mod['x'], 0
    while '#' in t and i < len(werte):
        v = werte[i]
        t = t.replace('#', str(int(v)) if float(v).is_integer() else str(v), 1)
        i += 1
    return t


def tiers_fuer(mod, ilvl, boden=0):
    """Stufen, die bei diesem Itemlevel (und Mindest-Modlevel) rollen können. Fällt eine ganze Familie unter den Boden,
    kann ihre höchste Stufe trotzdem kommen."""
    ok = [t for t in mod['ti'] if t[1] <= ilvl]
    if not ok:
        return []
    ueber = [t for t in ok if t[1] >= boden]
    return ueber or [max(ok, key=lambda t: t[1])]


def basen(q='', limit=30):
    d = daten()
    q = (q or '').lower().strip()
    r = [b for b in d['basen'] if q in b['n'].lower() or q in b['cl'].lower()] if q else d['basen']
    return [{'n': b['n'], 'cl': b['cl'], 'lv': b['lv']} for b in r[:limit]]


def runen_fuer(kat_cat):
    """Meta-Runen, die auf diese Item-Art passen (Kolr's Hunt nur Handschuhe usw.)."""
    d = daten()
    return [{'id': k, 'n': r['n'], 'pool': r['pool'], 'kurz': r['kurz']} for k, r in d['runen'].items() if kat_cat in r['kat']]


def mod_pool(K, rune=None):
    """Pool je Quelle; mit Rune rollen deren Mods im normalen Pool mit (Transmutation bis Chaos)."""
    d = daten()
    p = {q: {'p': list(sp.get('p', [])), 's': list(sp.get('s', []))} for q, sp in K['p'].items()}
    r = d['runen'].get(rune or '')
    if r and K['cat'] in r['kat']:
        p.setdefault('normal', {'p': [], 's': []})
        p['normal']['p'] += r['p']
        p['normal']['s'] += r['s']
    return p


def essenzen_fuer(kat, mod_id):
    """Welche Essenzen garantieren diesen Mod (gleiche Mod-Familie) auf dieser Basis?
    Lesser/Normal/Greater machen ein magisches Item selten und setzen den Mod; Perfect tauscht auf einem seltenen Item einen Mod aus."""
    d = daten()
    m0 = d['mods'].get(mod_id)
    if not m0:
        return []
    K = d['kat'][kat]
    erlaubt = set()
    for q in ('essence', 'perfect_essence'):
        for seite in ('p', 's'):
            erlaubt.update(K['p'].get(q, {}).get(seite, []))
    def gleich(mid):
        m = d['mods'].get(mid)
        return m and (mid == mod_id or m['f'] == m0['f'] or m['x'] == m0['x'])
    out = []
    for e in d['essenzen']:
        for stufe, ids in e['t'].items():
            treffer = [i for i in ids if (i in erlaubt or i == mod_id) and gleich(i)]
            if treffer:
                m = d['mods'][treffer[0]]
                t = max(m['ti'], key=lambda t: t[1]) if m['ti'] else None
                out.append({'name': ('%s Essence of %s' % (stufe.capitalize(), e['n'])).replace('Normal ', ''), 'stufe': stufe,
                            'text': text(m, t) if t else m['x']})
    reihe = ['LESSER', 'NORMAL', 'GREATER', 'PERFECT']
    return sorted(out, key=lambda e: reihe.index(e['stufe']) if e['stufe'] in reihe else 9)


def pool(name_, ilvl=82, stufe='normal', rune=None):
    """Alle Mods einer Basis: Text der besten Stufe, Chance pro Exalted (ohne / mit Omen), Quelle."""
    d = daten()
    b = d['basis'].get((name_ or '').lower())
    if not b:
        return {'error': 'Basis „%s“ nicht gefunden.' % name_}
    K = d['kat'][b['k']]
    runen = runen_fuer(K['cat'])
    if rune and not any(r['id'] == rune for r in runen):
        rune = None
    P = mod_pool(K, rune)
    boden = STUFE.get(stufe, 0)
    out = {'basis': b, 'ilvl': ilvl, 'stufe': stufe, 'knochen': KNOCHEN.get(K['cat']), 'mods': [], 'runen': runen, 'rune': rune,
           'waffe': K['cat'] in WAFFEN, 'meta': d.get('metaRunen', {}),
           'runeGewicht': (d['runen'][rune].get('gewichtGeschaetzt') if rune else None)}
    summe = {'p': 0.0, 's': 0.0}
    normal = []
    for seite in ('p', 's'):
        for mid in P.get('normal', {}).get(seite, []):
            m = d['mods'].get(mid)
            if not m:
                continue
            ti = tiers_fuer(m, ilvl, boden)
            w = sum(t[2] for t in ti)
            summe[seite] += w
            normal.append((mid, m, seite, ti, w))
    gesamt = summe['p'] + summe['s'] or 1
    for mid, m, seite, ti, w in normal:
        alle = tiers_fuer(m, ilvl, 0)
        out['mods'].append({'id': mid, 'quelle': 'rune' if m.get('rune') else 'normal', 'seite': seite, 'familie': m['f'], 'tags': m['tags'],
                            'text': text(m, max(alle, key=lambda t: t[1])) if alle else m['x'],
                            'stufen': [{'name': t[0], 'il': t[1], 'w': t[2], 'text': text(m, t)} for t in sorted(alle, key=lambda t: -t[1])],
                            'chance': round(w / gesamt * 100, 2), 'chanceOmen': round(w / (summe[seite] or 1) * 100, 2),
                            'essenz': essenzen_fuer(b['k'], mid) if not m.get('rune') else [], 'geschaetzt': bool(m.get('rune'))})
    for quelle in ('desecrated', 'essence', 'perfect_essence'):
        sp = P.get(quelle, {})
        ds = {'p': 0.0, 's': 0.0}
        liste = []
        for seite in ('p', 's'):
            for mid in sp.get(seite, []):
                m = d['mods'].get(mid)
                if not m:
                    continue
                alle = tiers_fuer(m, ilvl, 0)
                w = sum(t[2] for t in alle)
                ds[seite] += w
                liste.append((mid, m, seite, alle, w))
        for mid, m, seite, alle, w in liste:
            if not alle:
                continue
            e = {'id': mid, 'quelle': quelle, 'seite': seite, 'familie': m['f'], 'tags': m['tags'],
                 'text': text(m, max(alle, key=lambda t: t[1])),
                 'stufen': [{'name': t[0], 'il': t[1], 'w': t[2], 'text': text(m, t)} for t in sorted(alle, key=lambda t: -t[1])],
                 'essenz': essenzen_fuer(b['k'], mid) if quelle != 'desecrated' else []}
            if quelle == 'desecrated':
                p1 = w / (ds[seite] or 1)
                e['chanceOmen'] = round((1 - (1 - p1) ** 3) * 100, 1)       # unter den 3 Vorschlägen im Well of Souls
                e['chanceEcho'] = round((1 - (1 - p1) ** 6) * 100, 1)       # mit Omen of Abyssal Echoes (einmal neu würfeln)
            out['mods'].append(e)
    return out


# ------------------------------------------------------------------ Simulation

class Wurf:
    def __init__(self, d, b, ilvl, rune=None):
        self.d, self.ilvl = d, ilvl
        self.K = d['kat'][b['k']]
        self.P = mod_pool(self.K, rune)
        self._c = {}

    def wuerfeln(self, item, seiten, boden, rng, quelle='normal'):
        """Zieht einen Mod nach Gewicht (Familien, die schon drauf sind, sind ausgeschlossen).
        Schnell: vorberechnete Summen, bereits vorhandene Familien werden per Neuziehen übersprungen."""
        key = (tuple(seiten), boden, quelle)
        c = self._c
        if key not in c:
            liste, summe, acc = [], [], 0.0
            for seite in seiten:
                for mid in self.P.get(quelle, {}).get(seite, []):
                    m = self.d['mods'].get(mid)
                    if not m:
                        continue
                    for t in tiers_fuer(m, self.ilvl, boden):
                        if t[2] > 0:
                            acc += t[2]
                            liste.append((mid, m['f'], seite, t[1]))
                            summe.append(acc)
            c[key] = (liste, summe, acc)
        liste, summe, tot = c[key]
        if not tot:
            return None
        fam = {x['f'] for x in item}
        for _ in range(60):
            i = bisect.bisect_left(summe, rng.random() * tot)
            mid, f, seite, il = liste[min(i, len(liste) - 1)]
            if f not in fam:
                return {'id': mid, 'f': f, 'side': seite, 'il': il, 'q': quelle}
        rest = [(liste[j], summe[j] - (summe[j - 1] if j else 0)) for j in range(len(liste)) if liste[j][1] not in fam]
        if not rest:
            return None
        x = rng.random() * sum(w for _, w in rest)
        for (mid, f, seite, il), w in rest:
            x -= w
            if x <= 0:
                return {'id': mid, 'f': f, 'side': seite, 'il': il, 'q': quelle}
        mid, f, seite, il = rest[-1][0]
        return {'id': mid, 'f': f, 'side': seite, 'il': il, 'q': quelle}


def zahl(t):
    z = re.findall(r'\d+(?:\.\d+)?', t or '')
    return float(z[0]) if z else 0


def plan(name_, ilvl, wunsch, opt=None, preise=None, laeufe=2000, seed=7):
    """wunsch: [{'id': Mod-ID, 'minIl': Mindest-Stufenlevel}] – vergleicht mehrere Vorgehensweisen per Simulation und
    liefert Erfolgschance, Verbrauch, Kosten und eine ausführliche Schritt-für-Schritt-Anleitung."""
    opt = opt or {}
    d = daten()
    b = d['basis'].get((name_ or '').lower())
    if not b:
        return {'error': 'Basis nicht gefunden.'}
    K = d['kat'][b['k']]
    rune = opt.get('rune') if any(r['id'] == opt.get('rune') for r in runen_fuer(K['cat'])) else None
    W = Wurf(d, b, ilvl, rune)
    stufe = opt.get('stufe', 'normal')
    boden = STUFE.get(stufe, 0)
    boden_t = STUFE_TRANS.get(stufe, 0)
    budget = int(opt.get('budget') or 40)
    serle, astrid = bool(opt.get('serle')), bool(opt.get('astrid'))
    aldur = bool(opt.get('aldur')) and K['cat'] in WAFFEN
    cap = {'p': 3, 's': 4 if serle else 3}
    wl = []
    for w in wunsch:
        m = d['mods'].get(w.get('id'))
        if not m:
            continue
        src = next((q for q, sp in W.P.items() if w['id'] in sp.get('p', []) + sp.get('s', [])), None)
        if not src:
            if m.get('rune'):
                return {'error': 'Dieser Mod braucht die Rune %s – bitte oben bei „Rune“ auswählen.' % d['runen'][m['rune']]['n']}
            continue
        seite = 'p' if w['id'] in W.P.get(src, {}).get('p', []) else 's'
        wl.append({'id': w['id'], 'f': m['f'], 'side': seite, 'min': int(w.get('minIl') or 0), 'q': src, 'm': m})
    if not wl:
        return {'error': 'Bitte mindestens einen Wunsch-Mod wählen.'}
    if sum(1 for w in wl if w['side'] == 'p') > cap['p'] or sum(1 for w in wl if w['side'] == 's') > cap['s']:
        return {'error': 'Ein Item hat höchstens 3 Prefixe und %d Suffixe%s.' % (cap['s'], '' if serle else ' (mit Serle\'s Triumph 4)')}
    if sum(1 for w in wl if w['q'] == 'desecrated') > 1:
        return {'error': 'Pro Item ist nur ein Desecrated-Mod (Abyss) möglich.'}
    gecraftet = [w for w in wl if w['q'] in ('essence', 'perfect_essence')]
    if len(gecraftet) > (2 if astrid else 1):
        return {'error': 'Pro Item ist nur ein gecrafteter Mod (Essenz) möglich – mit der Rune Astrid\'s Creativity zwei.'}

    # Familien, die als Treffer zählen (Aldur-Rune verwandelt Feuer/Kälte/Blitz in das Wunsch-Element)
    def familien(f):
        if aldur and any(e in f for e in ELEMENTE):
            e0 = next(e for e in ELEMENTE if e in f)
            return {f.replace(e0, e) for e in ELEMENTE}
        return {f}
    for w in wl:
        w['fs'] = familien(w['f'])

    # Essenz (Lesser/Normal/Greater): für den seltensten Wunsch-Mod, den sie garantiert und in der Stufe erreicht
    ess = None
    for w in sorted(wl, key=lambda w: (w['q'] == 'normal', 0)):
        if w['q'] == 'perfect_essence':
            continue
        es = essenzen_fuer(b['k'], w['id'])
        gr = [e for e in es if e['stufe'] in ('GREATER', 'NORMAL', 'LESSER')]
        if w['min'] and w['m']['ti']:
            ziel = next((t for t in sorted(w['m']['ti'], key=lambda t: t[1]) if t[1] >= w['min']), None)
            if ziel and gr and zahl(gr[-1].get('text')) < zahl(text(w['m'], ziel)):
                continue
        if gr and (opt.get('essenz', True) or w['q'] == 'essence'):
            ess = {'w': w, 'name': sorted(gr, key=lambda e: ['LESSER', 'NORMAL', 'GREATER'].index(e['stufe']))[-1]['name']}
            break
    perf = next((w for w in wl if w['q'] == 'perfect_essence'), None)
    perf_name = None
    if perf:
        pe = [e for e in essenzen_fuer(b['k'], perf['id']) if e['stufe'] == 'PERFECT']
        perf_name = pe[0]['name'] if pe else 'Perfect Essence'
    if ess and perf and not astrid:
        ess = None  # nur ein gecrafteter Mod: dann lieber die Perfect Essenz, der andere Mod wird normal gerollt
    unerreichbar = [w for w in wl if w['q'] == 'essence' and (not ess or ess['w'] is not w)]
    if unerreichbar:
        return {'error': '„%s“ gibt es nur per Essenz – zusammen mit deinen anderen Wünschen geht das nicht (nur ein gecrafteter Mod pro Item).' % text(unerreichbar[0]['m'], max(unerreichbar[0]['m']['ti'], key=lambda t: t[1]))}
    wichtig = [w for w in wl if w['q'] in ('normal', 'rune') and (not ess or w is not ess['w'])]
    abyss = next((w for w in wl if w['q'] == 'desecrated'), None)
    preis = preise or {}
    knochen = 'Preserved %s' % KNOCHEN.get(K['cat'], 'Rib')
    basis_preis = float(opt.get('basisPreis') or 1)

    top2 = {}
    for w in wl:
        ils = sorted({t[1] for t in tiers_fuer(w['m'], ilvl, 0)}, reverse=True)
        top2[w['f']] = ils[1] if len(ils) > 1 else (ils[0] if ils else 0)

    def erfuellt(item, w):
        return any(x['f'] in w['fs'] and x['il'] >= w['min'] for x in item)

    def nuetzlich(m):
        return any(m['f'] in w['fs'] and m['il'] >= w['min'] for w in wl) or m['q'] in ('essence', 'desecrated')

    # Schlüssel-Mod für die Fracture-Methode: der seltenste Wunsch (kleinstes Gewicht bei Chaos)
    def gewicht(w):
        return sum(t[2] for t in tiers_fuer(w['m'], ilvl, boden) if t[1] >= w['min']) or 1e-9
    schluessel = min(wichtig, key=gewicht) if wichtig else None
    start_item = []
    for m0 in (opt.get('start') or {}).get('mods') or []:
        mm = d['mods'].get(m0.get('id'))
        if not mm and m0.get('f') and m0.get('seite') in ('p', 's'):
            start_item.append({'id': m0['id'], 'f': m0['f'], 'side': m0['seite'], 'il': int(m0.get('il') or 0),
                               'q': 'desecrated' if m0.get('q') in ('desecrated', 'genesis') else ('essence' if m0.get('q') == 'essence' else 'normal'), 'fx': bool(m0.get('fx'))})
            continue
        if mm:
            seite0 = 'p' if any(m0['id'] in sp.get('p', []) for sp in W.P.values()) else 's'
            start_item.append({'id': m0['id'], 'f': mm['f'], 'side': seite0, 'il': int(m0.get('il') or 0),
                               'q': m0.get('q') or ('essence' if m0.get('crafted') else 'normal'), 'fx': bool(m0.get('fx'))})
    start_rar = (opt.get('start') or {}).get('rar', 'normal')

    def sim(omen_ex, entfernen, laeufe, seed):
        """omen_ex = Exalted mit Seiten-Omen; entfernen = 'neu' (neue Basis), 'annulOmen', 'annul', 'chaosOmen' (Chaos + Erasure-Omen), 'chaos',
        'frac' (Alchemy + Chaos bis zum Schlüssel-Mod, dann Fracturing Orb – danach Annulment)."""
        rng = random.Random(seed)
        erg = []
        frac = entfernen == 'frac'
        weg_art = ('annulOmen' if omen_ex else 'annul') if frac else entfernen
        for _ in range(laeufe):
            z = collections.Counter()
            erst = [bool(start_item) or start_rar != 'normal']

            def chaos_wurf(it):
                kand = [m for m in it if m['q'] != 'desecrated' and not m.get('fx')]
                if kand:
                    it.remove(rng.choice(kand))
                z['chaos'] += 1
                frei2 = tuple(s2 for s2 in ('p', 's') if cap[s2] - len([m for m in it if m['side'] == s2]) > 0)
                x = W.wuerfeln(it, frei2, boden, rng) if frei2 else None
                if x:
                    it.append(x)

            def start():
                if erst[0]:
                    erst[0] = False
                    it = [dict(m) for m in start_item]
                    if start_rar == 'magic':
                        x = W.wuerfeln(it, tuple(s2 for s2 in ('p', 's') if cap[s2] - len([m for m in it if m['side'] == s2]) > 0), boden, rng)
                        z['regal'] += 1
                        if x:
                            it.append(x)
                    if frac and schluessel and not any(m.get('fx') for m in it):
                        return start_frac(it)
                    return it
                if frac:
                    return start_frac(None)
                it = []
                z['basis'] += 1
                if rune:
                    z['rune'] += 1
                z['trans'] += 1
                x = W.wuerfeln(it, ('p', 's'), boden_t, rng)
                if x:
                    it.append(x)
                if ess:
                    it.append({'id': ess['w']['id'], 'f': ess['w']['f'], 'side': ess['w']['side'], 'il': 999, 'q': 'essence'})
                    z['essenz'] += 1
                else:
                    andere = 's' if it and it[0]['side'] == 'p' else 'p'
                    x = W.wuerfeln(it, (andere,), boden_t, rng)
                    z['aug'] += 1
                    if x:
                        it.append(x)
                    x = W.wuerfeln(it, ('p', 's'), boden, rng)
                    z['regal'] += 1
                    if x:
                        it.append(x)
                return it

            def start_frac(it):
                # Community-Methode: Alchemy (4 Mods) → Chaos bis der seltenste Wunsch-Mod da ist → Fracturing Orb (trifft 1 von n Mods)
                for _versuch in range(8):
                    if it is None:
                        it = []
                        z['basis'] += 1
                        if rune:
                            z['rune'] += 1
                        z['alch'] += 1
                        for _k in range(4):
                            frei_ = tuple(s2 for s2 in ('p', 's') if cap[s2] - len([m for m in it if m['side'] == s2]) > 0)
                            x = W.wuerfeln(it, frei_, 0, rng)
                            if x:
                                it.append(x)
                    for _c in range(budget * 8):
                        if erfuellt(it, schluessel):
                            break
                        chaos_wurf(it)
                    while len(it) < 4:   # Fracturing Orb braucht mindestens 4 Mods
                        frei_ = tuple(s2 for s2 in ('p', 's') if cap[s2] - len([m for m in it if m['side'] == s2]) > 0)
                        x = W.wuerfeln(it, frei_, boden, rng) if frei_ else None
                        if not x:
                            break
                        it.append(x)
                        z['exalt'] += 1
                    if not erfuellt(it, schluessel):
                        return it
                    z['frac'] += 1
                    treffer = [m for m in it if m['f'] in schluessel['fs'] and m['il'] >= schluessel['min']]
                    if rng.random() < len(treffer[:1]) / max(1, len(it)):
                        treffer[0]['fx'] = True
                        return it
                    it = None   # falscher Mod fraktiert: Basis taugt nicht mehr, neu anfangen
                return it or []
            item = start()
            ok = False
            for schritt in range(budget * 5):
                if ess and not any(m['q'] == 'essence' for m in item):
                    item = start()          # Essenz-Mod wurde weggewürfelt: von vorn
                    continue
                fehlt = [w for w in wichtig if not erfuellt(item, w)]
                if not fehlt:
                    ok = True
                    break
                if (z['exalt'] + z['annul'] if frac else z['exalt'] + z['chaos']) >= budget or z['basis'] > 40:
                    break
                belegt = {sd: [m for m in item if m['side'] == sd] for sd in ('p', 's')}
                frei = {sd: cap[sd] - len(belegt[sd]) for sd in ('p', 's')}
                bedarf = {sd: len([w for w in fehlt if w['side'] == sd]) for sd in ('p', 's')}
                blockiert = [sd for sd in ('p', 's') if bedarf[sd] > frei[sd]]
                if blockiert:
                    sd = blockiert[0]
                    stoer = [m for m in belegt[sd] if not nuetzlich(m) and not m.get('fx')]
                    if weg_art == 'neu' or not stoer:
                        item = start()
                        continue
                    if weg_art in ('chaos', 'chaosOmen'):
                        kand = belegt[sd] if weg_art == 'chaosOmen' else item
                        kand = [m for m in kand if m['q'] != 'desecrated' and not m.get('fx')]
                        item.remove(rng.choice(kand))
                        z['chaos'] += 1
                        if weg_art == 'chaosOmen':
                            z['omenEr' + sd.upper()] += 1
                        frei2 = tuple(s2 for s2 in ('p', 's') if cap[s2] - len([m for m in item if m['side'] == s2]) > 0)
                        x = W.wuerfeln(item, frei2, boden, rng) if frei2 else None
                        if x:
                            item.append(x)
                        continue
                    kand = [m for m in (item if weg_art == 'annul' else belegt[sd]) if m['q'] != 'desecrated' and not m.get('fx')]
                    item.remove(rng.choice(kand))
                    z['annul'] += 1
                    if weg_art == 'annulOmen':
                        z['omenAn' + sd.upper()] += 1
                    continue
                if omen_ex:
                    sd = max([sd for sd in ('p', 's') if bedarf[sd] > 0], key=lambda sd: bedarf[sd])
                    x = W.wuerfeln(item, (sd,), boden, rng)
                    z['omenEx' + sd.upper()] += 1
                else:
                    seiten = tuple(sd for sd in ('p', 's') if frei[sd] > 0)
                    if not seiten:
                        item = start()
                        continue
                    x = W.wuerfeln(item, seiten, boden, rng)
                if not x:
                    break
                item.append(x)
                z['exalt'] += 1
            if ok:
                z['top'] = int(all(any(x['f'] in w['fs'] and x['il'] >= top2[w['f']] for x in item) for w in wichtig))
            if ok and perf:
                # Perfect Essenz: entfernt einen Mod (mit Crystallisation-Omen nur auf einer Seite) und setzt den Wunsch-Mod
                stoer = [m for m in item if not nuetzlich(m)]
                if not stoer:
                    frei_ = [s2 for s2 in ('p', 's') if cap[s2] - len([m for m in item if m['side'] == s2]) > 0]
                    x = W.wuerfeln(item, tuple(frei_), boden, rng) if frei_ else None
                    if x:
                        item.append(x)
                        z['exalt'] += 1
                    stoer = [m for m in item if not nuetzlich(m)]
                ziel_seite = perf['side']
                platz = cap[ziel_seite] - len([m for m in item if m['side'] == ziel_seite])
                kand_seiten = [s2 for s2 in ('p', 's') if any(m['side'] == s2 for m in stoer) and (s2 == ziel_seite or platz > 0)]
                if kand_seiten:
                    s2 = ziel_seite if ziel_seite in kand_seiten else kand_seiten[0]
                    seite_mods = [m for m in item if m['side'] == s2 and m['q'] != 'desecrated']
                    weg = rng.choice(seite_mods)
                    item.remove(weg)
                    z['perfEss'] += 1
                    z['omenCr' + s2.upper()] += 1
                    item.append({'id': perf['id'], 'f': perf['f'], 'side': perf['side'], 'il': 999, 'q': 'essence'})
                    ok = all(erfuellt(item, w) for w in wichtig)
                else:
                    ok = False
            if ok and abyss:
                ok = False
                for versuch in range(max(1, budget // 4)):
                    if len(item) >= cap['p'] + cap['s']:
                        item.remove(rng.choice([m for m in item if not nuetzlich(m)] or item))
                    z['knochen'] += 1
                    z['omenNec'] += 1
                    treffer = False
                    for runde in (0, 1):
                        opts = [W.wuerfeln(item, (abyss['side'],), 0, rng, 'desecrated') for _ in range(3)]
                        if any(o and o['f'] == abyss['f'] and o['il'] >= abyss['min'] for o in opts):
                            treffer = True
                            break
                        if runde == 0 and opt.get('echo', True):
                            z['echo'] += 1
                        else:
                            break
                    if treffer:
                        item.append({'id': abyss['id'], 'f': abyss['f'], 'side': abyss['side'], 'il': 999, 'q': 'desecrated'})
                        ok = all(erfuellt(item, w) for w in wichtig)
                        break
            erg.append((ok, z))
        return erg

    N = {k: name(stufe, v) for k, v in (('trans', 'Orb of Transmutation'), ('aug', 'Orb of Augmentation'), ('regal', 'Regal Orb'),
                                         ('exalt', 'Exalted Orb'), ('chaos', 'Chaos Orb'))}
    rune_name = d['runen'][rune]['n'] if rune else None

    def kosten(z):
        if not preis.get('Exalted Orb'):
            return 0  # ohne Liga-Preise keine Kostenangabe
        s = sum((preis.get(N[k]) or 0) * z[k] for k in N)
        s += (preis.get('Orb of Annulment') or 0) * z['annul']
        s += (preis.get('Orb of Alchemy') or 0) * z['alch'] + (preis.get('Fracturing Orb') or 0) * z['frac']
        for kz, omen in (('omenExP', 'Omen of Sinistral Exaltation'), ('omenExS', 'Omen of Dextral Exaltation'),
                         ('omenAnP', 'Omen of Sinistral Annulment'), ('omenAnS', 'Omen of Dextral Annulment'),
                         ('omenErP', 'Omen of Sinistral Erasure'), ('omenErS', 'Omen of Dextral Erasure'),
                         ('omenCrP', 'Omen of Sinistral Crystallisation'), ('omenCrS', 'Omen of Dextral Crystallisation')):
            s += (preis.get(omen) or 0) * z[kz]
        s += basis_preis * max(0, z['basis'] - (0 if start_item or start_rar != 'normal' else 1))
        if rune:
            s += (preis.get(rune_name) or 0) * z['rune']
        if ess:
            s += z['essenz'] * (preis.get(ess['name']) or 0)
        if perf:
            s += z['perfEss'] * (preis.get(perf_name) or 0)
        if abyss:
            s += z['knochen'] * (preis.get(knochen) or 0)
            s += z['omenNec'] * (preis.get('Omen of %s Necromancy' % ('Sinistral' if abyss['side'] == 'p' else 'Dextral')) or 0)
            s += z['echo'] * (preis.get('Omen of Abyssal Echoes') or 0)
        return s

    STRAT = [(True, 'neu', 'Mit Omen, bei Pech neu anfangen'), (True, 'annulOmen', 'Mit Omen, falsche Mods per Annulment-Omen entfernen'),
             (True, 'chaosOmen', 'Mit Omen, falsche Mods per Chaos Orb + Erasure-Omen tauschen'), (True, 'annul', 'Mit Omen, Annulment ohne Omen'),
             (False, 'neu', 'Ohne Omen, bei Pech neu anfangen'), (False, 'chaos', 'Ohne Omen, Chaos Orb ohne Omen'), (False, 'annul', 'Ohne Omen, Annulment ohne Omen'),
             (True, 'frac', 'Schlüssel-Mod per Chaos holen und fracturen, Rest mit Omen'), (False, 'frac', 'Schlüssel-Mod per Chaos holen und fracturen, Rest ohne Omen')]
    if not wichtig:
        STRAT = STRAT[:1]
    if ess:
        STRAT = [x for x in STRAT if x[1] != 'frac']
    elif len(wichtig) == 1:
        STRAT = [x for x in STRAT if x[1] in ('frac', 'neu', 'chaos', 'chaosOmen')]
    varianten = []
    for i, (oe, en, name_s) in enumerate(STRAT):
        erg = sim(oe, en, max(250, laeufe // 6), seed + i)
        gut = [z for ok, z in erg if ok]
        quote = len(gut) / len(erg)
        k_alle = statistics.mean(kosten(z) for ok, z in erg)
        varianten.append({'omen': oe, 'entfernen': en, 'name': name_s, 'erfolg': round(quote * 100, 1),
                          'proErfolg': round(k_alle / quote, 1) if quote and k_alle else None})
    mit_preis = [v for v in varianten if v['proErfolg']]
    erzw = next((v for v in varianten if '%s|%s' % (v['omen'], v['entfernen']) == opt.get('weg')), None)
    for v in varianten:
        v['key'] = '%s|%s' % (v['omen'], v['entfernen'])
        v['community'] = v['entfernen'] == 'frac'
    if erzw:
        best = erzw
    elif opt.get('ziel') == 'stark':
        spitze = max(v['erfolg'] for v in varianten)
        nah = [v for v in varianten if v['erfolg'] >= spitze - 5]
        best = min(nah, key=lambda v: (v['proErfolg'] if v['proErfolg'] is not None else 1e12, -v['erfolg']))
    elif mit_preis and preis.get('Exalted Orb'):
        best = min(mit_preis, key=lambda v: (v['proErfolg'], -v['erfolg']))
    else:
        best = max(varianten, key=lambda v: v['erfolg'])
    ergebnisse = sim(best['omen'], best['entfernen'], laeufe, seed)
    gut = [z for ok, z in ergebnisse if ok]
    for z in gut:
        z['omenEx'] = z['omenExP'] + z['omenExS']
        z['omenAn'] = z['omenAnP'] + z['omenAnS']
        z['omenEr'] = z['omenErP'] + z['omenErS']
        z['omenCr'] = z['omenCrP'] + z['omenCrS']
        z['neu'] = z['basis'] - (0 if start_item or start_rar != 'normal' else 1)

    def stat(feld):
        v = sorted(z[feld] for z in gut)
        if not v or not any(v):
            return None
        return {'schnitt': round(statistics.mean(v), 1), 'median': v[len(v) // 2], 'p90': v[int(len(v) * .9)]}
    verbrauch = {k2: stat(k2) for k2 in ('trans', 'aug', 'regal', 'alch', 'frac', 'exalt', 'chaos', 'annul', 'omenEx', 'omenAn', 'omenEr', 'omenCr', 'neu',
                                          'essenz', 'perfEss', 'knochen', 'echo', 'rune')}
    erfolg = len(gut) / len(ergebnisse) * 100
    k = sorted(kosten(z) for z in gut)

    def meist(feld):
        v = verbrauch.get(feld)
        return v['median'] if v else 0

    def pr(n, anz=1):
        p = preis.get(n)
        return (' · %s Ex pro Stück' % _f(p)) if p and anz == 1 else (' · ca. %s Ex' % _f(p * anz) if p else '')

    benoetigt = [N['exalt']]
    if best['entfernen'] == 'frac':
        benoetigt += ['Orb of Alchemy', N['chaos'], 'Fracturing Orb', 'Orb of Annulment'] + (['Omen of Sinistral Annulment', 'Omen of Dextral Annulment'] if best['omen'] else [])
    if best['entfernen'] in ('annul', 'annulOmen'):
        benoetigt.append('Orb of Annulment')
    if best['entfernen'] in ('chaos', 'chaosOmen'):
        benoetigt.append(N['chaos'])
    if best['omen']:
        benoetigt += ['Omen of Sinistral Exaltation', 'Omen of Dextral Exaltation']
    if best['entfernen'] == 'chaosOmen':
        benoetigt += ['Omen of Sinistral Erasure', 'Omen of Dextral Erasure']
    if best['entfernen'] == 'annulOmen':
        benoetigt += ['Omen of Sinistral Annulment', 'Omen of Dextral Annulment']
    if best['entfernen'] != 'frac':
        benoetigt += [N['trans']] + ([] if ess else [N['aug'], N['regal']])
    if rune:
        benoetigt.append(rune_name)
    if ess:
        benoetigt.append(ess['name'])
    if perf:
        benoetigt += [perf_name, 'Omen of %s Crystallisation' % ('Sinistral' if perf['side'] == 'p' else 'Dextral')]
    unbekannt = [n for n in benoetigt if not preis.get(n)]

    # ---------------------------------------------------------------- ausführliche Anleitung
    hoechst = max([w['min'] for w in wl] + [65 if rune else 0])
    S = []
    S.append({'t': 'Basis besorgen: %s' % b['n'],
              'd': 'Weiß (Normal), nicht corrupted, Itemlevel %d oder höher – das Itemlevel entscheidet, welche Stufen überhaupt rollen können%s.%s' % (
                  max(ilvl, hoechst), ' (deine Mindeststufen brauchen Modlevel %d)' % hoechst if hoechst else '',
                  ' Kauf gleich mehrere: Bei Pech fängst du mit einer neuen an (meist %d, bei Pech %d Basen).' % (meist('neu') + 1, (verbrauch['neu'] or {}).get('p90', 0) + 1) if best['entfernen'] == 'neu' and verbrauch.get('neu') else ''),
              'tipp': 'Auf der Trade-Seite nach „Item Level“ filtern; Basen mit hohem Itemlevel droppen in T15+-Maps.', 'icon': 'item'})
    if rune or serle or astrid or aldur:
        rn = [r for r in (rune_name, "Serle's Triumph" if serle else None, "Astrid's Creativity" if astrid else None,
                          'Rune of Aldur (Element nach Wunsch)' if aldur else None) if r]
        was = []
        if rune:
            r = d['runen'][rune]
            was.append('%s: ab jetzt können %s-Mods mitrollen (%s) – bei Transmutation, Augmentation, Regal, Exalted und Chaos' % (rune_name, r['pool'], r['kurz']))
        if serle:
            was.append("Serle's Triumph: ein 4. Suffix ist erlaubt")
        if astrid:
            was.append("Astrid's Creativity: zwei gecraftete Mods (z. B. Essenz + Perfect Essenz)")
        if aldur:
            was.append('Aldur-Rune (Passion = Feuer, Breath = Kälte, Ire = Blitz): alle Element-Mods werden zu deinem Wunsch-Element – damit zählt jeder Element-Treffer')
        S.append({'t': 'Rune einsetzen: %s' % ', '.join(rn),
                  'd': 'VOR dem ersten Orb in einen leeren Augment-Sockel setzen. ' + '. '.join(was) + '.',
                  'tipp': 'Jede Rune braucht einen eigenen Sockel und lässt sich nicht mehr entfernen oder tauschen. Fehlt ein Sockel: Artificer\'s Orb (Rüstungsteile außer Brust max. 1 Sockel, Exceptional-Basen haben 2). Nicht auf corrupted Items möglich.', 'icon': 'rune'})
    fracw = best['entfernen'] == 'frac'
    if start_item:
        S.append({'t': 'Dein Item als Start', 'd': 'Der Plan geht von deinem Item mit %d Mods aus (%s). Erst wenn es dabei kaputtgeht, kommt eine neue Basis dran.' % (
            len(start_item), {'rare': 'selten', 'magic': 'magisch', 'normal': 'weiß'}.get(start_rar, start_rar)), 'icon': 'item'})
    if fracw and schluessel:
        sk = text(schluessel['m'], max(schluessel['m']['ti'], key=lambda t: t[1]))
        if not (start_item and start_rar == 'rare'):
          S.append({'t': 'Orb of Alchemy', 'd': 'Macht die weiße Basis direkt selten mit 4 zufälligen Mods. 4 Mods sind genau richtig: genug für den Fracturing Orb, und jeder Mod hat beim Fracturen 25 % Chance.',
                  'anz': meist('alch'), 'tipp': pr('Orb of Alchemy').strip(' ·'), 'icon': 'orb'})
        S.append({'t': '%s bis „%s“ kommt' % (N['chaos'], sk),
                  'd': 'Jeder Chaos Orb tauscht einen zufälligen Mod gegen einen neuen. So lange werfen, bis dein Schlüssel-Mod „%s“%s drauf ist – das ist der seltenste deiner Wünsche, alles andere ist danach leichter. Die Anzahl der Mods bleibt dabei gleich.%s' % (
                      sk, ' (ab Modlevel %d)' % schluessel['min'] if schluessel['min'] else '', ' %s lässt nur Mods ab Modlevel %d zu – weniger Müll, aber teurer.' % (N['chaos'], boden) if boden else ''),
                  'anz': meist('chaos'), 'tipp': 'Meist %d Chaos%s' % (meist('chaos'), pr(N['chaos'])), 'icon': 'an'})
        S.append({'t': 'Fracturing Orb', 'd': 'Sobald der Schlüssel-Mod da ist: Fracturing Orb. Er macht einen zufälligen der 4 Mods dauerhaft (fraktiert) – Annulment und Chaos können ihn danach nicht mehr entfernen. Trifft er den falschen Mod, ist die Basis meist verloren: neue Basis, wieder Alchemy. Tipp: Hat das Item schon mehr als 4 Mods, vorher mit Annulment auf 4 runter – sonst sinkt die Chance.',
                  'anz': meist('frac'), 'tipp': 'Meist %d Versuche%s · oder direkt eine Basis mit diesem Mod fraktiert kaufen (Trade: „Fractured“-Filter)' % (meist('frac'), pr('Fracturing Orb')), 'icon': 'div'})
        if len(wichtig) > 1:
            S.append({'t': 'Platz schaffen', 'd': 'Die übrigen Mods, die du nicht brauchst, mit Orb of Annulment entfernen%s – der fraktierte Mod ist geschützt. So entsteht Platz für die restlichen Wünsche.' % (
                ' (mit Omen of Sinistral/Dextral Annulment gezielt auf einer Seite)' if best['omen'] else ''), 'anz': meist('annul'), 'tipp': pr('Orb of Annulment').strip(' ·'), 'icon': 'an'})
    elif start_item and start_rar == 'rare':
        pass
    elif ess:
        S.append({'t': N['trans'], 'd': 'Macht die weiße Basis magisch (1 zufälliger Mod)%s.' % (
            ' – %s lässt nur Mods ab Modlevel %d zu' % (NAMEN[stufe].strip(), boden_t) if boden_t else ''), 'anz': meist('trans'), 'tipp': pr(N['trans']).strip(' ·'), 'icon': 'orb'})
        S.append({'t': ess['name'], 'd': 'Auf das magische Item: macht es selten und setzt garantiert „%s“ (der andere magische Mod bleibt). Das ist dein gecrafteter Mod – ein zweiter geht nur mit Astrid\'s Creativity.' % text(ess['w']['m'], max(ess['w']['m']['ti'], key=lambda t: t[1])),
                  'anz': meist('essenz'), 'tipp': pr(ess['name']).strip(' ·'), 'icon': 'ess'})
    else:
        S.append({'t': '%s → %s → %s' % (N['trans'], N['aug'], N['regal']),
                  'd': 'Weiß → magisch (1 Mod) → zweiter Mod auf der anderen Seite → selten (3. Mod).%s%s Für keinen deiner Wünsche gibt es eine passende Essenz.' % (
                      ' %s Transmutation/Augmentation: nur Mods ab Modlevel %d, Regal ab %d – so kommen fast nur hohe Stufen.' % (NAMEN[stufe].strip(), boden_t, boden) if boden else '',
                      ' Mit %s landet dabei oft schon ein %s-Mod.' % (rune_name, d['runen'][rune]['pool']) if rune else ''),
                  'anz': meist('trans'), 'tipp': 'Pro Versuch je 1 Stück%s' % ''.join(pr(n) for n in (N['trans'],)), 'icon': 'orb'})
    if wichtig and not (fracw and len(wichtig) == 1):
        if best['omen']:
            S.append({'t': '%s mit Omen' % N['exalt'],
                      'd': 'Vor jedem Exalted das passende Omen aktivieren (Rechtsklick im Inventar): Omen of Sinistral Exaltation = neuer Mod garantiert Prefix, Omen of Dextral Exaltation = garantiert Suffix. Immer die Seite wählen, auf der dir noch ein Wunsch fehlt.%s' % (
                          ' %s rollt nur Mods ab Modlevel %d.' % (N['exalt'], boden) if boden else ''),
                      'anz': meist('exalt'), 'tipp': 'Meist %d Exalted und %d Omen%s' % (meist('exalt'), meist('omenEx'), pr(N['exalt'])), 'icon': 'ex'})
        else:
            S.append({'t': N['exalt'], 'd': 'Ohne Omen – der neue Mod landet zufällig auf einer Seite mit freiem Platz.%s Die Omen sind gerade zu teuer für ihren Nutzen.' % (
                ' Nur Mods ab Modlevel %d.' % boden if boden else ''), 'anz': meist('exalt'), 'tipp': 'Meist %d Stück%s' % (meist('exalt'), pr(N['exalt'])), 'icon': 'ex'})
        en = best['entfernen']
        if en == 'frac' or (en == 'neu' and fracw):
            pass
        elif en == 'neu':
            S.append({'t': 'Seite voll mit Falschem? Neu anfangen', 'd': 'Ist auf der Seite, wo dir noch ein Wunsch fehlt, kein Platz mehr (3 Prefixe / %d Suffixe): nicht reparieren, sondern mit einer neuen Basis von vorn beginnen – bei den aktuellen Preisen am günstigsten.' % cap['s'],
                      'anz': meist('neu'), 'icon': 'an'})
        elif en == 'chaosOmen':
            S.append({'t': '%s + Omen of Sinistral/Dextral Erasure' % N['chaos'],
                      'd': 'Ist eine Seite voll mit Falschem: Erasure-Omen für diese Seite aktivieren (Sinistral = Prefix, Dextral = Suffix), dann %s. Er entfernt einen zufälligen Mod NUR auf dieser Seite und würfelt sofort einen neuen dazu%s. Kann auch einen guten Mod treffen – dann geht es mit Exalted weiter.' % (
                          N['chaos'], ' (ab Modlevel %d)' % boden if boden else ''),
                      'anz': meist('chaos'), 'tipp': 'Meist %d Chaos und %d Erasure-Omen%s' % (meist('chaos'), meist('omenEr'), pr(N['chaos'])), 'icon': 'an'})
        elif en == 'chaos':
            S.append({'t': N['chaos'], 'd': 'Entfernt einen zufälligen Mod irgendwo auf dem Item und würfelt sofort einen neuen. Billig, aber trifft auch gute Mods.', 'anz': meist('chaos'), 'tipp': 'Meist %d Stück%s' % (meist('chaos'), pr(N['chaos'])), 'icon': 'an'})
        elif en == 'annulOmen':
            S.append({'t': 'Orb of Annulment + Omen of Sinistral/Dextral Annulment', 'd': 'Entfernt einen zufälligen Mod nur auf der vollen Seite (Sinistral = Prefix, Dextral = Suffix). Danach wieder Exalted.', 'anz': meist('annul'), 'tipp': 'Meist %d Annulment und %d Omen%s' % (meist('annul'), meist('omenAn'), pr('Orb of Annulment')), 'icon': 'an'})
        else:
            S.append({'t': 'Orb of Annulment', 'd': 'Ohne Omen – entfernt einen zufälligen Mod irgendwo. Kann auch einen guten treffen.', 'anz': meist('annul'), 'tipp': 'Meist %d Stück%s' % (meist('annul'), pr('Orb of Annulment')), 'icon': 'an'})
    if perf:
        cr = 'Omen of %s Crystallisation' % ('Sinistral' if perf['side'] == 'p' else 'Dextral')
        S.append({'t': '%s + %s' % (perf_name, cr),
                  'd': 'Erst wenn alles andere sitzt: die Perfect Essenz entfernt einen Mod und setzt garantiert „%s“. Mit dem Crystallisation-Omen (Sinistral = Prefix, Dextral = Suffix) wird nur auf der gewählten Seite entfernt – vorher sicherstellen, dass dort nur noch EIN unnützer Mod sitzt, dann trifft es genau den.' % text(perf['m'], max(perf['m']['ti'], key=lambda t: t[1])),
                  'anz': meist('perfEss'), 'tipp': pr(perf_name).strip(' ·'), 'icon': 'ess'})
    if abyss:
        S.append({'t': 'Abyss: %s + Omen of %s Necromancy' % (knochen, 'Sinistral' if abyss['side'] == 'p' else 'Dextral'),
                  'd': 'Knochen auf das seltene Item, dann im Well of Souls (Akt 2, über die Lightless Caverns) aus 3 Vorschlägen „%s“ wählen. Omen of Abyssal Echoes würfelt die 3 Vorschläge einmal neu, Omen of the Liege/Sovereign/Blackblooded legen den Lich fest. Nur ein Abyss-Mod pro Item; hat das Item keinen Platz, fliegt vorher ein zufälliger Mod raus.' % text(abyss['m'], max(abyss['m']['ti'], key=lambda t: t[1])),
                  'anz': meist('knochen'), 'tipp': pr(knochen).strip(' ·'), 'icon': 'abyss'})
    if K['cat'] in ('Rings', 'Amulets'):
        tags = collections.Counter(t for w in wl for t in w['m']['tags'] if t in KATALYST)
        if tags:
            kt = KATALYST[tags.most_common(1)[0][0]]
            S.append({'t': 'Werte +20 %%: 20 × %s' % kt, 'd': 'Ganz zum Schluss Katalysator-Qualität auf 20 %% – verstärkt alle passenden Mods. Billiger und sicherer als Divine.', 'tipp': pr(kt, 20).strip(' ·'), 'icon': 'div'})
    S.append({'t': 'Absichern und fertig machen (optional)',
              'd': 'Fracturing Orb: macht bei 4+ Mods einen zufälligen Mod dauerhaft – lohnt sich, wenn dein seltenster Wunsch schon drauf ist und noch viel fehlt. Hinekora\'s Lock zeigt vorher, was der nächste Orb bewirken würde. Divine Orb würfelt nur die Zahlen neu (Omen of Sanctification: alle Werte ×78–122 %, danach unveränderbar). Qualität: Armourer\'s Scrap bzw. Blacksmith\'s Whetstone auf 20 %. Vaal Orb ganz zum Schluss: kann einen Sockel bringen, aber das Item auch zerstören – endgültig.',
              'icon': 'div'})
    top = round(sum(z['top'] for z in gut) / len(gut) * 100) if gut else 0
    return {'basis': b['n'], 'ilvl': ilvl, 'stufe': stufe, 'budget': budget, 'erfolg': round(erfolg, 1), 'laeufe': laeufe, 'top': top, 'ziel': opt.get('ziel', 'billig'),
            'variante': best['name'], 'weg': '%s|%s' % (best['omen'], best['entfernen']), 'varianten': varianten, 'rune': rune_name, 'serle': serle, 'astrid': astrid, 'aldur': aldur,
            'waehrung': N, 'verbrauch': verbrauch,
            'kosten': {'schnitt': round(statistics.mean(k), 1), 'median': round(k[len(k) // 2], 1), 'p90': round(k[int(len(k) * .9)], 1)} if k and k[-1] else None,
            'preiseFehlen': unbekannt, 'essenz': ess['name'] if ess else None, 'perfEssenz': perf_name, 'schritte': S,
            'geschaetzt': bool(rune and any(w['m'].get('rune') for w in wl)),
            'preisInfo': {n: round(preis[n], 2) for n in dict.fromkeys(benoetigt) if preis.get(n)},
            'wuensche': [{'id': w['id'], 'text': text(w['m'], max(w['m']['ti'], key=lambda t: t[1])), 'seite': w['side'], 'quelle': w['q'], 'min': w['min']} for w in wl]}


def _f(v):
    return ('%.0f' % v) if v >= 10 else ('%.1f' % v).replace('.', ',')


# ------------------------------------------------------------------ Item aus der Zwischenablage (Strg+C / Strg+Alt+C im Spiel)

def _muster(x):
    """Mod-Vorlage → Regex: Zahlen-Platzhalter werden zu Zahlen (auch mit Bereich in Klammern)."""
    t = re.escape(x).replace(r'\+\#', r'\+?#').replace(r'\#', r'#')
    return re.compile('^' + t.replace('#', r'(-?\d+(?:\.\d+)?)(?:\(\d+(?:\.\d+)?-\d+(?:\.\d+)?\))?') + '$', re.I)


_ALLE = []


def alle_mods():
    """Alle Item-Mods aus den Spieldaten (auch Genesis-Baum, Abyss, Essenzen/Alloys, Corrupted, Implicits) – nur zum Erkennen."""
    if not _ALLE:
        for k, gt, q, nm, lv, grp, x, rng in json.load(open(os.path.join(BASE, 'ui', 'data', 'mods_poe2_alle.json'), encoding='utf-8')):
            erste = x.split('\n')[0]
            _ALLE.append((k, gt, q, nm, lv, grp, x, rng, _muster(erste)))
    return _ALLE


QUELLE_TXT = {'genesis': 'Genesis-Baum', 'desecrated': 'Abyss', 'essence': 'Essenz/Alloy', 'corrupted': 'Corrupted', 'implicit': 'Implicit', 'normal': ''}


def erkenne(zeile, seite=None, name=None):
    """Findet einen Mod in allen Spieldaten: bevorzugt passender Affix-Name, sonst passender Wertebereich."""
    best = None
    for k, gt, q, nm, lv, grp, x, rng, mu in alle_mods():
        if seite and gt in ('p', 's') and gt != seite:
            continue
        mm = mu.match(zeile)
        if not mm:
            continue
        wert = float(mm.group(1)) if mm.groups() and mm.group(1) else 0
        passt = not rng or rng[0][0] <= abs(wert) <= rng[0][1]
        punkte = (3 if name and nm == name else 0) + (2 if passt else 0) + (1 if q == 'normal' else 0)
        if not best or punkte > best[0]:
            best = (punkte, {'rid': k, 'seite': gt, 'q': q, 'stufe': nm, 'il': lv, 'f': grp or k})
    return best[1] if best else None


def item_lesen(txt):
    """Liest den kopierten Item-Text (englisch). Erkennt Basis, Seltenheit, Itemlevel und ordnet die Mods dem Pool zu
    (mit Strg+Alt+C sogar Prefix/Suffix, Stufe und Affix-Namen)."""
    d = daten()
    zeilen = [z.strip() for z in (txt or '').replace('\r', '').split('\n')]
    if not zeilen or not (zeilen[0].startswith('Item Class') or zeilen[0].startswith('Rarity')):
        return {'error': 'Kein Item in der Zwischenablage. Im Spiel mit der Maus über das Item und Strg+Alt+C drücken.'}
    rar = next((z.split(':', 1)[1].strip().lower() for z in zeilen if z.startswith('Rarity:')), 'normal')
    ilvl = next((int(re.findall(r'\d+', z)[0]) for z in zeilen if z.startswith('Item Level:')), 82)
    kopf = []
    for z in zeilen[1:]:
        if z.startswith('--------'):
            break
        if not z.startswith('Rarity:'):
            kopf.append(z)
    basis = None
    for z in kopf:
        for b in d['basen']:
            if b['n'].lower() in z.lower() and (not basis or len(b['n']) > len(basis['n'])):
                basis = b
    if not basis:
        return {'error': 'Die Basis „%s“ kenne ich nicht (nur Rüstung, Waffen, Schmuck).' % (kopf[-1] if kopf else '?')}
    K = d['kat'][basis['k']]
    P = mod_pool(K)
    alle = []
    for q, sp in P.items():
        for seite in ('p', 's'):
            for mid in sp.get(seite, []):
                m = d['mods'].get(mid)
                if m:
                    alle.append((mid, m, seite, q))
    for r in d['runen'].values():
        for seite in ('p', 's'):
            for mid in r[seite]:
                alle.append((mid, d['mods'][mid], seite, 'rune'))
    mods, unbekannt, kopfinfo, implicits, impl_block = [], [], None, [], False
    korrupt = any(z == 'Corrupted' for z in zeilen)
    for z in zeilen:
        h = re.match(r'^\{\s*(Fractured |Desecrated |Crafted |)(Prefix|Suffix) Modifier "([^"]+)"(?: \(Tier: (\d+)\))?', z)
        if h:
            kopfinfo = {'fx': h.group(1) == 'Fractured ', 'side': 'p' if h.group(2) == 'Prefix' else 's', 'name': h.group(3)}
            continue
        if z.startswith('{'):
            kopfinfo = None
            impl_block = 'Implicit Modifier' in z or 'Rune Modifier' in z or 'Enchant' in z
            continue
        if z.startswith('--------'):
            impl_block = False
        if not z or z.startswith('--------') or ':' in z.split(' ')[0] and not z[0] in '+-0123456789':
            continue
        roh = re.sub(r'\s*\((fractured|crafted|desecrated|implicit|enchant|rune)\)$', '', z, flags=re.I)
        markiert = re.findall(r'\((fractured|crafted|desecrated|implicit|enchant|rune)\)$', z, flags=re.I)
        if (markiert and markiert[0].lower() in ('implicit', 'enchant', 'rune')) or (impl_block and not kopfinfo):
            if roh and not roh.startswith('{'):
                implicits.append({'text': roh, 'art': (markiert[0].lower() if markiert else 'implicit')})
            continue
        treffer = None
        for mid, m, seite, q in alle:
            if kopfinfo and kopfinfo['side'] != seite:
                continue
            erste = m['x'].split('\n')[0]
            mm = _muster(erste).match(roh)
            if not mm:
                continue
            wert = float(mm.group(1)) if mm.groups() and mm.group(1) else 0
            tier = None
            if kopfinfo:
                tier = next((t for t in m['ti'] if t[0] == kopfinfo['name']), None)
            if not tier:
                for t in sorted(m['ti'], key=lambda t: t[1]):
                    if t[3] and t[3][0][0] <= abs(wert) <= t[3][0][1]:
                        tier = t
            if tier or not kopfinfo:
                treffer = (mid, m, seite, q, tier)
                if tier:
                    break
        if treffer:
            mid, m, seite, q, tier = treffer
            if any(x['id'] == mid for x in mods):
                kopfinfo = None
                continue   # zweite Zeile eines Hybrid-Mods
            fx = bool(kopfinfo and kopfinfo['fx']) or bool(markiert and markiert[0].lower() == 'fractured')
            qq = 'essence' if markiert and markiert[0].lower() == 'crafted' else ('desecrated' if markiert and markiert[0].lower() == 'desecrated' else q)
            mods.append({'id': mid, 'text': roh, 'seite': seite, 'il': tier[1] if tier else 0, 'stufe': tier[0] if tier else '', 'fx': fx, 'q': qq,
                         'stufen': len(m['ti']), 'rang': (sorted({t[1] for t in m['ti']}, reverse=True).index(tier[1]) + 1) if tier else None})
        else:
            e = erkenne(roh, kopfinfo['side'] if kopfinfo else None, kopfinfo['name'] if kopfinfo else None) if (kopfinfo or re.search(r'\d', roh)) else None
            if e and e['seite'] in ('p', 's', 'c'):
                fx = bool(kopfinfo and kopfinfo['fx']) or bool(markiert and markiert[0].lower() == 'fractured')
                q = 'desecrated' if markiert and markiert[0].lower() == 'desecrated' else ('essence' if markiert and markiert[0].lower() == 'crafted' and e['q'] == 'normal' else e['q'])
                if e['seite'] == 'c':
                    implicits.append({'text': roh, 'art': 'corrupted'})
                else:
                    mods.append({'id': 'X:' + e['rid'], 'f': e['f'], 'text': roh, 'seite': e['seite'], 'il': e['il'], 'stufe': e['stufe'], 'fx': fx, 'q': q,
                                 'quelle': QUELLE_TXT.get(q, ''), 'extern': True, 'stufen': None, 'rang': None})
            elif e and e['seite'] == 'i':
                implicits.append({'text': roh, 'art': 'implicit'})
            elif kopfinfo or re.match(r'^[+\-]?\d', roh):
                unbekannt.append(roh)
        kopfinfo = None
    return {'implicits': implicits, 'basis': basis['n'], 'ilvl': ilvl, 'rar': {'unique': 'unique'}.get(rar, rar if rar in ('normal', 'magic', 'rare') else 'normal'), 'mods': mods,
            'unbekannt': unbekannt, 'korrupt': korrupt, 'erweitert': any(z.startswith('{ ') for z in zeilen)}


def moeglichkeiten(info, wunsch_ids=(), preise=None):
    """Alles, was man mit genau diesem Item jetzt machen kann – mit Chancen, bezogen auf deine Wunsch-Mods."""
    d = daten()
    b = d['basis'].get(info['basis'].lower())
    K = d['kat'][b['k']]
    P = mod_pool(K)
    ilvl = info['ilvl']
    pr = preise or {}
    mods = info['mods']
    n = {'p': sum(1 for m in mods if m['seite'] == 'p'), 's': sum(1 for m in mods if m['seite'] == 's')}
    frei = {'p': 3 - n['p'], 's': 3 - n['s']}
    fam = {d['mods'][m['id']]['f'] if m['id'] in d['mods'] else m.get('f') for m in mods}
    wunsch = [w for w in wunsch_ids if w in d['mods']]
    out = []

    def p_ex(seiten, boden):
        """Chance, dass ein Exalted (mit Boden) einen der Wunsch-Mods bringt, und je Wunsch."""
        summe, treffer = 0.0, {}
        for seite in seiten:
            for mid in P.get('normal', {}).get(seite, []):
                m = d['mods'].get(mid)
                if not m or m['f'] in fam:
                    continue
                w = sum(t[2] for t in tiers_fuer(m, ilvl, boden))
                summe += w
                if mid in wunsch:
                    treffer[mid] = treffer.get(mid, 0) + w
        return {k: round(v / summe * 100, 2) for k, v in treffer.items()} if summe else {}

    def wtext(mid):
        m = d['mods'][mid]
        return text(m, max(m['ti'], key=lambda t: t[1]))
    hinweise = []
    if any(m.get('q') == 'genesis' for m in mods):
        hinweise.append({'t': 'Genesis-Baum-Mods', 'd': 'Mods wie „%s“ kommen nur aus dem Genesis-Baum (Breach, Wombgifts) – mit Orbs nicht neu würfelbar. Annulment/Chaos können sie entfernen, darum vorsichtig: lieber mit Omen auf der anderen Seite arbeiten oder vorher fracturen.' % next(m['text'] for m in mods if m.get('q') == 'genesis'), 'art': 'warn'})
    if info.get('korrupt'):
        return [{'t': 'Corrupted', 'd': 'Das Item ist corrupted – Orbs, Omen, Essenzen und Runen wirken nicht mehr. Nur noch Divine-ähnliche Wertänderungen sind tabu; das Item bleibt so.', 'art': 'warn'}]
    rar = info['rar']
    if rar == 'normal':
        out.append({'t': 'Orb of Transmutation / Greater / Perfect', 'd': 'Macht das Item magisch mit 1 Mod. Perfect: nur Mods ab Modlevel 70.', 'art': 'orb'})
        out.append({'t': 'Orb of Alchemy', 'd': 'Macht das Item direkt selten mit 4 Mods – Start für Chaos-Spam und Fracturing.', 'art': 'orb'})
        out.append({'t': 'Essenz', 'd': 'Lesser/Normal/Greater Essence machen ein MAGISCHES Item selten mit garantiertem Mod – erst Transmutation.', 'art': 'ess'})
    if rar == 'magic':
        if len(mods) < 2:
            ch = p_ex(('s' if n['p'] else 'p',), 0)
            out.append({'t': 'Orb of Augmentation', 'd': 'Fügt den 2. Mod auf der freien Seite hinzu.' + (' Chance auf Wunsch: ' + ', '.join('%s %s %%' % (wtext(k), v) for k, v in ch.items()) if ch else ''), 'art': 'orb'})
        ch = p_ex(tuple(s for s in ('p', 's') if frei[s] > 0), 0)
        out.append({'t': 'Regal Orb / Greater / Perfect', 'd': 'Macht das Item selten und fügt 1 Mod hinzu.' + (' Chance auf Wunsch: ' + ', '.join('%s %s %%' % (wtext(k), v) for k, v in ch.items()) if ch else ''), 'art': 'orb'})
        out.append({'t': 'Greater Essence', 'd': 'Macht das magische Item selten und setzt einen garantierten Mod (zählt als gecrafteter Mod).', 'art': 'ess'})
    if rar == 'rare':
        for boden, nm in ((0, 'Exalted Orb'), (35, 'Greater Exalted Orb'), (50, 'Perfect Exalted Orb')):
            if frei['p'] + frei['s'] <= 0:
                break
            ch = p_ex(tuple(s for s in ('p', 's') if frei[s] > 0), boden)
            chp = p_ex(('p',), boden) if frei['p'] > 0 else {}
            chs = p_ex(('s',), boden) if frei['s'] > 0 else {}
            teile = []
            for k in wunsch:
                if d['mods'][k]['f'] in fam:
                    continue
                seite = 'p' if any(k in sp.get('p', []) for sp in P.values()) else 's'
                mit = (chp if seite == 'p' else chs).get(k)
                teile.append('%s: %s %%%s' % (wtext(k), ch.get(k, 0), ' (mit %s-Omen %s %%)' % ('Sinistral' if seite == 'p' else 'Dextral', mit) if mit else ''))
            out.append({'t': nm, 'd': 'Fügt 1 Mod hinzu (frei: %d Prefix, %d Suffix).%s %s' % (frei['p'], frei['s'], ' Nur Mods ab Modlevel %d.' % boden if boden else '',
                        ('Chance auf deine Wünsche – ' + '; '.join(teile)) if teile else ''), 'art': 'ex', 'preis': pr.get(nm)})
        if frei['p'] + frei['s'] <= 0:
            out.append({'t': 'Item ist voll', 'd': '3 Prefixe und 3 Suffixe – erst etwas entfernen (Annulment/Chaos), dann wieder Exalted.', 'art': 'warn'})
        weg = [m for m in mods if not m['fx'] and m['q'] != 'desecrated']
        schlecht = [m for m in weg if m['id'] not in wunsch]
        if weg:
            out.append({'t': 'Orb of Annulment', 'd': 'Entfernt 1 zufälligen Mod (fraktierte sind geschützt): jeder hat %d %% Chance.%s' % (
                round(100 / len(weg)), (' Chance, einen unerwünschten zu treffen: %d %%.' % round(100 * len(schlecht) / len(weg))) if wunsch else ' Wähl unten deine Wunsch-Mods, dann rechnet der Berater, wie oft er einen unnützen trifft.'), 'art': 'an', 'preis': pr.get('Orb of Annulment')})
            for seite, om in (('p', 'Sinistral'), ('s', 'Dextral')):
                ws = [m for m in weg if m['seite'] == seite]
                if ws and wunsch:
                    sl = [m for m in ws if m['id'] not in wunsch and m.get('q') != 'genesis']
                    out.append({'t': 'Annulment + Omen of %s Annulment' % om, 'd': 'Nur %s: %d %% Chance, einen unerwünschten zu treffen%s.' % (
                        'Prefixe' if seite == 'p' else 'Suffixe', round(100 * len(sl) / len(ws)), ' – garantiert, weil dort nur unerwünschte sitzen' if len(sl) == len(ws) else ''), 'art': 'an'})
            tief = min(weg, key=lambda m: m['il'])
            out.append({'t': 'Chaos Orb + Omen of Whittling', 'd': 'Entfernt garantiert den Mod mit dem niedrigsten Level – hier „%s“ (Modlevel %d) – und würfelt einen neuen dazu.%s' % (
                tief['text'], tief['il'], ' Achtung: das ist einer deiner Wünsche!' if tief['id'] in wunsch else (' Achtung: das ist ein Genesis-Baum-Mod – den bekommst du mit Orbs nicht wieder!' if tief.get('q') == 'genesis' else '')), 'art': 'an', 'preis': pr.get('Omen of Whittling')})
            out.append({'t': 'Chaos Orb (+ Omen of Sinistral/Dextral Erasure)', 'd': 'Tauscht einen zufälligen Mod (mit Erasure-Omen nur auf einer Seite) gegen einen neuen.', 'art': 'an', 'preis': pr.get('Chaos Orb')})
        if len(mods) >= 4 and not any(m['fx'] for m in mods):
            gut = [m for m in mods if m['id'] in wunsch]
            out.append({'t': 'Fracturing Orb', 'd': 'Macht 1 von %d Mods dauerhaft: %d %% pro Mod.%s' % (len(mods), round(100 / len(mods)),
                        ' Deinen Wunsch-Mod „%s“ trifft er mit %d %%.' % (gut[0]['text'], round(100 / len(mods))) if gut else ' Lohnt sich erst, wenn dein wichtigster Wunsch drauf ist.'), 'art': 'div', 'preis': pr.get('Fracturing Orb')})
        if not any(m['q'] == 'essence' for m in mods):
            out.append({'t': 'Perfect Essence + Omen of Sinistral/Dextral Crystallisation', 'd': 'Tauscht einen Mod gegen einen festen Essenz-Mod; das Omen bestimmt die Seite. Sitzt auf der Seite nur EIN unerwünschter Mod, ist der Tausch garantiert.', 'art': 'ess'})
        if not any(m['q'] == 'desecrated' for m in mods):
            out.append({'t': 'Abyss-Knochen (Desecration)', 'd': 'Fügt einen versteckten Abyss-Mod hinzu, im Well of Souls aus 3 Vorschlägen wählen. Nur einer pro Item.', 'art': 'abyss'})
        out.append({'t': 'Recombinator', 'd': 'Zwei Items gleicher Art kombinieren und Mods von beiden behalten (etwa 50:50) – gut, wenn du zwei halbe Items hast.', 'art': 'orb'})
        out.append({'t': 'Divine Orb', 'd': 'Würfelt nur die Zahlen neu, wenn alle Mods passen.', 'art': 'div', 'preis': pr.get('Divine Orb')})
    out = hinweise + out
    out.append({'t': 'Vaal Orb', 'd': 'Ganz zum Schluss: Corruption – kann verbessern, verschlechtern oder nichts tun. Danach ist nichts mehr änderbar.', 'art': 'warn'})
    return out


def _score(w):
    return (w['dps'] + w['ehp'] * .6 + w.get('speed', 0) * .5) if w else None


KATALYST = {'life': "Flesh Catalyst", 'mana': "Neural Catalyst", 'defences': "Carapace Catalyst", 'physical': "Uul-Netol's Catalyst",
            'fire': "Xoph's Catalyst", 'cold': "Tul's Catalyst", 'lightning': "Esh's Catalyst", 'chaos': "Chayula's Catalyst",
            'attack': "Reaver Catalyst", 'caster': "Sibilant Catalyst", 'speed': "Skittering Catalyst", 'attribute': "Adaptive Catalyst",
            'minion': "Necrotic Catalyst"}
KAT_FAKTOR = 5.0   # wie stark Omen of Catalysing Exaltation die passenden Mods bevorzugt: nicht veröffentlicht – vorsichtige Schätzung
LICH = {'kurgal_mod': 'Omen of the Blackblooded', 'amanamu_mod': 'Omen of the Liege', 'ulaman_mod': 'Omen of the Sovereign'}
QUALI = {'Body_Armours': "Armourer's Scrap", 'Helmets': "Armourer's Scrap", 'Gloves': "Armourer's Scrap", 'Boots': "Armourer's Scrap",
         'Shields': "Armourer's Scrap", 'Bucklers': "Armourer's Scrap", 'Foci': "Arcanist's Etcher", 'Wands': "Arcanist's Etcher",
         'Staves': "Arcanist's Etcher", 'Sceptres': "Arcanist's Etcher"}


def verbessern(info, pool, preise=None):
    """Konkreter Weg für DEIN Item, angelehnt an Community-Guides: was bleibt, was weg muss, und mit welchen Orbs/Omen/Katalysatoren
    du die beste Chance auf die Mods bekommst, die deinem Build helfen – mit Chance, Versuchen, Kosten und Plan B."""
    if pool.get('error') or info.get('korrupt'):
        return {'mods': info.get('mods', []), 'schritte': [], 'urteil': 'Corrupted – hier lässt sich nichts mehr craften.' if info.get('korrupt') else pool.get('error')}
    pr = preise or {}
    d = daten()
    b = d['basis'][info['basis'].lower()]
    K = d['kat'][b['k']]
    schmuck = K['cat'] in ('Rings', 'Amulets', 'Belts')
    hat_wert = pool.get('buildWert') is True
    pm = {m['id']: m for m in pool['mods']}
    ilvl = info['ilvl']

    def ex(n):
        return pr.get(n) or 0

    def wert(m):
        return m.get('wert') or (pm.get(m['id']) or {}).get('wert')
    # ---------- 1) vorhandene Mods bewerten
    bewertet = []
    for m in info['mods']:
        sc = _score(wert(m))
        if m.get('fx'):
            u, g = 'fest', 'fraktiert – bleibt sicher drauf'
        elif m.get('q') == 'genesis' and (sc is None or sc > -0.2):
            u, g = 'behalten', 'Genesis-Baum-Mod – mit Orbs nicht wiederzubekommen'
        elif not hat_wert or sc is None:
            u, g = 'unklar', 'Path of Building kann den Nutzen nicht berechnen' if hat_wert else 'ohne aktives PoE2-Profil nicht bewertbar'
        elif sc >= .8:
            u, g = 'behalten', 'stärkt deinen Build (%s)' % _wtxt(wert(m))
        elif sc >= .25:
            u, g = 'ok', 'hilft etwas (%s) – ersetzen, wenn Besseres kommt' % _wtxt(wert(m))
        else:
            u, g = 'weg', 'bringt deinem Build nichts Messbares'
        bewertet.append(dict(m, text=re.sub(r'\(\d+(?:\.\d+)?-\d+(?:\.\d+)?\)', '', m['text']), urteil=u, grund=g, score=sc))
    bleibt = [m for m in bewertet if m['urteil'] != 'weg']
    weg = [m for m in bewertet if m['urteil'] == 'weg']
    fam = {m.get('f') or (d['mods'].get(m['id']) or {}).get('f') for m in bleibt}
    frei = {sd: 3 - sum(1 for m in bleibt if m['seite'] == sd) for sd in ('p', 's')}
    # ---------- 2) Ziele: beste neue Mods je Seite
    gut = sorted([m for m in pool['mods'] if m['quelle'] in ('normal', 'rune') and m.get('wert') and _score(m['wert']) >= .8 and m['familie'] not in fam],
                 key=lambda m: -_score(m['wert']))
    ziele = {sd: [m for m in gut if m['seite'] == sd][:5] for sd in ('p', 's')}
    beste = gut[:1]
    S, plan_b = [], []
    urteil = None
    if hat_wert and not gut and not any(m['urteil'] == 'behalten' for m in bewertet):
        urteil = 'Diese Basis passt nicht zu deinem Build: Path of Building findet hier keinen Mod, der dir messbar hilft. Craften lohnt sich nicht – besser eine andere Basis oder ein anderes Item für diesen Slot.'
    elif hat_wert and not gut:
        urteil = 'Die guten Mods sind schon drauf – mehr holt der Mod-Pool dieser Basis für deinen Build nicht heraus. Nur noch Werte verbessern (unten).'
    elif not hat_wert:
        urteil = 'Ohne aktives PoE2-Profil kann ich nicht sagen, was deinem Build hilft. Profil im Hub aktivieren – dann bekommst du hier den genauen Weg.'
    P = mod_pool(K)

    def chance(sd, ids, boden=0, tag=None, faktor=1.0):
        summe = treffer = 0.0
        for mid in P.get('normal', {}).get(sd, []):
            m = d['mods'].get(mid)
            if not m or m['f'] in fam:
                continue
            w = sum(t[2] for t in tiers_fuer(m, ilvl, boden)) * (faktor if tag and tag in m['tags'] else 1)
            summe += w
            if mid in ids:
                treffer += w
        return treffer / summe if summe else 0
    gecraftet = any(m.get('q') == 'essence' for m in bewertet)
    hat_aby = any(m.get('q') == 'desecrated' for m in bewertet)
    # ---------- 3) Platz schaffen (je Seite alle unnützen Mods – mit ehrlicher Chance, dass die guten drauf bleiben)
    if gut:
        for sd in ('p', 's'):
            w_sd = [m for m in weg if m['seite'] == sd]
            if not w_sd or not ziele[sd]:
                continue
            seite_mods = [m for m in bewertet if m['seite'] == sd and not m.get('fx')]
            gute = [m for m in seite_mods if m['urteil'] != 'weg']
            seite = 'Prefix' if sd == 'p' else 'Suffix'
            omen = 'Omen of %s Annulment' % ('Sinistral' if sd == 'p' else 'Dextral')
            tief = min([m for m in bewertet if not m.get('fx') and m.get('q') != 'desecrated'], key=lambda m: m['il'])
            # Überlebenschance der guten Mods, wenn alle unnützen per Annulment (nur diese Seite) runter sollen
            n, j, ueber = len(seite_mods), len(w_sd), 1.0
            for i in range(j):
                ueber *= (j - i) / (n - i)
            if len(w_sd) == 1 and tief['id'] == w_sd[0]['id']:
                S.append({'art': 'an', 'titel': 'Weg mit „%s“' % w_sd[0]['text'], 'wie': 'Chaos Orb + Omen of Whittling', 'chance': 100, 'versuche': 1,
                          'kosten': ex('Chaos Orb') + ex('Omen of Whittling'),
                          'warum': 'Whittling nimmt garantiert den Mod mit dem niedrigsten Modlevel – das ist genau dieser (Lv %d). Der Chaos Orb setzt sofort einen neuen zufälligen Mod dazu; passt der nicht, wie unten wieder entfernen.' % w_sd[0]['il']})
                continue
            schritt = {'art': 'an', 'titel': '%s unnütze%s %s entfernen' % ('Den' if j == 1 else 'Die %d' % j, '' if j == 1 else 'n', seite + ('' if j == 1 else 'e')),
                       'wie': 'Orb of Annulment + %s  (%d×)' % (omen, j), 'chance': round(100 * ueber), 'chanceText': 'gute Mods bleiben drauf',
                       'versuche': j, 'kosten': (ex('Orb of Annulment') + ex(omen)) * j, 'risiko': bool(gute),
                       'warum': 'Das Omen entfernt nur auf der %s-Seite. Dort sitzen %d Mods, davon %d unnütz: %s. %s' % (
                           seite, n, j, ', '.join('„%s“' % m['text'] for m in w_sd),
                           'Jedes Annulment trifft zufällig – mit %d %% bleiben deine guten Mods (%s) verschont.' % (round(100 * ueber), ', '.join('„%s“' % m['text'][:40] for m in gute)) if gute else 'Dort ist nichts Wertvolles, also kein Risiko.')}
            if gute and len(bewertet) >= 4:
                fx = gute[0]
                schritt['planB'] = 'Sicherer: vorher Fracturing Orb – macht einen von %d Mods dauerhaft (%d %% auf „%s“, kostet %s Ex). Lohnt sich, wenn der Mod mehr wert ist als der Orb.' % (
                    len(bewertet), round(100 / len(bewertet)), fx['text'][:45], _f(ex('Fracturing Orb')) if ex('Fracturing Orb') else '?')
            elif gute:
                schritt['planB'] = 'Sicherer: erst einen Mod auf der anderen Seite hinzufügen (dann hat das Item 4 Mods) und mit dem Fracturing Orb deinen besten Mod schützen – oder gleich ein Item kaufen, das ihn fraktiert hat.'
            S.append(schritt)
    # ---------- 4) Mods dazu – je Seite der stärkste Weg
    for sd in ('p', 's'):
        if not ziele[sd]:
            continue
        n_frei = 3 - sum(1 for m in bleibt if m['seite'] == sd)
        if n_frei <= 0:
            continue
        ids = {m['id'] for m in ziele[sd]}
        seite = 'Prefix' if sd == 'p' else 'Suffix'
        omen = 'Omen of %s Exaltation' % ('Sinistral' if sd == 'p' else 'Dextral')
        top = ziele[sd][0]
        wege = []
        # a) garantiert per Perfect Essenz (wenn es eine gibt und noch kein gecrafteter Mod drauf ist)
        if not gecraftet:
            for z in ziele[sd]:
                pe = [e for e in essenzen_fuer(b['k'], z['id']) if e['stufe'] == 'PERFECT']
                if pe:
                    seite_mods = [m for m in bewertet if m['seite'] == sd and not m.get('fx')]
                    p1 = 1.0 if not seite_mods else (sum(1 for m in seite_mods if m['urteil'] == 'weg') / len(seite_mods))
                    if p1 > 0:
                        cr = 'Omen of %s Crystallisation' % ('Sinistral' if sd == 'p' else 'Dextral')
                        wege.append({'art': 'ess', 'titel': '%s garantiert: „%s“' % (seite, z['text'].split('\n')[0]), 'wie': '%s + %s' % (pe[0]['name'], cr),
                                     'chance': round(100 * p1), 'versuche': round(1 / p1, 1), 'kosten': (ex(pe[0]['name']) + ex(cr)) / p1, 'ziele': [_z(z)],
                                     'warum': 'Die Perfect Essenz setzt genau diesen Mod und entfernt dafür einen anderen auf der %s-Seite (das Omen bestimmt die Seite). %s Zählt als dein einer gecrafteter Mod.' % (
                                         seite, 'Sitzt dort nur Unnützes, ist es sicher.' if p1 == 1 else 'Mit %d %% trifft es einen unnützen Mod.' % round(100 * p1)),
                                     'wert': _score(z['wert']) * p1})
                    break
        # b) Exalted + Seiten-Omen (+ Katalysatoren bei Schmuck, + Greater Exaltation bei 2 freien Plätzen)
        pch = chance(sd, ids)
        an_omen = 'Omen of %s Annulment' % ('Sinistral' if sd == 'p' else 'Dextral')
        er_omen = 'Omen of %s Erasure' % ('Sinistral' if sd == 'p' else 'Dextral')
        fehl = ex('Orb of Annulment') + ex(an_omen)            # einen Fehlversuch wieder entfernen
        andere_voll = sum(1 for m in bleibt if m['seite'] != sd) >= 3
        if pch > 0 and andere_voll and ex(er_omen) and ex('Chaos Orb'):
            versuche = 1 / pch
            wege.append({'art': 'ex', 'titel': 'Neuer %s – einer dieser Mods' % seite, 'wie': 'Chaos Orb + %s' % er_omen, 'chance': round(100 * pch, 1),
                         'versuche': round(versuche, 1), 'kosten': ex('Exalted Orb') + (ex('Chaos Orb') + ex(er_omen)) * versuche, 'ziele': [_z(m) for m in ziele[sd]],
                         'warum': 'Erst ein Exalted Orb – die andere Seite ist voll, also landet er garantiert als %s. Passt er nicht: Chaos Orb + %s tauscht nur einen %s aus und würfelt sofort neu. '
                                  'Jeder Versuch kostet nur einen Chaos Orb und ein Omen – viel billiger als Annulment + Omen.' % (seite, er_omen, seite),
                         'wert': _score(top['wert']) * pch * 1.05})
        if pch > 0:
            versuche = 1 / pch
            wege.append({'art': 'ex', 'titel': 'Neuer %s – einer dieser Mods' % seite, 'wie': 'Exalted Orb + %s' % omen, 'chance': round(100 * pch, 1),
                         'versuche': round(versuche, 1), 'kosten': (ex('Exalted Orb') + ex(omen)) * versuche + (versuche - 1) * fehl, 'ziele': [_z(m) for m in ziele[sd]],
                         'warum': 'Das Omen setzt den neuen Mod sicher als %s. Kommt etwas Unnützes: mit Annulment + Omen der Seite wieder runter (oder Chaos + Whittling, wenn es den niedrigsten Modlevel hat) und nochmal.' % seite,
                         'wert': _score(top['wert']) * pch})
            if n_frei >= 2:
                p2 = 1 - (1 - pch) ** 2
                g = 'Omen of Greater Exaltation'
                wege.append({'art': 'ex', 'titel': 'Zwei %se auf einmal' % seite, 'wie': 'Exalted Orb + %s + %s' % (omen, g), 'chance': round(100 * p2, 1),
                             'versuche': round(1 / p2, 1), 'kosten': (ex('Exalted Orb') + ex(omen) + ex(g)) / p2 + (1 / p2 - 1) * fehl * 2, 'ziele': [_z(m) for m in ziele[sd]],
                             'warum': 'Greater Exaltation fügt zwei Mods hinzu, das Omen hält beide auf der %s-Seite – doppelte Chance pro Versuch.' % seite,
                             'wert': _score(top['wert']) * p2})
            if schmuck:
                tags = collections.Counter(t for m in ziele[sd] for t in m['tags'] if t in KATALYST)
                if tags:
                    tag = max(tags, key=lambda t: sum(_score(m['wert']) for m in ziele[sd] if t in m['tags']))
                    kz = [m for m in ziele[sd] if tag in m['tags']]
                    pk = chance(sd, {m['id'] for m in kz}, 0, tag, KAT_FAKTOR)
                    kat = KATALYST[tag]
                    wege.append({'art': 'ex', 'titel': 'Neuer %s mit Katalysator-Bonus (%s)' % (seite, tag), 'wie': '20 × %s (20 %% Qualität) + Omen of Catalysing Exaltation + %s + Exalted Orb' % (kat, omen),
                                 'chance': round(100 * pk, 1), 'versuche': round(1 / pk, 1) if pk else None, 'geschaetzt': True,
                                 'kosten': ((ex(kat) * 20 + ex('Omen of Catalysing Exaltation') + ex(omen) + ex('Exalted Orb')) / pk + (1 / pk - 1) * fehl) if pk else 0, 'ziele': [_z(m) for m in kz],
                                 'warum': 'Ring/Amulett erst mit %s auf 20 %% Qualität bringen, dann verbraucht das Catalysing-Omen die Qualität und macht %s-Mods beim nächsten Exalted deutlich wahrscheinlicher (laut Community etwa 5× – nicht offiziell, Chance geschätzt). So machen es viele Ring-Guides.' % (kat, tag),
                                 'wert': _score(kz[0]['wert']) * pk})
        if wege:
            # bester Weg: höchster erwarteter Nutzen pro Kosten, bei fehlenden Preisen höchste Chance
            for w in wege:
                w['eff'] = (w['wert'] / w['kosten']) if w.get('kosten') else w['wert']
            wege.sort(key=lambda w: -w['eff'])
            haupt = wege[0]
            haupt['alternativen'] = [{'wie': w['wie'], 'chance': w['chance'], 'kosten': w.get('kosten'), 'geschaetzt': w.get('geschaetzt')} for w in wege[1:]]
            S.append(haupt)
    # ---------- 5) Abyss (Desecration) gezielt
    if gut and not hat_aby:
        aby = sorted([m for m in pool['mods'] if m['quelle'] == 'desecrated' and m.get('wert') and _score(m['wert']) >= .8 and m['familie'] not in fam], key=lambda m: -_score(m['wert']))
        if aby:
            a = aby[0]
            kn = 'Preserved %s' % KNOCHEN.get(K['cat'], 'Rib')
            lich = next((LICH[t] for t in a['tags'] if t in LICH), None) if K['cat'] in ('Rings', 'Amulets', 'Belts', 'Wands', 'Staves', 'Bows', 'Crossbows', 'Quarterstaves', 'Spears', 'OneHand_Maces', 'TwoHand_Maces', 'Sceptres') else None
            p3 = (a.get('chanceEcho') or a.get('chanceOmen') or 0) / 100
            if lich:
                p3 = min(.95, p3 * 2.2)   # Lich-Omen schränkt auf eine Gruppe ein – grob verdoppelt die Chance
            omen = 'Omen of %s Necromancy' % ('Sinistral' if a['seite'] == 'p' else 'Dextral')
            teile = [kn, omen, 'Omen of Abyssal Echoes'] + ([lich] if lich else [])
            S.append({'art': 'abyss', 'titel': 'Abyss-Mod: „%s“' % a['text'].split('\n')[0], 'wie': ' + '.join(teile), 'chance': round(100 * p3, 1) if p3 else None,
                      'versuche': round(1 / p3, 1) if p3 else None, 'kosten': (sum(ex(t) for t in teile) / p3) if p3 else 0, 'ziele': [_z(x) for x in aby[:3]], 'geschaetzt': bool(lich),
                      'warum': 'Knochen aufs Item, im Well of Souls aus 3 Vorschlägen wählen. %s legt die Seite fest, Echoes würfelt die Vorschläge einmal neu%s. Ist er Müll: Orb of Annulment + Omen of Light entfernt NUR den Abyss-Mod, dann nochmal.' % (
                          omen, ', %s beschränkt auf die passende Lich-Gruppe' % lich if lich else '')})
    # ---------- 6) Fertig machen – besser als nur Divine
    if gut or any(m['urteil'] == 'behalten' for m in bewertet):
        if schmuck:
            tags = collections.Counter(t for m in bewertet if m['urteil'] in ('behalten', 'fest') for t in (pm.get(m['id']) or {}).get('tags', []) if t in KATALYST)
            for z in gut[:3]:
                for t in z['tags']:
                    if t in KATALYST:
                        tags[t] += 1
            if tags:
                t = tags.most_common(1)[0][0]
                S.append({'art': 'div', 'titel': 'Werte um bis zu 20 % erhöhen', 'wie': '20 × %s (Qualität 20 %%)' % KATALYST[t], 'kosten': ex(KATALYST[t]) * 20,
                          'warum': 'Ganz zum Schluss: Katalysator-Qualität verstärkt alle %s-Mods auf Ringen/Amuletten – das ist billiger und sicherer als Divine. Erst NACH dem letzten Catalysing-Omen machen (das Omen verbraucht die Qualität).' % t})
        elif K['cat'] in QUALI:
            S.append({'art': 'div', 'titel': 'Qualität auf 20 %', 'wie': '%s bis 20 %%' % QUALI[K['cat']], 'kosten': ex(QUALI[K['cat']]) * 4,
                      'warum': 'Mehr Verteidigung bzw. Wirkung ohne Risiko – immer zuerst.'})
        S.append({'art': 'div', 'titel': 'Werte neu würfeln, wenn sie niedrig sind', 'wie': 'Divine Orb  ·  oder: Omen of Sanctification + Divine Orb', 'kosten': ex('Divine Orb'),
                  'warum': 'Divine würfelt nur die Zahlen neu – lohnt sich bei Mods weit unter ihrem Höchstwert. Mit Sanctification werden alle Werte auf 80–120 % gesetzt, danach ist das Item aber gesperrt (nur am Ende, nur wenn du mit dem Item fertig bist).'})
    summe = sum(x.get('kosten') or 0 for x in S if x['art'] in ('an', 'ex', 'ess', 'abyss'))
    return {'mods': bewertet, 'schritte': S, 'summe': round(summe, 1), 'buildWert': hat_wert, 'urteil': urteil, 'frei': frei,
            'ziele': {sd: [_z(m) for m in ziele[sd]] for sd in ('p', 's')}}


def _z(m):
    return {'text': m['text'], 'wert': m.get('wert'), 'tags': m.get('tags', [])}


def _wtxt(w):
    t = []
    if w and abs(w.get('dps', 0)) >= .1:
        t.append('%+.1f %% DPS' % w['dps'])
    if w and abs(w.get('ehp', 0)) >= .1:
        t.append('%+.1f %% eHP' % w['ehp'])
    return ', '.join(t).replace('.', ',') or 'kleiner Effekt'


# ---------------------------------------------------------------------------------------------
# ---------------------------------------------------------------------------------------------
# Community-Rezept (Patch 0.5): fester Ablauf wie in Craft of Exile / Reddit-Guides / Crafting-Codex – mit Entscheidungsbaum.
# Regeln 0.5: höchstens 1 gecrafteter Mod (Essenz/Alloy) + 1 desecrated Mod; Fracturing braucht 4+ Mods und trifft 1/n;
# Whittling = Mod mit dem niedrigsten Modlevel; Catalysing Exaltation ≈ 5× Gewicht für passende Tags bei 20 % Qualität;
# Sanctify multipliziert die Werte (78–122 %) → vorher Divine; Recombinator ist in 0.5 abgeschaltet.
# Alle Zahlen analytisch aus den Spawn-Gewichten: im Schnitt, „meist“ (Median) und „bei Pech“ (9 von 10 schaffen es bis dahin).

def _geo(p):
    """Versuche bis zum ersten Treffer bei Chance p: Schnitt, Median, 90 %."""
    if p <= 0:
        return None
    if p >= 1:
        return 1, 1, 1
    return 1 / p, max(1, math.ceil(math.log(.5) / math.log(1 - p))), max(1, math.ceil(math.log(.1) / math.log(1 - p)))


SEITE = {'p': 'Prefix', 's': 'Suffix'}
SEITEN = {'p': 'Prefixe', 's': 'Suffixe'}
OM = {'p': 'Sinistral', 's': 'Dextral'}
ANDERE = {'p': 's', 's': 'p'}
KAT_BOOST = 5.0     # Omen of Catalysing Exaltation bei 20 % Katalysator-Qualität (Community-Messung, nicht offiziell)


def rezept(name_, ilvl, wunsch, preise=None, _frac=None, stufe='normal'):
    """Rechnet den Weg einmal mit und einmal ohne Fracturing des Schlüssel-Mods und nimmt den günstigeren."""
    if _frac is None:
        a = _rezept(name_, ilvl, wunsch, preise, False, stufe)
        if a.get('error'):
            return a
        b = _rezept(name_, ilvl, wunsch, preise, True, stufe)
        if b.get('error') or not b.get('fraktiert'):
            return a
        best, other = (b, a) if b['summe'] < a['summe'] else (a, b)
        if other['summe'] and best['summe']:
            best['vergleich'] = {'mit': b['summe'], 'ohne': a['summe']}
        return best
    return _rezept(name_, ilvl, wunsch, preise, _frac, stufe)


def _rezept(name_, ilvl, wunsch, preise=None, mit_frac=False, stufe='normal'):
    d = daten()
    b = d['basis'].get((name_ or '').lower())
    if not b:
        return {'error': 'Basis nicht gefunden.'}
    K = d['kat'][b['k']]
    P = mod_pool(K)
    pr = preise or {}
    ex = lambda n: pr.get(n) or 0
    fam = lambda mid: (d['mods'].get(mid) or {}).get('f') or mid
    cat = K['cat']
    schmuck = cat in ('Rings', 'Amulets')
    juwel = cat == 'Jewels'
    cap = 2 if juwel else 3
    # Orb-Stufe aus der Auswahl oben („Chancen für“): Normal = günstigste Wahl, Greater/Perfect = nur diese Stufen
    def ORBS(art):
        alle = (('%s Orb' % art, 0), ('Greater %s Orb' % art, 35), ('Perfect %s Orb' % art, 50))
        return {'greater': alle[1:], 'perfect': alle[2:]}.get(stufe, alle)

    def anteil(mid, minil, seiten, boden=0, ohne=(), boost=None):
        tot = hit = 0.0
        for sd in seiten:
            for x in P.get('normal', {}).get(sd, []):
                m = d['mods'].get(x)
                if not m or fam(x) in ohne:
                    continue
                f = KAT_BOOST if boost and boost in (m.get('tags') or []) else 1
                for t in tiers_fuer(m, ilvl, boden):
                    tot += t[2] * f
                    if x == mid and t[1] >= minil:
                        hit += t[2] * f
        return hit / tot if tot else 0

    # ---- Wünsche einordnen
    W = []
    for w in wunsch:
        mid = w.get('id')
        m = d['mods'].get(mid)
        if not m:
            continue
        q = next((qq for qq, sp in P.items() if mid in sp.get('p', []) + sp.get('s', [])), None)
        if not q:
            continue
        sd = 'p' if mid in P[q].get('p', []) else 's'
        top = max([t for t in m['ti'] if t[1] <= ilvl] or m['ti'], key=lambda t: t[1]) if m['ti'] else None
        W.append({'id': mid, 'q': q, 'sd': sd, 'min': int(w.get('minIl') or 0), 'm': m,
                  'text': (text(m, top) if top else m['x']).split('\n')[0]})
    if not W:
        return {'error': 'Bitte mindestens einen Wunsch-Mod wählen.'}
    abyss = [w for w in W if w['q'] == 'desecrated'][:1]
    norm = [w for w in W if w['q'] in ('normal', 'essence', 'perfect_essence')]
    hinweise = []
    if len([w for w in W if w['q'] == 'desecrated']) > 1:
        hinweise.append('In 0.5 kann ein Item nur EINEN desecrated (Abyss-)Mod haben – es wird nur der erste geplant.')
    bedarf = {sd: sum(1 for w in norm + abyss if w['sd'] == sd) for sd in 'ps'}
    for sd in 'ps':
        if bedarf[sd] > cap:
            hinweise.append('Zu viele Wünsche als %s: %d, aber nur %d Plätze. Einen davon abwählen.' % (SEITE[sd], bedarf[sd], cap))

    # Essenz: höchstens eine (gecrafteter Slot). Perfect arbeitet auf seltenen Items (Tausch), Greater nur am Anfang auf magischen.
    for w in norm:
        w['ess'] = None
        w['p'] = anteil(w['id'], w['min'], ('p', 's'))
        w['pSeite'] = anteil(w['id'], w['min'], (w['sd'],))
        for e in essenzen_fuer(b['k'], w['id']):
            ids = [x for sd in ('p', 's') for qq in ('essence', 'perfect_essence') for x in P.get(qq, {}).get(sd, [])
                   if fam(x) == fam(w['id']) or (d['mods'].get(x) or {}).get('x') == w['m']['x']]
            il = max([t[1] for x in ids for t in (d['mods'].get(x) or {}).get('ti', [])] or [0])
            if il >= w['min'] or w['q'] != 'normal':
                w['ess'] = e          # Liste ist aufsteigend sortiert (Lesser → Perfect): die stärkste passende gewinnt
    kandE = [w for w in norm if w['ess']]
    ess = (sorted([w for w in kandE if w['q'] != 'normal'], key=lambda w: w['p']) or sorted(kandE, key=lambda w: w['p']))[:1]
    ess = ess[0] if ess else None
    perf_ess = bool(ess and ess['ess']['stufe'] == 'PERFECT')
    rest_norm = [w for w in norm if w is not ess and w['p'] > 0]
    key = min(rest_norm, key=lambda w: w['p']) if rest_norm else None
    for w in norm:
        if w is not ess and w['p'] <= 0:
            hinweise.append('„%s“ kann auf %s mit Itemlevel %d nicht in dieser Stufe kommen – Itemlevel erhöhen oder Stufe senken.' % (w['text'], b['n'], ilvl))

    S, summe = [], 0.0
    zust = {'p': [], 's': []}       # Zustand des Items nach jedem Schritt (für die Platz-Grafik)

    def bild():
        return {sd: [dict(x) for x in zust[sd]] + [{'k': 'frei'}] * (cap - len(zust[sd])) for sd in 'ps'}

    def schritt(**k):
        k.setdefault('wenn', [])
        k['slots'] = bild()
        S.append(k)

    # 1) Basis
    il_noetig = max([w['min'] for w in W] + [1])
    schritt(art='base', titel='Basis besorgen: %s, Itemlevel %d+' % (b['n'], max(il_noetig, min(ilvl, 82))), wie=b['n'], chance=None,
            warum='Weiß (Normal), nicht corrupted. Das Itemlevel entscheidet, welche Stufen überhaupt rollen können – für die Top-Stufen meist 81–82. '
                  'Kauf am besten gleich 2–3 Basen: Wenn ein Fracturing schiefgeht, machst du ohne Wartezeit weiter.',
            wenn=[{'fall': 'Basis mit deinem Schlüssel-Mod schon fraktiert auf Trade?', 'dann': 'Oft günstiger als selbst craften – dann direkt bei „Müll entfernen“ einsteigen.', 'ok': True}] if key else [])

    fest = False
    if ess and not perf_ess:
        # Start über Greater Essence (magisch → selten mit garantiertem Mod)
        en = ess['ess']['name']
        schritt(art='start', titel='Magisch machen', wie='Orb of Transmutation', chance=100, versuche=1, kosten=ex('Orb of Transmutation'),
                warum='Greater Essenzen wirken nur auf magische Items. Transmutation macht die weiße Basis magisch (1 Mod).')
        ess['text'] = ess['ess'].get('text') or ess['text']
        zust[ess['sd']].append({'k': 'ess', 't': ess['text']})
        zust[ANDERE[ess['sd']]].append({'k': 'muell', 't': 'zufälliger Mod'})
        schritt(art='ess', titel='Selten machen mit garantiertem „%s“' % ess['text'], wie=en, chance=100, versuche=1, kosten=ex(en),
                warum='Die Essenz macht das magische Item selten und setzt ihren Mod garantiert. Das ist dein einer gecrafteter Mod (0.5: nur einer pro Item).',
                ziele=[{'text': ess['text']}])
        summe += ex('Orb of Transmutation') + ex(en)
    else:
        zust['p'] = [{'k': 'muell', 't': '?'}, {'k': 'muell', 't': '?'}]
        zust['s'] = [{'k': 'muell', 't': '?'}, {'k': 'muell', 't': '?'}]
        schritt(art='start', titel='Selten machen: 4 Mods', wie='Orb of Alchemy', chance=100, versuche=1, kosten=ex('Orb of Alchemy'),
                warum='Alchemy macht die weiße Basis direkt selten. Mit 4 Mods kannst du später fracturen, und jeder Chaos Orb tauscht genau einen davon.' if not juwel else
                'Alchemy macht das Juwel direkt selten mit 4 Mods – bei Juwelen ist es damit voll (höchstens 2 Prefixe und 2 Suffixe). Jeder Chaos Orb tauscht einen davon.')
        summe += ex('Orb of Alchemy')

    # 2) Schlüssel-Mod
    if key:
        om = OM[key['sd']]
        kand = []
        ess_start = bool(ess and not perf_ess)
        neustart = ex(b['n']) + ex('Orb of Transmutation') + (ex(ess['ess']['name']) if ess_start else 0)
        n_jetzt = max(1, sum(len(zust[q]) for q in 'ps'))
        for orb, boden in ORBS('Chaos'):
            if ess_start:
                break      # Chaos ohne Omen würde den Essenz-Mod mitwürfeln – darum hier nur gezielte Wege
            zz = _geo(anteil(key['id'], key['min'], ('p', 's'), boden))
            if zz and ex(orb):
                kand.append((zz[0] * ex(orb), 'chaos', orb, zz, boden))
        for orb, boden in ORBS('Exalted'):
            zz = _geo(anteil(key['id'], key['min'], (key['sd'],), boden))
            proV = ex(orb) + ex('Omen of %s Exaltation' % om) + ex('Orb of Annulment') + ex('Omen of %s Annulment' % om)
            if zz and ex(orb):
                kand.append((zz[0] * proV, 'exalt', orb, zz, boden))
        # Erasure-Weg: andere Seite mit beliebigen Mods füllen, dann Chaos + Erasure-Omen nur auf der Schlüssel-Seite
        oth = ANDERE[key['sd']]
        om_er = 'Omen of %s Erasure' % om
        fill_n = cap - len(zust[oth])
        gut_ks = sum(1 for x in zust[key['sd']] if x['k'] in ('ess', 'gut'))
        if ex(om_er) and fill_n >= 0 and not (ess_start and ess['sd'] == key['sd']):
            fill_c = fill_n * (ex('Exalted Orb') + ex('Omen of %s Exaltation' % OM[oth]))
            for orb, boden in ORBS('Chaos'):
                zz = _geo(anteil(key['id'], key['min'], (key['sd'],), boden))
                if zz and ex(orb):
                    kand.append((fill_c + zz[0] * (ex(orb) + ex(om_er)) * (1 + gut_ks), 'erasure', orb, zz, boden))
        if not kand:
            zz = _geo(key['p']) or (1, 1, 1)
            kand.append((0, 'chaos', 'Chaos Orb', zz, 0))
        kand.sort(key=lambda k: k[0])
        kc, art, orb, z, boden = kand[0]
        if art == 'erasure':
            fill_txt = ('%s-Seite mit %d× Exalted Orb + Omen of %s Exaltation auffüllen, dann ' % (SEITE[oth], fill_n, OM[oth])) if fill_n else ''
            for _ in range(fill_n):
                zust[oth].append({'k': 'muell', 't': 'Füller'})
        alt = [{'wie': (k[2] if k[1] == 'chaos' else '%s + %s' % (k[2], om_er) if k[1] == 'erasure' else '%s + Omen of %s Exaltation (Fehlversuch: Annulment + Omen of %s Annulment)' % (k[2], om, om)),
                'chance': round(100 / k[3][0], 2), 'kosten': k[0]} for k in kand[1:4]]
        kt = key['text']
        # Zustand: Schlüssel liegt jetzt auf seiner Seite
        seite = zust[key['sd']]
        if seite and seite[0]['k'] == 'muell':
            seite[0] = {'k': 'key', 't': kt}
        else:
            seite.append({'k': 'key', 't': kt})
        if art == 'chaos':
            schritt(art='chaos', titel='Chaos Orb, bis „%s“ drauf ist' % kt, wie=orb, chance=round(100 / z[0], 2), versuche=round(z[0]), meist=z[1], pech=z[2],
                    kosten=kc, ziele=[{'text': key['text']}], alternativen=alt,
                    warum='Das ist der seltenste deiner Wünsche (Schlüssel-Mod) – darum zuerst, solange das Item noch nichts wert ist. Jeder Chaos Orb entfernt einen zufälligen Mod und würfelt sofort einen neuen. '
                          'Auf alle anderen Mods achtest du hier noch nicht.%s%s' % (' %s lässt nur Mods ab Modlevel %d zu – hier billiger pro Treffer.' % (orb, boden) if boden else '',
                                                                                     ' Trifft der Chaos Orb deinen Essenz-Mod, machst du den billigen Essenz-Start mit einer neuen Basis einfach nochmal – das ist eingerechnet.' if ess_start else ''),
                    wenn=[{'fall': 'Schlüssel-Mod ist da', 'dann': 'Sofort aufhören und zum nächsten Schritt.', 'ok': True},
                          {'fall': 'Er kommt einfach nicht (Pech-Grenze erreicht)', 'dann': 'Weiterwerfen – jeder Wurf hat dieselbe Chance, das Item geht nicht kaputt. Oder eine Basis mit dem Mod fraktiert kaufen.', 'ok': False}])
        elif art == 'erasure':
            schritt(art='chaos', titel='„%s“ gezielt als %s holen' % (kt, SEITE[key['sd']]), wie='%s + %s' % (orb, om_er), chance=round(100 / z[0], 2),
                    versuche=round(z[0]), meist=z[1], pech=z[2], kosten=kc, ziele=[{'text': key['text']}], alternativen=alt,
                    warum=('Isolation mit Erasure: %sjeder %s + %s tauscht nur einen %s aus. Weil die andere Seite voll ist, landet der neue Mod immer als %s – '
                           'so spielt nur der %s-Pool mit, und jeder Versuch kostet nur einen Chaos Orb und ein Omen (Annulment-Omen sind gerade sehr teuer).%s') % (
                        fill_txt, orb, om_er, SEITE[key['sd']], SEITE[key['sd']], SEITE[key['sd']], ' %s würfelt erst ab Modlevel %d.' % (orb, boden) if boden else ''),
                    wenn=[{'fall': 'Schlüssel-Mod ist da', 'dann': 'Sofort aufhören und zum nächsten Schritt.', 'ok': True},
                          {'fall': 'Falscher Mod', 'dann': 'Einfach den nächsten %s + %s.%s' % (orb, om_er, ' Achtung: auf dieser Seite sitzt auch deine Essenz – sie kann mit getauscht werden.' if gut_ks else ''), 'ok': False}])
        else:
            schritt(art='chaos', titel='„%s“ gezielt als %s holen' % (kt, SEITE[key['sd']]), wie='%s + Omen of %s Exaltation' % (orb, om), chance=round(100 / z[0], 2),
                    versuche=round(z[0]), meist=z[1], pech=z[2], kosten=kc, ziele=[{'text': key['text']}], alternativen=alt,
                    warum='Isolation: Erst mit Orb of Annulment + Omen of %s Annulment einen %s entfernen, dann %s + Omen of %s Exaltation – der neue Mod landet garantiert als %s. '
                          'Hier billiger als Chaos-Spam, weil nur die %s mitspielen%s.' % (om, SEITE[key['sd']], orb, om, SEITE[key['sd']], SEITEN[key['sd']],
                                                                                      ' und %s erst ab Modlevel %d würfelt' % (orb, boden) if boden else ''),
                    wenn=[{'fall': 'Schlüssel-Mod ist da', 'dann': 'Weiter zum nächsten Schritt.', 'ok': True},
                          {'fall': 'Falscher Mod', 'dann': 'Orb of Annulment + Omen of %s Annulment entfernt wieder einen %s, dann nochmal Exalted + Omen.%s' % (
                              om, SEITE[key['sd']], ' Achtung: auf dieser Seite sitzt auch deine Essenz – sie kann mit getroffen werden.' if ess and ess['sd'] == key['sd'] else ''), 'ok': False}])
        summe += kc

        # 3) Schlüssel-Mod sichern? Er ist in Gefahr, sobald auf SEINER Seite später noch annulliert oder eine Perfect Essenz getauscht wird.
        ks = key['sd']
        andere_ks = [w for w in norm + abyss if w['sd'] == ks and w is not key and w is not ess and w['q'] != 'desecrated']
        verlust = 0.0
        for w in andere_ks:
            zz = _geo(anteil(w['id'], w['min'], (ks,)))
            if zz:
                verlust += (zz[0] - 1) / 2        # jedes Annulment auf dieser Seite trifft grob jeden 2. Mal den Schlüssel
        muell_key = sum(1 for x in zust[ks] if x['k'] == 'muell')
        frei_key = cap - len(zust[ks])
        if bedarf[ks] - 1 > frei_key:
            verlust += muell_key / 2               # Müll neben dem Schlüssel muss weg
        if ess and perf_ess and ess['sd'] == ks:
            verlust += .5                          # Perfect Essenz tauscht zufällig zwischen Platzhalter und Schlüssel
        if ess and not perf_ess and ess['sd'] == ks:
            verlust += 0                           # Essenz-Mod sitzt schon, Schlüssel kam danach – gleiche Logik wie oben
        if verlust > 0 or mit_frac:
            frac = ex('Fracturing Orb')
            n_mods = sum(len(zust[sd]) for sd in 'ps')
            auffuellen = max(0, 4 - n_mods)
            p_frac = 1 / max(4, n_mods)
            kosten_neu = ex(b['n']) + ex('Orb of Alchemy') + kc
            weg_risiko = verlust * kc
            geht_trotzdem = {sd: bedarf[sd] <= cap - 1 for sd in 'ps'}
            # Ausgänge eines Fracturing-Versuchs: Schlüssel fest / Müll auf einer Seite fest, auf der noch Platz bleibt (weiter ohne Schutz) / Neuanfang
            n_ges = max(4, n_mods + auffuellen)
            muell_seite = {q: sum(1 for x in zust[q] if x['k'] == 'muell') + (auffuellen if q == min('ps', key=lambda r: len(zust[r])) else 0) for q in 'ps'}
            gute_frac = sum(1 for q in 'ps' for x in zust[q] if x['k'] in ('ess', 'gut'))   # trifft er einen guten Mod: auch gut, weiter
            q_weiter = (sum(muell_seite[q] for q in 'ps' if geht_trotzdem[q]) + gute_frac) / n_ges
            q_neu = max(0.0, 1 - p_frac - q_weiter)
            weg_frac = (frac + q_neu * kosten_neu + q_weiter * weg_risiko) / max(.01, 1 - q_neu) + auffuellen * ex('Exalted Orb')
            if frac and mit_frac:
                fest = True
                for _ in range(auffuellen):
                    sd2 = min('ps', key=lambda q: len(zust[q]))
                    zust[sd2].append({'k': 'muell', 't': 'zufälliger Mod'})
                for x in zust[ks]:
                    if x['k'] == 'key':
                        x['k'] = 'frac'
                schritt(art='frac', titel='Schlüssel-Mod fracturen' + (' (vorher mit %d× Exalted Orb auf 4 Mods auffüllen)' % auffuellen if auffuellen else ''), wie='Fracturing Orb',
                        chance=round(100 * p_frac), versuche=round(1 / p_frac), kosten=weg_frac,
                        warum=(('Auf der %s-Seite wird später noch annulliert bzw. getauscht – dabei könnte dein Schlüssel-Mod verloren gehen (erwartet %.1f× neu holen, ≈ %s Ex). ' % (SEITE[ks], verlust, round(weg_risiko)))
                               if verlust > 0 else 'Ist der Schlüssel-Mod fraktiert, reicht später bei Fehlversuchen oft ein normaler Orb of Annulment statt teurer Seiten-Omen – das spart insgesamt mehr, als der Fracturing Orb kostet. ') +
                              'Der Fracturing Orb macht einen von %d Mods dauerhaft: Annulment, Chaos und Essenzen können ihn danach nicht mehr entfernen. Auf genau 4 Mods gehen – je weniger Mods, desto höher die Chance.' % max(4, n_mods),
                        alternativen=[{'wie': 'Ohne Fracturing weiterbauen und den Schlüssel-Mod bei Verlust neu holen', 'chance': None, 'kosten': weg_risiko}],
                        wenn=[{'fall': 'Schlüssel-Mod fraktiert (%d %%)' % round(100 * p_frac), 'dann': 'Perfekt – weiter mit dem nächsten Schritt, ab jetzt ohne Risiko.', 'ok': True},
                              {'fall': 'Ein Müll-Mod als %s fraktiert' % SEITE[ks],
                               'dann': ('Weiterbauen geht: Auf dieser Seite bleiben genug Plätze. Der Schlüssel-Mod ist dann aber ungeschützt – bei Verlust neu holen.'
                                        if geht_trotzdem[ks] else 'Die Seite ist jetzt dauerhaft zu voll für deine Wünsche. Item verkaufen (fraktierte Basen haben oft Wert) und mit neuer Basis von vorn.'), 'ok': geht_trotzdem[ks]},
                              {'fall': 'Ein Müll-Mod als %s fraktiert' % SEITE[ANDERE[ks]],
                               'dann': ('Weiterbauen geht: Dort brauchst du nur %d von %d Plätzen. Den Schlüssel-Mod schützt du, indem du Müll neben ihm mit Chaos + Omen of Whittling entfernst, wenn der Müll das niedrigste Modlevel hat.' % (bedarf[ANDERE[ks]], cap)
                                        if geht_trotzdem[ANDERE[ks]] else 'Dort fehlt dir jetzt ein Platz – Item verkaufen und mit neuer Basis von vorn, oder eine fraktierte Basis kaufen.'), 'ok': geht_trotzdem[ANDERE[ks]]},
                              {'fall': 'Abkürzung', 'dann': 'Auf Trade nach einer Basis mit „%s“ fraktiert suchen – spart oft den ganzen Anfang.' % kt, 'ok': True}])
                summe += weg_frac
            else:
                schritt(art='info', titel='Kein Fracturing – Risiko ist billiger', wie='', chance=None,
                        warum='Auf der %s-Seite wird später noch annulliert, dabei kann dein Schlüssel-Mod getroffen werden (erwartet %.1f×). Ihn dann neu zu holen kostet im Schnitt ≈ %s Ex – '
                              'weniger als Fracturing (≈ %s Ex). Darum ohne Fracturing weiter; bei Verlust einfach den Schlüssel-Schritt wiederholen.' % (SEITE[ks], verlust, round(weg_risiko), round(weg_frac) if frac else '?'),
                        wenn=[{'fall': 'Schlüssel-Mod geht verloren', 'dann': 'Kein Neuanfang: zurück zum Schlüssel-Schritt und ihn auf diesem Item neu holen.', 'ok': False}])
                summe += weg_risiko
        else:
            schritt(art='info', titel='Kein Fracturing nötig', wie='', chance=None,
                    warum='Auf der %s-Seite deines Schlüssel-Mods wird nichts mehr entfernt – alle weiteren Schritte laufen mit Seiten-Omen auf der anderen Seite. Der Schlüssel-Mod kann nie getroffen werden; das spart den teuren Fracturing Orb.' % SEITE[ks])

    # 4) Müll entfernen. Sind alle ungeschützten Mods Müll, reicht ein normaler Orb of Annulment (Seiten-Omen sind teuer).
    def ungeschuetzt_gut():
        return sum(1 for q in 'ps' for x in zust[q] if x['k'] in ('key', 'ess', 'gut', 'abyss'))
    if not ungeschuetzt_gut() and any(x['k'] == 'muell' for q in 'ps' for x in zust[q]):
        n_weg = sum(1 for q in 'ps' for x in zust[q] if x['k'] == 'muell')
        c = n_weg * ex('Orb of Annulment')
        for q in 'ps':
            zust[q] = [x for x in zust[q] if x['k'] != 'muell']
        schritt(art='an', titel='Platz schaffen: %d× Müll entfernen' % n_weg, wie='Orb of Annulment (%d×)' % n_weg, chance=100, chanceText='trifft nur Müll', versuche=1, kosten=c,
                warum='Außer fraktierten Mods sitzt nur Müll auf dem Item – also brauchst du keine teuren Seiten-Omen: ein normaler Orb of Annulment trifft garantiert Müll. '
                      'So oft, bis nur noch der fraktierte Mod übrig ist.')
        summe += c
    erasure_ok = bool(ex('Omen of Sinistral Erasure') and ex('Omen of Dextral Erasure') and ex('Chaos Orb'))
    for sd in 'ps':
        muell = [x for x in zust[sd] if x['k'] == 'muell']
        noch = sum(1 for w in norm + abyss if w['sd'] == sd and w is not key and not (ess and w is ess and not perf_ess))
        er_billig = ex('Omen of %s Erasure' % OM[sd]) + ex('Chaos Orb') < ex('Orb of Annulment') + ex('Omen of %s Annulment' % OM[sd])
        if erasure_ok and er_billig and noch and not (ess and perf_ess and ess['sd'] == sd):
            continue   # diese Seite wird später mit Chaos + Erasure überschrieben – Müll muss nicht extra weg
        frei = cap - len(zust[sd])
        platzhalter = 1 if (ess and perf_ess and ess['sd'] == sd and muell) else 0
        n_weg = max(0, min(len(muell) - platzhalter, noch - frei + platzhalter))
        if n_weg <= 0:
            continue
        geschuetzt = all(x['k'] in ('muell', 'frac') for x in zust[sd])
        c = n_weg * (ex('Orb of Annulment') + ex('Omen of %s Annulment' % OM[sd]))
        for _ in range(n_weg):
            zust[sd].remove(next(x for x in zust[sd] if x['k'] == 'muell'))
        schritt(art='an', titel='Platz schaffen: %d× Müll als %s entfernen' % (n_weg, SEITE[sd]), wie='Orb of Annulment + Omen of %s Annulment' % OM[sd],
                chance=100 if geschuetzt else None, chanceText='trifft nur Müll' if geschuetzt else 'kann einen guten Mod treffen', versuche=n_weg, kosten=c,
                warum='Das Omen beschränkt das Annulment auf die %s. %s' % (SEITEN[sd], 'Dort sitzt nichts Wertvolles (oder es ist fraktiert) – kein Risiko.' if geschuetzt else 'Dort sitzt auch ein guter Mod – er kann getroffen werden.'),
                wenn=[{'fall': 'Guter Mod getroffen', 'dann': 'Den holst du mit dem jeweiligen Schritt unten einfach neu.', 'ok': False}] if not geschuetzt else [])
        summe += c

    # 5) Perfect Essenz (deterministisch, wenn auf der Seite genau ein entfernbarer Mod sitzt)
    if ess and perf_ess:
        sd = ess['sd']
        nm = ess['ess']['name']
        entfernbar = [x for x in zust[sd] if x['k'] == 'muell']
        if not entfernbar and len(zust[sd]) >= cap:
            entfernbar = []
        sicher = len(entfernbar) <= 1 and all(x['k'] in ('muell', 'frac') for x in zust[sd])
        if not entfernbar:
            zust[sd].append({'k': 'muell', 't': 'Platzhalter'})
        c = ex(nm) + ex('Omen of %s Crystallisation' % OM[sd]) + (0 if entfernbar else ex('Exalted Orb') + ex('Omen of %s Exaltation' % OM[sd]))
        for x in zust[sd]:
            if x['k'] == 'muell':
                x.update({'k': 'ess', 't': ess['text']})
                break
        schritt(art='ess', titel='%s garantiert: „%s“' % (SEITE[sd], ess['text']), wie='%s + Omen of %s Crystallisation' % (nm, OM[sd]), chance=100 if sicher else None,
                versuche=1, kosten=c, ziele=[{'text': ess['text']}],
                warum=('%sDie Perfect Essenz tauscht auf seltenen Items einen Mod gegen ihren festen Mod. Das Omen legt fest, dass sie auf der %s-Seite tauscht – '
                       'sitzt dort genau ein entfernbarer Mod (der Platzhalter), ist der Tausch garantiert. Zählt als dein einer gecrafteter Mod.') % (
                    '' if entfernbar else 'Erst mit Exalted Orb + Omen of %s Exaltation einen beliebigen %s als Platzhalter hinzufügen. ' % (OM[sd], SEITE[sd]), SEITE[sd]),
                wenn=[] if sicher else [{'fall': 'Auf der Seite sitzen mehrere entfernbare Mods', 'dann': 'Dann kann die Essenz einen guten Mod ersetzen – vorher den Rest fracturen oder die Essenz früher einsetzen.', 'ok': False}])
        summe += c

    # 6) Restliche Mods: Exalted + Seiten-Omen im Wechsel mit Annulment + Omen (Isolation). Schwerster zuerst.
    fertig = {fam(x['id']) for x in ([key] if key else []) + ([ess] if ess else [])}
    rest = sorted([w for w in norm if w is not key and w is not ess and w['p'] > 0], key=lambda w: w['pSeite'])
    # Trick: Braucht eine Seite keine Wünsche mehr, wird sie mit beliebigen Mods aufgefüllt. Dann landet jeder neue Mod automatisch
    # auf der Arbeitsseite, und Fehlversuche lassen sich billig mit Chaos Orb + Erasure-Omen tauschen statt mit teurem Annulment-Omen.
    for sd in 'ps':
        andere = ANDERE[sd]
        braucht_andere = any(w['sd'] == andere for w in rest + abyss)
        frei_andere = cap - len(zust[andere])
        if any(w['sd'] == sd for w in rest) and not braucht_andere and 0 < frei_andere <= 2 and ex('Omen of %s Erasure' % OM[sd]):
            om_f = 'Omen of %s Exaltation' % OM[andere]
            c = frei_andere * (ex('Exalted Orb') + ex(om_f))
            for _ in range(frei_andere):
                zust[andere].append({'k': 'muell', 't': 'Füller'})
            schritt(art='ex', titel='%s-Seite auffüllen (%d× beliebiger Mod)' % (SEITE[andere], frei_andere), wie='Exalted Orb + %s (%d×)' % (om_f, frei_andere), chance=100, versuche=1, kosten=c,
                    warum='Auf der %s-Seite brauchst du nichts mehr. Ist sie voll, landet jeder neue Mod automatisch als %s – und Fehlversuche tauschst du mit Chaos Orb + Omen of %s Erasure '
                          '(billig) statt sie mit Orb of Annulment + Omen (teuer) zu entfernen. Was hier landet, ist egal – gern ein Bonus wie Resistenz.' % (SEITE[andere], SEITE[sd], OM[sd]))
            summe += c
            break
    offen = list(rest)
    while offen:
        # zuerst die Seite bearbeiten, deren Gegenseite gerade voll ist (dann gehen billige Chaos + Erasure-Schleifen)
        w = min(offen, key=lambda x: (len(zust[ANDERE[x['sd']]]) < cap, x['pSeite']))
        offen.remove(w)
        sd = w['sd']
        om_ex, om_an = 'Omen of %s Exaltation' % OM[sd], 'Omen of %s Annulment' % OM[sd]
        gut = sum(1 for x in zust[sd] if x['k'] in ('key', 'ess', 'gut'))   # ungeschützte gute Mods auf der Seite
        varianten = []
        andere_voll = len(zust[ANDERE[sd]]) >= cap
        muell_sd = [x for x in zust[sd] if x['k'] == 'muell']
        ungesch = sum(1 for q in 'ps' for x in zust[q] if x['k'] in ('key', 'ess', 'gut', 'abyss'))
        # Fehlversuch entfernen: normaler Annulment reicht, wenn sonst nichts Ungeschütztes auf dem Item sitzt
        weg_n = ex('Orb of Annulment') if not ungesch else (ex('Orb of Annulment') + ex(om_an)) * (1 + gut)
        weg_txt = 'Orb of Annulment' if not ungesch else 'Orb of Annulment + %s' % om_an
        for orb, boden in ORBS('Exalted'):
            p = anteil(w['id'], w['min'], (sd,), boden, fertig)
            z = _geo(p)
            if not z or (orb != 'Exalted Orb' and not ex(orb)):
                continue
            pro = ex(orb) + (0 if andere_voll else ex(om_ex))
            c = z[0] * pro + (z[0] - 1) * weg_n
            varianten.append((c, orb, z, p, None, 'exalt'))
        # Chaos + Erasure-Omen: entfernt nur auf dieser Seite und würfelt sofort neu – lohnt, wenn die andere Seite voll ist
        om_er = 'Omen of %s Erasure' % OM[sd]
        if andere_voll and ex(om_er) and ex('Chaos Orb'):
            for orb, boden in ORBS('Chaos'):
                p = anteil(w['id'], w['min'], (sd,), boden, fertig)
                z = _geo(p)
                if z and ex(orb):
                    c = ex('Exalted Orb') + z[0] * (ex(orb) + ex(om_er)) * (1 + gut)
                    varianten.append((c, orb, z, p, None, 'chaos'))
        boost = next((t for t in (w['m'].get('tags') or []) if t in KATALYST), None) if schmuck else None
        if boost:
            p = anteil(w['id'], w['min'], (sd,), 0, fertig, boost)
            z = _geo(p)
            if z:
                c = z[0] * (ex('Exalted Orb') + (0 if andere_voll else ex(om_ex)) + ex('Omen of Catalysing Exaltation') + 20 * ex(KATALYST[boost])) + (z[0] - 1) * weg_n
                varianten.append((c, 'Exalted Orb', z, p, boost, 'exalt'))
        if not varianten:
            continue
        varianten.sort(key=lambda v: v[0] if v[0] else 9e18)
        c, orb, z, p, bst, weg = varianten[0]
        def wie_txt(v):
            if v[5] == 'chaos':
                return '%s + %s' % (v[1], om_er)
            return v[1] + ('' if andere_voll else ' + ' + om_ex) + (' + Omen of Catalysing Exaltation (vorher 20 %% %s)' % KATALYST[v[4]] if v[4] else '')
        wie = wie_txt(varianten[0])
        alt = [{'wie': wie_txt(v), 'chance': round(100 * v[3], 1), 'kosten': v[0]} for v in varianten[1:4]]
        if weg == 'chaos' and muell_sd:
            muell_sd[0].update({'k': 'gut', 't': w['text']})
        else:
            if len(zust[sd]) >= cap and muell_sd:
                zust[sd].remove(muell_sd[0])          # Platz für den Exalted: einen Müll-Mod vorher entfernen
                c += ex('Orb of Annulment') + (ex(om_an) if ungesch else 0)
            zust[sd].append({'k': 'gut', 't': w['text']})
        extra = [] if weg == 'chaos' else [{'n': 'Orb of Annulment', 'anz': max(0, round(z[0] - 1))}] + ([{'n': om_an, 'anz': max(0, round(z[0] - 1))}] if ungesch else [])
        schritt(art='ex', titel='Neuer %s: „%s“' % (SEITE[sd], w['text']), wie=wie, extra=[e for e in extra if e['anz']], chance=round(100 / z[0], 1), versuche=round(z[0]), meist=z[1], pech=z[2],
                kosten=c, ziele=[{'text': w['text']}], alternativen=alt, risiko=bool(gut),
                warum=(('Die Schleife: Erst ein Exalted Orb – die andere Seite ist voll, also landet der neue Mod automatisch als %s. Passt er nicht: %s + %s entfernt einen %s und würfelt sofort einen neuen dazu. '
                        'Das wiederholst du – deshalb „im Schnitt %d Versuche“. Billiger als Annulment + Omen, weil jeder Versuch nur einen Chaos Orb und ein Omen kostet.') % (SEITE[sd], orb, om_er, SEITE[sd], round(z[0]))
                       if weg == 'chaos' else
                       'Die Schleife: %s → ist es dein Mod, fertig. Wenn nicht, entfernst du ihn wieder und versuchst es erneut – deshalb „im Schnitt %d Versuche“. %s%s' % (
                          wie, round(z[0]), 'Die andere Seite ist voll, darum landet der neue Mod auch ohne Omen garantiert als %s.' % SEITE[sd] if andere_voll else
                          'Das Omen setzt den neuen Mod garantiert auf die %s-Seite, damit die andere Seite unberührt bleibt.' % SEITE[sd],
                          ' Katalysator-Qualität + Catalysing-Omen machen Mods mit dem Tag „%s“ etwa 5× wahrscheinlicher (Wert aus der Community, nicht offiziell).' % bst if bst else '')),
                wenn=[{'fall': 'Dein Mod kommt', 'dann': 'Weiter zum nächsten Schritt.', 'ok': True},
                      {'fall': 'Ein anderer Mod kommt', 'dann': ('Wieder %s + %s – das tauscht den falschen %s gegen einen neuen.%s' % (orb, om_er, SEITE[sd], ' Kann auch einen deiner guten Mods auf dieser Seite treffen (%d %%).' % round(100 * gut / (gut + 1)) if gut else ''))
                       if weg == 'chaos' else '%s entfernt ihn. %s Dann wieder %s.' % (
                          weg_txt, 'Auf dem Item sitzt sonst nichts Ungeschütztes – ein normaler Annulment reicht, kein Omen nötig.' if not ungesch else
                          ('Das Omen hält das Annulment auf der %s-Seite. ' % SEITE[sd]) + ('Dort sitzt nichts Ungeschütztes – kein Risiko.' if not gut else
                          'Es kann auch einen deiner %d guten Mods treffen (%d %%) – den holst du dann genauso zurück.' % (gut, round(100 * gut / (gut + 1)))),
                          orb + ('' if andere_voll else ' + Omen')), 'ok': False},
                      {'fall': 'Ein nützlicher Bonus-Mod kommt (z. B. Resistenz)', 'dann': 'Behalten, wenn du auf der Seite noch Platz hast – dann diesen Wunsch auf der Seite weglassen oder später tauschen.', 'ok': True}])
        summe += c
        fertig.add(fam(w['id']))

    # 7) Abyss / Desecration
    for w in abyss:
        tot = hit = 0.0
        lich_om = next((LICH[t] for t in (w['m'].get('tags') or []) if t in LICH), None)
        for x in P.get('desecrated', {}).get(w['sd'], []):
            m = d['mods'].get(x)
            if not m:
                continue
            if lich_om and not any(LICH.get(t) == lich_om for t in (m.get('tags') or [])):
                continue
            for t in tiers_fuer(m, ilvl):
                tot += t[2]
                hit += t[2] if x == w['id'] and t[1] >= w['min'] else 0
        p1 = hit / tot if tot else 0
        p3, p6 = 1 - (1 - p1) ** 3, 1 - (1 - p1) ** 6
        kn = 'Preserved %s' % KNOCHEN.get(cat, 'Cranium' if juwel else 'Rib')
        z = _geo(p6) or (1, 1, 1)
        oms = ['Omen of %s Necromancy' % OM[w['sd']], 'Omen of Abyssal Echoes'] + ([lich_om] if lich_om else [])
        c = z[0] * (ex(kn) + sum(ex(o) for o in oms)) + (z[0] - 1) * (ex('Orb of Annulment') + ex('Omen of Light'))
        vor = ''
        if len(zust[w['sd']]) >= cap:
            mu = [x for x in zust[w['sd']] if x['k'] == 'muell']
            if mu:
                zust[w['sd']].remove(mu[0])
                ung = sum(1 for q in 'ps' for x in zust[q] if x['k'] in ('key', 'ess', 'gut'))
                c_vor = ex('Orb of Annulment') + (ex('Omen of %s Annulment' % OM[w['sd']]) if ung else 0)
                summe += c_vor
                vor = 'Vorher den Müll-%s mit Orb of Annulment%s entfernen. ' % (SEITE[w['sd']], ' + Omen of %s Annulment' % OM[w['sd']] if ung else '')
            else:
                hinweise.append('Für den Abyss-Mod ist auf der %s-Seite kein Platz mehr – ein Wunsch weniger auf dieser Seite.' % SEITE[w['sd']])
        zust[w['sd']].append({'k': 'abyss', 't': w['text']})
        schritt(art='abyss', titel='Abyss-Mod: „%s“' % w['text'], wie='%s + %s' % (kn, ' + '.join(oms)), chance=round(100 * p6, 1), versuche=round(z[0]), meist=z[1], pech=z[2],
                kosten=c, ziele=[{'text': w['text']}],
                warum=vor + 'Knochen aufs seltene Item, dann im Well of Souls (oder mit dem Reveal) aus 3 Vorschlägen wählen (%d %%). Echoes würfelt die 3 Vorschläge einmal neu (zusammen %d %%). '
                      'Das Necromancy-Omen legt die Seite fest%s. Nur ein Abyss-Mod pro Item.' % (round(100 * p3), round(100 * p6), ', %s beschränkt auf die passende Lich-Gruppe' % lich_om if lich_om else ''),
                wenn=[{'fall': 'Dein Mod ist unter den Vorschlägen', 'dann': 'Auswählen – fertig.', 'ok': True},
                      {'fall': 'Nicht dabei', 'dann': 'Den besten nehmen, dann Orb of Annulment + Omen of Light: entfernt NUR den Abyss-Mod. Neuer Knochen.', 'ok': False}])
        summe += c

    # 8) Veredeln: nur Katalysator-Qualität bei Schmuck (wirkt direkt auf die Mods); Divine/Qualität sind optional und stehen in den Grundregeln
    if schmuck:
        tags = [t for w in norm for t in (w['m'].get('tags') or []) if t in KATALYST]
        kt = KATALYST[collections.Counter(tags).most_common(1)[0][0]] if tags else 'Katalysator'
        schritt(art='div', titel='Werte um bis zu 20 %% erhöhen: %s' % kt, wie='20 × %s' % kt, chance=100, kosten=20 * ex(kt) if ex(kt) else None,
                warum='Katalysator-Qualität verstärkt alle Mods mit dem passenden Tag. Erst ganz am Ende – das Catalysing-Omen würde die Qualität sonst verbrauchen.')

    teuer = sorted([x for x in S if x.get('kosten')], key=lambda x: -x['kosten'])[:2]
    div = ex('Divine Orb') or 0
    if div and summe > 150 * div and teuer:
        hinweise.append('Die Kosten kommen vor allem von: %s. Gerade teuer sind Omen wie Annulment-/Erasure-Omen (je ≈ %s Divine). '
                        'Prüf vorher auf Trade, ob es das fertige Item (oder eine Basis mit fraktiertem Schlüssel-Mod) günstiger gibt – oder wähl links bei den teuersten Mods eine Stufe niedriger.' % (
                            ', '.join('„%s“ (%d %%)' % (x['titel'][:60], round(100 * x['kosten'] / summe)) for x in teuer),
                            ('%.0f' % (max(ex('Omen of Sinistral Annulment'), ex('Omen of Dextral Annulment')) / div)) if div else '?'))
    return {'schritte': S, 'summe': round(summe, 1), 'hinweise': hinweise, 'schluessel': key and key['text'], 'cap': cap,
            'fraktiert': fest, 'regeln': [
                'Pro Item höchstens 1 gecrafteter Mod (Essenz oder Alloy) und 1 Abyss-Mod.',
                'Omen vor dem Orb per Rechtsklick aktivieren – sie wirken auf den nächsten passenden Orb.',
                'Sinistral = Prefixe, Dextral = Suffixe. Damit arbeitest du immer nur auf einer Seite (Isolation).',
                'Fracturing Orb braucht mindestens 4 Mods und macht einen zufälligen davon dauerhaft.',
                'Omen of Whittling: der nächste Chaos Orb entfernt den Mod mit dem niedrigsten Modlevel.',
                'Optional ganz am Ende: Divine Orb würfelt nur die Zahlen neu; Omen of Sanctification multipliziert danach alle Werte (78–122 %) und sperrt das Item.']}
