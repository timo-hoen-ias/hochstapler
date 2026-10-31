# Hochstapler

Koop-Kletterspiel für 1–4 Spieler im Browser. Alle Spieler im selben Raum hängen
an einem gemeinsamen Seil und müssen sich durch ein Logistikzentrum nach oben
arbeiten – vom Wareneingang bis aufs Versanddach. Fällt einer, zieht er die
anderen mit. Wer festhält, sichert die Gruppe.

Gebaut mit **Three.js** (Client), **Cloudflare Workers** (Auslieferung) und
**Durable Objects** (ein WebSocket-Raum pro Raumcode).

## Steuerung

| Taste | Aktion |
| --- | --- |
| W A S D / Pfeile | laufen |
| Leertaste | springen |
| Shift oder rechte Maustaste | festhalten (macht dich zum Anker, nur am Boden) |
| Maus / Mausrad | Kamera / Zoom |
| 1 · 2 · 3 | Zurufe: „Warte!“, „Los, springen!“, „Festhalten!“ |
| M | Ton an/aus |

## Die sechs Abschnitte

1. **Tor 1 · Wareneingang** – Palettenstapel, Kisten, ein LKW-Auflieger
2. **Halle 2 · Hochregallager** – schmale Regaltraversen und Gitterroste
3. **Halle 3 · Fördertechnik** – Förderbänder, die dich seitlich oder rückwärts schieben
4. **Halle 4 · Staplerzone** – Gabelstapler-Lifte und fahrende Shuttles
5. **Kai 5 · Containerhafen** – Containerstapel und schwingende Kranlasten
6. **Dach · Versand** – alles zusammen, oben wartet das Ziel (~77 m)

## Seil-Regeln

Nachbarn in der Reihenfolge des Beitretens sind mit 4,5 m Seil verbunden.
Ist das Seil straff, wird die Überlänge nach „Gewicht“ verteilt:
festhaltend = unbeweglich, am Boden = schwer, in der Luft = leicht.
So kann ein festhaltender Spieler einen fallenden Partner abfangen, während ein
Unachtsamer am Boden mitgerissen wird.

## Entwicklung

```bash
npm install
npm run validate     # Level prüfen + jeden Sprung und jede Plattform mit der echten Physik simulieren
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
  src/level.js     Level-Daten, deterministisch für alle Clients
  src/physics.js   Kollision, Sprünge, Förderbänder, Seil-Kopplung
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
