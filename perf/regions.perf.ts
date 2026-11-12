import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { delta, flight, flightStats, instrument, round, type Entry, type Flight } from './instrument.mjs';

/**
 * M3.1 regional world measurements (run with playwright.perf.config.ts against a build made with
 * LOGIC_ISLAND_REGIONAL_WORLD=1). Same method as world.perf.ts (perf/instrument.mjs wraps the WebGL draw calls before
 * the page loads, no app hooks): per route the settled overview frame (draw calls and triangles, main and offscreen
 * passes), time to the first frame and to the GLB, the frame rate of three camera flights to an island and back, and
 * the JS heap where Chromium reports it (performance.memory: coarse, for comparison only). Also the page without
 * WebGL: how soon its list is there and that nothing is drawn.
 *
 * Routes: P0 the five-island home page, P1 the overview, P2 the CS map, P3 the AI map, P4 the CS map with a v2.1
 * stand-in on every island (`?stress=glb`, a load test, not art). PERF_ROUNDS (default 5); PERF_OUT writes the JSON.
 */
const ROUNDS = Number(process.env.PERF_ROUNDS ?? 5);
type Route = { id: string; path: string; ready: string; glb?: string; island?: RegExp };
const ROUTES: Route[] = [
  { id: 'P0 home', path: '/', ready: '聚焦基礎程式島', glb: '聚焦基礎程式島', island: /基礎程式島/ },
  { id: 'P1 overview', path: '/world', ready: '進入資訊科學群島' },
  { id: 'P2 cs', path: '/world/cs', ready: '聚焦基礎程式島', glb: '聚焦基礎程式島', island: /基礎程式島/ },
  { id: 'P3 ai', path: '/world/ai', ready: '聚焦AI 基礎島（規劃中）', island: /AI 基礎島/ },
  { id: 'P4 cs glb stress', path: '/world/cs?stress=glb', ready: '聚焦基礎程式島', glb: '聚焦資料庫應用島', island: /基礎程式島/ },
];

const entries = (page: Page) => page.evaluate(() => (window as unknown as { __perfEntries: Entry[] }).__perfEntries.slice());
async function settle(page: Page, quiet = 700) {
  let count = -1, since = Date.now();
  await expect.poll(async () => {
    const now = (await entries(page)).length;
    if (now !== count) { count = now; since = Date.now(); }
    return Date.now() - since >= quiet;
  }, { intervals: [100], timeout: 60_000 }).toBe(true);
}
const lastFrame = async (page: Page) => { const list = await entries(page); return delta(list.at(-2)!, list.at(-1)!); };
const heapMb = (page: Page) => page.evaluate(() => { const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory; return m ? Math.round(m.usedJSHeapSize / 1e5) / 10 : null; });

async function measure(page: Page, route: Route) {
  await page.addInitScript(instrument);
  await page.goto(route.path);
  await expect(page.getByRole('button', { name: route.ready, exact: true })).toBeVisible({ timeout: 60_000 });
  // The stress case gives every island the GLB, so its last island to finish is the one to wait for.
  if (route.glb) await expect(page.getByRole('button', { name: route.glb, exact: true })).toHaveAttribute('data-model-source', 'glb', { timeout: 60_000 });
  const readyMs = await page.evaluate(() => performance.now());
  await settle(page);
  const firstFrameMs = await page.evaluate(() => (window as unknown as { __perfEntries: Entry[] }).__perfEntries.find(e => e.main > 0)?.t ?? NaN);
  // As in world.perf.ts, the overview is measured settled after the flights, not right after loading (which may still
  // redraw the static shadow map); the overview without flights (P1) has no shadows.
  let overview = await lastFrame(page);
  const flights: Flight[] = [];
  let focus;
  if (route.island) for (let i = 0; i < 3; i++) for (const step of ['focus', 'back'] as const) {
    const from = (await entries(page)).length;
    if (step === 'focus') await page.getByRole('group', { name: '選擇學習島嶼' }).getByRole('button', { name: route.island }).click();
    else await page.getByRole('button', { name: '返回全景' }).click();
    await settle(page);
    flights.push(flight(await entries(page), from));
    if (step === 'focus' && i === 0) focus = await lastFrame(page);
  }
  if (route.island) overview = await lastFrame(page);
  return { route: route.id, firstFrameMs: round(firstFrameMs, 0), readyMs: round(readyMs, 0), glb: Boolean(route.glb), overview, focus,
    flight: route.island ? flightStats(flights) : undefined, heapMb: await heapMb(page) };
}

async function fallback(page: Page, path: string) {
  await page.addInitScript(instrument);
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type.startsWith('webgl') ? null : (getContext as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    } as typeof getContext;
  });
  await page.goto(path);
  await expect(page.getByRole('status').filter({ hasText: '此裝置的 3D 場景無法使用' })).toBeVisible({ timeout: 30_000 });
  return { route: `fallback ${path}`, listMs: round(await page.evaluate(() => performance.now()), 0), frames: (await entries(page)).length, heapMb: await heapMb(page) };
}

test('regional world rendering', async ({ context }, info) => {
  test.setTimeout(1_800_000);
  const results: unknown[] = [];
  // Rounds and routes alternate, so machine-load drift hits every route alike.
  for (let round = 0; round < ROUNDS; round++) {
    for (const route of ROUTES) { const page = await context.newPage(); results.push({ round, ...(await measure(page, route)) }); await page.close(); }
    for (const path of ['/world', '/world/cs']) { const page = await context.newPage(); results.push({ round, ...(await fallback(page, path)) }); await page.close(); }
  }
  const out = JSON.stringify({ project: info.project.name, results }, null, 1);
  if (process.env.PERF_OUT) writeFileSync(`${process.env.PERF_OUT}/regions-${info.project.name}.json`, out);
  console.log(out.slice(0, 2000));
});
