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
  respawn: 1.0,
};

// Traps come in four families. Within a family only the shape and the numbers change:
//   zone    - an area that hurts for `active` seconds after a `warn` telegraph (spikes, flame; the crusher's area moves)
//   emitter - launches a projectile that flies until it hits a wall (cannon, arrows)
//   floor   - changes the terrain: takes floor away or puts a wall in the way (trapdoor, pop-up wall)
//   force   - doesn't hurt, pushes (fan)
// warn: telegraph before it acts, active: how long it acts, cd: cooldown from the moment it is triggered.
export const TRAPS = {
  spikes:   { name: 'Spikes',   family: 'zone',    warn: 0.12, active: 0.6, cd: 1.6 },
  flame:    { name: 'Flame',    family: 'zone',    warn: 0.18, active: 1.0, cd: 2.0, reach: 3 },
  crusher:  { name: 'Crusher',  family: 'zone',    warn: 0.12, active: 0,   cd: 2.6, fallG: 3200, rest: 0.35, rise: 70 },
  cannon:   { name: 'Cannon',   family: 'emitter', warn: 0.1,  active: 0,   cd: 1.2, shot: { speed: 230, w: 8, h: 8 } },
  arrows:   { name: 'Arrows',   family: 'emitter', warn: 0.06, active: 0,   cd: 0.8, shot: { speed: 320, w: 10, h: 3 } },
  trapdoor: { name: 'Trapdoor', family: 'floor',   warn: 0.12, active: 1.6, cd: 2.6 },
  wall:     { name: 'Wall',     family: 'floor',   warn: 0.1,  active: 1.6, cd: 2.4 },
  fan:      { name: 'Fan',      family: 'force',   warn: 0.15, active: 1.3, cd: 2.4, reach: 5, push: 2800, maxUp: 320 },
};
export const TRAP_LOCK = 0.25;   // the trapper can't fire two traps closer together than this
export const TIME_LIMIT = 100;

// Gadgets: never deadly on their own. charges -1 = unlimited, cd = seconds between uses. Charges reset every run.
// aim: the trapper picks a spot on the map. passive: used automatically (the air jump).
export const GADGETS = {
  trapper: {
    bolt:  { name: 'Lightning', charges: 4,  cd: 4,  aim: true, warn: 0.45, stun: 1.2, width: 16 },
    glue:  { name: 'Glue',      charges: -1, cd: 10, aim: true, life: 7, slow: 0.4 },
    gust:  { name: 'Gust',      charges: 3,  cd: 8,  time: 1.4, push: 1050 },
    hex:   { name: 'Hex',       charges: 2,  cd: 12, time: 2.6 },
  },
  runner: {
    dash:    { name: 'Dash',     charges: 2,  cd: 6,  time: 0.12, speed: 250 },
    shield:  { name: 'Shield',   charges: 1,  cd: 0,  time: 2 },
    jam:     { name: 'Jammer',   charges: 1,  cd: 0,  time: 2 },
    feather: { name: 'Air jump', charges: 2,  cd: 0,  passive: true },
  },
};
