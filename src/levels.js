// Levels are drawn with a few builder calls and turned into ASCII rows. Legend:
//   #  ground          =  one-way platform      ^  spikes (always out)     B  spring
//   S  start           C  checkpoint            G  goal flag
//   Traps the trapper can fire (side-by-side tiles of the same letter are one trap):
//   P  pop-up spikes   T  trapdoor              X  crusher (falls down)    F  flame jet (shoots up)
//   <  >  cannon facing left / right    {  }  arrow turret facing left / right
//   U  pop-up wall (rises two tiles)     W  fan (blows upward)      v  ceiling spikes (always out)
//   Z  saw rail (a blade runs along it)  K  k  laser facing right / left    D  bomb dropper (in a ceiling)
//   Q  conveyor belt floor (runs back)   I  floor that freezes over
//   M  moving platform (sideways)        N  lift (moves up and down)    L  crumbling stone     R  rope anchor
//   j  solid ice (always slippery)
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
  {
    id: 'mill', name: 'Saw Mill', theme: 'day',
    map: build(110, 18, ({ set, rect, ground, row }) => {
      rect(0, 0, 0, 17); rect(109, 0, 109, 17); rect(1, 0, 108, 2);
      ground(1, 20, 14); set(3, 13, 'S'); row(8, 13, 13, 'Z'); row(16, 20, 14, 'Q');
      ground(24, 45, 14); set(26, 13, 'C'); set(30, 2, 'D'); set(35, 2, 'D'); set(38, 13, '#'); set(44, 13, 'k');
      ground(49, 70, 14); row(50, 55, 14, 'I'); row(56, 57, 13, '^'); set(61, 13, 'C'); row(63, 68, 13, 'Z');
      ground(74, 108, 14); set(78, 2, 'D'); row(80, 85, 14, 'Q'); set(88, 13, '#'); set(95, 13, 'k'); set(104, 13, 'G');
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
    id: 'lava', name: 'Lava Caves', theme: 'lava',
    map: build(130, 18, ({ set, rect, ground, row }) => {
      rect(0, 0, 0, 17); rect(129, 0, 129, 17); rect(1, 0, 128, 2); row(30, 34, 3, 'v'); row(64, 68, 3, 'v');
      ground(1, 10, 14); set(3, 13, 'S'); row(11, 16, 14, 'L');
      ground(17, 30, 14); set(20, 2, 'D'); set(25, 2, 'D'); set(28, 13, 'C');
      row(31, 32, 14, 'M'); ground(41, 52, 14); set(45, 14, 'F'); set(49, 14, 'F');
      ground(53, 56, 12); ground(57, 70, 10); row(59, 60, 9, 'P'); set(66, 9, 'C');
      row(71, 72, 10, 'N'); ground(73, 84, 7); row(76, 78, 6, 'P'); set(82, 6, 'U');
      ground(85, 100, 14); row(88, 89, 13, '^'); set(92, 13, 'C'); set(99, 13, '<');
      rect(103, 5, 105, 6); set(104, 6, 'R');
      ground(109, 128, 14); set(110, 13, '#'); set(118, 13, 'k'); set(124, 13, 'G');
    }),
  },
  {
    id: 'frost', name: 'Frost Castle', theme: 'ice',
    map: build(130, 18, ({ set, rect, ground, row }) => {
      rect(0, 0, 0, 17); rect(129, 0, 129, 17);
      ground(1, 24, 14); set(3, 13, 'S'); row(5, 11, 14, 'j');
      rect(15, 4, 22, 7); row(16, 17, 8, 'X'); row(20, 21, 8, 'X');
      rect(28, 6, 30, 7); set(29, 7, 'R');
      ground(33, 44, 14); set(34, 13, 'C'); row(36, 41, 14, 'I'); set(42, 13, '^');
      row(45, 50, 14, 'L'); ground(51, 62, 14); row(54, 58, 13, 'Z'); set(62, 13, '{');
      ground(63, 70, 14); set(65, 13, 'C');
      row(71, 72, 14, 'M');
      ground(80, 86, 12); row(82, 86, 12, 'j'); row(87, 90, 12, 'T'); ground(91, 96, 12);
      ground(97, 128, 14); set(103, 14, 'F'); set(107, 14, 'F'); set(100, 13, 'C'); row(112, 116, 14, 'j'); set(117, 13, '^'); set(124, 13, 'G');
    }),
  },
  {
    id: 'cove', name: 'Pirate Cove', theme: 'pirate',
    map: build(140, 18, ({ set, rect, ground, row }) => {
      rect(0, 0, 0, 17); rect(139, 0, 139, 17);
      ground(1, 10, 14); set(3, 13, 'S');
      ground(14, 40, 12); rect(24, 13, 26, 17, '.'); row(24, 26, 12, 'T'); set(39, 11, '<'); set(31, 11, 'U');
      rect(43, 4, 47, 4); set(45, 4, 'R');
      ground(50, 75, 12); set(52, 11, 'C'); set(60, 11, 'U'); rect(64, 13, 66, 17, '.'); row(64, 66, 12, 'L'); set(75, 11, '{');
      row(76, 77, 12, 'M');
      ground(85, 100, 12); set(87, 11, 'C'); row(89, 94, 12, 'Q'); set(100, 11, '<');
      ground(101, 138, 14); row(108, 110, 13, 'P'); rect(114, 7, 116, 7); set(115, 7, 'R'); rect(112, 13, 119, 17, '.'); set(134, 13, 'G');
    }),
  },
  {
    id: 'manor', name: 'Haunted Manor', theme: 'haunted',
    map: build(140, 18, ({ set, rect, ground, row }) => {
      rect(0, 0, 0, 17); rect(139, 0, 139, 17);
      ground(1, 12, 14); set(3, 13, 'S'); row(13, 18, 14, 'L');
      ground(19, 30, 14); set(20, 13, 'K'); set(30, 13, '#');
      ground(31, 42, 14); rect(33, 5, 40, 8); row(33, 40, 9, 'v'); row(35, 37, 14, 'W');
      ground(43, 46, 14); set(44, 13, 'C');
      rect(50, 6, 52, 7); set(51, 7, 'R');
      ground(56, 70, 14); row(60, 62, 13, 'P'); row(71, 74, 14, 'T'); ground(75, 86, 14); set(80, 2, '.');
      row(87, 88, 14, 'N'); ground(89, 100, 9); set(90, 8, 'C'); set(93, 9, 'F'); set(96, 9, 'F');
      row(101, 104, 9, 'L');
      ground(105, 138, 14); row(110, 115, 13, 'Z'); set(122, 13, 'U'); set(134, 13, 'G'); set(137, 13, '<');
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
  lava: { sky: ['#1a0d0d', '#2b1210', '#3d1812', '#5a2214'], far: 'cave', farCol: ['#2a1414', '#3d1d18', '#ff7a1a'], near: 'cave2', nearCol: ['#1e0e0c', '#2e1612', '#ff9a3c'],
    grass: ['#1c1414', '#3a2a2a', '#5a4040', '#ff7a1a'], dirt: ['#1a1010', '#2a1a18', '#3a2622', '#4e3530'], cloud: ['#4a3030', '#3a2424'], line: '#0c0606' },
  ice: { sky: ['#9fd3f5', '#bfe3fa', '#dff1fd', '#f2faff'], far: 'mountains', farCol: ['#9ab8e0', '#c4dcf5', '#ffffff'], near: 'spires', nearCol: ['#7fb6e6', '#bfe0ff', '#5a8ec4'],
    grass: ['#a8c8e8', '#e6f3ff', '#ffffff', '#ffffff'], dirt: ['#3a5a8a', '#5a7fb0', '#7aa0cc', '#a0c4e8'], cloud: ['#ffffff', '#e1efff'], line: '#1c2a44' },
  pirate: { sky: ['#3fa6ff', '#68bcff', '#97d2ff', '#cdeaff'], far: 'sea', farCol: ['#1f5f9e', '#3d8be0', '#2a3a5a'], near: 'palms', nearCol: ['#d9b26a', '#2f7a45', '#5a3a1a'],
    grass: ['#7a4b26', '#b07a45', '#d9a066', '#f0c08a'], dirt: ['#3a2414', '#5a3a20', '#6e4828', '#83582f'], cloud: ['#ffffff', '#d8ecff'], line: '#1c1424' },
  haunted: { sky: ['#120d1e', '#1c1430', '#2a1f45', '#3a2a5a'], stars: true, far: 'mansion', farCol: ['#1e1630', '#2c2244', '#ffd84a'], near: 'deadtrees', nearCol: ['#140f22', '#221a36', '#0c0816'],
    grass: ['#3a4a3a', '#566656', '#7a8a6a', '#a0b090'], dirt: ['#1e1a28', '#2c2638', '#3c3448', '#4e4560'], cloud: ['#4a3a6a', '#3a2c55'], line: '#0a0610' },
  dusk: { sky: ['#2d2152', '#4a3075', '#83508f', '#d67896'], far: 'mountains', farCol: ['#3e2a66', '#52387f', '#f2a6c4'], near: 'pines', nearCol: ['#26193f', '#33224f', '#1a1030'],
    grass: ['#7a2f5e', '#b44f86', '#f07fb4', '#ffc0dc'], dirt: ['#221425', '#331f38', '#47304c', '#5d4162'], cloud: ['#f2a6c4', '#b07aa8'], line: '#140b18' },
};
