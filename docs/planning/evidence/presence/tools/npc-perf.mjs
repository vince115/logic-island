import { createRequire } from 'node:module';
// Run from the repository root (or set ROOT), against servers you started yourself.
const root = process.env.ROOT ?? process.cwd();
const require = createRequire(`${root}/package.json`);
const { chromium, devices } = require('@playwright/test');
const { instrument, quantile, round } = await import(`${root}/perf/instrument.mjs`);
const base = process.env.BASE ?? 'http://127.0.0.1:3147';
const metal = process.env.PERF_GPU === 'metal';
const browser = await chromium.launch({ args: metal ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const profiles = { desktop: { viewport: { width: 1440, height: 1000 } }, phone: { ...devices['iPhone 13'] } };
const out = {};
for (const [name, options] of Object.entries(profiles)) {
  const context = await browser.newContext({ reducedMotion: 'no-preference', ...options });
  const page = await context.newPage();
  await page.addInitScript(instrument);
  await page.goto(`${base}/`);
  await page.waitForFunction(() => document.querySelector('canvas')?.hasAttribute('data-npc-foundations'), null, { timeout: 30000 });
  const renderer = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
  const setPop = n => page.evaluate(v => window.__logicIslandPopulation.set({ foundations: v }), n);
  const window_ = async (ms) => {
    const from = await page.evaluate(() => window.__perfEntries.length);
    await page.waitForTimeout(ms);
    const entries = await page.evaluate(f => window.__perfEntries.slice(Math.max(0, f - 1)), from);
    const frames = entries.length - 1;
    if (frames < 2) return { frames, fps: round(frames / (ms / 1000)) };
    const intervals = entries.slice(2).map((e, i) => e.t - entries[i + 1].t);
    const per = entries.slice(1).map((e, i) => ({ main: e.main - entries[i].main, tris: e.mainTriangles - entries[i].mainTriangles, off: e.offscreen - entries[i].offscreen }));
    return { frames, fps: round(frames / (ms / 1000)), frameMs: round(quantile(intervals, .5)), frameP95: round(quantile(intervals, .95)),
      mainDraws: quantile(per.map(p => p.main), .5), triangles: Math.round(quantile(per.map(p => p.tris), .5)), shadowDraws: per.reduce((s, p) => s + p.off, 0) };
  };
  const orbit = page.getByRole('button', { name: '自動旋轉' });
  const r = { renderer };
  await setPop(0); await page.waitForTimeout(3000);
  r.idle_noNpc = await window_(6000);
  await orbit.click(); await page.waitForTimeout(1500);
  r.orbit_noNpc = await window_(8000);
  await orbit.click(); await page.waitForTimeout(1000);
  await setPop(40); await page.waitForTimeout(9000);
  r.npcs = await page.evaluate(() => document.querySelector('canvas').getAttribute('data-npc-foundations'));
  r.idle_npc = await window_(10000);
  await orbit.click(); await page.waitForTimeout(1500);
  r.orbit_npc = await window_(8000);
  await orbit.click();
  out[name] = r;
  await context.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
