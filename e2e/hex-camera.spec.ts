import { test as base, expect, type CDPSession, type Page } from '@playwright/test';
import { hexToWorld } from '@/lib/islands/hex';
import { tileTop } from '@/lib/islands/hex-terrain';
import { scalePrototypes } from '@/lib/islands/hex-scale-prototype';
import { instrument, type Entry } from '../perf/instrument.mjs';
import { expectListFallback, loseWebGLContext, modes } from './fallbacks';

/*
 * D.3-5a free camera, on the lab page only (/islands/hex/scale/37): mouse drag turns and the wheel zooms; on touch
 * screens one finger turns left and right while up and down scrolls the page, and two fingers zoom; tilt and zoom
 * stay within limits; focusing keeps the azimuth and「返回全景」restores the default view. /islands/candidate keeps
 * the fixed camera. Touch is Chromium's emulation through CDP: it says nothing about iOS Safari (real device).
 * D.3-5b adds Auto Orbit (「自動旋轉」, overview only) and every way it stops, at the end of this file.
 */
const LAB = '/islands/hex/scale/37';
const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'Console 與未捕捉錯誤').toEqual([]);
  }, { auto: true }],
});
type Camera = { azimuth: number; elevation: number; zoom: number; minZoom: number; maxZoom: number; distance: number; touchAction: string | null };
const label = (page: Page, name: string) => page.getByRole('button', { name: `聚焦${name}`, exact: true });
const back = (page: Page) => page.getByRole('button', { name: '返回全景' });
const focused = (page: Page) => page.locator('[data-focused="true"]');
const camera = (page: Page) => page.evaluate(() => (document.querySelector('canvas') as unknown as { __hexCamera: () => Camera }).__hexCamera());
/** Azimuth difference in degrees, wrapped to ±180. */
const turn = (a: number, b: number) => ((a - b + 540) % 360) - 180;
const phone = () => test.info().project.name.startsWith('mobile');

/** Waits until the camera stops moving (two equal readings 250 ms apart) and returns it. */
async function settled(page: Page) {
  let last = '';
  await expect.poll(async () => {
    const now = JSON.stringify(await camera(page));
    const same = now === last;
    last = now;
    return same;
  }, { intervals: [250], timeout: 15_000 }).toBe(true);
  return JSON.parse(last) as Camera;
}
async function open(page: Page) {
  await page.goto(LAB);
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 20_000 });
  await page.locator('canvas').scrollIntoViewIfNeeded();
  return settled(page);
}
/** The canvas center, in page coordinates. */
async function middle(page: Page) {
  const box = (await page.locator('canvas').boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function mouseDrag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) await page.mouse.move(from.x + dx * i / 15, from.y + dy * i / 15);
  await page.mouse.up();
}
/** One finger (or two, spreading apart by `spread` px each) moving across the screen through CDP touch events. */
async function touch(cdp: CDPSession, from: { x: number; y: number }, dx: number, dy: number, spread = 0) {
  const at = (t: number) => spread
    ? [{ x: from.x - 60 - spread * t, y: from.y, id: 1 }, { x: from.x + 60 + spread * t, y: from.y, id: 2 }]
    : [{ x: from.x + dx * t, y: from.y + dy * t, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let i = 1; i <= 20; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i / 20) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** Turns the map by a horizontal drag (mouse on desktop, one finger on phones) and returns the settled camera. */
async function turnMap(page: Page, dx = 160) {
  const from = await middle(page);
  if (phone()) await touch(await page.context().newCDPSession(page), from, dx, 0);
  else await mouseDrag(page, from, dx, 0);
  return settled(page);
}
/**
 * Renders the map once and compares its pixels (the canvas only, no HTML overlays) with the first call's: the number
 * of pixels that differ, 0 on the first call.
 */
const differing = (page: Page) => page.evaluate(() => {
  const canvas = document.querySelector('canvas') as HTMLCanvasElement & { __hexPerf: () => unknown };
  canvas.__hexPerf();
  const gl = canvas.getContext('webgl2')!, px = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const store = window as unknown as { __firstPixels?: Uint8Array };
  const first = store.__firstPixels ??= px;
  let n = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] !== first[i] || px[i + 1] !== first[i + 1] || px[i + 2] !== first[i + 2]) n++;
  return n;
});
/** Which way each overview label hangs, by island (a label hidden while its island was focused comes back last). */
const sides = (page: Page) => page.locator('button[aria-label^="聚焦"][data-side]').evaluateAll(list => list.map(b => `${b.getAttribute('aria-label')}:${b.getAttribute('data-side')}`).sort());

test('D.3-5a：預設全景沿用原本的視角與構圖，地圖區保留垂直捲頁', async ({ page }) => {
  const start = await open(page);
  expect(start.azimuth).toBeCloseTo(33.69, 2);
  expect(start.elevation).toBeCloseTo(36.06, 2);
  expect(start.distance).toBeCloseTo(40, 6);
  expect(start.zoom).toBeGreaterThan(start.minZoom);
  expect(start.zoom).toBeLessThan(start.maxZoom);
  expect(start.maxZoom).toBeLessThanOrEqual(150);
  // camera-controls writes `touch-action: none` on the element it listens on; the free camera puts pan-y back, there
  // and on the canvas, so the browser still scrolls the page for vertical moves.
  expect(start.touchAction).toBe('pan-y');
  expect(await page.locator('canvas').evaluate(c => getComputedStyle(c).touchAction)).toBe('pan-y');
  await expect(back(page)).toBeDisabled();
  await expect(page.getByText('拖曳旋轉 · 滾輪或雙指縮放 · 點擊名牌聚焦')).toBeVisible();
});

test('D.3-5a：滑鼠拖曳旋轉，不會聚焦或離開頁面；從名牌開始拖曳也不會，單純點擊名牌仍可聚焦', async ({ page }) => {
  test.skip(phone(), '滑鼠操作');
  const start = await open(page);
  const url = page.url();
  await mouseDrag(page, await middle(page), 200, 0);
  const turned = await settled(page);
  expect(Math.abs(turn(turned.azimuth, start.azimuth))).toBeGreaterThan(20);
  expect(turned.elevation).toBeCloseTo(start.elevation, 2);
  await expect(focused(page)).toHaveCount(0);
  expect(page.url()).toBe(url);
  await expect(back(page)).toBeEnabled();
  // Pressing on a label and dragging turns the map; releasing on the label does not focus its island.
  const box = (await label(page, '資料結構島').boundingBox())!;
  await mouseDrag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 120, 0);
  const again = await settled(page);
  expect(Math.abs(turn(again.azimuth, turned.azimuth))).toBeGreaterThan(10);
  await expect(focused(page)).toHaveCount(0);
  await label(page, '資料結構島').click();
  await expect(focused(page)).toHaveCount(1);
  await expect(label(page, '資料結構島')).toHaveCount(0);
});

test('D.3-5a：滾輪縮放與俯仰都停在上下限，滾輪不捲動頁面，低角度拉遠時畫面邊緣不露底色', async ({ page }) => {
  test.skip(phone(), '滑鼠與滾輪');
  const start = await open(page);
  const center = await middle(page);
  const scrolled = await page.evaluate(() => scrollY);
  await page.mouse.move(center.x, center.y);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -400);
  expect((await settled(page)).zoom).toBeCloseTo(start.maxZoom, 3);
  for (let i = 0; i < 24; i++) await page.mouse.wheel(0, 400);
  expect((await settled(page)).zoom).toBeCloseTo(start.minZoom, 3);
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);
  // Tilt both ways past the limits: the camera stays 28°–60° above the water.
  await mouseDrag(page, center, 0, 260);
  expect((await settled(page)).elevation).toBeCloseTo(60, 3);
  await mouseDrag(page, center, 0, -260);
  const low = await settled(page);
  expect(low.elevation).toBeCloseTo(28, 3);
  // Lowest and furthest out: the camera backs off so the sea still reaches the bottom edge (no background colour there).
  expect(low.distance).toBeGreaterThan(40);
  const background = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement & { __hexPerf: () => unknown };
    canvas.__hexPerf();
    const gl = canvas.getContext('webgl2')!, rows = 4, px = new Uint8Array(canvas.width * rows * 4);
    const count = (y: number) => {
      gl.readPixels(0, y, canvas.width, rows, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - 0xcb) < 3 && Math.abs(px[i + 1] - 0xe9) < 3 && Math.abs(px[i + 2] - 0xf4) < 3) n++;
      return n;
    };
    return { bottom: count(0), top: count(canvas.height - rows) };
  });
  expect(background).toEqual({ bottom: 0, top: 0 });
  await expect(back(page)).toBeEnabled();
});

test('D.3-5a：旋轉後點名牌聚焦並保留方位，返回全景恢復預設視角與原本畫面', async ({ page }) => {
  const start = await open(page);
  expect(await differing(page)).toBe(0);
  const startSides = await sides(page);
  const turned = await turnMap(page);
  expect(Math.abs(turn(turned.azimuth, start.azimuth))).toBeGreaterThan(10);
  // The labels hang outward for the new view once it settles.
  await expect.poll(() => sides(page)).not.toEqual(startSides);
  if (phone()) await label(page, '基礎程式島').tap(); else await label(page, '基礎程式島').click();
  await expect(page.locator('span[data-anchor="Anchor_Workshop"]')).toBeVisible();
  const focus = await settled(page);
  expect(turn(focus.azimuth, turned.azimuth)).toBeCloseTo(0, 1);
  expect(focus.elevation).toBeCloseTo(start.elevation, 2);
  await back(page).click();
  await expect(focused(page)).toHaveCount(0);
  const home = await settled(page);
  expect(home.azimuth).toBeCloseTo(start.azimuth, 3);
  expect(home.elevation).toBeCloseTo(start.elevation, 3);
  expect(home.zoom).toBeCloseTo(start.zoom, 3);
  expect(await differing(page)).toBe(0);
  await expect.poll(() => sides(page)).toEqual(startSides);
  await expect(back(page)).toBeDisabled();
});

test('D.3-5a：只在全景旋轉後也能用返回全景（鍵盤）恢復；鍵盤 Enter 聚焦名牌不受拖曳判斷影響', async ({ page }) => {
  test.skip(phone(), '鍵盤');
  const start = await open(page);
  // A drag that starts on the label, then the keyboard: Enter on the same label still focuses it.
  const box = (await label(page, '演算法島').boundingBox())!;
  await mouseDrag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 140, 0);
  await settled(page);
  await back(page).focus();
  await page.keyboard.press('Enter');
  const home = await settled(page);
  expect(home.azimuth).toBeCloseTo(start.azimuth, 3);
  await expect(back(page)).toBeDisabled();
  await label(page, '演算法島').focus();
  await page.keyboard.press('Enter');
  await expect(focused(page)).toHaveCount(1);
});

test('D.3-5a：視窗尺寸改變時保留目前方位角', async ({ page }) => {
  await open(page);
  const turned = await turnMap(page);
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width - 60, height: size.height - 80 });
  await page.locator('canvas').scrollIntoViewIfNeeded();
  const resized = await settled(page);
  expect(turn(resized.azimuth, turned.azimuth)).toBeCloseTo(0, 2);
  expect(resized.elevation).toBeCloseTo(turned.elevation, 2);
});

test('D.3-5a：觸控（Chromium 模擬）水平滑動旋轉、垂直滑動捲頁、雙指縮放，仰角固定，短按名牌仍可聚焦', async ({ page }) => {
  test.skip(!phone(), '需要觸控');
  const start = await open(page);
  const cdp = await page.context().newCDPSession(page);
  const from = await middle(page);
  const scrolled = await page.evaluate(() => scrollY);
  await touch(cdp, from, 160, 0);
  const turned = await settled(page);
  expect(Math.abs(turn(turned.azimuth, start.azimuth))).toBeGreaterThan(10);
  expect(turned.elevation).toBeCloseTo(start.elevation, 3);
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);
  // Mostly sideways with some vertical movement: still only the azimuth changes.
  await touch(cdp, from, -140, 50);
  const slanted = await settled(page);
  expect(slanted.elevation).toBeCloseTo(start.elevation, 3);
  // Up and down scrolls the page (the browser takes the gesture: pan-y) and leaves the camera alone.
  const before = await page.evaluate(() => scrollY);
  await touch(cdp, from, 0, -200);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 50);
  const after = await settled(page);
  expect(after.azimuth).toBeCloseTo(slanted.azimuth, 3);
  expect(after.elevation).toBeCloseTo(start.elevation, 3);
  // Two fingers spreading apart zoom in, without scrolling.
  await page.locator('canvas').scrollIntoViewIfNeeded();
  const pinchFrom = await middle(page), held = await page.evaluate(() => scrollY);
  await touch(cdp, pinchFrom, 0, 0, 80);
  const zoomed = await settled(page);
  expect(zoomed.zoom).toBeGreaterThan(after.zoom * 1.05);
  expect(zoomed.zoom).toBeLessThanOrEqual(zoomed.maxZoom + 1e-6);
  expect(await page.evaluate(() => scrollY)).toBe(held);
  await label(page, '資料結構島').tap();
  await expect(focused(page)).toHaveCount(1);
});

test('D.3-5a：實驗室頁在 360／390 px 沒有水平溢出', async ({ page }) => {
  test.skip(!phone(), '窄螢幕');
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 780 });
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}px`).toBeLessThanOrEqual(0);
  }
});

test('D.3-5a：候選頁維持固定相機（拖曳不改畫面、滾輪照常捲頁、地圖區不允許觸控捲頁）', async ({ page }) => {
  test.skip(phone(), '滑鼠與滾輪');
  await page.goto('/islands/candidate');
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 20_000 });
  await page.locator('canvas').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const canvas = page.locator('canvas');
  expect(await canvas.evaluate(c => [getComputedStyle(c).touchAction, (c.parentElement!.parentElement as HTMLElement).style.touchAction]))
    .toEqual(['none', 'none']);
  await expect(page.locator('[data-camera]')).toHaveCount(0);
  const shot = await canvas.screenshot();
  await mouseDrag(page, await middle(page), 200, 60);
  await page.waitForTimeout(1000);
  expect((await canvas.screenshot()).equals(shot)).toBe(true);
  await expect(back(page)).toBeDisabled();
  // D.3-5b: no Auto Orbit either.
  await expect(page.getByRole('button', { name: '自動旋轉' })).toHaveCount(0);
  const scrolled = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scrolled);
});

// D.3-5b Auto Orbit.
const orbitToggle = (page: Page) => page.getByRole('button', { name: '自動旋轉', exact: true });
/** Turns Auto Orbit on (keyboard on desktop, a tap on phones) and waits until the camera has turned a little. */
async function startOrbit(page: Page) {
  const before = await camera(page);
  if (phone()) await orbitToggle(page).tap();
  else { await orbitToggle(page).focus(); await page.keyboard.press('Enter'); }
  await expect(orbitToggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => Math.abs(turn((await camera(page)).azimuth, before.azimuth)), { timeout: 5_000 }).toBeGreaterThan(1);
}
/** Auto Orbit is off and stays off: the toggle (if offered) is not pressed, and the camera stops and stays put. */
async function expectStopped(page: Page) {
  const pressed = async () => (await orbitToggle(page).count()) ? orbitToggle(page).getAttribute('aria-pressed') : 'false';
  await expect.poll(pressed).toBe('false');
  const still = await settled(page);
  await page.waitForTimeout(1200);
  const later = await camera(page);
  expect(later.azimuth).toBeCloseTo(still.azimuth, 6);
  expect(await pressed()).toBe('false');
  return later;
}

test('D.3-5b：自動旋轉預設關閉（含 reduced motion），可用鍵盤開關，約每秒 6° 且保持仰角與縮放，只在全景提供', async ({ page }) => {
  for (const reducedMotion of ['reduce', 'no-preference'] as const) {
    await page.emulateMedia({ reducedMotion });
    const start = await open(page);
    await expect(orbitToggle(page)).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(1000);
    expect((await camera(page)).azimuth, reducedMotion).toBeCloseTo(start.azimuth, 6);
  }
  // Reduced motion (the suite's default): the user may still turn it on.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const start = await open(page);
  await startOrbit(page);
  const [a, t0] = [await camera(page), await page.evaluate(() => performance.now())];
  await page.waitForTimeout(2000);
  const [b, t1] = [await camera(page), await page.evaluate(() => performance.now())];
  const rate = Math.abs(turn(b.azimuth, a.azimuth)) / ((t1 - t0) / 1000);
  expect(rate).toBeGreaterThan(3);
  expect(rate).toBeLessThan(9);
  expect(b.elevation).toBeCloseTo(start.elevation, 3);
  expect(b.zoom).toBeCloseTo(start.zoom, 6);
  await expect(back(page)).toBeEnabled();
  if (phone()) await orbitToggle(page).tap(); else await page.keyboard.press('Space');
  await expectStopped(page);
  // Only in the overview: focusing an island takes the toggle away; back in the overview it is off.
  await page.getByRole('group', { name: '選擇學習島嶼' }).getByRole('button', { name: /基礎程式島/ }).click();
  await expect(focused(page)).toHaveCount(1);
  await expect(orbitToggle(page)).toHaveCount(0);
  await back(page).click();
  await expect(orbitToggle(page)).toHaveAttribute('aria-pressed', 'false');
});

test('D.3-5b：拖曳與滾輪立即停止，停止後不自動恢復', async ({ page }) => {
  test.skip(phone(), '滑鼠與滾輪');
  await open(page);
  await startOrbit(page);
  await mouseDrag(page, await middle(page), 40, 0);
  await expectStopped(page);
  await startOrbit(page);
  const before = await camera(page);
  await page.mouse.move((await middle(page)).x, (await middle(page)).y);
  await page.mouse.wheel(0, -300);
  const after = await expectStopped(page);
  expect(after.zoom).toBeGreaterThan(before.zoom);
});

test('D.3-5b：單指滑動與雙指縮放立即停止（Chromium 觸控模擬）', async ({ page }) => {
  test.skip(!phone(), '需要觸控');
  await open(page);
  const cdp = await page.context().newCDPSession(page);
  await startOrbit(page);
  await touch(cdp, await middle(page), 60, 0);
  await expectStopped(page);
  await startOrbit(page);
  await touch(cdp, await middle(page), 0, 0, 40);
  await expectStopped(page);
});

test('D.3-5b：旋轉中點名牌或點島嶼會停止，並聚焦點到的那座島', async ({ page }) => {
  await open(page);
  await startOrbit(page);
  // Pressed where the label is now, as a person would (Playwright's click waits for a moving element to stop).
  const box = (await label(page, '資料結構島').boundingBox())!;
  if (phone()) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(focused(page).getByText('資料結構島', { exact: true })).toBeVisible();
  await expect(orbitToggle(page)).toHaveCount(0);
  await back(page).click();
  await expect(orbitToggle(page)).toHaveAttribute('aria-pressed', 'false');
  await settled(page);
  // On the map itself: the basics island's center tile, located while the map turns; pressing stops the turn first.
  await startOrbit(page);
  const { world } = scalePrototypes['37'];
  const basics = world.settlements.find(s => s.islandId === 'foundations')!;
  const tile = basics.tiles.find(t => t.q === basics.center.q && t.r === basics.center.r) ?? basics.tiles[0];
  const [x, z] = hexToWorld(tile, world.size);
  const point = await page.evaluate(([x, y, z]) => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement & { __hexProject: (x: number, y: number, z: number) => number[] };
    const box = canvas.getBoundingClientRect(), [px, py] = canvas.__hexProject(x, y, z);
    return { x: px + box.left, y: py + box.top };
  }, [x, tileTop(tile), z]);
  if (phone()) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  await expect(focused(page).getByText('基礎程式島', { exact: true })).toBeVisible();
  await expect(orbitToggle(page)).toHaveCount(0);
});

test('D.3-5b：分頁隱藏、切換清單模式、返回全景都會停止；返回全景同時重設視角', async ({ page }) => {
  const start = await open(page);
  await startOrbit(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expectStopped(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await startOrbit(page);
  await back(page).click();
  const home = await expectStopped(page);
  expect(home.azimuth).toBeCloseTo(start.azimuth, 3);
  expect(home.elevation).toBeCloseTo(start.elevation, 3);
  await startOrbit(page);
  await modes(page).getByRole('button', { name: '清單' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await modes(page).getByRole('button', { name: '3D 群島' }).click();
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 20_000 });
  await page.locator('canvas').scrollIntoViewIfNeeded();
  const again = await expectStopped(page);
  expect(again.azimuth).toBeCloseTo(start.azimuth, 3);
});

test('D.3-5b：自動旋轉與鏡頭飛行不互搶：飛行途中開啟會等降落才轉，旋轉中聚焦由飛行接手', async ({ page }) => {
  // Animated flights (the suite otherwise runs with reduced motion, where flights are instant).
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const start = await open(page);
  // Turn the overview well away from the default, so the flight home has a long way to turn.
  await turnMap(page, 150);
  // Press「返回全景」and, while that flight is still on its way, 自動旋轉; then note when the azimuth first gets
  // within 1° of home. Turning with no transition right away would snap it there on the next frame.
  const home = await page.evaluate((home) => new Promise<number>(resolve => {
    const canvas = document.querySelector('canvas') as unknown as { __hexCamera: () => { azimuth: number } };
    const buttons = [...document.querySelectorAll('button')];
    buttons.find(b => b.textContent?.includes('返回全景'))!.click();
    buttons.find(b => b.textContent?.includes('自動旋轉'))!.click();
    const t0 = performance.now();
    const tick = () => {
      const off = Math.abs(((canvas.__hexCamera().azimuth - home + 540) % 360) - 180);
      if (off < 1 || performance.now() - t0 > 5000) resolve(performance.now() - t0); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), start.azimuth);
  // The flight eases home as it does on its own (P1-28: its first frame after idle already covers a large part).
  expect(home, '到達預設方位的時間（ms）').toBeGreaterThan(300);
  await expect(orbitToggle(page)).toHaveAttribute('aria-pressed', 'true');
  // It lands exactly on the overview (tilt, zoom), then turns.
  await expect.poll(async () => Math.abs(turn((await camera(page)).azimuth, start.azimuth)), { timeout: 8_000 }).toBeGreaterThan(1);
  const landed = await camera(page);
  expect(landed.elevation).toBeCloseTo(start.elevation, 3);
  expect(landed.zoom).toBeCloseTo(start.zoom, 3);
  const a = await camera(page);
  await page.waitForTimeout(1000);
  expect(Math.abs(turn((await camera(page)).azimuth, a.azimuth))).toBeGreaterThan(2);
  // Focusing while it turns: the orbit stops and the focus flight lands and stays.
  await page.getByRole('group', { name: '選擇學習島嶼' }).getByRole('button', { name: /基礎程式島/ }).click();
  await expect(focused(page).getByText('基礎程式島', { exact: true })).toBeVisible();
  const focus = await expectStopped(page);
  expect(focus.elevation).toBeCloseTo(start.elevation, 3);
});

base('D.3-5b：環繞中 WebGL context 遺失時停止並改為清單導航', async ({ page }) => {
  await open(page);
  await startOrbit(page);
  await loseWebGLContext(page);
  await expectListFallback(page, { bfs: false });
  await expect(orbitToggle(page)).toHaveCount(0);
});

test('D.3-5b：環繞時持續重畫但不重畫陰影；停止後閒置重畫為 0', async ({ page }) => {
  await page.addInitScript(instrument);
  await open(page);
  const frames = () => page.evaluate(() => (window as unknown as { __perfEntries: Entry[] }).__perfEntries.slice());
  await startOrbit(page);
  const before = await frames();
  await page.waitForTimeout(1500);
  const during = await frames();
  expect(during.length - before.length).toBeGreaterThan(15);
  expect(during.at(-1)!.offscreen - before.at(-1)!.offscreen, '陰影 pass').toBe(0);
  if (phone()) await orbitToggle(page).tap(); else await orbitToggle(page).click();
  await expectStopped(page);
  const idle = (await frames()).length;
  await page.waitForTimeout(2000);
  expect((await frames()).length - idle, '停止後的重畫').toBe(0);
});

test('D.3-5b：自動旋轉與返回全景並排在地圖內，桌機與 360／390 px 都不溢出', async ({ page }) => {
  for (const width of phone() ? [360, 390] : [0]) {
    if (width) await page.setViewportSize({ width, height: 780 });
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width || 'desktop'}`).toBeLessThanOrEqual(0);
    const stage = (await page.locator('canvas').boundingBox())!;
    const toggle = (await orbitToggle(page).boundingBox())!, reset = (await back(page).boundingBox())!;
    for (const box of [toggle, reset]) {
      expect(box.x).toBeGreaterThanOrEqual(stage.x);
      expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width + .5);
      expect(box.y + box.height).toBeLessThanOrEqual(stage.y + stage.height + .5);
    }
    // Side by side, not overlapping.
    expect(Math.abs(toggle.y - reset.y)).toBeLessThan(2);
    expect(toggle.x + toggle.width).toBeLessThanOrEqual(reset.x);
  }
});
