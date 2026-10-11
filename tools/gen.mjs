// Generates random levels and reports their ratings, solve checks and timing. Usage: node tools/gen.mjs [count] [-p]
import { generate, buildRandom } from '../src/gen.js';
import { rateLevel } from '../src/rating.js';
const n = +process.argv[2] || 6, print = process.argv.includes('-p');
// How the raw builder's ratings spread, before filtering:
for (const s of [1, 2, 3]) {
  const hist = [0, 0, 0, 0];
  for (let i = 0; i < 60; i++) hist[rateLevel(buildRandom(1000 + i, s)).stars]++;
  console.log(`plan ${s}★ raw ratings: 1★ ${hist[1]}  2★ ${hist[2]}  3★ ${hist[3]}`);
}
for (const s of [1, 2, 3]) for (let i = 0; i < n; i++) {
  const t = Date.now(), L = generate(42 + i * 101, s);
  console.log(`${s}★ wanted -> ${L ? `${L.stars}★ score ${L.score} "${L.name}" ${L.map[0].length} wide` : 'NONE'} (${Date.now() - t}ms)`);
  if (print && L && i === 0) console.log(L.map.join('\n'));
}
