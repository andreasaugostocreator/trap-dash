// Achievements, kept on this device. unlock() returns the definition the first time, null after that.
export const ACHIEVEMENTS = [
  { id: 'first_flag', icon: '🏁', name: 'First Flag', desc: 'Reach the flag on any level' },
  { id: 'flawless', icon: '✨', name: 'Untouchable', desc: 'Reach the flag without a single fall' },
  { id: 'speedster', icon: '⚡', name: 'Speedster', desc: 'Finish Sunny Hills in under 15 seconds' },
  { id: 'gauntlet', icon: '🛡', name: 'Gauntlet Survivor', desc: 'Finish The Gauntlet' },
  { id: 'daredevil', icon: '🔥', name: 'Daredevil', desc: 'Finish a ★★★ random level' },
  { id: 'close5', icon: '😅', name: 'Living Dangerously', desc: '5 close calls in one run' },
  { id: 'shield_save', icon: '🫧', name: 'Not Today', desc: 'Block a hit with the shield' },
  { id: 'ghostbuster', icon: '👻', name: 'Ghostbuster', desc: 'Beat the ghost of the last run' },
  { id: 'endless5', icon: '🏃', name: 'Marathon', desc: 'Reach stage 5 in endless mode' },
  { id: 'endless10', icon: '🚀', name: 'Unstoppable', desc: 'Reach stage 10 in endless mode' },
  { id: 'first_catch', icon: '🪤', name: 'Gotcha', desc: 'Catch the runner with a trap' },
  { id: 'assist', icon: '🌬', name: 'Helping Hand', desc: 'The runner falls right after your trick' },
  { id: 'combo', icon: '💥', name: 'Combo King', desc: 'Three catches in a row, each within 6 s' },
  { id: 'catch5', icon: '🧹', name: 'Pest Control', desc: '5 catches in one run' },
  { id: 'variety', icon: '🎲', name: 'Jack of All Traps', desc: 'Catches with 4 different traps in one run' },
  { id: 'trap_master', icon: '👹', name: 'Trap Master', desc: 'Score 900 trap points in one run' },
  { id: 'champion', icon: '🏆', name: 'Champion', desc: 'Win a best-of-3 match' },
  { id: 'rivals', icon: '🤝', name: 'Rivals', desc: 'Play 10 levels with a friend' },
];
const KEY = 'trapdash-achievements';
let got = {};
try { got = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* private mode */ }
export const has = id => !!got[id];
export const count = () => Object.keys(got).length;
export function unlock(id) {
  if (got[id]) return null;
  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (!def) return null;
  got[id] = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(got)); } catch { /* private mode */ }
  return def;
}
// simple counters (levels played together)
export function bump(stat) {
  let n = 0;
  try { n = +(localStorage.getItem('trapdash-stat-' + stat) || 0) + 1; localStorage.setItem('trapdash-stat-' + stat, n); } catch { /* private mode */ }
  return n;
}
