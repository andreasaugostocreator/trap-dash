// Your player profile: lifetime numbers, best times per level and the last few matches, kept on this device.
const KEY = 'trapdash-stats';
const fresh = () => ({ runs: 0, flags: 0, falls: 0, catches: 0, trapPts: 0, levelsWon: 0, levelsLost: 0, matchesWon: 0, matchesPlayed: 0, gems: 0, best: {}, recent: [], since: Date.now() });
let st = fresh();
try { st = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* private mode */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* full or blocked */ } };
export const stats = () => st;

// one of your own runs as the runner
export function recordRun({ levelId, levelName, time, finished, deaths }) {
  st.runs++; st.falls += deaths || 0;
  if (finished) {
    st.flags++;
    if (levelId) { const b = st.best[levelId]; if (!b || time < b.t) st.best[levelId] = { t: time, name: levelName }; }
  }
  save();
}
export function recordCatch() { st.catches++; save(); }
export function recordTrapPoints(pts) { st.trapPts += pts || 0; save(); }
export function recordGems(n) { st.gems += n; save(); }
// a finished level (both runs) or a whole match, for the recent list
export function recordResult({ kind, mode, level, opp, outcome, score }) {
  if (kind === 'level') { if (outcome === 'win') st.levelsWon++; else if (outcome === 'loss') st.levelsLost++; }
  if (kind === 'match') { st.matchesPlayed++; if (outcome === 'win') st.matchesWon++; }
  st.recent.unshift({ at: Date.now(), kind, mode, level, opp, outcome, score });
  st.recent.length = Math.min(st.recent.length, 12);
  save();
}
export function resetStats() { st = fresh(); save(); }
