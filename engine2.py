"""PoE Companion – Rechenkern für Path of Exile 2.

Nutzt Path of Building PoE2 (Community) ohne Fenster. Quellcode und 64-Bit-Laufzeit werden beim
ersten Start einmalig von GitHub geladen (nur die Ordner src/ und runtime/).
"""
import os, json, zipfile, urllib.request, urllib.parse, urllib.error
import engine
from engine import Lua, code_to_xml, pobbin_code, guide_code, lstr, UA

POB2_TAG = 'v0.23.1'
from pfad import BASE
POB2_DIR = os.path.join(BASE, 'PathOfBuilding-PoE2-' + POB2_TAG[1:])
SRC2 = os.path.join(POB2_DIR, 'src')
RUNTIME2 = os.path.join(POB2_DIR, 'runtime')
RT2 = os.path.join(RUNTIME2, 'lua')


def manifest2():
    """PoB startet ohne manifest.xml im Update-Modus und bricht ohne Fenster ab. Ein Manifest ohne Branch/Plattform
    schaltet den Entwicklermodus ein: keine Update-Prüfung."""
    m = os.path.join(POB2_DIR, 'manifest.xml')
    if not os.path.exists(m):
        with open(m, 'w', encoding='utf-8') as f:
            f.write('<?xml version="1.0" encoding="UTF-8"?>\n<PoBVersion>\n\t<Version number="%s"/>\n</PoBVersion>\n' % POB2_TAG[1:])


def ensure_source2(status=print):
    if os.path.exists(os.path.join(SRC2, 'HeadlessWrapper.lua')) and os.path.exists(os.path.join(RUNTIME2, 'lua51.dll')):
        manifest2()
        return
    status('Lade Path of Building für PoE 2 (einmalig, einige hundert MB) …')
    url = 'https://codeload.github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/zip/refs/tags/' + POB2_TAG
    tmp = os.path.join(BASE, '_pob2_download.zip')
    urllib.request.urlretrieve(url, tmp)
    status('Entpacke Path of Building für PoE 2 …')
    z = zipfile.ZipFile(tmp)
    teile = [n for n in z.namelist() if '/src/' in n or '/runtime/' in n]
    z.extractall(BASE, members=teile)
    z.close()
    os.remove(tmp)
    manifest2()


def lua_dir():
    """Eine 64-Bit-LuaJIT genügt für beide Spiele – bevorzugt die bereits geladene."""
    try:
        return engine.find_pob_install()
    except Exception:
        return RUNTIME2


# PoE2 kennt andere Ausgabewerte – alles defensiv abfragen
SHEET2_LUA = r'''
local d = require "dkjson"
local o = build.calcsTab.mainOutput or {}
local function n(k) return tonumber(o[k]) or 0 end
local g = build.skillsTab.socketGroupList[build.mainSocketGroup]
local skill = g and (g.displayLabel or "") or ""
local r = {
  dps = POVL_DPS(o), hit = n("AverageHit"), speed = n("Speed"), crit = n("CritChance"), critMulti = n("CritMultiplier"),
  dot = n("TotalDot"), life = n("Life"), es = n("EnergyShield"), mana = n("Mana"), manaFree = n("ManaUnreserved"),
  spirit = n("Spirit"), spiritFree = n("SpiritUnreserved"),
  ehp = n("TotalEHP"), armour = n("Armour"), evasion = n("Evasion"), block = n("EffectiveBlockChance"),
  spellBlock = n("EffectiveSpellBlockChance"), suppress = 0, deflect = n("DeflectChance"),
  fire = n("FireResist"), cold = n("ColdResist"), light = n("LightningResist"), chaos = n("ChaosResist"),
  fireMax = n("FireResistMax"), coldMax = n("ColdResistMax"), lightMax = n("LightningResistMax"), chaosMax = n("ChaosResistMax"),
  hitPhys = n("PhysicalMaximumHitTaken"), hitFire = n("FireMaximumHitTaken"), hitCold = n("ColdMaximumHitTaken"),
  hitLight = n("LightningMaximumHitTaken"), hitChaos = n("ChaosMaximumHitTaken"),
  lifeRegen = n("LifeRegenRecovery"), move = n("EffectiveMovementSpeedMod"),
  str = n("Str"), dex = n("Dex"), int = n("Int"),
  level = build.characterLevel or 1, class = build.spec and (build.spec.curAscendClassName ~= "None" and build.spec.curAscendClassName or build.spec.curClassName) or "",
  skill = skill, game = "poe2",
}
if r.move == 0 then r.move = 1 end
return d.encode(r)
'''


class PoB2:
    game = 'poe2'

    def __init__(self, status=print):
        ensure_source2(status)
        status('Starte Path of Building (PoE 2) …')
        self.lua = Lua(lua_dir())
        self._in_src(lambda: (
            self.lua.run(f'package.path = {lstr(RT2)} .. "\\\\?.lua;" .. {lstr(RT2)} .. "\\\\?\\\\init.lua;" .. package.path; '
                         f'package.cpath = {lstr(RUNTIME2)} .. "\\\\?.dll;" .. package.cpath; arg = {{}}'),
            self.lua.run('dofile("HeadlessWrapper.lua") return "ok"'),
            self.lua.run(engine.FILESEARCH_LUA)))

    def _in_src(self, fn):
        old = os.getcwd()
        os.chdir(SRC2)
        try:
            return fn()
        finally:
            os.chdir(old)

    def load_xml(self, xml):
        self._in_src(lambda: self.lua.run('loadBuildFromXML(' + lstr(xml) + ', "overlay") return "ok"'))
        return self.stats()

    def load_link(self, text):
        t = text.strip()
        code = guide_code(t)
        return self.load_xml(code_to_xml(code))

    def load_character(self, account, charname, realm='poe2'):
        raise RuntimeError('PoE-2-Charaktere kann der Companion noch nicht direkt von pathofexile.com laden. '
                           'Trag im Profil stattdessen einen pobb.in-Link oder PoB-Code deines Charakters ein '
                           '(Path of Building PoE2: Import → Charakter, dann Export → Teilen).')

    def stats(self):
        return json.loads(self._in_src(lambda: self.lua.run(engine.STATS_LUA)))

    def sheet(self):
        return json.loads(self._in_src(lambda: self.lua.run(SHEET2_LUA)))

    def gems(self):
        try:
            return json.loads(self._in_src(lambda: self.lua.run(engine.GEMS_LUA)))
        except Exception:
            return []

    def gem_colors(self, names):
        return {}

    def gem_info(self, names):
        code = engine.GEMINFO_LUA.replace('NAMES_ARG', engine.lstr(json.dumps(sorted(n for n in names if n))))
        return json.loads(self._in_src(lambda: self.lua.run(code)))

    def char_tree(self):
        return json.loads(self._in_src(lambda: self.lua.run(r'''
local d = require "dkjson"
local ns = {}
for id, _ in pairs(build.spec.allocNodes) do if type(id) == "number" then table.insert(ns, tostring(id)) end end
return d.encode({ nodes = ns, mast = {}, base = build.spec.curClassName })
''')))

    def compare(self, item_text):
        code = engine.COMPARE_LUA.replace('ITEM_ARG', lstr(item_text.replace('\r', '')))
        return json.loads(self._in_src(lambda: self.lua.run(code)))

    def upgrades(self, req):
        code = engine.UPGRADE_LUA.replace('REQ_ARG', lstr(json.dumps(req)))
        return json.loads(self._in_src(lambda: self.lua.run(code)))

    def affixe(self, req):
        code = engine.AFFIX_LUA.replace('REQ_ARG', lstr(json.dumps(req)))
        return json.loads(self._in_src(lambda: self.lua.run(code)))
