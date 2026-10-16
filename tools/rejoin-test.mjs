// Rejoin: (1) the host reloads mid-party: they reopen the same code and the guest finds them again, score kept.
// (2) the guest leaves by mistake: the title offers "Rejoin party ABCD" and it works. Needs :8080 + relay broker.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [];
const q = '?nop2p&autoready&relay=ws://127.0.0.1:8883';
const ctxH = await b.newContext({ viewport: { width: 1280, height: 720 } }), ctxG = await b.newContext({ viewport: { width: 1280, height: 720 } });
const h = await ctxH.newPage(), g = await ctxG.newPage();
for (const p of [h, g]) p.on('pageerror', e => errs.push(e.message));
await h.goto('http://localhost:8080/' + q); await g.goto('http://localhost:8080/' + q); await h.waitForTimeout(500);
await h.click('text=Host a party'); await h.waitForFunction(() => document.getElementById('roomCode').textContent !== '----');
const code = await h.textContent('#roomCode');
await g.click('text=Join a party'); await g.fill('#code', code); await g.click('#joinGo');
await h.waitForFunction(() => window.__td.players.b); await h.waitForTimeout(300);
await h.evaluate(() => { window.__td.score.a = 2; });
console.log('party', code, '| host score set to 2');
// 1. the host reloads
await h.reload(); await h.waitForTimeout(500);
await h.waitForFunction(() => window.__td.mode === 'online' && document.getElementById('roomCode').textContent.length === 4, null, { timeout: 15000 });
const reopened = await h.textContent('#roomCode');
await h.waitForFunction(() => window.__td.players.b, null, { timeout: 30000 }).catch(() => {});
const r1 = await h.evaluate(() => ({ friend: window.__td.players.b && window.__td.players.b.name, score: window.__td.score.a }));
console.log('host reloaded -> reopened', reopened, '| guest back:', !!r1.friend, '| score kept:', r1.score);
// 2. the guest leaves by mistake and rejoins from the title
await g.click('#leaveBtn'); await g.waitForTimeout(800);
const offer = await g.evaluate(() => !document.getElementById('rejoinBtn').classList.contains('hidden') && document.getElementById('rejoinBtn').textContent.trim());
console.log('guest left; title offers:', offer);
await g.screenshot({ path: 'shots/108-rejoin-offer.png' });
await g.click('#rejoinBtn');
await h.waitForFunction(() => window.__td.players.b, null, { timeout: 20000 }).catch(() => {});
const back2 = await g.evaluate(() => window.__td.mode === 'online' && !document.getElementById('lobby').classList.contains('hidden'));
console.log('guest rejoined from the title:', back2);
const ok = reopened === code && r1.friend && r1.score === 2 && offer && back2;
console.log(ok ? 'rejoin ok' : 'FAIL');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();
