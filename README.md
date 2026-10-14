# Trap Dash

A two-player pixel-art party platformer. One friend runs from the start to the checkered flag.
The other works the traps: pop-up spikes, trapdoors, cannons, crushers and flame jets. Every trap has a cooldown,
and two traps can't fire back to back, so the trapper's timing has to be precise. The runner sees the cooldown dials
too and can dash while the traps recharge. Then you swap, and the faster runner wins the level.

Full 2D pixel art: the world is drawn 1:1 on a small canvas and scaled up by whole numbers, so every pixel stays crisp.
Six runners to pick from: Explorer, Knight, Astronaut, Ninja, Robot and Pirate. Plain HTML + JavaScript modules, no build step.

- **Online party:** *Host a party* gives a 4-letter room code (or a share link). Your friend picks *Join a party*.
  The game tries two links at once and uses whichever works: a direct WebRTC link ([PeerJS](https://peerjs.com)),
  and a relay through a free public MQTT broker (EMQX, HiveMQ as backup) for networks that block direct links,
  such as phones on mobile data. GitHub Pages hosting is enough and no server of your own is needed.
- **Same screen:** one runs on the keyboard (or the touch buttons on a tablet), the other clicks / taps the traps.
- **Practice:** you run, a bot fires the traps. Best times are saved per level.
- **7 levels rated ★ to ★★★** (Sunny Hills, Cloud Climb, Treetop Hop, Windy Works, Saw Mill, Midnight Meadow, The Gauntlet),
  plus **random levels** of the difficulty you pick, and **∞ Endless**: new stages one after another with no clock; swap sides from the menu.
- **13 traps in 4 families:** spikes, flame, crusher, saw (zone); cannon, arrows, laser, bomb dropper (emitter); trapdoor, pop-up wall, ice (floor); fan, conveyor belt (force).
- **24 gadgets**, never deadly on their own. Each map deals 4 to each side, chosen from its traps and layout (`src/loadout.js`).
- **4 more worlds:** Lava Caves, Frost Castle, Pirate Cove, Haunted Manor, each with its own look, music and ambience.
- **Moving platforms, lifts, crumbling stones and swinging ropes.**
- **Trapper score:** points for every catch, combos for quick catches, a bonus for each new trap kind; a "trap king" per level.
- **Best of 3 matches** with a trophy screen, **achievements** (🏆 Trophies on the title screen), a **level preview** before each round,
  the **ghost** of the last run, **vibration**, and **reconnecting** after a dropped connection (or a reload) without losing the score.
- **Training** for each role (How to play → Runner / Trapper training).
- Settings (⚙): sound, music, vibration, ghost, level preview, screen shake.
- See [DESIGN.md](DESIGN.md) for the trap families, the difficulty model and how random levels are built.
- Phone friendly (landscape is best), installable as a home-screen app, chiptune music and sound effects.

## Controls

Runner: **← →** or **A D** to run, **Space / W / ↑** to jump (hold for higher). On a phone: the ◀ ▶ and JUMP buttons.
Runner gadgets: **Shift**, **Q**, **E**, **R** for the map's gadgets in order (an air jump is used by jumping in mid-air).
Trapper: three coloured buttons (keys **1 2 3**) fire the next traps ahead of the runner, outlined in the same colour on the map; gadgets **7 8 9 0** (aimed ones at the mouse). On a phone, tap a gadget, then tap the map.
**Esc** or the **II** button opens the menu.

## Play locally

```sh
cd trap-dash
python3 -m http.server 8080
```
Open http://localhost:8080. Add `?debug` to see the hitboxes of everything that hurts.

## Deploy to GitHub Pages

**Settings › Pages › Build and deployment**: Source **Deploy from a branch**, branch **main**, folder **/ (root)**.
After a minute the game is live at `https://<your-username>.github.io/trap-dash/`. All paths are relative.
Bump `VERSION` in `sw.js` on each release so phones pick up the update.

## How it works

- `src/sim.js`: the world (tiles, runner physics, traps). Only the runner's device simulates it, at 60 steps a second.
  It streams snapshots to the trapper ~30 times a second, and the trapper sends back "fire trap N".
- `src/levels.js`: levels built from a few builder calls. Legend at the top of the file.
- `src/rating.js`, `src/gen.js`, `src/solver.js`: difficulty rating, random levels, and the beatability check.
- `src/sprites.js`: the pixel art (characters, traps, props) written as text grids.
- `src/render.js`, `src/audio.js`, `src/net.js`, `src/bot.js`, `src/main.js`: drawing, sound, the WebRTC link, the practice bot, screens and the game loop.
- `lib/peerjs.min.js`: PeerJS 1.5.4 (MIT), bundled so it also loads offline.

## Dev tools

`npm install` once, then:
- `npm run solve`: checks every level can be finished with the real physics (search over inputs).
- `node tools/rate.mjs -v`: star rating of each level with the threat of every trap. `node tools/gen.mjs`: random level stats.
- `tools/gadget-test.mjs`, `tools/random-test.mjs`, `tools/trapbar-test.mjs`, `tools/endless-test.mjs`, `tools/new-stuff-test.mjs`: browser tests (need the relay broker).
- `node tools/segments.mjs`: checks every generator segment can be passed.
- More browser tests: `score-test`, `match-test`, `achv-test`, `online-preview-test`, `reconnect-test`, `tutorial-test` (in `tools/`).
- `node tools/broker.mjs` + `node tools/relay-broker.mjs` + `npm run shots`: plays through local, practice (phone sizes) and online mode
  (two browsers through local PeerJS and MQTT brokers; `Q='?nop2p&relay=ws://127.0.0.1:8883'` tests the relay alone) and saves screenshots to `shots/`.
- `node tools/make-icons.mjs`: renders the app icons. `tools/sheet.html` shows every sprite.
