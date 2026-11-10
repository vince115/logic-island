import { test, expect, type Page } from '@playwright/test';
import { hexToWorld } from '@/lib/islands/hex';
import { scalePrototypes } from '@/lib/islands/hex-scale-prototype';
import { hexWorld, type HexWorld } from '@/lib/islands/hex-world';
import { delta, flight, flightStats, instrument, round, type Counters, type Entry, type Flight } from './instrument.mjs';

/**
 * D.3-0 world-map rendering measurements (run with playwright.perf.config.ts; summarize with perf/summarize.mjs).
 *
 * Every route is measured the same way, without app hooks:
 * - WebGL draw calls and triangles per frame, split into the main pass (default framebuffer) and offscreen passes
 *   (the shadow map), counted by wrapping the WebGL2 draw functions before the page loads (perf/instrument.mjs, which
 *   the D.3-4 real-device check in perf/device/ shares);
 * - the frame rate while the camera flies to the basics island and back (the side list and「返回全景」, which every
 *   explorer has), as during real use;
 * - time to the first rendered frame and to the GLB being in place;
 * - D.3-5b: where the explorer offers「自動旋轉」(the lab), the frame rate while it turns for 5 seconds and the frames
 *   drawn in the 2 seconds after it stops (must be 0).
 * Routes with the lab probe (`canvas.__hexPerf`) also get forced-render timing and main-pass draw calls per island.
 * Rounds and routes alternate inside one run, so machine-load drift hits every route alike.
 *
 * PERF_ROUTES (comma separated, default `/islands,/islands/hex/scale/37`), PERF_ROUNDS (default 5),
 * PERF_CPU (Chromium CPU throttling rate, default none).
 */
const ROUTES = (process.env.PERF_ROUTES ?? '/islands,/islands/hex/scale/37').split(',');
const ROUNDS = Number(process.env.PERF_ROUNDS ?? 5);
const CPU = Number(process.env.PERF_CPU ?? 1);
/** Worlds of the routes with the lab probe, to tell which island a drawn object belongs to. */
const WORLDS: Record<string, HexWorld> = { '/islands/hex': hexWorld, '/islands/hex/scale/19': scalePrototypes['19'].world, '/islands/hex/scale/37': scalePrototypes['37'].world };

type DrawnObject = { center: number[]; size: number[]; materials: string[]; instanced: boolean };
type Probe = HTMLCanvasElement & { __hexPerf: () => unknown; __hexDraws: () => DrawnObject[] };

const entries = (page: Page) => page.evaluate(() => (window as unknown as { __perfEntries: Entry[] }).__perfEntries.slice());

/** Waits until no frame has been drawn for `quiet` ms (the camera has settled). */
async function settle(page: Page, quiet = 700) {
  let count = -1, since = Date.now();
  await expect.poll(async () => {
    const now = (await entries(page)).length;
    if (now !== count) { count = now; since = Date.now(); }
    return Date.now() - since >= quiet;
  }, { intervals: [100], timeout: 30_000 }).toBe(true);
}
/** The last drawn frame: what one frame of the settled view costs. */
async function lastFrame(page: Page): Promise<Counters> {
  const list = await entries(page);
  return delta(list.at(-2)!, list.at(-1)!);
}
/** Main-pass draw calls and materials per island, from what the lab probe says was drawn. */
function byIsland(world: HexWorld, drawn: DrawnObject[]) {
  const spans = world.settlements.map(s => {
    const points = s.tiles.map(t => hexToWorld(t, world.size));
    return { id: s.islandId, points, span: Math.max(...[0, 1].map(i => Math.max(...points.map(p => p[i])) - Math.min(...points.map(p => p[i])))) + 2 * world.size };
  });
  const out: Record<string, { draws: number; materials: Set<string> }> = {};
  for (const o of drawn) {
    // An object belongs to the island whose tile centers it sits on and whose extent it fits in; anything spanning
    // several islands (sea, trees and rocks instanced across the world, roads, bridges) is shared.
    const near = spans.map(s => ({ id: s.id, span: s.span, d: Math.min(...s.points.map(p => Math.hypot(p[0] - o.center[0], p[1] - o.center[2]))) }))
      .sort((a, b) => a.d - b.d)[0];
    const owner = near.d <= world.size * 1.2 && Math.max(o.size[0], o.size[2]) <= near.span ? near.id : 'shared';
    const slot = out[owner] ??= { draws: 0, materials: new Set() };
    slot.draws += o.materials.length;
    o.materials.forEach(m => slot.materials.add(m));
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { draws: v.draws, materials: v.materials.size }]));
}

/** Forced renders through the lab probe, as in D.2c-2: rAF rate and synced frame time. */
async function forced(page: Page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector('canvas') as Probe, gl = canvas.getContext('webgl2')!, px = new Uint8Array(4);
    const sync = () => { canvas.__hexPerf(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
    for (let i = 0; i < 8; i++) sync();
    const ms: number[] = [];
    for (let i = 0; i < 30; i++) { const t = performance.now(); sync(); ms.push(performance.now() - t); }
    const fps = await new Promise<number>(resolve => {
      let frames = 0, start = 0;
      const tick = (now: number) => {
        if (!start) start = now; else frames++;
        canvas.__hexPerf();
        if (now - start < 3000) requestAnimationFrame(tick); else resolve(frames / ((now - start) / 1000));
      };
      requestAnimationFrame(tick);
    });
    ms.sort((a, b) => a - b);
    return { fps: Math.round(fps * 10) / 10, syncMs: Math.round(ms[15] * 100) / 100 };
  });
}

async function measure(page: Page, route: string) {
  await page.addInitScript(instrument);
  if (CPU > 1) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await page.goto(route);
  const label = page.getByRole('button', { name: '聚焦基礎程式島', exact: true });
  await expect(label).toHaveAttribute('data-model-source', 'glb', { timeout: 60_000 });
  const glbReadyMs = await page.evaluate(() => performance.now());
  await page.locator('canvas').scrollIntoViewIfNeeded();
  await settle(page);
  const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as Probe, gl = canvas.getContext('webgl2')!;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)), dpr: devicePixelRatio,
      buffer: `${canvas.width}x${canvas.height}`, probe: typeof canvas.__hexDraws === 'function',
      firstFrameMs: (window as unknown as { __perfEntries: Entry[] }).__perfEntries.find(e => e.main > 0)?.t ?? NaN };
  });
  const world = WORLDS[route];
  const view = async () => ({
    frame: await lastFrame(page),
    ...(info.probe ? { forced: await forced(page) } : {}),
    ...(info.probe && world ? { islands: byIsland(world, await page.evaluate(() => (document.querySelector('canvas') as Probe).__hexDraws())) } : {}),
  });
  // Fly to the basics island and back three times through the side list, which every explorer has. The views
  // are measured once settled after a flight, not right after loading (which may still redraw the shadow map).
  const flights: Flight[] = [];
  let focus: Awaited<ReturnType<typeof view>> | undefined;
  for (let i = 0; i < 3; i++) {
    for (const step of ['focus', 'back'] as const) {
      const from = (await entries(page)).length;
      if (step === 'focus') await page.getByRole('group', { name: '選擇學習島嶼' }).getByRole('button', { name: /基礎程式島/ }).click();
      else await page.getByRole('button', { name: '返回全景' }).click();
      await settle(page);
      flights.push(flight(await entries(page), from));
      if (step === 'focus' && i === 0) focus = await view();
    }
  }
  const overview = await view();
  const toggle = page.getByRole('button', { name: '自動旋轉', exact: true });
  let orbit: (ReturnType<typeof flightStats> & { idle: number }) | undefined;
  if (await toggle.count()) {
    const from = (await entries(page)).length;
    await toggle.click();
    await page.waitForTimeout(5000);
    await toggle.click();
    const to = (await entries(page)).length;
    await settle(page);
    const idleFrom = (await entries(page)).length;
    await page.waitForTimeout(2000);
    orbit = { ...flightStats([flight(await entries(page), from, to)]), idle: (await entries(page)).length - idleFrom };
  }
  return { route, ...info, firstFrameMs: round(info.firstFrameMs, 0), glbReadyMs: round(glbReadyMs, 0), overview, focus, flight: flightStats(flights), ...(orbit ? { orbit } : {}) };
}

test('world map rendering', async ({ context }, testInfo) => {
  const device = testInfo.project.name.split('-')[0];
  for (let r = 1; r <= ROUNDS; r++) for (const route of ROUTES) {
    // A fresh page per measurement; the shared HTTP cache only saves refetching the same GLB.
    const page = await context.newPage();
    const row = await measure(page, route);
    console.log(`PERF ${JSON.stringify({ device, round: r, ...row })}`);
    await page.close();
  }
});
