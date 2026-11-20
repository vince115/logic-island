import { test as base, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { lessons } from '../src/content/curriculum/lessons';
import { hexKey, worldToHex } from '../src/lib/islands/hex';
import { islandsHomeWorld } from '../src/lib/islands/islands-world';

/*
 * Dynamic Island Population (docs/planning/PRESENCE_POPULATION_SYSTEM.md). Three kinds of build, told apart by the
 * same variables the build was made with (set them for the test run too):
 *
 *   default build                                   only the "off" tests run: no API, no cookie, no figures.
 *   LOGIC_ISLAND_PRESENCE=1                         the presence tests: real browsers, the real API.
 *   … and LOGIC_ISLAND_POPULATION_NPC=mock | live   the figures on the home map, from mock data or from the API.
 *
 * The presence tests count visitors on one server, so run this file alone and with one worker
 * (`playwright test e2e/presence.spec.ts --workers=1`): other specs' pages are visitors too. Each test uses islands
 * no other test of this file uses, and every test's pages say goodbye when it ends (they leave for about:blank), so
 * the same test in the next project starts from an empty island.
 */
const PRESENCE = process.env.LOGIC_ISLAND_PRESENCE === '1';
const NPC = PRESENCE || process.env.LOGIC_ISLAND_POPULATION_NPC === 'mock' ? process.env.LOGIC_ISLAND_POPULATION_NPC : undefined;
const API = '/api/presence';

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

interface Snapshot { total: number; hub: number; regions: Record<string, number>; islands: Record<string, number> }
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
const empty = async (request: APIRequestContext, ...islands: string[]) => { for (const id of islands) await expectOnline(request, id, 0, 100_000); };

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
    await empty(request, 'programming-languages', 'linux-systems', 'docker-containers');
    // A lesson page: the server finds its island and region.
    await page.goto(`/curriculum/${slugOf('PL03')}`);
    await expectOnline(request, 'programming-languages', 1);
    expect((await population(request)).regions.cs).toBeGreaterThanOrEqual(1);
    // The syllabus names an island only in its hash; the home map in a query parameter.
    await page.goto(syllabus('linux-systems'));
    await expectOnline(request, 'linux-systems', 1);
    await expectOnline(request, 'programming-languages', 0);
    const sys = (await population(request)).regions.sys;
    await page.evaluate(() => { location.hash = '#island-docker-containers'; });
    await expectOnline(request, 'docker-containers', 1);
    await expectOnline(request, 'linux-systems', 0);
    // Same region, another island: the region's count did not change.
    expect((await population(request)).regions.sys).toBe(sys);
    // A region's own page names no island: the visitor stays in the region, on no island.
    await page.goto('/regions/sys');
    await expectOnline(request, 'docker-containers', 0);
    // (While the new page loads the old one has said goodbye: the count is back once the new page reports.)
    await expect.poll(async () => (await population(request)).regions.sys).toBe(sys);
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
    await empty(request, 'ui-design', 'ux-research', 'interaction-design');
    await page.goto(syllabus('ui-design'));
    await expectOnline(request, 'ui-design', 1);
    const second = await context.newPage();
    await second.goto(syllabus('ux-research'));
    await expectOnline(request, 'ux-research', 1);
    await expectOnline(request, 'ui-design', 0);
    // Both tabs keep reporting for a while: still one visitor, still where the newer tab is.
    await page.waitForTimeout(4_000);
    expect(await online(request, 'ui-design') + await online(request, 'ux-research')).toBe(1);
    // The visitor goes on in the first tab: the session follows.
    await page.evaluate(() => { location.hash = '#island-interaction-design'; });
    await expectOnline(request, 'interaction-design', 1);
    await expectOnline(request, 'ux-research', 0);
  });

  test('a second browser is a second visitor', async ({ page, browser, baseURL, request }) => {
    await empty(request, 'design-systems');
    await page.goto(syllabus('design-systems'));
    await expectOnline(request, 'design-systems', 1);
    const other = await newVisitor(browser, baseURL);
    await other.page.goto(syllabus('design-systems'));
    await expectOnline(request, 'design-systems', 2);
    await other.leave();
    await expectOnline(request, 'design-systems', 1);
  });

  test('a reload keeps the visitor, counted once', async ({ page, request }) => {
    await empty(request, 'web-foundations');
    await page.goto(syllabus('web-foundations'));
    await expectOnline(request, 'web-foundations', 1);
    const seen: number[] = [];
    const sampling = setInterval(() => { void online(request, 'web-foundations').then(n => seen.push(n)).catch(() => {}); }, 150);
    await page.reload();
    await page.waitForTimeout(3_000);
    clearInterval(sampling);
    await expectOnline(request, 'web-foundations', 1);
    expect(Math.max(...seen), 'never two during the reload').toBeLessThanOrEqual(1);
  });

  test('a background tab stops counting at once and sends nothing; back in front it counts again', async ({ page, request }) => {
    await empty(request, 'frontend');
    await page.goto(syllabus('frontend'));
    await expectOnline(request, 'frontend', 1);
    // A heartbeat is a fetch with a JSON body; the goodbye is a beacon, whose body the test cannot read.
    const sent: (string | null)[] = [];
    page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname === API) sent.push(r.postData()); });
    await setHidden(page, true);
    await expectOnline(request, 'frontend', 0, 5_000);
    await page.waitForTimeout(3_000);
    // One goodbye, no heartbeat.
    expect(sent.filter(body => body?.includes('"place"'))).toEqual([]);
    expect(sent).toHaveLength(1);
    await setHidden(page, false);
    await expectOnline(request, 'frontend', 1, 5_000);
  });

  test('a visitor who goes silent is dropped after the timeout', async ({ page, context, request }) => {
    test.setTimeout(150_000);
    await empty(request, 'mobile-apps');
    await page.goto(syllabus('mobile-apps'));
    await expectOnline(request, 'mobile-apps', 1);
    // The network goes away with the tab still open: no heartbeat arrives, and no goodbye either.
    await context.setOffline(true);
    await page.waitForTimeout(60_000);
    expect(await online(request, 'mobile-apps'), 'still counted inside the timeout').toBe(1);
    await expectOnline(request, 'mobile-apps', 0, 60_000);
    await context.setOffline(false);
  });

  test('the server decides the place: unknown references are the hub, malformed ones are refused', async ({ page, request }) => {
    await empty(request, 'responsive-design');
    await page.goto(syllabus('responsive-design'));
    await expectOnline(request, 'responsive-design', 1);
    const send = (body: unknown) => page.evaluate(async data => (await fetch('/api/presence', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })).status, body);
    const beat = (place: unknown) => ({ v: 1, tab: 'eeeeeeee00000009', since: Date.now(), place });
    for (const place of [{ region: 'ai', island: 'responsive-design' }, { t: 'island', id: 'responsive-design', island: 'frontend' }, 'responsive-design', { t: 'island', id: '../x' }])
      expect(await send(beat(place)), JSON.stringify(place)).toBe(400);
    // An island that does not exist: accepted, and the visitor is on no island.
    expect(await send(beat({ t: 'island', id: 'atlantis' }))).toBe(200);
    await expectOnline(request, 'responsive-design', 0);
    expect((await population(request)).islands.atlantis).toBeUndefined();
    // A web island claimed "in the AI region" is counted in the web region.
    const before = await population(request);
    expect(await send(beat({ t: 'island', id: 'responsive-design', r: 'ai' }))).toBe(200);
    await expectOnline(request, 'responsive-design', 1);
    const after = await population(request);
    expect(after.regions.ai).toBe(before.regions.ai);
    expect(after.regions.web).toBe(before.regions.web + 1);
  });

  test('the API gives out totals only; the session cookie is not readable or reusable elsewhere', async ({ page, context, request }) => {
    await empty(request, 'network-servers', 'cloud-infrastructure');
    await page.goto(syllabus('network-servers'));
    await expectOnline(request, 'network-servers', 1);
    const response = await request.get(API), text = await response.text();
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(['at', 'hub', 'islands', 'regions', 'total', 'ttlMs', 'v']);
    expect(response.headers()['set-cookie']).toBeUndefined();
    const cookie = (await context.cookies()).find(c => c.name === 'li_presence')!;
    expect(cookie).toMatchObject({ path: '/api/presence', httpOnly: true, sameSite: 'Strict', expires: -1 });
    expect(await page.evaluate(() => document.cookie)).not.toContain('li_presence');
    // Nothing of the session is in what the API publishes.
    for (const part of cookie.value.split('.').slice(1)) expect(text).not.toContain(part);
    // A request that is not from a page of this site is refused, with or without the cookie.
    expect((await request.post(API, { data: { v: 1, tab: 'aaaaaaaa00000001', since: Date.now(), place: { t: 'hub' } } })).status()).toBe(403);
    expect((await request.post(API, { headers: { origin: 'https://example.com', cookie: `li_presence=${cookie.value}` }, data: { v: 1, tab: 'aaaaaaaa00000001', since: Date.now(), place: { t: 'island', id: 'cloud-infrastructure' } } })).status()).toBe(403);
    expect(await online(request, 'cloud-infrastructure')).toBe(0);
    // The site's own pages and storage hold no identifier.
    expect(await page.evaluate(() => JSON.stringify([Object.keys(localStorage), Object.keys(sessionStorage)]))).not.toMatch(/presence|session|visitor/i);
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
});
