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
- Ideas for later in the same spirit: a conveyor (force, sideways), ice (changes friction), a gravity flip zone, a magnet
  that pulls toward hazards, a fake checkpoint, a mirror zone that swaps controls, a "rewind" zone that sends you back 3 seconds.

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
★ below 4.5, ★★ below 7.5, ★★★ from 7.5
```

| Level | Score | Stars | What makes it so |
|---|---|---|---|
| Sunny Hills | 3.9 | ★ | jumpable spikes, a slow cannon, one trapdoor bridge |
| Cloud Climb | 4.5 | ★★ | few traps, but it's vertical: a slip costs a long fall |
| Treetop Hop | 5.3 | ★★ | arrows on a pillar, trapdoor over a pit, crushers |
| Midnight Meadow | 6.4 | ★★ | crusher run, three flames, trapdoor bridge over spikes, many combos |
| Windy Works | 6.6 | ★★ | three arrow turrets, fans under ceiling spikes, pop-up walls |
| The Gauntlet | 8.9 | ★★★ | everything, longest stretches, most combos |

`node tools/rate.mjs -v` prints the breakdown per trap. The rating is a model: playtesting should tune `REACT`, the
star cut-offs and the modifier weights.

## 4. Gadgets: pressure, not kills

Traps sit in fixed places. Gadgets go **anywhere** and are limited by **charges per run and/or a cooldown**.
Rule: **no gadget kills on its own**. They stun, slow, push or confuse, so the danger still comes from the level.
Stunned in the air you keep your momentum, so a lightning bolt mid-jump doesn't drop you into a pit.

| Trapper | Uses | Effect |
|---|---|---|
| Lightning | 3 per run, 5 s cooldown, aimed | a cloud and column warn for 0.65 s, then a 1 s stun |
| Glue | unlimited, 14 s cooldown, aimed | a 3-tile puddle on the floor for 7 s: 45% speed, lower jumps |
| Gust | 2 per run, 10 s cooldown | 1.3 s of wind against the way you're facing |
| Hex | once per run | left and right swap for 2.6 s |

| Runner | Uses | Effect |
|---|---|---|
| Dash | unlimited, 3 s cooldown | a burst forward that ignores gravity for a moment: dodge a projectile or slip past a flame |
| Shield | 2 per run, 6 s cooldown | for 3 s, the next hit (trap or lightning) is blocked and bounces you up |
| Jammer | once per run | no traps or trapper gadgets for 3 s: the panic button |
| Air jump | 3 per run | a second jump in mid-air |

The interesting part is the counterplay: the runner saves the Jammer for the hardest trap, and the trapper baits the
Shield with a cheap Glue before the real threat. Gadgets reset every run so both players get the same budget.

## 5. Random levels

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
