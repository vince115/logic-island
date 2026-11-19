import { expect, type Page } from '@playwright/test';
import { ON, phone, test } from './world-helpers';

/*
 * P9.1 visual prototype (/p9, /p9/cs): review pages, in a build made with LOGIC_ISLAND_P9_PROTOTYPE=1 only. Run these
 * specs with the same variable as the build. Without it they check the other half: the pages are not there, and
 * nothing of the site leads to them.
 */
const P9 = process.env.LOGIC_ISLAND_P9_PROTOTYPE === '1';
const REGIONS = ['cs', 'ai', 'design', 'web', 'sys'] as const;
const PLANNED = ['programming-languages', 'networks', 'systems-analysis', 'information-systems'] as const;
const drawn = (page: Page) => page.locator('[data-p9-world]').getAttribute('data-p9-world').then(text => JSON.parse(text!) as {
  time: string; regions: { id: string; source: string; scale: number; islands: string[]; bridges: string[]; landmarks: string[]; trees: number }[]; links: { id: string; kind: string }[] });
const CS_ISLANDS = ['foundations', 'structures', 'algorithms', 'databases', ...PLANNED].sort();
const TIMES = ['morning', 'noon', 'sunset', 'dusk'] as const;
const TIME_LABELS = { morning: '清晨', noon: '中午', sunset: '黃昏', dusk: '傍晚' } as const;
/** The header's time button (the site's own): its name says the current time. */
const timeButton = (page: Page) => page.getByRole('button', { name: /^時間：/ });
/** Presses the time button until it says `time`. */
async function setTime(page: Page, time: typeof TIMES[number]) {
  for (let i = 0; i < 4 && !(await timeButton(page).getAttribute('aria-label'))!.startsWith(`時間：${TIME_LABELS[time]}`); i++) await timeButton(page).click();
  await expect(timeButton(page)).toHaveAttribute('aria-label', new RegExp(`^時間：${TIME_LABELS[time]}`));
}
/** The colour in the canvas's top-left corner (open sea or sky): differs with the time of day. */
const corner = (page: Page) => page.locator('canvas').first().screenshot().then(png => page.evaluate(async b64 => {
  const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode();
  const c = new OffscreenCanvas(i.width, i.height), g = c.getContext('2d')!; g.drawImage(i, 0, 0);
  const d = g.getImageData(i.width - 12, 12, 1, 1).data; return [d[0], d[1], d[2]];
}, png.toString('base64')));
async function openMap(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
}

test.describe('P9.1 prototype: a build without the flag', () => {
  test.skip(P9, 'this build has the prototype pages');
  test('has no prototype page, and no page links to one', async ({ page }) => {
    for (const path of ['/p9', '/p9/cs', '/p9/cs?island=foundations']) expect((await page.request.get(path)).status(), path).toBe(404);
    for (const path of ['/', '/learn', '/curriculum', '/regions/cs', ...(ON ? ['/world', '/world/cs'] : [])]) {
      await page.goto(path);
      expect(await page.locator('a[href^="/p9"]').count(), `${path} links to /p9`).toBe(0);
    }
  });
});

test.describe('P9.1 prototype: world overview', () => {
  test.skip(!P9, 'needs a build with LOGIC_ISLAND_P9_PROTOTYPE=1');
  test('is the regions\' own scenes drawn small: every island, bridge and landmark of each region, all at one scale, and the world\'s links', async ({ page }) => {
    await openMap(page, '/p9');
    const world = await drawn(page);
    expect(world.regions.map(r => r.id).sort()).toEqual([...REGIONS, 'hub'].sort());
    // One scale for every scene: an island is the same size in every region.
    expect(new Set(world.regions.map(r => r.scale)).size, world.regions.map(r => `${r.id} ${r.scale}`).join(', ')).toBe(1);
    expect(world.regions.filter(r => r.id !== 'hub').reduce((n, r) => n + r.islands.length, 0)).toBe(29);
    expect(new Set(world.regions.flatMap(r => r.islands)).size, 'no island twice, the hub\'s apart').toBe(30);
    const cs = world.regions.find(r => r.id === 'cs')!;
    expect(cs.source).toBe('p9');
    expect([...cs.islands].sort()).toEqual(CS_ISLANDS);
    expect(cs.bridges).toHaveLength(7);
    expect(cs.landmarks).toEqual(expect.arrayContaining(['foundations:Landmark_Lighthouse', 'foundations:Building_Workshop', 'foundations:Dock_Entry', 'databases:Landmark_DatabaseTower', ...PLANNED.map(id => `${id}:${id}`)]));
    expect(cs.trees).toBeGreaterThan(100);
    expect(world.regions.find(r => r.id === 'hub')!.islands).toEqual(['labs']);
    expect(world.links.filter(l => l.kind === 'hub').map(l => l.id).sort()).toEqual(REGIONS.map(r => `hub-${r}`).sort());
    expect(world.links.filter(l => l.kind === 'relation').map(l => l.id).sort()).toEqual(['cs-ai', 'design-web', 'sys-cs']);
    // Six labels on the map, inside the stage and off each other.
    const labels = page.locator('[data-target]');
    await expect(labels).toHaveCount(6);
    const stage = (await page.locator('[data-p9-world]').boundingBox())!;
    const boxes = await labels.evaluateAll(list => list.map(e => { const r = e.getBoundingClientRect(); return { id: e.getAttribute('data-target'), x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; }));
    for (const b of boxes) {
      expect(b.x0, `${b.id} left`).toBeGreaterThanOrEqual(stage.x - 1); expect(b.x1, `${b.id} right`).toBeLessThanOrEqual(stage.x + stage.width + 1);
      expect(b.y0, `${b.id} top`).toBeGreaterThanOrEqual(stage.y - 1); expect(b.y1, `${b.id} bottom`).toBeLessThanOrEqual(stage.y + stage.height + 1);
    }
    for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) expect(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0, `${a.id} and ${b.id} overlap`).toBe(true);
  });
  test('only the built region opens a map; the others are named and open nothing; nothing leads to /world', async ({ page }) => {
    await openMap(page, '/p9');
    await expect(page.locator('button[data-target="cs"]')).toHaveCount(1);
    for (const id of REGIONS.filter(r => r !== 'cs')) {
      await expect(page.locator(`button[data-target="${id}"]`), id).toHaveCount(0);
      await expect(page.locator(`[data-target="${id}"][data-pending="true"]`), id).toHaveCount(1);
      await expect(page.locator(`[data-region-entry="${id}"]`), id).toHaveJSProperty('tagName', 'DIV');
    }
    expect(await page.locator('a[href^="/world"]').count()).toBe(0);
    expect(await page.locator('a[href^="/trials"]').count()).toBe(0);
    // The guide's entry, by keyboard: the way in that needs no 3D.
    const entry = page.locator('a[data-region-entry="cs"]');
    await expect(entry).toHaveAttribute('href', '/p9/cs');
    await entry.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/p9\/cs$/);
  });
  test('the map label opens the region', async ({ page }) => {
    await openMap(page, '/p9');
    await page.locator('button[data-target="cs"]').click();
    await expect(page).toHaveURL(/\/p9\/cs$/);
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('P9.1b prototype: one geography and one time of day on every level', () => {
  test.skip(!P9, 'needs a build with LOGIC_ISLAND_P9_PROTOTYPE=1');
  test('the world\'s CS region holds the islands the CS region page lists', async ({ page }) => {
    test.skip(phone(), 'the island list is open beside the map on wide screens');
    await openMap(page, '/p9');
    const cs = (await drawn(page)).regions.find(r => r.id === 'cs')!;
    await openMap(page, '/p9/cs');
    await expect(page.locator('[data-island-choice]')).toHaveCount(8);
    const listed = await page.locator('[data-island-choice]').evaluateAll(list => list.map(e => e.getAttribute('data-island-choice')!));
    expect([...listed].sort()).toEqual([...cs.islands].sort());
  });
  test('the world draws each of the four times of day, with the site\'s time button', async ({ page }) => {
    await openMap(page, '/p9');
    const colours: string[] = [];
    for (const time of TIMES) {
      await setTime(page, time);
      await expect.poll(async () => (await drawn(page)).time).toBe(time);
      await page.waitForTimeout(400);
      colours.push((await corner(page)).join());
      expect(await page.evaluate(() => document.documentElement.dataset.theme), `${time} theme`).toBe(time === 'dusk' ? 'dark' : 'light');
    }
    expect(new Set(colours).size, `the sea at ${TIMES.join(', ')}: ${colours.join(' | ')}`).toBe(4);
  });
  test('a time set on the world stays through the region and the island, and back', async ({ page }) => {
    await openMap(page, '/p9');
    await setTime(page, 'sunset');
    await page.locator('button[data-target="cs"]').click();
    await expect(page).toHaveURL(/\/p9\/cs$/);
    await expect(page.locator('[data-environment]')).toHaveAttribute('data-environment', 'sunset', { timeout: 30_000 });
    await expect(timeButton(page)).toHaveAttribute('aria-label', /^時間：黃昏/);
    await page.goto('/p9/cs?island=foundations');
    await expect(page.locator('[data-environment]')).toHaveAttribute('data-environment', 'sunset', { timeout: 30_000 });
    // Changed on the island, it is the world's time too.
    await setTime(page, 'dusk');
    await expect(page.locator('[data-environment]')).toHaveAttribute('data-environment', 'dusk');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/p9\/cs$/);
    await expect(page.locator('[data-environment]')).toHaveAttribute('data-environment', 'dusk');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/p9$/);
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await drawn(page)).time).toBe('dusk');
    // And after a reload: the time is the site's, not the page's.
    await page.reload();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await drawn(page)).time).toBe('dusk');
  });
});

test.describe('P9.1 prototype: CS region and island', () => {
  test.skip(!P9, 'needs a build with LOGIC_ISLAND_P9_PROTOTYPE=1');
  test('lists eight islands, four of them planned, and a planned island opens no lesson', async ({ page }) => {
    await openMap(page, '/p9/cs');
    // No mist: a planned island is drawn as an island; that it is planned is said in words, on the map and in the list.
    await expect(page.locator('button[aria-label^="聚焦"]')).toHaveCount(8, { timeout: 30_000 });
    await expect(page.locator('button[aria-label$="（規劃中）"]')).toHaveCount(4);
    // The island list is open beside the map on wide screens (phones open it from the header).
    if (!phone()) {
      await expect(page.locator('[data-island-choice]')).toHaveCount(8);
      for (const id of PLANNED) await expect(page.locator(`[data-island-choice="${id}"]`), id).toContainText('規劃中');
    }
    // The explorer itself: the site header's own 開始學習 link is not part of the island.
    const explorer = page.locator('section[aria-label$="（P9.1 原型）"]');
    for (const id of PLANNED) {
      await page.goto(`/p9/cs?island=${id}`);
      await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('尚未開放課程').first(), id).toBeVisible();
      await expect(explorer).toBeVisible();
      expect(await explorer.locator('a[href^="/curriculum/"]').count(), `${id} lesson links`).toBe(0);
      expect(await explorer.locator('a[href^="/learn/"]').count(), `${id} lab links`).toBe(0);
      await expect(page.locator('section[aria-label$="地點"]'), `${id} has no place to enter`).toHaveCount(0);
    }
  });
  test('the foundations island keeps its targets, lessons, address and the way back', async ({ page }) => {
    await openMap(page, '/p9/cs?island=foundations');
    // The workshop, the lighthouse and the dock: the GLB's three targets, as HTML buttons too.
    const places = page.locator('section[aria-label="基礎程式島地點"]');
    await expect(places).toBeVisible({ timeout: 30_000 });
    for (const name of ['工坊', '燈塔', '碼頭']) await expect(places.getByRole('button', { name: new RegExp(name) }).or(places.getByRole('link', { name: new RegExp(name) })).first(), name).toBeVisible();
    // Its twenty lessons are linked, and every one of them exists.
    const lessons = await page.locator('section[aria-label$="（P9.1 原型）"] a[href^="/curriculum/"]').evaluateAll(list => [...new Set(list.map(a => a.getAttribute('href')!))]);
    expect(lessons.length).toBeGreaterThanOrEqual(4);
    for (const href of lessons) expect((await page.request.get(href)).status(), href).toBe(200);
    // Escape: island → region (the address drops the island, the focus goes to its entry) → the prototype's overview.
    await page.locator('canvas').first().focus().catch(() => {});
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/p9\/cs$/);
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.getAttribute('data-island-choice') ?? ''), { timeout: 5_000 }).toMatch(/聚焦基礎程式島|foundations/);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/p9$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/p9\/cs$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/p9\/cs\?island=foundations$/);
  });
  test('an unknown island is dropped from the address', async ({ page }) => {
    await openMap(page, '/p9/cs?island=nowhere');
    await expect(page).toHaveURL(/\/p9\/cs$/);
  });
  test('phones: pins with a 44 px touch area, and the sheet leaves the map in view', async ({ page }) => {
    test.skip(!phone(), 'phone layout');
    await openMap(page, '/p9/cs');
    const pins = page.locator('button[aria-label^="聚焦"]');
    await expect(pins).toHaveCount(8, { timeout: 30_000 });
    // The touch area is the pin's ::before (as on /world/<region>): at least 44 by 44 px.
    const areas = await pins.evaluateAll(list => list.map(b => { const s = getComputedStyle(b, '::before'); return [parseFloat(s.width), parseFloat(s.height)]; }));
    for (const [w, h] of areas) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }
    await page.goto('/p9/cs?island=foundations');
    const sheet = page.locator('aside[aria-label="基礎程式島科目清單"]');
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    const canvas = (await page.locator('canvas').boundingBox())!, box = (await sheet.boundingBox())!;
    expect(Math.max(0, canvas.y + canvas.height - box.y) / canvas.height, 'the sheet covers at most 60% of the map').toBeLessThanOrEqual(.6);
  });
});
