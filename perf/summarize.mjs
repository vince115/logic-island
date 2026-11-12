// D.3-0: medians of `PERF {...}` lines from perf/world.perf.ts, per device and route.
// Usage: node perf/summarize.mjs <log file>   (or pipe the Playwright output in).
import { readFileSync } from 'node:fs';

const text = readFileSync(process.argv[2] ?? 0, 'utf8');
const groups = new Map();
for (const line of text.split('\n')) {
  const at = line.indexOf('PERF {');
  if (at < 0) continue;
  const row = JSON.parse(line.slice(at + 5));
  const key = `${row.device} ${row.route}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}
/** Numeric leaves as dotted paths. */
const flat = (value, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'number') out[path] = v;
    else if (v && typeof v === 'object') flat(v, path, out);
  }
  return out;
};
const median = list => { const s = [...list].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
for (const [key, rows] of groups) {
  const flats = rows.map(r => flat(r));
  const paths = [...new Set(flats.flatMap(f => Object.keys(f)))].filter(p => p !== 'round');
  console.log(`\n${key}  (n=${rows.length}, ${rows[0].renderer}, dpr ${rows[0].dpr}, buffer ${rows[0].buffer})`);
  for (const path of paths) {
    const values = flats.map(f => f[path]).filter(v => Number.isFinite(v));
    if (values.length) console.log(`  ${path.padEnd(32)} ${String(Math.round(median(values) * 100) / 100).padStart(9)}   [${values.join(', ')}]`);
  }
}
