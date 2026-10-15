// Gamepads (standard mapping: Xbox / PlayStation / Switch Pro in a browser). Polled once a frame.
// Buttons: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start, 12-15 d-pad up/down/left/right.
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const DEAD = 0.4;
let prev = [];   // per pad: which buttons were down last frame

// One snapshot per connected pad: held buttons, buttons pressed / released this frame, and the sticks.
export function pollPads() {
  const list = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(p => p && p.connected);
  return list.map((p, i) => {
    const down = p.buttons.map(b => b.pressed || b.value > 0.5), was = prev[p.index] || [];
    prev[p.index] = down;
    const ax = (k) => Math.abs(p.axes[k] || 0) > DEAD ? p.axes[k] : 0;
    const lx = ax(0), ly = ax(1);
    return {
      slot: i, down, pressed: down.map((d, k) => d && !was[k]), released: down.map((d, k) => !d && was[k]),
      left: lx < 0 || !!down[BTN.LEFT], right: lx > 0 || !!down[BTN.RIGHT], up: ly < 0 || !!down[BTN.UP], downDir: ly > 0 || !!down[BTN.DOWN],
      lx, ly, rx: ax(2), ry: ax(3),
    };
  });
}
export const padCount = () => (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(p => p && p.connected).length;
