import { createRequire } from 'node:module';
/*
 * P2 (NPC render loop): what the figures cost while nobody touches the map. The same script measures the build before
 * and after the change. Run from the repository root (or set ROOT), against a server you started yourself with
 * LOGIC_ISLAND_POPULATION_NPC=mock:
 *
 *   BASE=http://127.0.0.1:3151 [PERF_GPU=metal] [WINDOW_MS=60000] [ONLY=overview,focus,hidden,orbit,still] [PROFILES=desktop,phone] node docs/planning/evidence/presence/tools/npc-loop-perf.mjs
 *
 * Per scenario: frames drawn and their rate, the interval between frames, draw calls and triangles per frame (the
 * D.3-0 instrument, perf/instrument.mjs), and CPU: seconds of CPU all of the browser's processes used (renderer, GPU
 * process and browser, from the DevTools protocol's SystemInfo.getProcessInfo) per second of wall clock, and the
 * renderer's main-thread share (Performance.getMetrics TaskDuration).
 *
 * CPU on a shared machine drifts with whatever else runs: the same build measured an hour apart gave 8% and 20% for
 * the same 30 frames a second. Compare CPU only between runs made one right after the other (PROFILES and ONLY make
 * short runs to alternate), and trust the frame counts, which do not drift.
 */
const root = process.env.ROOT ?? process.cwd();
const require = createRequire(`${root}/package.json`);
const { chromium, devices } = require('@playwright/test');
const { instrument, quantile, round } = await import(`${root}/perf/instrument.mjs`);
const base = process.env.BASE ?? 'http://127.0.0.1:3151';
const metal = process.env.PERF_GPU === 'metal';
const windowMs = Number(process.env.WINDOW_MS ?? 60_000);
const only = process.env.ONLY?.split(',');
const wanted = name => !only || only.includes(name);
const browser = await chromium.launch({ args: metal ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const system = await browser.newBrowserCDPSession();
const cpuSeconds = async () => (await system.send('SystemInfo.getProcessInfo')).processInfo.reduce((sum, p) => sum + p.cpuTime, 0);
const all = { desktop: { viewport: { width: 1440, height: 1000 } }, phone: { ...devices['iPhone 13'] } };
const profiles = Object.fromEntries(Object.entries(all).filter(([name]) => !process.env.PROFILES || process.env.PROFILES.split(',').includes(name)));
const out = { base, gpu: metal ? 'metal' : 'swiftshader', windowMs };

for (const [name, options] of Object.entries(profiles)) {
  const open = async (extra = {}) => {
    const context = await browser.newContext({ reducedMotion: 'no-preference', ...options, ...extra });
    const page = await context.newPage();
    await page.addInitScript(instrument);
    await page.goto(`${base}/`);
    await page.waitForFunction(() => document.querySelector('canvas')?.hasAttribute('data-npc-foundations'), null, { timeout: 30_000 });
    const client = await context.newCDPSession(page);
    await client.send('Performance.enable');
    return { context, page, client };
  };
  const { context, page, client } = await open();
  const task = async () => (await client.send('Performance.getMetrics')).metrics.find(m => m.name === 'TaskDuration').value;
  const setPop = islands => page.evaluate(v => window.__logicIslandPopulation.set(v), islands);
  const figures = () => page.evaluate(() => Number(document.querySelector('canvas').getAttribute('data-npc-foundations')));
  /** A pointer move over the page's header: an input (the figures' idle timer starts over), nothing the map reacts to. */
  const nudge = () => page.mouse.move(40 + Math.random() * 20, 12);
  /** Focuses an island of the home map (null: back to the overview) the way the map's own list does: the address, then the map's event. */
  const focus = async island => {
    await page.evaluate(id => { history.replaceState(history.state, '', id ? `?island=${id}` : location.pathname); dispatchEvent(new Event('logic-island:island-param')); }, island);
    await page.waitForTimeout(4000); await nudge();
  };
  const loop = () => page.evaluate(() => document.querySelector('canvas').getAttribute('data-npc-loop'));
  const measure = async (ms, target = page, targetTask = task) => {
    const from = await target.evaluate(() => window.__perfEntries.length);
    const [cpu0, task0, t0] = [await cpuSeconds(), await targetTask(), Date.now()];
    await target.waitForTimeout(ms);
    const [cpu1, task1, seconds] = [await cpuSeconds(), await targetTask(), (Date.now() - t0) / 1000];
    const entries = await target.evaluate(f => window.__perfEntries.slice(Math.max(0, f - 1)), from);
    const frames = Math.max(0, entries.length - 1);
    const result = { frames, fps: round(frames / seconds), cpu: round((cpu1 - cpu0) / seconds * 100), mainThread: round((task1 - task0) / seconds * 100) };
    if (frames < 3) return result;
    const intervals = entries.slice(2).map((e, i) => e.t - entries[i + 1].t);
    const per = entries.slice(1).map((e, i) => ({ main: e.main - entries[i].main, tris: e.mainTriangles - entries[i].mainTriangles, off: e.offscreen - entries[i].offscreen }));
    return { ...result, frameMs: round(quantile(intervals, .5)), frameP95: round(quantile(intervals, .95)),
      draws: quantile(per.map(p => p.main), .5), triangles: Math.round(quantile(per.map(p => p.tris), .5)), shadowDraws: per.reduce((s, p) => s + p.off, 0) };
  };
  const r = { renderer: await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; }) };

  // The mock's first figures leave one at a time: wait until the map is empty and has stopped drawing.
  await setPop({}); await page.waitForTimeout(9000);
  if (wanted('overview')) r.idle_noNpc = await measure(10_000);
  for (const online of wanted('overview') ? [1, 3, 40] : []) {
    await setPop({ foundations: online }); await nudge();
    await page.waitForTimeout(8000); await nudge();
    r[`overview_${online}online`] = { figures: await figures(), loop: await page.evaluate(() => document.querySelector('canvas').getAttribute('data-npc-loop')), ...await measure(windowMs) };
  }
  if (wanted('focus')) {
    await setPop({ foundations: 40 }); await nudge(); await page.waitForTimeout(9000);
    // The camera on another island: the figures are outside the picture.
    await focus('algorithms');
    r.elsewhere_40online = { zoom: await page.evaluate(() => document.querySelector('canvas').__npcLoop?.().zoom), loop: await loop(),
      foundationsInView: await page.evaluate(() => document.querySelector('canvas').__npcLoop?.().zones.find(z => z.id === 'foundations')?.inView), ...await measure(Math.min(windowMs, 30_000)) };
    await focus(null);
    // The figures' own island in focus: the largest they are ever drawn.
    await focus('foundations');
    r.focused_40online = { zoom: await page.evaluate(() => document.querySelector('canvas').__npcLoop?.().zoom), loop: await loop(), ...await measure(Math.min(windowMs, 30_000)) };
    await focus(null);
  }
  if (wanted('hidden')) {
  await setPop({ foundations: 40 }); await nudge(); await page.waitForTimeout(wanted('focus') || wanted('overview') ? 500 : 9000);
  // A background tab: the page says it is hidden, as a browser does when another tab is in front.
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  r.hiddenTab_40online = await measure(10_000);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await nudge(); await page.waitForTimeout(1500);
  }
  if (wanted('orbit')) {
  await setPop({ foundations: 40 }); await nudge(); await page.waitForTimeout(wanted('hidden') ? 500 : 9000);
  // The camera turning by itself: the map draws every frame with or without figures.
  const orbit = page.getByRole('button', { name: '自動旋轉' });
  await orbit.click(); await page.waitForTimeout(1500);
  r.orbit_40online = await measure(8000);
  await orbit.click(); await page.waitForTimeout(800);
  await setPop({}); await page.waitForTimeout(8000);
  await orbit.click(); await page.waitForTimeout(1500);
  r.orbit_noNpc = await measure(8000);
  await orbit.click();
  }
  await context.close();

  if (!wanted('still')) { out[name] = r; continue; }
  const still = await open({ reducedMotion: 'reduce' });
  await still.page.evaluate(() => window.__logicIslandPopulation.set({ foundations: 40 }));
  await still.page.waitForTimeout(3000);
  r.reducedMotion_40online = await measure(10_000, still.page, async () => (await still.client.send('Performance.getMetrics')).metrics.find(m => m.name === 'TaskDuration').value);
  await still.context.close();
  out[name] = r;
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
