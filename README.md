# Hochstapler

Koop-Kletterspiel für 1–4 Spieler im Browser. Alle Spieler im selben Raum hängen
an einem gemeinsamen Seil und müssen sich durch ein Logistikzentrum nach oben
arbeiten – vom Wareneingang bis aufs Versanddach. Fällt einer, zieht er die
anderen mit. Wer festhält, sichert die Gruppe.

Gebaut mit **Three.js** (Client), **Cloudflare Workers** (Auslieferung) und
**Durable Objects** (ein WebSocket-Raum pro Raumcode).

## Steuerung

Tastatur/Maus, Controller (Gamepad-API, Xbox-/PlayStation-Layout) und Touch werden
gleichzeitig unterstützt; das HUD zeigt Hinweise für das zuletzt benutzte Gerät.

| Aktion | Tastatur & Maus | Controller | Touch |
| --- | --- | --- | --- |
| laufen | W A S D / Pfeile | linker Stick | Joystick (linke Bildhälfte) |
| Kamera | Maus, Q/E/R/F | rechter Stick | wischen (rechte Bildhälfte) |
| springen | Leertaste | A / ✕ | ⤒ |
| festhalten (Anker, nur am Boden) | Shift / rechte Maustaste | B, RB oder RT | ✊ halten |
| Zurufe | 1 · 2 · 3 | X · Y · LB | Buttons |
| Zoom | Mausrad | Steuerkreuz ↑↓ | ＋ / − |
| Pause | Esc | Start | ❚❚ |
| Ton an/aus | M | – | Optionen |

Menüs lassen sich komplett mit dem Controller bedienen (Steuerkreuz/Stick, A bestätigt,
B zurück, ←/→ ändert Werte). Im **Optionsmenü**: Grafikqualität (Niedrig/Mittel/Hoch),
Sichtfeld, Empfindlichkeit für Maus/Touch und Controller, Y-Achse invertieren,
Touch-Steuerung (automatisch/an/aus), Tastenhinweise, Kamerawackeln, Lautstärken sowie
Lichtstrahlen (Godrays), Tiefenunschärfe, Distanznebel (leicht/normal/dicht) und Höhennebel.
Einstellungen werden im Browser gespeichert.

## Lokaler Koop (mehrere Controller an einem Bildschirm)

- Hauptmenü → **Lokal mitspielen**: Jeder Controller, an dem jemand **A** drückt, wird ein eigener Lagerist (bis zu vier). Der erste Controller gehört Spieler 1, der zusätzlich Tastatur & Maus nutzen kann; auf Wunsch spielt die Tastatur als eigener Spieler.
- **Start** klettert nur an diesem Gerät los, **Y** geht online in den Raum aus dem Hauptmenü. Online hat jeder lokale Spieler eine eigene Verbindung zum Raum – für Server und Freunde sind es ganz normale Mitspieler (zusammen max. 4).
- Auch mitten im Spiel kann ein freier Controller mit **A** oder **Start** einsteigen; wird ein Controller abgezogen, seilt sich sein Spieler ab.
- Gemeinsame Kamera statt geteiltem Bildschirm: Das Seil hält alle auf wenigen Metern, darum zielt die Kamera auf die Mitte der lokalen Spieler und fährt weiter zurück, je weiter sie auseinander sind. Alle dürfen sie mit dem rechten Stick drehen.

## Aufbau des Turms (~1090 m, 42 Abschnitte)

**Akt 1 – von Hand gebaut** (bis ~77 m, zum Reinkommen):

1. **Tor 1 · Wareneingang** – Palettenstapel, Kisten, ein LKW-Auflieger
2. **Halle 2 · Hochregallager** – schmale Regaltraversen und Gitterroste
3. **Halle 3 · Fördertechnik** – Förderbänder, die dich seitlich oder rückwärts schieben
4. **Halle 4 · Staplerzone** – Gabelstapler-Lifte und fahrende Shuttles
5. **Kai 5 · Containerhafen** – Containerstapel und schwingende Kranlasten
6. **Dach · Versand** – Ende von Akt 1

**Ab Halle 7 – 36 erzeugte Abschnitte** mit steigender Schwierigkeit (größere
Lücken, kleinere Flächen, schnellere Takte). Zwölf Themen wiederholen sich in drei
Stufen (z. B. „Kühlhaus“, „Kühlhaus II“, „Kühlhaus III“):

| Thema | Besonderheit |
| --- | --- |
| Kühlhaus | Eisflächen – kaum Bodenhaftung |
| Paketzentrum | Kippschalen, die blinken und dann wegklappen |
| Reifenlager | Reifenstapel federn dich hoch (Shift = stehen bleiben) |
| Kleinteilelager | schmale Traversen, Shuttles |
| Lüftungszentrale | Aufwind trägt dich mehrere Meter nach oben |
| Gefahrstofflager | Fässer, Traversen, Kippschalen |
| Holzlager | schwingende Kranlasten |
| Getränkelager | Lifte im Takt |
| Gleisanschluss | rangierende Waggons |
| Retourenhalle | Bänder und Reifen durcheinander |
| Schwerlastregal | große Abstände, Lifte |
| Hochsilo | Paternoster-Lifte und Lüfter |

Der Generator ist deterministisch (fester Seed), alle Clients bauen also exakt
denselben Turm. Insgesamt ~1370 Kletterpunkte. Grob geschätzt braucht eine Gruppe
mit Abstürzen und Absprachen 15–30 Sekunden pro Kletterpunkt, also etwa 6–11
Stunden – das ist eine Schätzung, kein gemessener Wert.

## Zwischenstopps

Grüne Plattformen mit Lampe sind Zwischenstopps – am Anfang und in der Mitte jedes
Abschnitts (80 insgesamt). Betritt sie jemand aus dem Team, wird der Fortschritt
im Raum gespeichert (Durable Object) und die Lampe wird grün.

- Wer mehr als 8 m unter den letzten Zwischenstopp fällt, steigt dort wieder ein.
- Im Pausemenü holt „Team zum letzten Zwischenstopp holen“ alle zurück, falls ihr feststeckt.
- Mit demselben Raumcode geht es später weiter – Fortschritt und Schichtzeit bleiben erhalten.
  Die Schichtzeit läuft nur, solange jemand im Raum ist.
- „Neue Schicht“ im Zielbildschirm setzt Fortschritt und Zeit zurück.

## Seil-Regeln

Nachbarn in der Reihenfolge des Beitretens sind mit 4,5 m Seil verbunden.
Ist das Seil straff, wird die Überlänge nach „Gewicht“ verteilt:
festhaltend = unbeweglich, am Boden = schwer, in der Luft = leicht.
So kann ein festhaltender Spieler einen fallenden Partner abfangen, während ein
Unachtsamer am Boden mitgerissen wird.

## Entwicklung

```bash
npm install
npm run validate     # Level prüfen + jeden der ~1370 Übergänge mit der echten Physik durchspielen
npm run dev:worker   # baut den Client und startet Worker + Durable Object lokal (http://127.0.0.1:8787)
```

Für schnelles Arbeiten am Client: `npx wrangler dev` in einem Terminal und
`npm run dev` (Vite, leitet `/ws` an Port 8787 weiter) im zweiten.
Ohne Server läuft das Spiel automatisch im Solo-Modus.

## Deploy auf Cloudflare

Einmalig lokal:

```bash
npx wrangler login
npm run deploy
```

Oder automatisch per GitHub Actions bei jedem Push auf `main`: im Repo die
Secrets `CLOUDFLARE_API_TOKEN` (Vorlage „Edit Cloudflare Workers“) und
`CLOUDFLARE_ACCOUNT_ID` hinterlegen. Ohne Secrets wird nur validiert.

Durable Objects laufen hier als SQLite-Klasse und sind damit auch im
kostenlosen Workers-Plan nutzbar.

## Aufbau

```
client/            Three.js-Client (Vite)
  src/level.js     Akt 1 + Level-Generator, deterministisch für alle Clients
  src/physics.js   Kollision (Raumraster), Sprünge, Bänder, Eis, Lüfter, Federn, Seil
  src/render.js    Szene, prozedurale Texturen, Figuren, Seile
  src/net.js       WebSocket + Zeitabgleich (für synchrone Plattformen)
  src/main.js      Spielschleife, Eingabe, HUD
  src/audio/       Musik, Soundeffekte, Ambiente (alles prozedural, Web Audio)
src/worker.js      Worker + Durable Object "Room"
scripts/           Level-Validierung und Physik-Simulation
```

Netzwerkmodell: Jeder Client simuliert seine eigene Figur und schickt 20×/s
seinen Zustand. Der Raum verteilt ihn an alle anderen und führt Schichtzeit
und Bestenliste. Bewegliche Plattformen hängen nur von der Serverzeit ab und
sind dadurch auf allen Rechnern synchron.

## Audio

Alle Klänge entstehen zur Laufzeit mit der Web Audio API – es gibt keine
Audiodateien und damit keine Lizenzfragen.

- **Musik** (`audio/music.js`): generativer Sequenzer, je Abschnitt eigenes
  Tempo, eigene Tonart, Akkordfolge und Instrumentierung. Gewechselt wird am
  Taktanfang; das Versanddach ist das schnellste Thema.
- **Ambiente** (`audio/ambience.js`): Klangteppich je Abschnitt (Hallenlüftung,
  Maschinenbrummen, Wasser, Wind) plus zufällige, räumlich verteilte Ereignisse
  (Durchsage-Gong, Rückfahrwarner, Regalknarzen, Möwen, Schiffshorn …).
- **Maschinen** (`audio/machines.js`): Förderbänder, Stapler-Gabeln, fahrende
  Stapler und Kräne klingen dort, wo sie stehen, und reagieren auf ihre
  Bewegung (Anfahren, Hydraulik, Rückfahrwarner, Anschlag).
- **Effekte** (`audio/sfx.js`): Sprung, Landung und Schritte je Material,
  Seil-Knarzen bei Spannung, „Twang“ wenn das Seil straff wird, Fallwind,
  Zurufe, Mitspieler kommen/gehen, Abschnitts-Gong, Zielfanfare, UI-Klicks.

API fürs Optionsmenü (`import { audio } from './audio/index.js'`):

```js
audio.setVolume('master' | 'music' | 'sfx' | 'ambience', 0..1);
audio.getVolume('music');
audio.setMuted(true); audio.toggleMute(); audio.muted;
audio.onChange((settings) => { /* Regler aktualisieren */ });
audio.play('ui');      // auch 'uiBack', 'uiHover'
audio.unlock();        // aus einer Nutzergeste aufrufen (Klick/Taste)
```

Einstellungen werden in `localStorage` (`hochstapler.audio`) gespeichert.
