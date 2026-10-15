// Matchmaking: two players press "Find a match" and end up in the same best-of-3 on their own; a third player who
// searches alone keeps waiting and can cancel. Needs :8080 + relay broker.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const q = '?nop2p&relay=ws://127.0.0.1:8883';
const open = async () => { const c = await b.newContext({ viewport: { width: 844, height: 390 } }); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto('http://localhost:8080/' + q); await p.waitForTimeout(3500); return p; };
const [A, B] = [await open(), await open()];
await A.click('[data-go="match"]'); await A.waitForTimeout(700);
console.log('A alone:', await A.textContent('#mmStatus'));
await A.screenshot({ path: 'shots/116-matchmaking.png' });
await B.click('[data-go="match"]');
const both = await Promise.all([A, B].map(p => p.waitForFunction(() => window.__td.run && window.__td.run.phase, null, { timeout: 25000 }).then(() => true).catch(() => false)));
const st = await Promise.all([A, B].map(p => p.evaluate(() => ({ host: window.__td.mode === 'online' && !!window.__td.players.a, level: window.__td.run && JSON.stringify(window.__td.run.level).slice(0, 20), names: [window.__td.players.a?.name, window.__td.players.b?.name].join(' vs ') }))));
console.log('A', JSON.stringify(st[0])); console.log('B', JSON.stringify(st[1]));
const ok1 = both[0] && both[1] && st[0].level === st[1].level;
console.log('both in the same round:', ok1);
// a lone searcher can cancel back to the title
const C = await open();
await C.click('[data-go="match"]'); await C.waitForTimeout(1500);
const waiting = await C.textContent('#mmStatus');
await C.click('#mmCancel'); await C.waitForTimeout(300);
const back = await C.evaluate(() => !document.getElementById('title').classList.contains('hidden'));
console.log('C alone:', waiting, '| cancel -> title:', back);
console.log(ok1 && back ? 'matchmaking ok' : 'FAIL');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();
