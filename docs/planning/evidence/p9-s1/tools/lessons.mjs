// Every published lesson page and every island syllabus anchor answers on a running build.
// usage: node lessons.mjs <copy-root> <base-url>
import { readdirSync } from 'node:fs';
const [root, base] = process.argv.slice(2);
const html = await (await fetch(base + '/curriculum')).text();
const hrefs = [...new Set([...html.matchAll(/href="(\/curriculum\/[a-z0-9-]+)"/g)].map(m => m[1]))];
const files = readdirSync(root + '/src/content/curriculum/content').filter(f => /^[A-Z]+\d\d\.ts$/.test(f));
let ok = 0; const bad = [];
for (const h of hrefs) { const r = await fetch(base + h); if (r.status === 200 && /<h1/.test(await r.text())) ok++; else bad.push(`${h} ${r.status}`); }
const anchors = ['foundations', 'structures', 'algorithms', 'databases'].map(id => [id, html.includes(`id="island-${id}"`)]);
console.log(JSON.stringify({ base, contentFiles: files.length, lessonLinksOnCurriculum: hrefs.length, ok, bad, anchors: Object.fromEntries(anchors),
  home: (await fetch(base + '/')).status, learn: (await fetch(base + '/learn')).status, world: (await fetch(base + '/world')).status, worldCs: (await fetch(base + '/world/cs')).status }));
