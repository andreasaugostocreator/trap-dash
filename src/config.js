// Tuning numbers in one place. World units are pixels at 16 px per tile; time is seconds.
export const TILE = 16;
export const DT = 1 / 60;

export const PHYS = {
  w: 10, h: 13,            // player hitbox
  maxRun: 132,
  accelGround: 1700, accelAir: 1150, friction: 2000,
  gravity: 1500, gravityCut: 3200, maxFall: 290,
  fallGravity: 900,        // gentler on the way down so landings aren't a sudden drop
  apexGravity: 0.55,       // a little hang time at the top of a held jump
  jumpV: 410, springV: 640,
  coyote: 0.09, buffer: 0.12,
  respawn: 0.75,
};

// Traps come in four families. Within a family only the shape and the numbers change:
//   zone    - an area that hurts for `active` seconds after a `warn` telegraph (spikes, flame; the crusher's area moves)
//   emitter - launches a projectile that flies until it hits a wall (cannon, arrows)
//   floor   - changes the terrain: takes floor away or puts a wall in the way (trapdoor, pop-up wall)
//   force   - doesn't hurt, pushes (fan)
// warn: telegraph before it acts, active: how long it acts, cd: cooldown from the moment it is triggered.
export const TRAPS = {
  spikes:   { name: 'Spikes',   family: 'zone',    warn: 0.22, active: 0.6, cd: 2.2 },
  flame:    { name: 'Flame',    family: 'zone',    warn: 0.3,  active: 0.9, cd: 2.8, reach: 3 },
  crusher:  { name: 'Crusher',  family: 'zone',    warn: 0.25, active: 0,   cd: 3.6, fallG: 2400, rest: 0.4, rise: 55 },
  cannon:   { name: 'Cannon',   family: 'emitter', warn: 0.18, active: 0,   cd: 1.6, shot: { speed: 175, w: 8, h: 8 } },
  arrows:   { name: 'Arrows',   family: 'emitter', warn: 0.1,  active: 0,   cd: 0.9, shot: { speed: 300, w: 10, h: 3 } },
  trapdoor: { name: 'Trapdoor', family: 'floor',   warn: 0.25, active: 1.6, cd: 3.5 },
  wall:     { name: 'Wall',     family: 'floor',   warn: 0.2,  active: 1.4, cd: 3.2 },
  fan:      { name: 'Fan',      family: 'force',   warn: 0.25, active: 1.3, cd: 3.0, reach: 5, push: 2600, maxUp: 300 },
};
export const TRAP_LOCK = 0.4;   // the trapper can't fire two traps closer together than this
export const TIME_LIMIT = 100;

// Gadgets: never deadly on their own. charges -1 = unlimited, cd = seconds between uses. Charges reset every run.
// aim: the trapper picks a spot on the map. passive: used automatically (the air jump).
export const GADGETS = {
  trapper: {
    bolt:  { name: 'Lightning', charges: 3,  cd: 5,  aim: true, warn: 0.65, stun: 1.0, width: 14 },
    glue:  { name: 'Glue',      charges: -1, cd: 14, aim: true, life: 7, slow: 0.45 },
    gust:  { name: 'Gust',      charges: 2,  cd: 10, time: 1.3, push: 950 },
    hex:   { name: 'Hex',       charges: 1,  cd: 0,  time: 2.6 },
  },
  runner: {
    dash:    { name: 'Dash',     charges: -1, cd: 3,  time: 0.16, speed: 340 },
    shield:  { name: 'Shield',   charges: 2,  cd: 6,  time: 3 },
    jam:     { name: 'Jammer',   charges: 1,  cd: 0,  time: 3 },
    feather: { name: 'Air jump', charges: 3,  cd: 0,  passive: true },
  },
};
