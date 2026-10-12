// The trapper's score. Every catch is worth points, catches close together build a combo, and a catch with a
// trap kind you haven't used yet this run earns a bonus. Both devices compute it from the same events.
export const TITLES = [[0, 'Rookie'], [200, 'Prankster'], [500, 'Trickster'], [900, 'Trap Master'], [1400, 'Mastermind'], [2000, 'Evil Genius']];
export const titleFor = pts => TITLES.filter(([p]) => pts >= p).pop()[1];
const COMBO_WINDOW = 6;   // seconds

export class TrapScore {
  constructor() { this.pts = 0; this.catches = 0; this.streak = 0; this.bestStreak = 0; this.lastT = -99; this.kinds = new Set(); }
  catch(credit, time) {
    const assist = credit === 'assist';
    let gain = assist ? 60 : 100;
    const lines = [assist ? 'ASSIST!' : 'CAUGHT!'];
    if (!assist && !this.kinds.has(credit)) { this.kinds.add(credit); if (this.kinds.size > 1) { gain += 50; lines.push('NEW TRAP +50'); } }
    this.streak = time - this.lastT < COMBO_WINDOW ? this.streak + 1 : 1;
    this.lastT = time;
    if (this.streak > 1) { const mult = 1 + 0.5 * (this.streak - 1); gain = Math.round(gain * mult); lines.push(`COMBO ×${mult}`); }
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.pts += gain; this.catches++;
    return { gain, lines, streak: this.streak };
  }
}
