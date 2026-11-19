"""Updates (GitHub), anonymer Nutzerzähler und Feedback (eigener Cloudflare Worker).

Datenschutz: Der Zähler schickt höchstens einmal am Tag eine zufällige Installations-Nummer, die Programmversion,
das Spiel (PoE 1/2) und die Sprache. Keine Namen, keine Accounts, keine Dateien. In den Einstellungen abschaltbar."""
import json, os, re, sys, time, uuid, threading, subprocess, urllib.request
import app_info
from pfad import BASE, DATA, EXE

UA = {'User-Agent': app_info.USER_AGENT, 'Accept': 'application/json'}
STAND = {'neu': False, 'version': '', 'notiz': '', 'seite': '', 'exe': '', 'geprueft': 0, 'fehler': '', 'laedt': False}


def _v(t):
    return tuple(int(x) for x in re.findall(r'\d+', t or '')[:3]) or (0,)


def _get(url, timeout=15):
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read())


def _post(url, body, timeout=15):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=dict(UA, **{'Content-Type': 'application/json'}))
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read() or b'{}')


# ------------------------------------------------------------------ Updates
def update_pruefen(log=print):
    if not app_info.REPO:
        return STAND
    try:
        j = _get('https://api.github.com/repos/%s/releases/latest' % app_info.REPO)
        tag = j.get('tag_name') or ''
        exe = next((a.get('browser_download_url') for a in j.get('assets') or [] if (a.get('name') or '').lower().endswith('.exe')), '')
        STAND.update(neu=_v(tag) > _v(app_info.VERSION), version=tag.lstrip('vV'), notiz=(j.get('body') or '')[:1500],
                     seite=j.get('html_url') or '', exe=exe, geprueft=time.time(), fehler='')
        if STAND['neu']:
            log('Update verfügbar: %s (installiert %s)' % (tag, app_info.VERSION))
    except Exception as e:
        STAND.update(fehler=str(e)[:150], geprueft=time.time())
    return STAND


def update_installieren(log=print):
    """Lädt die neue .exe, tauscht sie nach dem Beenden aus und startet sie neu. Aus dem Quelltext: Release-Seite öffnen."""
    if not EXE or not STAND.get('exe'):
        import webbrowser
        webbrowser.open(STAND.get('seite') or 'https://github.com/%s/releases' % app_info.REPO)
        return {'ok': True, 'browser': True}
    STAND['laedt'] = True
    ziel = os.path.join(BASE, 'update')
    os.makedirs(ziel, exist_ok=True)
    neu = os.path.join(ziel, 'PoE-Companion-neu.exe')
    with urllib.request.urlopen(urllib.request.Request(STAND['exe'], headers=UA), timeout=120) as r, open(neu, 'wb') as f:
        while True:
            b = r.read(1 << 16)
            if not b:
                break
            f.write(b)
    if os.path.getsize(neu) < 1_000_000:
        STAND['laedt'] = False
        raise RuntimeError('Download unvollständig')
    alt = sys.executable
    cmd = os.path.join(ziel, 'tauschen.cmd')
    with open(cmd, 'w', encoding='utf-8') as f:
        f.write('@echo off\r\nping -n 3 127.0.0.1 >nul\r\n'
                ':nochmal\r\nmove /y "%s" "%s" >nul 2>nul || (ping -n 2 127.0.0.1 >nul & goto nochmal)\r\n'
                'start "" "%s"\r\n' % (neu, alt, alt))
    log('Update %s heruntergeladen – tausche und starte neu' % STAND['version'])
    subprocess.Popen(['cmd', '/c', cmd], creationflags=0x08000000, close_fds=True)
    threading.Timer(0.5, lambda: os._exit(0)).start()
    return {'ok': True}


# ------------------------------------------------------------------ Zähler und Feedback
def install_id(settings, speichere):
    if not settings.get('installId'):
        settings['installId'] = uuid.uuid4().hex
        speichere('settings.json', settings)
    return settings['installId']


def ping(settings, speichere, spiel, log=print):
    if not app_info.DIENST or not settings.get('telemetry', True):
        return
    heute = time.strftime('%Y-%m-%d')
    if settings.get('pingTag') == heute:
        return
    try:
        _post(app_info.DIENST.rstrip('/') + '/ping', {'id': install_id(settings, speichere), 'v': app_info.VERSION, 'spiel': spiel,
                                                     'lang': settings.get('lang', 'de'), 'exe': EXE})
        settings['pingTag'] = heute
        speichere('settings.json', settings)
    except Exception as e:
        log('Zähler: %s' % str(e)[:120])


def feedback(b, settings, speichere, spiel):
    text = str(b.get('text') or '').strip()[:4000]
    if len(text) < 3:
        return {'ok': False, 'error': 'Bitte schreib kurz, worum es geht.'}
    body = {'id': install_id(settings, speichere), 'v': app_info.VERSION, 'spiel': spiel, 'art': str(b.get('art') or 'idee')[:20],
            'text': text, 'kontakt': str(b.get('kontakt') or '').strip()[:100], 'bereich': str(b.get('bereich') or '')[:40],
            'lang': settings.get('lang', 'de')}
    if b.get('log'):
        try:
            zeilen = open(os.path.join(DATA, 'app.log'), encoding='utf-8', errors='replace').read().splitlines()[-60:]
            body['log'] = re.sub(r'C:\\Users\\[^\\]+', r'C:\\Users\\…', '\n'.join(zeilen))[-6000:]
        except Exception:
            pass
    if not app_info.DIENST:
        return {'ok': False, 'offline': True, 'discord': app_info.DISCORD}
    try:
        _post(app_info.DIENST.rstrip('/') + '/feedback', body, timeout=20)
        return {'ok': True}
    except Exception as e:
        return {'ok': False, 'error': 'Senden fehlgeschlagen (%s). Du kannst es auch direkt auf Discord an %s schicken.' % (str(e)[:80], app_info.DISCORD),
                'discord': app_info.DISCORD}


def hintergrund(S, speichere, spiel, log):
    """Läuft im Hintergrund: täglich zählen, alle 6 Stunden nach Updates schauen."""
    time.sleep(20)
    while True:
        try:
            ping(S.settings, speichere, spiel(), log)
            update_pruefen(log)
            S.bump()
        except Exception as e:
            log('Dienst: %s' % e)
        time.sleep(6 * 3600)


def info(settings):
    return {'version': app_info.VERSION, 'discord': '' if app_info.DISCORD.startswith('DEIN_') else app_info.DISCORD, 'hinweis': app_info.HINWEIS_GGG, 'repo': app_info.REPO,
            'dienst': bool(app_info.DIENST), 'exe': EXE, 'update': {k: STAND[k] for k in ('neu', 'version', 'notiz', 'seite', 'laedt')}}
