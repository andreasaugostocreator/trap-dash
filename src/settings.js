// Player settings, kept on this device. Sound and music live in audio.js.
const KEY = 'trapdash-settings';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* private mode */ }
// (Automated browser tests start with the preview off so their timings stay simple.)
export const settings = Object.assign({ vibrate: true, vib: 1, ghost: true, shake: true, graphics: 'auto', preview: !(typeof navigator !== 'undefined' && navigator.webdriver),
  lefty: false, btnSize: 1 }, saved);
// vibration strength: 0 off, 1 light, 2 strong (older saves only had on / off)
if (saved.vib == null && saved.vibrate === false) settings.vib = 0;
export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode */ } }
export const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
const VIB_SCALE = [0, 0.6, 1.5];
export function buzz(pattern) {
  if (!settings.vib || !canVibrate) return;
  const k = VIB_SCALE[settings.vib] || 1, scaled = Array.isArray(pattern) ? pattern.map(v => Math.max(1, Math.round(v * k))) : Math.max(1, Math.round(pattern * k));
  try { navigator.vibrate(scaled); } catch { /* not allowed */ }
}
