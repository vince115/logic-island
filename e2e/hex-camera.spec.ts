import { test as base, expect, type CDPSession, type Page } from '@playwright/test';

/*
 * D.3-5a free camera, on the lab page only (/islands/hex/scale/37): mouse drag turns and the wheel zooms; on touch
 * screens one finger turns left and right while up and down scrolls the page, and two fingers zoom; tilt and zoom
 * stay within limits; focusing keeps the azimuth and「返回全景」restores the default view. /islands/candidate keeps
 * the fixed camera. Touch is Chromium's emulation through CDP: it says nothing about iOS Safari (real device).
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
  const scrolled = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scrolled);
});
