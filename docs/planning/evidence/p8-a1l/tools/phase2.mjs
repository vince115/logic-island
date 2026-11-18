// A1-L phase 2: routes, trial entries, requests and saved responses of one build.
// usage: node phase2.mjs <copy-root> <base-url> <out-dir> <default|world>
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const [root, base, out, kind] = process.argv.slice(2);
const require = createRequire(root + '/');
const { chromium, devices } = require('@playwright/test');
mkdirSync(out, { recursive: true });
const fails = [];
const note = (ok, what) => { if (!ok) fails.push(what); return ok; };
const PAGES = ['/', '/islands', '/curriculum', '/learn', '/regions/cs', '/regions/ai', '/regions/design', '/regions/web', '/regions/sys', '/learn/linux-terminal'];
const WORLD = ['/world', '/world/cs', '/world/ai', '/world/design', '/world/web', '/world/sys'];
const TRIALS = ['/trials', '/trials/review', '/trials/ipas-aiap-basic', '/trials/ccar-f'];
// Every /trials and /world address the build itself lists as prerendered.
const manifest = Object.keys(JSON.parse(readFileSync(root + '/.next/prerender-manifest.json', 'utf8')).routes);
const listed = manifest.filter(r => r.startsWith('/trials') || r.startsWith('/world'));
console.log(JSON.stringify({ kind, prerendered: manifest.length, listedTrialsOrWorld: listed }));
const status = async p => (await fetch(base + p, { redirect: 'manual' })).status;
for (const p of PAGES) { const s = await status(p); console.log(JSON.stringify({ route: p, status: s })); note(s === 200, `${p} is ${s}`); }
for (const p of [...WORLD, '/world/cs?island=foundations', '/world/nowhere']) {
  const s = await status(p), want = kind === 'world' && p !== '/world/nowhere' ? 200 : 404;
  console.log(JSON.stringify({ route: p, status: s, want })); note(s === want, `${p} is ${s}, expected ${want}`);
}
for (const p of new Set([...TRIALS, ...listed.filter(r => r.startsWith('/trials'))])) { const s = await status(p); console.log(JSON.stringify({ route: p, status: s, want: 404 })); note(s === 404, `${p} is ${s}, expected 404`); }

const browser = await chromium.launch();
for (const [name, opts] of [['desktop', { viewport: { width: 1440, height: 1000 } }], ['phone', { ...devices['iPhone 13'] }]]) {
  const ctx = await browser.newContext({ ...opts, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 200)));
  page.on('request', r => requests.push(r.url()));
  page.on('response', async r => {
    const type = r.headers()['content-type'] ?? '';
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url().slice(0, 160)}`);
    if (!/text|javascript|json|x-component/.test(type)) return;
    try { writeFileSync(`${out}/${createHash('sha1').update(r.url()).digest('hex').slice(0, 16)}.txt`, await r.body()); } catch { /* no body */ }
  });
  for (const p of [...PAGES, ...(kind === 'world' ? WORLD : [])]) {
    errors.length = 0; requests.length = 0;
    const r = await page.goto(base + p, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    if (name === 'phone') { const menu = page.getByRole('button', { name: /選單|目錄|導覽/ }).first(); if (await menu.count()) await menu.click().catch(() => {}); await page.waitForTimeout(200); }
    const dom = await page.evaluate(() => ({
      trialLinks: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => h.startsWith('/trials')),
      worldLinks: [...new Set([...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => h.startsWith('/world')))],
      trialWords: (document.body.innerText.match(/模擬考試|模擬測驗|題庫|(?<!綜合)試煉/g) ?? []).length,
      menu: [...document.querySelectorAll('nav[aria-label="主選單"] a')].map(a => a.textContent.trim()).join('|'),
      robots: document.querySelector('meta[name="robots"]')?.content ?? null, title: document.title,
      overflow: document.documentElement.scrollWidth - innerWidth }));
    const trialRequests = requests.filter(u => /trials/i.test(new URL(u).pathname));
    console.log(JSON.stringify({ name, p, status: r.status(), requests: requests.length, trialRequests, ...dom, errors: errors.slice(0, 4) }));
    note(r.status() === 200, `${name} ${p} status ${r.status()}`);
    note(!errors.length, `${name} ${p} errors: ${errors.join(' | ')}`);
    note(dom.trialLinks.length === 0, `${name} ${p} links to trials: ${dom.trialLinks.join(',')}`);
    note(trialRequests.length === 0, `${name} ${p} requested ${trialRequests.join(',')}`);
    note(dom.trialWords === 0, `${name} ${p} shows ${dom.trialWords} trial words`);
    note(dom.overflow <= 0, `${name} ${p} overflows sideways by ${dom.overflow}`);
    if (!p.startsWith('/world')) note(dom.worldLinks.length === 0, `${name} ${p} links to ${dom.worldLinks.join(',')}`);
  }
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify({ fails }));
process.exit(fails.length ? 1 : 0);
