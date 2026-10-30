import { test as base, expect, type Page } from '@playwright/test';
import { chooseIsland, expectLessonsReachable, expectListFallback, loseWebGLContext, modes, withoutWebGL } from './fallbacks';

/**
 * D.3-3 preflight: /islands/candidate is /islands as it will be after the switch (the shared explorer, the production
 * world, preset and wording). These scenarios are written around what a visitor needs, not the old markup, and
 * become the /islands contract at the switch.
 */
const CANDIDATE = '/islands/candidate';
const GLB = '/models/islands/basics-island.v2.1.glb';
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
const explorer = (page: Page) => page.getByRole('region', { name: 'Logic Islands 邏輯群島地圖' });
const label = (page: Page, name: string) => page.getByRole('button', { name: `聚焦${name}`, exact: true });
const marker = (page: Page, node: string) => page.locator(`span[data-anchor="${node}"]`);
const poi = (page: Page, node: string) => page.getByRole('region', { name: '基礎程式島地點' }).locator(`button[data-target="${node}"]`);
const info = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });

async function load(page: Page, route = CANDIDATE) {
  await page.goto(route);
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 30_000 });
}
/** Waits until a marker stops following the camera, then returns its center. */
async function settled(page: Page, node: string) {
  await page.locator('canvas').scrollIntoViewIfNeeded();
  let box = await marker(page, node).boundingBox();
  await expect.poll(async () => {
    const next = await marker(page, node).boundingBox();
    const still = Boolean(box && next && Math.abs(box.x - next.x) < 0.5 && Math.abs(box.y - next.y) < 0.5);
    box = next;
    return still;
  }, { intervals: [100] }).toBe(true);
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}
/** The overview map caption (top left of the stage) covers no island label. */
async function expectCaptionClear(page: Page) {
  const caption = (await page.getByText('LOGIC ISLANDS ARCHIPELAGO').locator('..').boundingBox())!;
  for (const name of ['基礎程式島', '資料結構島', '演算法島']) {
    const pin = (await label(page, name).boundingBox())!;
    const overlap = pin.x < caption.x + caption.width && caption.x < pin.x + pin.width && pin.y < caption.y + caption.height && caption.y < pin.y + pin.height;
    expect(overlap, name).toBe(false);
  }
}
/** The canvas cursor and the lit island label once React has applied the hover state. */
const pointerState = (page: Page) => page.evaluate(async () => {
  await new Promise(resolve => requestAnimationFrame(resolve));
  const lit = [...document.querySelectorAll('button[data-hovered="true"]')];
  return {
    cursor: getComputedStyle(document.querySelector('canvas')!).cursor,
    lit: lit.map(button => button.getAttribute('aria-label')),
    border: lit.map(button => getComputedStyle(button).borderTopColor),
  };
});

test('正式文案：沒有 Prototype 字樣與測試控制項；保留 3D／清單切換、BFS 入口與島嶼／教材數量', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await load(page);
  await expect(page).toHaveTitle('Logic Islands · 邏輯群島 | Logic Island');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('邏輯群島Logic Islands');
  await expect(page.locator('main')).not.toContainText(/prototype|preview|tiles|hex world|六角|聚落|預覽|原型/i);
  // No scale links, no link back to the live map: nothing for testing is left on the page.
  await expect(page.getByRole('link', { name: /\d+ 格/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '回到正式群島地圖' })).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', 'Logic Islands 三座學習島嶼，亦可使用場景外的清單導航');
  await expect(modes(page).getByRole('button', { name: '3D 群島' })).toHaveAttribute('aria-pressed', 'true');
  await expect(modes(page).getByRole('button', { name: '清單' })).toBeVisible();
  await expect(page.getByRole('link', { name: '原有教材頁' })).toHaveAttribute('href', '/learn/bfs');
  // Counts kept, slogan (the site footer has it) and decorative compass dropped.
  await expect(explorer(page)).toContainText('3 座主題島嶼 / 5 份教材入口 / 一步步建立理解');
  await expect(explorer(page)).not.toContainText(/THINK|N\s*↑/);
  // Production preset: no measurement probe, and only this site's resources.
  expect(await page.locator('canvas').evaluate(canvas => '__hexPerf' in canvas)).toBe(false);
  expect(requests.filter(url => !url.startsWith(new URL(page.url()).origin))).toEqual([]);
  expect(requests.filter(url => /draco|gstatic|meshopt/i.test(url))).toEqual([]);
});

test('清單模式：不用 3D 也能選島與進入教材，切回 3D 後場景重新載入', async ({ page }) => {
  await load(page);
  await modes(page).getByRole('button', { name: '清單' }).click();
  await expect(modes(page).getByRole('button', { name: '清單' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('canvas')).toHaveCount(0);
  await expectLessonsReachable(page);
  await modes(page).getByRole('button', { name: '3D 群島' }).click();
  // The list left the basics island focused, so its large label is hidden; back to the overview to see it.
  await page.getByRole('button', { name: '返回全景' }).click();
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 30_000 });
});

base('WebGL 無法建立時由 Error Boundary 接住，自動改為清單導航', async ({ page }) => {
  const uncaught: string[] = [];
  page.on('pageerror', error => uncaught.push(error.message));
  await withoutWebGL(page);
  await page.goto(CANDIDATE);
  await expectListFallback(page);
  expect(uncaught, '錯誤要由 Error Boundary 接住，不能變成未捕捉錯誤').toEqual([]);
});

base('WebGL context 中途遺失時改為清單導航', async ({ page }) => {
  await load(page);
  await loseWebGLContext(page);
  await expectListFallback(page);
});

base('GLB 載入失敗時回到暫代建築，HTML 地點入口仍可使用', async ({ page }) => {
  await page.route(`**${GLB}`, glb => glb.fulfill({ status: 404, body: 'missing' }));
  await page.goto(CANDIDATE);
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'geometry', { timeout: 30_000 });
  await label(page, '基礎程式島').click();
  await expect(marker(page, 'Anchor_Workshop')).toHaveCount(0);
  await poi(page, 'Landmark_Lighthouse').click();
  await expect(info(page, '基礎程式島的地標')).toBeVisible();
  await poi(page, 'Building_Workshop').click();
  await expect(page).toHaveURL(/\/learn$/);
});

test('聚焦：地圖與工具列標示目前島嶼，地點清單與 3D 點擊都能進入教材，並可返回全景', async ({ page }) => {
  await load(page);
  await label(page, '基礎程式島').click();
  await expect(label(page, '基礎程式島')).toHaveCount(0);
  const stage = page.locator('[data-focused="true"]');
  await page.locator('canvas').scrollIntoViewIfNeeded();
  await expect(stage.getByText('基礎程式島', { exact: true })).toBeInViewport();
  await expect(stage.getByText('THE FIRST LIGHT', { exact: true })).toBeVisible();
  await expect(explorer(page).getByText('基礎程式島', { exact: true }).first()).toBeVisible();
  await poi(page, 'Landmark_Lighthouse').click();
  await expect(info(page, '基礎程式島的地標')).toBeVisible();
  await page.getByRole('button', { name: '關閉燈塔說明' }).click();
  const back = page.getByRole('button', { name: '返回全景' });
  await expect(back).toBeInViewport();
  await back.click();
  await expect(label(page, '基礎程式島')).toBeVisible();
  await label(page, '基礎程式島').click();
  // The workshop in 3D, just above its marker.
  const workshop = await settled(page, 'Anchor_Workshop');
  const canvas = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(workshop.x, workshop.y - .08 * canvas.height);
  await expect(page).toHaveURL(/\/learn$/);
});

test('滑鼠 hover：島上顯示可點擊游標並點亮該島名牌，海面沒有；聚焦後目標建築也顯示可點擊', async ({ page }) => {
  test.skip(phone(), '觸控沒有 hover');
  await load(page);
  await page.locator('canvas').scrollIntoViewIfNeeded();
  const canvas = (await page.locator('canvas').boundingBox())!;
  const lit = new Set<string>();
  let sea = 0;
  for (let i = 0; i < 16; i++) for (let j = 0; j < 10; j++) {
    await page.mouse.move(canvas.x + canvas.width * (i + .5) / 16, canvas.y + canvas.height * (j + .5) / 10);
    const state = await pointerState(page);
    // The pointer cursor and a lit label always come together, one island at a time.
    expect(state.lit.length).toBe(state.cursor === 'pointer' ? 1 : 0);
    state.lit.forEach(name => lit.add(name!));
    if (state.cursor !== 'pointer') sea++;
    if (state.lit[0] === '聚焦基礎程式島') expect(state.border[0]).toBe('rgb(66, 133, 244)');
  }
  expect([...lit].sort()).toEqual(['聚焦基礎程式島', '聚焦演算法島', '聚焦資料結構島']);
  expect(sea).toBeGreaterThan(0);
  // Focused: the workshop target is clickable, the open sea is not.
  await label(page, '基礎程式島').click();
  const workshop = await settled(page, 'Anchor_Workshop');
  await page.mouse.move(workshop.x, workshop.y - .08 * canvas.height);
  await expect.poll(async () => (await pointerState(page)).cursor).toBe('pointer');
  await page.mouse.move(canvas.x + 4, canvas.y + 4);
  await expect.poll(async () => (await pointerState(page)).cursor).not.toBe('pointer');
});

for (const width of [360, 390]) {
  test(`手機 ${width}px：工具列維持一行、島名不截字，地圖標題不遮住名牌`, async ({ page }) => {
    test.skip(!phone(), '手機寬度');
    await page.setViewportSize({ width, height: 800 });
    // The caption and the mode switch, measured from the explorer's first row.
    const toolbar = () => modes(page).evaluate(group => {
      const bar = group.closest('section')!.firstElementChild!, caption = bar.firstElementChild!, name = caption.querySelector('span')!;
      const c = caption.getBoundingClientRect(), g = group.getBoundingClientRect();
      return { oneRow: c.top < g.bottom && g.top < c.bottom, apart: c.right <= g.left, height: bar.getBoundingClientRect().height,
        clipped: name.scrollWidth > name.clientWidth, name: name.textContent };
    });
    await page.goto('/islands');
    await expect(modes(page)).toBeVisible();
    const live = await toolbar();
    await load(page);
    const overview = await toolbar();
    expect(overview).toMatchObject({ oneRow: true, apart: true, clipped: false, name: '群島全景' });
    expect(overview.height).toBeLessThanOrEqual(live.height);
    for (const name of ['基礎程式島', '資料結構島', '演算法島']) {
      await chooseIsland(page, name).click();
      expect(await toolbar(), name).toMatchObject({ oneRow: true, apart: true, clipped: false, name });
    }
    await page.getByRole('button', { name: '返回全景' }).click();
    await expect(label(page, '基礎程式島')).toBeVisible();
    await expectCaptionClear(page);
  });
}

test('桌機：地圖標題不遮住任何島嶼名牌（1440 與 1280 px 寬）', async ({ page }) => {
  test.skip(phone(), '手機見上方 360／390 px');
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    await load(page);
    await expectCaptionClear(page);
  }
});

for (const route of [CANDIDATE, '/islands/legacy']) {
  test(`${route}：Skip link 只在鍵盤聚焦時出現`, async ({ page }) => {
    const skip = page.getByRole('link', { name: '跳至主要內容' });
    // Polled: under reduced motion the global stylesheet gives every change a 0.01 ms transition, applied next frame.
    const onScreen = () => expect.poll(() => skip.evaluate(link => { const r = link.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }));
    await load(page, route);
    await onScreen().toBe(false);
    // Pointer and touch use never brings it in.
    await label(page, '基礎程式島').click();
    await onScreen().toBe(false);
    await page.locator('canvas').scrollIntoViewIfNeeded();
    await onScreen().toBe(false);
    // The first Tab from the top of the page focuses it and shows it; the next Tab hides it again.
    await page.goto(route);
    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    await onScreen().toBe(true);
    await page.keyboard.press('Tab');
    await expect(skip).not.toBeFocused();
    await onScreen().toBe(false);
  });
}

test('三條路由互不影響：/islands 維持現行版，legacy 就是它（不被索引），candidate 是新版且未被連結', async ({ page }) => {
  const snapshot = async (route: string) => {
    await load(page, route);
    const text = (selector: string) => page.locator(selector).first().evaluate(e => e.textContent!.replace(/\s+/g, ' ').trim());
    return {
      robots: await page.locator('meta[name="robots"]').evaluateAll(metas => metas[0]?.getAttribute('content') ?? null),
      title: await page.title(),
      heading: await text('main h1'),
      eyebrow: await text('main span:has-text("A WORLD OF UNDERSTANDING")'),
      canvas: await page.locator('canvas').getAttribute('aria-label'),
      slogan: await explorer(page).getByText(/THINK/).count(),
      links: await page.locator('a[href^="/islands/candidate"], a[href^="/islands/legacy"]').count(),
    };
  };
  const live = await snapshot('/islands'), legacy = await snapshot('/islands/legacy'), candidate = await snapshot(CANDIDATE);
  expect(live).toMatchObject({ robots: null, title: 'Logic Islands · 邏輯群島 | Logic Island', eyebrow: 'A WORLD OF UNDERSTANDING PROTOTYPE 02A', slogan: 1, links: 0,
    canvas: 'Logic Islands 三座學習島嶼，亦可使用場景外的清單導航' });
  expect(legacy).toEqual({ ...live, robots: 'noindex, nofollow', title: 'Logic Islands · 邏輯群島（舊版） | Logic Island' });
  expect(candidate).toMatchObject({ robots: 'noindex, nofollow', title: live.title, heading: live.heading, eyebrow: 'A WORLD OF UNDERSTANDING', slogan: 0, links: 0 });
  // The live map is still the isometric explorer: its compass is there, the candidate's place list is not.
  await page.goto('/islands');
  await expect(explorer(page).getByText(/N\s*↑/)).toHaveCount(1);
  await chooseIsland(page, '基礎程式島').click();
  await expect(page.getByRole('region', { name: '基礎程式島地點' })).toHaveCount(0);
  await page.goto('/');
  await expect(page.locator('a[href^="/islands/candidate"], a[href^="/islands/legacy"]')).toHaveCount(0);
});
