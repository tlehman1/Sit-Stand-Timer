# Sitz-Steh-Timer

Chrome-Erweiterung für den höhenverstellbaren Schreibtisch: Du legst fest, wie lange du sitzen und wie lange du stehen möchtest, und ein Countdown läuft herunter. Die verbleibenden Minuten stehen im Symbol in der Symbolleiste. Ist eine Phase vorbei, ertönt ein Ton und unter dem Symbol klappt eine Erinnerung mit Animation auf: Tisch hoch- oder herunterfahren.

- Eigene Zeiten für Sitzen und Stehen (1–240 Minuten)
- Countdown im Symbol, blauviolett beim Sitzen, grün beim Stehen
- Erinnerung mit Animation und Ton, „In 5 Minuten erinnern"
- Wechsel bestätigen oder nächste Phase automatisch starten
- Hält an, solange der PC gesperrt ist, und läuft beim Entsperren weiter
- Systembenachrichtigung, wenn Chrome nicht im Vordergrund ist
- Helles und dunkles Design, Deutsch und Englisch
- Keine Datenerhebung, keine Netzwerkzugriffe

## Ausprobieren

1. `chrome://extensions` öffnen und oben rechts den Entwicklermodus einschalten.
2. „Entpackte Erweiterung laden" wählen und den Ordner `extension` auswählen.
3. Nach Änderungen am Code auf der Karte der Erweiterung auf ↻ klicken.

Braucht Chrome 127 oder neuer.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `extension/` | Die Erweiterung (Manifest V3) |
| `extension/background.js` | Service Worker: Timer, Symbol, Erinnerung, Benachrichtigung |
| `extension/popup.*` | Popup mit Countdown, Einstellungen und Erinnerung |
| `extension/offscreen.*` | Spielt den Ton ab (Service Worker haben keine Audioausgabe) |
| `extension/shared.js` | Gemeinsame Konstanten und Hilfsfunktionen |
| `extension/_locales/` | Texte auf Deutsch und Englisch |
| `store/` | Screenshots, Werbekachel und Texte für den Chrome Web Store |
| `tools/` | Skripte für Icons, Store-Bilder und das Paket |

## Skripte

```
powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1    # Icons neu zeichnen
powershell -ExecutionPolicy Bypass -File tools\package.ps1       # ZIP für den Store nach dist\
node tools\make-store-images.mjs                                 # Store-Screenshots neu erzeugen
```

`make-store-images.mjs` braucht Node 22 und Microsoft Edge. Für eine neue Version im Store zuerst `version` in `extension/manifest.json` erhöhen, dann das Paket neu bauen.
