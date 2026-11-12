import { expect, test } from '@playwright/test';
import { courses } from '../src/content/courses';
import { lessons } from '../src/content/curriculum/lessons';

/*
 * Phase E.5 (2026-11-02): Navigation & Learning Entry Consolidation. The header reads 探索群島／完整課綱／互動實驗島;
 * /visualize and /visualize/<slug> redirect permanently to /learn; every lab and every curriculum lesson still opens;
 * no internal link points at a page that is gone.
 */
const F01 = lessons.find(l => l.lessonId === 'F01')!;

test('/visualize 與 /visualize/<slug> 永久轉址到 /learn，保留 slug 與查詢參數', async ({ request }) => {
  for (const [from, to] of [['/visualize', '/learn'], ['/visualize/array', '/learn/array'], ['/visualize/bfs?ref=bookmark&x=1', '/learn/bfs?ref=bookmark&x=1']]) {
    const res = await request.get(from, { maxRedirects: 0 });
    expect(res.status(), from).toBe(308);
    expect(res.headers().location, from).toBe(to);
  }
  // Followed, the redirect lands on the lab itself.
  const lab = await request.get('/visualize/array');
  expect(lab.status()).toBe(200);
  expect(lab.url()).toMatch(/\/learn\/array$/);
});

test('主選單：探索群島／完整課綱／互動實驗島，目前頁面標示；開始學習開啟 F01', async ({ page }, info) => {
  for (const [path, active] of [['/', '探索群島'], ['/curriculum', '完整課綱'], [`/curriculum/${F01.slug}`, '完整課綱'], ['/learn', '互動實驗島'], ['/learn/stack', '互動實驗島']]) {
    await page.goto(path);
    const menu = page.getByRole('navigation', { name: '主選單' });
    // 2026-11-12: a build with the trial system (LOGIC_ISLAND_TRIALS=1) adds 模擬考試 to the header.
    await expect(menu.getByRole('link')).toHaveText(['探索群島', '完整課綱', '互動實驗島', ...process.env.LOGIC_ISLAND_TRIALS === '1' ? ['模擬考試'] : []]);
    await expect(menu.locator('a.active'), path).toHaveText(active);
  }
  const start = page.getByRole('banner').getByRole('link', { name: /開始學習/, includeHidden: true });
  await expect(start).toHaveAttribute('href', `/curriculum/${F01.slug}`);
  // Phones hide 開始學習 (an existing header rule), so only the desktop clicks it.
  if (info.project.name.startsWith('desktop')) await start.click(); else await page.goto(`/curriculum/${F01.slug}`);
  await expect(page).toHaveURL(`/curriculum/${F01.slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(F01.title);
});

test('互動實驗島列出六個實驗；實驗頁沒有模式切換，麵包屑回到互動實驗島', async ({ page }) => {
  await page.goto('/learn');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('互動實驗島');
  await expect(page).toHaveTitle(/^互動實驗島 \| Logic Island$/);
  await expect(page.locator('a.course-card')).toHaveCount(6);
  await page.goto('/learn/array');
  await expect(page.getByRole('link', { name: /專注互動實驗|閱讀完整教材/ })).toHaveCount(0);
  // Lab code tabs read C++, Java, Python, JavaScript (2026-11-02).
  await expect(page.getByRole('group', { name: '程式語言' }).getByRole('button')).toHaveText(['C++', 'Java', 'Python', 'JavaScript']);
  await page.locator('.breadcrumbs').getByRole('link', { name: '互動實驗島' }).click();
  await expect(page).toHaveURL('/learn');
});

test('完整課綱開頭的簡介：Think · Visualize · Code，從 F01 開始或先到互動實驗島', async ({ page }) => {
  await page.goto('/curriculum');
  const approach = page.getByRole('region', { name: /Think · Visualize · Code/ });
  await expect(approach.getByRole('listitem')).toHaveCount(3);
  await expect(page.locator('.hero, .hero-world')).toHaveCount(0);
  await approach.getByRole('link', { name: /先到互動實驗島/ }).click();
  await expect(page).toHaveURL('/learn');
  await page.goto('/curriculum');
  await page.getByRole('region', { name: /Think · Visualize · Code/ }).getByRole('link', { name: new RegExp(`從 F01`) }).click();
  await expect(page).toHaveURL(`/curriculum/${F01.slug}`);
});

test('404 頁指向完整課綱與互動實驗島', async ({ page }) => {
  const res = await page.goto('/no-such-page');
  expect(res?.status()).toBe(404);
  await expect(page.locator('main').getByRole('link', { name: /完整課綱/ })).toHaveAttribute('href', '/curriculum');
  await expect(page.locator('main').getByRole('link', { name: /互動實驗島/ })).toHaveAttribute('href', '/learn');
});

test('六個實驗與所有課綱頁（含資料庫應用島已開放的課）都能開啟，頁面內的站內連結沒有失效', async ({ page, request }, info) => {
  test.skip(!info.project.name.startsWith('desktop'), 'Same pages on both projects; one pass is enough.');
  test.setTimeout(240_000);
  const pages = ['/', '/learn', '/curriculum', ...courses.map(c => `/learn/${c.slug}`), ...lessons.map(l => `/curriculum/${l.slug}`)];
  expect(pages).toHaveLength(3 + 6 + lessons.length);
  const links = new Set<string>();
  for (const path of pages) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    for (const href of await page.locator('a[href^="/"]').evaluateAll(as => as.map(a => a.getAttribute('href')!)))
      links.add(href.split('#')[0]);
  }
  // No internal link may lead to /visualize (now only a redirect) or to a page that does not exist.
  expect([...links].filter(href => href.startsWith('/visualize'))).toEqual([]);
  const broken: string[] = [];
  for (const href of links) if (href && !pages.includes(href)) {
    const res = await request.get(href, { maxRedirects: 0 });
    if (res.status() !== 200) broken.push(`${href} → ${res.status()}`);
  }
  expect(broken).toEqual([]);
});

// 2026-11-12 unified sidebar: the tree opens the way to the current lesson, the island card leads back to its 3D island,
// and on phones the menu is a drawer that Escape closes.
test('側欄：目前課程所在的島與難度自動展開並標示，島嶼卡片回到 3D 島嶼；手機版是可用 Escape 關閉的抽屜', async ({ page }, info) => {
  const D10 = lessons.find(l => l.lessonId === 'D10')!;
  await page.goto(`/curriculum/${D10.slug}`);
  const sidebar = page.locator('#site-sidebar');
  if (info.project.name.startsWith('mobile')) {
    await expect(sidebar).toBeHidden();
    await page.getByRole('button', { name: '選單' }).click();
    await expect(sidebar).toBeVisible();
    await expect(page.getByRole('button', { name: '關閉導覽選單' })).toBeFocused();
  }
  const tree = sidebar.getByRole('navigation', { name: '課程學習目錄' });
  await expect(tree.getByRole('button', { name: /資料結構島/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(tree.getByRole('button', { name: /基礎程式島/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(tree.locator('a[aria-current="page"]')).toHaveAttribute('href', `/curriculum/${D10.slug}`);
  // Never all 80 at once: only the open level's lessons are listed.
  expect(await tree.locator('a[href^="/curriculum/"]').count()).toBeLessThan(20);
  await expect(sidebar.getByRole('link', { name: '返回 3D 島嶼' })).toHaveAttribute('href', '/?island=structures');
  await expect(page.getByRole('navigation', { name: '麵包屑' })).toHaveText(/探索群島.*資料結構島.*D10/);
  if (info.project.name.startsWith('mobile')) {
    await page.keyboard.press('Escape');
    await expect(sidebar).toBeHidden();
    await expect(page.getByRole('button', { name: '選單' })).toBeFocused();
  }
  await page.goto('/?island=structures');
  await expect(page.getByRole('navigation', { name: '主選單' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('island')).toBe('structures');
});
