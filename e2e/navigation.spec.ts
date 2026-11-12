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
  // Multi-archipelago v2 (P4): the six algorithm labs, plus the tool labs that are open; planned ones are not links.
  await expect(page.locator('a.course-card:not([data-kind])')).toHaveCount(6);
  // P7: the Linux Terminal Simulator joins the color contrast lab as an open tool lab.
  await expect(page.locator('a.course-card[data-kind="tool"]').evaluateAll(as => as.map(a => a.getAttribute('href')))).resolves.toEqual(['/learn/color-contrast', '/learn/linux-terminal']);
  await expect(page.locator('.course-card[data-status="planned"]').first()).toBeVisible();
  await expect(page.locator('a.course-card[data-status="planned"]')).toHaveCount(0);
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
  // P4: the open tool labs are crawled too (/learn/color-contrast); P7 adds /learn/linux-terminal.
  const pages = ['/', '/learn', '/curriculum', ...courses.map(c => `/learn/${c.slug}`), '/learn/color-contrast', '/learn/linux-terminal', ...lessons.map(l => `/curriculum/${l.slug}`)];
  expect(pages).toHaveLength(3 + 8 + lessons.length);
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
  const tree = sidebar.getByRole('navigation', { name: '學習群島目錄' });
  await expect(tree.getByRole('button', { name: /資料結構島/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(tree.getByRole('button', { name: /基礎程式島/ })).toHaveAttribute('aria-expanded', 'false');
  // Multi-archipelago v2: the lesson's region opens with it; the other three regions stay closed.
  await expect(tree.getByRole('button', { name: /^程式與資訊群島/ })).toHaveAttribute('aria-expanded', 'true');
  for (const region of ['AI 人工智慧群島', '數位設計群島', '網頁與應用開發群島'])
    await expect(tree.getByRole('button', { name: new RegExp(`^${region}`) })).toHaveAttribute('aria-expanded', 'false');
  await expect(tree.locator('a[aria-current="page"]')).toHaveAttribute('href', `/curriculum/${D10.slug}`);
  // Never all 80 at once: only the open level's lessons are listed.
  expect(await tree.locator('a[href^="/curriculum/"]').count()).toBeLessThan(20);
  await expect(sidebar.getByRole('link', { name: '在 3D 世界中查看' })).toHaveAttribute('href', '/?island=structures');
  await expect(sidebar.getByText('島嶼 · 程式與資訊群島')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '麵包屑' })).toHaveText(/探索群島.*程式與資訊群島.*資料結構島.*D10/);
  if (info.project.name.startsWith('mobile')) {
    await page.keyboard.press('Escape');
    await expect(sidebar).toBeHidden();
    await expect(page.getByRole('button', { name: '選單' })).toBeFocused();
  }
  await page.goto('/?island=structures');
  await expect(page.getByRole('navigation', { name: '主選單' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('island')).toBe('structures');
});

// Multi-archipelago v2 (P2): every planned lesson is shown as 規劃中 and never linked, in the sidebar and on /curriculum.
test('規劃中的群島與課程看得到但不能點：側欄停用列與完整課綱的大綱都沒有連結', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('desktop'), 'Same data on both projects.');
  await page.goto('/curriculum');
  await expect(page.getByRole('navigation', { name: '五大群島' }).getByRole('link')).toHaveCount(5);
  const ai = page.locator('#region-ai');
  await expect(ai.getByRole('heading', { level: 2 })).toContainText('AI 人工智慧群島');
  await expect(ai.locator('article')).toHaveCount(7);
  await expect(ai.locator('details a')).toHaveCount(0);
  const tree = page.locator('#site-sidebar').getByRole('navigation', { name: '學習群島目錄' });
  await tree.getByRole('button', { name: /^AI 人工智慧群島/ }).click();
  await tree.getByRole('button', { name: /^生成式 AI 與大型語言模型/ }).click();
  await tree.getByRole('button', { name: /^大型語言模型島/ }).click();
  const rows = tree.locator('[aria-disabled="true"]');
  await expect(rows).toHaveCount(25);
  await expect(tree.locator('a[href*="prompt-engineering"]')).toHaveCount(0);
  expect((await page.request.get('/curriculum/prompt-engineering')).status()).toBe(404);
});

// Multi-archipelago v2 (P4): 色彩與無障礙實驗室 computes WCAG ratios as the learner types, and its fix passes.
test('色彩與無障礙實驗室：輸入顏色即時判定 AA／AAA，套用建議色後通過', async ({ page }) => {
  await page.goto('/learn/color-contrast');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('色彩與無障礙實驗室');
  const verdict = page.locator('[aria-live="polite"]');
  await expect(verdict).toContainText('對比率 2.67：1');
  await expect(verdict).toContainText('AA 未通過');
  const text = page.getByRole('textbox', { name: '文字顏色', exact: true });
  await text.fill('#767676');
  await expect(verdict).toContainText('對比率 4.54：1');
  await expect(verdict).toContainText('AA 通過');
  await text.fill('#9e9e9e');
  await page.getByRole('button', { name: /^套用 #/ }).first().click();
  await expect(verdict).toContainText('AA 通過');
  // Large text: 24px passes AA at 3:1.
  await text.fill('#949494');
  await page.getByRole('slider', { name: /^字級/ }).fill('24');
  await expect(verdict).toContainText('大型文字');
  await expect(verdict).toContainText('AA 通過');
  // The lessons that will use it are listed as planned, never linked.
  const lessons = page.getByRole('region', { name: '使用這個實驗的課程' });
  await expect(lessons.getByText('UI10')).toBeVisible();
  await expect(lessons.getByRole('link')).toHaveCount(0);
});

// P7: Linux Terminal Simulator. Commands run on a virtual file system in the page; a task completes from the result,
// permissions are enforced for the non-root learner, and a reset restores the starting machine.
test('Linux Terminal Simulator：指令改變虛擬檔案系統、任務依結果完成、權限有效、可重設', async ({ page }) => {
  await page.goto('/learn/linux-terminal');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Linux Terminal Simulator');
  const input = page.getByRole('textbox', { name: /^輸入指令/ });
  const screen = page.getByRole('log', { name: '終端機輸出' });
  const tasks = page.getByRole('region', { name: /完成 \d+／7/ });
  await expect(tasks.getByRole('heading', { level: 2 })).toContainText('完成 0／7');
  await input.fill('mkdir projects');
  await input.press('Enter');
  await input.fill('cd projects');
  await input.press('Enter');
  await expect(input).toHaveAccessibleName('輸入指令（目前位置 ~/projects）');
  await input.fill('echo "hello" > notes.txt');
  await input.press('Enter');
  await input.fill('cat notes.txt');
  await input.press('Enter');
  await expect(screen).toContainText('hello');
  await expect(tasks.getByRole('heading', { level: 2 })).toContainText('完成 2／7');
  await input.fill('cat /etc/shadow');
  await input.press('Enter');
  await expect(screen).toContainText('cat: /etc/shadow: Permission denied');
  await input.fill('ls | grep a');
  await input.press('Enter');
  await expect(screen).toContainText('不支援');
  // History: ↑ brings the last command back.
  await input.press('ArrowUp');
  await expect(input).toHaveValue('ls | grep a');
  await page.getByRole('button', { name: '重設環境' }).click();
  await expect(tasks.getByRole('heading', { level: 2 })).toContainText('完成 0／7');
  await expect(page.getByLabel('家目錄的檔案樹，含權限與目前位置')).not.toContainText('projects');
  // The lessons that will use it are listed as planned, never linked.
  const lessons = page.getByRole('region', { name: '使用這個實驗的課程' });
  await expect(lessons.getByText('LNX02')).toBeVisible();
  await expect(lessons.getByRole('link')).toHaveCount(0);
});
