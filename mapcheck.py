"""PoE Companion – Map-Check: bewertet Map-Mods passend zu deinem Build."""
import re

# (Muster, Kurzname, Basis-Gefahr 1-3, Bedingung für höhere Gefahr, Erklärung)
# Gefahr: 3 = für deinen Build nicht machbar/sehr gefährlich, 2 = Vorsicht, 1 = merklich, 0 = harmlos
RULES = [
    (r'reflect \d+% of Elemental Damage', 'Elementar-Reflect', 1, 'elemental', 'Wirft deinen Elementarschaden auf dich zurück.'),
    (r'reflect \d+% of Physical Damage', 'Physischer Reflect', 1, 'physical', 'Wirft deinen physischen Schaden auf dich zurück.'),
    (r'cannot Regenerate Life, Mana or Energy Shield', 'Keine Regeneration', 2, 'regen', 'Leben, Mana und ES regenerieren nicht.'),
    (r'less Recovery Rate of Life and Energy Shield', 'Weniger Erholung', 2, 'sustain', 'Leben und ES erholen sich deutlich langsamer.'),
    (r'Cannot Leech|cannot be Leeched from', 'Kein Leech', 1, 'leech', 'Leech funktioniert nicht.'),
    (r'to all maximum Resistances|maximum (Player )?(Elemental )?Resistances', 'Weniger Max-Resis', 2, None, 'Deine maximalen Resistenzen sinken, du nimmst mehr Elementarschaden.'),
    (r'reduced Chance to Block|less Chance to Block', 'Weniger Block', 1, 'block', 'Deine Blockchance sinkt.'),
    (r'less Armour|reduced Armour', 'Weniger Rüstung', 1, 'armour', 'Deine Rüstung sinkt.'),
    (r'Cursed with Temporal Chains', 'Fluch: Temporal Chains', 1, None, 'Du bist verlangsamt, Buffs laufen langsamer ab.'),
    (r'Cursed with Elemental Weakness', 'Fluch: Elemental Weakness', 2, None, 'Deine Elementar-Resistenzen sinken.'),
    (r'Cursed with Vulnerability', 'Fluch: Vulnerability', 1, None, 'Du nimmst mehr physischen Schaden.'),
    (r'Cursed with Enfeeble', 'Fluch: Enfeeble', 1, None, 'Du machst weniger Schaden.'),
    (r'Monsters have \d+% increased Critical (Strike|Hit) Chance', 'Monster-Crits', 1, None, 'Monster treffen öfter kritisch.'),
    (r'Monster Critical Strike Multiplier|Monster Critical Damage Bonus|Critical Damage Bonus', 'Monster-Crit-Schaden', 1, None, 'Kritische Treffer der Monster sind härter.'),
    (r'fire \d+ additional Projectiles', 'Mehr Projektile', 1, None, 'Monster schießen zusätzliche Projektile.'),
    (r"skills Chain \d+ additional times", 'Monster-Chain', 1, None, 'Monsterfähigkeiten springen weiter.'),
    (r'extra Physical Damage as (Fire|Cold|Lightning)|Damage as Extra (Fire|Cold|Lightning)', 'Extra Elementarschaden', 2, None, 'Monster machen deutlich mehr Elementarschaden.'),
    (r'Physical Damage as Extra Chaos Damage|Damage as Extra Chaos', 'Extra Chaosschaden', 2, 'lowchaos', 'Monster machen zusätzlichen Chaosschaden.'),
    (r'increased Monster Damage', 'Mehr Monsterschaden', 1, None, 'Monster machen mehr Schaden.'),
    (r'Monsters Poison on Hit|chance to Poison on Hit', 'Monster vergiften', 1, 'lowchaos', 'Monster vergiften bei Treffern.'),
    (r'Monsters have \d+% chance to Ignite|Burning Ground', 'Brennen', 1, None, 'Brennender Boden bzw. Ignite.'),
    (r'Shocked Ground|chance to Shock', 'Schock', 1, None, 'Schock lässt dich mehr Schaden nehmen.'),
    (r'Chilled Ground|chance to Freeze|Freeze Buildup', 'Kälte/Freeze', 1, None, 'Verlangsamt dich oder friert dich ein.'),
    (r'steal Power, Frenzy and Endurance charges', 'Charge-Diebstahl', 1, None, 'Monster stehlen deine Charges.'),
    (r'less Area of Effect', 'Kleinere Fläche', 1, 'area', 'Deine Flächenfähigkeiten werden kleiner.'),
    (r'reduced Flask Charges|Flask Charges gained', 'Weniger Flask-Ladungen', 1, None, 'Flasks laden sich langsamer auf.'),
    (r'Avoid Elemental Ailments|cannot be (Shocked|Ignited|Frozen|Chilled)', 'Monster ohne Ailments', 1, 'ailment', 'Deine Ailments greifen schlechter.'),
    (r'increased Monster Movement Speed|increased Monster Attack Speed', 'Schnellere Monster', 1, None, 'Monster sind schneller.'),
    (r'Unique Boss deals \d+% increased Damage', 'Stärkerer Boss', 1, None, 'Der Boss macht mehr Schaden.'),
    (r'Unique Boss has \d+% increased Life', 'Zäher Boss', 0, None, 'Der Boss hat mehr Leben.'),
    (r'Monsters cannot be Stunned', 'Kein Stun', 0, None, 'Monster lassen sich nicht stunnen.'),
    # PoE 2 (Waystones)
    (r'Monsters have \d+% increased Area of Effect', 'Größere Monster-Flächen', 1, None, 'Monsterfähigkeiten treffen eine größere Fläche.'),
    (r'less Cooldown Recovery', 'Langsamere Abklingzeiten', 1, None, 'Deine Fähigkeiten laden langsamer nach.'),
    (r'Break Armour|Armour Break', 'Rüstungsbruch', 1, 'armour', 'Monster brechen deine Rüstung.'),
    (r'increased Stun Buildup', 'Mehr Stun', 1, None, 'Du wirst schneller betäubt.'),
    (r'chance to Bleed|Bleeding on Hit', 'Blutung', 1, None, 'Monster lassen dich bluten.'),
    (r'Rare Monsters have \d+ additional Modifier', 'Stärkere Rares', 0, None, 'Seltene Monster haben zusätzliche Eigenschaften.'),
    (r'Monster Elemental Resistances|Monsters have \+\d+% to all Elemental Resistances', 'Monster-Resis', 0, 'elemental', 'Monster haben höhere Elementar-Resistenzen.'),
    (r'increased Monster Life', 'Mehr Monsterleben', 0, None, 'Monster halten mehr aus.'),
    (r'additional Physical Damage Reduction', 'Monster-Phys-Reduktion', 0, 'physical', 'Monster nehmen weniger physischen Schaden.'),
    (r'Hexproof', 'Hexproof', 0, 'curse', 'Monster lassen sich nicht verfluchen.'),
    (r'Players have Point Blank', 'Point Blank', 0, 'projectile', 'Projektile machen auf Distanz weniger Schaden.'),
    (r'Monsters have \d+% increased Accuracy', 'Höhere Monster-Genauigkeit', 0, 'evasion', 'Monster treffen öfter.'),
    (r'Monsters gain .* Energy Shield|Monsters have .* Energy Shield', 'Monster-ES', 0, None, 'Monster haben zusätzlichen Energieschild.'),
]

HEADER = re.compile(r'^(Item Class|Rarity|Map Tier|Waystone Tier|Waystone Drop Chance|Revives Available|Item Quantity|Item Rarity|Monster Pack Size|More Scarabs|More Currency|'
                    r'More Maps|More Divination Cards|Quality|Item Level|Monster Level|Requirements|Note|--------)')


def is_map(text):
    t = text.lstrip()
    return bool(re.search(r'^Item Class: (Maps|Map Fragments|Misc Map Items|Waystones)', t, re.M)) or ('Map Tier:' in t) or ('Waystone Tier:' in t)


def build_tags(sheet):
    """Leitet aus dem PoB-Charakterbogen ab, was für deinen Build relevant ist."""
    tags = set()
    if not sheet:
        return tags
    dmg = sheet.get('dmg') or {}
    ele = sum(dmg.get(k, 0) for k in ('Fire', 'Cold', 'Lightning'))
    phys = dmg.get('Physical', 0)
    total = ele + phys + dmg.get('Chaos', 0)
    if total > 0 and ele / total > 0.25:
        tags.add('elemental')
    if total > 0 and phys / total > 0.25:
        tags.add('physical')
    life = sheet.get('life', 0) or 1
    if sheet.get('lifeRegen', 0) > life * 0.02 or sheet.get('esRegen', 0) > 0:
        tags.add('regen')
    if sheet.get('leech', 0) > 0:
        tags.add('leech')
    tags.add('sustain')
    if sheet.get('block', 0) >= 40 or sheet.get('spellBlock', 0) >= 40:
        tags.add('block')
    if sheet.get('armour', 0) > 8000:
        tags.add('armour')
    if sheet.get('evasion', 0) > 8000:
        tags.add('evasion')
    if sheet.get('chaos', 0) < 0:
        tags.add('lowchaos')
    fl = sheet.get('flags') or {}
    if fl.get('area'):
        tags.add('area')
    if fl.get('projectile'):
        tags.add('projectile')
    if sheet.get('dot', 0) > sheet.get('dps', 0) * 0.3:
        tags.add('ailment')
    return tags


def check(text, sheet=None, disabled=None, wahl=None):
    """Bewertet eine Map. Gibt Kopfwerte, gefundene Mods und eine Gesamtbewertung zurück."""
    disabled = set(disabled or [])
    tags = build_tags(sheet)
    lines = [l.strip() for l in text.replace('\r', '').split('\n')]
    name = ''
    head = {}
    for l in lines:
        m = re.match(r'^(Map Tier|Item Quantity|Item Rarity|Monster Pack Size|Quality|Item Level|Monster Level): \+?(-?\d+)', l)
        if m:
            head[m.group(1)] = int(m.group(2))
    nonheader = [l for l in lines if l and not HEADER.match(l)]
    if nonheader:
        name = nonheader[0]
        if len(nonheader) > 1 and not re.search(r'\d', nonheader[1]):
            name = nonheader[0] + ' · ' + nonheader[1]
    found, unknown = [], []
    seen = set()
    for l in lines:
        if not l or HEADER.match(l) or l in (name,):
            continue
        hit = False
        for pat, kurz, basis, bedingung, erkl in RULES:
            if re.search(pat, l, re.I):
                hit = True
                if kurz in seen:
                    break
                seen.add(kurz)
                stufe = basis
                if bedingung and bedingung in tags:
                    stufe = min(3, basis + 2)
                if kurz in disabled:
                    stufe = 0
                if wahl and kurz in wahl:
                    stufe = level_aus_wahl(wahl[kurz], stufe)
                found.append({'line': l, 'name': kurz, 'level': stufe, 'why': erkl,
                              'forYou': bool(bedingung and bedingung in tags)})
                break
        if not hit and re.search(r'\d|Monsters|Players|Area|Unique Boss', l) and len(l) < 140:
            unknown.append(l)
    found.sort(key=lambda f: -f['level'])
    top = max([f['level'] for f in found] or [0])
    urteil = {3: 'Gefährlich', 2: 'Vorsicht', 1: 'Machbar', 0: 'Sicher'}[top]
    return {'kind': 'map', 'name': name or 'Map', 'head': head, 'mods': found, 'other': unknown[:12],
            'verdict': urteil, 'level': top, 'tags': sorted(tags)}


# Kurze Suchbegriffe für die Stash-Suche im Spiel (maximal 50 Zeichen passen ins Suchfeld)
TOKENS = {
    'Elementar-Reflect': 'of ele', 'Physischer Reflect': 'of phy', 'Keine Regeneration': 'ot reg', 'Weniger Erholung': 'ss rec',
    'Kein Leech': 'leech', 'Weniger Max-Resis': 'm res', 'Weniger Block': 'o blo', 'Weniger Rüstung': 'armour',
    'Fluch: Temporal Chains': 'temp', 'Fluch: Elemental Weakness': 'weak', 'Fluch: Vulnerability': 'vuln', 'Fluch: Enfeeble': 'enfe',
    'Monster-Crits': 'ike ch', 'Monster-Crit-Schaden': 'multi', 'Mehr Projektile': 'ojec', 'Monster-Chain': 'ls chain',
    'Extra Elementarschaden': 'xtra [fcl][io]', 'Extra Chaosschaden': 'xtra ch', 'Monster vergiften': 'pois', 'Brennen': 'burn|igni',
    'Schock': 'shoc', 'Kälte/Freeze': 'chill|free', 'Charge-Diebstahl': 'steal', 'Kleinere Fläche': 's area', 'Weniger Flask-Ladungen': 'flask',
    'Monster ohne Ailments': 'avoid', 'Schnellere Monster': 'r mov|r att', 'Stärkerer Boss': 'oss dea', 'Hexproof': 'hexp', 'Point Blank': 'nt bl',
    # PoE 2
    'Größere Monster-Flächen': 'ed area', 'Langsamere Abklingzeiten': 'cooldo', 'Rüstungsbruch': 'break', 'Mehr Stun': 'stun b', 'Blutung': 'blee',
}
TOKENS2 = {'Monster-Crits': 'hit ch', 'Monster-Crit-Schaden': 'ge bon', 'Weniger Max-Resis': 'r res', 'Fluch: Temporal Chains': 'temp'}


GRUND = {
    'elemental': 'du machst Elementarschaden', 'physical': 'du machst physischen Schaden', 'regen': 'du lebst von Regeneration',
    'leech': 'du nutzt Leech', 'block': 'du hast viel Block', 'armour': 'du hast viel Rüstung', 'evasion': 'du setzt auf Ausweichen',
    'lowchaos': 'deine Chaos-Resistenz ist niedrig', 'area': 'du nutzt Flächenschaden', 'projectile': 'du nutzt Projektile',
    'ailment': 'dein Schaden kommt über Ailments', 'sustain': 'du brauchst Leben- und ES-Erholung', 'curse': 'du nutzt Flüche',
}
# Für Anfänger: diese Mods lieber nie laufen
STARTER = {'Elementar-Reflect', 'Physischer Reflect', 'Keine Regeneration', 'Weniger Erholung', 'Kein Leech', 'Weniger Max-Resis',
           'Fluch: Elemental Weakness', 'Extra Elementarschaden', 'Extra Chaosschaden', 'Fluch: Temporal Chains'}


def stufe_fuer(regel, tags):
    pat, kurz, basis, bedingung, erkl = regel
    return min(3, basis + 2) if (bedingung and bedingung in tags) else basis


def regeln(sheet=None, wahl=None):
    """Alle Map-Regeln mit Empfehlung für deinen Build und deiner Auswahl (aus / warn / egal)."""
    tags = build_tags(sheet)
    wahl = wahl or {}
    out = []
    for r in RULES:
        st = stufe_fuer(r, tags)
        empf = 'aus' if st >= 2 else 'warn' if st == 1 else 'egal'
        grund = GRUND.get(r[3]) if (r[3] and r[3] in tags) else ''
        out.append({'name': r[1], 'why': r[4], 'stufe': st, 'empf': empf, 'wahl': wahl.get(r[1]) or empf,
                    'eigen': r[1] in wahl, 'grund': grund, 'token': TOKENS.get(r[1], '')})
    return out, tags


def level_aus_wahl(w, stufe):
    return 3 if w == 'aus' else (max(1, min(2, stufe)) if w == 'warn' else 0)


QTY = {0: '', 50: r'"tity: \+([5-9]\d|\d{3})"', 70: r'"tity: \+([7-9]\d|\d{3})"', 80: r'"tity: \+([89]\d|\d{3})"',
       100: r'"tity: \+\d{3}"'}


def suchtext(sheet=None, wahl=None, worte=None, limit=50, spiel='poe1'):
    """Stash-Suchtext für Maps: "!a|b|c" blendet aus, weitere Teile müssen zutreffen. Maximal 50 Zeichen passen ins Suchfeld."""
    worte = worte or {}
    rl, tags = regeln(sheet, wahl)
    positiv = []
    q = '' if spiel == 'poe2' else QTY.get(int(worte.get('qty') or 0), '')  # Waystones haben keine Item Quantity
    if q:
        positiv.append(q)
    muss = [w.strip().lower() for w in str(worte.get('muss') or '').split(',') if w.strip()]
    if muss:
        positiv.append('"' + '|'.join(muss) + '"')
    eigene = [w.strip().lower() for w in str(worte.get('aus') or '').split(',') if w.strip()]
    tok = lambda r: (TOKENS2.get(r['name']) if spiel == 'poe2' else None) or r['token']
    kand = [(9, w, w) for w in eigene] + sorted([(r['stufe'], r['name'], tok(r)) for r in rl if r['wahl'] == 'aus' and r['token']], key=lambda x: -x[0])
    rest_len = len(' '.join(positiv)) + (1 if positiv else 0)
    drin, raus, teile = [], [], []
    for _, name, tok in kand:
        neu = teile + [tok]
        if rest_len + len('"!' + '|'.join(neu) + '"') <= limit:
            teile, drin = neu, drin + [name]
        else:
            raus.append(name)
    neg = ('"!' + '|'.join(teile) + '"') if teile else ''
    text = ' '.join([neg] + positiv).strip()
    return {'text': text, 'len': len(text), 'limit': limit, 'drin': drin, 'rest': raus, 'tags': sorted(tags),
            'grund': [GRUND[t] for t in sorted(tags) if t in GRUND and t != 'sustain'], 'regeln': rl, 'starter': sorted(STARTER)}
