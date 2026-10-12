// Builds random levels off the main thread, so the game never freezes while a level is being made and checked.
import { generate } from './gen.js';
onmessage = e => { const { id, seed, stars } = e.data; postMessage({ id, level: generate(seed, stars) }); };
