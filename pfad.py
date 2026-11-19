"""Wo das Programm liegt und wo es seine Daten ablegt.

- Aus dem Quelltext gestartet: alles im Programmordner (wie bisher).
- Als fertige .exe: Daten, Path of Building und Oberfläche unter %LOCALAPPDATA%\\PoE Companion.
  Beim ersten Start (und nach jedem Update) packt die .exe ihre Oberfläche dorthin aus."""
import os, sys, shutil

EXE = bool(getattr(sys, 'frozen', False))
if EXE:
    BASE = os.path.join(os.environ.get('LOCALAPPDATA') or os.path.expanduser('~'), 'PoE Companion')
    BUNDLE = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
else:
    BASE = BUNDLE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, 'data')
os.makedirs(DATA, exist_ok=True)


def auspacken():
    if not EXE:
        return
    import app_info
    marke = os.path.join(BASE, 'version.txt')
    try:
        if open(marke, encoding='utf-8').read().strip() == app_info.VERSION:
            return
    except Exception:
        pass
    for teil in ('ui', 'guide2pob', 'data_static'):
        q = os.path.join(BUNDLE, teil)
        if os.path.isdir(q):
            shutil.copytree(q, os.path.join(BASE, teil), dirs_exist_ok=True)
    for f in os.listdir(BUNDLE):
        if f.upper().startswith(('LIZENZ', 'LIESMICH', 'README', 'DATENSCHUTZ')):
            shutil.copy2(os.path.join(BUNDLE, f), os.path.join(BASE, f))
    open(marke, 'w', encoding='utf-8').write(app_info.VERSION)


auspacken()
