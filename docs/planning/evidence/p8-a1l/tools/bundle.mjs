// Per-page script weight of a running build: every <script src> the HTML names, fetched and measured raw and gzipped.
// usage: node bundle.mjs <base-url> <page>...
import { gzipSync } from 'node:zlib';
const [base, ...pages] = process.argv.slice(2);
const cache = new Map();
const size = async src => {
  if (!cache.has(src)) {
    const r = await fetch(new URL(src, base));
    if (!r.ok) throw new Error(`${src}: ${r.status}`);
    const b = Buffer.from(await r.arrayBuffer());
    cache.set(src, [b.length, gzipSync(b).length]);
  }
  return cache.get(src);
};
for (const p of pages) {
  const r = await fetch(base + p, { redirect: 'manual' });
  if (r.status !== 200) { console.log(JSON.stringify({ p, status: r.status })); continue; }
  const html = await r.text();
  const srcs = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map(m => m[1]))];
  let raw = 0, gz = 0, biggest = ['', 0];
  for (const s of srcs) { const [a, b] = await size(s); raw += a; gz += b; if (a > biggest[1]) biggest = [s.split('/').pop(), a]; }
  console.log(JSON.stringify({ p, status: 200, scripts: srcs.length, rawKB: Math.round(raw / 1024), gzipKB: Math.round(gz / 1024), biggest: biggest[0], biggestKB: Math.round(biggest[1] / 1024) }));
}
