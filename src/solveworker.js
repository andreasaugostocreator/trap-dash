// Runs the solver (solver.js) off the main thread for the level editor: can the flag be reached?
import { solve } from './solver.js';
self.onmessage = e => { let ok = false; try { ok = !!solve(e.data.level, 120000).ok; } catch { ok = false; } self.postMessage({ ok }); };
