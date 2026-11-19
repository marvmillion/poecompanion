<p align="center"><img src="ui/logo.svg" width="72" alt=""></p>
<h1 align="center">PoE Companion</h1>
<p align="center">Free, open-source overlay & helper for <b>Path of Exile 1 and 2</b> · Deutsch & English · <b>Beta</b></p>

> **Download:** grab `PoE-Companion.exe` from the [latest release](../../releases/latest) – no Python, no installer. Double-click and go.
> Windows may warn about an “unknown publisher” on first start (the exe isn't code-signed): *More info → Run anyway*.

## What it does
- **Price check on a key** (default `Alt+C`): estimated value first, then similar listings from the trade site – tuned so junk isn't over-valued.
- **Crafting advisor (PoE 2):** community crafting routes with real costs, “what now?” decision steps, slot pictures per step, Normal/Greater/Perfect currency.
- **Upgrades from Path of Building:** which rare mods help your build most, example items (budget / top players / ideal), unique suggestions with market prices.
- **Skill tree overlay** with your next points, **leveling guide** (campaign steps on a key), **gems** with level/attribute requirements.
- **Stash value** with history, tab breakdown and **before/after** comparison of farming runs (PoE 2: capture tabs with Ctrl+C).
- Quality-of-life: `/hideout` and custom chat commands (one key = one action), map mod warnings, exchange rates.

## Requirements
- Windows 10/11, game in **Windowed Fullscreen**, game language **English** (item texts).
- On first start the companion downloads Path of Building data once (~650 MB).

## Rules & privacy
- **One key press = one action.** No automation, no memory reading, no game file modification – the same approach as other common overlays.
- Trade requests respect GGG's rate limits and identify the tool with a contact.
- Anonymous usage counter (random ID, version, game, language – once a day), can be switched off. Details: [DATENSCHUTZ.md](DATENSCHUTZ.md).

## Feedback
Use the **Feedback** button (bottom right in the app) – it goes straight to the developer. Or Discord: see the app's start screen.

## Build from source
```
python poe_app.py            # Python 3.11+, Windows
```
Releases are built automatically by GitHub Actions (`.github/workflows/release.yml`) when a tag like `v1.2.0` is pushed.

## Credits & licence
AGPL-3.0 (see `LIZENZ-AGPL-3.0.txt`). Uses data/code from Path of Building Community (MIT), RePoE, POE2_HTC (AGPL-3.0), exile-leveling (MIT), poe2overlay (MIT) – see `LIZENZEN.txt`.

*PoE Companion is a fan project and is not affiliated with or endorsed by Grinding Gear Games. Path of Exile is a trademark of Grinding Gear Games.*
