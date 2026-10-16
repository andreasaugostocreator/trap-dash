# Trap Dash: design notes

How the traps, gadgets, difficulty rating and random levels are meant to work. The numbers live in `src/config.js`,
the rater in `src/rating.js`, the generator in `src/gen.js`.

## 1. Traps are four families, not a pile of special cases

Under the art, the crusher and the flame jet are the same thing: an area that becomes deadly for a while after a
warning. Only the area's shape and its timing differ. Sorting every trap by what it does to the runner gives four families:

| Family | What it does | Traps | What varies between them |
|---|---|---|---|
| **Zone** | an area hurts for `active` seconds after `warn` | spikes (low strip), flame (tall column), crusher (an area that falls) | shape, how long it hurts, whether the area moves |
| **Emitter** | launches a projectile that flies until it hits a wall | cannon (slow, big ball), arrows (fast, thin) | speed, size, cooldown |
| **Floor** | changes the terrain | trapdoor (removes floor), pop-up wall (adds a wall) | remove or add, size |
| **Force** | pushes, never hurts on its own | fan (blows upward) | direction, strength |

A new trap is usually a new row in `TRAPS` within one of these families. **Variants** come from changing a family's
numbers. The arrow turret is a cannon with twice the speed, a thinner shot and almost half the cooldown. It feels
completely different: the cannon is a slow ball you see coming and hop over, while arrows are a rhythm you have to read
and jump in advance.

**Genuinely different ideas** come from new families or effects, not new shapes:
- *Force* (fan): non-lethal by itself, but it turns the level into the weapon. A fan under ceiling spikes is deadly, a fan
  in the open just knocks your jump off course. It can even help the runner across a gap if the trapper misfires.
- *Floor that adds* (pop-up wall): it doesn't kill, it costs time and breaks rhythm. If it rises under you it bumps you up
  instead of trapping you. It stands 3 tiles tall (only a full jump clears it, 1.4 s up, 2.6 s cooldown), and when it
  rises within 2 tiles of the runner it **shoves** them back with a short stun ("SHOVED!"; a shield blocks it, an anchor
  holds them). Fired well it costs 0.7–1.4 s or knocks the runner into a trap or pit behind them; fired badly it costs
  about 0.1–0.3 s. `node tools/wall-feel.mjs` prints the table.
- Added since then, one per family:
  - **Saw** (zone that moves): a blade runs along its rail and back. You hop it, but you must time the hop to where the blade is.
  - **Laser** (emitter, instant): a long 0.35 s aim, then a beam across the whole room. Easy to read, but it covers everything.
    Mounted at jump height it punishes *jumping*, the opposite of every other trap.
  - **Bomb dropper** (emitter, falling): drops from the ceiling and blasts a wide area where it lands. The fall is the warning.
  - **Conveyor belt** (force, sideways): the floor runs backwards for 2 s. Harmless on flat ground, deadly as the run-up to a gap.
  - **Ice** (floor, friction): the floor turns slippery for 3 s. Harmless alone, deadly before spikes or an edge.
- Still open: a gravity flip zone, a fake checkpoint, a mirror zone.

## 2. What makes a trap easy, medium or hard

The core quantity is the **escape margin**:

```
margin = warning time (+ travel time of a projectile / falling time of a crusher)
       − time needed to get out of the danger area
       − 0.25 s human reaction time
```

- **margin ≥ 0: easy.** You see the telegraph, react, and get out. The trap is a reflex test you can pass.
- **margin ≈ 0: medium.** Possible on reflex, but only if you're paying attention.
- **margin < 0: hard.** You cannot react in time. Getting past it is a **mind game**: fake an approach so the trapper
  fires early, then cross during the cooldown. This is where Trap Dash is most interesting, and why the runner sees the cooldown dials.

The escape time depends on how you can leave the area:
- **Up:** low traps (spikes) only need a hop, about 0.06 s. That's why spikes are mild even with a short warning.
- **Sideways:** tall traps (flame, crusher, fan) need running. In the worst spot (the middle, after deciding which way to go)
  that's `(width + 0.1 s × speed) / (2 × speed)`.
- **Never in it:** a ground trap short enough to clear in one jump (≤ 4 tiles with the runner's 4.6-tile jump) can be
  skipped entirely, so it mostly forces a jump. Near the jump's limit it becomes a precision test again.

Then four modifiers:
1. **Baitability:** `(cooldown − time spent in danger) / cooldown`. A long cooldown compared with the crossing time means
   one successful bait gets you through, which makes the trap easier. Arrows (0.9 s cooldown) can't be baited like that,
   so they stay hard.
2. **Lethality:** force and floor traps only cost time, about a third of the threat. A fan becomes lethal when spikes wait above it.
3. **Penalty:** dying far from the last checkpoint costs more (respawn 0.75 s + the distance back), so the same trap is
   scarier late in a long stretch.
4. **Combos:** two deadly traps closer together than the trapper's 0.4 s lock-out lets the runner move can be chained.

Per-trap threat (0 to 1) as the rater computes it for typical instances:

| Trap | Margin | Threat | Why |
|---|---|---|---|
| Spikes, 3 tiles | −0.09 | ~0.13 | short warning, but a hop clears it, and 3 tiles can be jumped entirely |
| Crusher, falling 4–5 tiles | +0.05 | ~0.22 | the fall itself is extra warning; long cooldown |
| Crusher, falling 9 tiles | +0.14 | ~0.09 | you see it coming for ages |
| Flame | −0.10 | ~0.45 | tall, can't hop it, must be baited; long cooldown helps |
| Cannon | −0.05 | ~0.45 | jumpable ball, but it keeps firing every 1.6 s |
| Arrows | −0.19 | ~0.76 | 0.1 s warning at 300 px/s and a 0.9 s cooldown: read the rhythm or get hit |
| Trapdoor, 4 tiles over a pit | −0.33 | ~0.5 | too wide to jump safely, lethal |
| Fan under ceiling spikes | ~0 | ~0.35 | deadly because of the spikes, fair warning |
| Pop-up wall | | ~0.17 | costs time, never kills |

## 3. Level difficulty: ★ to ★★★

```
score = Σ trap threat + 0.3 × combos + platforming
platforming = Σ (pit width / jump length)² + 0.08 × static spikes + 1.5 if vertical + long stretches without checkpoints
★ below 5.3, ★★ below 9.5, ★★★ from 9.5
```

| Level | Score | Stars | What makes it so |
|---|---|---|---|
| Sunny Hills | 4.8 | ★ | jumpable spikes, a slow cannon, one trapdoor bridge |
| Cloud Climb | 5.3 | ★★ | few traps, but it's vertical: a slip costs a long fall |
| Treetop Hop | 6.3 | ★★ | arrows on a pillar, trapdoor over a pit, crushers |
| Windy Works | 6.8 | ★★ | three arrow turrets, fans under ceiling spikes, pop-up walls |
| Midnight Meadow | 8.0 | ★★ | crusher run, three flames, trapdoor bridge over spikes, many combos |
| The Gauntlet | 10.7 | ★★★ | everything, longest stretches, most combos |

`node tools/rate.mjs -v` prints the breakdown per trap. The rating is a model: playtesting should tune `REACT`, the
star cut-offs and the modifier weights.

## 4. Gadgets: pressure, not kills

Traps sit in fixed places. Gadgets go **anywhere** and are limited by **charges per run and/or a cooldown**.
Rule: **no gadget kills on its own**. They stun, slow, push or confuse, so the danger still comes from the level.
Stunned in the air you keep your momentum, so a lightning bolt mid-jump doesn't drop you into a pit.

| Trapper | Uses | Effect |
|---|---|---|
| Lightning | 4 per run, 4 s cooldown, aimed | a cloud and column warn for 0.45 s, then a 1.2 s stun |
| Glue | unlimited, 10 s cooldown, aimed | a 3-tile puddle on the floor for 7 s: 40% speed, lower jumps |
| Gust | 3 per run, 8 s cooldown | 1.8 s of wind against the way you're facing: it carries you back at 95 px/s (100 in the air), so running into it crawls and jumps fall short |
| Hex | 2 per run, 12 s cooldown | left and right swap for 2.6 s |

| Runner | Uses | Effect |
|---|---|---|
| Dash | 2 per run, 6 s cooldown | a short burst forward (about 2 tiles) |
| Shield | once per run | for 2 s, the next hit (trap or lightning) is blocked and bounces you up |
| Jammer | once per run | no traps or trapper gadgets for 2 s: the panic button |
| Air jump | 2 per run | a second jump in mid-air |

The interesting part is the counterplay: the runner saves the Jammer for the hardest trap, and the trapper baits the
Shield with a cheap Glue before the real threat. Gadgets reset every run so both players get the same budget.

## 4b. The big gadget pool and per-map loadouts

There are now 12 gadgets per side, so nobody gets all of them: **each map deals 4 to each player** (`src/loadout.js`).
The pools are split in two so both sides always have a mix:

| Side | Group A (2 picked) | Group B (2 picked) |
|---|---|---|
| Runner | movement: Dash, Blink (teleport 3 tiles), Haste, Air jump, Spring boots, Glider | saves: Shield, Phase (traps pass through you), Jammer, Slow-mo, Pocket flag (checkpoint here), Decoy, Anchor (no push), Radar (see hidden mines, trap readiness) |
| Trapper | aimed: Lightning, Glue, Mine (hidden, pops you up), Bat (chases you) | curses: Gust, Hex, Frost (ice feet), Fog (you only see near you), Anvil (heavy, low jumps), Moon (floaty), Rewind (back 2 s), Squash (small and slow) |

How a map picks: each gadget has a weight from the map's features (how many pits, vertical or flat, longest stretch
without checkpoints, projectile traps, zone traps, pushers, slippery floors, trap density). For example the Glider and
Air jump score high on maps with many pits, Anchor where there are fans and belts, Radar and Fog where there are many
traps, Anvil and Bat on vertical maps, Phase and Moon where things are shot at you, Rewind and the Pocket flag on long stretches. Then a
little noise from a hash of the map's name or seed is added so similar maps don't all get the same set. The pick is
**deterministic**, so both devices compute the same loadout without sending it. A level can also force one with a
`loadout` field. These are meant as experiments: drop the ones you don't like from the pools in `loadout.js`.

## 4c. Endless mode

Lobby → **∞ Endless ★/★★/★★★**. Each stage is a fresh random level of that difficulty with its own checkpoints; reaching
the flag immediately starts the next stage (the runner's device builds it and sends it over). There is no clock; the
HUD shows the total time and falls. **Swap sides** in the II menu starts a new endless run with the other player
running (online the guest asks, the host's device builds it).

## 5. Balance pass (after playtesting)

The first numbers made the runner far too strong: the trapper reacted after the runner was already past.
- **Warnings roughly halved** (spikes 0.22 → 0.12 s, flame 0.3 → 0.18 s, crusher 0.25 → 0.12 s and it falls faster,
  cannon 0.18 → 0.1 s and faster shots), **cooldowns cut by about a quarter**, and the lock between two traps 0.4 → 0.25 s.
- **Network lag compensation:** the game measures the round trip, and a trap fired online skips the part of its warning
  the order spent on the network (up to 60% of it), so it goes off when the trapper meant it to.
- **Dash nerfed hard:** 2 per run, 6 s cooldown, shorter and slower (about 2 tiles instead of 3.4). Shield once per run
  for 2 s, Jammer 2 s, 2 air jumps.
- **Trapper gadgets buffed:** 4 lightning bolts with a 0.45 s warning and a 1.2 s stun, faster Glue and Gust, 2 Hexes.
- Respawn 0.75 → 1 s, so each catch costs the runner more time.

**Second pass (flame and crusher):**
- **The flame burns while it's held.** A fixed-length burst could be waited out: stand still, let the trapper fire,
  walk through during the cooldown. Now the trapper holds the button (or key) and the flame burns until release, up to
  a 2 s tank. A tap is a 0.35 s puff. The cooldown grows with the burn: `0.4 s + 0.6 × burn time`, so quick puffs can be
  repeated fast and a long wall of fire costs a long wait. The runner can't know when it stops, and waiting costs time
  on the clock. `tools/trap-feel.mjs` shows it: waiting out a tap is still safe, waiting out a held burn the same way gets you caught.
- **The crusher slams.** It starts falling at 520 px/s instead of from rest, falls faster, warns for 0.08 s, rests
  0.25 s, climbs back twice as fast and recharges in 1.6 s. From button to impact went from about 0.34 s to 0.18 s,
  and it stays deadly for 0.12 s on impact.

## 6. Random levels

A level is a chain of hand-made **segments**, each with a tier 1–3: flat ground, steps, gaps, static spikes, platform hops,
a spring wall, and one segment per trap (spike strip, trapdoor bridge, crusher hall, flame row, cannon or arrow lane,
pop-up wall, fan corridor under ceiling spikes).

1. The star target sets a **plan**: how many segments (9 / 12 / 15), how tiers are drawn (mostly 1 / mixed / mostly 3),
   checkpoint spacing (every 3 / 3 / 5 segments) and how many trap kinds the level uses (4 / 5 / 6, so the trap bar fits).
2. Segments are drawn with a seeded random number generator (so a level can be rebuilt from its seed). The same segment
   never appears twice in a row, about half are traps, and the ground height shifts between rooms.
3. **Accept or retry:** the rater must agree on the stars, and the solver (the real physics, traps idle, no gadgets)
   must finish the level. Otherwise the next seed is tried. It takes 10–150 ms.
4. Online, the host builds it and sends the map, so both players play the same level.

`node tools/gen.mjs` shows the spread. The raw plans already land on target about 100% (★), 50% (★★) and 60% (★★★)
of the time; the accept step does the rest.

### Smarter layouts (second version)

- **Combo segments**: a trap placed where the terrain has already taken the runner's options away. A conveyor as the run-up
  to a gap, ice right before a gap, a crusher over the landing spot, arrows shooting across a gap at jump height, a
  trapdoor bridge under a low ceiling (no jumping over it), a saw on a one-tile bridge, a laser at jump height over
  spikes, flames on the only platforms over a pit, a bomb over the take-off, a fan in a pit that throws you into ceiling
  spikes. Each makes the runner commit, and that is exactly when a trap is hard to dodge.
- **Intensity curve**: every section between checkpoints starts with an easy breather and ends with its hardest piece,
  a combo on ★★ and ★★★. Deaths cluster right before a checkpoint, which feels fair and keeps the pressure up.
- **Use the kinds it picked**: when choosing a trap segment, kinds not yet used in the level are preferred, so a ★★★ level
  really uses all 6 of its trap kinds.
- `node tools/segments.mjs` checks every segment, at every tier and floor height, can be passed by the solver.

### The trapper sees ahead

Playtesting: the runner and the trapper saw each trap at the same moment, so the trapper had no time to plan. Now:
- The trapper's camera leads toward the flag: the runner sits about a quarter in from the trailing edge, so roughly three
  quarters of the view is what's coming (on climbing levels the runner sits low in the view). The trapper also sees 3
  more tiles of height than the runner.
- Traps ahead that are still off-screen show as markers on the screen edge with the trap's icon and the seconds until the
  runner gets there (red = ready).
- Each trap button shows **in 3s** / **now**: when the runner reaches the next trap of that kind. A kind that isn't on
  screen yet stays dimmed but shows its countdown, so the trapper can plan which trap and gadget to use.

### Flames chain

A row of flames could be outrun: after the first one fired, the 0.25 s lock plus the next flame's warning gave the runner
time to clear the next one too. Now, for 1 s after a flame fires (and the whole time one is burning), any other flame
skips the lock and lights after 0.03 s instead of 0.12 s. The first flame still warns normally, so it stays fair; the rest
of the row follows the runner. Other trap kinds still wait out the lock.


## 7. Party features

- **Trapper score** (`src/score.js`): a trap catch is 100, an assist (the runner falls or hits static spikes within 3 s of
  something the trapper did) is 60, the first catch with each new trap kind after the first adds 50, and catches less than
  6 s apart multiply: ×1.5, ×2, ×2.5… Titles from Rookie to Evil Genius. Both devices compute it from the same events.
- **Best of 3:** the first to win two levels gets the trophy screen.
- **Ghost:** the runner's device records its position 10 times a second and sends it with the result; in the second run of
  the same level both devices draw it. Off in Settings.
- **Level preview:** before a round, 16 s: the camera holds on the start, flies to the flag, looks around and flies back, while a
  banner lists the level's traps and each side's gadgets with a line on what each does (your side highlighted). To skip, hold Space
  (or Enter) on PC or press the Skip button on a phone; online it is only skipped once both players want to. The camera
  moves at a nearly even speed over about 12 s, so every part of the level gets the same look. Off in Settings.
- **Achievements** (`src/achievements.js`): 18, kept on the device.
- **Reconnect:** the host keeps a dropped guest's place for 60 s; the guest retries with the same id, and a guest whose page
  reloads within 5 minutes rejoins the same party. The round restarts, the score is kept.

## 8. Moving things and new worlds

- **Moving platforms** (`M` sideways, `N` lifts) go back and forth until the next wall, at most 7 tiles. Their position is a
  function of the clock, so both devices agree without sending it. You land on them from above and they carry you.
- **Crumbling stones** (`L`) shake for 0.45 s after you step on them, drop, and come back 3 s later.
- **Ropes** (`R`, an iron block the rope hangs from) are pendulums: grab one in the air, left/right pumps the swing, jump lets go
  with the swing's speed.
- **Solid ice** (`j`) is always slippery.
- Worlds: Lava Caves (lava pits, embers, falling rocks), Frost Castle (snow, icicles, ice floors), Pirate Cove (decks, ropes
  between ships, the sea), Haunted Manor (graves, pumpkins, wisps). Random levels use them too, and are built in a Web Worker.


## 9. The trapper's buttons: three coloured slots

One button per trap kind was overwhelming (up to 7 trap buttons plus 4 gadgets). Now the trapper has **three slots**, for
the traps just ahead of the runner (up to 18 tiles ahead, 2 behind, measured to where the trap hurts, so a crusher high up
still counts). Each slot has a colour (red, blue, yellow); its trap is tinted and outlined in that colour on the map with a
numbered tag, and if it's off screen, an edge marker in the same colour points to it. A trap keeps its slot while it is in
range, so buttons don't jump under your thumb; as the runner moves on, passed traps leave and the next ones drop in (the
button pops so you notice). Keys 1, 2, 3. The flame still burns while its button is held.

- **Items guide** (📖 Items on the title screen and in the pause menu): every trap, runner gadget and trapper gadget with an
  icon, a one-line description and its uses/cooldown, so new players know what a button does before trying it.

## 10. Full-screen map

The map fills the whole screen. The top bar and the button panels float over it, see-through, and the renderer knows how
much of the screen they cover: zoom and camera work on the clear band between them, so the runner, the traps and the path
ahead stay in that band while only sky and deep ground sit behind the buttons. Below the level the soil (or the water in a
pit) carries on to the screen edge.

The **decoy** is a real fake runner now: it runs on with the runner's physics, lands on floors and platforms, hops over walls
and gaps on its own, vanishes in pits, and bursts with "FOOLED!" when a trap hits it. While it is out, the trapper's camera chases
the decoy (the real runner is still drawn wherever they are) and glides back to the runner when the decoy is gone.

## 11. Performance

The game is drawn straight into a small canvas, one pixel per game pixel (about 690×310 on a phone), and the browser's
GPU scales it up with `image-rendering: pixelated`. Before, every frame was also copied into a full-resolution canvas
(2745×1236 on a big phone), which cost more than drawing the game itself. Only the on-screen part of the level image is
drawn. On a phone-sized screen with the CPU slowed 6× (like a cheap phone) a frame went from ~75 ms to ~25–30 ms; on a
normal phone that is a few ms, well inside 60 fps.

**Graphics** setting: Auto (default), High, Low. Low drops purely decorative effects (sun rays, the vignette, butterflies
and fireflies, extra particles). Auto switches to Low by itself after a couple of seconds below ~40 fps.

`tools/perf-test.mjs [throttle]` measures frame times; `tools/devices-test.mjs` checks the game screen on 13 phone,
tablet and foldable sizes; `tools/menu-fit-test.mjs` checks every menu on 16 sizes.

## 12. Type and logo

- **Jersey 10** for headings, buttons and numbers: a tall, chunky pixel face that matches the 1px-outlined sprites.
- **Jersey 15** for body text: same family, but easier to read in longer lines.
- **Silkscreen** for popups drawn on the canvas ("CLOSE!", trap scores): crisp at 8px when the canvas is scaled up as pixels.
- The **TRAP DASH** logo is custom pixel lettering, drawn per letter on tiny canvases with an ink outline, a highlight and a drop shadow. It is red for TRAP and blue for DASH, and each letter still bobs.
- Star ratings use a system symbol font, because Jersey draws ☆ and ★ almost the same.
- The app icon is "Sunset Saw" (tools/make-icons.mjs).

## 13. Control feel

- **Touch, landscape:** the runner's gadgets sit right next to JUMP, so one thumb covers jumping and gadgets while
  the other steers. Portrait phones keep them in a row above.
- **Feedback on every press:** trap and gadget buttons sink while held (with a tiny vibration tick if vibration is on),
  shake with a low buzz when they can't go yet, and flash when a cooldown ends, so you know when to press again
  without reading the numbers.
- **Gamepads** (`src/gamepad.js`, standard mapping): runner on the stick or d-pad, A jumps, X Y B RB for gadgets.
  The trapper's B X Y match the red, blue and yellow slot colours; LB RB LT RT are gadgets, and aimed ones steer
  with a stick (A drops, B cancels). On one screen pad 1 runs and pad 2 traps. Start pauses; menus use the d-pad
  and A, and B goes back. Button labels switch to the pad's buttons once one is connected. `tools/gamepad-test.mjs`.

## 14. Art direction: the pixel arcade cabinet

Trap Dash is a head-to-head duel made of crisp pixel art, so the interface is treated as arcade hardware built from
the same pixels as the world, not as web buttons laid over it.

- **One material.** Every in-game control is drawn pixel by pixel (`src/knobs.js`) on the game's own grid and scaled
  up crisp. Caps are domed (light from the upper left, a glint, a shaded lower half), with a visible side when raised.
  They sit in **smoked-glass sockets**, so the level shows through and nothing reads as a flat plate.
- **Runner:** a joystick (it leans the way you press, and that side's arrow lights up), a big red JUMP button in the
  corner, and the gadgets on a gentle arc beside it that rises toward the corner, following the thumb's swing.
- **Trapper:** the three trap slots are red, blue and yellow arcade buttons, the same colours as the outlines on the
  map. An empty slot is an empty socket. "in 2s" and "now" ride on a tag over the cap.
- **State is shown on the hardware:** pressing sinks the cap, cooldown drains around the cap like a pie in grey,
  charges are lit pips on the socket rim, a recharged button flashes, and one that isn't ready shakes.
- **Menus** use the same plastic: a hard two-tone face (lit top, shaded bottom), a bright top edge, a dark lip and
  a pixel glint. No emoji anywhere: menus, results and achievements use pixel icons, and achievements are little medals
  in the same cap style.
- **Landscape only.** Upright phones and tablets get a pixel "turn your phone" screen and a running game pauses; the
  installed app asks for landscape.
- Scale: `--k` screen px per art pixel (3 on big screens, 2.2 on phones held sideways, 2 on very short ones).

## 15. The menu world, the ring, and a round of balance

- **Title and menus** sit in their own living landscape (`src/scene.js`), not a level. A day passes in 240 s (day,
  sunset, a starry night with fireflies and lit cottage windows, dawn). There are drifting clouds in two layers, hazy
  snow-capped mountains (dithered shading, haze at the foot), hills with trees, a cottage with chimney smoke, the
  goal flag waving on a hill, a fence along a dirt path, swaying grass, petals, and birds. Every 7-14 s a runner dashes
  along the path, sometimes chased by a bat. It opens with a slow tilt down from the sky, then the logo drops in and
  the tiles rise.
  The title has big wooden tiles (Host / Join / Same screen / Practice, plus a glowing gold "Rejoin party ABCD" when
  there's one to rejoin), each with an arcade cap in its colour; small planks in the corner (How to play, Settings,
  Items, Trophies); and your runner on a plaque at the top right, which opens the name and runner picker. Every frame in
  the menus is cut from one generated pixel-art wood 9-slice (`woodFrame()` in `src/knobs.js`).
- **Gadget ring:** on touch screens the runner's gadgets sit on a circle around JUMP (`placeRing()` in main.js),
  sockets edge to edge, climbing from its lower left over its top. The ring may reach a little into the bottom-right
  corner of the view; the layout and device tests allow that and report how far.
- **Frost** now freezes the controls, not the floor: for 1.4 s the runner can't move, jump, grab or use gadgets
  while the world goes on (a jump in progress drops short, they coast to a stop). They're shown in a block of ice,
  and their buttons frost over.
- **Aimed gadgets are forgiving:** lightning strikes a 2-tile-wide strip, glue covers 5 tiles, a mine triggers
  anywhere over 3 tiles, and bats catch from further away. A tap for glue or a mine finds the nearest floor (into the
  ground, above it, or up to 2 tiles to the side). Traps on the map also take taps further from them.
- **Trapdoors matter:** a running jump clears at most 6 tiles, so every trapdoor is now a bridge of at least 7 tiles
  over a pit (or a low tunnel you can't jump in). `node tools/trapdoor-check.mjs` opens each one for good and asks
  the solver whether the level can still be finished; every trapdoor in every level is needed.
- **Rejoin:** both players remember the party. Reopening within 5 minutes goes straight back in (the host reopens
  the same code and keeps the score; the guest knocks again). For 30 minutes the title offers "Rejoin party ABCD", also
  after leaving by mistake. `tools/rejoin-test.mjs`.

## 16. Locked to landscape, bigger controls, four title places

- **The app frame** (`layoutApp()` in render.js, `#app` in index.html): everything on screen lives in one frame that
  is always landscape. When a touch screen reports upright (held upright, or held sideways with the phone's rotation
  lock on), the frame is turned 90 degrees, so the game behaves like a landscape-locked native app. iOS gives web apps
  no orientation lock. Layout rules are container queries on the frame (`@container app`, `cqw` / `cqh`), notch
  insets go through `--sa-*` variables that are remapped when turned, and touch points and element boxes are converted
  with `toUI()` / `uiRect()`. An iPhone home-screen app is sized from the physical screen, to sidestep iOS reporting a
  page shorter than the screen. `tools/rotate-test.mjs` plays a round on an upright phone with real touch coordinates.
- **Bigger runner controls** on touch screens: JUMP and the ring gadgets are 30% larger, the joystick 45%, with wide
  invisible hit areas.
- **Title places** (`src/scene.js`): Spring Valley (lake, turning windmill, cherry trees, petals), Autumn Woods (golden
  light, barn and pumpkins, falling leaves), Winter Peaks (snowy pines, a log cabin with lit windows, snowfall, an
  aurora at night) and Seaside Cliffs (sea with foam and a glitter path, a sailboat, gulls, a lighthouse sweeping its
  beam at night). One per day, fading over at dawn; the first is random. Painted once per place into tileable strips
  with ordered dithering (sky bands, 3-range mountains with strata and haze, multi-cluster tree crowns, a shaded
  split-rail fence and pebbled path, bushes, flowers), and only the living bits are drawn each frame (about 2 ms).
  `tools/places-shots.mjs` renders each place by day and at night.

## 17. The Harvest palette

One earthy colour family for the whole interface, taking its cue from cozy farm games: nothing pure or saturated, warm
brown outlines instead of black, and colour used for meaning.
- **Ink** (outlines, text, dark panels): walnut `#3a2417`. **Paper**: parchment `#f7ead0`. **Frames**: the pixel wood.
- **Moss** `#6fa046`: go and confirm (Start, Done, Host), the runner's gadgets and the RUN tag.
- **Honey** `#f0be4a`: special and selected (Rejoin, the chosen level, the timer digits, Join).
- **Harvest orange** `#f08a3a`: JUMP and the TRAP half of the logo (DASH is moss).
- **Plum** `#8e5a86`: the trapper's gadgets and the TRAP tag.
- **Trap slots**: brick `#d9663f`, dusty teal `#4aa3b2`, honey: still three clearly different buttons, matching the
  outlines on the map.
- Headings are wooden planks with parchment letters. The levels keep their own world colours.

## 18. Matchmaking

"Find a match" on the title pairs you with a random player who is searching at the same time, with no code to share
(`src/matchmaker.js`). Searchers announce themselves every 1.5 s on a shared relay topic, on every broker at once so
players on different brokers still meet. When two see each other, the one with the smaller random id hosts: it opens
an ordinary room quietly and sends the code privately to the other, who joins it the usual way. Each player is in one
pairing at a time ("busy" turns other offers down), and an offer nobody takes up within 10 s is withdrawn and both
search again. Once both are in, the host side picks a random level and starts a best-of-3 after a 3-second countdown,
so nobody waits on a stranger. The search screen shows your runner jogging, how many others are searching, and Cancel.
`tools/matchmaking-test.mjs` pairs two players end to end and checks that a lone searcher can cancel.

## 19. Comfort and flow (UX pass)

- **Rematch without the lobby.** Every level result and the trophy screen have a gold Rematch button. On one device
  it starts the same level again at once, the sides swapped. Online both players have to tap it: each sees "Bob
  wants a rematch! (1/2)" and the button glows, then the host starts the round. The host keeps Next level and Lobby.
- **Pause menu.** It shows where you are (level, stars, clock, falls, trap points, match score) and your controls
  for the device you are on (touch, keyboard or gamepad). Offline, Resume counts 3-2-1 before the world moves again.
  Practice adds Restart. Online the world never stops, so the menu is just a menu.
- **First-time tips.** The first time you get a gadget (at the start of a round) or come up to a kind of trap, a
  small wooden card under the top bar explains it, once ever, one card at a time (`trapdash-seenTips`).
- **Settings.** Music and sound-effect volume sliders (0 means off; older on/off saves carry over), vibration Off,
  Light or Strong (patterns scaled ×0.6 / ×1.5), a left-handed layout (the bottom panel is mirrored: JUMP and its
  gadget ring on the left, the arc opening to the upper right) and a button size slider (80–130%, `--bs`, which also
  scales the panel heights so the play band stays clear).
- **The lobby remembers** the last level, match length and who runs first, separately for Same screen, Practice and
  hosting (`trapdash-lobby-<mode>`).
- **First launch** is two steps: pick a name and a runner (the profile card, "Step 1 of 2"), then an offer of runner
  or trapper training, or "Skip, let's play!".

`tools/batchA-test.mjs` checks all of these, including a two-browser online rematch.

## 20. Polish: wood, transitions, splash, sparkle

- **Top bar in wood.** On the left a plank with the RUN / TRAP tag and who's who; in the middle the clock on a
  parchment plaque hanging from two ropes (brick red and ticking in the last 15 s); on the right the trap points and
  falls as pixel medals (a gold star coin, a pewter skull coin) on a plank, then the pause knob.
- **The runner picker is alive.** Every runner breathes, each one waves now and then on its own schedule, and the one
  you pick hops and jumps. Each has a one-line personality ("You never see them coming.").
- **Transitions.** Starting a round closes a pixel iris on the menu (0.26 s) and opens it again centred on your
  runner (0.42 s); leaving a round opens it on the menu. The iris is drawn at 1/6 scale row by row, so its edge is
  stepped like pixel art. Cards and panels arrive like a wooden sign: they drop in and swing to a stop.
- **Launch splash.** The logo is stamped onto walnut with a puff of dust ("a party game for two"), then fades into
  the title world, whose own entrance is already under way behind it.
- **Sparkle and cursor.** A tap in the menus throws a little burst of pixel stars (not on Low graphics); with a
  mouse, the cursor is a pixel arrow and, over buttons, a pixel hand.

`tools/batchB-shots.mjs` checks the splash, the iris, the picker and the sparkles; `tools/hud-shots.mjs` shoots
the top bar.

## 21. Profile, wardrobe and the podium

- **Profile card** (the runner plaque on the title) has three tabs: Runner (name and picker), Wardrobe and Stats.
- **Wardrobe** (`src/cosmetics.js`): 9 hats, 5 scarves and 7 shirt colours. Each is unlocked by a trophy (the
  crown by Champion, the witch hat by Ghostbuster, the red scarf by Gotcha…) or by gems collected along risky
  routes. A locked item shows greyed with a padlock, and tapping it tells you what unlocks it. Cosmetics change
  nothing in play. A dressed runner is a character object with its own id, so the sprite cache keeps every look
  apart; `charFrame` draws the scarf round the neck and the hat over the top four rows of the head. Your look
  travels with you online (`hi` carries `cos`; the host keeps it in the lobby, so both screens show it), and also
  shows in the lobby, the ghost, the podium and the trophy screen.
- **Stats** (`src/stats.js`): runs, flags reached, falls, catches, trap points, levels and matches won, trophies,
  gems, the best time on each level (any mode), and the last few results with who you played.
- **Podium results.** A finished level shows a little podium: the winner on the tall block, hopping and waving, the
  other beside them (a tie puts both on top), then a stat card each (time or how far they got, falls, and what they
  scored with the traps on the other run). On short screens the podium and the cards sit side by side.

`tools/batchC-test.mjs` checks the wardrobe, the stats, the podium, the phone layout and cosmetics online.

## 22. Worlds you can look around in

- **Level select as a world map** (`src/worldmap.js`). The lobby shows a strip of countryside that scrolls
  sideways: meadow, clouds, autumn fields, night meadow, a purple dusk, lava caves, snow, a beach and a haunted hill,
  one region per level, blended with a dithered seam, with little props (trees, flowers, fireflies, lava pools,
  pines, palms, graves). A dotted trail winds from pin to pin; each pin is a wooden sign with the number, name, stars
  and your best time, and your runner stands on the chosen one (beside it, on short screens). The pins are ordinary
  buttons, so the keyboard, gamepad and tests treat them as before.
- **Richer level backgrounds.** Every world gained a middle distance between its far range and its near trees: a
  farm with a barn, a windmill, hay and fences (day and sunset), a village with lit windows (night and dusk), snowy
  hills with pines and a cabin, glowing lava falls, a graveyard. The layers now stand on the horizon: at the start
  of a round each one's foot sits just below the ground the runner starts on, so hills, farms and trees rise above
  the level's skyline, and from there they move with the camera at their own parallax.
- **Weather and light** (cosmetic): rain with distant flashes, golden hour, blossom or leaves on the wind,
  fireflies, fog banks, a blizzard, ash fall, picked per world from the level and the match so both players see the
  same sky. Tints touch only the background and the particles are thin, so the level always reads clearly. The
  level preview names it; Settings → "Weather in levels" turns it off, and Low graphics skips it.
- **Sound.** Menu buttons clack like wood. The title world has its own sounds (birds by day, crickets and an owl at
  night, wind in the winter peaks, waves at the sea) and a gentle menu tune that plays in the lobby too. Every song
  now has a soft chord pad under its bars.

`tools/batchD-test.mjs` checks the map, every world drawing, and that both screens get the same weather;
`tools/map-shots.mjs` and `tools/weather-shots.mjs` take pictures.

## 23. Ready check, connection bars, gems

- **Ready check (online).** In the lobby both players press Ready (for the host, the Start button is their Ready).
  Each sees the other's state ("Bob is ready! Ready?", the button glowing; a ✓ Ready on the player card), and the
  round starts the moment both are ready. Changing the level or the match settings asks both again. Matchmade
  matches still start by themselves. (`?autoready` lets the automated tests start as before.)
- **Connection bars.** Four pixel bars in the lobby (by the room code) and in the top bar during an online round:
  from the measured round trip (under 90 ms four, under 180 three, under 350 two, else one), blinking empty when
  nothing has been heard for 2.5 s. Hovering shows "Direct link · 45 ms" or "Relay link · 140 ms".
- **Gems.** Each level carries up to 8 small crystals placed by `World.placeGems` on the risky line over its traps
  (two tiles over pop-up spikes, flames and saw rails, over a trapdoor, under a crusher's landing spot), at least 7
  tiles apart, worked out from the traps alone so both devices agree. Each gem picked up takes 0.5 s off a finished
  run's time (`GEM_BONUS`), so the risky line can win the level. The top bar counts them (2/5), the preview lists
  them, the podium cards show the bonus, and every gem adds to your total in the profile, which unlocks the gem
  cosmetics (60, 120, 200). Snapshots mirror which gems are gone.

`tools/batchE-test.mjs` checks the gems (also mirrored online), the real two-player ready check and the bars.
