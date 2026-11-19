"""PoE Companion – Guide-Auswertung: Skilltree-Stufen, Gem-Setups und Planung der nächsten Punkte."""
import re, json, os, re, time, subprocess, collections
import xml.etree.ElementTree as ET

from pfad import BASE
DIR = os.path.join(BASE, 'ui', 'data')
WICHTIG = {'n': 3, 'k': 4, 'j': 2}


def lade_graph(version='3_29'):
    return json.load(open(os.path.join(DIR, 'graph_%s.json' % version), encoding='utf-8'))


def guide_specs(xml_text):
    """Liest alle Tree-Stufen (Specs) aus einem PoB-Build."""
    root = ET.fromstring(xml_text)
    specs = []
    for i, s in enumerate(root.iter('Spec')):
        nodes = [n for n in (s.get('nodes') or '').split(',') if n]
        mast = dict(re.findall(r'\{(\d+),(\d+)\}', s.get('masteryEffects') or ''))
        specs.append({'title': s.get('title') or 'Tree %d' % (i + 1), 'version': s.get('treeVersion', ''),
                      'nodes': nodes, 'mast': mast})
    return specs


def guide_skillsets(xml_text):
    """Liest die Gem-Setups (Skill Sets) eines PoB-Builds."""
    root = ET.fromstring(xml_text)
    skills = root.find('Skills')
    if skills is None:
        return []
    sets = skills.findall('SkillSet') or [skills]
    # Items des Guides: id → (Name, Basis), um item-gewährte Skills zu erklären
    items = {}
    it = root.find('Items')
    for x in (it.findall('Item') if it is not None else []):
        zeilen = [z.strip() for z in (x.text or '').strip().splitlines() if z.strip()]
        if len(zeilen) >= 2:
            rar = zeilen[0].replace('Rarity: ', '').strip().upper() if zeilen[0].startswith('Rarity:') else ''
            name = zeilen[1] if rar else zeilen[0]
            basis = zeilen[2] if rar and len(zeilen) > 2 and rar in ('UNIQUE', 'RARE') else name
            items[x.get('id')] = {'name': name, 'base': basis, 'rarity': rar, 'text': x.text or ''}
    out = []
    for i, ss in enumerate(sets):
        groups = []
        for sk in ss.findall('Skill'):
            gems = []
            for g in sk.findall('Gem'):
                name = g.get('nameSpec') or g.get('skillId') or ''
                sid = g.get('skillId') or ''
                gems.append({'name': name, 'level': int(g.get('level') or 0), 'quality': int(g.get('quality') or 0),
                             'enabled': g.get('enabled') != 'false', 'support': sid.startswith('Support') or 'Support' in (g.get('gemId') or '')})
            if not gems:
                continue
            grp = {'label': sk.get('label') or '', 'slot': sk.get('slot') or '', 'enabled': sk.get('enabled') != 'false', 'gems': gems}
            src = sk.get('source') or ''
            if src.startswith('Item:'):
                teile = src.split(':', 2)
                txt = teile[2] if len(teile) > 2 else ''
                nm, basis = (txt.split(',', 1) + [''])[:2] if ',' in txt else (txt, '')
                info = next((v for v in items.values() if v['name'] == nm.strip()), {})
                grp['from'] = {'kind': 'item', 'name': nm.strip(), 'base': basis.strip() or info.get('base', ''),
                               'rarity': info.get('rarity', ''), 'slot': sk.get('slot') or ''}
            elif src == 'Explode':
                quellen = []
                for v in items.values():
                    for z in v['text'].splitlines():
                        if 'Explode' in z and v['name'] not in [q['name'] for q in quellen]:
                            quellen.append({'name': v['name'], 'base': v['base'], 'mod': z.strip()})
                grp['from'] = {'kind': 'explode', 'items': quellen[:4]}
            elif src.startswith('Tree:'):
                grp['from'] = {'kind': 'tree', 'id': src[5:]}
            elif src:
                grp['from'] = {'kind': 'other', 'name': src}
            groups.append(grp)
        out.append({'title': ss.get('title') or ('Setup %d' % (i + 1)), 'groups': groups})
    return out


def gem_abgleich(sets, char_gems):
    """Markiert pro Guide-Setup, welche Gems dir noch fehlen."""
    have = set(g['name'].lower() for grp in char_gems for g in grp.get('gems', []))
    for s in sets:
        fehlt = 0
        for grp in s['groups']:
            for g in grp['gems']:
                g['have'] = g['name'].lower() in have
                if not g['have'] and g['enabled']:
                    fehlt += 1
        s['missing'] = fehlt
    return sets


def plane(graph, have, target):
    """Liefert die fehlenden Punkte in sinnvoller Reihenfolge (immer erreichbar, Richtung nächster Notable)."""
    adj, typ = graph['adj'], graph['types']
    have = set(n for n in have if n in typ)
    target = set(n for n in target if n in typ)
    starts = set(n for n in target | have if typ[n] == 's')
    fehlt = set(n for n in target - have if typ[n] not in ('s', 'm'))
    weg = sorted(n for n in have - target if typ[n] not in ('s', 'm'))
    cur = (have | starts)
    reihe = []
    while fehlt:
        rand = [n for n in fehlt if any(nb in cur for nb in adj.get(n, []))]
        if not rand:
            reihe.extend(sorted(fehlt, key=int))
            break
        best, best_score = None, None
        for f in rand:
            # Breitensuche innerhalb der fehlenden Punkte: wie weit ist der nächste wichtige Punkt?
            dist, q, gesehen, ziel = None, collections.deque([(f, 0)]), {f}, 0
            while q:
                n, d = q.popleft()
                if WICHTIG.get(typ[n]):
                    dist, ziel = d, WICHTIG[typ[n]]
                    break
                for nb in adj.get(n, []):
                    if nb in fehlt and nb not in gesehen:
                        gesehen.add(nb)
                        q.append((nb, d + 1))
            score = (dist if dist is not None else 99, -ziel, int(f))
            if best_score is None or score < best_score:
                best, best_score = f, score
        reihe.append(best)
        cur.add(best)
        fehlt.discard(best)
    masteries = [n for n in target if typ[n] == 'm']
    return reihe, weg, masteries


def schritte(graph, reihe):
    """Fasst die Reihenfolge zu Schritten zusammen, die jeweils bei einem wichtigen Punkt enden."""
    typ, out, akt = graph['types'], [], []
    for n in reihe:
        akt.append(n)
        if WICHTIG.get(typ[n]):
            out.append(akt)
            akt = []
    if akt:
        out.append(akt)
    return out


def waehle_spec(specs, graph, have):
    typ = graph['types']
    punkte = len([n for n in have if n in typ and typ[n] not in ('s',)])
    for i, s in enumerate(specs):
        t = [n for n in s['nodes'] if n in typ and typ[n] != 's']
        if len(t) > punkte:
            return i
    return len(specs) - 1


def erstelle_state(xml_text, char_tree, info, char_gems=None, colors=None, version='3_29'):
    graph = lade_graph(version)
    specs = guide_specs(xml_text)
    have = [str(n) for n in char_tree['nodes']]
    have_m = {str(k): str(v) for k, v in (char_tree.get('mast') or {}).items()}
    plaene = []
    for s in specs:
        reihe, weg, mast = plane(graph, have, s['nodes'])
        mast_info = [{'node': m, 'effect': s['mast'].get(m), 'hat': have_m.get(m) == s['mast'].get(m)} for m in mast]
        plaene.append({'title': s['title'], 'target': [n for n in s['nodes'] if n in graph['types']],
                       'steps': schritte(graph, reihe), 'remove': weg, 'mast': mast_info, 'all': s['nodes']})
    sets = gem_abgleich(guide_skillsets(xml_text), char_gems or [])
    for st in sets:
        for grp in st['groups']:
            for g in grp['gems']:
                c = (colors or {}).get(g['name'])
                if c:
                    g['color'] = c.get('color', 0)
                    g['support'] = c.get('support', g['support'])
    return {'t': time.time(), 'char': info, 'have': have, 'haveMast': have_m,
            'sel': waehle_spec(specs, graph, have) if specs else 0, 'plans': plaene, 'gemsets': sets}




HAUPT = ('Weapon 1', 'Weapon 2', 'Helmet', 'Body Armour', 'Gloves', 'Boots', 'Amulet', 'Ring 1', 'Ring 2', 'Belt',
         'Flask 1', 'Flask 2', 'Flask 3', 'Flask 4', 'Flask 5')


def guide_items(xml_text, titel=None):
    """Ausrüstung eines Item-Sets aus dem Guide: (Set-Titel, [(Slot, Itemtext)]).
    titel: Name der Tree-Stufe – das Item-Set mit der größten Übereinstimmung wird genommen."""
    import xml.etree.ElementTree as ET
    root = ET.fromstring(xml_text)
    it = root.find('Items')
    if it is None:
        return '', []
    items = {x.get('id'): (x.text or '').strip() for x in it.findall('Item')}
    sets = it.findall('ItemSet')
    if not sets:
        return '', []
    wahl = None
    if titel:
        def nr(t):
            m = re.match(r'\s*(\d+)\)', t or '')
            return m.group(1) if m else None
        n0 = nr(titel)
        wahl = next((x for x in sets if (x.get('title') or '').strip().lower() == titel.strip().lower()), None)
        if wahl is None and n0:
            wahl = next((x for x in sets if nr(x.get('title')) == n0), None)
    if wahl is None:
        act = it.get('activeItemSet')
        wahl = next((x for x in sets if x.get('id') == act), sets[-1])
    out = []
    for sl in wahl.findall('Slot'):
        n = sl.get('name') or ''
        if n in HAUPT and sl.get('itemId') not in (None, '0') and items.get(sl.get('itemId')):
            out.append((n, items[sl.get('itemId')]))
    return (wahl.get('title') or ''), out
