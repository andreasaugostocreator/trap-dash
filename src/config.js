// Tuning numbers in one place. World units are pixels at 16 px per tile; time is seconds.
export const TILE = 16;
export const DT = 1 / 60;

export const PHYS = {
  w: 10, h: 13,            // player hitbox
  maxRun: 132,
  accelGround: 1700, accelAir: 1150, friction: 2000,
  gravity: 1500, gravityCut: 3200, maxFall: 430,
  jumpV: 410, springV: 640,
  coyote: 0.09, buffer: 0.12,
  respawn: 0.75,
};

// warn: the telegraph before it hurts, active: how long it hurts, cd: cooldown from the moment it is triggered.
export const TRAPS = {
  spikes:   { name: 'Spikes',   warn: 0.22, active: 0.6,  cd: 2.2 },
  trapdoor: { name: 'Trapdoor', warn: 0.25, active: 1.6,  cd: 3.5 },
  cannon:   { name: 'Cannon',   warn: 0.18, active: 0,    cd: 1.6, speed: 175 },
  crusher:  { name: 'Crusher',  warn: 0.25, active: 0,    cd: 3.6, fallG: 2400, rest: 0.4, rise: 55 },
  flame:    { name: 'Flame',    warn: 0.3,  active: 0.9,  cd: 2.8, reach: 3 },
};
export const TRAP_LOCK = 0.4;   // the trapper can't fire two traps closer together than this
export const TIME_LIMIT = 100;

export const COLORS = [
  { id: 'radish', name: 'Radish', body: '#ff5d8f', dark: '#c2305f', leaf: '#4cc76a' },
  { id: 'sprout', name: 'Sprout', body: '#8fdc5a', dark: '#4f9a2c', leaf: '#2f8a4a' },
  { id: 'carrot', name: 'Carrot', body: '#ff9a3c', dark: '#c9621a', leaf: '#4cc76a' },
  { id: 'turnip', name: 'Turnip', body: '#b48cff', dark: '#7650c8', leaf: '#4cc76a' },
  { id: 'berry',  name: 'Berry',  body: '#5ab4ff', dark: '#2a72c4', leaf: '#3aa860' },
  { id: 'lemon',  name: 'Lemon',  body: '#ffd84a', dark: '#c99b10', leaf: '#4cc76a' },
];
