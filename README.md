# Thrustfall

An original 2D jetpack shooter with robot pilots, destructible terrain and bots. It runs in the browser, and Capacitor wraps it as Android and iOS apps from the same code. All art is drawn in code and all sound is synthesized, so there are no third-party assets.

## Play (web)

```bash
npm run dev          # http://localhost:5173
```

No build step: `web/` is plain ES modules.

**Controls:** `A`/`D` move, `W`/`Space` jetpack, mouse aims, left click fires, right click or `G` throws a grenade, `Q` or the mouse wheel swaps weapons, `R` reloads, `E` takes a weapon, `Tab` shows scores, `Esc` pauses.
**Touch:** left stick moves (push up to fly), right stick aims and fires (push past halfway), plus on-screen SWAP, RELOAD, NADE and TAKE buttons.

## Mobile apps

```bash
npm run android      # syncs web/ and opens Android Studio → Run / Build APK
npm run ios          # macOS + Xcode only → Run / Archive
```

Both apps are locked to landscape, and Android runs fullscreen. Run `npx cap sync` after changing anything in `web/`.

## Test

```bash
npm test             # headless bots-only matches (FFA + team); fails if bots stop fighting or clip into terrain
```

## Layout

| File | Role |
|---|---|
| `web/src/config.js` | Tuning: physics, weapons, grenades, match rules |
| `web/src/map.js` | Seeded procedural map, tile collision, raycasts, destruction |
| `web/src/sim.js` | `World.step(dt, inputs)`: players, bullets, grenades, pickups, scoring. Emits events. No DOM. |
| `web/src/bot.js` | Bot AI: BFS pathfinding, target selection, aim/lead, grenades |
| `web/src/input.js` | Keyboard/mouse and dual-stick touch, turned into input objects |
| `web/src/render.js` | Canvas renderer, particles, HUD, minimap, camera |
| `web/src/audio.js` | WebAudio-synthesized sound effects |
| `web/src/main.js` | Menu, fixed 60 Hz loop, match flow |

## Multiplayer roadmap

The simulation is already set up for a server-authoritative model:

1. `sim.js`, `map.js`, `bot.js` and `config.js` have no DOM dependencies and run in Node today (see `tools/smoke.mjs`).
2. Players and bots all drive the world through the same input object (`move, jet, aim, fire, grenade, swap, reload, interact`). A remote player is just another input source.
3. Maps come from a seed, so clients only need the seed plus a list of destroyed tiles.
4. `world.events` already carries everything the client needs for effects and sound.

Next steps: a Node WebSocket server (e.g. Colyseus or plain `ws`) runs `World` at 60 Hz, clients send inputs, the server broadcasts snapshots and events at about 20 Hz, and clients interpolate other players and predict their own movement. Then add rooms with invite codes.
