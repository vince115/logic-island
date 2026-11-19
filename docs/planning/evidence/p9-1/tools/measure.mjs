// Draw calls and triangles of the last drawn frame (main pass and shadow pass) per page, with the repo's instrument.
// usage: node measure.mjs <base> <width>x<height> <path>...
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [base, size, ...routes] = process.argv.slice(2), [width, height] = size.split('x').map(Number);
const root = path.resolve(process.cwd(), 'proto');
const require = createRequire(root + '/');
const { chromium } = require('@playwright/test');
const { instrument } = await import(pathToFileURL(path.join(root, 'perf/instrument.mjs')).href);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const route of routes) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', hasTouch: width < 700, isMobile: width < 700 });
  await context.addInitScript(instrument);
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
  const t0 = Date.now();
  await page.goto(base + route, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 60000 });
  await page.waitForTimeout(4000);
  // The last frame: the difference between the last two entries of the running totals.
  const frame = await page.evaluate(() => { const e = window.__perfEntries ?? []; if (e.length < 2) return e.at(-1) ?? null; const a = e.at(-2), b = e.at(-1);
    return { frames: e.length, main: b.main - a.main, mainTriangles: Math.round(b.mainTriangles - a.mainTriangles), offscreen: b.offscreen - a.offscreen, offscreenTriangles: Math.round(b.offscreenTriangles - a.offscreenTriangles) }; });
  console.log(JSON.stringify({ route, size, ...frame, errors: errors.length, loadMs: Date.now() - t0 }));
  await context.close();
}
await browser.close();
