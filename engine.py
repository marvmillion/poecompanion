"""PoE Companion – PoB-Rechenkern ohne Fenster.

Nutzt die Lua-Laufzeit (lua51.dll) einer installierten Path-of-Building-Version und den
PoB-Quellcode, der beim ersten Start automatisch von GitHub geladen wird.
"""
import ctypes, os, sys, base64, zlib, json, time, glob, re, zipfile, urllib.request, urllib.parse, urllib.error

POB_TAG = 'v2.67.2'
from pfad import BASE
POB_DIR = os.path.join(BASE, 'PathOfBuilding-' + POB_TAG[1:])
SRC = os.path.join(POB_DIR, 'src')
RT = os.path.join(POB_DIR, 'runtime', 'lua')
from app_info import USER_AGENT as _UA
UA = {'User-Agent': _UA}


def find_pob_install():
    """Sucht eine installierte PoB-Version (für die Lua-Laufzeit)."""
    kandidaten = [
        os.path.expandvars(r'%APPDATA%\Path of Building Community'),
        os.path.expandvars(r'%LOCALAPPDATA%\Programs\Path of Building Community'),
        os.path.expandvars(r'%ProgramFiles%\Path of Building Community'),
        os.path.expandvars(r'%ProgramFiles(x86)%\Path of Building Community'),
    ]
    kandidaten.append(os.path.join(BASE, 'pob_runtime'))
    for k in kandidaten:
        if os.path.exists(os.path.join(k, 'lua51.dll')):
            return k
    # Kein Path of Building installiert: die Laufzeit (DLLs) aus der offiziellen portablen Fassung holen – einmalig, ohne Installation
    try:
        return pob_runtime_laden()
    except Exception as e:
        raise RuntimeError('Path of Building Community fehlt und konnte nicht automatisch geladen werden (%s). '
                           'Installier es von pathofbuilding.community und starte den Companion neu.' % str(e)[:120])


def pob_runtime_laden():
    ziel = os.path.join(BASE, 'pob_runtime')
    j = json.loads(urllib.request.urlopen(urllib.request.Request(
        'https://api.github.com/repos/PathOfBuildingCommunity/PathOfBuilding/releases/latest', headers=UA), timeout=30).read())
    url = next(a['browser_download_url'] for a in j.get('assets') or [] if 'portable' in a['name'].lower() and a['name'].lower().endswith('.zip'))
    tmp = os.path.join(BASE, '_pob_portable.zip')
    urllib.request.urlretrieve(url, tmp)
    os.makedirs(ziel, exist_ok=True)
    with zipfile.ZipFile(tmp) as z:
        for n in z.namelist():
            if n.lower().endswith('.dll') and n.count('/') <= 1:
                with open(os.path.join(ziel, os.path.basename(n)), 'wb') as f:
                    f.write(z.read(n))
    os.remove(tmp)
    if not os.path.exists(os.path.join(ziel, 'lua51.dll')):
        raise RuntimeError('lua51.dll nicht im Paket')
    return ziel


def ensure_source(status=print):
    """Lädt den PoB-Quellcode einmalig, falls er noch fehlt."""
    if os.path.exists(os.path.join(SRC, 'HeadlessWrapper.lua')):
        return
    status('Lade Path-of-Building-Daten (einmalig, ca. 650 MB, dauert ein paar Minuten)...')
    url = 'https://codeload.github.com/PathOfBuildingCommunity/PathOfBuilding/zip/refs/tags/' + POB_TAG
    tmp = os.path.join(BASE, '_pob_download.zip')
    urllib.request.urlretrieve(url, tmp)
    status('Entpacke Path-of-Building-Daten...')
    z = zipfile.ZipFile(tmp)
    teile = [n for n in z.namelist() if '/src/' in n or '/runtime/lua/' in n]
    z.extractall(BASE, members=teile)
    z.close()
    os.remove(tmp)


def prepare_jewels():
    """Entpackt die Timeless-Jewel-Daten, weil PoB ohne Fenster nicht selbst entpacken kann."""
    d = os.path.join(SRC, 'Data', 'TimelessJewelData')
    names = set(re.sub(r'\.zip(\.part\d+)?$', '', os.path.basename(f)) for f in glob.glob(os.path.join(d, '*.zip*')))
    for n in names:
        out = os.path.join(d, n + '.bin')
        if os.path.exists(out) and os.path.getsize(out) > 1000:
            continue
        if os.path.exists(os.path.join(d, n + '.zip')):
            raw = open(os.path.join(d, n + '.zip'), 'rb').read()
        else:
            parts, i = [], 0
            while os.path.exists(os.path.join(d, f'{n}.zip.part{i}')):
                parts.append(open(os.path.join(d, f'{n}.zip.part{i}'), 'rb').read())
                i += 1
            raw = b''.join(parts)
        data = None
        for wbits in (15, -15, 31):
            try:
                data = zlib.decompress(raw, wbits)
                break
            except zlib.error:
                pass
        if data:
            open(out, 'wb').write(data)


class Lua:
    def __init__(self, inst):
        os.add_dll_directory(inst)
        l = self.lib = ctypes.CDLL(os.path.join(inst, 'lua51.dll'))
        l.luaL_newstate.restype = ctypes.c_void_p
        l.luaL_openlibs.argtypes = [ctypes.c_void_p]
        l.luaL_loadstring.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
        l.lua_pcall.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int]
        l.lua_tolstring.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p]
        l.lua_tolstring.restype = ctypes.c_char_p
        l.lua_settop.argtypes = [ctypes.c_void_p, ctypes.c_int]
        self.L = l.luaL_newstate()
        l.luaL_openlibs(self.L)

    def run(self, code):
        l = self.lib
        if l.luaL_loadstring(self.L, code.encode('utf-8')) != 0 or l.lua_pcall(self.L, 0, 1, 0) != 0:
            err = l.lua_tolstring(self.L, -1, None)
            l.lua_settop(self.L, 0)
            raise RuntimeError((err or b'?').decode('utf-8', 'replace'))
        r = l.lua_tolstring(self.L, -1, None)
        l.lua_settop(self.L, 0)
        return r.decode('utf-8', 'replace') if r else None


def code_to_xml(code):
    code = code.strip().replace('-', '+').replace('_', '/')
    return zlib.decompress(base64.b64decode(code + '=' * (-len(code) % 4))).decode('utf-8')


def guide_code(t):
    """PoB-Code aus pobb.in-Link, PoB-Code oder Mobalytics-/Maxroll-Guide-Link (Umwandlung mit guide2pob, MIT)."""
    t = (t or '').strip().strip('"')
    datei = t.lower().endswith(('.html', '.htm')) and os.path.isfile(t)
    if datei or re.search(r'mobalytics\.gg|maxroll\.gg', t):
        import hashlib, tempfile
        d = os.path.join(BASE, 'data', 'guides')
        os.makedirs(d, exist_ok=True)
        f = os.path.join(d, hashlib.md5(t.encode()).hexdigest()[:12] + '.txt')
        if datei:
            f = f[:-4] + '_%d.txt' % int(os.path.getmtime(t))
        if not (os.path.exists(f) and time.time() - os.path.getmtime(f) < 86400):
            from guide2pob import cli
            args = [t, '-o', f, '--no-save-pob', '--no-open', '--no-buildfile']
            if datei or re.search(r'poe-?2', t):
                for src in glob.glob(os.path.join(BASE, 'PathOfBuilding-PoE2*', 'src')):
                    if os.path.isdir(os.path.join(src, 'TreeData')):
                        args += ['--pob-path', src]
                        break
            import io, contextlib
            puffer = io.StringIO()
            try:
                with contextlib.redirect_stderr(puffer), contextlib.redirect_stdout(puffer):
                    rc = cli.main(args)
            except SystemExit as ex:
                rc = ex.code or 1
            if rc or not os.path.exists(f):
                fehler = [z for z in puffer.getvalue().splitlines() if 'error' in z.lower()] or puffer.getvalue().splitlines()[-3:]
                if 'mobalytics' in t and any('403' in z for z in fehler):
                    raise RuntimeError('Mobalytics lässt keine automatischen Abrufe zu. So geht es trotzdem: Guide im Browser öffnen, '
                                       'Strg+S → „Webseite, nur HTML“ speichern und hier den Dateipfad eintragen '
                                       '(im Explorer Rechtsklick auf die Datei → „Als Pfad kopieren“).')
                raise RuntimeError('Guide konnte nicht umgewandelt werden: %s' % (' / '.join(fehler)[:300] or 'unbekannter Fehler'))
        return open(f, encoding='utf-8').read().strip()
    if 'pobb.in' in t or (len(t) < 20 and '/' not in t):
        return pobbin_code(t)
    return t


def pobbin_code(link):
    pid = link.rstrip('/').split('/')[-1]
    req = urllib.request.Request(f'https://pobb.in/{pid}/raw', headers=UA)
    return urllib.request.urlopen(req, timeout=20).read().decode().strip()


def poe_get(path, **params):
    url = 'https://www.pathofexile.com/character-window/' + path + '?' + urllib.parse.urlencode(params)
    try:
        body = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25).read().decode('utf-8')
    except urllib.error.HTTPError as e:
        if e.code in (403, 404):
            raise RuntimeError('Profil ist privat oder Account nicht gefunden. '
                               'Auf pathofexile.com unter Privacy Settings "Hide Characters" ausschalten.')
        raise RuntimeError('pathofexile.com antwortet nicht (Fehler %d).' % e.code)
    if body.strip() in ('', 'false', 'null'):
        raise RuntimeError('Keine Daten. Profil privat oder Name falsch?')
    return json.loads(body)


def list_characters(account, realm='pc'):
    return poe_get('get-characters', accountName=account.strip(), realm=realm or 'pc')


def lstr(s):
    lvl = 1
    while (']' + '=' * lvl + ']') in s:
        lvl += 1
    return '[' + '=' * lvl + '[' + s + ']' + '=' * lvl + ']'


FILESEARCH_LUA = r'''
function NewFileSearch(pattern)
  if pattern:find("%*") then return nil end
  local f = io.open(pattern, "rb")
  if not f then return nil end
  f:close()
  local name = pattern:match("[^/\\]+$")
  return { GetFileName = function() return name end, GetFileModifiedTime = function() return 4000000000 end,
           NextFile = function() return false end }
end
function POVL_DPS(t)
  local f = tonumber(t.FullDPS) or 0
  if f > 0 then return f end
  return tonumber(t.CombinedDPS) or tonumber(t.TotalDPS) or 0
end
return "ok"
'''

STATS_LUA = r'''
local dkjson = require "dkjson"
local o = build.calcsTab.mainOutput or {}
local function n(k) return tonumber(o[k]) or 0 end
local g = build.skillsTab.socketGroupList[build.mainSocketGroup]
local skill = ""
if g then
  skill = g.displayLabel or ""
  if skill == "" and g.gemList and g.gemList[1] then skill = g.gemList[1].nameSpec or "" end
end
return dkjson.encode({ dps = POVL_DPS(o), life = n("Life"), es = n("EnergyShield"), ehp = n("TotalEHP"),
  fire = n("FireResist"), cold = n("ColdResist"), light = n("LightningResist"), chaos = n("ChaosResist"),
  skill = skill, level = build.characterLevel,
  class = build.spec and (build.spec.curAscendClassName ~= "None" and build.spec.curAscendClassName or build.spec.curClassName) or "" })
'''

IMPORT_LUA = r'''
local d = require "dkjson"
launch.main:SetMode("BUILD", false, NAME_ARG)
runCallback("OnFrame")
local c, it, ps = d.decode(CHAR_ARG), d.decode(ITEMS_ARG), d.decode(PASSIVES_ARG)
local cd = copyTable(c)
cd.equipment = it.items
cd.guardian = it.guardian
build.importTab:ImportItemsAndSkills(cd, true, true, false)
ps.bandit_choice = ps.bandit_choice or build.configTab.input.bandit
ps.pantheon_major = ps.pantheon_major or build.configTab.input.pantheonMajorGod
ps.pantheon_minor = ps.pantheon_minor or build.configTab.input.pantheonMinorGod
local cd2 = copyTable(c)
cd2.passives = ps
cd2.jewels = ps.items
build.importTab:ImportPassiveTreeAndJewels(cd2, true)
runCallback("OnFrame")
local best, bestDps = build.mainSocketGroup or 1, -1
for i, g in ipairs(build.skillsTab.socketGroupList) do
  if g.enabled ~= false and g.gemList and #g.gemList > 0 then
    build.mainSocketGroup = i
    build.calcsTab:BuildOutput()
    local v = tonumber(build.calcsTab.mainOutput.CombinedDPS) or 0
    if v > bestDps then best, bestDps = i, v end
  end
end
build.mainSocketGroup = best
build.calcsTab:BuildOutput()
return "ok"
'''

COMPARE_LUA = r'''
local dkjson = require "dkjson"
local item = new("Item", ITEM_ARG)
if not item.base then return dkjson.encode({ error = "unknown" }) end
item:NormaliseQuality()
item:BuildModList()
local unsup = {}
for _, list in ipairs({ item.explicitModLines or {}, item.implicitModLines or {}, item.enchantModLines or {},
                        item.scourgeModLines or {}, item.crucibleModLines or {} }) do
  for _, l in ipairs(list) do if l.extra then table.insert(unsup, l.line) end end
end
local KEYS = { "Life", "EnergyShield", "Mana", "TotalEHP", "Armour", "Evasion", "EffectiveBlockChance",
  "EffectiveSpellBlockChance", "EffectiveSpellSuppressionChance", "PhysicalMaximumHitTaken", "FireMaximumHitTaken",
  "ColdMaximumHitTaken", "LightningMaximumHitTaken", "ChaosMaximumHitTaken",
  "FireResist", "ColdResist", "LightningResist", "ChaosResist", "LifeRegenRecovery", "EnergyShieldRegenRecovery",
  "ManaUnreserved", "MovementSpeedMod", "Str", "Dex", "Int", "CritChance", "Speed" }
local it = build.itemsTab
it:UpdateSockets()
local calcFunc, base = build.calcsTab:GetMiscCalculator()
local function pack(t)
  local r = { dps = POVL_DPS(t) }
  for _, k in ipairs(KEYS) do r[k] = tonumber(t[k]) or 0 end
  return r
end
local alt = pack(base)
local results = {}
local isJewel = item.type == "Jewel"
local useSecond = it.activeItemSet and it.activeItemSet.useSecondWeaponSet
for slotName, slot in pairs(it.slots) do
  if it:IsItemValidForSlot(item, slotName) and not slot.inactive and slot.shown()
     and (not slot.weaponSet or slot.weaponSet == (useSecond and 2 or 1)) then
    local cur = it.items[slot.selItemId]
    local o = calcFunc({ repSlotName = slotName, repItem = item })
    table.insert(results, { slot = slot.label or slotName, jewel = slot.nodeId and true or false,
      current = cur and (cur.title or cur.name) or "", old = alt, new = pack(o) })
  end
end
table.sort(results, function(a, b) return (a.new.dps - a.old.dps) > (b.new.dps - b.old.dps) end)
if isJewel and #results > 3 then
  local top = {}
  for i = 1, 3 do top[i] = results[i] end
  results = top
end
local req = item.requirements or {}
local o0 = build.calcsTab.mainOutput or {}
local fehlt = {}
local function chk(k, have, label) local need = tonumber(req[k]) or 0
  if need > 0 and need > (tonumber(have) or 0) then table.insert(fehlt, { what = label, need = need, have = tonumber(have) or 0 }) end end
chk("str", o0.Str, "Stärke"); chk("dex", o0.Dex, "Geschick"); chk("int", o0.Int, "Intelligenz")
local lvl = tonumber(req.level) or 0
if lvl > (build.characterLevel or 100) then table.insert(fehlt, { what = "Level", need = lvl, have = build.characterLevel }) end
local mods = {}
for _, l in ipairs(item.implicitModLines or {}) do table.insert(mods, { t = l.line, k = "impl", bad = l.extra and true or false }) end
for _, l in ipairs(item.explicitModLines or {}) do table.insert(mods, { t = l.line, k = l.crafted and "craft" or (l.fractured and "frac" or "expl"), bad = l.extra and true or false }) end
return dkjson.encode({ name = item.title or item.name, base = item.baseName, rarity = item.rarity, type = item.type,
  jewel = isJewel, unsupported = unsup, results = results, reqFail = fehlt, mods = mods,
  corrupted = item.corrupted and true or false, ilvl = item.itemLevel, quality = item.quality,
  sockets = item.sockets and #item.sockets or 0 })
'''


SHEET_LUA = r'''
local d = require "dkjson"
local o = build.calcsTab.mainOutput or {}
local function n(k) return tonumber(o[k]) or 0 end
local env = build.calcsTab.mainEnv
local ms = env and env.player and env.player.mainSkill
local flags = (ms and ms.skillFlags) or {}
local g = build.skillsTab.socketGroupList[build.mainSocketGroup]
local skill = ""
if g then skill = g.displayLabel or ""; if skill == "" and g.gemList and g.gemList[1] then skill = g.gemList[1].nameSpec or "" end end
local dmg = {}
for _, t in ipairs({ "Physical", "Lightning", "Cold", "Fire", "Chaos" }) do dmg[t] = n(t .. "HitAverage") + n(t .. "Dot") end
local r = {
  skill = skill, level = build.characterLevel,
  class = build.spec and (build.spec.curAscendClassName ~= "None" and build.spec.curAscendClassName or build.spec.curClassName) or "",
  base = build.spec and build.spec.curClassName or "",
  dps = POVL_DPS(o), hit = n("AverageHit"), speed = n("Speed"), crit = n("CritChance"), critMulti = n("CritMultiplier"),
  dot = n("TotalDot"), life = n("Life"), es = n("EnergyShield"), mana = n("Mana"), manaFree = n("ManaUnreserved"),
  ehp = n("TotalEHP"), armour = n("Armour"), evasion = n("Evasion"), block = n("EffectiveBlockChance"),
  spellBlock = n("EffectiveSpellBlockChance"), suppress = n("EffectiveSpellSuppressionChance"),
  fire = n("FireResist"), cold = n("ColdResist"), light = n("LightningResist"), chaos = n("ChaosResist"),
  fireMax = n("FireResistMax"), coldMax = n("ColdResistMax"), lightMax = n("LightningResistMax"), chaosMax = n("ChaosResistMax"),
  hitPhys = n("PhysicalMaximumHitTaken"), hitFire = n("FireMaximumHitTaken"), hitCold = n("ColdMaximumHitTaken"),
  hitLight = n("LightningMaximumHitTaken"), hitChaos = n("ChaosMaximumHitTaken"),
  lifeRegen = n("LifeRegenRecovery"), esRegen = n("EnergyShieldRegenRecovery"), leech = n("LifeLeechGainRate"),
  move = n("MovementSpeedMod"), str = n("Str"), dex = n("Dex"), int = n("Int"),
  dmg = dmg,
  flags = { attack = flags.attack and true or false, spell = flags.spell and true or false, minion = flags.minion and true or false,
            totem = flags.totem and true or false, trap = flags.trap and true or false, mine = flags.mine and true or false,
            brand = flags.brand and true or false, projectile = flags.projectile and true or false, area = flags.area and true or false }
}
return d.encode(r)
'''

GEMS_LUA = r'''
local d = require "dkjson"
local out = {}
for i, g in ipairs(build.skillsTab.socketGroupList) do
  local gems = {}
  for _, gem in ipairs(g.gemList or {}) do
    local ge = gem.grantedEffect or (gem.gemData and gem.gemData.grantedEffect)
    local nm = gem.nameSpec
    if not nm or nm == "" then nm = (ge and ge.name) or gem.skillId or "" end
    table.insert(gems, { name = nm, level = gem.level, quality = gem.quality, enabled = gem.enabled ~= false,
      support = ge and ge.support and true or false, color = ge and ge.color or 0 })
  end
  local from
  if g.sourceItem then from = { kind = "item", name = g.sourceItem.title or g.sourceItem.name, base = g.sourceItem.baseName, rarity = g.sourceItem.rarity, slot = g.slot }
  elseif g.sourceNode then from = { kind = "tree", name = g.sourceNode.dn or g.sourceNode.name, id = g.sourceNode.id }
  elseif g.source and g.source ~= "" then from = { kind = "other", name = tostring(g.source) } end
  table.insert(out, { label = g.displayLabel or g.label or "", slot = g.slot or "", enabled = g.enabled ~= false,
    main = (i == build.mainSocketGroup), gems = gems, from = from })
end
return d.encode(out)
'''

GEMINFO_LUA = r'''
local d = require "dkjson"
local names = d.decode(NAMES_ARG)
local byName = {}
for _, gem in pairs(data.gems) do
  if gem.name and gem.grantedEffect then
    byName[gem.name:lower()] = gem
    if gem.grantedEffect.support then byName[(gem.name .. " support"):lower()] = gem end
  end
end
local function stats(ge, level, quality)
  local ok, s = pcall(function()
    local inst = { level = level, quality = quality }
    if ge.statSets then return calcLib.buildSkillInstanceStats(inst, ge, ge.statSets[1]) end
    return calcLib.buildSkillInstanceStats(inst, ge)
  end)
  if ok then return s end
end
local function desc(ge, st)
  if not st then return {} end
  local ok, lines = pcall(data.describeStats, st, ge.statDescriptionScope)
  if ok and type(lines) == "table" then
    local o = {}
    for _, l in ipairs(lines) do if type(l) == "string" then table.insert(o, (l:gsub("%^x%x%x%x%x%x%x", ""):gsub("%^%d", ""))) end end
    return o
  end
  return {}
end
local function kosten(lv)
  if not lv then return nil end
  if lv.cost then for k, v in pairs(lv.cost) do return { k, v } end end
  if lv.manaCost then return { "Mana", lv.manaCost } end
end
-- Attribut-Anforderung (Stärke/Geschick/Intelligenz) für ein Gem-Level
local function att(gem, ge, lvl)
  if not gem then return nil end
  local lr = ge.levels and ge.levels[lvl] and ge.levels[lvl].levelRequirement or lvl
  local o = {}
  for _, k in ipairs({ "Str", "Dex", "Int" }) do
    local m = gem["req" .. k]
    if m and m > 0 then
      local ok, v = pcall(calcLib.getGemStatRequirement, lr, m)
      if not ok or type(v) ~= "number" then ok, v = pcall(calcLib.getGemStatRequirement, lr, ge.support, m) end
      if ok and type(v) == "number" and v > 0 then o[k] = v end
    end
  end
  return next(o) and o or nil
end
local r = {}
for _, nm in ipairs(names) do
  local gem = byName[nm:lower()]
  local ge = gem and gem.grantedEffect or data.skills[nm]
  if ge then
    local maxL = 20
    if ge.levels and not ge.levels[20] then maxL = #ge.levels end
    local q = {}
    for _, s in ipairs(ge.qualityStats or {}) do if type(s) == "table" and s[1] then q[s[1]] = math.floor((s[2] or 0) * 20) end end
    r[nm] = { name = (gem and gem.name) or ge.name, support = ge.support and true or false, tags = gem and gem.tagString or "",
      desc = ge.description, maxL = maxL,
      l1 = desc(ge, stats(ge, 1, 0)), lmax = desc(ge, stats(ge, maxL, 0)), q20 = desc(ge, q),
      req1 = ge.levels and ge.levels[1] and ge.levels[1].levelRequirement, reqMax = ge.levels and ge.levels[maxL] and ge.levels[maxL].levelRequirement,
      c1 = kosten(ge.levels and ge.levels[1]), cMax = kosten(ge.levels and ge.levels[maxL]),
      gem = gem ~= nil, tier = gem and (gem.Tier or gem.tier), att = att(gem, ge, 1), attMax = att(gem, ge, maxL),
      reqTier = gem and (gem.Tier or gem.tier) and ge.levels and ge.levels[gem.Tier or gem.tier] and ge.levels[gem.Tier or gem.tier].levelRequirement,
      attTier = gem and (gem.Tier or gem.tier) and att(gem, ge, gem.Tier or gem.tier) }
  end
end
return d.encode(r)
'''

UPGRADE_LUA = r"""
local d = require "dkjson"
local q = d.decode(REQ_ARG)
local it = build.itemsTab
it:UpdateSockets()
local function pack(t)
  return { dps = POVL_DPS(t), ehp = tonumber(t.TotalEHP) or 0, life = tonumber(t.Life) or 0, es = tonumber(t.EnergyShield) or 0,
    ign = tonumber(t.IgniteDPS) or 0, hit = tonumber(t.TotalDPS) or 0,
    phys = tonumber(t.PhysicalHitAverage) or 0, fireHit = tonumber(t.FireHitAverage) or 0,
    allHit = (tonumber(t.PhysicalHitAverage) or 0) + (tonumber(t.FireHitAverage) or 0) + (tonumber(t.ColdHitAverage) or 0) + (tonumber(t.LightningHitAverage) or 0) + (tonumber(t.ChaosHitAverage) or 0),
    fire = tonumber(t.FireResist) or 0, cold = tonumber(t.ColdResist) or 0, light = tonumber(t.LightningResist) or 0, chaos = tonumber(t.ChaosResist) or 0,
    speed = tonumber(t.MovementSpeedMod) or 0 }
end
-- Zeilen eines Items: Verzauberung, Implicits, Explicits; x = Path of Building rechnet die Zeile nicht (z. B. "Ignite breitet sich aus")
local function zeilen(item)
  local o = {}
  if not item then return o end
  local function add(list, k)
    for _, l in ipairs(list or {}) do
      if l.line and l.line ~= "" and item:CheckModLineVariant(l) then
        local okR, tt = pcall(itemLib.applyRange, l.line, l.range or (main and main.defaultItemAffixQuality) or 0.5, l.valueScalar)
        table.insert(o, { t = (okR and tt) or l.line, k = k, x = (l.extra and l.extra ~= "") and true or nil, c = l.crafted and true or nil })
      end
    end
  end
  add(item.enchantModLines, "e"); add(item.runeModLines, "r"); add(item.scourgeModLines, "i"); add(item.implicitModLines, "i"); add(item.explicitModLines, "m"); add(item.crucibleModLines, "m")
  return o
end
local function req(item) return item and item.requirements and tonumber(item.requirements.level) or 0 end
-- Flasks so rechnen, wie man sie im Spiel benutzt: alle aktiv
local flaskVorher = {}
local AKTIV = { "Flask 1", "Flask 2", "Flask 3", "Flask 4", "Flask 5", "Charm 1", "Charm 2", "Charm 3" }
local POE2 = it.slots["Charm 1"] ~= nil
for i, n in ipairs(AKTIV) do local sl = it.slots[n]; if sl then flaskVorher[i] = sl.active; sl.active = true end end
local ok, res = pcall(function()
  local calcFunc = build.calcsTab:GetMiscCalculator()
  local alt = pack(calcFunc({}, true))
  -- leerer Ersatz: gleiche Basis ohne Mods (zeigt, was die Mods des aktuellen Items wert sind)
  local function leer(cur)
    if not cur or not cur.baseName then return nil end
    local txt = (cur.type == "Flask" and not POE2) and "Rarity: NORMAL\nDivine Life Flask" or ("Rarity: NORMAL\n" .. cur.baseName)
    local ok1, x = pcall(new, "Item", txt)
    if not (ok1 and x and x.base) then ok1, x = pcall(new, "Item", "Rarity: NORMAL\n" .. cur.baseName) end
    if ok1 and x and x.base then x:BuildModList(); return x end
  end
  local function rechne(slot, item)
    local ok2, o = pcall(calcFunc, { repSlotName = slot, repItem = item }, true)
    if ok2 and o then return pack(o) end
  end
  local HAUPT = { "Weapon 1", "Weapon 2", "Helmet", "Body Armour", "Gloves", "Boots", "Amulet", "Ring 1", "Ring 2", "Ring 3", "Belt", "Flask 1", "Flask 2", "Flask 3", "Flask 4", "Flask 5", "Charm 1", "Charm 2", "Charm 3" }
  local out = { alt = alt, slots = {}, guide = {}, scan = {} }
  local cur = {}
  for _, sn in ipairs(HAUPT) do
    local sl = it.slots[sn]
    if sl then cur[sn] = it.items[sl.selItemId] end
  end
  if q.mode == "warum" then
    -- Erklärung: welche Werte sich ändern und was jede einzelne Zeile bringt (Zeile herausnehmen und neu rechnen)
    local KEYS = { "CombinedDPS", "TotalDPS", "IgniteDPS", "BleedDPS", "PoisonDPS", "TotalDot", "ImpaleDPS", "AverageHit", "Speed", "CritChance", "CritMultiplier", "HitChance",
      "IgniteChanceOnHit", "FireEffMult", "ColdEffMult", "LightningEffMult", "PhysicalEffMult", "ChaosEffMult", "FireDotEffMult",
      "Life", "EnergyShield", "Mana", "Armour", "Evasion", "TotalEHP", "FireResist", "ColdResist", "LightningResist", "ChaosResist",
      "BlockChance", "SpellBlockChance", "SpellSuppressionChance", "MovementSpeedMod", "LifeRegenRecovery", "Str", "Dex", "Int" }
    local function detail(o)
      local r = {}
      for _, k in ipairs(KEYS) do local v = tonumber(o and o[k]); if v and v == v and v ~= math.huge then r[k] = v end end
      r.FullDPS = POVL_DPS(o or {})
      return r
    end
    local item
    if q.text then
      local ok1, x = pcall(new, "Item", q.text); if ok1 then item = x end
    elseif q.uname then
      if not POVL_UQ then return { error = "noscan" } end
      for _, l in pairs(POVL_UQ) do for _, x in ipairs(l) do if (x.title or x.name) == q.uname then item = x end end end
    end
    if not item or not item.base then return { error = "Item nicht gefunden" } end
    item:NormaliseQuality(); item:BuildModList()
    local sn = q.slot
    local okA, oA = pcall(calcFunc, {}, true)
    local okN, oN = pcall(calcFunc, { repSlotName = sn, repItem = item }, true)
    if not (okA and okN) then return { error = "Rechnung fehlgeschlagen" } end
    local LISTEN = { "enchantModLines", "runeModLines", "scourgeModLines", "implicitModLines", "explicitModLines", "crucibleModLines" }
    local function anzeigen(l)
      local ok3, t = pcall(itemLib.applyRange, l.line, l.range or (main and main.defaultItemAffixQuality) or 0.5, l.valueScalar)
      return ok3 and t or l.line
    end
    local function beitrag(it0, basis)
      local res = {}
      if not it0 then return res end
      local roh = it0:BuildRaw()
      for _, ln in ipairs(LISTEN) do
        for i, l in ipairs(it0[ln] or {}) do
          if l.line and l.line ~= "" and it0:CheckModLineVariant(l) then
            local ok4, kopie = pcall(new, "Item", roh)
            local e = { t = anzeigen(l), k = (ln == "implicitModLines" or ln == "scourgeModLines") and "i" or ln == "enchantModLines" and "e" or ln == "runeModLines" and "r" or "m", x = (l.extra and l.extra ~= "") and true or nil }
            if ok4 and kopie and kopie[ln] and kopie[ln][i] then
              table.remove(kopie[ln], i); kopie:BuildModList()
              local ok5, o = pcall(calcFunc, { repSlotName = sn, repItem = kopie }, true)
              if ok5 and o then
                local b = basis
                e.dps = (POVL_DPS(b) > 0) and ((POVL_DPS(b) - POVL_DPS(o)) / POVL_DPS(b) * 100) or 0
                e.ehp = ((tonumber(b.TotalEHP) or 0) > 0) and (((tonumber(b.TotalEHP) or 0) - (tonumber(o.TotalEHP) or 0)) / tonumber(b.TotalEHP) * 100) or 0
                e.speed = ((tonumber(b.MovementSpeedMod) or 0) - (tonumber(o.MovementSpeedMod) or 0)) * 100
              end
            end
            table.insert(res, e)
          end
        end
      end
      return res
    end
    return { alt = detail(oA), neu = detail(oN), neuZeilen = beitrag(item, oN), curZeilen = beitrag(cur[sn], oA),
      name = item.title or item.name, base = item.baseName, rarity = item.rarity, typ = item.type }
  end
  if q.mode == "baumwert" then
    -- Skilltree-Reihenfolge: Wert von Knoten-Mengen gegenüber einem Teil-Baum (basis), relativ zum vollen Baum des Builds
    local spec = build.spec
    local voll = {}
    for id, node in pairs(spec.allocNodes) do voll[id] = node end
    local function setOf(list) local t = {} for _, id in ipairs(list or {}) do t[tonumber(id)] = true end return t end
    local basis = setOf(q.basis)
    local function calc(extra)
      local add, rem = {}, {}
      for id, node in pairs(voll) do
        if not basis[id] and not (extra and extra[id]) and not node.ascendancyName and node.type ~= "ClassStart" and node.type ~= "AscendClassStart" then rem[node] = true end
      end
      for id in pairs(basis) do local n = spec.nodes[id]; if n and not voll[id] then add[n] = true end end
      if extra then for id in pairs(extra) do local n = spec.nodes[id]; if n and not voll[id] then add[n] = true end end end
      local okc, o = pcall(calcFunc, { addNodes = add, removeNodes = rem }, true)
      return okc and o and pack(o) or nil
    end
    local o0 = calc(nil)
    if not o0 then return { error = "Rechnung fehlgeschlagen" } end
    local res = {}
    for _, k in ipairs(q.kand or {}) do
      local o = calc(setOf(k.nodes))
      if o then
        table.insert(res, { key = k.key, dps = o0.dps > 0 and (o.dps / o0.dps - 1) * 100 or 0, ehp = o0.ehp > 0 and (o.ehp / o0.ehp - 1) * 100 or 0,
          dpsAbs = o.dps - o0.dps, ehpAbs = o.ehp - o0.ehp,
          life = o.life - o0.life, es = o.es - o0.es, speed = o.speed - o0.speed })
      end
    end
    return { res = res, basisDps = o0.dps, basisEhp = o0.ehp, vollDps = alt.dps, vollEhp = alt.ehp }
  end
  if q.mode == "modwert" then
    -- Was bringt ein einzelner Mod auf dieser Basis deinem Build? (seltenes Item nur mit diesem Mod gegen die leere Basis)
    local function mk(zeilen)
      local raw = "Rarity: RARE\nCompanion\n" .. q.base .. "\nItem Level: " .. tostring(q.ilvl or 82) .. "\nImplicits: 0\n" .. table.concat(zeilen, "\n")
      local ok1, x = pcall(new, "Item", raw)
      if ok1 and x and x.base then x:NormaliseQuality(); x:BuildModList(); return x end
    end
    local leerI = mk({})
    if not leerI then return { error = "Basis unbekannt: " .. tostring(q.base) } end
    local slot = q.slot
    if not it.slots[slot] then return { error = "Slot fehlt: " .. tostring(slot) } end
    local o0 = rechne(slot, leerI)
    if not o0 then return { error = "Rechnung fehlgeschlagen" } end
    local res = {}
    for _, m in ipairs(q.mods or {}) do
      local zeilen = {}
      for l in (m.text or ""):gmatch("[^\n]+") do table.insert(zeilen, l) end
      local x = mk(zeilen)
      local o = x and rechne(slot, x)
      if o then
        local nb = {}
        for _, l in ipairs(x.explicitModLines or {}) do if l.extra and l.extra ~= "" then table.insert(nb, l.line) end end
        table.insert(res, { id = m.id, dps = (o.dps - o0.dps) / (alt.dps > 0 and alt.dps or 1) * 100,
          ehp = (o.ehp - o0.ehp) / (alt.ehp > 0 and alt.ehp or 1) * 100, speed = (o.speed - o0.speed) * 100, nb = nb })
      end
    end
    return { res = res }
  end
  if q.mode == "modpool" then
    -- PoE1: alle Mods, die auf der Basis des Items in diesem Slot rollen können (beste Stufe fürs Itemlevel)
    local c = cur[q.slot]
    if not c or not c.base then return { error = "leer" } end
    local tags = {}
    for k, v in pairs(c.base.tags or {}) do if v then tags[k] = true end end
    local gruppen = {}
    for id, mod in pairs(data.itemMods.Item) do
      if (mod.type == "Prefix" or mod.type == "Suffix") and (mod.level or 1) <= (q.ilvl or 84) and mod.weightKey then
        local w = 0
        for i, key in ipairs(mod.weightKey) do if tags[key] or key == "default" then w = mod.weightVal[i] or 0; break end end
        if w > 0 then
          local g = (mod.group or id) .. mod.type
          local e = gruppen[g]
          if not e or (mod.level or 1) > e.lvl then
            local zeilen = {}
            for _, l in ipairs(mod) do table.insert(zeilen, (tostring(l):gsub("%((%-?[%d%.]+)%-(%-?[%d%.]+)%)", "%2"))) end
            gruppen[g] = { id = id, typ = mod.type, lvl = mod.level or 1, text = table.concat(zeilen, "\n"), affix = mod.affix }
          end
        end
      end
    end
    local out = {}
    for _, e in pairs(gruppen) do table.insert(out, e) end
    return { base = c.baseName, name = c.title or c.name, mods = out }
  end
  if q.mode == "mods" then
    -- Zusätzliche Charakter-Mods (z. B. Wickerman-Viscera) testweise in den Build geben
    local res = {}
    local orig = build.configTab.modList
    for _, m in ipairs(q.mods or {}) do
      local ml = new("ModList"); ml:AddList(orig)
      local n, extra = 0, {}
      for line in (m.text or ""):gmatch("[^\n]+") do
        local mods, ex = modLib.parseMod(line)
        if mods and not ex then
          for _, mod in ipairs(mods) do ml:AddMod(modLib.setSource(mod, "Companion")); n = n + 1 end
        else
          table.insert(extra, line)
        end
      end
      local e = { id = m.id, n = n, extra = extra }
      if n > 0 then
        build.configTab.modList = ml
        local ok6, o = pcall(calcFunc, {}, true)
        build.configTab.modList = orig
        if ok6 and o then e.neu = pack(o) end
      end
      table.insert(res, e)
    end
    build.configTab.modList = orig
    return { alt = alt, mods = res }
  end
  if q.mode ~= "scan" then
    for _, sn in ipairs(HAUPT) do
      local sl = it.slots[sn]
      if sl then
        local c = cur[sn]
        local e = { slot = sn, name = c and (c.title or c.name) or "", base = c and c.baseName or "", rarity = c and c.rarity or "", typ = c and c.type or "",
          sub = c and c.base and c.base.subType or "", req = req(c), lines = zeilen(c) }
        if c then local l = leer(c); if l then e.ohne = rechne(sn, l) end end
        table.insert(out.slots, e)
      end
    end
    for _, g in ipairs(q.items or {}) do
      local ok1, item = pcall(new, "Item", g.text)
      if ok1 and item and item.base and it.slots[g.slot] then
        item:NormaliseQuality(); item:BuildModList()
        local c = cur[g.slot]
        local n = rechne(g.slot, item)
        if n then
          local mods = {}
          for _, l in ipairs(item.explicitModLines or {}) do if #mods < 6 then table.insert(mods, l.line) end end
          table.insert(out.guide, { slot = g.slot, name = item.title or item.name, base = item.baseName, rarity = item.rarity, typ = item.type,
            cur = c and (c.title or c.name) or "", curRarity = c and c.rarity or "", req = req(item), neu = n, mods = mods, lines = zeilen(item), i = g.i })
        end
      end
    end
    return out
  end
  -- Scan: alle Uniques (bzw. Flask-Vorlagen) eines Typs gegen den passenden Slot rechnen
  if not POVL_UQ then
    POVL_UQ = {}
    for _, liste in pairs(data.uniques) do
      for _, raw in pairs(liste) do
        local ok1, item = pcall(new, "Item", raw, "UNIQUE", true)
        if ok1 and item and item.base and item.type then
          POVL_UQ[item.type] = POVL_UQ[item.type] or {}
          table.insert(POVL_UQ[item.type], item)
        end
      end
    end
    for _, l in pairs(POVL_UQ) do table.sort(l, function(a, b) return (a.name or "") < (b.name or "") end) end
  end
  local kand = {}
  if q.typ == "FlaskMagic" then
    for _, txt in ipairs(q.texte or {}) do
      local ok1, item = pcall(new, "Item", txt)
      if ok1 and item and item.base then table.insert(kand, item) end
    end
  elseif q.namen then
    local w = {}
    for _, n in ipairs(q.namen) do w[n:lower()] = true end
    for _, l in pairs(POVL_UQ) do for _, item in ipairs(l) do if w[(item.title or item.name or ""):lower()] then table.insert(kand, item) end end end
  else
    local l = POVL_UQ[q.typ] or {}
    for i = (q.von or 1), math.min(#l, (q.von or 1) + (q.n or 40) - 1) do table.insert(kand, l[i]) end
    out.gesamt = #l
  end
  local function slotsFuer(item)
    local t = item.type
    if t == "Ring" then return it.slots["Ring 3"] and { "Ring 1", "Ring 2", "Ring 3" } or { "Ring 1", "Ring 2" } end
    if t == "Charm" then return { q.charmSlot or "Charm 1" } end
    if t == "Flask" then
      if POE2 then
        if (item.baseName or ""):match("Mana") then return { "Flask 2" } end
        return { "Flask 1" }
      end
      return { q.flaskSlot or "Flask 5" }
    end
    for _, sn in ipairs({ "Helmet", "Body Armour", "Gloves", "Boots", "Amulet", "Belt" }) do
      if cur[sn] and cur[sn].type == t then return { sn } end
      if not cur[sn] and ({ Helmet = "Helmet", ["Body Armour"] = "Body Armour", Gloves = "Gloves", Boots = "Boots", Amulet = "Amulet", Belt = "Belt" })[sn] == t then return { sn } end
    end
    if cur["Weapon 1"] and cur["Weapon 1"].type == t then return { "Weapon 1" } end
    if cur["Weapon 2"] and cur["Weapon 2"].type == t then return { "Weapon 2" } end
    return {}
  end
  for _, item in ipairs(kand) do
    item:NormaliseQuality(); item:BuildModList()
    local best, bs
    for _, sn in ipairs(slotsFuer(item)) do
      local n = rechne(sn, item)
      if n and (not best or n.dps + n.ehp * 0.01 > best.dps + best.ehp * 0.01) then best, bs = n, sn end
    end
    if best then
      local c = cur[bs]
      table.insert(out.scan, { slot = bs, name = item.title or item.name, base = item.baseName, rarity = item.rarity, typ = item.type, req = req(item),
        cur = c and (c.title or c.name) or "", curRarity = c and c.rarity or "", neu = best, lines = zeilen(item) })
    end
  end
  return out
end)
for i, n in ipairs(AKTIV) do local sl = it.slots[n]; if sl then sl.active = flaskVorher[i] end end
if not ok then return d.encode({ error = tostring(res) }) end
return d.encode(res)
"""


AFFIX_LUA = r"""
local d = require "dkjson"
local q = d.decode(REQ_ARG)
local base = data.itemBases[q.base]
if not base then return d.encode({ error = "Basis unbekannt" }) end
local tags = {}
for k, v in pairs(base.tags or {}) do if v then tags[k] = true end end
local haben = {}
for _, g in ipairs(q.haben or {}) do haben[g] = true end
local out = {}
for _, typ in ipairs(q.typen or {}) do
  local gruppen, summe = {}, 0
  for id, mod in pairs(data.itemMods.Item) do
    if mod.type == typ and (mod.level or 1) <= (q.ilvl or 100) and mod.weightKey then
      local w = 0
      for i, key in ipairs(mod.weightKey) do
        if tags[key] or key == "default" then w = mod.weightVal[i] or 0; break end
      end
      if w > 0 then
        local g = mod.group or id
        summe = summe + w
        local e = gruppen[g]
        if not e then e = { group = g, w = 0, best = nil, lvl = -1 }; gruppen[g] = e end
        e.w = e.w + w
        if (mod.level or 1) > e.lvl then
          e.lvl = mod.level or 1
          local zeilen = {}
          for i = 1, 4 do if type(mod[i]) == "string" then table.insert(zeilen, mod[i]) end end
          e.best = table.concat(zeilen, " / ")
          e.affix = mod.affix
        end
      end
    end
  end
  local liste = {}
  for g, e in pairs(gruppen) do
    -- Gruppe schon auf dem Item? Dann kann sie nicht nochmal kommen
    local doppelt = false
    for _, t in ipairs(q.texte or {}) do
      local a = (e.best or ""):gsub("%b()", "#"):gsub("[%d%.]+", "#"):lower()
      local b = t:gsub("%b()", "#"):gsub("[%d%.]+", "#"):lower()
      if a:sub(1, 18) == b:sub(1, 18) then doppelt = true end
    end
    if not doppelt then table.insert(liste, { text = e.best, affix = e.affix, chance = summe > 0 and (e.w / summe * 100) or 0, lvl = e.lvl }) end
  end
  table.sort(liste, function(a, b) return a.chance > b.chance end)
  local top = {}
  for i = 1, math.min(14, #liste) do top[i] = liste[i] end
  out[typ] = { anzahl = #liste, top = top }
end
return d.encode(out)
"""


TIMELESS_LUA = r"""
local d = require "dkjson"
local req = d.decode(REQ_ARG)
local tree = build.spec.tree
local L = tree.legion
local ADD = data.timelessJewelAdditions or #L.additions
local TYPES = { {1, "Glorious Vanity", "vaal"}, {2, "Lethal Pride", "karui"}, {3, "Brutal Restraint", "maraketh"}, {4, "Militant Faith", "templar"}, {5, "Elegant Hubris", "eternal"} }
local function radius(sock)
  local n = tree.nodes[sock]
  if not n or not n.nodesInRadius then return {} end
  return n.nodesInRadius[3] or {}
end
local roots = {}
for _, c in pairs(tree.classes or {}) do if c.startNodeId then roots[c.startNodeId] = true end end
local function fuellen(node, werte)
  -- Wertebereiche "(a-b)" durch die echten Werte ersetzen (Glorious Vanity)
  local out = {}
  local vals = {}
  if werte and node.sortedStats then
    for i, st in ipairs(node.sortedStats) do local s = node.stats[st]; if s then vals[i] = werte[s.index + 1] end end
  end
  local vi = 0
  for _, line in ipairs(node.sd or {}) do
    local l = line:gsub("%(%-?[%d%.]+%-%-?[%d%.]+%)", function() vi = vi + 1; return vals[vi] and tostring(vals[vi]) or nil end)
    table.insert(out, l)
  end
  return out
end
local function effekt(typ, seed, nid)
  local tn = tree.nodes[nid]
  local t = data.readLUT(seed, nid, typ)
  if not t or not next(t) then return nil end
  if typ == 1 then
    local h = #t
    if h == 2 or h == 3 then
      local nd = L.nodes[t[1] + 1 - ADD]
      if nd then return { mode = "ersetzt", id = nd.id, name = nd.dn, sd = fuellen(nd, t) } end
    elseif h == 6 or h == 8 then
      local sd, ids = {}, {}
      for i = 1, h / 2 do
        local a = L.additions[t[i] + 1]
        if a then
          table.insert(ids, a.id)
          local v = t[i + h / 2]
          for _, line in ipairs(a.sd or {}) do table.insert(sd, (line:gsub("%(%-?[%d%.]+%-%-?[%d%.]+%)", tostring(v), 1))) end
        end
      end
      return { mode = "dazu", ids = ids, name = tn.dn or tn.name, sd = sd }
    end
    return nil
  end
  if t[1] >= ADD then
    local nd = L.nodes[t[1] + 1 - ADD]
    if nd then return { mode = "ersetzt", id = nd.id, name = nd.dn, sd = fuellen(nd) } end
  else
    local a = L.additions[t[1] + 1]
    if a then return { mode = "dazu", id = a.id, name = a.dn, sd = fuellen(a) } end
  end
  return nil
end
local function ziele(sock, nurSkill)
  local out = {}
  for id, n in pairs(radius(sock)) do
    if not roots[id] and not n.isJewelSocket and not n.isKeystone and not n.isMastery and (n.isNotable or true) then
      if not nurSkill or build.spec.allocNodes[id] then table.insert(out, n) end
    end
  end
  table.sort(out, function(a, b) return (a.isNotable and 0 or 1) < (b.isNotable and 0 or 1) or ((a.isNotable and 0 or 1) == (b.isNotable and 0 or 1) and (a.dn or "") < (b.dn or "")) end)
  return out
end
local r = {}
if req.action == "meta" then
  r.types = {}
  for _, ty in ipairs(TYPES) do
    local mods = {}
    for _, nd in pairs(L.nodes) do
      if nd.id:match("^" .. ty[3] .. "_") and nd["not"] and not nd.ks then table.insert(mods, { id = nd.id, name = nd.dn, sd = nd.sd }) end
    end
    if ty[1] ~= 1 then
      for _, a in pairs(L.additions) do
        if a.id:match("^" .. ty[3] .. "_") then table.insert(mods, { id = a.id, name = a.dn, sd = a.sd, add = true }) end
      end
    else
      for _, nd in pairs(L.nodes) do
        if nd.id:match("^vaal_") and not nd["not"] and not nd.ks then table.insert(mods, { id = nd.id, name = nd.dn, sd = nd.sd, small = true }) end
      end
    end
    table.sort(mods, function(a, b) return a.name < b.name end)
    table.insert(r.types, { id = ty[1], name = ty[2], min = data.timelessJewelSeedMin[ty[1]] * (ty[1] == 5 and 20 or 1), max = data.timelessJewelSeedMax[ty[1]] * (ty[1] == 5 and 20 or 1), mods = mods })
  end
  r.sockets = {}
  for id, n in pairs(tree.nodes) do
    if n.isJewelSocket and not n.expansionJewel and n.nodesInRadius and next(radius(id)) then
      local ks, best = nil, 1e18
      local nn, alloc = 0, 0
      for nid, x in pairs(radius(id)) do
        if x.isNotable then nn = nn + 1; if build.spec.allocNodes[nid] then alloc = alloc + 1 end end
        if x.isKeystone then local dd = (x.x - n.x) ^ 2 + (x.y - n.y) ^ 2; if dd < best then best = dd; ks = x.dn end end
      end
      if nn > 0 then table.insert(r.sockets, { id = id, ks = ks or "", notables = nn, alloc = alloc, mine = build.spec.allocNodes[id] and true or false }) end
    end
  end
  table.sort(r.sockets, function(a, b) if a.mine ~= b.mine then return a.mine end return a.alloc > b.alloc end)
elseif req.action == "seed" then
  local typ, seed = req.type, req.seed
  if typ == 5 and seed % 20 ~= 0 then seed = seed - seed % 20 end
  r.seed = seed
  r.nodes = {}
  for _, n in ipairs(ziele(req.socket, false)) do
    local e = (n.isNotable or typ == 1) and effekt(typ, seed, n.id) or nil
    table.insert(r.nodes, { id = n.id, name = n.dn, notable = n.isNotable and true or false, alloc = build.spec.allocNodes[n.id] and true or false,
      attr = (n.dn == "Strength" or n.dn == "Dexterity" or n.dn == "Intelligence"), orig = n.sd, e = e })
  end
elseif req.action == "search" then
  local typ = req.type
  local want = {}
  for _, w in ipairs(req.wants or {}) do want[w.id] = w end
  local mult = typ == 5 and 20 or 1
  local socks = req.sockets or { req.socket }
  local res = {}
  for _, sock in ipairs(socks) do
    local tz = {}
    for _, n in ipairs(ziele(sock, req.onlyAlloc)) do if n.isNotable or typ == 1 then table.insert(tz, n) end end
    for s = data.timelessJewelSeedMin[typ] * mult, data.timelessJewelSeedMax[typ] * mult, mult do
      local score, hits, cnt = 0, {}, {}
      for _, n in ipairs(tz) do
        local e = effekt(typ, s, n.id)
        if e then
          local ids = e.ids or { e.id }
          for _, id in ipairs(ids) do
            local w = want[id]
            if w then
              score = score + (w.w or 1)
              cnt[id] = (cnt[id] or 0) + 1
              table.insert(hits, { node = n.dn, name = e.name, sd = e.sd, alloc = build.spec.allocNodes[n.id] and true or false })
            end
          end
        end
      end
      local ok = score > 0
      for id, w in pairs(want) do if w.min and w.min > 0 and (cnt[id] or 0) < w.min then ok = false end end
      if ok then table.insert(res, { seed = s, socket = sock, score = score, hits = hits }) end
    end
  end
  table.sort(res, function(a, b) return a.score > b.score end)
  r.total = #res
  r.results = {}
  for i = 1, math.min(40, #res) do r.results[i] = res[i] end
end
return d.encode(r)
"""


GEMCOLOR_LUA = r'''
local d = require "dkjson"
local names = d.decode(NAMES_ARG)
local want = {}
for _, n in ipairs(names) do want[n:lower()] = n end
local r = {}
for _, gem in pairs(data.gems) do
  local nm = gem.name and gem.name:lower()
  local ge = gem.grantedEffect
  if nm and want[nm] and ge then r[want[nm]] = { color = ge.color or 0, support = ge.support and true or false } end
  if nm and ge and ge.support and want[(nm .. " support")] then r[want[nm .. " support"]] = { color = ge.color or 0, support = true } end
end
return d.encode(r)
'''


class PoB:
    def __init__(self, status=print):
        inst = find_pob_install()
        ensure_source(status)
        status('Bereite Daten vor...')
        prepare_jewels()
        self.lua = Lua(inst)
        self._in_src(lambda: (
            self.lua.run(f'package.path = {lstr(RT)} .. "\\\\?.lua;" .. {lstr(RT)} .. "\\\\?\\\\init.lua;" .. package.path; '
                         f'package.cpath = {lstr(inst)} .. "\\\\?.dll;" .. package.cpath; arg = {{}}'),
            self.lua.run('dofile("HeadlessWrapper.lua") return "ok"'),
            self.lua.run(FILESEARCH_LUA)))

    def _in_src(self, fn):
        old = os.getcwd()
        os.chdir(SRC)
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

    def load_character(self, account, charname, realm='pc'):
        chars = list_characters(account, realm)
        match = [c for c in chars if c['name'].lower() == charname.strip().lower()]
        if not match:
            raise RuntimeError('Charakter "%s" nicht gefunden.' % charname)
        c = match[0]
        items = poe_get('get-items', accountName=account.strip(), character=c['name'], realm=realm or 'pc')
        passives = poe_get('get-passive-skills', accountName=account.strip(), character=c['name'], realm=realm or 'pc')
        code = (IMPORT_LUA.replace('NAME_ARG', lstr(c['name']))
                .replace('CHAR_ARG', lstr(json.dumps(c)))
                .replace('ITEMS_ARG', lstr(json.dumps(items)))
                .replace('PASSIVES_ARG', lstr(json.dumps(passives))))
        self._in_src(lambda: self.lua.run(code))
        s = self.stats()
        s.update(char=c['name'], league=c.get('league', ''))
        return s

    def stats(self):
        return json.loads(self.lua.run(STATS_LUA))

    def char_tree(self):
        """Geskillte Punkte und Mastery-Auswahl des geladenen Charakters."""
        return json.loads(self.lua.run(r'''
local d = require "dkjson"
local ns, ms = {}, {}
for id, _ in pairs(build.spec.allocNodes) do if type(id) == "number" then table.insert(ns, tostring(id)) end end
for id, eff in pairs(build.spec.masterySelections or {}) do ms[tostring(id)] = tostring(eff) end
return d.encode({ nodes = ns, mast = ms, base = build.spec.curClassName })
'''))

    def sheet(self):
        """Ausführlicher Charakterbogen inklusive Merkmalen für den Map-Check."""
        return json.loads(self.lua.run(SHEET_LUA))

    def gems(self):
        """Gem-Gruppen des geladenen Builds."""
        return json.loads(self.lua.run(GEMS_LUA))

    def gem_colors(self, names):
        code = GEMCOLOR_LUA.replace('NAMES_ARG', lstr(json.dumps(list(names))))
        return json.loads(self.lua.run(code))

    def upgrades(self, req):
        code = UPGRADE_LUA.replace('REQ_ARG', lstr(json.dumps(req)))
        return json.loads(self._in_src(lambda: self.lua.run(code)))

    def affixe(self, req):
        code = AFFIX_LUA.replace('REQ_ARG', lstr(json.dumps(req)))
        return json.loads(self._in_src(lambda: self.lua.run(code)))

    def timeless(self, req):
        code = TIMELESS_LUA.replace('REQ_ARG', lstr(json.dumps(req)))
        return json.loads(self._in_src(lambda: self.lua.run(code)))

    def gem_info(self, names):
        code = GEMINFO_LUA.replace('NAMES_ARG', lstr(json.dumps(sorted(n for n in names if n))))
        return json.loads(self._in_src(lambda: self.lua.run(code)))

    def compare(self, item_text):
        code = COMPARE_LUA.replace('ITEM_ARG', lstr(item_text.replace('\r', '')))
        return json.loads(self._in_src(lambda: self.lua.run(code)))


