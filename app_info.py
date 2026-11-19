"""Zentrale Angaben zum Programm – hier stehen Version, Kontakt und die Adressen für Updates, Zähler und Feedback.
Vor dem Veröffentlichen nur diese Datei anpassen (siehe VEROEFFENTLICHEN.md)."""
NAME = 'PoE Companion'
VERSION = '1.2.0'

# Discord-Name für Feedback und für die Kennung gegenüber GGG
DISCORD = 'DEIN_DISCORD_NAME'

# GitHub-Repository für Updates, z. B. 'meinname/poe-companion' (leer = keine Update-Prüfung)
REPO = ''

# Adresse des eigenen Cloudflare Workers für Nutzerzähler und Feedback, z. B. 'https://poe-companion.meinname.workers.dev' (leer = aus)
DIENST = ''

# GGG verlangt, dass sich jedes Tool mit Name, Version und Kontakt ausweist
USER_AGENT = '%s/%s (contact: %s) companion-overlay' % (NAME.replace(' ', '-'), VERSION, ('discord ' + DISCORD) if not DISCORD.startswith('DEIN_') else 'github.com/' + (REPO or 'poe-companion'))

HINWEIS_GGG = ('PoE Companion ist ein Fan-Projekt und steht in keiner Verbindung zu Grinding Gear Games. '
               'Es wird von Grinding Gear Games weder unterstützt noch geprüft. Path of Exile ist eine Marke von Grinding Gear Games.')
