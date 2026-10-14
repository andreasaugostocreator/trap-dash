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
  instead of trapping you.
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
and gaps on its own, vanishes in pits, and bursts with "FOOLED!" when a trap hits it.

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
