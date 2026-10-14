// Player settings, kept on this device. Sound and music live in audio.js.
const KEY = 'trapdash-settings';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* private mode */ }
// (Automated browser tests start with the preview off so their timings stay simple.)
export const settings = Object.assign({ vibrate: true, ghost: true, shake: true, graphics: 'auto', preview: !(typeof navigator !== 'undefined' && navigator.webdriver) }, saved);
export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode */ } }
export const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
export function buzz(pattern) { if (settings.vibrate && canVibrate) try { navigator.vibrate(pattern); } catch { /* not allowed */ } }
