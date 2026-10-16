// The level editor: paint, undo, widen, change world, test-play and come back, share a code, open the code as a
// link on another device, and play the level from the lobby. Needs :8080.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const errs = [], ok = {};
const hook = p => { p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text())); };
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['clipboard-read', 'clipboard-write'] });
const p = await ctx.newPage(); hook(p);
await p.goto('http://localhost:8080/'); await p.waitForTimeout(500);
await p.click('#edBtn'); await p.waitForTimeout(200); await p.screenshot({ path: 'shots/170-editor-home.png' });
await p.click('#edNew'); await p.waitForTimeout(500);
const tile = async (tx, ty) => p.evaluate(([tx, ty]) => { const R = window.__td.R, k = R.k / R.dpr; return { x: (tx * 16 + 8 - R.camX) * k, y: (ty * 16 + 8 - R.camY) * k }; }, [tx, ty]);
const mapAt = (x, y) => p.evaluate(([x, y]) => window.__td.ed.level.map[y][x], [x, y]);
// paint a row of pop-up spikes and a pit
await p.click('.edTool[data-tool="P"]');
let a = await tile(10, 13), c = await tile(13, 13);
await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(c.x, c.y, { steps: 6 }); await p.mouse.up();
ok.paint = (await mapAt(10, 13)) === 'P' && (await mapAt(13, 13)) === 'P';
await p.click('.edTool[data-tool="."]'); a = await tile(20, 14); await p.mouse.click(a.x, a.y);
ok.erase = (await mapAt(20, 14)) === '.';
await p.click('#edUndo'); ok.undo = (await mapAt(20, 14)) === '#';
await p.click('#edWider'); ok.wider = await p.evaluate(() => window.__td.ed.w) === 100;
await p.click('#edTheme'); ok.theme = await p.evaluate(() => window.__td.ed.level.theme) === 'sunset';
await p.fill('#edName', 'Spike Alley'); await p.waitForTimeout(400);
await p.screenshot({ path: 'shots/171-editor.png' });
// test it
await p.click('#edTest'); await p.waitForFunction(() => window.__td.run && window.__td.run.phase === 'play', null, { timeout: 9000 });
await p.evaluate(() => { const w = window.__td.run.world; w.player.x = w.goal.x; w.player.y = w.goal.y; });
await p.waitForSelector('#edBackRun', { timeout: 8000 }); await p.screenshot({ path: 'shots/172-editor-tested.png' });
await p.click('#edBackRun'); await p.waitForTimeout(500);
ok.backToEditor = await p.isVisible('#editor') && (await mapAt(10, 13)) === 'P';
// share
await p.click('#edShare'); await p.waitForTimeout(400);
const code = (await p.inputValue('#edCodeOut')).trim();
await p.waitForFunction(() => /✓|⚠/.test(document.getElementById('edSolve')?.textContent || ''), null, { timeout: 12000 }).catch(() => {});
const solveTxt = await p.textContent('#edSolve');
ok.code = /^TD[01]\./.test(code); ok.solvable = /✓/.test(solveTxt);
console.log('code', code.length, 'chars:', code.slice(0, 24) + '…', '|', solveTxt);
await p.screenshot({ path: 'shots/173-editor-share.png' });
// a friend opens the link
const ctx2 = await b.newContext({ viewport: { width: 1000, height: 600 } }), q = await ctx2.newPage(); hook(q);
await q.goto('http://localhost:8080/?level=' + code); await q.waitForTimeout(1200);
const got = await q.evaluate(() => JSON.parse(localStorage.getItem('trapdash-customs') || '[]').map(l => l.name));
ok.imported = got.includes('Spike Alley');
await q.click('[data-close]'); await q.click('text=Same screen'); await q.waitForTimeout(200);
await q.click('#myRow .chip'); const cur = await q.evaluate(() => window.__td.lobbyLevel());
ok.lobby = cur && cur.name === 'Spike Alley' && cur.stars >= 1;
await q.screenshot({ path: 'shots/174-lobby-mine.png' });
await q.click('#startBtn'); await q.waitForFunction(() => window.__td.run && window.__td.run.world.level.name === 'Spike Alley', null, { timeout: 8000 }).then(() => { ok.plays = true; }).catch(() => { ok.plays = false; });
console.log(JSON.stringify(ok)); console.log(Object.values(ok).every(Boolean) ? 'ALL OK' : 'FAILED');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();
