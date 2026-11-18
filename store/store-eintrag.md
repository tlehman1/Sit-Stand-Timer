# Chrome Web Store: Eintrag für den Sitz-Steh-Timer

Alles, was du beim Einreichen brauchst: die Dateien, die Texte zum Einfügen und die Antworten für die Datenschutz-Seite. Die englischen Texte sind für Felder gedacht, die das Prüfteam liest.

## Dateien

| Wofür | Datei |
| --- | --- |
| Paket zum Hochladen | `dist/sit-stand-timer-1.0.3.zip` |
| Store-Symbol (128 × 128) | `extension/icons/icon128.png` |
| Screenshots Englisch (1280 × 800) | `store/screenshots/en/` |
| Screenshots Deutsch (1280 × 800) | `store/screenshots/de/` |
| Kleine Werbekachel (440 × 280) | `store/promo-tile-440x280.png` |

Neu erzeugen nach Änderungen an der Erweiterung:

```
powershell -ExecutionPolicy Bypass -File tools\package.ps1
node tools\make-store-images.mjs
```

## Vor dem Hochladen

- **Name prüfen.** „Sitz-Steh-Timer" / „Sit-Stand Timer" ist ein Arbeitstitel. Er steht als `extName` in `extension/_locales/de/messages.json` und `extension/_locales/en/messages.json`. Nach einer Änderung Paket und Bilder neu erzeugen, der Name steht auch auf den Screenshots.
- **Google-Konto wählen.** Die E-Mail-Adresse des Entwicklerkontos lässt sich später nicht mehr ändern.

## 1. Entwicklerkonto (einmalig)

1. <https://chrome.google.com/webstore/devconsole> öffnen, Entwicklervereinbarung annehmen und die einmalige Registrierungsgebühr zahlen (zuletzt 5 US-$).
2. Auf der Kontoseite den Namen des Herausgebers eintragen. Er erscheint im Store unter „Angeboten von".
3. Kontakt-E-Mail eintragen und über den zugeschickten Link bestätigen.
4. Angeben, ob du als Händler („Trader") oder Nicht-Händler auftrittst. Das verlangt das EU-Gesetz über digitale Dienste von allen Entwicklern. Bei Händlern zeigt der Store Name und Kontaktdaten öffentlich an. Ob du Händler bist, hängt davon ab, ob du die Erweiterung gewerblich oder beruflich anbietest; das musst du selbst einschätzen.

## 2. Paket hochladen

Im Dashboard ein neues Element anlegen („Add new item") und `dist/sit-stand-timer-1.0.3.zip` hochladen. Titel und Kurzbeschreibung übernimmt der Store aus dem Paket, in Englisch und Deutsch.

## 3. Reiter „Store-Eintrag" (Store listing)

- **Kategorie:** Well-being. Alternative: Workflow & Planning.
- **Sprache:** Englisch ist die Standardsprache des Pakets, Deutsch kommt als zweite Sprache dazu. Über die Sprachauswahl oben auf der Seite bekommt jede Sprache ihre eigene Beschreibung und ihre eigenen Screenshots.
- **Store-Symbol:** `extension/icons/icon128.png`
- **Screenshots:** die drei Bilder aus `store/screenshots/en/` für Englisch, die drei aus `store/screenshots/de/` für Deutsch.
- **Kleine Werbekachel:** `store/promo-tile-440x280.png`. Sie gilt für alle Sprachen und enthält deshalb keinen Text. Sie ist freiwillig, Einträge ohne Kachel werden im Store aber weiter hinten einsortiert.
- **Homepage-URL, Support-URL:** freiwillig, können leer bleiben.

### Ausführliche Beschreibung, Englisch

```text
Sit-Stand Timer reminds you to alternate between sitting and standing at your height-adjustable desk.

Set how many minutes you want to sit and how many you want to stand, then press Start. The minutes left are shown right on the toolbar icon. When a phase is over you hear a short chime and a reminder opens under the icon, with a small animation of the desk going up or down. Move your desk, confirm, and the next phase starts.

Features
• Separate durations for sitting and standing (1–240 minutes), back to 45/15 with one click
• Countdown on the toolbar icon: indigo while sitting, green while standing
• Reminder with animation and a chime: rising tones mean "desk up", falling tones "desk down"
• "Remind me in 5 minutes" if now is a bad moment
• Confirm each change yourself, or let the next phase start automatically
• Pause, stop or switch position by hand at any time
• Pauses by itself while your computer is locked and continues when you unlock it
• If Chrome is not in front, a system notification takes over
• Volume control and a test button for the chime
• Light and dark theme, English and German

Privacy
The extension works entirely on your device. It collects no data, needs no account and makes no network requests. Your settings are stored locally in the browser.
```

### Ausführliche Beschreibung, Deutsch

```text
Der Sitz-Steh-Timer erinnert dich daran, am höhenverstellbaren Schreibtisch regelmäßig zwischen Sitzen und Stehen zu wechseln.

Du legst fest, wie viele Minuten du sitzen und wie viele du stehen möchtest, und drückst auf „Starten". Die verbleibenden Minuten stehen direkt im Symbol in der Symbolleiste. Ist eine Phase vorbei, ertönt ein kurzer Ton und unter dem Symbol klappt eine Erinnerung auf, mit einer kleinen Animation des Tisches, der hoch- oder herunterfährt. Tisch verstellen, bestätigen, und die nächste Phase beginnt.

Funktionen
• Eigene Zeiten für Sitzen und Stehen (1–240 Minuten), mit einem Klick zurück auf 45/15
• Countdown im Symbol: blauviolett beim Sitzen, grün beim Stehen
• Erinnerung mit Animation und Ton: aufsteigende Töne bedeuten „Tisch hoch", absteigende „Tisch runter"
• „In 5 Minuten erinnern", wenn es gerade nicht passt
• Wechsel selbst bestätigen oder die nächste Phase automatisch starten lassen
• Jederzeit pausieren, stoppen oder die Position von Hand wechseln
• Hält von selbst an, solange der PC gesperrt ist, und läuft beim Entsperren weiter
• Ist Chrome nicht im Vordergrund, übernimmt eine Systembenachrichtigung
• Lautstärkeregler und Testknopf für den Ton
• Helles und dunkles Design, Deutsch und Englisch

Datenschutz
Die Erweiterung arbeitet vollständig auf deinem Gerät. Sie sammelt keine Daten, braucht kein Konto und stellt keine Netzwerkverbindungen her. Deine Einstellungen werden lokal im Browser gespeichert.
```

## 4. Reiter „Datenschutz" (Privacy)

### Alleiniger Zweck (Single purpose)

```text
Sit-Stand Timer has one purpose: it runs a countdown for alternating sitting and standing phases at a height-adjustable desk and reminds the user when it is time to change position.
```

### Begründung der Berechtigungen

`alarms`

```text
Ends a sitting or standing phase at the right time and updates the minutes shown on the toolbar icon once per minute. The service worker is not kept running in between, so alarms are the only reliable way to time the phases.
```

`storage`

```text
Saves the user's settings (sitting and standing duration, sound on/off, volume, auto-start) and the current state of the timer locally with chrome.storage.local, so the timer survives restarts of the service worker and of the browser. Nothing leaves the device.
```

`notifications`

```text
Shows a system notification when a phase is over and the reminder popup cannot be shown, for example because Chrome is not the active window, or when the user closed the popup without answering. The notification offers the buttons "Done" and "5 min later".
```

`offscreen`

```text
Opens an offscreen document with the reason AUDIO_PLAYBACK to play a short chime when a phase is over. The chime is synthesised locally with the Web Audio API; service workers cannot play audio. The document closes itself right after the chime.
```

`idle`

```text
Pauses the timer while the screen is locked and resumes it when the user unlocks the computer, so time away from the desk does not count as sitting or standing. Only the locked/active state is used; no activity data is stored or sent anywhere.
```

Host-Berechtigungen fordert die Erweiterung nicht an.

### Remote-Code

„No, I am not using remote code" auswählen. Der gesamte Code liegt im Paket.

### Datennutzung

- Bei den Datenarten nichts ankreuzen: Die Erweiterung erhebt keine Nutzerdaten.
- Die drei Bestätigungen darunter ankreuzen (kein Verkauf, keine zweckfremde Nutzung, keine Nutzung für Kreditwürdigkeit).

### Datenschutzerklärung

Die Erweiterung verarbeitet keine Nutzerdaten. Falls das Dashboard trotzdem eine Adresse verlangt, kannst du diesen Text auf einer beliebigen öffentlichen Seite ablegen und verlinken:

```text
Privacy policy for Sit-Stand Timer

Sit-Stand Timer does not collect, store or transmit personal data, and it makes no network requests. Your settings (durations, sound, volume, auto-start) and the state of the timer are saved locally in your browser with chrome.storage.local. They are removed when you uninstall the extension.

Contact: <deine Kontakt-E-Mail>
```

## 5. Reiter „Vertrieb" (Distribution)

- Kostenlos, keine In-App-Käufe.
- Sichtbarkeit: Öffentlich (Public). Für einen ersten Probelauf geht auch „Nicht gelistet" (Unlisted): Dann findet den Eintrag nur, wer den Link hat.
- Regionen: alle.

## 6. Testanleitung (Test instructions)

Leer lassen. Die Erweiterung braucht weder Anmeldung noch Zugangsdaten.

## 7. Einreichen

„Submit for Review" (Zur Überprüfung einreichen) wählen. Wenn du im Bestätigungsdialog das Häkchen für die automatische Veröffentlichung entfernst, kannst du nach bestandener Prüfung selbst entscheiden, wann der Eintrag online geht; dafür bleiben dann 30 Tage. Die Prüfung dauert laut Google meist wenige Tage und kann bis zu einigen Wochen dauern.

## Spätere Versionen

1. `version` in `extension/manifest.json` erhöhen.
2. `tools\package.ps1` ausführen und das neue ZIP im Dashboard als neues Paket hochladen.
3. Wenn sich die Oberfläche geändert hat: `node tools\make-store-images.mjs` ausführen und die Screenshots ersetzen.

## Quellen

- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish)
- [Register your developer account](https://developer.chrome.com/docs/webstore/register)
- [Set up your developer account](https://developer.chrome.com/docs/webstore/set-up-account)
- [Supplying images](https://developer.chrome.com/docs/webstore/images)
- [Complete your listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Best practices (Kategorien)](https://developer.chrome.com/docs/webstore/best-practices)
- [Trader/Non-Trader developer identification](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure)
- [Chrome Web Store review process](https://developer.chrome.com/docs/webstore/review-process)
