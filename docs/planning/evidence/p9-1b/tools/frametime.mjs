// Time of a forced redraw, the same way for any build: every animation-frame callback that issues draw calls is timed
// from its start until a pixel of the finished frame has been read back (readPixels, which waits for the drawing). Redraws are forced by resizing the viewport by one pixel.
// usage: node frametime.mjs <base> <width>x<height> <path>...
import { createRequire } from 'node:module';
import path from 'node:path';
const [base, size, ...routes] = process.argv.slice(2), [width, height] = size.split('x').map(Number);
const require = createRequire(path.resolve(process.cwd(), 'proto') + '/');
const { chromium } = require('@playwright/test');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const init = () => {
  const proto = WebGL2RenderingContext.prototype; let draws = 0, ctx = null;
  for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) { const f = proto[name]; proto[name] = function (...a) { draws++; ctx = this; return f.apply(this, a); }; }
  const raf = window.requestAnimationFrame.bind(window); window.__frames = [];
  window.requestAnimationFrame = cb => raf(t => { const d0 = draws, t0 = performance.now(); cb(t); if (draws > d0 && ctx) { ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, new Uint8Array(4)); window.__frames.push({ ms: performance.now() - t0, draws: draws - d0 }); } });
};
const median = list => { const s = [...list].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
for (const route of routes) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', hasTouch: width < 700, isMobile: width < 700 });
  await context.addInitScript(init);
  const page = await context.newPage();
  await page.goto(base + route, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 60000 }); await page.waitForTimeout(4500);
  await page.evaluate(() => { window.__frames.length = 0; });
  for (let i = 0; i < 24; i++) { await page.setViewportSize({ width: width + (i % 2 ? 0 : 1), height }); await page.waitForTimeout(220); }
  const frames = await page.evaluate(() => window.__frames);
  // The first frames after a resize also redraw the shadow map where it is not static; report every frame's median and the draws per frame.
  console.log(JSON.stringify({ route, size, frames: frames.length, medianMs: median(frames.map(f => f.ms))?.toFixed(1), p90Ms: [...frames.map(f => f.ms)].sort((a, b) => a - b)[Math.floor(frames.length * .9)]?.toFixed(1), drawsPerFrame: median(frames.map(f => f.draws)) }));
  await context.close();
}
await browser.close();
