// Levels are drawn with a few builder calls and turned into ASCII rows. Legend:
//   #  ground          =  one-way platform      ^  spikes (always out)     B  spring
//   S  start           C  checkpoint            G  goal flag
//   Traps the trapper can fire (side-by-side tiles of the same letter are one trap):
//   P  pop-up spikes   T  trapdoor              X  crusher (falls down)    F  flame jet (shoots up)
//   <  >  cannon facing left / right    {  }  arrow turret facing left / right
//   U  pop-up wall (rises two tiles)     W  fan (blows upward)      v  ceiling spikes (always out)
function build(w, h, fn) {
  const g = Array.from({ length: h }, () => Array(w).fill('.'));
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = c; };
  const rect = (x0, y0, x1, y1, c = '#') => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
  fn({ set, rect, ground: (x0, x1, top) => rect(x0, top, x1, h - 1), row: (x0, x1, y, c) => rect(x0, y, x1, y, c) });
  return g.map(r => r.join(''));
}

export const LEVELS = [
  {
    id: 'hills', name: 'Sunny Hills', theme: 'day',
    map: build(104, 18, ({ set, rect, ground, row }) => {
      rect(0, 0, 0, 17); rect(103, 0, 103, 17);
      ground(1, 15, 14); set(3, 13, 'S');
      row(8, 10, 13, 'P');
      ground(19, 40, 14); set(31, 13, '<'); row(36, 37, 13, '^'); set(39, 13, 'C');
      row(41, 44, 14, 'T'); ground(45, 46, 14); row(47, 50, 14, 'T');
      ground(51, 62, 14); rect(55, 4, 60, 7); row(57, 58, 8, 'X');
      ground(63, 72, 12); set(68, 12, 'F');
      row(74, 76, 10, '=');
      ground(78, 86, 14); set(85, 14, 'B'); ground(87, 88, 8); set(80, 13, 'C');
      ground(89, 102, 14); row(92, 94, 13, 'P'); set(99, 13, 'G'); set(102, 13, '<');
    }),
  },
  {
    id: 'treetops', name: 'Treetop Hop', theme: 'sunset',
    map: build(120, 20, ({ set, rect, ground, row }) => {
      rect(0, 0, 0, 19); rect(119, 0, 119, 19);
      ground(1, 8, 16); set(3, 15, 'S');
      ground(11, 12, 15); ground(15, 16, 14); ground(19, 20, 13); row(19, 20, 12, 'P');
      ground(23, 30, 13); set(30, 12, '{');
      ground(34, 40, 15); set(36, 14, 'C'); set(39, 14, 'U');
      row(42, 44, 13, '='); row(46, 48, 11, '='); row(50, 52, 9, '=');
      ground(54, 62, 9); rect(56, 0, 59, 2); row(57, 58, 3, 'X'); set(61, 9, 'F');
      ground(63, 65, 16); row(66, 69, 16, 'T'); ground(70, 81, 16); row(73, 74, 15, '^'); set(78, 15, 'C');
      set(81, 16, 'B'); ground(83, 96, 10); row(87, 89, 9, 'P'); set(96, 9, '<');
      ground(97, 118, 15); rect(106, 0, 110, 7); row(107, 108, 8, 'X'); set(114, 14, 'G');
    }),
  },
  {
    id: 'meadow', name: 'Midnight Meadow', theme: 'night',
    map: build(120, 18, ({ set, rect, ground, row }) => {
      rect(0, 0, 0, 17); rect(119, 0, 119, 17); rect(1, 0, 118, 3);
      ground(1, 30, 14); set(3, 13, 'S');
      row(8, 9, 4, 'X'); row(14, 15, 4, 'X'); row(20, 21, 4, 'X'); set(28, 13, 'C');
      ground(34, 60, 14); set(38, 14, 'F'); set(44, 14, 'F'); set(50, 14, 'F'); set(58, 13, 'C');
      rect(61, 17, 73, 17); row(61, 73, 16, '^');
      row(62, 64, 14, 'T'); set(65, 14, '#'); row(66, 68, 14, 'T'); set(69, 14, '#'); row(70, 72, 14, 'T');
      ground(73, 118, 14); row(80, 82, 13, 'P'); set(92, 12, '#'); set(92, 13, '<');
      row(98, 99, 13, '^'); set(112, 13, 'G'); set(117, 13, '<');
    }),
  },
  {
    id: 'clouds', name: 'Cloud Climb', theme: 'sky',
    map: build(40, 60, ({ set, rect, ground, row }) => {
      rect(0, 0, 0, 59); rect(39, 0, 39, 59);
      ground(1, 38, 56); set(4, 55, 'S');
      row(8, 13, 53, '='); row(16, 22, 50, '#'); row(18, 20, 49, 'P');
      row(25, 30, 47, '='); row(31, 37, 44, '#'); set(0, 43, '>');
      row(24, 29, 41, '='); row(14, 20, 38, '#'); set(18, 38, 'F'); set(15, 37, 'C');
      row(6, 11, 35, '='); row(1, 5, 32, '#'); set(3, 32, 'B');
      row(4, 12, 26, '#'); rect(7, 18, 10, 19); row(8, 9, 20, 'X');
      row(15, 20, 23, '='); row(23, 28, 20, 'T');
      row(31, 37, 17, '#'); set(39, 16, '<'); set(34, 16, 'C');
      row(24, 29, 14, '='); row(15, 21, 11, '#'); row(16, 18, 10, 'P');
      row(6, 12, 8, '='); row(1, 4, 5, '#'); set(2, 4, 'G');
    }),
  },
  {
    id: 'gauntlet', name: 'The Gauntlet', theme: 'dusk',
    map: build(150, 20, ({ set, rect, ground, row }) => {
      rect(0, 0, 0, 19); rect(149, 0, 149, 19);
      ground(1, 10, 16); set(3, 15, 'S'); row(6, 8, 15, 'P');
      ground(14, 30, 16); set(30, 15, '{');
      row(31, 34, 16, 'T'); ground(35, 44, 16);
      rect(36, 7, 43, 9); row(37, 38, 10, 'X'); row(41, 42, 10, 'X'); set(44, 15, 'C');
      ground(46, 50, 14); ground(51, 55, 12); set(53, 12, 'F'); ground(56, 60, 10);
      rect(61, 19, 80, 19); row(61, 80, 18, '^');
      row(62, 64, 10, '='); row(67, 69, 9, 'T'); row(72, 74, 10, '='); row(77, 79, 11, '=');
      ground(81, 90, 13); set(83, 12, 'C'); set(90, 12, '<');
      ground(91, 97, 16); set(95, 16, 'B'); ground(98, 104, 10); row(100, 102, 9, 'P');
      ground(105, 130, 16); rect(109, 0, 112, 8); row(110, 111, 9, 'X');
      set(116, 16, 'F'); set(120, 16, 'F'); set(124, 15, '^'); set(127, 15, 'C');
      row(131, 135, 16, 'T'); ground(136, 148, 16); set(144, 15, 'G'); set(148, 15, '<');
    }),
  },
  {
    id: 'windy', name: 'Windy Works', theme: 'sunset',
    map: build(100, 18, ({ set, rect, ground, row }) => {
      rect(0, 0, 0, 17); rect(99, 0, 99, 17);
      ground(1, 40, 14); set(3, 13, 'S'); set(11, 13, 'U'); set(16, 13, '{');
      rect(20, 5, 29, 8); row(20, 29, 9, 'v'); row(23, 25, 14, 'W');
      set(32, 13, 'C'); row(36, 37, 13, 'P');
      row(41, 44, 14, 'T');
      ground(45, 98, 14); row(47, 48, 13, 'P'); set(51, 13, 'U'); set(55, 13, 'U'); set(60, 13, '{');
      set(63, 13, 'C'); rect(66, 5, 72, 8); row(66, 72, 9, 'v'); row(68, 69, 14, 'W');
      set(77, 13, 'U'); row(81, 83, 13, 'P'); set(94, 13, 'G'); set(98, 13, '{');
    }),
  },
];

// Pixel palettes: sky bands top to bottom, background layers, grass [dark, mid, light, tip], dirt [darkest .. light].
export const THEMES = {
  day: { sky: ['#5fb8ff', '#82c8ff', '#a9daff', '#d2edff'], far: 'mountains', farCol: ['#7d97d6', '#a2b6ea', '#ffffff'], near: 'trees', nearCol: ['#2f7a45', '#46a056', '#22593a'],
    grass: ['#2c7a32', '#47ad4b', '#7bd65a', '#c4f08a'], dirt: ['#4f301b', '#6e4425', '#8d5a31', '#ad7442'], cloud: ['#ffffff', '#d8ecff'], line: '#1c1424' },
  sunset: { sky: ['#ff6f61', '#ff9466', '#ffbb7a', '#ffdfa0'], far: 'mountains', farCol: ['#a8507a', '#c86c8c', '#ffd2a0'], near: 'trees', nearCol: ['#6e2f55', '#8c4468', '#4e1f3e'],
    grass: ['#2f7a2c', '#55a83a', '#8ad04e', '#d4f07a'], dirt: ['#431f1a', '#62331f', '#81462b', '#a15e38'], cloud: ['#fff1e0', '#ffc9b0'], line: '#1c1424' },
  night: { sky: ['#121330', '#191c42', '#222759', '#2e3470'], stars: true, far: 'mountains', farCol: ['#252a57', '#313773', '#4a5096'], near: 'pines', nearCol: ['#181b3b', '#22274f', '#10122a'],
    grass: ['#245452', '#357a72', '#56a594', '#98e0c4'], dirt: ['#1f1833', '#2c2247', '#3c2f5e', '#4e3f76'], cloud: ['#3a4080', '#2c3168'], line: '#0e0b1a' },
  sky: { sky: ['#3fa6ff', '#68bcff', '#97d2ff', '#cdeaff'], far: 'clouds', farCol: ['#e6f3ff', '#ffffff', '#c3dcf5'], near: 'clouds2', nearCol: ['#f4f9ff', '#ffffff', '#d4e6f8'],
    grass: ['#a9c6ea', '#dfeeff', '#ffffff', '#ffffff'], dirt: ['#6e8fc4', '#87a7d6', '#a0bde4', '#bcd2ef'], cloud: ['#ffffff', '#e1efff'], line: '#24304f' },
  dusk: { sky: ['#2d2152', '#4a3075', '#83508f', '#d67896'], far: 'mountains', farCol: ['#3e2a66', '#52387f', '#f2a6c4'], near: 'pines', nearCol: ['#26193f', '#33224f', '#1a1030'],
    grass: ['#7a2f5e', '#b44f86', '#f07fb4', '#ffc0dc'], dirt: ['#221425', '#331f38', '#47304c', '#5d4162'], cloud: ['#f2a6c4', '#b07aa8'], line: '#140b18' },
};
