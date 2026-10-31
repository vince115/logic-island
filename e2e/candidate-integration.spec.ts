import { test as base, expect, type CDPSession, type Page } from '@playwright/test';
import { ENVIRONMENTS, type EnvironmentId } from '@/lib/islands/environments';
import { instrument, type Entry } from '../perf/instrument.mjs';
import { chooseIsland, expectListFallback, loseWebGLContext, modes, withoutWebGL } from './fallbacks';

/*
 * D.3-5c/D.3-6d candidate integration: /islands/candidate takes the lab's free camera, Auto Orbit and four times of
 * day (the same components, through the production preset). The candidate never loads the measurement probe, so the
 * camera is read from what a visitor sees: where the island labels sit, the canvas pixels and, for redraws, the WebGL
 * draw counter (perf/instrument.mjs). The lab specs (hex-camera, hex-environment) cover the camera and environment in
 * depth; these check that the candidate gets the same behaviour, plus its own layout. Chromium only: touch is CDP
 * emulation, nothing here speaks for iOS Safari (D.3-4B).
 */
const CANDIDATE = '/islands/candidate';
const ISLANDS = ['基礎程式島', '資料結構島', '演算法島'];
const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'Console 與未捕捉錯誤').toEqual([]);
  }, { auto: true }],
});
const phone = () => test.info().project.name.startsWith('mobile');
const label = (page: Page, name: string) => page.getByRole('button', { name: `聚焦${name}`, exact: true });
const back = (page: Page) => page.getByRole('button', { name: '返回全景' });
const orbit = (page: Page) => page.getByRole('button', { name: '自動旋轉', exact: true });
const select = (page: Page) => page.getByRole('combobox', { name: '時間情境' });
const focused = (page: Page) => page.locator('[data-focused="true"]');
/** The toolbar's caption: the focused island, or 群島全景. */
const toolbarName = (page: Page) => modes(page).evaluate(group => group.closest('section')!.firstElementChild!.firstElementChild!.querySelector('span')!.textContent);
const frames = (page: Page) => page.evaluate(() => (window as unknown as { __perfEntries: Entry[] }).__perfEntries.slice());
type Pins = Record<string, [number, number]>;

/** Where each visible overview label sits on the map (the camera, as a visitor sees it), relative to the canvas. */
const pins = (page: Page) => page.locator('main button[aria-label^="聚焦"]').evaluateAll(list => {
  const map = document.querySelector('canvas')!.getBoundingClientRect();
  return Object.fromEntries(list.map(b => { const r = b.getBoundingClientRect(); return [b.getAttribute('aria-label')!.slice(2), [r.x + r.width / 2 - map.x, r.y + r.height / 2 - map.y]]; }));
}) as Promise<Pins>;
/** The largest move of any label between two readings, in px. */
const moved = (a: Pins, b: Pins) => Math.max(...Object.keys(a).filter(k => b[k]).map(k => Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1])));
/** How far apart the labels are (grows when zooming in). */
const spread = (p: Pins) => { const v = Object.values(p); return v.reduce((s, a) => s + v.reduce((t, b) => t + Math.hypot(a[0] - b[0], a[1] - b[1]), 0), 0); };
/** Waits until the labels stop moving (two equal readings 250 ms apart) and returns them. */
async function still(page: Page) {
  let last: Pins | null = null;
  await expect.poll(async () => { const now = await pins(page), same = last !== null && moved(last, now) < .5; last = now; return same; },
    { intervals: [250], timeout: 15_000 }).toBe(true);
  return last!;
}
async function open(page: Page) {
  await page.goto(CANDIDATE);
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 30_000 });
  await page.locator('canvas').scrollIntoViewIfNeeded();
  return still(page);
}
const middle = async (page: Page) => { const b = (await page.locator('canvas').boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
async function mouseDrag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) await page.mouse.move(from.x + dx * i / 15, from.y + dy * i / 15);
  await page.mouse.up();
}
/** One finger (or two, spreading apart by `spread` px each) moving across the screen through CDP touch events. */
async function touch(cdp: CDPSession, from: { x: number; y: number }, dx: number, dy: number, apart = 0) {
  const at = (t: number) => apart
    ? [{ x: from.x - 60 - apart * t, y: from.y, id: 1 }, { x: from.x + 60 + apart * t, y: from.y, id: 2 }]
    : [{ x: from.x + dx * t, y: from.y + dy * t, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let i = 1; i <= 20; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i / 20) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** Turns the map by a horizontal drag (mouse on desktop, one finger on phones). */
async function turnMap(page: Page, dx = 160) {
  const from = await middle(page);
  if (phone()) await touch(await page.context().newCDPSession(page), from, dx, 0);
  else await mouseDrag(page, from, dx, 0);
}
/** Zooms in (wheel on desktop, two fingers spreading on phones). */
async function zoomIn(page: Page, steps = 3) {
  const from = await middle(page);
  if (phone()) await touch(await page.context().newCDPSession(page), from, 0, 0, 20 * steps);
  else { await page.mouse.move(from.x, from.y); for (let i = 0; i < steps; i++) await page.mouse.wheel(0, -300); }
}
const press = async (page: Page, target: ReturnType<typeof orbit>) => { if (phone()) await target.tap(); else await target.click(); };
/**
 * The 3D picture alone: the canvas with every HTML overlay on the map hidden for the shot (labels, caption, the bottom
 * bar with its focus rings, hover-lit labels), so only what WebGL drew is compared.
 */
async function mapShot(page: Page) {
  const style = await page.addStyleTag({ content: '[data-environment] *{visibility:hidden!important}[data-environment] canvas{visibility:visible!important}' });
  // Only the canvas's own whole pixels: it sits at a fractional y, and an element shot also takes in one row of whatever
  // lies below it (the page background or, since D.3-7a, the button row's border on phones, depending on the scroll).
  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const b = (await canvas.boundingBox())!, x = Math.ceil(b.x), y = Math.ceil(b.y);
  const shot = await page.screenshot({ clip: { x, y, width: Math.floor(b.x + b.width) - x, height: Math.floor(b.y + b.height) - y } });
  await style.evaluate(node => (node as Element).remove());
  // Under reduced motion the site gives every change a 0.01 ms transition, so the canvas is shown again a frame later;
  // until then a touch on the map would land on its wrapper instead.
  await expect.poll(() => page.locator('canvas').evaluate(c => getComputedStyle(c).visibility)).toBe('visible');
  return shot;
}
/** The caption row above the map (single-column screens only). */
const captionAbove = (page: Page) => page.locator('[class*="stageCaptionAbove"]');

test('候選頁（D.3-5c）：自由相機上線，預設全景不變、載入後不跳動；地圖區保留垂直捲頁；時間預設中午', async ({ page }) => {
  await page.goto(CANDIDATE);
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 30_000 });
  const first = await pins(page);
  await page.waitForTimeout(1500);
  expect(moved(first, await pins(page)), '載入後的相機跳動（px）').toBeLessThan(.5);
  await expect(page.locator('[data-camera="free"]')).toHaveCount(1);
  expect(await page.locator('canvas').evaluate(c => getComputedStyle(c).touchAction)).toBe('pan-y');
  await expect(back(page)).toBeDisabled();
  await expect(orbit(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(select(page)).toHaveValue('noon');
  await expect(select(page).locator('option')).toHaveText(['清晨', '中午', '黃昏', '傍晚']);
  await expect(page.getByText('拖曳旋轉 · 滾輪或雙指縮放 · 點擊島嶼或名牌探索')).toBeVisible();
  // Still the production preset: no measurement probe.
  expect(await page.locator('canvas').evaluate(canvas => '__hexPerf' in canvas || '__hexCamera' in canvas)).toBe(false);
});

test('候選頁（D.3-5c）：滑鼠拖曳旋轉 360°（不聚焦、從名牌拖曳也不聚焦）、滾輪縮放不捲頁，點名牌仍可聚焦', async ({ page }) => {
  test.skip(phone(), '滑鼠與滾輪');
  // Five full drags, each waited out until the labels stop.
  test.setTimeout(60_000);
  const start = await open(page);
  await mouseDrag(page, await middle(page), 200, 0);
  const turned = await still(page);
  expect(moved(start, turned)).toBeGreaterThan(20);
  await expect(focused(page)).toHaveCount(0);
  await expect(back(page)).toBeEnabled();
  // All the way round: many drags in one direction never hit a stop.
  let last = turned;
  for (let i = 0; i < 4; i++) {
    await mouseDrag(page, await middle(page), 300, 0);
    const next = await still(page);
    expect(moved(last, next), `第 ${i + 1} 次`).toBeGreaterThan(5);
    last = next;
  }
  // From a label, past 6 px: turns, no focus.
  const box = (await label(page, '資料結構島').boundingBox())!;
  await mouseDrag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 120, 0);
  expect(moved(last, await still(page))).toBeGreaterThan(5);
  await expect(focused(page)).toHaveCount(0);
  // A plain click still focuses.
  await label(page, '資料結構島').click();
  await expect(focused(page)).toHaveCount(1);
  await expect.poll(() => toolbarName(page)).toBe('資料結構島');
  await back(page).click();
  // The wheel zooms the map and leaves the page where it is.
  const scrolled = await page.evaluate(() => scrollY), before = await still(page);
  await zoomIn(page);
  const zoomed = await still(page);
  expect(spread(zoomed)).toBeGreaterThan(spread(before) * 1.05);
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);
});

test('候選頁（D.3-5c）：觸控單指水平旋轉、垂直捲頁、雙指縮放，短按名牌聚焦（Chromium 模擬）', async ({ page }) => {
  test.skip(!phone(), '觸控');
  const start = await open(page);
  const cdp = await page.context().newCDPSession(page);
  await touch(cdp, await middle(page), 140, 0);
  const turned = await still(page);
  expect(moved(start, turned)).toBeGreaterThan(15);
  const scrolled = await page.evaluate(() => scrollY);
  await touch(cdp, await middle(page), 0, -160);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scrolled + 40);
  await page.locator('canvas').scrollIntoViewIfNeeded();
  const before = await still(page);
  await touch(cdp, await middle(page), 0, 0, 60);
  expect(spread(await still(page))).toBeGreaterThan(spread(before) * 1.05);
  await label(page, '演算法島').tap();
  await expect.poll(() => toolbarName(page)).toBe('演算法島');
});

test('候選頁（D.3-5c）：旋轉後聚焦保留目前方位、聚焦後仍可旋轉；返回全景回到原本的中午畫面', async ({ page }) => {
  const start = await open(page);
  const home = await mapShot(page);
  // Focus from the default view, as a reference.
  await press(page, label(page, '基礎程式島'));
  await expect.poll(() => toolbarName(page)).toBe('基礎程式島');
  await page.waitForTimeout(800);
  const straight = await mapShot(page);
  await press(page, back(page));
  expect(moved(start, await still(page))).toBeLessThan(.5);
  // Turned first: the flight keeps that azimuth, so the focused view differs from the straight one.
  await turnMap(page, 160);
  await still(page);
  await press(page, label(page, '基礎程式島'));
  await expect.poll(() => toolbarName(page)).toBe('基礎程式島');
  await page.waitForTimeout(800);
  const kept = await mapShot(page);
  expect(kept.equals(straight)).toBe(false);
  // After the flight the map still turns.
  await turnMap(page, 120);
  await page.waitForTimeout(1200);
  expect((await mapShot(page)).equals(kept)).toBe(false);
  // 返回全景: back to the default overview, the same picture as on load.
  await press(page, back(page));
  expect(moved(start, await still(page))).toBeLessThan(.5);
  await expect(back(page)).toBeDisabled();
  await page.waitForTimeout(500);
  expect((await mapShot(page)).equals(home), '返回全景後的畫面與載入時相同').toBe(true);
});

test('候選頁（D.3-5b）：自動旋轉預設關閉、可用鍵盤開啟；拖曳、縮放、點名牌、清單、返回全景、分頁隱藏都會停止', async ({ page }) => {
  const start = await open(page);
  const turning = async () => { const a = await pins(page); await page.waitForTimeout(600); return moved(a, await pins(page)) > 2; };
  const on = async () => {
    if (phone()) await orbit(page).tap(); else { await orbit(page).focus(); await page.keyboard.press('Enter'); }
    await expect(orbit(page)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(turning).toBe(true);
  };
  const stopped = async () => { await expect(orbit(page)).toHaveAttribute('aria-pressed', 'false'); await still(page); expect(await turning()).toBe(false); };
  expect(await turning()).toBe(false);
  await on();
  await turnMap(page, 80);
  await stopped();
  await on();
  await zoomIn(page);
  await stopped();
  // Hidden tab.
  await on();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await stopped();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  // 返回全景 stops it and resets the view.
  await on();
  await press(page, back(page));
  await expect(orbit(page)).toHaveAttribute('aria-pressed', 'false');
  expect(moved(start, await still(page))).toBeLessThan(.5);
  // A label click while turning focuses that island (the flight takes over) and the toggle leaves (overview only).
  await on();
  await press(page, label(page, '演算法島'));
  await expect.poll(() => toolbarName(page)).toBe('演算法島');
  await expect(orbit(page)).toHaveCount(0);
  await press(page, back(page));
  await still(page);
  // List mode stops it.
  await on();
  await modes(page).getByRole('button', { name: '清單' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await modes(page).getByRole('button', { name: '3D 群島' }).click();
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 30_000 });
  await expect(orbit(page)).toHaveAttribute('aria-pressed', 'false');
});

test('候選頁（D.3-5b）：reduced motion 下自動旋轉仍預設關閉、聚焦立即到位，可手動開啟', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await expect(orbit(page)).toHaveAttribute('aria-pressed', 'false');
  await press(page, label(page, '資料結構島'));
  await expect.poll(() => toolbarName(page)).toBe('資料結構島');
  await press(page, back(page));
  const home = await still(page);
  await press(page, orbit(page));
  await expect(orbit(page)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => moved(home, await pins(page))).toBeGreaterThan(2);
});

test('候選頁（D.3-6d）：切換時間不動相機、不停自動旋轉；四個情境畫面不同，切回中午與載入時逐像素相同、不編譯 shader', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = WebGL2RenderingContext.prototype, link = proto.linkProgram;
    (window as unknown as { __links: number }).__links = 0;
    proto.linkProgram = function (program) { (window as unknown as { __links: number }).__links++; return link.call(this, program); };
  });
  const start = await open(page);
  const noon = await mapShot(page);
  const links = () => page.evaluate(() => (window as unknown as { __links: number }).__links);
  const programs = await links();
  const shots = new Set([noon.toString('base64')]);
  for (let round = 0; round < 2; round++) for (const id of ['morning', 'sunset', 'dusk', 'noon'] as EnvironmentId[]) {
    await select(page).selectOption(id);
    await page.waitForTimeout(600);
    expect(moved(start, await pins(page)), `${id}：相機不動`).toBeLessThan(.5);
    const shot = await mapShot(page);
    if (id === 'noon') expect(shot.equals(noon), `第 ${round + 1} 輪切回中午`).toBe(true);
    else shots.add(shot.toString('base64'));
  }
  expect(shots.size, '中午與另外三個情境各不相同').toBe(4);
  expect(await links(), '切換時編譯的 program').toBe(programs);
  // Auto Orbit keeps turning through a change of time.
  await press(page, orbit(page));
  await expect(orbit(page)).toHaveAttribute('aria-pressed', 'true');
  await select(page).selectOption('dusk');
  await expect(orbit(page)).toHaveAttribute('aria-pressed', 'true');
  const a = await pins(page);
  await page.waitForTimeout(600);
  expect(moved(a, await pins(page))).toBeGreaterThan(2);
});

test('候選頁（D.3-6d）：每個情境的 draw call 與三角形和中午相同；每次切換只畫一次陰影，之後閒置 0', async ({ page }) => {
  await page.addInitScript(instrument);
  await open(page);
  /** Waits until no frame has been drawn for 600 ms. */
  const quiet = async () => { let n = -1; await expect.poll(async () => { const now = (await frames(page)).length, same = now === n; n = now; return same; }, { intervals: [600], timeout: 15_000 }).toBe(true); };
  // P1-29: the first change after load may redraw the static shadow one extra time; settle it first.
  await select(page).selectOption('morning');
  await quiet();
  await select(page).selectOption('noon');
  await quiet();
  const per: Record<string, [number, number]> = {};
  for (const id of ['morning', 'sunset', 'dusk', 'noon'] as EnvironmentId[]) {
    const before = await frames(page);
    await select(page).selectOption(id);
    await quiet();
    const after = await frames(page), drawn = after.slice(before.length);
    const passes = drawn.filter((e, i) => e.offscreen > (i ? drawn[i - 1] : before.at(-1)!).offscreen).length;
    expect(passes, `${id} 陰影 pass`).toBe(1);
    const last = drawn.at(-1)!, prev = drawn.at(-2) ?? before.at(-1)!;
    per[id] = [last.main - prev.main, last.mainTriangles - prev.mainTriangles];
    await page.waitForTimeout(1500);
    expect((await frames(page)).length - after.length, `${id} 之後的閒置重畫`).toBe(0);
  }
  for (const id of ['morning', 'sunset', 'dusk'] as const) expect(per[id], id).toEqual(per.noon);
});

test('候選頁（D.3-6d）：黃昏與傍晚的地圖標題對比至少 4.5:1；手機上標題在地圖外', async ({ page }) => {
  await open(page);
  for (const id of ['sunset', 'dusk'] as const) {
    await select(page).selectOption(id);
    const caption = page.getByText('LOGIC ISLANDS ARCHIPELAGO').filter({ visible: true }).locator('..');
    await expect.poll(() => caption.evaluate(c => [c, ...c.children].reduce((n, e) => n + e.getAnimations().length, 0))).toBe(0);
    const ratios = await caption.evaluate(caption => {
      const rgba = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
      const luminance = ([r, g, b]: number[]) => [r, g, b].map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; })
        .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const over = (top: number[], under: number[]) => { const a = top[3] ?? 1; return [0, 1, 2].map(i => top[i] * a + under[i] * (1 - a)); };
      const ratio = (a: number[], b: number[]) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
      // Over the map the backing sits on anything (white or black); above the map, on the explorer's own panel.
      const outside = !caption.closest('[data-environment]');
      const unders = outside ? [rgba(getComputedStyle(caption).backgroundColor)] : [[255, 255, 255], [0, 0, 0]];
      const backing = rgba(getComputedStyle(caption).backgroundColor);
      return [...caption.querySelectorAll('span, strong')].flatMap(text => {
        const color = rgba(getComputedStyle(text).color);
        return unders.map(under => ratio(over(color, over(backing, under)), over(backing, under)));
      });
    });
    for (const ratio of ratios) expect(ratio, id).toBeGreaterThanOrEqual(4.5);
    const box = (await caption.boundingBox())!, map = (await page.locator('canvas').boundingBox())!;
    if (phone()) expect(box.y + box.height, `${id}：手機標題在地圖上方`).toBeLessThanOrEqual(map.y + .5);
  }
});

for (const width of [360, 390, 430]) {
  test(`候選頁（D.3-6d）：手機 ${width}px 四個情境不溢出；時間、自動旋轉、返回全景不互相擠壓；旋轉、縮放、聚焦後標題都不在地圖上`, async ({ page }) => {
    test.skip(!phone(), '手機寬度');
    await page.setViewportSize({ width, height: 800 });
    await open(page);
    for (const id of Object.keys(ENVIRONMENTS) as EnvironmentId[]) {
      await select(page).selectOption(id);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${id} 水平溢出`).toBeLessThanOrEqual(0);
    }
    const map = (await page.locator('canvas').boundingBox())!;
    const controls = await Promise.all([select(page), orbit(page), back(page)].map(async c => (await c.boundingBox())!));
    for (const [i, c] of controls.entries()) {
      expect(c.x, `控制 ${i} 不超出地圖寬度`).toBeGreaterThanOrEqual(map.x);
      expect(c.x + c.width).toBeLessThanOrEqual(map.x + map.width);
      for (const d of controls.slice(i + 1)) expect(c.x + c.width <= d.x || d.x + d.width <= c.x || c.y + c.height <= d.y || d.y + d.height <= c.y, '控制互不重疊').toBe(true);
    }
    // The caption sits above the map, whatever the camera does.
    const clear = async (when: string) => {
      await expect(captionAbove(page), when).toBeVisible();
      const box = (await captionAbove(page).boundingBox())!, now = (await page.locator('canvas').boundingBox())!;
      expect(box.y + box.height, when).toBeLessThanOrEqual(now.y + .5);
    };
    await clear('預設');
    await turnMap(page, 160);
    await still(page);
    await clear('旋轉後');
    await zoomIn(page);
    await still(page);
    await clear('縮放後');
    // Zoomed in, the label may be off the map; the island list starts the same camera flight.
    await chooseIsland(page, '資料結構島').tap();
    await expect.poll(() => toolbarName(page)).toBe('資料結構島');
    await page.locator('canvas').scrollIntoViewIfNeeded();
    await expect(captionAbove(page)).toContainText('資料結構島');
    await clear('聚焦後');
    // The caption over the map is not shown on phones at all.
    await expect(page.locator('[data-environment] > [class*="stageCaption"]').filter({ visible: true })).toHaveCount(0);
  });
}

test('候選頁（D.3-6d）：桌機標題留在地圖上，但島嶼名牌疊在它上面；旋轉、縮放、聚焦後名牌都可點', async ({ page }) => {
  test.skip(phone(), '桌機');
  await open(page);
  const caption = page.getByText('LOGIC ISLANDS ARCHIPELAGO').filter({ visible: true }).locator('..');
  await expect(caption).toHaveCount(1);
  // Move the caption over a label (test only) and ask what is on top there: the label, not the caption.
  /** null when the label is off the map (zoomed in, it can be). */
  const onTop = (name: string) => page.evaluate(([name]) => {
    const pin = document.querySelector(`button[aria-label="聚焦${name}"]`)!, cap = [...document.querySelectorAll('[data-environment] > div')][0] as HTMLElement;
    const r = pin.getBoundingClientRect(), stage = cap.parentElement!.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    if (x < stage.x || x > stage.right || y < stage.y || y > stage.bottom) return null;
    const saved = cap.getAttribute('style');
    cap.setAttribute('style', `left:${r.x - stage.x - 10}px;top:${r.y - stage.y - 10}px;pointer-events:auto`);
    const hit = document.elementFromPoint(x, y);
    if (saved === null) cap.removeAttribute('style'); else cap.setAttribute('style', saved);
    return pin.contains(hit);
  }, [name]);
  for (const name of ISLANDS) expect(await onTop(name), `預設：${name}`).toBe(true);
  await turnMap(page, 200);
  await still(page);
  for (const name of ISLANDS) expect(await onTop(name), `旋轉後：${name}`).toBe(true);
  const center = await middle(page);
  await page.mouse.move(center.x, center.y);
  await page.mouse.wheel(0, -40);
  await still(page);
  const zoomed = await Promise.all(ISLANDS.map(onTop));
  expect(zoomed.filter(v => v !== null).length, '縮放後仍在地圖內的名牌').toBeGreaterThan(0);
  for (const [i, v] of zoomed.entries()) if (v !== null) expect(v, `縮放後：${ISLANDS[i]}`).toBe(true);
  await back(page).click();
  await still(page);
  for (const name of ['演算法島', '資料結構島']) {
    await label(page, name).click();
    await expect.poll(() => toolbarName(page)).toBe(name);
    await back(page).click();
    await still(page);
  }
});

base('候選頁（D.3-6d）：WebGL 不可用或中途遺失時改為清單，不留下無效的 3D 控制', async ({ page }) => {
  await withoutWebGL(page);
  await page.goto(CANDIDATE);
  await expectListFallback(page);
  for (const control of [select(page), orbit(page), back(page)]) await expect(control).toHaveCount(0);
  const lost = await page.context().newPage();
  await lost.goto(CANDIDATE);
  await expect(label(lost, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 30_000 });
  await lost.getByRole('combobox', { name: '時間情境' }).selectOption('dusk');
  await loseWebGLContext(lost);
  await expectListFallback(lost);
  for (const control of [select(lost), orbit(lost), back(lost)]) await expect(control).toHaveCount(0);
});

/*
 * D.3-7a candidate mobile UI. The skip link: phone screenshots showed it over the map, but that came from Playwright's
 * full-page capture of a scrolled page (it lays the off-screen fixed link out at the capture's scroll offset); on screen
 * it stays hidden until focused. These check what a visitor sees, in the viewport.
 */
const skipLink = (page: Page) => page.getByRole('link', { name: '跳至主要內容' });
/** 'full' inside the viewport, 'out' entirely outside it, 'partial' otherwise. */
const skipShown = (page: Page) => skipLink(page).evaluate(a => {
  const r = a.getBoundingClientRect();
  if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return 'out';
  return r.top >= 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight ? 'full' : 'partial';
});
for (const width of [360, 390, 430, 1280]) {
  test(`候選頁（D.3-7a）：${width}px 跳至主要內容平時不顯示、不擋地圖；Tab 聚焦時完整可見，Enter 跳到主要內容`, async ({ page }) => {
    test.skip(phone() !== (width < 780), width < 780 ? '手機寬度' : '桌機寬度');
    await page.setViewportSize({ width, height: width < 780 ? 800 : 900 });
    await page.goto(CANDIDATE);
    await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 30_000 });
    await expect.poll(() => skipShown(page), { message: '載入後', timeout: 2_000 }).toBe('out');
    // Keyboard: the first Tab shows it whole with a focus ring; Enter goes to the main content and the link leaves.
    await page.keyboard.press('Tab');
    await expect(skipLink(page)).toBeFocused();
    await expect.poll(() => skipShown(page), { message: 'Tab 聚焦', timeout: 2_000 }).toBe('full');
    expect(await skipLink(page).evaluate(a => getComputedStyle(a).outlineStyle), '焦點外框').not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
    await expect(skipLink(page)).not.toBeFocused();
    await expect.poll(() => skipShown(page), { message: 'Enter 之後', timeout: 2_000 }).toBe('out');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.querySelector('main')!.contains(document.activeElement)), '下一個 Tab 在主要內容裡').toBe(true);
    // Scrolling and clicking the map (open sea, so no flight) never bring it back.
    await page.locator('canvas').scrollIntoViewIfNeeded();
    await expect.poll(() => skipShown(page), { message: '捲動後', timeout: 2_000 }).toBe('out');
    const map = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(map.x + 8, map.y + map.height - 8);
    await expect.poll(() => skipShown(page), { message: '點地圖後', timeout: 2_000 }).toBe('out');
    await page.evaluate(() => scrollBy(0, 300));
    await expect.poll(() => skipShown(page), { message: '再捲動後', timeout: 2_000 }).toBe('out');
  });
}

/** The hint and button row (over the map on wide screens, below it on phones). */
const dock = (page: Page) => page.locator('[class*="stageDock"]');
/** WCAG contrast of an element's text against the dock row's background. */
const dockContrast = (page: Page) => dock(page).evaluate(row => {
  const rgb = (c: string) => c.match(/[\d.]+/g)!.slice(0, 3).map(Number);
  const lum = (c: number[]) => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  const bg = lum(rgb(getComputedStyle(row).backgroundColor)), text = lum(rgb(getComputedStyle(row.querySelector('span')!).color));
  return (Math.max(bg, text) + .05) / (Math.min(bg, text) + .05);
});
for (const width of [360, 390, 430]) {
  test(`候選頁（D.3-7a）：手機 ${width}px 提示與按鈕在地圖下方一列，不蓋地圖；觸控目標 44px、高度與圓角一致、不截字；聚焦後與深色模式`, async ({ page }) => {
    test.skip(!phone(), '手機寬度');
    await page.setViewportSize({ width, height: 800 });
    await open(page);
    const check = async (when: string, controls: ReturnType<typeof select>[]) => {
      await dock(page).scrollIntoViewIfNeeded();
      const map = (await page.locator('canvas').boundingBox())!, stage = (await page.locator('[data-environment]').boundingBox())!;
      const row = (await dock(page).boundingBox())!;
      // The map keeps the whole stage (nothing inside it takes space) and the row starts where the map ends.
      expect(map.height, `${when}：地圖高度`).toBeCloseTo(stage.height, 0);
      expect(row.y, `${when}：按鈕列在地圖下方`).toBeGreaterThanOrEqual(map.y + map.height - .5);
      expect(row.x).toBeGreaterThanOrEqual(map.x - .5);
      expect(row.x + row.width).toBeLessThanOrEqual(map.x + map.width + .5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${when}：水平溢出`).toBeLessThanOrEqual(0);
      const boxes = await Promise.all(controls.map(async c => (await c.boundingBox())!));
      const looks = await Promise.all(controls.map(c => c.evaluate(e => ({ radius: getComputedStyle(e).borderRadius, cut: e.scrollWidth > e.clientWidth }))));
      for (const [i, b] of boxes.entries()) {
        expect(b.height, `${when}：控制 ${i} 高度`).toBeGreaterThanOrEqual(44);
        expect(b.width, `${when}：控制 ${i} 寬度`).toBeGreaterThanOrEqual(44);
        expect(b.height, `${when}：高度一致`).toBeCloseTo(boxes[0].height, 0);
        expect(looks[i].radius, `${when}：圓角一致`).toBe(looks[0].radius);
        expect(looks[i].cut, `${when}：控制 ${i} 文字未截斷`).toBe(false);
        expect(b.y, `${when}：控制 ${i} 在按鈕列內`).toBeGreaterThanOrEqual(row.y);
        expect(b.y + b.height).toBeLessThanOrEqual(row.y + row.height + .5);
        // Nothing covers it: its own centre hits it.
        expect(await controls[i].evaluate(e => { const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), `${when}：控制 ${i} 沒被遮住`).toBe(true);
      }
      const hint = dock(page).locator('span').first();
      expect(await hint.evaluate(e => e.scrollWidth <= e.clientWidth), `${when}：提示未截斷`).toBe(true);
      expect(await dockContrast(page), `${when}：提示對比`).toBeGreaterThanOrEqual(4.5);
    };
    await check('全景', [select(page), orbit(page), back(page)]);
    // Keyboard reaches the row in order, with a visible focus ring.
    await select(page).focus();
    await page.keyboard.press('Tab');
    await expect(orbit(page)).toBeFocused();
    expect(await orbit(page).evaluate(e => getComputedStyle(e).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Space');
    await expect(orbit(page)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Tab');
    await expect(back(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(orbit(page)).toHaveAttribute('aria-pressed', 'false');
    for (const id of ['sunset', 'dusk'] as const) { await select(page).selectOption(id); await check(id, [select(page), orbit(page), back(page)]); }
    await select(page).selectOption('noon');
    // Focused (Auto Orbit leaves the row): the row stays below the map, the place panel below the row.
    await chooseIsland(page, '基礎程式島').tap();
    await expect.poll(() => toolbarName(page)).toBe('基礎程式島');
    await page.locator('canvas').scrollIntoViewIfNeeded();
    await check('聚焦', [select(page), back(page)]);
    const panel = page.locator('[class*="hexPoiPanel"]');
    if (await panel.count()) expect((await panel.boundingBox())!.y).toBeGreaterThanOrEqual((await dock(page).boundingBox())!.y + (await dock(page).boundingBox())!.height - .5);
    await back(page).click();
    await still(page);
    // Dark theme: the row follows the page colours.
    await page.getByRole('button', { name: '切換深色模式' }).click();
    await check('深色', [select(page), orbit(page), back(page)]);
  });
}

test('候選頁（D.3-7a）：桌機 1280px 提示與按鈕仍在地圖下緣上方（不變）', async ({ page }) => {
  test.skip(phone(), '桌機');
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  const map = (await page.locator('canvas').boundingBox())!, row = (await dock(page).boundingBox())!;
  expect(row.y).toBeGreaterThan(map.y);
  expect(row.y + row.height).toBeLessThanOrEqual(map.y + map.height);
  expect(map.height).toBeGreaterThanOrEqual(600);
});
