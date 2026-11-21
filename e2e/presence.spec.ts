import { test as base, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { lessons } from '../src/content/curriculum/lessons';
import { hexKey, worldToHex } from '../src/lib/islands/hex';
import type { WorldLayout } from '../src/lib/islands/hex-layout';
import { islandsHomeWorld } from '../src/lib/islands/islands-world';
import { regionLayout } from '../src/lib/islands/regions/region-layouts';
import { regionScene } from '../src/lib/p9/region-scene';
import { islandOpen } from '../src/lib/presence/locations';

/*
 * Dynamic Island Population (docs/planning/PRESENCE_POPULATION_SYSTEM.md). Three kinds of build, told apart by the
 * same variables the build was made with (set them for the test run too):
 *
 *   default build                                   only the "off" tests run: no API, no cookie, no figures.
 *   LOGIC_ISLAND_PRESENCE=1                         the presence tests: real browsers, the real API.
 *   … and LOGIC_ISLAND_POPULATION_NPC=mock | live   the figures on the home map, from mock data or from the API.
 *   … and LOGIC_ISLAND_REGIONAL_WORLD=1             the figures on the five region maps (/world/<region>), mock data.
 *   LOGIC_ISLAND_POPULATION_NPC=mock with LOGIC_ISLAND_P9_PROTOTYPE=1   the figures on the P9 region maps (/<region>).
 *
 * The presence tests count visitors on one server, so run this file alone and with one worker
 * (`playwright test e2e/presence.spec.ts --workers=1`): other specs' pages are visitors too. Visitors are counted on
 * open islands only (P6-B: a planned island's visitor is counted in its region), and there are few of those, so tests
 * share them: each test first waits for its islands to be empty, and every test's pages say goodbye when it ends
 * (they leave for about:blank), so the next test, and the same test in the next project, starts from an empty island.
 */
const PRESENCE = process.env.LOGIC_ISLAND_PRESENCE === '1';
const NPC = PRESENCE || process.env.LOGIC_ISLAND_POPULATION_NPC === 'mock' ? process.env.LOGIC_ISLAND_POPULATION_NPC : undefined;
const API = '/api/presence';
const WORLD = process.env.LOGIC_ISLAND_REGIONAL_WORLD === '1', P9 = process.env.LOGIC_ISLAND_P9_PROTOTYPE === '1';
const REGIONS = ['cs', 'ai', 'design', 'web', 'sys'] as const;

const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    // A page that is offline on purpose (the timeout test) logs its failed heartbeats.
    expect(errors.filter(text => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(text)), 'Console 與未捕捉錯誤').toEqual([]);
  }, { auto: true }],
});
/** Leaving for another document is what a visitor's goodbye is: the page's last beacon. Closing a context sends none. */
const goodbye = async (context: BrowserContext) => { for (const page of context.pages()) await page.goto('about:blank').catch(() => {}); };
test.afterEach(async ({ context }) => { await goodbye(context); });
const phone = () => test.info().project.name.startsWith('mobile');
const slugOf = (lessonId: string) => lessons.find(l => l.lessonId === lessonId)!.slug;
const syllabus = (islandId: string) => `/curriculum#island-${islandId}`;

interface Snapshot { total: number; hub: number; regions: Record<string, number>; islands: Record<string, number>; commons: Record<string, number> }
const population = async (request: APIRequestContext): Promise<Snapshot> => (await request.get(API)).json();
const online = async (request: APIRequestContext, islandId: string) => (await population(request)).islands[islandId] ?? 0;
/** Waits until an island's online count is `count` (a new session needs its warm-up, about three seconds). */
const expectOnline = (request: APIRequestContext, islandId: string, count: number, timeout = 15_000) =>
  expect.poll(() => online(request, islandId), { timeout, message: `${islandId} online` }).toBe(count);
/** Puts the page in the background or brings it back, as the browser would report it. */
const setHidden = (page: Page, hidden: boolean) => page.evaluate(state => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden ? 'hidden' : 'visible');
const newVisitor = async (browser: { newContext: (options?: object) => Promise<BrowserContext> }, baseURL: string | undefined) => {
  const context = await browser.newContext({ baseURL });
  return { context, page: await context.newPage(), leave: async () => { await goodbye(context); await context.close(); } };
};
/** The islands a test counts on are empty when it starts (a session an earlier run left behind times out by itself). */
const empty = async (request: APIRequestContext, ...islands: string[]) => { for (const id of islands) await expectOnline(request, id, 0, 170_000); };

test.describe('presence: off (default build)', () => {
  test.skip(PRESENCE, 'this build has the presence API');

  test('there is no presence API, no cookie and no request for one', async ({ page, request, context }) => {
    expect((await request.get(API)).status()).toBe(404);
    expect((await request.post(API, { data: { v: 1, tab: 'aaaaaaaa00000001', since: Date.now(), place: { t: 'hub' } } })).status()).toBe(404);
    const asked: string[] = [];
    page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) asked.push(r.url()); });
    await page.goto(`/curriculum/${slugOf('F01')}`);
    await page.goto('/');
    await expect(page.getByRole('button', { name: '聚焦基礎程式島', exact: true })).toHaveAttribute('data-model-source', 'glb', { timeout: 30_000 });
    await page.waitForTimeout(1_500);
    expect(asked).toEqual([]);
    expect((await context.cookies()).map(c => c.name)).not.toContain('li_presence');
  });
});

test.describe('population figures: off', () => {
  test.skip(Boolean(NPC), 'this build draws population figures');

  test('the home map draws no figures and has no hook for them', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: '聚焦基礎程式島', exact: true })).toHaveAttribute('data-model-source', 'glb', { timeout: 30_000 });
    await page.waitForTimeout(1_000);
    expect(await page.evaluate(() => [...document.querySelector('canvas')!.attributes].map(a => a.name).filter(name => name.startsWith('data-npc')))).toEqual([]);
    expect(await page.evaluate(() => '__logicIslandPopulation' in window)).toBe(false);
  });
});

test.describe('presence: on', () => {
  test.skip(!PRESENCE, 'built without LOGIC_ISLAND_PRESENCE=1');

  test('a visitor is counted on the island of the page, and moves with every navigation', async ({ page, request }) => {
    await empty(request, 'programming-languages', 'databases', 'structures');
    // A lesson page: the server finds its island and region.
    await page.goto(`/curriculum/${slugOf('PL03')}`);
    await expectOnline(request, 'programming-languages', 1);
    expect((await population(request)).regions.cs).toBeGreaterThanOrEqual(1);
    // The syllabus names an island only in its hash; the home map in a query parameter.
    await page.goto(syllabus('databases'));
    await expectOnline(request, 'databases', 1);
    await expectOnline(request, 'programming-languages', 0);
    const cs = (await population(request)).regions.cs;
    await page.evaluate(() => { location.hash = '#island-structures'; });
    await expectOnline(request, 'structures', 1);
    await expectOnline(request, 'databases', 0);
    // Same region, another island: the region's count did not change.
    expect((await population(request)).regions.cs).toBe(cs);
    // P6-B. A planned island is no place to be counted on: the visitor is in its region, on none of its islands,
    // and on no other island either.
    const before = await population(request);
    await page.evaluate(() => { location.hash = '#island-linux-systems'; });
    await expectOnline(request, 'structures', 0);
    await expect.poll(async () => (await population(request)).commons.sys).toBe(before.commons.sys + 1);
    const planned = await population(request);
    expect(planned.islands['linux-systems']).toBeUndefined();
    expect(planned.regions.sys).toBe(before.regions.sys + 1);
    expect(planned.regions.cs).toBe(before.regions.cs - 1);
    expect(Object.values(planned.islands).reduce((sum, n) => sum + n, 0)).toBe(Object.values(before.islands).reduce((sum, n) => sum + n, 0) - 1);
    // A region's own page names no island: the same place, as the count sees it.
    await page.goto('/regions/sys');
    // (While the new page loads the old one has said goodbye: the count is back once the new page reports.)
    await expect.poll(async () => (await population(request)).commons.sys).toBe(planned.commons.sys);
    expect((await population(request)).regions.sys).toBe(planned.regions.sys);
  });

  test('client-side navigation moves the visitor too', async ({ page, request }) => {
    await empty(request, 'algorithms');
    await page.goto(`/curriculum/${slugOf('A12')}`);
    await expectOnline(request, 'algorithms', 1);
    // The header's link is a client-side navigation: no page load, the tracker follows the address.
    await page.getByRole('navigation', { name: '主選單' }).getByRole('link', { name: '互動實驗島' }).click();
    await expect(page).toHaveURL(/\/learn$/);
    await expectOnline(request, 'algorithms', 0);
    expect((await population(request)).islands.labs).toBeGreaterThanOrEqual(1);
  });

  test('two tabs of one browser are one visitor, where the tab used last is', async ({ page, context, request }) => {
    await empty(request, 'foundations', 'structures', 'databases');
    await page.goto(syllabus('foundations'));
    await expectOnline(request, 'foundations', 1);
    const second = await context.newPage();
    await second.goto(syllabus('structures'));
    await expectOnline(request, 'structures', 1);
    await expectOnline(request, 'foundations', 0);
    // Both tabs keep reporting for a while: still one visitor, still where the newer tab is.
    await page.waitForTimeout(4_000);
    expect(await online(request, 'foundations') + await online(request, 'structures')).toBe(1);
    // The visitor goes on in the first tab: the session follows.
    await page.evaluate(() => { location.hash = '#island-databases'; });
    await expectOnline(request, 'databases', 1);
    await expectOnline(request, 'structures', 0);
  });

  test('closing the tab in use counts the visitor on the tab that is left, at once (P7)', async ({ page, context, request }) => {
    await empty(request, 'foundations', 'structures');
    await page.goto(syllabus('foundations'));
    await expectOnline(request, 'foundations', 1);
    const second = await context.newPage();
    await second.goto(syllabus('structures'));
    await expectOnline(request, 'structures', 1);
    await expectOnline(request, 'foundations', 0);
    // The second tab leaves (its goodbye takes the session away: it was the tab in use). Nothing is done in the
    // first tab: it hears that the other one left and reports by itself, long before its next report is due (a minute).
    await second.goto('about:blank');
    await expectOnline(request, 'structures', 0, 5_000);
    await expectOnline(request, 'foundations', 1, 8_000);
    // The line between the tabs carries no identity and nothing is kept in the browser for it.
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  });

  test('a second browser is a second visitor', async ({ page, browser, baseURL, request }) => {
    await empty(request, 'algorithms');
    await page.goto(syllabus('algorithms'));
    await expectOnline(request, 'algorithms', 1);
    const other = await newVisitor(browser, baseURL);
    await other.page.goto(syllabus('algorithms'));
    await expectOnline(request, 'algorithms', 2);
    await other.leave();
    await expectOnline(request, 'algorithms', 1);
  });

  test('a reload keeps the visitor, counted once', async ({ page, request }) => {
    await empty(request, 'databases');
    await page.goto(syllabus('databases'));
    await expectOnline(request, 'databases', 1);
    const seen: number[] = [];
    const sampling = setInterval(() => { void online(request, 'databases').then(n => seen.push(n)).catch(() => {}); }, 150);
    await page.reload();
    await page.waitForTimeout(3_000);
    clearInterval(sampling);
    await expectOnline(request, 'databases', 1);
    expect(Math.max(...seen), 'never two during the reload').toBeLessThanOrEqual(1);
  });

  test('a background tab stops counting at once and sends nothing; back in front it counts again', async ({ page, request }) => {
    await empty(request, 'structures');
    await page.goto(syllabus('structures'));
    await expectOnline(request, 'structures', 1);
    // A heartbeat is a fetch with a JSON body; the goodbye is a beacon, whose body the test cannot read.
    const sent: (string | null)[] = [];
    page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname === API) sent.push(r.postData()); });
    await setHidden(page, true);
    await expectOnline(request, 'structures', 0, 5_000);
    await page.waitForTimeout(3_000);
    // One goodbye, no heartbeat.
    expect(sent.filter(body => body?.includes('"place"'))).toEqual([]);
    expect(sent).toHaveLength(1);
    await setHidden(page, false);
    await expectOnline(request, 'structures', 1, 5_000);
  });

  test('a visitor who goes silent is dropped after the timeout', async ({ page, context, request }) => {
    // The timeout is the server's own (the answer says it: 150 s since P7), counted from the visitor's last report.
    const { ttlMs } = await (await request.get(API)).json() as { ttlMs: number };
    test.setTimeout(ttlMs + 150_000);
    await empty(request, 'programming-languages');
    await page.goto(syllabus('programming-languages'));
    await expectOnline(request, 'programming-languages', 1);
    // The network goes away with the tab still open: no heartbeat arrives, and no goodbye either.
    await context.setOffline(true);
    await page.waitForTimeout(Math.min(60_000, ttlMs / 2));
    expect(await online(request, 'programming-languages'), 'still counted inside the timeout').toBe(1);
    await expectOnline(request, 'programming-languages', 0, ttlMs);
    await context.setOffline(false);
  });

  test('the server decides the place: unknown references are the hub, malformed ones are refused', async ({ page, request }) => {
    await empty(request, 'programming-languages');
    await page.goto(syllabus('programming-languages'));
    await expectOnline(request, 'programming-languages', 1);
    const send = (body: unknown) => page.evaluate(async data => (await fetch('/api/presence', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })).status, body);
    const beat = (place: unknown) => ({ v: 1, tab: 'eeeeeeee00000009', since: Date.now(), place });
    for (const place of [{ region: 'ai', island: 'programming-languages' }, { t: 'island', id: 'programming-languages', island: 'databases' }, 'programming-languages', { t: 'island', id: '../x' }])
      expect(await send(beat(place)), JSON.stringify(place)).toBe(400);
    // An island that does not exist: accepted, and the visitor is on no island.
    expect(await send(beat({ t: 'island', id: 'atlantis' }))).toBe(200);
    await expectOnline(request, 'programming-languages', 0);
    expect((await population(request)).islands.atlantis).toBeUndefined();
    // A planned island (P6-B): accepted too, and the visitor is in the island's own region, on no island, whatever
    // region the claim names.
    const atHub = await population(request);
    expect(await send(beat({ t: 'island', id: 'responsive-design', r: 'cs' }))).toBe(200);
    await expect.poll(async () => (await population(request)).commons.web).toBe(atHub.commons.web + 1);
    expect((await population(request)).islands['responsive-design']).toBeUndefined();
    expect((await population(request)).regions.cs).toBe(atHub.regions.cs);
    // A CS island claimed "in the AI region" is counted in the CS region.
    const before = await population(request);
    expect(await send(beat({ t: 'island', id: 'programming-languages', r: 'ai' }))).toBe(200);
    await expectOnline(request, 'programming-languages', 1);
    const after = await population(request);
    expect(after.regions.ai).toBe(before.regions.ai);
    expect(after.regions.cs).toBe(before.regions.cs + 1);
    // The made-up tab owns the session now, and the page's own goodbye would not take it away: it says its own, or
    // the session would stay on this island for the whole timeout, into the tests that follow.
    expect(await send({ v: 1, tab: 'eeeeeeee00000009', leave: true, at: Date.now() })).toBe(200);
    await expectOnline(request, 'programming-languages', 0);
  });

  test('the API gives out totals only; the session cookie is not readable or reusable elsewhere', async ({ page, context, request }) => {
    await empty(request, 'algorithms', 'databases');
    await page.goto(syllabus('algorithms'));
    await expectOnline(request, 'algorithms', 1);
    const response = await request.get(API), text = await response.text();
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(['at', 'commons', 'hub', 'islands', 'regions', 'total', 'ttlMs', 'v']);
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['access-control-allow-origin']).toBeUndefined();
    expect(response.headers()['set-cookie']).toBeUndefined();
    const cookie = (await context.cookies()).find(c => c.name === 'li_presence')!;
    expect(cookie).toMatchObject({ path: '/api/presence', httpOnly: true, sameSite: 'Strict', expires: -1 });
    expect(await page.evaluate(() => document.cookie)).not.toContain('li_presence');
    // Nothing of the session is in what the API publishes.
    for (const part of cookie.value.split('.').slice(1)) expect(text).not.toContain(part);
    // A request that is not from a page of this site is refused, with or without the cookie.
    expect((await request.post(API, { data: { v: 1, tab: 'aaaaaaaa00000001', since: Date.now(), place: { t: 'hub' } } })).status()).toBe(403);
    expect((await request.post(API, { headers: { origin: 'https://example.com', cookie: `li_presence=${cookie.value}` }, data: { v: 1, tab: 'aaaaaaaa00000001', since: Date.now(), place: { t: 'island', id: 'databases' } } })).status()).toBe(403);
    expect(await online(request, 'databases')).toBe(0);
    // The site's own pages and storage hold no identifier.
    expect(await page.evaluate(() => JSON.stringify([Object.keys(localStorage), Object.keys(sessionStorage)]))).not.toMatch(/presence|session|visitor/i);
  });

  test('a browser that asks not to be tracked is not counted and gets no cookie', async ({ browser, baseURL, request }) => {
    await empty(request, 'structures');
    // The server's side: the request carries Global Privacy Control, the page's script does not know.
    const header = await browser.newContext({ baseURL, extraHTTPHeaders: { 'Sec-GPC': '1' } });
    const first = await header.newPage(), answers: unknown[] = [];
    first.on('response', async response => { if (new URL(response.url()).pathname === API && response.request().method() === 'POST') answers.push(await response.json().catch(() => null)); });
    await first.goto(syllabus('structures'));
    await expect.poll(() => answers.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(answers[0]).toMatchObject({ ok: true, counted: false });
    await first.waitForTimeout(4_000);
    expect((await header.cookies()).map(c => c.name)).not.toContain('li_presence');
    expect(await online(request, 'structures')).toBe(0);
    await header.close();
    // The browser's side: the page sees the signal and never asks. Do Not Track works the same way.
    for (const signal of ['globalPrivacyControl', 'doNotTrack'] as const) {
      const context = await browser.newContext({ baseURL });
      await context.addInitScript(name => Object.defineProperty(Navigator.prototype, name, { configurable: true, get: () => (name === 'doNotTrack' ? '1' : true) }), signal);
      const page = await context.newPage(), posts: string[] = [];
      page.on('request', r => { if (new URL(r.url()).pathname === API && r.method() === 'POST') posts.push(r.url()); });
      await page.goto(syllabus('structures'));
      await page.waitForTimeout(4_000);
      expect(posts, signal).toEqual([]);
      expect((await context.cookies()).map(c => c.name), signal).not.toContain('li_presence');
      expect(await online(request, 'structures'), signal).toBe(0);
      // The page itself works as ever.
      await expect(page.locator('#island-structures')).toBeVisible();
      await context.close();
    }
  });

  test('only GET and POST are answered, and nothing else lives under the API', async ({ request }) => {
    for (const method of ['put', 'patch', 'delete'] as const) expect((await request[method](API, { data: {} })).status(), method).toBe(405);
    for (const path of ['/api', '/api/presence/sessions', '/api/presence/route', '/api/trials', '/api/presence/..%2Ftrials']) expect((await request.get(path)).status(), path).toBe(404);
  });

  test('courses, labs and the trial pages keep working with the tracker on', async ({ page }) => {
    await page.goto(`/curriculum/${slugOf('F01')}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(lessons.find(l => l.lessonId === 'F01')!.title);
    await page.goto('/learn/bubble-sort');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goto('/curriculum');
    await expect(page.locator('#island-foundations')).toBeVisible();
  });
});

const land = (() => {
  const settlement = islandsHomeWorld.world.settlements.find(s => s.islandId === 'foundations')!;
  const tiles = new Map(settlement.tiles.map(t => [hexKey(t), t]));
  return (x: number, z: number) => { const tile = tiles.get(hexKey(worldToHex(x, z, islandsHomeWorld.world.size))); return Boolean(tile) && tile!.terrain !== 'forest'; };
})();
interface Figure { id: number; x: number; y: number; z: number; presence: number; leaving: boolean; mode: string }
const figures = (page: Page) => page.evaluate(() => (document.querySelector('canvas') as unknown as { __npcs_foundations: () => Figure[] }).__npcs_foundations());
const drawn = (page: Page) => page.evaluate(() => document.querySelector('canvas')?.getAttribute('data-npc-foundations') ?? null);
const setPopulation = (page: Page, islands: Record<string, number> | null) => page.evaluate(value => (window as unknown as { __logicIslandPopulation: { set: (v: unknown) => void } }).__logicIslandPopulation.set(value), islands);
/** Any zone's drawn count, the loop's state, and the layer's own account of itself (mock builds). */
const zoneCount = (page: Page, id: string) => page.evaluate(name => document.querySelector('canvas')?.getAttribute(name) ?? null, `data-npc-${id}`);
const loopState = (page: Page) => page.evaluate(() => document.querySelector('canvas')?.getAttribute('data-npc-loop') ?? null);
interface ZoneInfo { id: string; kind: 'island' | 'commons'; key: string; cap: number; target: number; inView: boolean; figures: number; roads: string[] }
const zonesOf = (page: Page) => page.evaluate(() => (document.querySelector('canvas') as unknown as { __npcLoop: () => { state: string; zoom: number; zones: ZoneInfo[] } }).__npcLoop());
const figuresOf = (page: Page, id: string) => page.evaluate(name => (document.querySelector('canvas') as unknown as Record<string, () => Figure[]>)[name](), `__npcs_${id}`);
const setAll = (page: Page, islands: Record<string, number>, commons: Record<string, number> = {}) =>
  page.evaluate(([i, c]) => (window as unknown as { __logicIslandPopulation: { set: (islands: unknown, commons: unknown) => void } }).__logicIslandPopulation.set(i, c), [islands, commons]);
/** Whether a map point is on open land of the given island, or (no island) on any island's land at all. */
function landOf(layout: WorldLayout) {
  const owner = new Map(layout.world.settlements.flatMap(s => s.tiles.map(t => [hexKey(t), { islandId: s.islandId, forest: t.terrain === 'forest' }] as const)));
  return (x: number, z: number, islandId?: string) => { const tile = owner.get(hexKey(worldToHex(x, z, layout.world.size))); return islandId === undefined ? Boolean(tile) : tile?.islandId === islandId && !tile.forest; };
}
const tierOf = (cap: number) => (phone() ? Math.max(1, Math.ceil(cap / 2)) : cap);
/**
 * Every zone of a map filled to its cap: islands' figures on their own island's land, commons' figures on no land.
 * P6-B: only open islands have a zone. A planned island has none, and a crowd reported for it is drawn nowhere.
 */
async function expectZonesWalked(page: Page, layout: WorldLayout, region?: string) {
  await expect.poll(() => loopState(page), { timeout: 30_000 }).not.toBeNull();
  const { zones } = await zonesOf(page), all = layout.world.settlements.map(s => s.islandId), islands = all.filter(islandOpen), planned = all.filter(id => !islandOpen(id));
  expect(zones.filter(z => z.kind === 'island').map(z => z.id)).toEqual(islands);
  if (region) expect(zones.filter(z => z.kind === 'commons').map(z => [z.id, z.key])).toEqual([[`commons-${region}`, region]]);
  // A crowd on the planned islands alone: not one figure anywhere on the map.
  if (planned.length) {
    await setAll(page, Object.fromEntries(planned.map(id => [id, 1_000])));
    await expect.poll(async () => (await zonesOf(page)).zones.reduce((sum, z) => sum + z.figures, 0), { timeout: 15_000 }).toBe(0);
    for (const id of planned) expect(await zoneCount(page, id), `planned island ${id}`).toBeNull();
  }
  await setAll(page, Object.fromEntries(all.map(id => [id, 1_000])), Object.fromEntries(zones.filter(z => z.kind === 'commons').map(z => [z.key, 1_000])));
  const budget = phone() ? 16 : 40, wanted = zones.reduce((sum, z) => sum + tierOf(z.cap), 0);
  await expect.poll(async () => (await zonesOf(page)).zones.reduce((sum, z) => sum + z.figures, 0), { timeout: 15_000 }).toBe(Math.min(budget, wanted));
  const on = landOf(layout);
  for (const zone of (await zonesOf(page)).zones) {
    expect(zone.figures, zone.id).toBeGreaterThan(0);
    expect(zone.figures, zone.id).toBeLessThanOrEqual(tierOf(zone.cap));
    for (const figure of await figuresOf(page, zone.id)) {
      const where = `${zone.id} figure ${figure.id} at ${figure.x.toFixed(2)}, ${figure.z.toFixed(2)}`;
      if (zone.kind === 'island') expect(on(figure.x, figure.z, zone.id), where).toBe(true);
      else expect(on(figure.x, figure.z), `${where} (on land)`).toBe(false);
    }
  }
}
async function openHome(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.getByRole('button', { name: /^聚焦(資料結構島|基礎程式島)$/ }).first()).toHaveAttribute('data-model-source', /glb|geometry/, { timeout: 30_000 });
  await expect.poll(() => drawn(page), { timeout: 30_000 }).not.toBeNull();
}

test.describe('population figures: mock data', () => {
  test.skip(NPC !== 'mock', 'built without LOGIC_ISLAND_POPULATION_NPC=mock');

  test('figures follow the population up to the island cap, fewer on phones (reduced motion: at once, standing)', async ({ page }) => {
    await openHome(page);
    const cap = phone() ? 4 : 8;
    for (const [onlineCount, count] of [[0, 0], [1, 1], [3, 3], [12, Math.min(6, cap)], [40, cap], [100_000, cap], [2, 2], [0, 0]] as const) {
      await setPopulation(page, { foundations: onlineCount });
      await expect.poll(() => drawn(page), { message: `${onlineCount} online` }).toBe(String(count));
    }
    // Reduced motion (this suite's default): the figures stand where they are.
    await setPopulation(page, { foundations: 5 });
    await expect.poll(() => drawn(page)).toBe(String(Math.min(5, cap)));
    const before = await figures(page);
    await page.waitForTimeout(1_200);
    expect(await figures(page)).toEqual(before);
    for (const figure of before) {
      expect(land(figure.x, figure.z), `figure ${figure.id} at ${figure.x.toFixed(2)}, ${figure.z.toFixed(2)}`).toBe(true);
      expect(figure.presence).toBe(1);
    }
  });

  test('the map works as before with figures on it: focus, places, back to the overview', async ({ page }) => {
    await openHome(page);
    await setPopulation(page, { foundations: 40 });
    const label = page.getByRole('button', { name: '聚焦基礎程式島', exact: true });
    await expect(label).toHaveAttribute('data-model-source', 'glb');
    await label.click();
    await expect(page).toHaveURL(/\?island=foundations$/);
    await expect(page.getByRole('complementary', { name: '基礎程式島科目清單' })).toBeVisible();
    // The island's own places are still there to open (the HTML list is the touch and keyboard equivalent of the 3D targets).
    await expect(page.getByRole('region', { name: '基礎程式島地點' }).locator('button[data-target]')).toHaveCount(3);
    await page.getByRole('button', { name: '返回全景' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(label).toBeVisible();
    // Another island still takes a click on its label with figures drawn.
    await page.getByRole('button', { name: '聚焦資料結構島', exact: true }).click();
    await expect(page).toHaveURL(/\?island=structures$/);
    expect(await drawn(page)).toBe(String(phone() ? 4 : 8));
  });

  test('every island of the home map draws its own visitors under its own cap, and the bridges draw the regions\' own', async ({ page }) => {
    await openHome(page);
    // Reduced motion: no frames are asked for at all.
    expect(await loopState(page)).toBe('still');
    await expectZonesWalked(page, islandsHomeWorld);
    const { zones } = await zonesOf(page);
    expect(zones.map(z => z.id)).toEqual(['foundations', 'structures', 'algorithms', 'labs', 'databases', 'commons-cs', 'commons-hub']);
    // Caps are each zone's own.
    expect(new Set(zones.map(z => z.cap)).size).toBeGreaterThan(2);
    expect(Object.fromEntries(zones.filter(z => z.kind === 'commons').map(z => [z.key, z.roads.slice().sort()])))
      .toEqual({ cs: ['foundations-structures', 'structures-algorithms', 'structures-databases'], hub: ['algorithms-labs'] });
  });

  test('visitors who are in a region but on no island walk its bridges, never an island', async ({ page }) => {
    await openHome(page);
    await setAll(page, {}, { cs: 1_000, hub: 1_000 });
    const { zones } = await zonesOf(page);
    for (const zone of zones) await expect.poll(() => zoneCount(page, zone.id), { message: zone.id }).toBe(String(zone.kind === 'commons' ? tierOf(zone.cap) : 0));
    const on = landOf(islandsHomeWorld);
    for (const zone of zones.filter(z => z.kind === 'commons')) for (const figure of await figuresOf(page, zone.id)) expect(on(figure.x, figure.z), `${zone.id} at ${figure.x.toFixed(2)}, ${figure.z.toFixed(2)}`).toBe(false);
    // An island's visitors are its own: one island busy, the bridges and the other islands empty.
    await setAll(page, { labs: 1_000 });
    for (const zone of zones) await expect.poll(() => zoneCount(page, zone.id), { message: zone.id }).toBe(String(zone.id === 'labs' ? tierOf(zone.cap) : 0));
    // Other archipelagos' visitors are not on this map at all.
    await setAll(page, { 'machine-learning': 1_000, frontend: 1_000 }, { ai: 1_000, web: 1_000, design: 1_000, sys: 1_000 });
    for (const zone of zones) await expect.poll(() => zoneCount(page, zone.id), { message: zone.id }).toBe('0');
  });
});

test.describe('population figures: the five region maps (mock data)', () => {
  test.skip(NPC !== 'mock' || !WORLD, 'built without LOGIC_ISLAND_POPULATION_NPC=mock and LOGIC_ISLAND_REGIONAL_WORLD=1');

  for (const region of REGIONS) test(`/world/${region}: every open island and the region's bridges have their figures, planned islands none`, async ({ page }) => {
    await page.goto(`/world/${region}`);
    await expectZonesWalked(page, regionLayout(region).layout, region);
  });
});

test.describe('population figures: the five P9 region maps (mock data)', () => {
  test.skip(NPC !== 'mock' || !P9, 'built without LOGIC_ISLAND_POPULATION_NPC=mock and LOGIC_ISLAND_P9_PROTOTYPE=1');

  for (const region of REGIONS) test(`/${region}: every open island and the region's bridges have their figures, planned islands none`, async ({ page }) => {
    await page.goto(`/${region}`);
    await expectZonesWalked(page, regionScene(region).region.layout, region);
  });
});

test.describe('population figures: mock data, with motion', () => {
  test.skip(NPC !== 'mock', 'built without LOGIC_ISLAND_POPULATION_NPC=mock');
  test.use({ reducedMotion: 'no-preference' });

  test('figures arrive one by one, walk on land, and leave one by one', async ({ page }) => {
    test.setTimeout(90_000);
    await openHome(page, '/?island=foundations');
    await setPopulation(page, { foundations: 1 });
    await expect.poll(() => drawn(page)).toBe('1');
    const cap = phone() ? 4 : 8;
    await setPopulation(page, { foundations: 100 });
    // Not at once: the roster grows by one at a time.
    const counts: number[] = [];
    await expect.poll(async () => { counts.push(Number(await drawn(page))); return counts.at(-1); }, { timeout: 20_000, intervals: [100] }).toBe(cap);
    expect(counts[0]).toBeLessThan(cap);
    for (let i = 1; i < counts.length; i++) expect(counts[i] - counts[i - 1]).toBeLessThanOrEqual(1);
    // They move, and every position on the way is on the island's open land.
    const first = await figures(page);
    let moved = 0;
    for (let sample = 0; sample < 20; sample++) {
      await page.waitForTimeout(250);
      for (const figure of await figures(page)) {
        expect(land(figure.x, figure.z), `figure ${figure.id} at ${figure.x.toFixed(2)}, ${figure.z.toFixed(2)}`).toBe(true);
        const start = first.find(f => f.id === figure.id);
        if (start && Math.hypot(figure.x - start.x, figure.z - start.z) > 0.3) moved += 1;
      }
    }
    expect(moved).toBeGreaterThan(0);
    await setPopulation(page, { foundations: 0 });
    await expect.poll(() => drawn(page), { timeout: 20_000 }).toBe('0');
    await expect.poll(async () => (await figures(page)).length, { timeout: 5_000 }).toBe(0);
  });

  test('a hidden page stops the figures; they go on when it is back', async ({ page }) => {
    await openHome(page, '/?island=foundations');
    await setPopulation(page, { foundations: 3 });
    await expect.poll(() => drawn(page)).toBe('3');
    await page.waitForTimeout(1_500);
    await setHidden(page, true);
    await page.waitForTimeout(300);
    const still = await figures(page);
    await page.waitForTimeout(1_200);
    expect(await figures(page)).toEqual(still);
    await setHidden(page, false);
    await expect.poll(async () => JSON.stringify(await figures(page)) !== JSON.stringify(still), { timeout: 10_000 }).toBe(true);
  });
});

test.describe('the figures\' render loop (mock data, with motion)', () => {
  test.skip(NPC !== 'mock', 'built without LOGIC_ISLAND_POPULATION_NPC=mock');
  test.use({ reducedMotion: 'no-preference' });

  /** How many times the figures of a zone were drawn differently in `ms`: the frames the map drew for them. */
  const framesOf = (page: Page, id: string, ms: number) => page.evaluate(async ([name, duration]) => {
    const read = () => JSON.stringify((document.querySelector('canvas') as unknown as Record<string, () => { x: number; z: number; presence: number }[]>)[name as string]().map(f => [f.x, f.z, f.presence]));
    let frames = 0, last = read();
    for (const end = performance.now() + (duration as number); performance.now() < end;) {
      await new Promise(requestAnimationFrame);
      const now = read();
      if (now !== last) { frames++; last = now; }
    }
    return frames;
  }, [`__npcs_${id}`, ms] as const);

  test('asks for no frames on an empty map, and only as many as the figures\' movement needs', async ({ page }) => {
    test.setTimeout(90_000);
    await openHome(page);
    await setAll(page, {});
    await expect.poll(() => loopState(page), { timeout: 20_000 }).toBe('quiet');
    await setAll(page, { foundations: 1_000 });
    await expect.poll(() => loopState(page)).toMatch(/^run:\d+$/);
    await expect.poll(() => drawn(page), { timeout: 20_000 }).toBe(String(phone() ? 4 : 8));
    const fps = Number((await loopState(page))!.split(':')[1]);
    expect(fps).toBeGreaterThanOrEqual(phone() ? 6 : 8);
    expect(fps).toBeLessThanOrEqual(phone() ? 15 : 30);
    // The overview is far away: a walking figure crosses a few px a second, so the map draws well under 30 frames a second.
    expect(fps).toBeLessThanOrEqual(12);
    const frames = await framesOf(page, 'foundations', 3_000);
    expect(frames).toBeGreaterThan(0);
    expect(frames).toBeLessThanOrEqual((fps + 2) * 3);
  });

  test('stops for figures the camera does not see, and goes on when they are back in the picture', async ({ page }) => {
    test.setTimeout(90_000);
    await openHome(page);
    // Only the lab island, in the south, has visitors; the camera goes to the database island, in the north.
    await setAll(page, { labs: 1_000 });
    await expect.poll(() => zoneCount(page, 'labs'), { timeout: 20_000 }).toBe(String(tierOf(2)));
    await page.getByRole('button', { name: /^聚焦資料庫應用島/ }).click();
    await expect(page).toHaveURL(/\?island=databases$/);
    await expect.poll(async () => (await zonesOf(page)).zones.find(z => z.id === 'labs')!.inView, { timeout: 15_000 }).toBe(false);
    await expect.poll(() => loopState(page), { timeout: 10_000 }).toBe('quiet');
    expect(await framesOf(page, 'labs', 1_500)).toBe(0);
    // A population change out of sight is simply there, with no frames spent on walking it in.
    await setAll(page, { labs: 1 });
    await expect.poll(() => zoneCount(page, 'labs')).toBe('1');
    expect(await loopState(page)).toBe('quiet');
    await setAll(page, { labs: 1_000 });
    await page.getByRole('button', { name: '返回全景' }).click();
    await expect.poll(async () => (await zonesOf(page)).zones.find(z => z.id === 'labs')!.inView, { timeout: 15_000 }).toBe(true);
    await expect.poll(() => loopState(page), { timeout: 30_000 }).toMatch(/^(run:\d+|rest)$/);
    await expect.poll(() => framesOf(page, 'labs', 1_000), { timeout: 40_000 }).toBeGreaterThan(0);
  });

  test('a background tab asks for nothing; a visible one picks up where it stopped', async ({ page }) => {
    await openHome(page);
    await setAll(page, { foundations: 1_000 });
    await expect.poll(() => loopState(page)).toMatch(/^run:\d+$/);
    await setHidden(page, true);
    await expect.poll(() => loopState(page)).toBe('hidden');
    expect(await framesOf(page, 'foundations', 1_500)).toBe(0);
    await setHidden(page, false);
    await expect.poll(() => loopState(page)).toMatch(/^run:\d+$/);
    await expect.poll(() => framesOf(page, 'foundations', 1_000), { timeout: 15_000 }).toBeGreaterThan(0);
  });

  test('a lone figure rests, and the map draws nothing while it stands', async ({ page }) => {
    test.setTimeout(120_000);
    await openHome(page);
    await setAll(page, { databases: 1 });
    await expect.poll(() => zoneCount(page, 'databases'), { timeout: 20_000 }).toBe('1');
    // It walks its road and stands at the end of it: the loop then waits for it instead of running.
    await expect.poll(() => loopState(page), { timeout: 60_000, intervals: [200] }).toBe('rest');
    expect((await figuresOf(page, 'databases'))[0].mode).toBe('pause');
    expect(await framesOf(page, 'databases', 500)).toBe(0);
    // And it walks on by itself.
    await expect.poll(() => loopState(page), { timeout: 30_000, intervals: [200] }).toMatch(/^run:\d+$/);
  });
});

test.describe('population figures: live', () => {
  test.skip(NPC !== 'live', 'built without LOGIC_ISLAND_PRESENCE=1 and LOGIC_ISLAND_POPULATION_NPC=live');

  test('a visitor on a foundations lesson appears on the home map of another visitor, and leaves it', async ({ page, browser, baseURL, request }) => {
    test.setTimeout(120_000);
    await empty(request, 'foundations');
    await openHome(page);
    await expect.poll(() => drawn(page), { timeout: 40_000 }).toBe('0');
    const learner = await newVisitor(browser, baseURL);
    await learner.page.goto(`/curriculum/${slugOf('F05')}`);
    await expectOnline(request, 'foundations', 1);
    // The map asks every 15 seconds; an answer may be up to 5 seconds old.
    await expect.poll(() => drawn(page), { timeout: 40_000 }).toBe('1');
    await learner.page.goto(`/curriculum/${slugOf('DB02')}`);
    await expectOnline(request, 'foundations', 0);
    await expect.poll(() => drawn(page), { timeout: 40_000 }).toBe('0');
    await learner.leave();
  });

  test('a visitor on a region\'s own page appears on that region\'s bridges, and on no island', async ({ page, browser, baseURL, request }) => {
    test.setTimeout(120_000);
    await expect.poll(async () => (await population(request)).commons.cs, { timeout: 100_000 }).toBe(0);
    await openHome(page);
    await expect.poll(() => zoneCount(page, 'commons-cs'), { timeout: 40_000 }).toBe('0');
    const learner = await newVisitor(browser, baseURL);
    await learner.page.goto('/regions/cs');
    await expect.poll(async () => (await population(request)).commons.cs, { timeout: 15_000 }).toBe(1);
    const counts = await population(request);
    // The same number the regions and islands already told: nothing new about anyone.
    expect(counts.commons.cs).toBe(counts.regions.cs - ['foundations', 'structures', 'algorithms', 'databases', 'programming-languages', 'networks', 'systems-analysis', 'information-systems'].reduce((sum, id) => sum + (counts.islands[id] ?? 0), 0));
    await expect.poll(() => zoneCount(page, 'commons-cs'), { timeout: 40_000 }).toBe('1');
    for (const id of ['foundations', 'structures', 'algorithms', 'databases']) expect(await zoneCount(page, id), id).toBe(String(counts.islands[id] ?? 0));
    await learner.leave();
    await expect.poll(() => zoneCount(page, 'commons-cs'), { timeout: 40_000 }).toBe('0');
  });
});
