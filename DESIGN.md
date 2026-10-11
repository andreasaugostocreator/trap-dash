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
| Gust | 3 per run, 8 s cooldown | 1.4 s of wind against the way you're facing |
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
