import { test as base, expect, type Page } from '@playwright/test';
import { UNITS } from '../src/content/curriculum/units';
import { getLessonById } from '../src/content/curriculum';
import { chooseIsland, withoutWebGL } from './fallbacks';

/*
 * Phase F.2 (2026-11-02): 資料庫應用島 on the home map, the fifth island, next to the four that were there. Visible,
 * reachable by mouse, keyboard and touch, its subjects panel lists the six units and DB01–DB20 with the written lessons
 * (content) kept apart from this learner's progress, and the list fallback without WebGL names it too.
 */
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
const ISLANDS = ['基礎程式島', '資料結構島', '演算法島', '互動實驗島', '資料庫應用島'];
const label = (page: Page, name: string) => page.getByRole('button', { name: `聚焦${name}`, exact: true });
const panel = (page: Page) => page.getByRole('complementary', { name: '資料庫應用島科目清單' });
const lessons = UNITS.databases.flatMap(u => u.lessonIds.map(id => getLessonById(id)!));
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function load(page: Page) {
  await page.goto('/');
  await expect(label(page, '基礎程式島')).toHaveAttribute('data-model-source', 'glb', { timeout: 30_000 });
}
/** Every label inside the viewport and no two overlapping. */
async function expectLabelsClear(page: Page) {
  const boxes = await Promise.all(ISLANDS.map(async name => ({ name, box: (await label(page, name).boundingBox())! })));
  const view = page.viewportSize()!;
  for (const { name, box } of boxes) {
    expect(box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width && box.y + box.height <= view.height, `${name} 在畫面內`).toBe(true);
  }
  for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) {
    const overlap = a.box.x < b.box.x + b.box.width && b.box.x < a.box.x + a.box.width && a.box.y < b.box.y + b.box.height && b.box.y < a.box.y + a.box.height;
    expect(overlap, `${a.name}／${b.name}`).toBe(false);
  }
}

test('首頁五座島都看得到：名牌在畫面內、不互相重疊，畫布說明含資料庫應用島；清單有五座島', async ({ page }) => {
  await load(page);
  for (const name of ISLANDS) await expect(label(page, name)).toBeVisible();
  await expect(label(page, '資料庫應用島')).toHaveAttribute('data-model-source', 'geometry');
  await expectLabelsClear(page);
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /資料庫應用/);
  if (!phone()) {
    const list = page.getByRole('group', { name: '選擇學習島嶼' });
    await expect(list.getByRole('button')).toHaveCount(5);
    // The four keep their numbers; the new island is fifth.
    await expect(list.getByRole('button').nth(3)).toContainText('互動實驗島');
    await expect(list.getByRole('button').nth(4)).toContainText('05資料庫應用島20 堂課 · 6 個科目');
  }
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('點選資料庫應用島：6 個科目、DB01–DB20 連到各自的課；教材開放數與個人進度分開；完整課綱連到本島', async ({ page }) => {
  await load(page);
  if (phone()) await label(page, '資料庫應用島').tap(); else await label(page, '資料庫應用島').click();
  const subjects = panel(page);
  await expect(subjects).toBeVisible();
  await expect(subjects).toContainText('THE DATA VAULT');
  await expect(subjects.getByText('教材：已開放 20／20 堂')).toBeVisible();
  await expect(subjects.getByText('資料庫應用島：已完成 0／20 堂')).toBeVisible();
  const units = subjects.getByRole('list', { name: '資料庫應用島的科目' }).locator(':scope > li');
  await expect(units).toHaveCount(6);
  for (const [i, unit] of UNITS.databases.entries()) await expect(units.nth(i)).toContainText(unit.title);
  // Every lesson is in its unit (closed units still hold their links), pointing at its own page.
  const links = subjects.locator('a[href^="/curriculum/"]');
  await expect(links).toHaveCount(20);
  expect(await links.evaluateAll(as => as.map(a => a.getAttribute('href')))).toEqual(lessons.map(l => `/curriculum/${l.slug}`));
  await expect(subjects.getByRole('link', { name: '查看完整課綱' })).toHaveAttribute('href', '/curriculum#island-databases');
  // The island is focused: its own label gives way to the anchors, the others stay.
  await expect(label(page, '資料庫應用島')).toHaveCount(0);
  await expect(label(page, '資料結構島')).toBeVisible();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('鍵盤：名牌可以聚焦並以 Enter 選取資料庫應用島，返回全景後五座島都在', async ({ page }) => {
  await load(page);
  await label(page, '資料庫應用島').focus();
  await page.keyboard.press('Enter');
  await expect(panel(page)).toBeVisible();
  await page.getByRole('button', { name: '返回全景' }).click();
  for (const name of ISLANDS) await expect(label(page, name)).toBeVisible();
});

test('滑鼠 hover：資料庫應用島上顯示可點擊游標並點亮它的名牌', async ({ page }) => {
  test.skip(phone(), '觸控沒有 hover');
  await load(page);
  const canvas = (await page.locator('canvas').boundingBox())!;
  const lit = new Set<string>();
  for (let i = 0; i < 22; i++) for (let j = 0; j < 12; j++) {
    await page.mouse.move(canvas.x + canvas.width * (i + .5) / 22, canvas.y + canvas.height * (j + .5) / 12);
    const names = await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
      return [...document.querySelectorAll('button[data-hovered="true"]')].map(b => b.getAttribute('aria-label'));
    });
    names.forEach(name => lit.add(name!));
  }
  expect([...lit].sort()).toEqual(ISLANDS.map(name => `聚焦${name}`).sort());
});

test('學習進度沿用原本的資料：已完成的課顯示在面板上，教材開放數不受影響', async ({ page }) => {
  await page.addInitScript(() => {
    const at = '2026-11-02T10:00:00.000Z';
    localStorage.setItem('logic-island.progress', JSON.stringify({ version: 1, lessons: {
      DB01: { startedAt: at, readAt: at, quiz: { correct: 7, total: 7, at }, completedAt: at }, DB02: { startedAt: at } } }));
  });
  await load(page);
  await label(page, '資料庫應用島').click();
  await expect(panel(page).getByText('資料庫應用島：已完成 1／20 堂')).toBeVisible();
  await expect(panel(page).getByText('教材：已開放 20／20 堂')).toBeVisible();
  await expect(panel(page).locator(`a[href="/curriculum/${lessons[0].slug}"]`)).toContainText('已完成');
  await expect(panel(page).locator(`a[href="/curriculum/${lessons[1].slug}"]`)).toContainText('進行中');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('logic-island.progress')))!).lessons.DB01.completedAt).toBe('2026-11-02T10:00:00.000Z');
});

base('沒有 WebGL 時改為清單導航，清單裡有資料庫應用島與它的簡介', async ({ page }) => {
  await withoutWebGL(page);
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: '此裝置的 3D 場景無法使用' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('canvas')).toHaveCount(0);
  await chooseIsland(page, '資料庫應用島').click();
  await expect(page.getByRole('region', { name: '資料庫應用島教材入口' })).toContainText('從資料表與 SQL 查詢出發');
});

test('DB01–DB20 每一堂都能開啟', async ({ request }) => {
  for (const lesson of lessons) expect((await request.get(`/curriculum/${lesson.slug}`)).status(), lesson.lessonId).toBe(200);
});
