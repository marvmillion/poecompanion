# PoE Companion – Bilder der Skill-Gems (von poe.ninja, einmal pro Woche aktualisiert)
import os, json, time, threading, urllib.request, urllib.parse

from pfad import BASE
CACHE = os.path.join(BASE, 'data', 'gemicons.json')
from app_info import USER_AGENT as _UA
UA = {'User-Agent': _UA}
_lock = threading.Lock()
_busy = False


def lade():
    try:
        return json.load(open(CACHE, encoding='utf-8'))
    except Exception:
        return {'t': 0, 'icons': {}}


def aktualisiere(league, log=print):
    """Holt die Gem-Bilder im Hintergrund, falls der Cache fehlt oder älter als 7 Tage ist."""
    global _busy
    d = lade()
    if d.get('icons') and time.time() - d.get('t', 0) < 7 * 86400:
        return
    with _lock:
        if _busy:
            return
        _busy = True

    def job():
        global _busy
        try:
            icons = {}
            for typ in ('SkillGem',):
                q = urllib.parse.urlencode({'league': league or 'Standard', 'type': typ})
                u = 'https://poe.ninja/poe1/api/economy/stash/current/item/overview?' + q
                j = json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40).read())
                for x in j.get('lines', []):
                    n, ic = x.get('name'), x.get('icon')
                    if n and ic and n not in icons:
                        icons[n] = ic
            if icons:
                os.makedirs(os.path.dirname(CACHE), exist_ok=True)
                json.dump({'t': time.time(), 'icons': icons}, open(CACHE, 'w', encoding='utf-8'))
                log('Gem-Bilder: %d geladen' % len(icons))
        except Exception as e:
            log('Gem-Bilder: %s' % e)
        finally:
            _busy = False
    threading.Thread(target=job, daemon=True).start()


# ---------------- PoE2: Gem-Bilder aus den Spieldaten (Pfad je Gem), Bild-Server wird einmal geprüft
CACHE2 = os.path.join(BASE, 'data', 'gemicons_poe2_v3.json')
KANDIDATEN = ('https://web.poecdn.com/image/{p}.png', 'https://cdn.poe2db.tw/image/{p}.webp')


def lade2():
    try:
        return json.load(open(CACHE2, encoding='utf-8'))
    except Exception:
        return {'t': 0, 'icons': {}}


def aktualisiere2(log=print):
    global _busy
    d = lade2()
    if d.get('icons') and time.time() - d.get('t', 0) < 30 * 86400:
        return
    with _lock:
        if _busy:
            return
        _busy = True

    def job():
        global _busy
        try:
            art = json.load(open(os.path.join(BASE, 'ui', 'data', 'gemart_poe2.json'), encoding='utf-8'))
            probe = art.get('Ice Nova') or next(iter(art.values()))
            muster = None
            for k in KANDIDATEN:
                try:
                    r = urllib.request.urlopen(urllib.request.Request(k.format(p=probe), headers=UA), timeout=20)
                    if r.status == 200 and r.headers.get('Content-Type', '').startswith('image'):
                        muster = k
                        break
                except Exception as e:
                    log('Gem-Bilder PoE2: %s nicht erreichbar (%s)' % (k.split('/')[2], e))
            if muster:
                icons = {n: muster.format(p=p) for n, p in art.items()}
                # Wie im Skill-Fenster von PoE2: Skill-Symbole statt Gem-Steine, wenn der Bild-Server sie hat
                try:
                    sk = json.load(open(os.path.join(BASE, 'ui', 'data', 'gemicon2_poe2.json'), encoding='utf-8'))
                    probe2 = sk.get('Twister') or next(iter(sk.values()))
                    # Pfad-Varianten durchprobieren: mit/ohne 4k-Ordner, klein geschrieben
                    varianten = (lambda x: x, lambda x: x.replace('/4k/', '/'), lambda x: x.lower(), lambda x: x.replace('/4k/', '/').lower())
                    trafo, fehler = None, []
                    for v in varianten:
                        for vorlage in (muster,) + tuple(k for k in KANDIDATEN if k != muster):
                            try:
                                r = urllib.request.urlopen(urllib.request.Request(vorlage.format(p=v(probe2)), headers=UA), timeout=15)
                                if r.status == 200:
                                    trafo = (v, vorlage)
                                    break
                            except Exception as e2:
                                fehler.append('%s → %s' % (vorlage.format(p=v(probe2)), e2))
                        if trafo:
                            break
                    if not trafo:
                        raise Exception('; '.join(fehler[-3:]))
                    if trafo:
                        alt = icons
                        icons = {n: trafo[1].format(p=trafo[0](p)) for n, p in sk.items()}
                        for n, u in alt.items():
                            icons.setdefault(n, u)
                        log('Gem-Bilder PoE2: Skill-Symbole aktiv (%d)' % len(sk))
                except Exception as e:
                    log('Gem-Bilder PoE2: Skill-Symbole nicht erreichbar (%s), nutze Gem-Bilder' % e)
                json.dump({'t': time.time(), 'icons': icons, 'quelle': muster}, open(CACHE2, 'w', encoding='utf-8'))
                log('Gem-Bilder PoE2: %d über %s' % (len(icons), muster.split('/')[2]))
        except Exception as e:
            log('Gem-Bilder PoE2: %s' % e)
        finally:
            _busy = False
    threading.Thread(target=job, daemon=True).start()
