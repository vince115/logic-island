// Investigation A: what the review parameters do in a world build. usage: node hooks.mjs <copy-root> <base>
import { createRequire } from 'node:module';
const [root, base] = process.argv.slice(2);
const require = createRequire(root + '/');
const { chromium } = require('@playwright/test');
const { instrument } = await import(root + '/perf/instrument.mjs');
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
await ctx.addInitScript(instrument);
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e).slice(0, 120))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
const settle = async () => { let n = -1, since = Date.now(); const t0 = Date.now(); while (Date.now() - t0 < 20000) { const now = await page.evaluate(() => window.__perfEntries.length); if (now !== n) { n = now; since = Date.now(); } else if (now > 0 && Date.now() - since > 800) return; await page.waitForTimeout(100); } };
const frame = () => page.evaluate(() => { const e = window.__perfEntries, b = e.at(-1), a = e.at(-2) ?? { main: 0, mainTriangles: 0 }; return [b.main - a.main, Math.round(b.mainTriangles - a.mainTriangles)]; });
for (const q of ['', '?without=sys-cs', '?without=cs-ai,design-web,sys-cs', '?without=hub-cs,hub-ai,hub-design,hub-web,hub-sys,cs-ai,design-web,sys-cs', '?without=nonsense', '?without=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E']) {
  errors.length = 0;
  await page.goto(base + '/world' + q, { waitUntil: 'networkidle' }); await page.locator('button[data-target]').first().waitFor({ state: 'attached' }); await settle();
  const dom = await page.evaluate(() => { const w = document.querySelector('[data-links]'); return { links: JSON.parse(w.dataset.links).map(l => l.id), labels: w.querySelectorAll('button[data-target]').length,
    guide: document.querySelector('nav[aria-label="世界導覽"]').innerText.replace(/\s+/g, ' ').length, guideHasBridgeWords: (document.querySelector('nav[aria-label="世界導覽"]').innerText.match(/橋/g) ?? []).length,
    sceneLabel: document.querySelector('canvas')?.closest('[aria-label]')?.getAttribute('aria-label')?.slice(0, 90), imgs: document.querySelectorAll('img[src="x"]').length, title: document.title, robots: document.querySelector('meta[name=robots]')?.content }; });
  console.log(JSON.stringify({ q, frame: await frame(), ...dom, errors }));
}
for (const q of ['', '?stress=glb', '?stress=other', '?island=databases&stress=glb']) {
  errors.length = 0;
  await page.goto(base + '/world/cs' + q, { waitUntil: 'networkidle' }); await page.locator('button[aria-label^="聚焦"]').first().waitFor({ state: 'attached' }); await page.waitForTimeout(2500); await settle();
  const dom = await page.evaluate(() => ({ labels: document.querySelectorAll('button[aria-label^="聚焦"]').length, standIn: /效能測試替身/.test(document.body.innerHTML), url: location.search,
    probes: Object.keys(document.querySelector('canvas')).concat(Object.getOwnPropertyNames(document.querySelector('canvas'))).filter(k => k.startsWith('__hex')) }));
  console.log(JSON.stringify({ page: '/world/cs' + q, frame: await frame(), ...dom, errors }));
}
await browser.close();
