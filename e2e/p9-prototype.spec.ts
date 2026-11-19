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
    for (const path of ['/p9', '/p9/cs', '/p9/cs?island=foundations', '/cs', '/cs?island=foundations', '/ai', '/design', '/web', '/sys']) expect((await page.request.get(path)).status(), path).toBe(404);
    for (const path of ['/', '/learn', '/curriculum', '/regions/cs', ...(ON ? ['/world', '/world/cs'] : [])]) {
      await page.goto(path);
      expect(await page.locator('a[href^="/p9"]').count(), `${path} links to /p9`).toBe(0);
    }
  });
});

test.describe('P9.1 prototype: world overview', () => {
  test.skip(!P9, 'needs a build with LOGIC_ISLAND_P9_PROTOTYPE=1');
  test('is the home page: / draws it, regions are /<region>, old /p9 links redirect with their query', async ({ page }) => {
    expect((await page.request.get('/', { maxRedirects: 0 })).status()).toBe(200);
    for (const region of ['cs', 'ai', 'design', 'web', 'sys']) expect((await page.request.get(`/${region}`, { maxRedirects: 0 })).status(), region).toBe(200);
    for (const [from, to] of [['/p9', '/'], ['/p9/cs', '/cs'], ['/p9/cs?island=structures', '/cs?island=structures'], ['/p9/sys', '/sys']]) {
      const res = await page.request.get(from, { maxRedirects: 0 });
      expect([307, 308], from).toContain(res.status());
      const url = new URL(res.headers().location, 'http://x');
      expect(url.pathname + url.search, from).toBe(to);
    }
    await page.goto('/p9');
    await expect(page).toHaveURL(/:\d+\/$/);
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('a[href^="/p9"]')).toHaveCount(0);
    await expect(page.locator('a[data-region-entry]')).toHaveCount(5);
  });
  test('is the regions\' own scenes drawn small: every island, bridge and landmark of each region, all at one scale, and the world\'s links', async ({ page }) => {
    await openMap(page, '/');
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
    expect(cs.landmarks).toEqual(expect.arrayContaining(['foundations:Landmark_Lighthouse', 'foundations:Building_Workshop', 'foundations:Dock_Entry', 'structures:stack-tower', 'algorithms:research-tower', 'databases:storage-fortress', 'programming-languages:compiler-temple', 'networks:comms-tower', 'systems-analysis:design-studio', 'information-systems:archive']));
    // P9.3: every region is built: each island besides 基礎程式島 (GLB) stands its own landmarks, in the world as on its map.
    for (const region of world.regions.filter(r => r.id !== 'hub')) {
      expect(region.source, region.id).toBe('p9');
      for (const island of region.islands.filter(i => i !== 'foundations')) expect(region.landmarks.filter(l => l.startsWith(`${island}:`)).length, `${region.id} ${island}`).toBeGreaterThanOrEqual(3);
    }
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
  test('every region opens its map from the map and the guide; nothing leads to /world or /p9', async ({ page }) => {
    await openMap(page, '/');
    for (const id of REGIONS) {
      await expect(page.locator(`button[data-target="${id}"]`), id).toHaveCount(1);
      await expect(page.locator(`a[data-region-entry="${id}"]`), id).toHaveAttribute('href', `/${id}`);
    }
    expect(await page.locator('a[href^="/p9"]').count()).toBe(0);
    expect(await page.locator('a[href^="/world"]').count()).toBe(0);
    expect(await page.locator('a[href^="/trials"]').count()).toBe(0);
    // The guide's entry, by keyboard: the way in that needs no 3D.
    const entry = page.locator('a[data-region-entry="cs"]');
    await expect(entry).toHaveAttribute('href', '/cs');
    await entry.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/:\d+\/cs$/);
  });
  test('the map label opens the region', async ({ page }) => {
    await openMap(page, '/');
    await page.locator('button[data-target="cs"]').click();
    await expect(page).toHaveURL(/:\d+\/cs$/);
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('P9.1b prototype: one geography and one time of day on every level', () => {
  test.skip(!P9, 'needs a build with LOGIC_ISLAND_P9_PROTOTYPE=1');
  test('the world\'s CS region holds the islands the CS region page lists', async ({ page }) => {
    test.skip(phone(), 'the island list is open beside the map on wide screens');
    await openMap(page, '/');
    const cs = (await drawn(page)).regions.find(r => r.id === 'cs')!;
    await openMap(page, '/cs');
    await expect(page.locator('[data-island-choice]')).toHaveCount(8);
    const listed = await page.locator('[data-island-choice]').evaluateAll(list => list.map(e => e.getAttribute('data-island-choice')!));
    expect([...listed].sort()).toEqual([...cs.islands].sort());
  });
  test('the world draws each of the four times of day, with the site\'s time button', async ({ page }) => {
    await openMap(page, '/');
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
    await openMap(page, '/');
    await setTime(page, 'sunset');
    await page.locator('button[data-target="cs"]').click();
    await expect(page).toHaveURL(/:\d+\/cs$/);
    await expect(page.locator('[data-environment]')).toHaveAttribute('data-environment', 'sunset', { timeout: 30_000 });
    await expect(timeButton(page)).toHaveAttribute('aria-label', /^時間：黃昏/);
    await page.goto('/cs?island=foundations');
    await expect(page.locator('[data-environment]')).toHaveAttribute('data-environment', 'sunset', { timeout: 30_000 });
    // Changed on the island, it is the world's time too.
    await setTime(page, 'dusk');
    await expect(page.locator('[data-environment]')).toHaveAttribute('data-environment', 'dusk');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/:\d+\/cs$/);
    await expect(page.locator('[data-environment]')).toHaveAttribute('data-environment', 'dusk');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/:\d+\/$/);
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
    await openMap(page, '/cs');
    // No mist: a planned island is drawn as an island; that it is planned is said in words, on the map and in the list.
    await expect(page.locator('button[aria-label^="聚焦"]')).toHaveCount(8, { timeout: 30_000 });
    await expect(page.locator('button[aria-label$="（規劃中）"]')).toHaveCount(4);
    // The island list is open beside the map on wide screens (phones open it from the header).
    if (!phone()) {
      await expect(page.locator('[data-island-choice]')).toHaveCount(8);
      for (const id of PLANNED) await expect(page.locator(`[data-island-choice="${id}"]`), id).toContainText('規劃中');
    }
    // The explorer itself: the site header's own 開始學習 link is not part of the island.
    const explorer = page.locator('section[aria-label$="地圖"]');
    for (const id of PLANNED) {
      await page.goto(`/cs?island=${id}`);
      await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('尚未開放課程').first(), id).toBeVisible();
      await expect(explorer).toBeVisible();
      expect(await explorer.locator('a[href^="/curriculum/"]').count(), `${id} lesson links`).toBe(0);
      expect(await explorer.locator('a[href^="/learn/"]').count(), `${id} lab links`).toBe(0);
      await expect(page.locator('section[aria-label$="地點"]'), `${id} has no place to enter`).toHaveCount(0);
    }
  });
  test('the foundations island keeps its targets, lessons, address and the way back', async ({ page }) => {
    await openMap(page, '/cs?island=foundations');
    // The workshop, the lighthouse and the dock: the GLB's three targets, as HTML buttons too.
    const places = page.locator('section[aria-label="基礎程式島地點"]');
    await expect(places).toBeVisible({ timeout: 30_000 });
    for (const name of ['工坊', '燈塔', '碼頭']) await expect(places.getByRole('button', { name: new RegExp(name) }).or(places.getByRole('link', { name: new RegExp(name) })).first(), name).toBeVisible();
    // Its twenty lessons are linked, and every one of them exists.
    const lessons = await page.locator('section[aria-label$="地圖"] a[href^="/curriculum/"]').evaluateAll(list => [...new Set(list.map(a => a.getAttribute('href')!))]);
    expect(lessons.length).toBeGreaterThanOrEqual(4);
    for (const href of lessons) expect((await page.request.get(href)).status(), href).toBe(200);
    // Escape: island → region (the address drops the island, the focus goes to its entry) → the prototype's overview.
    await page.locator('canvas').first().focus().catch(() => {});
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/:\d+\/cs$/);
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.getAttribute('data-island-choice') ?? ''), { timeout: 5_000 }).toMatch(/聚焦基礎程式島|foundations/);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/:\d+\/$/);
    await page.goBack();
    await expect(page).toHaveURL(/:\d+\/cs$/);
    await page.goBack();
    await expect(page).toHaveURL(/:\d+\/cs\?island=foundations$/);
  });
  test('an unknown island is dropped from the address', async ({ page }) => {
    await openMap(page, '/cs?island=nowhere');
    await expect(page).toHaveURL(/:\d+\/cs$/);
  });
  test('phones: pins with a 44 px touch area, and the sheet leaves the map in view', async ({ page }) => {
    test.skip(!phone(), 'phone layout');
    await openMap(page, '/cs');
    const pins = page.locator('button[aria-label^="聚焦"]');
    await expect(pins).toHaveCount(8, { timeout: 30_000 });
    // The touch area is the pin's ::before (as on /world/<region>): at least 44 by 44 px.
    const areas = await pins.evaluateAll(list => list.map(b => { const s = getComputedStyle(b, '::before'); return [parseFloat(s.width), parseFloat(s.height)]; }));
    for (const [w, h] of areas) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }
    await page.goto('/cs?island=foundations');
    const sheet = page.locator('aside[aria-label="基礎程式島科目清單"]');
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    const canvas = (await page.locator('canvas').boundingBox())!, box = (await sheet.boundingBox())!;
    expect(Math.max(0, canvas.y + canvas.height - box.y) / canvas.height, 'the sheet covers at most 60% of the map').toBeLessThanOrEqual(.6);
  });
});

test.describe('P9.4 world zoom and pan', () => {
  test.skip(!P9, 'needs a build with LOGIC_ISLAND_P9_PROTOTYPE=1');
  const view = async (page: Page) => (await page.locator('[data-view]').getAttribute('data-view'))!.split(',').map(Number);
  test('wheel zooms, a drag pans and opens nothing, 重設視角 brings the whole world back, a click still opens a region', async ({ page, isMobile }) => {
    test.skip(isMobile, 'wheel and mouse drag: desktop');
    await openMap(page, '/');
    await expect(page.locator('[data-target="cs"]')).toBeVisible();
    const stage = (await page.locator('[data-view]').boundingBox())!;
    const at = [stage.x + stage.width * .35, stage.y + stage.height * .45] as const;
    await page.mouse.move(...at);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -120);
    await expect.poll(async () => (await view(page))[0]).toBeGreaterThan(1.3);
    await expect(page).toHaveURL(/:\d+\/$/);
    const before = await view(page);
    await page.mouse.move(...at); await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(at[0] + i * 15, at[1] + i * 6);
    await page.mouse.up();
    await expect.poll(async () => (await view(page))[1]).toBeGreaterThan(before[1] + 50);
    await page.waitForTimeout(500);
    await expect(page, 'a drag opens no region').toHaveURL(/:\d+\/$/);
    const reset = page.getByRole('button', { name: '重設視角' });
    await reset.click();
    await expect.poll(() => view(page)).toEqual([1, 0, 0]);
    await expect(reset).toBeDisabled();
    await expect(page.locator('[data-target]:visible')).toHaveCount(6);
    // The zoom buttons, then the label still opens its region.
    await page.getByRole('button', { name: '放大' }).click();
    await expect.poll(async () => (await view(page))[0]).toBeGreaterThan(1.3);
    await reset.click();
    await page.locator('[data-target="cs"]').click();
    await expect(page).toHaveURL(/:\d+\/cs$/);
  });
  test('phones: a pinch zooms the map, not the page; a one-finger drag pans; reset; the label opens its region', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch: phones');
    await openMap(page, '/');
    const stage = page.locator('[data-view]'), box = (await stage.boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await expect(stage).toHaveCSS('touch-action', 'none');
    const down = (id: number, x: number, y: number) => stage.dispatchEvent('pointerdown', { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, button: 0, buttons: 1 });
    const move = (type: string, id: number, x: number, y: number) => page.evaluate(([type, id, x, y]) => window.dispatchEvent(new PointerEvent(type as string, { pointerId: id as number, pointerType: 'touch', clientX: x as number, clientY: y as number })), [type, id, x, y] as const);
    const scroll = await page.evaluate(() => scrollY);
    await down(1, cx - 40, cy); await down(2, cx + 40, cy);
    for (let i = 1; i <= 8; i++) { await move('pointermove', 1, cx - 40 - i * 10, cy); await move('pointermove', 2, cx + 40 + i * 10, cy); }
    await move('pointerup', 1, cx - 120, cy); await move('pointerup', 2, cx + 120, cy);
    await expect.poll(async () => (await view(page))[0]).toBeGreaterThan(2);
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
    const pinched = await view(page);
    await down(3, cx, cy);
    for (let i = 1; i <= 6; i++) await move('pointermove', 3, cx + i * 12, cy + i * 8);
    await move('pointerup', 3, cx + 72, cy + 48);
    await expect.poll(async () => (await view(page))[1]).toBeGreaterThan(pinched[1] + 30);
    await expect(page).toHaveURL(/:\d+\/$/);
    await page.getByRole('button', { name: '重設視角' }).click();
    await expect.poll(() => view(page)).toEqual([1, 0, 0]);
    await page.locator('[data-target="cs"]').click();
    await expect(page).toHaveURL(/:\d+\/cs$/);
  });
});

test.describe('P9.5 world fly-to', () => {
  test.skip(!P9, 'needs a build with LOGIC_ISLAND_P9_PROTOTYPE=1');
  // The suite runs with reduced motion (playwright.config.ts); a flight needs motion, so these tests ask for it.
  test.use({ reducedMotion: 'no-preference' });
  const stage = (page: Page) => page.locator('[data-view]');
  const zoom = async (page: Page) => Number((await stage(page).getAttribute('data-view'))!.split(',')[0]);
  for (const region of REGIONS) {
    test(`clicking ${region} flies the camera toward it, then opens /${region}; Back returns to the world at rest`, async ({ page, isMobile }) => {
      test.skip(isMobile && region !== 'cs', 'one region is enough on phones');
      await openMap(page, '/');
      await expect(page.locator(`[data-target="${region}"]`)).toBeVisible();
      // Record the flight frame by frame in the page, so a fast machine cannot skip it.
      const frames = page.evaluate(() => new Promise<{ fly: string | null; k: number }[]>(done => {
        const list: { fly: string | null; k: number }[] = [], t0 = performance.now();
        const tick = () => { const w = document.querySelector('[data-view]'); if (w) list.push({ fly: w.getAttribute('data-fly'), k: Number(w.getAttribute('data-view')!.split(',')[0]) }); if (performance.now() - t0 < 1500 && location.pathname === '/') requestAnimationFrame(tick); else done(list); };
        tick();
      }));
      await page.locator(`[data-target="${region}"]`).click();
      await expect(page).toHaveURL(new RegExp(`:\\d+/${region}$`), { timeout: 10_000 });
      const flown = (await frames).filter(f => f.fly === 'flying');
      expect(flown.length, 'frames in flight').toBeGreaterThan(5);
      expect(flown.at(-1)!.k, 'the camera zoomed in on the way').toBeGreaterThan(flown[0].k + .5);
      await page.goBack();
      await expect(page).toHaveURL(/:\d+\/$/);
      await expect(stage(page)).toHaveAttribute('data-fly', 'idle');
      await expect.poll(() => zoom(page)).toBe(1);
    });
  }
  test('a second click while flying opens nothing else; a wheel during the flight cancels it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mouse: desktop');
    await openMap(page, '/');
    await page.locator('[data-target="cs"]').click();
    await expect(stage(page)).toHaveAttribute('data-fly', 'flying');
    await page.locator('[data-target="ai"]').click({ force: true });
    await expect(page).toHaveURL(/:\d+\/cs$/, { timeout: 10_000 });
    await page.goBack();
    await expect(stage(page)).toHaveAttribute('data-fly', 'idle');
    await page.locator('[data-target="cs"]').click();
    await expect(stage(page)).toHaveAttribute('data-fly', 'flying');
    const box = (await stage(page).boundingBox())!;
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.wheel(0, 120);
    await expect(stage(page)).toHaveAttribute('data-fly', 'idle');
    await page.waitForTimeout(1800);
    await expect(page, 'a cancelled flight opens nothing').toHaveURL(/:\d+\/$/);
  });
  test('reduced motion opens the region at once, without a flight', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await openMap(page, '/');
    await page.locator('[data-target="cs"]').click();
    await expect(page).toHaveURL(/:\d+\/cs$/, { timeout: 3_000 });
    await context.close();
  });
  test('phones: after a pinch and a drag, a tap on the label still flies to the region', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch: phones');
    await openMap(page, '/');
    const box = (await stage(page).boundingBox())!, cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const down = (id: number, x: number, y: number) => stage(page).dispatchEvent('pointerdown', { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, button: 0, buttons: 1 });
    const move = (type: string, id: number, x: number, y: number) => page.evaluate(([type, id, x, y]) => window.dispatchEvent(new PointerEvent(type as string, { pointerId: id as number, pointerType: 'touch', clientX: x as number, clientY: y as number })), [type, id, x, y] as const);
    // A gentle pinch (about 1.3×) and a short drag: the map is moved, its regions still on screen.
    await down(1, cx - 40, cy); await down(2, cx + 40, cy);
    for (let i = 1; i <= 4; i++) { await move('pointermove', 1, cx - 40 - i * 3, cy); await move('pointermove', 2, cx + 40 + i * 3, cy); }
    await move('pointerup', 1, cx - 52, cy); await move('pointerup', 2, cx + 52, cy);
    await down(3, cx, cy); for (let i = 1; i <= 4; i++) await move('pointermove', 3, cx + i * 4, cy + i * 2); await move('pointerup', 3, cx + 16, cy + 8);
    await expect.poll(() => zoom(page)).toBeGreaterThan(1.15);
    await expect(page).toHaveURL(/:\d+\/$/);
    // Whichever region is still on screen after the pinch and the drag (a label off the stage is hidden).
    const shown = page.locator(REGIONS.map(r => `[data-target="${r}"]:visible`).join(', ')).first();
    const region = (await shown.getAttribute('data-target'))!;
    await shown.click();
    await expect(page).toHaveURL(new RegExp(`:\\d+/${region}$`), { timeout: 10_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  });
});
