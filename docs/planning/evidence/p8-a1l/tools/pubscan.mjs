// Do the published trial questions (public, in src/content/trials/generated) appear in what a build serves?
// Reports counts, file names and question ids only, never text. usage: node pubscan.mjs <copy-root> <dir>...
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const [root, ...dirs] = process.argv.slice(2);
const gen = join(root, 'src/content/trials/generated');
const fragments = [];   // [questionId, text]
const walk = (v, id) => { if (typeof v === 'string') { if (v.length >= 14 && /[一-鿿]/.test(v)) fragments.push([id, v]); } else if (Array.isArray(v)) v.forEach(x => walk(x, id)); else if (v && typeof v === 'object') Object.values(v).forEach(x => walk(x, id)); };
let questions = 0;
for (const f of readdirSync(gen).filter(f => f.endsWith('.json'))) for (const q of JSON.parse(readFileSync(join(gen, f), 'utf8')).questions) { questions++; walk(q.revisions, q.id); }
const files = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : [p]; });
for (const dir of dirs) {
  const hits = new Map(); let scanned = 0;
  for (const p of files(dir)) {
    if (/\.(png|jpg|webp|glb|woff2?|ico|map)$/.test(p)) continue;
    const text = readFileSync(p, 'utf8'); scanned++;
    for (const [id, t] of fragments) if (text.includes(t) || text.includes(JSON.stringify(t).slice(1, -1))) hits.set(p.slice(dir.length + 1), (hits.get(p.slice(dir.length + 1)) ?? new Set()).add(id));
  }
  console.log(JSON.stringify({ dir: dir.split('/').slice(-3).join('/'), filesScanned: scanned, publishedQuestions: questions, fragments: fragments.length, filesWithHits: hits.size,
    hits: [...hits].slice(0, 8).map(([f, ids]) => `${f} (${ids.size} questions)`) }));
}
