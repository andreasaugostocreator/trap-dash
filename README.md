# Trap Dash

A two-player pixel-art party platformer. One friend runs from the start to the checkered flag.
The other works the traps: pop-up spikes, trapdoors, cannons, crushers and flame jets. Every trap has a cooldown,
and two traps can't fire back to back, so the trapper's timing has to be precise. The runner sees the cooldown dials
too and can dash while the traps recharge. Then you swap, and the faster runner wins the level.

Full 2D pixel art: the world is drawn 1:1 on a small canvas and scaled up by whole numbers, so every pixel stays crisp.
Six runners to pick from: Explorer, Knight, Astronaut, Ninja, Robot and Pirate. Plain HTML + JavaScript modules, no build step.

- **Online party:** *Host a party* gives a 4-letter room code (or a share link). Your friend picks *Join a party*.
  The two browsers connect directly over WebRTC using [PeerJS](https://peerjs.com) and its free public broker,
  so GitHub Pages hosting is enough and no server is needed.
- **Same screen:** one runs on the keyboard (or the touch buttons on a tablet), the other clicks / taps the traps.
- **Practice:** you run, a bot fires the traps. Best times are saved per level.
- **5 levels:** Sunny Hills, Treetop Hop, Midnight Meadow, Cloud Climb (vertical) and The Gauntlet.
- Phone friendly (landscape is best), installable as a home-screen app, chiptune music and sound effects.

## Controls

Runner: **← →** or **A D** to run, **Space / W / ↑** to jump (hold for higher). On a phone: the ◀ ▶ and JUMP buttons.
Trapper: click or tap the red buttons over the traps. A grey dial with a number means it's recharging.
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
- `src/sprites.js`: the pixel art (characters, traps, props) written as text grids.
- `src/render.js`, `src/audio.js`, `src/net.js`, `src/bot.js`, `src/main.js`: drawing, sound, the WebRTC link, the practice bot, screens and the game loop.
- `lib/peerjs.min.js`: PeerJS 1.5.4 (MIT), bundled so it also loads offline.

## Dev tools

`npm install` once, then:
- `npm run solve`: checks every level can be finished with the real physics (search over inputs).
- `node tools/broker.mjs` + `npm run shots`: plays through local, practice (phone sizes) and online mode
  (two browsers through a local PeerJS broker) and saves screenshots to `shots/`.
- `node tools/make-icons.mjs`: renders the app icons. `tools/sheet.html` shows every sprite.
